type BundleBudgetModule = {
  BUNDLE_BUDGETS: Readonly<Record<string, number>>;
  validateBundleAssets(assets: Record<string, number>): string[];
};

const { BUNDLE_BUDGETS, validateBundleAssets } = require('../../scripts/check-bundle-size.js') as BundleBudgetModule;

const withinBudget = (): Record<string, number> => Object.fromEntries(
  Object.entries(BUNDLE_BUDGETS).map(([name, budget]) => [name, budget]),
);

describe('bundle budget gate', () => {
  it('accepts the four expected entry bundles at their exact budgets', () => {
    expect(validateBundleAssets(withinBudget())).toEqual([]);
  });

  it('rejects a missing or oversized entry bundle', () => {
    const assets = withinBudget();
    delete assets['content.js'];
    assets['background.js'] = BUNDLE_BUDGETS['background.js'] + 1;

    expect(validateBundleAssets(assets)).toEqual(expect.arrayContaining([
      'missing required bundle: content.js',
      expect.stringContaining('background.js is'),
    ]));
  });

  it('rejects an unlisted JavaScript chunk', () => {
    expect(validateBundleAssets({ ...withinBudget(), 'vendors.js': 1 })).toContain(
      'unlisted JavaScript bundle: vendors.js',
    );
  });
});
