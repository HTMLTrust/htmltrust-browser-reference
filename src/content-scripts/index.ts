/**
 * Content script entry point.
 *
 * Two responsibilities:
 *
 *   1. Auto-verify on page load. On DOMContentLoaded (the manifest registers
 *      this script as document_idle equivalent for content_scripts), find
 *      every <signed-section[signature]> on the page, verify each via
 *      @htmltrust/browser-client (Layer 1, SubtleCrypto-backed), evaluate the
 *      trust policy locally (Layer 2), and inject the corresponding badges
 *      inline next to each section. No popup interaction required.
 *
 *   2. Preserve the existing popup-driven flow. The background script can
 *      still push a richer VerificationResult via UPDATE_VERIFICATION_UI, in
 *      which case we apply the legacy whole-page highlighting/badges. This
 *      keeps the popup "Verify Content" button working and supports any
 *      flows that need server-side enrichment (e.g. author name lookups).
 *
 * Verification is local: the trust server is never contacted for the
 * crypto step. Trust directories are consulted only by the resolver chain
 * (third in line after did:web and direct URL resolvers).
 */
import {
  verifySignedSection,
  evaluateTrustPolicy,
  defaultResolverChain,
  type VerifyResult,
  type TrustEvaluation,
  type TrustInput,
  type KeyResolver,
} from '@htmltrust/browser-client';
import { MESSAGE_TYPES, CSS_CLASSES, TRUST_STATUS, STORAGE_KEYS } from '../core/common/constants';
import { ContentProcessor } from '../core/content';
import { PlatformAdapter, MessageContext } from '../platforms/common';
import {
  VerificationResult,
  TrustStatus,
  VoteType,
  Settings,
  getTrustDirectoryUrls,
} from '../core/common/types';

// Import platform-specific adapter
// This will be replaced with the correct adapter at build time
import { ChromiumAdapter } from '../platforms/chromium';

// Initialize platform adapter
const platformAdapter: PlatformAdapter = new ChromiumAdapter();

// Initialize content processor (used by the legacy heuristic-content path)
const contentProcessor = new ContentProcessor();

/** Marker class on the auto-verify badge container, used to avoid duplicates. */
const AUTO_BADGE_MARKER = 'cs-auto-verification-badges';

/**
 * Per-section snapshot exposed to the popup via the GET_PAGE_VERIFICATIONS
 * message. The popup is the user-facing surface for badge details; the page
 * only carries quiet outline + corner-badge cues.
 */
type PageVerification = {
  index: number;
  valid: boolean;
  reason: string | null;
  trustScore: number;
  trustIndicator: 'green' | 'yellow' | 'red';
  trustLabel: string;
  keyid: string;
  algorithm: string;
  signedAt: string;
  domain: string;
  claims: Record<string, string>;
};

/** Module-scoped cache of this page's verification results. */
const pageVerifications: PageVerification[] = [];

/**
 * Pull authorId out of a `.../authors/{id}/public-key` keyid URL. Returns
 * null for keyids that aren't in this shape (e.g. did:web identifiers).
 * Used purely for badge data attributes and vote button wiring.
 */
function authorIdFromKeyid(keyid: string): string | null {
  if (!keyid) return null;
  const m = keyid.match(/\/authors\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * Initialize the content script.
 *
 * Three things happen here, in this order:
 *   1. Read settings from storage (resolver chain needs the directory list,
 *      policy evaluator needs personal trust list / trusted domains).
 *   2. Auto-verify every signed-section on the page.
 *   3. Notify the background script that content was detected (for the popup
 *      status display) and listen for any UPDATE_VERIFICATION_UI follow-ups.
 *
 * Errors in any single signed-section don't abort the page; each section is
 * verified independently, and a failure to load settings falls back to an
 * empty resolver chain (still verifies any did:web or direct-URL keyids).
 */
async function initialize() {
  try {
    console.log('Content Signing content script initialized');

    // 1. Settings → resolver chain + trust policy inputs
    const settings = await loadSettings();
    const directories = getTrustDirectoryUrls(settings);
    const resolverChain = defaultResolverChain({ directories });

    // 2. Auto-verify on page load. Idempotent: re-running is a no-op for
    //    sections that already have an auto badge container next to them.
    await autoVerifyPage(resolverChain, settings);

    // 3. Legacy popup path: notify background, optionally apply richer UI
    //    on UPDATE_VERIFICATION_UI messages. This is best-effort and
    //    independent of the auto-verify result above.
    await notifyContentDetected();

    // Listen for messages from the background script
    listenForMessages();
  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
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
    personalTrustList: [],
    trustedDomains: [],
    authMethod: 'apikey',
    serverConfigs: [],
  };
}

/**
 * Walk every <signed-section[signature]> on the page and verify it locally.
 *
 * Each section is verified independently — a failure on one does not skip
 * the others. Badges are inserted as the next sibling of the section
 * element, matching the e2e harness's visual placement.
 *
 * Idempotent: if a section already has an auto-badge sibling, it's skipped.
 * This protects against re-runs (e.g. the script being injected twice on a
 * page that does its own DOM manipulation).
 */
async function autoVerifyPage(
  resolverChain: KeyResolver[],
  settings: Settings,
): Promise<void> {
  const sections = document.querySelectorAll('signed-section[signature]');
  if (sections.length === 0) {
    // Graceful no-op: pages without signed-sections are common and not an error.
    return;
  }

  const domain = window.location.hostname;
  const personalTrustList = settings.personalTrustList ?? [];
  const trustedDomains = settings.trustedDomains ?? [];

  pageVerifications.length = 0;

  let i = 0;
  for (const section of Array.from(sections)) {
    // Idempotency: skip sections we've already decorated.
    if (section.classList.contains(SECTION_DECORATED_CLASS)) {
      continue;
    }

    try {
      const verify = await verifySignedSection(section, {
        keyResolvers: resolverChain,
        domain,
        debug: true,
      });

      // Layer 2: trust policy. directorySubscriptions is intentionally empty
      // here — the spec-compliant `<dir>/keys/<keyid>/reputation` endpoint
      // shape is not yet implemented by the reference trust server. The e2e
      // harness layers reports/score on top via a custom server lookup; the
      // extension follows the same TODO pattern and stays out of that
      // business until the server endpoint exists.
      // TODO(directory-shape): wire `directorySubscriptions` once the trust
      // server exposes `/keys/{keyid}/reputation` per spec.
      const trust = await evaluateTrustPolicy(verify, {
        personalTrustList,
        trustedDomains,
        directorySubscriptions: [],
      });

      applySectionStatusUI(section, verify, trust);
      pageVerifications.push({
        index: i,
        valid: verify.valid,
        reason: verify.valid ? null : verify.reason ?? 'unknown',
        trustScore: trust.score,
        trustIndicator: trust.indicator,
        trustLabel: trust.indicator === 'green' ? 'Trusted' : trust.indicator === 'red' ? 'Untrusted' : 'Unknown',
        keyid: verify.keyid,
        algorithm: verify.algorithm,
        signedAt: verify.signedAt,
        domain: verify.domain,
        claims: verify.claims ?? {},
      });
    } catch (err) {
      console.error('Content Signing: verification failed for a signed-section', err);
      applySectionStatusUI(section, null, null, (err as Error).message ?? 'verification error');
      pageVerifications.push({
        index: i,
        valid: false,
        reason: (err as Error).message ?? 'verification error',
        trustScore: 0,
        trustIndicator: 'red',
        trustLabel: 'Untrusted',
        keyid: '',
        algorithm: '',
        signedAt: '',
        domain,
        claims: {},
      });
    }
    i++;
  }
}

/** Class added to a signed-section once we've decorated it. */
const SECTION_DECORATED_CLASS = 'cs-decorated';

/**
 * Apply quiet, per-section visual cues directly to the signed-section:
 *   - dotted outline whose color reflects signature validity
 *   - tiny circular ✓/✗ badge in the top-right
 *
 * The user-facing detailed pills (Signature valid / Trust %) live in the
 * popup, not on the page.
 */
function applySectionStatusUI(
  section: Element,
  verify: VerifyResult | null,
  trust: TrustEvaluation | null,
  errorReason: string | null = null,
): void {
  section.classList.add(SECTION_DECORATED_CLASS, CSS_CLASSES.CONTENT_OUTLINE);
  const valid = verify?.valid === true;
  section.classList.add(valid ? CSS_CLASSES.VERIFIED_CONTENT : CSS_CLASSES.UNVERIFIED_CONTENT);

  // Tooltip carries the human-readable status — popup is the rich surface.
  const reason = errorReason ?? verify?.reason ?? null;
  const trustPart = trust ? ` · Trust: ${trust.score}% (${trust.indicator})` : '';
  const tooltip = valid
    ? `HTMLTrust: ✓ Signature valid${trustPart}`
    : `HTMLTrust: ✗ Signature invalid${reason ? ` (${reason})` : ''}`;
  (section as HTMLElement).title = tooltip;

  const badges = document.createElement('div');
  badges.className = `${CSS_CLASSES.VERIFICATION_BADGES} ${AUTO_BADGE_MARKER}`;
  const sig = document.createElement('span');
  sig.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VALIDITY_BADGE} ${
    valid ? CSS_CLASSES.VERIFICATION_BADGE_VERIFIED : CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED
  }`;
  sig.textContent = valid ? '✓' : '✗';
  sig.title = tooltip;
  badges.appendChild(sig);
  section.appendChild(badges);
}

/**
 * Build the inline badge container for a successful or failed verification.
 *
 * Matches the e2e harness's visual style (playwright-session.ts lines
 * 312-360) so consumer-facing screenshots and the live extension look the
 * same. CSS classes also match the existing content.css file so the
 * stylesheet shipped with the extension styles them correctly.
 */
function buildAutoBadges(verify: VerifyResult, trust: TrustEvaluation): HTMLElement {
  const authorId = verify.keyid ? authorIdFromKeyid(verify.keyid) : null;

  const badges = document.createElement('div');
  badges.className = `${CSS_CLASSES.VERIFICATION_BADGES} ${AUTO_BADGE_MARKER}`;
  badges.setAttribute('data-author-id', authorId ?? '');
  badges.setAttribute('data-trust-score', String(trust.score));
  badges.setAttribute('data-keyid', verify.keyid ?? '');
  badges.style.cssText =
    'display: flex; gap: 8px; padding: 8px; margin: 8px 0; font-family: sans-serif; font-size: 14px; align-items: center; flex-wrap: wrap;';

  // Signature validity badge
  const sigBadge = document.createElement('span');
  if (verify.valid) {
    sigBadge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED} ${CSS_CLASSES.VALIDITY_BADGE}`;
    sigBadge.textContent = '✓ Signature valid';
    sigBadge.style.cssText =
      'background: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px;';
  } else {
    sigBadge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED} ${CSS_CLASSES.VALIDITY_BADGE}`;
    sigBadge.textContent = `✗ Signature INVALID${verify.reason ? ` (${verify.reason})` : ''}`;
    sigBadge.style.cssText =
      'background: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px;';
  }
  badges.appendChild(sigBadge);

  // Trust badge — color reflects the policy evaluator's indicator.
  const trustBadge = document.createElement('span');
  const trustClass =
    trust.indicator === 'green'
      ? CSS_CLASSES.TRUST_BADGE_TRUSTED
      : trust.indicator === 'red'
      ? CSS_CLASSES.TRUST_BADGE_UNTRUSTED
      : CSS_CLASSES.TRUST_BADGE_UNKNOWN;
  trustBadge.className = `${CSS_CLASSES.TRUST_BADGE} ${trustClass}`;
  trustBadge.textContent = `Trust: ${trust.score}%`;
  if (trust.indicator === 'green') {
    trustBadge.style.cssText =
      'background: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px;';
  } else if (trust.indicator === 'red') {
    trustBadge.style.cssText =
      'background: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px;';
  } else {
    trustBadge.style.cssText =
      'background: #fff3cd; color: #856404; padding: 4px 8px; border-radius: 4px;';
  }
  // Hover tooltip: per-input rationale, useful for debugging / auditability.
  trustBadge.title = trust.inputs
    .map((r: TrustInput) => `${r.source}: ${r.contribution} (${r.rationale})`)
    .join('\n');
  badges.appendChild(trustBadge);

  // Vote buttons (wired only when we extracted an authorId; did:web keyids
  // are skipped because the existing vote API is keyed by authorId, not keyid).
  if (authorId) {
    badges.appendChild(buildVoteButton(CSS_CLASSES.UPVOTE_BUTTON, '👍 Trust', authorId, VoteType.UPVOTE));
    badges.appendChild(buildVoteButton(CSS_CLASSES.DOWNVOTE_BUTTON, '👎 Distrust', authorId, VoteType.DOWNVOTE));
  }

  return badges;
}

function buildVoteButton(
  cssClass: string,
  label: string,
  authorId: string,
  vote: VoteType,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `${CSS_CLASSES.VOTE_BUTTON} ${cssClass}`;
  btn.textContent = label;
  btn.dataset.authorId = authorId;
  btn.dataset.voteType = vote;
  btn.style.cssText =
    'cursor: pointer; padding: 4px 8px; border: 1px solid #ccc; background: white; border-radius: 4px;';
  btn.addEventListener('click', handleVoteButtonClick);
  return btn;
}

function buildErrorBadges(reason: string): HTMLElement {
  const badges = document.createElement('div');
  badges.className = `${CSS_CLASSES.VERIFICATION_BADGES} ${AUTO_BADGE_MARKER}`;
  badges.style.cssText =
    'display: flex; gap: 8px; padding: 8px; margin: 8px 0; font-family: sans-serif; font-size: 14px; align-items: center;';
  const sigBadge = document.createElement('span');
  sigBadge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED} ${CSS_CLASSES.VALIDITY_BADGE}`;
  sigBadge.textContent = `✗ Verification error: ${reason}`;
  sigBadge.style.cssText =
    'background: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px;';
  badges.appendChild(sigBadge);
  return badges;
}

/**
 * Notify background that content was detected. This drives the popup's
 * "current page" status display and is independent of the auto-verify
 * badges injected above. Failures here are non-fatal.
 */
async function notifyContentDetected(): Promise<void> {
  try {
    // Use legacy heuristic-based content extraction for the popup; the
    // auto-verify path uses the actual signed-section element directly.
    const extractedContent = contentProcessor.extractContent(document);

    // Best-effort notification. We deliberately ignore the response: the
    // auto-verify path above already applied the authoritative UI based on
    // the local verifier's result, and the legacy enrichment path would
    // happily overwrite that with default "Untrusted / unknown domain"
    // markers driven by a stale VerificationResult shape.
    await platformAdapter.sendMessage(MessageContext.CONTENT, {
      type: MESSAGE_TYPES.CONTENT_DETECTED,
      url: window.location.href,
      content: extractedContent,
    });
  } catch (err) {
    // Background may legitimately have no enrichment to offer. Don't pollute
    // the console for this case.
    console.debug('Content Signing: notifyContentDetected returned no enrichment', err);
  }
}

/**
 * Apply legacy verification UI driven by the background script. Kept for
 * back-compat with the popup → background → content-script enrichment
 * flow. The auto-verify path above is what the user sees by default; this
 * only runs if the background pushes a result.
 */
function applyVerificationUI(verificationResult: VerificationResult) {
  try {
    // Get settings from the verification result
    const settings = verificationResult.settings || {
      showBadges: true,
      highlightVerified: true,
      highlightUnverified: false,
    };

    // Find content elements to highlight
    const contentElements = findContentElements();

    // Apply verification UI to each content element
    contentElements.forEach(element => {
      applyVerificationUIToElement(element, verificationResult, settings);
    });
  } catch (error) {
    console.error('Failed to apply verification UI:', error);
  }
}

/**
 * Find HTMLTrust signed-section elements on the page
 * @returns An array of signed-section elements (empty if none found)
 */
function findContentElements(): Element[] {
  return Array.from(document.querySelectorAll('signed-section'));
}

/**
 * Apply verification UI to a specific element
 */
function applyVerificationUIToElement(
  element: Element,
  verificationResult: VerificationResult,
  settings: NonNullable<VerificationResult['settings']>
) {
  // Add content outline class
  element.classList.add(CSS_CLASSES.CONTENT_OUTLINE);

  // Determine verification status class
  if (verificationResult.verified) {
    if (settings.highlightVerified) {
      element.classList.add(CSS_CLASSES.VERIFIED_CONTENT);
    }
  } else {
    if (settings.highlightUnverified) {
      element.classList.add(CSS_CLASSES.UNVERIFIED_CONTENT);
    }
  }

  // Add verification badges if enabled
  if (settings.showBadges) {
    addVerificationBadges(element, verificationResult);
  }
}

/**
 * Add verification badges to an element
 */
function addVerificationBadges(element: Element, verificationResult: VerificationResult) {
  try {
    // Create badge container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = CSS_CLASSES.VERIFICATION_BADGES;

    // Add validity badge
    const validityBadge = createValidityBadge(verificationResult);
    badgeContainer.appendChild(validityBadge);

    // Add trust badge
    const trustBadge = createTrustBadge(verificationResult);
    badgeContainer.appendChild(trustBadge);

    // Add the badge container to the element
    element.appendChild(badgeContainer);
  } catch (error) {
    console.error('Failed to add verification badges:', error);
  }
}

function createValidityBadge(verificationResult: VerificationResult): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VALIDITY_BADGE}`;

  if (verificationResult.verified) {
    badge.classList.add(CSS_CLASSES.VERIFICATION_BADGE_VERIFIED);
    badge.textContent = '✓';

    const tooltip = document.createElement('span');
    tooltip.className = CSS_CLASSES.TOOLTIP;
    tooltip.textContent = `Verified by ${verificationResult.user?.name || 'unknown'}`;

    if (verificationResult.user?.id) {
      const voteButtons = createVoteButtons(verificationResult.user.id);
      tooltip.appendChild(voteButtons);
    }

    badge.appendChild(tooltip);
  } else {
    badge.classList.add(CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED);
    badge.textContent = '✗';

    const tooltip = document.createElement('span');
    tooltip.className = CSS_CLASSES.TOOLTIP;
    tooltip.textContent = verificationResult.reason || 'Not verified';
    badge.appendChild(tooltip);
  }

  return badge;
}

function createTrustBadge(verificationResult: VerificationResult): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.TRUST_BADGE}`;

  const trustStatus = determineTrustStatus(verificationResult);

  switch (trustStatus) {
    case TRUST_STATUS.TRUSTED: {
      badge.classList.add(CSS_CLASSES.TRUST_BADGE_TRUSTED);
      badge.textContent = '🔒';
      const trustedTooltip = document.createElement('span');
      trustedTooltip.className = CSS_CLASSES.TOOLTIP;
      trustedTooltip.textContent = `Trusted source: ${verificationResult.domain || 'unknown domain'}`;
      badge.appendChild(trustedTooltip);
      break;
    }
    case TRUST_STATUS.UNTRUSTED: {
      badge.classList.add(CSS_CLASSES.TRUST_BADGE_UNTRUSTED);
      badge.textContent = '⚠️';
      const untrustedTooltip = document.createElement('span');
      untrustedTooltip.className = CSS_CLASSES.TOOLTIP;
      untrustedTooltip.textContent = `Untrusted source: ${verificationResult.domain || 'unknown domain'}`;
      badge.appendChild(untrustedTooltip);
      break;
    }
    case TRUST_STATUS.UNKNOWN:
    default: {
      badge.classList.add(CSS_CLASSES.TRUST_BADGE_UNKNOWN);
      badge.textContent = '?';
      const unknownTooltip = document.createElement('span');
      unknownTooltip.className = CSS_CLASSES.TOOLTIP;
      unknownTooltip.textContent = `Unknown source: ${verificationResult.domain || 'unknown domain'}`;
      badge.appendChild(unknownTooltip);
      break;
    }
  }

  return badge;
}

function createVoteButtons(authorId: string): HTMLElement {
  const container = document.createElement('div');
  container.className = CSS_CLASSES.VOTE_BUTTONS;

  const upvoteButton = document.createElement('button');
  upvoteButton.className = `${CSS_CLASSES.VOTE_BUTTON} ${CSS_CLASSES.UPVOTE_BUTTON}`;
  upvoteButton.textContent = '👍';
  upvoteButton.title = 'Upvote this author';
  upvoteButton.dataset.authorId = authorId;
  upvoteButton.dataset.voteType = VoteType.UPVOTE;

  const downvoteButton = document.createElement('button');
  downvoteButton.className = `${CSS_CLASSES.VOTE_BUTTON} ${CSS_CLASSES.DOWNVOTE_BUTTON}`;
  downvoteButton.textContent = '👎';
  downvoteButton.title = 'Downvote this author';
  downvoteButton.dataset.authorId = authorId;
  downvoteButton.dataset.voteType = VoteType.DOWNVOTE;

  upvoteButton.addEventListener('click', handleVoteButtonClick);
  downvoteButton.addEventListener('click', handleVoteButtonClick);

  container.appendChild(upvoteButton);
  container.appendChild(downvoteButton);

  checkExistingVote(authorId, upvoteButton, downvoteButton);

  return container;
}

async function checkExistingVote(
  authorId: string,
  upvoteButton: HTMLButtonElement,
  downvoteButton: HTMLButtonElement
): Promise<void> {
  try {
    const response = await platformAdapter.sendMessage(MessageContext.BACKGROUND, {
      type: 'GET_AUTHOR_VOTE',
      authorId,
    });

    if (response && response.vote) {
      if (response.vote === VoteType.UPVOTE) {
        upvoteButton.classList.add(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
        downvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      } else if (response.vote === VoteType.DOWNVOTE) {
        downvoteButton.classList.add(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
        upvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      } else {
        upvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
        downvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      }
    }
  } catch (error) {
    console.error('Failed to check existing vote:', error);
  }
}

async function handleVoteButtonClick(event: MouseEvent): Promise<void> {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget as HTMLButtonElement;
  const authorId = button.dataset.authorId;
  const voteType = button.dataset.voteType as VoteType;

  if (!authorId || !voteType) {
    console.error('Missing authorId or voteType in vote button');
    return;
  }

  const isToggle = button.classList.contains(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
  const finalVoteType = isToggle ? VoteType.NEUTRAL : voteType;

  const container = button.parentElement;
  const upvoteButton = container?.querySelector(`.${CSS_CLASSES.UPVOTE_BUTTON}`) as HTMLButtonElement;
  const downvoteButton = container?.querySelector(`.${CSS_CLASSES.DOWNVOTE_BUTTON}`) as HTMLButtonElement;

  try {
    const otherButton = voteType === VoteType.UPVOTE ? downvoteButton : upvoteButton;

    if (finalVoteType === VoteType.NEUTRAL) {
      button.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
    } else {
      button.classList.add(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      if (otherButton) {
        otherButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      }
    }

    await platformAdapter.sendMessage(MessageContext.BACKGROUND, {
      type: MESSAGE_TYPES.SUBMIT_VOTE,
      authorId,
      vote: finalVoteType,
      url: window.location.href,
      contentHash: null,
    });

    console.log(`Vote ${finalVoteType} submitted for author ${authorId}`);
  } catch (error) {
    console.error('Failed to submit vote:', error);
    if (upvoteButton && downvoteButton) {
      checkExistingVote(authorId, upvoteButton, downvoteButton);
    }
  }
}

function determineTrustStatus(verificationResult: VerificationResult): TrustStatus {
  if (verificationResult.trustStatus) {
    return verificationResult.trustStatus;
  }

  if (!verificationResult.verified) {
    return TRUST_STATUS.UNTRUSTED;
  }

  if (verificationResult.trustDirectoryEntry) {
    return TRUST_STATUS.TRUSTED;
  }

  if (verificationResult.user) {
    return verificationResult.user.verified ? TRUST_STATUS.TRUSTED : TRUST_STATUS.UNTRUSTED;
  }

  return TRUST_STATUS.UNKNOWN;
}

function listenForMessages() {
  platformAdapter.registerMessageListeners({
    [MessageContext.BACKGROUND]: async (message: any) => {
      switch (message.type) {
        case 'UPDATE_VERIFICATION_UI':
          applyVerificationUI(message.verificationResult);
          return { success: true };
        case 'GET_PAGE_VERIFICATIONS':
          // Popup reads the per-section results from here. Snapshot to keep
          // the array immutable from the caller's perspective.
          return {
            url: window.location.href,
            domain: window.location.hostname,
            results: pageVerifications.slice(),
          };
        case MESSAGE_TYPES.VOTE_ACKNOWLEDGED:
          if (message.authorId) {
            const upvoteButtons = document.querySelectorAll(
              `.${CSS_CLASSES.UPVOTE_BUTTON}[data-author-id="${message.authorId}"]`
            );
            const downvoteButtons = document.querySelectorAll(
              `.${CSS_CLASSES.DOWNVOTE_BUTTON}[data-author-id="${message.authorId}"]`
            );

            upvoteButtons.forEach((upvoteButton) => {
              downvoteButtons.forEach((downvoteButton) => {
                checkExistingVote(
                  message.authorId,
                  upvoteButton as HTMLButtonElement,
                  downvoteButton as HTMLButtonElement
                );
              });
            });
          }
          return { success: true };
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
  });
} else {
  initialize();
}
