/**
 * Jest setup file
 */

// Mock browser APIs
Object.defineProperty(global, 'chrome', {
  value: {
    runtime: {
      sendMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      getURL: jest.fn((path) => `chrome-extension://mock-extension-id/${path}`),
      getManifest: jest.fn(() => ({
        version: '1.0.0',
      })),
      lastError: null,
      openOptionsPage: jest.fn(),
    },
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn(),
      },
    },
    tabs: {
      query: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
    scripting: {
      executeScript: jest.fn(),
      insertCSS: jest.fn(),
    },
    action: {
      setBadgeText: jest.fn(),
      setBadgeBackgroundColor: jest.fn(),
    },
    notifications: {
      create: jest.fn(),
    },
  },
});

// Mock WebAuthn API
Object.defineProperty(global, 'PublicKeyCredential', {
  value: {
    isUserVerifyingPlatformAuthenticatorAvailable: jest.fn().mockResolvedValue(true),
  },
});

// Mock fetch
global.fetch = jest.fn().mockImplementation(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    statusText: 'OK',
  })
);