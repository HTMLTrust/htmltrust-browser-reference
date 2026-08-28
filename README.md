# HTMLTrust Browser Reference

Reference browser extension for validating HTMLTrust `<signed-section>` elements in a browser.

The extension verifies signatures locally, shows a status marker beside each signed section, and exposes details in the popup. It is a companion to the [HTMLTrust specification](https://github.com/HTMLTrust/htmltrust-spec).

## Start here

Readers: contributors and implementers. The normal workflow is:

1. Build the sibling browser-client package.
2. Install this repository.
3. Run tests and type checking.
4. Build the extension for the browser you use.

After each page load or same-document navigation, the content script refetches the current HTTPS URL (using the browser HTTP cache when available). It parses that response with the browser's HTML parser and freezes signed-section snapshots. It verifies those snapshots, then compares each one with the current live element. If page code changes a signed element, the extension marks it as stale and re-verifies it. A refetch can differ from the original response on personalized, time-varying, or service-worker-controlled pages. Status markers are siblings of `<signed-section>`, so extension UI cannot become signed content.

## Quick start

### Prerequisites

- Node.js 22 or newer
- npm
- Chromium, Firefox, or Safari for loading a built extension

Use this checkout layout. The browser-reference package has a local dependency on the browser-client package during development:

```
htmltrust-workspace/
├── htmltrust-browser-client/
└── htmltrust-browser-reference/
```

Create both checkouts and build the client first:

```sh
mkdir htmltrust-workspace
cd htmltrust-workspace
git clone https://github.com/HTMLTrust/htmltrust-browser-client.git
git clone https://github.com/HTMLTrust/htmltrust-browser-reference.git
cd htmltrust-browser-client
npm ci --ignore-scripts
npm run build
cd ../htmltrust-browser-reference
npm ci --ignore-scripts
```

The reference repository CI pins the client to commit `09e8c7552c8111a2cedd83fa45f4ffe3811bf5ca`. Check out that revision when reproducing CI exactly.

### Test and type-check

```sh
npm test -- --runInBand
npm run typecheck
npm run lint
```

Tests use jsdom for DOM behavior. Run the complete check in a Node 22
container with:

```sh
./scripts/test-in-docker.sh
```

The script copies both sibling repositories into the container, builds the
browser client, runs 60 extension tests, checks types and lint, then builds the
Chromium, Firefox, and Safari packages. Generated files stay outside the
checkout.

### Build

Build one browser with `npm run build:chromium`, `npm run build:firefox`, or `npm run build:safari`. Build all targets and zip archives with:

```sh
npm run build:all
```

The unpacked extension is written to `build/<browser>/`. For Chromium, open `chrome://extensions/`, enable Developer mode, choose **Load unpacked**, and select `build/chromium/`.

### Development

```sh
npm run dev:chromium
```

Use the matching `dev:firefox` or `dev:safari` command for another target. Reload the unpacked extension after a rebuild.

## Verification lifecycle

`src/core/content/navigation-lifecycle.ts` owns navigation state:

- `captureNavigationSnapshot` parses refetched HTML and freezes source sections.
- `mapSnapshotToLiveSections` pairs source sections with live elements by signed attributes, so page reordering does not pair one signature with another.
- `observeSignedSection` watches only the live signed element. Mutations trigger re-verification against the immutable source section. History changes and replacement of signed sections trigger a fresh page refetch.
- The content script inserts markers beside the signed element. The marker, tooltip, and vote controls are outside signed content.

The popup receives copied result records. It cannot mutate the content script's verification cache.

## Architecture

The codebase is split into **shared** (reusable) and **browser-specific** layers:

```
src/
├── core/                 # Shared code used by every browser
│   ├── api/              # REST clients for HTMLTrust trust directory server
│   ├── auth/             # Authentication service (API key management)
│   ├── common/           # Types, constants, utilities
│   ├── content/          # Content processor (DOM canonicalization, hashing, metadata extraction)
│   └── storage/          # Storage abstraction (interface + in-memory implementation)
├── platforms/            # One adapter per browser
│   ├── common/           # PlatformAdapter interface (storage, messaging, tabs, scripting)
│   ├── chromium/         # Chrome / Edge implementation + Manifest V3
│   ├── firefox/          # Future, Manifest V2 (manifest only, no adapter yet)
│   └── safari/           # Future, Manifest V3 (manifest only, no adapter yet)
├── ui/                   # Shared popup, options, and in-page React UI
│   ├── components/       # Reusable widgets (Button, MetadataInput, ProfileManager, etc.)
│   ├── popup/            # Extension popup (verification status, signing controls)
│   └── options/          # Extension options page (settings, profiles, server config)
├── background/           # Service worker entry point
├── content-scripts/      # Content script entry point
└── assets/               # Icons, CSS
```

### Adding a New Browser

1. Create `src/platforms/<browser>/adapter.ts` implementing the `PlatformAdapter` interface
2. Create `src/platforms/<browser>/manifest.json` for that browser
3. Update `webpack.config.js` to add the new target
4. The shared `core/`, `ui/`, `background/`, and `content-scripts/` code works unchanged

## Tech stack

- **TypeScript** with strict mode
- **React 19** for UI components
- **Webpack 5** with per-browser build targets
- **Jest** + ts-jest for testing
- **js-sha256** + **simhash-js** for content hashing

## Project Structure

```
├── docs/                 # Architecture and design documentation
├── scripts/              # Build and packaging scripts
├── src/                  # Source code (see Architecture above)
├── package.json
├── tsconfig.json
├── webpack.config.js
├── jest.config.js
└── eslint.config.js
```

## Current Status

- Complete: Chromium adapter, core verification, popup, and options UI
- Complete: navigation snapshots and mutation re-verification
- Pending: Firefox `browser.*` API adapter; the manifest exists
- Pending: Safari adapter; the manifest exists

## Companion Repositories

| Repository | Description |
|---|---|
| [htmltrust-spec](https://github.com/HTMLTrust/htmltrust-spec) | The HTMLTrust specification and paper |
| [htmltrust-server-reference](https://github.com/HTMLTrust/htmltrust-server-reference) | Reference trust directory API server |
| [htmltrust-cms-reference](https://github.com/HTMLTrust/htmltrust-cms-reference) | Reference CMS plugin (WordPress) |
| [htmltrust-website](https://github.com/HTMLTrust/htmltrust-website) | Project website |

## License


This project is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). You may use, modify, and share the software for any noncommercial purpose with attribution. Commercial use requires a separate agreement with the licensor.

## Origin and contributions

Jason Grey began HTMLTrust in 2024 and reviews the protocol and reference
implementations. AI tools have supported research, drafting, and pair
programming throughout the project.

Contributions are welcome. Open a pull request with the tests or conformance
vectors that demonstrate the change. Keep repository discussion focused on
the protocol and implementation behavior.

If this work is useful to you and you'd like to support it, see [GitHub Sponsors](https://github.com/sponsors/jt55401) or the other channels in [`.github/FUNDING.yml`](.github/FUNDING.yml).
