import { normalizeText } from '@htmltrust/canonicalization';

export interface SigningExtraction {
  title: string;
  content: string;
}

/**
 * Extract the legacy page-signing input in the page context.
 *
 * This function is passed directly to chrome.scripting.executeScript, so its
 * body must remain self-contained and use only browser globals.
 */
export function extractSigningContent(): SigningExtraction {
  const selectors = ['article', 'main', '.content', '#content', '.article', '#article', '.post', '#post'];
  const root = selectors
    .map((selector) => document.querySelector(selector))
    .find((candidate): candidate is Element => candidate !== null) ?? document.body;
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll('img, script, style, noscript').forEach((element) => element.remove());
  clone.querySelectorAll('a').forEach((link) => {
    link.replaceWith(document.createTextNode(link.textContent ?? ''));
  });
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  for (let comment = walker.nextNode(); comment; comment = walker.nextNode()) {
    comments.push(comment as Comment);
  }
  comments.forEach((comment) => comment.remove());
  return { title: document.title, content: clone.textContent ?? '' };
}

/** Match the legacy ContentProcessor's normalized lowercase-hex SHA-256. */
export async function hashSigningContent(
  content: string,
  subtle: Pick<SubtleCrypto, 'digest'> = crypto.subtle,
): Promise<string> {
  const normalized = normalizeText(content);
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
