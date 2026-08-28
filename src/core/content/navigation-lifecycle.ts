/**
 * Navigation-scoped source snapshots for signed sections.
 *
 * A live page is mutable. Verification input must therefore come from the
 * bytes captured for the navigation, while the live element is used only to
 * compare what the reader currently sees and to anchor UI. DOMParser gives us
 * the browser's HTML parsing rules before we pair source sections with live
 * elements.
 */

/** Every signed-section is inspected, including malformed ones. */
export const SIGNED_SECTION_SELECTOR = 'signed-section';

const IDENTITY_ATTRIBUTES = [
  'profile',
  'signature-scope',
  'signature',
  'keyid',
  'algorithm',
  'content-hash',
] as const;

export interface SignedSectionSnapshot {
  readonly index: number;
  readonly identity: string;
  /** Exact source slice from the response body, never DOM outerHTML. */
  readonly sourceHTML: string;
  readonly outerHTML: string;
}

// Keep parser nodes out of the public/frozen snapshot records. The weak map
// still lets the content script verify the exact parser tree without
// serializing nested sections and reparsing them through a different path.
const sourceElements = new WeakMap<SignedSectionSnapshot, Element>();

/** Extract balanced source slices without letting DOMParser rewrite them. */
export function extractRawSignedSections(html: string): string[] {
  const found: Array<{ start: number; end: number }> = [];
  const openSections: number[] = [];
  const rawElements = new Set(['script', 'style', 'textarea', 'title', 'iframe']);
  let scan = 0;
  let rawName: string | null = null;

  const tagEnd = (start: number): number => {
    let quote = '';
    for (let index = start + 1; index < html.length; index++) {
      const character = html[index];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        return index + 1;
      }
    }
    return -1;
  };

  while (scan < html.length) {
    const start = html.indexOf('<', scan);
    if (start < 0) break;
    if (rawName) {
      if (!new RegExp(`^</\\s*${rawName}\\b`, 'i').test(html.slice(start))) {
        scan = start + 1;
        continue;
      }
    }
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) break;
      scan = end + 3;
      continue;
    }
    const end = tagEnd(start);
    if (end < 0) break;
    const token = html.slice(start, end);
    if (/^<!/.test(token)) {
      scan = end;
      continue;
    }
    const names = /^<\/\s*([a-z][a-z0-9-]*)|^<\s*([a-z][a-z0-9-]*)/i.exec(token);
    if (!names) {
      scan = end;
      continue;
    }
    const name = (names[1] ?? names[2]).toLowerCase();
    const closing = /^<\//.test(token);
    if (rawName) {
      rawName = null;
    } else if (closing && name === 'signed-section') {
      const sectionStart = openSections.pop();
      if (sectionStart !== undefined) found.push({ start: sectionStart, end });
    } else if (!closing && name === 'signed-section' && !/\/\s*>$/.test(token)) {
      openSections.push(start);
    } else if (!closing && rawElements.has(name) && !/\/\s*>$/.test(token)) {
      rawName = name;
    }
    scan = end;
  }
  return found
    .sort((left, right) => left.start - right.start)
    .map(({ start, end }) => html.slice(start, end));
}

export interface NavigationSnapshot {
  readonly url: string;
  readonly origin: string;
  /** HTML document base URL computed from the accepted source response. */
  readonly baseUrl: string;
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
 * The returned records are immutable. Parser-owned source nodes remain private
 * behind sourceElementForSnapshot, so callers cannot replace the verification
 * input with a later DOM serialization or a live page node.
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
  const sourceSlices = extractRawSignedSections(html);
  const baseElement = parsed.querySelector('base[href]');
  let baseUrl = url;
  if (baseElement) {
    try {
      baseUrl = new URL(baseElement.getAttribute('href') ?? '', url).href;
    } catch {
      // The canonicalizer will reject an unsafe/invalid signed URL. Keep the
      // response URL here so capture itself remains a pure snapshot operation.
      baseUrl = url;
    }
  }
  const sections = Array.from(parsed.querySelectorAll(SIGNED_SECTION_SELECTOR)).map(
    (section, index): SignedSectionSnapshot => {
      const snapshot = {
        index,
        identity: sectionIdentity(section),
        sourceHTML: sourceSlices[index] ?? '',
        outerHTML: section.outerHTML,
      };
      const frozen = Object.freeze(snapshot);
      sourceElements.set(frozen, section);
      return frozen;
    },
  );

  return Object.freeze({
    url,
    origin: new URL(url).origin,
    baseUrl,
    capturedAt,
    sections: Object.freeze(sections),
  });
}

/** Retrieve the parser-owned source element for internal verification. */
export function sourceElementForSnapshot(snapshot: SignedSectionSnapshot): Element | null {
  return sourceElements.get(snapshot) ?? null;
}

/** Retrieve the exact source slice captured for a snapshot section. */
export function sourceHTMLForSnapshot(snapshot: SignedSectionSnapshot): string | null {
  return snapshot.sourceHTML || null;
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

/** Find the outermost signed ancestor, so markers remain outside nesting. */
export function outermostSignedSection(section: Element): Element {
  let anchor = section;
  while (anchor.parentElement?.matches(SIGNED_SECTION_SELECTOR)) anchor = anchor.parentElement;
  return anchor;
}

/** Return the current document base URL, including an applicable <base>. */
export function documentBaseUrl(document: Document, fallbackUrl: string): string {
  const base = document.querySelector('base[href]');
  if (!base) return fallbackUrl;
  try {
    return new URL(base.getAttribute('href') ?? '', fallbackUrl).href;
  } catch {
    return fallbackUrl;
  }
}

/** A mutation that can change the base URL used for signed URL attributes. */
export function mutationTouchesDocumentBase(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') {
    return mutation.target instanceof Element &&
      mutation.target.localName.toLowerCase() === 'base' &&
      mutation.attributeName === 'href';
  }
  if (mutation.type === 'childList') {
    const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return nodes.some((node) =>
      node instanceof Element &&
      (node.localName.toLowerCase() === 'base' || node.querySelector('base[href]') !== null),
    );
  }
  return false;
}

/** Observe document-level <base href> changes without observing extension UI. */
export function observeDocumentBase(
  document: Document,
  onInvalidated: () => void,
): () => void {
  const root = document.documentElement;
  if (!root) return () => undefined;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutationTouchesDocumentBase)) onInvalidated();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['href'], childList: true, subtree: true });
  return () => observer.disconnect();
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
