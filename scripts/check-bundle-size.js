const fs = require('fs');
const path = require('path');

const KIB = 1024;
const BUNDLE_BUDGETS = Object.freeze({
  'background.js': 244 * KIB,
  'content.js': 244 * KIB,
  'popup.js': 215 * KIB,
  'options.js': 230 * KIB,
});

function validateBundleAssets(assets) {
  const errors = [];
  for (const [name, budget] of Object.entries(BUNDLE_BUDGETS)) {
    const size = assets[name];
    if (size === undefined) {
      errors.push(`missing required bundle: ${name}`);
    } else if (size > budget) {
      errors.push(`${name} is ${size} bytes; budget is ${budget} bytes`);
    }
  }
  for (const name of Object.keys(assets)) {
    if (name.endsWith('.js') && !(name in BUNDLE_BUDGETS)) {
      errors.push(`unlisted JavaScript bundle: ${name}`);
    }
  }
  return errors;
}

function checkBundleDirectory(directory) {
  const assets = Object.fromEntries(
    fs.readdirSync(directory)
      .filter((name) => name.endsWith('.js'))
      .map((name) => [name, fs.statSync(path.join(directory, name)).size]),
  );
  const errors = validateBundleAssets(assets);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return assets;
}

if (require.main === module) {
  const browser = process.argv[2];
  if (!browser) {
    console.error('Usage: node scripts/check-bundle-size.js <browser>');
    process.exit(2);
  }
  const directory = path.resolve(__dirname, '..', 'build', browser);
  try {
    const assets = checkBundleDirectory(directory);
    const summary = Object.entries(assets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, size]) => `${name}=${size}`)
      .join(', ');
    console.log(`Bundle budgets passed for ${browser}: ${summary}`);
  } catch (error) {
    console.error(`Bundle budget failed for ${browser}:\n${error.message}`);
    process.exit(1);
  }
}

module.exports = { BUNDLE_BUDGETS, checkBundleDirectory, validateBundleAssets };
