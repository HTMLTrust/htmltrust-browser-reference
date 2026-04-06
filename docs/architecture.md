# Content Signing Browser Extension Architecture

This document outlines the architecture of the Content Signing browser extension, which enables users to sign and verify web content using WebAuthn.

## Overview

The Content Signing extension is designed with a modular architecture that separates core functionality from browser-specific implementations. This allows for code reuse across different browser platforms while maintaining platform-specific adaptations where necessary.

## Project Structure

```
content-signing-browsers/
├── build/                  # Output directory for built extensions
├── docs/                   # Project documentation
├── scripts/                # Build scripts, release scripts
├── src/
│   ├── core/               # Shared core logic (TypeScript)
│   │   ├── api/            # Trust directory API client (REST/JSON)
│   │   ├── auth/           # WebAuthn logic wrapper
│   │   ├── common/         # Utility functions, types, constants
│   │   ├── content/        # DOM normalization, Simhash logic
│   │   └── storage/        # Abstract storage interfaces
│   │
│   ├── ui/                 # Shared UI components
│   │   ├── components/     # Reusable UI elements
│   │   ├── popup/          # Popup specific UI code
│   │   └── options/        # Options page specific UI code
│   │
│   ├── background/         # Background script logic (entry point)
│   │   └── index.ts
│   │
│   ├── content-scripts/    # Content script logic (entry point)
│   │   └── index.ts
│   │
│   ├── assets/             # Icons, images, CSS shared across targets
│   │
│   └── platforms/          # Browser-specific code and manifests
│       ├── common/         # Common platform utilities
│       ├── chromium/       # Chrome, Edge, Brave specific files
│       ├── firefox/        # Firefox specific files
│       └── safari/         # Safari specific files
```

## Core Components

### Core Module

The `core` module contains shared logic that is browser-agnostic:

- **api**: Contains the Trust Directory API client for interacting with the remote trust directory service.
- **auth**: Provides WebAuthn authentication functionality.
- **common**: Contains shared types, utility functions, and constants.
- **content**: Handles DOM normalization and content hashing.
- **storage**: Defines abstract storage interfaces that are implemented by each browser platform.

### UI Module

The `ui` module contains shared UI components and browser action pages:

- **components**: Reusable UI components used across different pages.
- **popup**: The popup UI that appears when clicking the extension icon.
- **options**: The options page for configuring the extension.

### Background Script

The background script (`background/index.ts`) is the main entry point for the extension. It:

- Initializes the extension
- Manages the extension state
- Handles messages from content scripts and UI pages
- Interacts with the Trust Directory API
- Manages authentication state

### Content Scripts

Content scripts (`content-scripts/index.ts`) run in the context of web pages. They:

- Extract and normalize content from web pages
- Calculate content hashes
- Apply verification UI to web pages
- Communicate with the background script

### Platform Adapters

Platform adapters (`platforms/`) provide browser-specific implementations of common functionality:

- **common**: Defines interfaces that each platform adapter must implement.
- **chromium**: Implementation for Chromium-based browsers (Chrome, Edge, Brave).
- **firefox**: Implementation for Firefox.
- **safari**: Implementation for Safari.

## Communication Flow

1. **Content Detection**: Content scripts detect content on web pages and send it to the background script.
2. **Verification**: The background script verifies the content using the Trust Directory API.
3. **UI Updates**: The background script sends verification results back to content scripts, which update the UI accordingly.
4. **User Actions**: User actions in the popup or options pages are sent to the background script, which processes them and updates the state.

## Authentication Flow

1. **Registration**: Users register with WebAuthn, creating a public/private key pair.
2. **Authentication**: Users authenticate using WebAuthn, proving ownership of their private key.
3. **Signing**: Authenticated users can sign content, which is verified by the Trust Directory.

## Build Process

The build process uses webpack to bundle the extension for different browser platforms:

1. TypeScript files are compiled to JavaScript.
2. Assets are copied to the build directory.
3. Manifest files are processed for each target browser.
4. The extension is packaged into a ZIP file for distribution.

## Testing

The extension uses Jest for testing:

- Unit tests for core functionality.
- Integration tests for browser-specific functionality.
- End-to-end tests for user flows.