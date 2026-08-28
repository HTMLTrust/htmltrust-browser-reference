/**
 * Navigation-scoped source snapshots for signed sections.
 *
 * A live page is mutable. Verification input must therefore come from the
 * bytes captured for the navigation, while the live element is used only to
 * compare what the reader currently sees and to anchor UI. DOMParser gives us
 * the browser's HTML parsing rules before we pair source sections with live
 * elements.
 */

export const SIGNED_SECTION_SELECTOR = 'signed-section[signature]';

const IDENTITY_ATTRIBUTES = [
  'signature',
  'keyid',
  'algorithm',
  'content-hash',
] as const;

export interface SignedSectionSnapshot {
  readonly index: number;
  readonly identity: string;
  readonly outerHTML: string;
}

export interface NavigationSnapshot {
  readonly url: string;
  readonly origin: string;
  readonly capturedAt: number;
  readonly sections: readonly SignedSectionSnapshot[];
}

export interface SnapshotSectionMatch {
  readonly source: SignedSectionSnapshot;
  readonly live: Element;
}

/**
 * Capture signed sections from the post-load, same-URL response snapshot.
 *
 * The returned values are deeply immutable from the caller's perspective.
 * The raw response is deliberately not retained, which limits accidental use
 * of mutable strings or a later DOM serialization as verification input.
 */
export function captureNavigationSnapshot(
  html: string,
  url: string,
  capturedAt = Date.now(),
): NavigationSnapshot {
  if (typeof html !== 'string') throw new TypeError('navigation snapshot expects HTML text');
  if (typeof url !== 'string' || url.length === 0) {
    throw new TypeError('navigation snapshot expects a URL');
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const sections = Array.from(parsed.querySelectorAll(SIGNED_SECTION_SELECTOR)).map(
    (section, index): SignedSectionSnapshot => {
      const snapshot = {
        index,
        identity: sectionIdentity(section),
        outerHTML: section.outerHTML,
      };
      return Object.freeze(snapshot);
    },
  );

  return Object.freeze({
    url,
    origin: new URL(url).origin,
    capturedAt,
    sections: Object.freeze(sections),
  });
}

/**
 * Pair source sections with their current live counterparts.
 *
 * Pairing uses the signed attributes, with document order resolving duplicate
 * identities. This handles SPA reordering without silently verifying the
 * source for a different signature. A missing or extra section is reported by
 * the `complete` flag so callers can invalidate the whole navigation view.
 */
export function mapSnapshotToLiveSections(
  snapshot: NavigationSnapshot,
  liveSections: readonly Element[],
): { readonly matches: readonly SnapshotSectionMatch[]; readonly complete: boolean } {
  const byIdentity = new Map<string, SignedSectionSnapshot[]>();
  for (const source of snapshot.sections) {
    const queue = byIdentity.get(source.identity) ?? [];
    queue.push(source);
    byIdentity.set(source.identity, queue);
  }

  const matches: SnapshotSectionMatch[] = [];
  for (const live of liveSections) {
    const queue = byIdentity.get(sectionIdentity(live));
    const source = queue?.shift();
    if (source) matches.push(Object.freeze({ source, live }));
  }

  return Object.freeze({
    matches: Object.freeze(matches),
    complete: matches.length === snapshot.sections.length && matches.length === liveSections.length,
  });
}

/** Return a stable identity for a signed-section's signature-bearing fields. */
export function sectionIdentity(section: Element): string {
  return IDENTITY_ATTRIBUTES
    .map((name) => `${name}=${section.getAttribute(name) ?? ''}`)
    .join('\u001f');
}

/**
 * Return true when a mutation can change the signed input for a section.
 * Extension indicators are siblings of the section, so their mutations never
 * reach this predicate.
 */
export function mutationTouchesSignedSection(mutation: MutationRecord, section: Element): boolean {
  if (mutation.type === 'attributes') return mutation.target === section || section.contains(mutation.target);
  if (mutation.type === 'characterData') return section.contains(mutation.target);
  if (mutation.type === 'childList') {
    return mutation.target === section || section.contains(mutation.target);
  }
  return false;
}

/**
 * Observe a live signed section and call `onInvalidated` once per microtask.
 * The observer watches the section itself only. The caller owns the returned
 * disconnect function and should call it when a navigation is replaced.
 */
export function observeSignedSection(
  section: Element,
  onInvalidated: (section: Element) => void,
): () => void {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutationTouchesSignedSection(mutation, section))) {
      onInvalidated(section);
    }
  });
  observer.observe(section, {
    attributes: true,
    attributeOldValue: false,
    characterData: true,
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}
