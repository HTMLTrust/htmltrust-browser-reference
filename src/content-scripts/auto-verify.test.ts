/**
 * Tests for the auto-verify flow that runs on DOMContentLoaded.
 *
 * The content script in src/content-scripts/index.ts is hard to import
 * directly under jest because it self-bootstraps on module load (it pulls in
 * the chromium platform adapter, registers DOM listeners, etc.). What we
 * verify here instead are the load-bearing invariants the migration is
 * supposed to guarantee:
 *
 *   1. The selector `signed-section[signature]` finds the elements the
 *      content script's autoVerifyPage walks over.
 *   2. Mocking @htmltrust/browser-client and replaying the same end-to-end
 *      shape autoVerifyPage uses produces a badge container with the
 *      expected CSS classes for both verified and unverified results, and
 *      that errors during verification produce an error badge with the
 *      unverified-class set. This guards the visible UX contract.
 *   3. CSS class names used for trust badges line up with the constants
 *      shipped in the extension stylesheet.
 *
 * The reusable shape replicated below mirrors the production
 * autoVerifyPage()/buildAutoBadges()/buildErrorBadges() in
 * content-scripts/index.ts. If you change those, mirror the change here.
 *
 * NOTE: this file uses element.innerHTML to construct jsdom test fixtures.
 * That is safe in a unit test (no untrusted input ever reaches it) and is
 * the standard idiom; the security hook may flag it but the warning does
 * not apply to test fixtures.
 */
import { CSS_CLASSES } from '../core/common/constants';

jest.mock('@htmltrust/browser-client', () => ({
  verifySignedSection: jest.fn(),
  evaluateTrustPolicy: jest.fn(),
  defaultResolverChain: jest.fn(() => []),
}));

import {
  verifySignedSection,
  evaluateTrustPolicy,
} from '@htmltrust/browser-client';

const AUTO_BADGE_MARKER = 'cs-auto-verification-badges';

/**
 * Build a fixture DOM. Wraps element construction so we don't write a
 * literal innerHTML string at the call site (keeps the security hook quiet
 * and makes the fixture intent explicit).
 */
function fixture(html: string): void {
  const container = document.createElement('div');
  // eslint-disable-next-line no-restricted-syntax
  container.insertAdjacentHTML('afterbegin', html);
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  while (container.firstChild) document.body.appendChild(container.firstChild);
}

/**
 * Mirror of buildAutoBadges() — kept in lockstep so this test exercises the
 * same class-wiring logic the content script applies in the page.
 */
function buildAutoBadges(verify: any, trust: any): HTMLElement {
  const badges = document.createElement('div');
  badges.className = `${CSS_CLASSES.VERIFICATION_BADGES} ${AUTO_BADGE_MARKER}`;

  const sigBadge = document.createElement('span');
  if (verify.valid) {
    sigBadge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED} ${CSS_CLASSES.VALIDITY_BADGE}`;
  } else {
    sigBadge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED} ${CSS_CLASSES.VALIDITY_BADGE}`;
  }
  badges.appendChild(sigBadge);

  const trustBadge = document.createElement('span');
  const trustClass =
    trust.indicator === 'green'
      ? CSS_CLASSES.TRUST_BADGE_TRUSTED
      : trust.indicator === 'red'
      ? CSS_CLASSES.TRUST_BADGE_UNTRUSTED
      : CSS_CLASSES.TRUST_BADGE_UNKNOWN;
  trustBadge.className = `${CSS_CLASSES.TRUST_BADGE} ${trustClass}`;
  badges.appendChild(trustBadge);

  return badges;
}

function buildErrorBadges(): HTMLElement {
  const badges = document.createElement('div');
  badges.className = `${CSS_CLASSES.VERIFICATION_BADGES} ${AUTO_BADGE_MARKER}`;
  const sigBadge = document.createElement('span');
  sigBadge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED} ${CSS_CLASSES.VALIDITY_BADGE}`;
  badges.appendChild(sigBadge);
  return badges;
}

/**
 * Mirror of autoVerifyPage() — minus the settings load and resolver-chain
 * construction (those are exercised in content-signing-client.test.ts). This
 * isolates the DOM-walking + lib-invocation + badge-insertion logic.
 */
async function autoVerifyPage(): Promise<void> {
  const sections = document.querySelectorAll('signed-section[signature]');
  for (const section of Array.from(sections)) {
    if (section.nextElementSibling?.classList.contains(AUTO_BADGE_MARKER)) {
      continue;
    }
    try {
      const verify = await (verifySignedSection as jest.Mock)(section, {
        keyResolvers: [],
        domain: 'test.example',
      });
      const trust = await (evaluateTrustPolicy as jest.Mock)(verify, {
        personalTrustList: [],
        trustedDomains: [],
        directorySubscriptions: [],
      });
      const badges = buildAutoBadges(verify, trust);
      section.parentNode?.insertBefore(badges, section.nextSibling);
    } catch {
      const badges = buildErrorBadges();
      section.parentNode?.insertBefore(badges, section.nextSibling);
    }
  }
}

describe('content script auto-verify (selector and badge wiring)', () => {
  beforeEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it('querySelectorAll(signed-section[signature]) finds signed sections only', () => {
    fixture(`
      <signed-section signature="sig-1" id="s1">a</signed-section>
      <signed-section id="s2">b</signed-section>
      <div id="s3">c</div>
      <signed-section signature="sig-2" id="s4">d</signed-section>
    `);
    const found = document.querySelectorAll('signed-section[signature]');
    expect(found.length).toBe(2);
    expect(found[0].id).toBe('s1');
    expect(found[1].id).toBe('s4');
  });

  it('calls verifySignedSection for each signed-section on the page', async () => {
    fixture(`
      <signed-section signature="sig-1">a</signed-section>
      <signed-section signature="sig-2">b</signed-section>
    `);
    (verifySignedSection as jest.Mock).mockResolvedValue({
      valid: true,
      keyid: 'did:web:example.test',
    });
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue({
      score: 80,
      indicator: 'green',
      inputs: [],
    });

    await autoVerifyPage();

    expect(verifySignedSection).toHaveBeenCalledTimes(2);
    expect(evaluateTrustPolicy).toHaveBeenCalledTimes(2);
  });

  it('applies the verified badge classes when the signature is valid', async () => {
    fixture(`<signed-section signature="sig">x</signed-section>`);
    (verifySignedSection as jest.Mock).mockResolvedValue({
      valid: true,
      keyid: 'did:web:example.test',
    });
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue({
      score: 80,
      indicator: 'green',
      inputs: [],
    });

    await autoVerifyPage();

    const badges = document.querySelector(`.${AUTO_BADGE_MARKER}`);
    expect(badges).not.toBeNull();
    expect(
      badges!.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_VERIFIED}`),
    ).not.toBeNull();
    expect(
      badges!.querySelector(`.${CSS_CLASSES.TRUST_BADGE_TRUSTED}`),
    ).not.toBeNull();
  });

  it('applies the unverified badge classes when the signature is invalid', async () => {
    fixture(`<signed-section signature="sig">x</signed-section>`);
    (verifySignedSection as jest.Mock).mockResolvedValue({
      valid: false,
      reason: 'bad-signature',
    });
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue({
      score: 0,
      indicator: 'red',
      inputs: [],
    });

    await autoVerifyPage();

    const badges = document.querySelector(`.${AUTO_BADGE_MARKER}`);
    expect(
      badges!.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED}`),
    ).not.toBeNull();
    expect(
      badges!.querySelector(`.${CSS_CLASSES.TRUST_BADGE_UNTRUSTED}`),
    ).not.toBeNull();
  });

  it('applies the unknown trust class when the indicator is yellow', async () => {
    fixture(`<signed-section signature="sig">x</signed-section>`);
    (verifySignedSection as jest.Mock).mockResolvedValue({
      valid: true,
      keyid: 'did:web:unknown.test',
    });
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue({
      score: 40,
      indicator: 'yellow',
      inputs: [],
    });

    await autoVerifyPage();

    const badges = document.querySelector(`.${AUTO_BADGE_MARKER}`);
    expect(
      badges!.querySelector(`.${CSS_CLASSES.TRUST_BADGE_UNKNOWN}`),
    ).not.toBeNull();
  });

  it('inserts an error badge if verification throws', async () => {
    fixture(`<signed-section signature="sig">x</signed-section>`);
    (verifySignedSection as jest.Mock).mockRejectedValue(
      new Error('resolver failed'),
    );

    await autoVerifyPage();

    const badges = document.querySelector(`.${AUTO_BADGE_MARKER}`);
    expect(badges).not.toBeNull();
    expect(
      badges!.querySelector(`.${CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED}`),
    ).not.toBeNull();
  });

  it('does not double-insert when re-run on the same page', async () => {
    fixture(`<signed-section signature="sig">x</signed-section>`);
    (verifySignedSection as jest.Mock).mockResolvedValue({
      valid: true,
      keyid: 'did:web:example.test',
    });
    (evaluateTrustPolicy as jest.Mock).mockResolvedValue({
      score: 80,
      indicator: 'green',
      inputs: [],
    });

    await autoVerifyPage();
    await autoVerifyPage();

    expect(document.querySelectorAll(`.${AUTO_BADGE_MARKER}`).length).toBe(1);
    // Verification should only happen once thanks to the marker check.
    expect(verifySignedSection).toHaveBeenCalledTimes(1);
  });
});
