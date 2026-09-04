/**
 * Production content-script lifecycle tests.
 *
 * The module is imported with its normal bootstrap gated only for this Jest
 * process. Every assertion below calls the functions used by the packaged
 * content script; there is no copied DOM walker or badge renderer here.
 */
import { CSS_CLASSES } from '../core/common/constants';
import type { Settings } from '../core/common/types';
import type { VerifyResult, TrustEvaluation } from '@htmltrust/browser-client';

// Must be set before requiring index.ts, whose packaged entrypoint bootstraps
// itself as soon as it is loaded.
(globalThis as { __HTMLTRUST_TESTING__?: boolean }).__HTMLTRUST_TESTING__ = true;

jest.mock('@htmltrust/browser-client', () => ({
  verifySignedSection: jest.fn(),
  evaluateTrustPolicy: jest.fn(),
  defaultResolverChain: jest.fn(() => []),
  isPrivateHost: jest.fn((hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'),
}));

import {
  evaluateTrustPolicy,
  verifySignedSection,
} from '@htmltrust/browser-client';

const {
  applySectionStatusUI,
  armSectionMutationInvalidation,
  autoVerifyPage,
  invalidateAutoVerifyGeneration,
  resetNavigationState,
} = require('./index') as typeof import('./index');

const AUTO_BADGE_MARKER = 'cs-auto-verification-badges';

const settings: Settings = {
  autoVerify: true,
  showBadges: true,
  highlightVerified: true,
  highlightUnverified: true,
  trustDirectoryUrls: [],
  personalTrustList: [],
  trustedDomains: [],
  authMethod: 'apikey',
  serverConfigs: [],
  developerDebugLogging: false,
};

function verifyShape(overrides: Partial<VerifyResult> = {}): VerifyResult {
  return {
    valid: true,
    keyid: 'did:web:example.test',
    algorithm: 'ed25519',
    contentHash: 'sha256:content',
    claimsHash: 'sha256:claims',
    claims: {},
    signedAt: '2026-08-28T00:00:00Z',
    domain: 'https://example.test',
    origin: 'https://example.test',
    inputState: 'rendered-match',
    ...overrides,
  };
}

function trustShape(overrides: Partial<TrustEvaluation> = {}): TrustEvaluation {
  return { score: 80, indicator: 'green', inputs: [], ...overrides };
}

describe('production content-script UI and lifecycle', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
    resetNavigationState();
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      url: window.location.href,
      text: async () => '',
    });
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('anchors nested indicators outside the outermost signed section', () => {
    document.body.innerHTML =
      '<signed-section signature="outer"><signed-section signature="inner">text</signed-section></signed-section>';
    const outer = document.querySelector('signed-section')!;
    const inner = outer.querySelector('signed-section')!;

    applySectionStatusUI(inner, {
      verify: verifyShape(),
      inputState: 'rendered-match',
      sourceVerified: true,
      renderedVerified: true,
      displayValid: true,
      reason: null,
    }, trustShape(), null, settings);

    const badge = document.querySelector(`.${AUTO_BADGE_MARKER}`)!;
    expect(badge.parentElement).toBe(document.body);
    expect(badge.previousElementSibling).toBe(outer);
    expect(outer.querySelector(`.${AUTO_BADGE_MARKER}`)).toBeNull();
  });

  it.each(['stale', 'source-only'] as const)(
    'shows a warning for cryptographically valid %s results',
    (inputState) => {
      document.body.innerHTML = '<signed-section>text</signed-section>';
      const section = document.querySelector('signed-section')!;
      applySectionStatusUI(section, {
        verify: verifyShape({ inputState }),
        inputState,
        sourceVerified: true,
        renderedVerified: false,
        displayValid: false,
        reason: inputState === 'stale' ? 'rendered DOM diverged from verified source' : 'rendered DOM not compared',
      }, trustShape(), null, settings);

      const badge = document.querySelector(`.${AUTO_BADGE_MARKER}`)!;
      expect(badge.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_WARNING}`)).not.toBeNull();
      expect(badge.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED}`)).toBeNull();
      expect(badge.getAttribute('aria-label')).toContain(
        inputState === 'stale' ? 'rendered DOM differs' : 'rendered DOM not compared',
      );
    },
  );

  it('fails closed through autoVerifyPage when the source snapshot is unavailable', async () => {
    document.body.innerHTML = '<signed-section signature="live-only">live</signed-section>';

    await autoVerifyPage([], settings);

    const badge = document.querySelector(`.${AUTO_BADGE_MARKER}`)!;
    expect(badge.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED}`)).not.toBeNull();
    expect(verifySignedSection).not.toHaveBeenCalled();
    expect(badge.getAttribute('aria-label')).toContain('Signature invalid');
  });

  it('fails closed through autoVerifyPage when source and live identities do not map', async () => {
    const sourceHTML = '<signed-section profile="htmltrust-signature-v1" signature="source">source</signed-section>';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      url: window.location.href,
      text: async () => sourceHTML,
    });
    document.body.innerHTML =
      '<signed-section profile="htmltrust-signature-v1" signature="live">live</signed-section>';

    await autoVerifyPage([], settings);

    const badge = document.querySelector(`.${AUTO_BADGE_MARKER}`)!;
    expect(badge.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED}`)).not.toBeNull();
    expect(verifySignedSection).not.toHaveBeenCalled();
  });

  it('invalidates a rendered marker after signed content mutation', async () => {
    document.body.innerHTML = '<signed-section signature="a">text</signed-section>';
    const section = document.querySelector('signed-section')!;
    applySectionStatusUI(section, {
      verify: verifyShape(),
      inputState: 'rendered-match',
      sourceVerified: true,
      renderedVerified: true,
      displayValid: true,
      reason: null,
    }, trustShape(), null, settings);
    (verifySignedSection as jest.Mock).mockResolvedValue(verifyShape({ inputState: 'stale' }));
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue(trustShape());

    armSectionMutationInvalidation(
      section,
      '<signed-section signature="a">text</signed-section>',
      'https://example.test/article',
      'https://example.test/article',
      [],
      settings,
    );
    section.textContent = 'changed';
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const badge = document.querySelector(`.${AUTO_BADGE_MARKER}`)!;
    expect(badge.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_WARNING}`)).not.toBeNull();
    expect(badge.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED}`)).toBeNull();
    expect(verifySignedSection).toHaveBeenCalled();
  });

  it('resets navigation state and removes old markers before a reload verification', async () => {
    const fetchMock = global.fetch as jest.Mock;
    const oldHTML = '<signed-section profile="htmltrust-signature-v1" signature="old">old</signed-section>';
    const newHTML = '<signed-section profile="htmltrust-signature-v1" signature="new">new</signed-section>';
    fetchMock.mockResolvedValue({ ok: true, url: window.location.href, text: async () => oldHTML });
    (verifySignedSection as jest.Mock).mockResolvedValue(verifyShape());
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue(trustShape());
    document.body.innerHTML = oldHTML;
    await autoVerifyPage([], settings);
    expect(document.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED}`)).not.toBeNull();

    resetNavigationState();
    expect(document.querySelector(`.${AUTO_BADGE_MARKER}`)).toBeNull();

    // A new DOM section and response represent the post-reload document. The
    // verifier must receive the new source slice, never the prior snapshot.
    fetchMock.mockResolvedValue({ ok: true, url: window.location.href, text: async () => newHTML });
    document.body.innerHTML = newHTML;
    await autoVerifyPage([], settings);
    expect(document.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED}`)).not.toBeNull();
    const calls = (verifySignedSection as jest.Mock).mock.calls;
    expect(calls[calls.length - 1]?.[0]).toBe(newHTML);
  });

  it('does not let an older policy run overwrite results after settings change', async () => {
    document.body.innerHTML = '<signed-section profile="htmltrust-signature-v1" signature="stable">text</signed-section>';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      url: window.location.href,
      text: async () => document.body.innerHTML,
    });
    let oldVerificationStarted!: () => void;
    const oldStarted = new Promise<void>((resolve) => { oldVerificationStarted = resolve; });
    let releaseOldVerification!: (result: VerifyResult) => void;
    const oldVerification = new Promise<VerifyResult>((resolve) => {
      releaseOldVerification = resolve;
    });
    let secondRun = false;
    (verifySignedSection as jest.Mock).mockImplementation(() => {
      if (secondRun) return Promise.resolve(verifyShape());
      oldVerificationStarted();
      return oldVerification;
    });
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue(trustShape({ score: 91, indicator: 'green' }));

    const oldRun = autoVerifyPage([], settings);
    await oldStarted;
    expect(verifySignedSection).toHaveBeenCalled();

    // This is the same invalidation used by chrome.storage.onChanged, without
    // depending on the browser API in this deterministic race test.
    invalidateAutoVerifyGeneration();
    document.querySelectorAll(`.${AUTO_BADGE_MARKER}`).forEach((marker) => marker.remove());
    secondRun = true;
    await autoVerifyPage([], { ...settings, trustedDomains: ['https://new-policy.example'] });
    expect(verifySignedSection).toHaveBeenCalledTimes(2);
    expect(evaluateTrustPolicy).toHaveBeenCalledTimes(1);
    expect(document.querySelector(`.${AUTO_BADGE_MARKER}`)?.getAttribute('aria-label')).toContain('Trust: 91%');

    releaseOldVerification(verifyShape({ keyid: 'old-result.example' }));
    await oldRun;
    expect(document.querySelector(`.${AUTO_BADGE_MARKER}`)?.getAttribute('aria-label')).toContain('Trust: 91%');
  });

  it('passes the hardened verifier fetch to every trust-policy evaluation', async () => {
    document.body.innerHTML = '<signed-section profile="htmltrust-signature-v1" signature="fetch">text</signed-section>';
    (verifySignedSection as jest.Mock).mockResolvedValue(verifyShape());
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue(trustShape());

    await autoVerifyPage([], settings);

    expect(evaluateTrustPolicy).toHaveBeenCalled();
    for (const [, policy] of (evaluateTrustPolicy as jest.Mock).mock.calls) {
      expect(policy.fetch).toEqual(expect.any(Function));
      await expect(policy.fetch('http://private.example/')).rejects.toThrow('network-policy-blocked');
      await expect(policy.fetch('https://127.0.0.1/')).rejects.toThrow('network-policy-blocked');
    }
  });
});
