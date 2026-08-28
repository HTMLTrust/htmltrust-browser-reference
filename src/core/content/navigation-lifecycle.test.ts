import {
  captureNavigationSnapshot,
  mapSnapshotToLiveSections,
  mutationTouchesSignedSection,
  observeSignedSection,
  SIGNED_SECTION_SELECTOR,
} from './navigation-lifecycle';

describe('navigation lifecycle snapshots', () => {
  it('parses served HTML and freezes the navigation snapshot', () => {
    const snapshot = captureNavigationSnapshot(
      '<main><signed-section signature="a" keyid="k" algorithm="ed25519" content-hash="h"><p>source</p></signed-section></main>',
      'https://example.test/article',
      123,
    );

    expect(snapshot.sections).toHaveLength(1);
    expect(snapshot.sections[0].outerHTML).toContain('<p>source</p>');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.sections)).toBe(true);
    expect(Object.isFrozen(snapshot.sections[0])).toBe(true);
  });

  it('maps reordered live sections by signed identity rather than array position', () => {
    const source = captureNavigationSnapshot(
      '<signed-section signature="a" keyid="k" algorithm="ed25519" content-hash="ha">A</signed-section><signed-section signature="b" keyid="k" algorithm="ed25519" content-hash="hb">B</signed-section>',
      'https://example.test/',
    );
    document.body.innerHTML =
      '<signed-section signature="b" keyid="k" algorithm="ed25519" content-hash="hb">B changed</signed-section><signed-section signature="a" keyid="k" algorithm="ed25519" content-hash="ha">A changed</signed-section>';
    const live = Array.from(document.querySelectorAll(SIGNED_SECTION_SELECTOR));

    const result = mapSnapshotToLiveSections(source, live);

    expect(result.complete).toBe(true);
    expect(result.matches.map((match) => match.source.index)).toEqual([1, 0]);
    expect(result.matches.map((match) => match.live.textContent)).toEqual(['B changed', 'A changed']);
  });

  it('marks a missing or added live section as an incomplete mapping', () => {
    const source = captureNavigationSnapshot(
      '<signed-section signature="a">A</signed-section>',
      'https://example.test/',
    );
    document.body.innerHTML = '<signed-section signature="different">A</signed-section>';

    const result = mapSnapshotToLiveSections(source, Array.from(document.querySelectorAll(SIGNED_SECTION_SELECTOR)));

    expect(result.complete).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('does not use a positional match when a signed identity is absent', () => {
    const source = captureNavigationSnapshot(
      '<signed-section signature="a">A</signed-section><signed-section signature="b">B</signed-section>',
      'https://example.test/',
    );
    document.body.innerHTML =
      '<signed-section signature="b">B</signed-section><signed-section signature="c">C</signed-section>';

    const live = Array.from(document.querySelectorAll(SIGNED_SECTION_SELECTOR));
    const result = mapSnapshotToLiveSections(source, live);

    expect(result.complete).toBe(false);
    expect(result.matches.map((match) => match.source.identity)).toEqual([
      source.sections[1].identity,
    ]);
    expect(result.matches[0].live).toBe(live[0]);
  });
});

describe('signed-section mutation invalidation', () => {
  it('recognizes content and signed-attribute mutations', () => {
    document.body.innerHTML = '<signed-section signature="a"><span>text</span></signed-section><div id="indicator"></div>';
    const section = document.querySelector('signed-section')!;
    const child = section.querySelector('span')!;

    expect(mutationTouchesSignedSection({ type: 'characterData', target: child.firstChild } as unknown as MutationRecord, section)).toBe(true);
    expect(mutationTouchesSignedSection({ type: 'attributes', target: section, attributeName: 'signature' } as unknown as MutationRecord, section)).toBe(true);
    expect(mutationTouchesSignedSection({ type: 'childList', target: section, addedNodes: [], removedNodes: [] } as unknown as MutationRecord, section)).toBe(true);
    expect(mutationTouchesSignedSection({ type: 'attributes', target: document.querySelector('#indicator')! } as unknown as MutationRecord, section)).toBe(false);
  });

  it('notifies after a mutation and ignores sibling indicators', async () => {
    document.body.innerHTML = '<signed-section signature="a">text</signed-section><div id="indicator"></div>';
    const section = document.querySelector('signed-section')!;
    const indicator = document.querySelector('#indicator')!;
    const callback = jest.fn();
    const disconnect = observeSignedSection(section, callback);

    section.textContent = 'changed';
    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledWith(section);

    callback.mockClear();
    indicator.textContent = 'trusted';
    await Promise.resolve();
    await Promise.resolve();
    expect(callback).not.toHaveBeenCalled();
    disconnect();
  });
});
