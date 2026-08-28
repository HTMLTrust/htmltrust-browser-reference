import { ChromiumAdapter } from './adapter';
import { MessageContext } from '../common';

describe('ChromiumAdapter message routing', () => {
  const originalRuntimeId = chrome.runtime.id;

  beforeEach(() => {
    Object.defineProperty(chrome.runtime, 'id', {
      configurable: true,
      value: 'mock-extension-id',
    });
    (chrome.runtime.onMessage.addListener as jest.Mock).mockClear();
  });

  afterAll(() => {
    Object.defineProperty(chrome.runtime, 'id', {
      configurable: true,
      value: originalRuntimeId,
    });
  });

  it('routes a tab message to content even when it spoofs popup context', async () => {
    const content = jest.fn().mockResolvedValue('content');
    const popup = jest.fn().mockResolvedValue('popup');
    const adapter = new ChromiumAdapter();
    adapter.registerMessageListeners({
      [MessageContext.CONTENT]: content,
      [MessageContext.POPUP]: popup,
    });

    const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
    listener(
      { type: 'SIGN_OUT', context: MessageContext.POPUP },
      { id: 'mock-extension-id', url: 'https://example.test', tab: { id: 1 } },
      jest.fn(),
    );
    await Promise.resolve();

    expect(content).toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();
  });

  it('preserves popup and options routes for same-extension pages', async () => {
    const popup = jest.fn().mockResolvedValue('popup');
    const options = jest.fn().mockResolvedValue('options');
    const content = jest.fn().mockResolvedValue('content');
    const adapter = new ChromiumAdapter();
    adapter.registerMessageListeners({
      [MessageContext.POPUP]: popup,
      [MessageContext.OPTIONS]: options,
      [MessageContext.CONTENT]: content,
    });
    const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

    listener(
      { type: 'SIGN_OUT', context: MessageContext.POPUP },
      { id: 'mock-extension-id', url: 'chrome-extension://mock-extension-id/popup.html' },
      jest.fn(),
    );
    listener(
      { type: 'UPDATE_SETTINGS', context: MessageContext.OPTIONS },
      { id: 'mock-extension-id', url: 'chrome-extension://mock-extension-id/options.html', tab: { id: 1 } },
      jest.fn(),
    );
    await Promise.resolve();

    expect(popup).toHaveBeenCalled();
    expect(options).toHaveBeenCalled();
    expect(content).not.toHaveBeenCalled();
  });

  it('does not trust a context claim from another extension page', async () => {
    const background = jest.fn().mockResolvedValue('background');
    const popup = jest.fn().mockResolvedValue('popup');
    const adapter = new ChromiumAdapter();
    adapter.registerMessageListeners({
      [MessageContext.BACKGROUND]: background,
      [MessageContext.POPUP]: popup,
    });
    const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

    listener(
      { type: 'SIGN_OUT', context: MessageContext.POPUP },
      { id: 'mock-extension-id', url: 'chrome-extension://mock-extension-id/background.html' },
      jest.fn(),
    );
    await Promise.resolve();

    expect(background).toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();
  });
});
