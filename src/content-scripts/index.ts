/**
 * Content script entry point.
 *
 * Two responsibilities:
 *
 *   1. Auto-verify on page load. On DOMContentLoaded (the manifest registers
 *      this script as document_idle equivalent for content_scripts), find
 *      every <signed-section> on the page, verify each via
 *      @htmltrust/browser-client (Layer 1, SubtleCrypto-backed), evaluate the
 *      trust policy locally (Layer 2), and inject the corresponding status
 *      marker beside each section. No popup interaction required.
 *
 *   2. Keep the popup informed of the active page and expose per-section
 *      verification details through extension messages.
 *
 * Verification is local: the trust server is never contacted for the
 * crypto step. Trust directories are consulted only by the resolver chain
 * (third in line after did:web and direct URL resolvers).
 */
import {
  verifySignedSection,
  evaluateTrustPolicy,
  defaultResolverChain,
  isPrivateHost,
  type VerifyResult,
  type TrustEvaluation,
  type KeyResolver,
} from '@htmltrust/browser-client';
import { CSS_CLASSES, STORAGE_KEYS } from '../core/common/constants';
import {
  captureNavigationSnapshot,
  documentBaseUrl,
  mapSnapshotToLiveSections,
  mutationTouchesDocumentBase,
  observeDocumentBase,
  observeSignedSection,
  outermostSignedSection,
  SIGNED_SECTION_SELECTOR,
  sourceHTMLForSnapshot,
  type NavigationSnapshot,
} from '../core/content/navigation-lifecycle';
import { PlatformAdapter, MessageContext, ExtensionMessage } from '../platforms/common';
import {
  Settings,
  VerificationInputState,
  getTrustDirectorySubscriptions,
  validateTrustDirectorySubscription,
} from '../core/common/types';

// Import platform-specific adapter
// This will be replaced with the correct adapter at build time
import { ChromiumAdapter } from '../platforms/chromium';

// Initialize platform adapter
const platformAdapter: PlatformAdapter = new ChromiumAdapter();

/** Marker class on the auto-verify badge container, used to avoid duplicates. */
const AUTO_BADGE_MARKER = 'cs-auto-verification-badges';

/**
 * Per-section snapshot exposed to the popup via the GET_PAGE_VERIFICATIONS
 * message. The popup is the user-facing surface for badge details; the page
 * only carries quiet outline + corner-badge cues.
 */
type PageVerification = {
  index: number;
  /** True only when the currently rendered DOM is verified. */
  valid: boolean;
  /** True when the verifier found a valid cryptographic source input. */
  cryptoValid: boolean;
  inputState: VerificationInputState;
  sourceVerified: boolean;
  renderedVerified: boolean;
  reason: string | null;
  trustScore: number;
  trustIndicator: 'green' | 'yellow' | 'red';
  trustLabel: string;
  trustInputs: Array<{ source: string; contribution: number; rationale: string }>;
  keyid: string;
  algorithm: string;
  signedAt: string;
  domain: string;
  claims: Record<string, string>;
};

type SectionVerificationRun = {
  verify: VerifyResult;
  inputState: VerificationInputState;
  sourceVerified: boolean;
  renderedVerified: boolean;
  displayValid: boolean;
  reason: string | null;
};

/** Module-scoped cache of this page's verification results. */
const pageVerifications: PageVerification[] = [];
const pageVerificationBySection = new WeakMap<Element, PageVerification>();
const sectionObserverDisposers = new WeakMap<Element, () => void>();
const sectionMarkers = new WeakMap<Element, HTMLElement>();
let navigationSnapshot: NavigationSnapshot | null = null;
let observedSections = new Set<Element>();
let rerenderObserver: MutationObserver | null = null;
let navigationRun = 0;
let rerenderTimer: ReturnType<typeof setTimeout> | null = null;
let navigationPollTimer: ReturnType<typeof setInterval> | null = null;
let lastObservedUrl = '';
let lifecycleInstalled = false;
let baseObserverDisposer: (() => void) | null = null;
const sectionReverifyGeneration = new WeakMap<Element, number>();

function directoryUrls(settings: Settings): string[] {
  return getTrustDirectorySubscriptions(settings)
    .filter((subscription) => subscription.enabled && !validateTrustDirectorySubscription(subscription))
    .map((subscription) => subscription.url);
}

/**
 * Initialize the content script.
 *
 * Three things happen here, in this order:
 *   1. Read settings from storage (resolver chain needs the directory list,
 *      policy evaluator needs personal trust list / trusted domains).
 *   2. Auto-verify every signed-section on the page.
 *   3. Notify the background script for the popup status cache, then register
 *      the content-script message handlers.
 *
 * Errors in any single signed-section don't abort the page; each section is
 * verified independently, and a failure to load settings falls back to an
 * empty resolver chain (still verifies any did:web or direct-URL keyids).
 */
/**
 * Module-scoped runtime state. Kept here so the storage change listener can
 * re-run autoVerifyPage with up-to-date settings without re-initializing.
 */
let currentSettings: Settings | null = null;
let currentResolverChain: KeyResolver[] = [];
// Settings changes invalidate every in-flight auto-verification. A run may
// await source fetch, key resolution, or directory policy requests, so the
// generation is checked again before it can mutate markers or cached results.
let autoVerifyGeneration = 0;

/** Invalidate in-flight runs when policy inputs change. */
export function invalidateAutoVerifyGeneration(): void {
  autoVerifyGeneration += 1;
  pageVerifications.length = 0;
}

async function initialize() {
  try {
    // 1. Settings → resolver chain + trust policy inputs
    currentSettings = await loadSettings();
    const directories = directoryUrls(currentSettings);
    currentResolverChain = defaultResolverChain({
      directories,
      fetch: createVerifierFetch(),
    });
    installNavigationLifecycle();

    // 2. Auto-verify on page load. Idempotent: re-running is a no-op for
    //    sections that already have an auto badge container next to them.
    await autoVerifyPage(currentResolverChain, currentSettings, navigationRun);

    // 3. Keep the popup's page-status cache current. This is best-effort and
    //    independent of the per-section result above.
    await notifyContentDetected();

    // Listen for messages from the background script
    listenForMessages();

    // Live-update on settings change. When the popup or options page writes
    // a new SETTINGS value to chrome.storage, we clear our existing
    // decorations and rerun verification against the frozen source snapshot,
    // so the user sees the effect of toggling on-page badges without
    // having to reload the page (or the whole extension).
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STORAGE_KEYS.SETTINGS]) return;
        const next = changes[STORAGE_KEYS.SETTINGS].newValue as Settings | undefined;
        if (!next) return;
        currentSettings = next;
        currentResolverChain = defaultResolverChain({
          directories: directoryUrls(next),
          fetch: createVerifierFetch(),
        });
        invalidateAutoVerifyGeneration();
        // Settings may change the trust policy or its directory set. Clear
        // old markers and rerun against the frozen navigation source so a
        // stale page snapshot never displays a result for the previous policy.
        document.querySelectorAll(SIGNED_SECTION_SELECTOR).forEach((section) => {
          clearSectionStatusUI(section);
        });
        void autoVerifyPage(currentResolverChain, next, navigationRun, autoVerifyGeneration)
          .then(notifyContentDetected);
      });
    }
  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
}

/** Reset cached state before a same-document navigation or page rerender. */
export function resetNavigationState(): void {
  navigationRun += 1;
  invalidateAutoVerifyGeneration();
  if (rerenderTimer !== null) {
    clearTimeout(rerenderTimer);
    rerenderTimer = null;
  }
  observedSections.forEach((section) => {
    sectionReverifyGeneration.set(section, (sectionReverifyGeneration.get(section) ?? 0) + 1);
    sectionObserverDisposers.get(section)?.();
    clearSectionStatusUI(section);
  });
  observedSections = new Set<Element>();
  navigationSnapshot = null;
}

function scheduleNavigationRefresh(): void {
  if (rerenderTimer !== null) return;
  resetNavigationState();
  lastObservedUrl = window.location.href;
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    if (!currentSettings) return;
    void autoVerifyPage(currentResolverChain, currentSettings, navigationRun)
      .then(notifyContentDetected);
  }, 0);
}

/** Watch history events and replacement of signed sections by SPA renderers. */
function installNavigationLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  lastObservedUrl = window.location.href;
  const notify = () => scheduleNavigationRefresh();
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }
  rerenderObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutationTouchesDocumentBase)) {
      notify();
      return;
    }
    const current = new Set(document.querySelectorAll(SIGNED_SECTION_SELECTOR));
    if (current.size !== observedSections.size || [...current].some((section) => !observedSections.has(section))) {
      notify();
    }
  });
  if (document.documentElement) {
    rerenderObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  baseObserverDisposer = observeDocumentBase(document, notify);
  // Extension content scripts run in an isolated JavaScript world in Chromium.
  // A page-world pushState call may bypass the wrapper above, so compare the
  // shared location on a short interval as a cross-browser fallback.
  navigationPollTimer = setInterval(() => {
    if (window.location.href !== lastObservedUrl) notify();
  }, 500);
  window.addEventListener('pagehide', () => {
    if (navigationPollTimer !== null) {
      clearInterval(navigationPollTimer);
      navigationPollTimer = null;
    }
    rerenderObserver?.disconnect();
    baseObserverDisposer?.();
    baseObserverDisposer = null;
    observedSections.forEach((section) => sectionObserverDisposers.get(section)?.());
  }, { once: true });
}

/**
 * Load settings from extension storage. On any error, returns a minimal
 * default that's safe for the resolver chain (no directories) and the
 * policy evaluator (empty trust lists). The user can fix this in the
 * options page and the next page load picks up the change.
 */
async function loadSettings(): Promise<Settings> {
  try {
    const storage = platformAdapter.getStorage();
    const stored = await storage.get<Settings>(STORAGE_KEYS.SETTINGS);
    if (stored) return stored;
  } catch (err) {
    console.warn('Content Signing: failed to load settings; using defaults', err);
  }
  // Minimal Settings-shaped default. We can't import DEFAULT_SETTINGS here
  // because it pulls in the constants module which may grow other deps;
  // the fields below are the only ones this script reads.
  return {
    autoVerify: true,
    showBadges: true,
    highlightVerified: true,
    highlightUnverified: false,
    trustDirectoryUrls: [],
    trustDirectorySubscriptions: [],
    personalTrustList: [],
    trustedDomains: [],
    authMethod: 'apikey',
    serverConfigs: [],
    developerDebugLogging: false,
  };
}

function currentOrigin(): string {
  return window.location.origin;
}

function sourceFailureReason(error: string | null): VerifyResult['reason'] {
  return error?.startsWith('network-policy-blocked')
    ? 'network-policy-blocked'
    : 'source-refetch-failed';
}

function redactForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 80) return `${value.slice(0, 24)}...[redacted:${value.length}]`;
    if (/signature|BEGIN PUBLIC KEY|PRIVATE KEY|sha256:/i.test(value)) return '[redacted]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        /content|signature|key|hash|html|pem/i.test(key) ? '[redacted]' : redactForLog(val),
      ]),
    );
  }
  return value;
}

function debugLog(settings: Settings, message: string, details?: unknown): void {
  if (!settings.developerDebugLogging) return;
  // This is explicitly opt-in diagnostic output. Keep it at the browser's
  // debug level so routine verification does not create warning noise.
  if (details === undefined) {
    // eslint-disable-next-line no-console
    console.debug(`[htmltrust] ${message}`);
  } else {
    // eslint-disable-next-line no-console
    console.debug(`[htmltrust] ${message}`, redactForLog(details));
  }
}

function createVerifierFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const inputUrl = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    const url = new URL(inputUrl);
    if (url.protocol !== 'https:') {
      throw new Error('network-policy-blocked: verifier key and directory fetches require HTTPS');
    }
    if (url.username || url.password || isPrivateHost(url.hostname)) {
      throw new Error('network-policy-blocked: verifier fetches may not target private or credential-bearing URLs');
    }
    return fetch(input, {
      ...init,
      credentials: 'omit',
      referrer: '',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
  };
}

async function fetchPristineSignedSections(settings: Settings): Promise<{
  snapshot: NavigationSnapshot | null;
  error: string | null;
}> {
  const pageUrl = new URL(window.location.href);
  if (pageUrl.protocol !== 'https:') {
    return {
      snapshot: null,
      error: 'network-policy-blocked: source refetch requires HTTPS',
    };
  }

  try {
    const pageResp = await fetch(window.location.href, {
      cache: 'force-cache',
      credentials: 'same-origin',
      referrer: '',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
    if (!pageResp.ok) {
      return { snapshot: null, error: `source-refetch-failed: HTTP ${pageResp.status}` };
    }
    if (new URL(pageResp.url).origin !== currentOrigin()) {
      return { snapshot: null, error: 'network-policy-blocked: source refetch changed origin' };
    }
    const pageHTML = await pageResp.text();
    return {
      snapshot: captureNavigationSnapshot(pageHTML, pageResp.url || window.location.href),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debugLog(settings, 'source refetch failed', { reason: message });
    return { snapshot: null, error: `source-refetch-failed: ${message}` };
  }
}

async function verifySectionWithState(
  section: Element,
  sourceHTML: string | null,
  sourceDocumentUrl: string | null,
  sourceBaseUrl: string | null,
  resolverChain: KeyResolver[],
  settings: Settings,
  sourceFailure?: VerifyResult['reason'] | null,
): Promise<SectionVerificationRun> {
  const origin = currentOrigin();
  const options = {
    keyResolvers: resolverChain,
    domain: origin,
    origin,
    documentUrl: sourceDocumentUrl ?? window.location.href,
    baseUrl: window.location.href,
    debug: settings.developerDebugLogging === true,
  };

  if (!sourceHTML) {
    // A live DOM is not an accepted Layer-1 source. Page script can construct
    // or rewrite it after navigation, so treating it as verified would make a
    // valid indicator attacker-controlled.
    const verify: VerifyResult = {
      valid: false,
      keyid: section.getAttribute('keyid') ?? '',
      algorithm: section.getAttribute('algorithm') ?? '',
      contentHash: section.getAttribute('content-hash') ?? '',
      claimsHash: '',
      claims: {},
      signedAt: '',
      domain: origin,
      origin,
      inputState: 'source-only',
      reason: sourceFailure ?? 'source-refetch-failed',
    };
    return {
      verify,
      inputState: 'source-only',
      sourceVerified: false,
      renderedVerified: false,
      displayValid: false,
      reason: verify.reason ?? 'source-refetch-failed',
    };
  }

  const sourceVerify = await verifySignedSection(sourceHTML, {
    ...options,
    baseUrl: sourceBaseUrl ?? options.baseUrl,
    renderedBaseUrl: documentBaseUrl(document, window.location.href),
    renderedSection: section,
  } as Parameters<typeof verifySignedSection>[1]);
  const inputState = sourceVerify.inputState as VerificationInputState;
  if (!sourceVerify.valid) {
    return {
      verify: sourceVerify,
      inputState,
      sourceVerified: false,
      renderedVerified: false,
      displayValid: false,
      reason: sourceVerify.reason ?? 'source verification failed',
    };
  }

  return {
    verify: sourceVerify,
    inputState,
    sourceVerified: true,
    renderedVerified: inputState === 'rendered-match',
    displayValid: inputState === 'rendered-match',
    reason:
      inputState === 'rendered-match'
        ? null
        : inputState === 'stale'
        ? 'rendered DOM diverged from verified source'
        : 'rendered DOM not compared',
  };
}

/**
 * Walk every <signed-section> on the page and verify it locally.
 *
 * Each section is verified independently. A failure on one does not skip
 * the others. Markers are inserted after the outermost signed section,
 * keeping extension-owned nodes out of signed content even when sections nest.
 *
 * Idempotent: if a section already has an auto-marker sibling, it's skipped.
 * This protects against re-runs (e.g. the script being injected twice on a
 * page that does its own DOM manipulation).
 */
export async function autoVerifyPage(
  resolverChain: KeyResolver[],
  settings: Settings,
  expectedNavigationRun = navigationRun,
  expectedAutoVerifyGeneration = autoVerifyGeneration,
): Promise<void> {
  // `autoVerify` gates the entire content-script verification path. When off,
  // the page is left untouched and the popup's "Verifying…" state stays put
  // until the user explicitly triggers verification.
  if (
    !settings.autoVerify ||
    expectedNavigationRun !== navigationRun ||
    expectedAutoVerifyGeneration !== autoVerifyGeneration
  ) {
    return;
  }

  const sections = document.querySelectorAll(SIGNED_SECTION_SELECTOR);
  if (sections.length === 0) {
    // Graceful no-op: pages without signed-sections are common and not an error.
    return;
  }

  const personalTrustList = settings.personalTrustList ?? [];
  const trustedDomains = settings.trustedDomains ?? [];

  pageVerifications.length = 0;

  // Fetch the original served HTML so we can verify against the pristine
  // signed-section content rather than the live DOM. This sidesteps the
  // runtime-DOM-mutation problem: any client-side script that adds, removes,
  // or rewrites nodes inside a <signed-section> after page load (theme
  // copy-button injection, syntax highlighters, lazy-loaders, share widgets)
  // would otherwise make element.innerHTML disagree with what the signer
  // hashed. Documented as "Known Issue: Runtime DOM Mutation" in the spec
  // README.
  //
  // The DOM section is used for UI placement only. The bytes fed to
  // verifySignedSection come from the pristine fetch.
  //
  // The parser-backed mapper pairs source sections by their signed identity,
  // so a page that re-orders sections cannot swap one source signature for
  // another.
  //
  // Fetch is cache-friendly: 'force-cache' lets the browser HTTP cache
  // serve this near-instantaneously on the typical reload-after-load path.
  // On the first load it's a duplicate of the navigation, which the HTTP
  // cache catches per RFC 7234 when the origin sets reasonable cache headers.
  const { snapshot: fetchedSnapshot, error: pristineFetchError } =
    await fetchPristineSignedSections(settings);
  if (
    expectedNavigationRun !== navigationRun ||
    expectedAutoVerifyGeneration !== autoVerifyGeneration
  ) return;
  navigationSnapshot = fetchedSnapshot;
  const liveSections = Array.from(sections);
  observedSections = new Set(liveSections);
  const mapped = fetchedSnapshot
    ? mapSnapshotToLiveSections(fetchedSnapshot, liveSections)
    : { matches: [], complete: false };

  // A missing or ambiguous source is a hard failure. Verifying the live DOM
  // here would allow page script to manufacture a valid result with no
  // accepted source representation.
  if (pristineFetchError || !mapped.complete) {
    debugLog(settings, 'source snapshot unavailable; refusing rendered-DOM verification', {
      reason: pristineFetchError,
      sourceSections: fetchedSnapshot?.sections.length ?? 0,
      renderedSections: sections.length,
    });
    navigationSnapshot = null;
  }

  let i = 0;
  for (const section of liveSections) {
    if (
      expectedNavigationRun !== navigationRun ||
      expectedAutoVerifyGeneration !== autoVerifyGeneration
    ) return;
    // Idempotency: skip sections we've already decorated.
    const knownMarker = sectionMarkers.get(section);
    if (knownMarker && !knownMarker.isConnected) sectionMarkers.delete(section);
    if ((knownMarker?.isConnected ?? false) || section.nextElementSibling?.classList.contains(AUTO_BADGE_MARKER)) {
      continue;
    }

    try {
      const match = mapped.matches.find((candidate) => candidate.live === section);
      const run = await verifySectionWithState(
        section,
        mapped.complete ? (match ? sourceHTMLForSnapshot(match.source) : null) : null,
        fetchedSnapshot?.url ?? null,
        fetchedSnapshot?.baseUrl ?? null,
        resolverChain,
        settings,
        pristineFetchError || !mapped.complete ? sourceFailureReason(pristineFetchError) : null,
      );
      const verify = run.verify;

      const trust = await evaluateTrustPolicy(verify, {
        personalTrustList,
        trustedDomains,
        directorySubscriptions: getTrustDirectorySubscriptions(settings),
        fetch: createVerifierFetch(),
      });

      if (
        expectedNavigationRun !== navigationRun ||
        expectedAutoVerifyGeneration !== autoVerifyGeneration
      ) return;

      applySectionStatusUI(section, run, trust, null, settings);
      const pageVerification: PageVerification = {
        index: i,
        valid: run.displayValid,
        cryptoValid: verify.valid,
        inputState: run.inputState,
        sourceVerified: run.sourceVerified,
        renderedVerified: run.renderedVerified,
        reason: run.reason,
        trustScore: trust.score,
          trustIndicator: trust.indicator,
          trustLabel: trust.indicator === 'green' ? 'Trusted' : trust.indicator === 'red' ? 'Untrusted' : 'Unknown',
        trustInputs: trust.inputs,
        keyid: verify.keyid,
        algorithm: verify.algorithm,
        signedAt: verify.signedAt,
        domain: verify.domain,
        claims: verify.claims ?? {},
      };
      pageVerifications.push(pageVerification);
      pageVerificationBySection.set(section, pageVerification);
      armSectionMutationInvalidation(
        section,
        mapped.complete ? (match ? sourceHTMLForSnapshot(match.source) : null) : null,
        fetchedSnapshot?.url ?? null,
        fetchedSnapshot?.baseUrl ?? null,
        resolverChain,
        settings,
      );
    } catch (err) {
      if (
        expectedNavigationRun !== navigationRun ||
        expectedAutoVerifyGeneration !== autoVerifyGeneration
      ) return;
      const reason = (err as Error).message ?? 'verification error';
      console.error('Content Signing: verification failed for a signed-section');
      debugLog(settings, 'signed-section verification exception', { reason });
      applySectionStatusUI(section, null, null, reason, settings);
      const pageVerification: PageVerification = {
        index: i,
        valid: false,
        cryptoValid: false,
        inputState: 'source-only',
        sourceVerified: false,
        renderedVerified: false,
        reason,
        trustScore: 0,
        trustIndicator: 'red',
        trustLabel: 'Untrusted',
        trustInputs: [],
        keyid: '',
        algorithm: '',
        signedAt: '',
        domain: currentOrigin(),
        claims: {},
      };
      pageVerifications.push(pageVerification);
      pageVerificationBySection.set(section, pageVerification);
      armSectionMutationInvalidation(section, null, null, null, resolverChain, settings);
    }
    i++;
  }
}

/**
 * Apply quiet, per-section visual cues beside the signed-section.
 *
 * The indicator is always a sibling. It never becomes a child of the signed
 * element, so extension-owned nodes cannot enter the signed verification
 * input. The same rule applies to the legacy popup path below.
 *
 * Three settings gate what gets drawn:
 *   - showBadges:         master switch. Off = no decoration at all.
 *   - highlightVerified:  outline a valid signed-section in green.
 *   - highlightUnverified: outline an invalid signed-section in red.
 *
 * The user-facing detailed pills (Signature valid / Trust %) live in the
 * popup, not on the page.
 */
export function applySectionStatusUI(
  section: Element,
  run: SectionVerificationRun | null,
  trust: TrustEvaluation | null,
  errorReason: string | null,
  settings: Settings,
): void {
  // Master kill switch.
  clearSectionStatusUI(section);
  if (!settings.showBadges) return;

  const verify = run?.verify ?? null;
  const valid = run?.displayValid === true;
  const stale = run?.inputState === 'stale';
  const outlineClass =
    valid && settings.highlightVerified
      ? CSS_CLASSES.VERIFIED_CONTENT
      : stale && settings.highlightVerified
      ? CSS_CLASSES.UNKNOWN_CONTENT
      : !valid && settings.highlightUnverified
      ? CSS_CLASSES.UNVERIFIED_CONTENT
      : null;

  // Tooltip carries a short warning only. The extension popup is the
  // authoritative, less-spoofable surface for details.
  const reason = errorReason ?? run?.reason ?? verify?.reason ?? null;
  const trustPart = trust ? ` · Trust: ${trust.score}% (${trust.indicator})` : '';
  const statePart =
    run?.inputState === 'stale'
      ? 'Source signature valid; rendered DOM differs'
      : run?.inputState === 'source-only' && verify?.valid
      ? 'Source signature valid; rendered DOM not compared'
      : valid
      ? 'Rendered content verified'
      : 'Signature invalid';
  const tooltip = `HTMLTrust page marker only; open the extension popup for authoritative details. ${statePart}${trustPart}${
    reason ? ` (${reason})` : ''
  }`;
  const badges = document.createElement('div');
  badges.className = `${CSS_CLASSES.VERIFICATION_BADGES} ${AUTO_BADGE_MARKER}`;
  if (outlineClass) badges.classList.add(CSS_CLASSES.CONTENT_OUTLINE, outlineClass);
  badges.setAttribute('role', 'status');
  badges.setAttribute('aria-label', tooltip);
  const sig = document.createElement('span');
  sig.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VALIDITY_BADGE} ${
    valid
      ? CSS_CLASSES.VERIFICATION_BADGE_VERIFIED
      : stale || verify?.valid
      ? CSS_CLASSES.VERIFICATION_BADGE_WARNING
      : CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED
  }`;
  sig.textContent = valid ? '✓' : stale || verify?.valid ? '!' : '✗';
  sig.title = tooltip;
  badges.appendChild(sig);
  const anchor = outermostSignedSection(section);
  anchor.parentNode?.insertBefore(badges, anchor.nextSibling);
  sectionMarkers.set(section, badges);
}

/** Remove only extension-owned sibling UI, leaving signed content untouched. */
function clearSectionStatusUI(section: Element): void {
  const marker = sectionMarkers.get(section);
  if (marker) {
    marker.remove();
    sectionMarkers.delete(section);
    return;
  }
  // Legacy markers created before this module's nested-section anchor was
  // introduced may still be direct siblings. Remove only our own marker.
  let sibling = section.nextElementSibling;
  while (sibling?.classList.contains(AUTO_BADGE_MARKER)) {
    const next = sibling.nextElementSibling;
    sibling.remove();
    sibling = next;
  }
}

/** Re-verify a section after live content changes, against its frozen source. */
export function armSectionMutationInvalidation(
  section: Element,
  sourceHTML: string | null,
  sourceDocumentUrl: string | null,
  sourceBaseUrl: string | null,
  resolverChain: KeyResolver[],
  settings: Settings,
): void {
  sectionObserverDisposers.get(section)?.();
  const observerNavigationRun = navigationRun;
  const observerAutoVerifyGeneration = autoVerifyGeneration;
  const dispose = observeSignedSection(section, (changedSection) => {
    const generation = (sectionReverifyGeneration.get(changedSection) ?? 0) + 1;
    sectionReverifyGeneration.set(changedSection, generation);
    clearSectionStatusUI(changedSection);
    const activeSettings = currentSettings ?? settings;
    applySectionStatusUI(
      changedSection,
      null,
      null,
      'signed content changed; re-verifying',
      activeSettings,
    );

    void (async () => {
      try {
        const run = await verifySectionWithState(
          changedSection,
          sourceHTML,
          sourceDocumentUrl,
          sourceBaseUrl,
          currentResolverChain.length ? currentResolverChain : resolverChain,
          activeSettings,
        );
        const trust = await evaluateTrustPolicy(run.verify, {
          personalTrustList: activeSettings.personalTrustList ?? [],
          trustedDomains: activeSettings.trustedDomains ?? [],
          directorySubscriptions: getTrustDirectorySubscriptions(activeSettings),
          fetch: createVerifierFetch(),
        });
        if (
          sectionReverifyGeneration.get(changedSection) !== generation ||
          navigationRun !== observerNavigationRun ||
          autoVerifyGeneration !== observerAutoVerifyGeneration
        ) return;
        applySectionStatusUI(changedSection, run, trust, null, activeSettings);
        const existing = pageVerificationBySection.get(changedSection);
        if (!existing) return;
        const updated: PageVerification = {
          ...existing,
          valid: run.displayValid,
          cryptoValid: run.verify.valid,
          inputState: run.inputState,
          sourceVerified: run.sourceVerified,
          renderedVerified: run.renderedVerified,
          reason: run.reason,
          trustScore: trust.score,
          trustIndicator: trust.indicator,
        trustLabel: trust.indicator === 'green' ? 'Trusted' : trust.indicator === 'red' ? 'Untrusted' : 'Unknown',
          trustInputs: trust.inputs,
          keyid: run.verify.keyid,
          algorithm: run.verify.algorithm,
          signedAt: run.verify.signedAt,
          domain: run.verify.domain,
          claims: run.verify.claims ?? {},
        };
        pageVerificationBySection.set(changedSection, updated);
        const index = pageVerifications.indexOf(existing);
        if (index >= 0) pageVerifications[index] = updated;
      } catch (error) {
        if (
          sectionReverifyGeneration.get(changedSection) !== generation ||
          navigationRun !== observerNavigationRun ||
          autoVerifyGeneration !== observerAutoVerifyGeneration
        ) return;
        const reason = error instanceof Error ? error.message : String(error);
        applySectionStatusUI(
          changedSection,
          null,
          null,
          reason,
          activeSettings,
        );
        const existing = pageVerificationBySection.get(changedSection);
        if (existing) {
          const failed: PageVerification = {
            ...existing,
            valid: false,
            cryptoValid: false,
            inputState: 'stale',
            sourceVerified: false,
            renderedVerified: false,
            reason,
            trustScore: 0,
            trustIndicator: 'red',
            trustLabel: 'Untrusted',
            trustInputs: [],
          };
          pageVerificationBySection.set(changedSection, failed);
          const index = pageVerifications.indexOf(existing);
          if (index >= 0) pageVerifications[index] = failed;
        }
      }
      await notifyContentDetected();
    })();
  });
  sectionObserverDisposers.set(section, dispose);
}

/**
 * Notify background that content was detected. This drives the popup's
 * "current page" status display and is independent of the auto-verify
 * badges injected above. Failures here are non-fatal.
 */
async function notifyContentDetected(): Promise<void> {
  try {
    // The auto-verify path already owns the per-section UI, so the response
    // does not need to cross back into this page.
    await platformAdapter.sendMessage(MessageContext.CONTENT, {
      type: 'CONTENT_DETECTED',
      url: window.location.href,
      verified: pageVerifications.length > 0 &&
        pageVerifications.every((result) => result.valid),
    });
  } catch {
    // Background may legitimately have no enrichment to offer.
  }
}

function listenForMessages() {
  platformAdapter.registerMessageListeners({
    [MessageContext.BACKGROUND]: async (message: ExtensionMessage) => {
      switch (message.type) {
        case 'GET_PAGE_VERIFICATIONS':
        {
          // Popup reads the per-section results from here. Snapshot to keep
          // both the array and each record immutable from the caller's
          // perspective. The popup cannot mutate the content script cache.
          const results = pageVerifications.map((result) => Object.freeze({ ...result }));
          return {
            url: window.location.href,
            domain: currentOrigin(),
            snapshot: navigationSnapshot
              ? { url: navigationSnapshot.url, capturedAt: navigationSnapshot.capturedAt, sectionCount: navigationSnapshot.sections.length }
              : null,
            results: Object.freeze(results),
          };
        }
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    },
  });
}

/**
 * Run on DOMContentLoaded so we have the full DOM (signed-section elements
 * may be near the end of the body). The manifest also registers this
 * script as a content_script so it auto-injects on every page load; the
 * DOMContentLoaded check handles the rare case where the script is
 * injected before the DOM is ready.
 */
export function installContentScript(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize();
    });
  } else {
    initialize();
  }
}

// Jest imports the production functions directly and sets this flag before
// requiring the module. Packaged builds leave it unset, preserving the
// existing document-idle bootstrap behavior exactly.
if (!(globalThis as { __HTMLTRUST_TESTING__?: boolean }).__HTMLTRUST_TESTING__) {
  installContentScript();
}
