/**
 * Chromium platform adapter implementation
 */
import {
  PlatformAdapter,
  MessageContext,
  MessageHandlers,
  Tab,
  NotificationOptions,
  ExtensionMessage,
  isExtensionMessage,
} from '../common/platform-adapter';
import { StorageInterface, BaseStorage } from '../../core/storage';

/**
 * Chromium storage implementation
 */
class ChromiumStorage extends BaseStorage {
  /**
   * Get a value from storage
   * @param key The key to get
   * @returns A promise that resolves with the value, or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] || null);
      });
    });
  }

  /**
   * Set a value in storage
   * @param key The key to set
   * @param value The value to set
   * @returns A promise that resolves when the operation is complete
   */
  async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  /**
   * Remove a value from storage
   * @param key The key to remove
   * @returns A promise that resolves when the operation is complete
   */
  async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => {
        resolve();
      });
    });
  }

  /**
   * Clear all values from storage
   * @returns A promise that resolves when the operation is complete
   */
  async clear(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve();
      });
    });
  }

  /**
   * Get all keys in storage
   * @returns A promise that resolves with an array of keys
   */
  async getAllKeys(): Promise<string[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve(Object.keys(items));
      });
    });
  }
}

function trustedExtensionPageContext(sender: chrome.runtime.MessageSender): MessageContext | undefined {
  if (!sender.id || sender.id !== chrome.runtime.id || typeof sender.url !== 'string') return undefined;
  try {
    const url = new URL(sender.url);
    if (url.protocol !== 'chrome-extension:' || url.hostname !== chrome.runtime.id) return undefined;
    if (url.pathname === '/popup.html') return MessageContext.POPUP;
    if (url.pathname === '/options.html') return MessageContext.OPTIONS;
    return undefined;
  } catch {
    return undefined;
  }
}

function resolveMessageContext(
  _message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): MessageContext {
  const extensionPageContext = trustedExtensionPageContext(sender);
  if (extensionPageContext) return extensionPageContext;
  if (sender.tab) return MessageContext.CONTENT;
  return MessageContext.BACKGROUND;
}

/**
 * Chromium platform adapter implementation
 */
export class ChromiumAdapter implements PlatformAdapter {
  private storage: ChromiumStorage;

  /**
   * Create a new Chromium platform adapter
   */
  constructor() {
    this.storage = new ChromiumStorage();
  }

  /**
   * Get the name of the platform
   * @returns The platform name
   */
  getPlatformName(): string {
    return 'Chromium';
  }

  /**
   * Get the version of the platform
   * @returns The platform version
   */
  getPlatformVersion(): string {
    return navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || '';
  }

  /**
   * Get the storage interface for the platform
   * @returns The storage interface
   */
  getStorage(): StorageInterface {
    return this.storage;
  }

  /**
   * Register message listeners for the platform
   * @param handlers The message handlers
   */
  registerMessageListeners(handlers: MessageHandlers): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isExtensionMessage(message)) {
        sendResponse({ error: 'Invalid extension message' });
        return false;
      }
      // Route privileged extension pages from browser-provided sender data.
      // The message's context field is only transport metadata and never
      // grants access to popup or options handlers.
      const context = resolveMessageContext(message, sender);

      // Get the handler for the context
      const handler = handlers[context];
      if (!handler) {
        sendResponse({ error: `No handler for context: ${context}` });
        return false;
      }

      // Handle the message
      handler(message)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({ error: error instanceof Error ? error.message : 'Message handler failed' });
        });

      // Return true to indicate that the response will be sent asynchronously
      return true;
    });
  }

  /**
   * Send a message to a specific context
   * @param context The context to send the message to
   * @param message The message to send
   * @returns A promise that resolves with the response
   */
  async sendMessage<T = unknown>(context: MessageContext, message: ExtensionMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      // Add the context to the message
      const messageWithContext = {
        ...message,
        context,
      };

      // Send the message
      chrome.runtime.sendMessage(messageWithContext, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (
          response &&
          typeof response === 'object' &&
          typeof (response as Record<string, unknown>).error === 'string'
        ) {
          reject(new Error((response as Record<string, string>).error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Get the current tab
   * @returns A promise that resolves with the current tab
   */
  async getCurrentTab(): Promise<Tab> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (tabs.length === 0) {
          reject(new Error('No active tab found'));
        } else {
          resolve(this.mapChromeTab(tabs[0]));
        }
      });
    });
  }

  /**
   * Get all tabs
   * @returns A promise that resolves with all tabs
   */
  async getAllTabs(): Promise<Tab[]> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(tabs.map(this.mapChromeTab));
        }
      });
    });
  }

  /**
   * Create a new tab
   * @param url The URL to open in the new tab
   * @returns A promise that resolves with the new tab
   */
  async createTab(url: string): Promise<Tab> {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(this.mapChromeTab(tab));
        }
      });
    });
  }

  /**
   * Update a tab
   * @param tabId The ID of the tab to update
   * @param properties The properties to update
   * @returns A promise that resolves with the updated tab
   */
  async updateTab(tabId: string, properties: Partial<Tab>): Promise<Tab> {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(parseInt(tabId, 10), {
        url: properties.url,
        active: properties.active,
      }, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!tab) {
          reject(new Error(`Tab with ID ${tabId} not found`));
        } else {
          resolve(this.mapChromeTab(tab));
        }
      });
    });
  }

  /**
   * Close a tab
   * @param tabId The ID of the tab to close
   * @returns A promise that resolves when the tab is closed
   */
  async closeTab(tabId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.remove(parseInt(tabId, 10), () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Execute a fixed script body in a tab.
   *
   * `script` is compiled with `new Function`, so it must be a compile-time
   * constant. Anything carrying runtime data belongs in executeFunction().
   *
   * @param tabId The ID of the tab to execute the script in
   * @param script The script to execute
   * @returns A promise that resolves with the result of the script
   */
  async executeScript<T = unknown>(tabId: string, script: string): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: parseInt(tabId, 10) },
        func: new Function(script) as () => void,
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!results || results.length === 0) {
          reject(new Error('Script execution failed'));
        } else {
          resolve(results[0].result as T);
        }
      });
    });
  }

  /**
   * Execute a function in a tab with structured-cloned arguments.
   *
   * `args` is transferred as data by chrome.scripting, so values taken from a
   * network response cannot escape into the injected code.
   *
   * @param tabId The ID of the tab to execute the function in
   * @param func The function to execute in the page
   * @param args Structured-cloneable arguments passed to `func`
   * @returns A promise that resolves with the return value of `func`
   */
  async executeFunction<Args extends unknown[], R>(
    tabId: string,
    func: (...args: Args) => R,
    args: Args,
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: parseInt(tabId, 10) },
        func,
        args,
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!results || results.length === 0) {
          reject(new Error('Script execution failed'));
        } else {
          resolve(results[0].result as R);
        }
      });
    });
  }

  /**
   * Insert CSS into a tab
   * @param tabId The ID of the tab to insert CSS into
   * @param css The CSS to insert
   * @returns A promise that resolves when the CSS is inserted
   */
  async insertCSS(tabId: string, css: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.insertCSS({
        target: { tabId: parseInt(tabId, 10) },
        css,
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Show a notification
   * @param options The notification options
   * @returns A promise that resolves with the notification ID
   */
  async showNotification(options: NotificationOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Create a unique notification ID
        const notificationId = `cs-${Date.now()}`;
        
        // Create a basic notification with required fields
        const notificationOptions: chrome.notifications.NotificationOptions<true> = {
          type: options.type,
          title: options.title,
          message: options.message,
          iconUrl: options.iconUrl || chrome.runtime.getURL('assets/icon-128.png')
        };
        
        // Create the notification
        chrome.notifications.create(
          notificationId,
          notificationOptions,
          (createdId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(createdId || notificationId);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set a badge on the extension icon
   * @param text The badge text
   * @param color The badge color
   * @returns A promise that resolves when the badge is set
   */
  async setBadge(text: string, color: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color });
      resolve();
    });
  }

  /**
   * Open the extension options page
   * @returns A promise that resolves when the options page is opened
   */
  async openOptionsPage(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.runtime.openOptionsPage(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the extension URL
   * @param path The path to get the URL for
   * @returns The extension URL
   */
  getExtensionUrl(path: string): string {
    return chrome.runtime.getURL(path);
  }

  /**
   * Get the manifest
   * @returns The manifest
   */
  getManifest(): chrome.runtime.Manifest {
    return chrome.runtime.getManifest();
  }

  /**
   * Map a Chrome tab to a Tab object
   * @param chromeTab The Chrome tab to map
   * @returns The mapped Tab object
   */
  private mapChromeTab(chromeTab: chrome.tabs.Tab): Tab {
    return {
      id: chromeTab.id?.toString() || '',
      url: chromeTab.url || '',
      title: chromeTab.title || '',
      active: chromeTab.active || false,
      index: chromeTab.index || 0,
      windowId: chromeTab.windowId?.toString() || '',
    };
  }
}
