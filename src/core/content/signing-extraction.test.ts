import { webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder } from 'node:util';

jest.mock('@htmltrust/canonicalization', () => ({
  normalizeText: jest.fn((value: string) => value.trim()),
}));

import { normalizeText } from '@htmltrust/canonicalization';
import { extractSigningContent, hashSigningContent } from './signing-extraction';

describe('page signing extraction', () => {
  it('extracts article text without active, image, link, or comment markup', () => {
    document.title = 'Signing example';
    document.body.innerHTML = `
      <nav>outside</nav>
      <article>Hello <a href="https://example.test">linked world</a>
        <img src="pixel.png" alt="ignored"><script>ignored()</script><!-- ignored -->
      </article>`;

    expect(extractSigningContent()).toEqual({
      title: 'Signing example',
      content: expect.stringContaining('Hello linked world'),
    });
    expect(extractSigningContent().content).not.toContain('outside');
    expect(extractSigningContent().content).not.toContain('ignored');
  });

  it('normalizes text and returns the legacy lowercase SHA-256 form', async () => {
    const originalTextEncoder = globalThis.TextEncoder;
    Object.defineProperty(globalThis, 'TextEncoder', { value: NodeTextEncoder, configurable: true });
    try {
      await expect(hashSigningContent(' abc ', webcrypto.subtle)).resolves.toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(normalizeText).toHaveBeenCalledWith(' abc ');
    } finally {
      Object.defineProperty(globalThis, 'TextEncoder', { value: originalTextEncoder, configurable: true });
    }
  });
});
