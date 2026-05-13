# HTMLTrust Browser Reference

Reference browser extension for client-side validation of HTMLTrust signed content. Verifies cryptographic signatures embedded in web pages using the `<signed-section>` element protocol.

This is a companion to the [HTMLTrust specification](https://github.com/HTMLTrust/htmltrust-spec).

## What It Does

When you visit a web page containing signed content, this extension:

- **Detects** `<signed-section>` elements carrying `signature`, `keyid`, `algorithm`, and `content-hash` attributes
- **Verifies** signatures by fetching the author's public key and validating the cryptographic signature
- **Displays** trust indicators (badges, outlines) showing verification status
- **Queries** optional trust directories for author reputation and endorsements
- **Enables** community trust/distrust voting on authors and content

## Architecture

The codebase is split into **shared** (reusable) and **browser-specific** layers:

```
src/
├── core/                 # ✅ SHARED — reusable across any browser
│   ├── api/              # REST clients for HTMLTrust trust directory server
│   ├── auth/             # Authentication service (API key management)
│   ├── common/           # Types, constants, utilities
│   ├── content/          # Content processor (DOM canonicalization, hashing, metadata extraction)
│   └── storage/          # Storage abstraction (interface + in-memory implementation)
├── platforms/            # 🔴 BROWSER-SPECIFIC — one adapter per browser
│   ├── common/           # PlatformAdapter interface (storage, messaging, tabs, scripting)
│   ├── chromium/         # Chrome / Edge implementation + Manifest V3
│   ├── firefox/          # Future — Manifest V2 (manifest only, no adapter yet)
│   └── safari/           # Future — Manifest V3 (manifest only, no adapter yet)
├── ui/                   # ✅ SHARED — React components for popup, options, and in-page UI
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

## Tech Stack

- **TypeScript** with strict mode
- **React 19** for UI components
- **Webpack 5** with per-browser build targets
- **Jest** + ts-jest for testing
- **js-sha256** + **simhash-js** for content hashing

## Quick Start

### Prerequisites

- Node.js 18+

### Build

```sh
git clone https://github.com/HTMLTrust/htmltrust-browser-reference.git
cd htmltrust-browser-reference
npm install
```

Build for a specific browser:

```sh
npm run build:chrome     # → build/chromium/
npm run build:firefox    # → build/firefox/
npm run build:safari     # → build/safari/
```

Or build all:

```sh
npm run build            # Builds all targets + creates zips
```

### Development

```sh
npm run dev:chrome       # Watch mode for Chromium
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `build/chromium/` folder

### Test

```sh
npm test                 # Run all tests
npm run test:coverage    # With coverage report
```

## Project Structure

```
├── docs/                 # Architecture and design documentation
├── scripts/              # Build and packaging scripts
├── src/                  # Source code (see Architecture above)
├── package.json
├── tsconfig.json
├── webpack.config.js
├── jest.config.js
└── .eslintrc.js
```

## Current Status

- ✅ Chromium adapter fully implemented
- ✅ Core content verification pipeline
- ✅ React popup and options UI
- ⬜ Firefox adapter (manifest only — needs `browser.*` API adapter)
- ⬜ Safari adapter (manifest only — needs adapter)

## Companion Repositories

| Repository | Description |
|---|---|
| [htmltrust-spec](https://github.com/HTMLTrust/htmltrust-spec) | The HTMLTrust specification and paper |
| [htmltrust-server-reference](https://github.com/HTMLTrust/htmltrust-server-reference) | Reference trust directory API server |
| [htmltrust-cms-reference](https://github.com/HTMLTrust/htmltrust-cms-reference) | Reference CMS plugin (WordPress) |
| [htmltrust-website](https://github.com/HTMLTrust/htmltrust-website) | Project website |

## License

MIT