/**
 * Platform adapter interface for browser-specific implementations
 */
import { StorageInterface } from '../../core/storage';

/**
 * Interface for browser-specific platform adapters
 */
export interface PlatformAdapter {
  /**
   * Get the name of the platform
   * @returns The platform name
   */
  getPlatformName(): string;

  /**
   * Get the version of the platform
   * @returns The platform version
   */
  getPlatformVersion(): string;

  /**
   * Get the storage interface for the platform
   * @returns The storage interface
   */
  getStorage(): StorageInterface;

  /**
   * Register message listeners for the platform
   * @param handlers The message handlers
   */
  registerMessageListeners(handlers: MessageHandlers): void;

  /**
   * Send a message to a specific context
   * @param context The context to send the message to
   * @param message The message to send
   * @returns A promise that resolves with the response
   */
  sendMessage<T = any>(context: MessageContext, message: any): Promise<T>;

  /**
   * Get the current tab
   * @returns A promise that resolves with the current tab
   */
  getCurrentTab(): Promise<Tab>;

  /**
   * Get all tabs
   * @returns A promise that resolves with all tabs
   */
  getAllTabs(): Promise<Tab[]>;

  /**
   * Create a new tab
   * @param url The URL to open in the new tab
   * @returns A promise that resolves with the new tab
   */
  createTab(url: string): Promise<Tab>;

  /**
   * Update a tab
   * @param tabId The ID of the tab to update
   * @param properties The properties to update
   * @returns A promise that resolves with the updated tab
   */
  updateTab(tabId: string, properties: Partial<Tab>): Promise<Tab>;

  /**
   * Close a tab
   * @param tabId The ID of the tab to close
   * @returns A promise that resolves when the tab is closed
   */
  closeTab(tabId: string): Promise<void>;

  /**
   * Execute a fixed script body in a tab.
   *
   * The body is a compile-time constant. Never build it by interpolating
   * runtime values — that is code injection into the page. Use
   * executeFunction() whenever the injected code needs runtime data.
   *
   * @param tabId The ID of the tab to execute the script in
   * @param script The script to execute
   * @returns A promise that resolves with the result of the script
   */
  executeScript<T = any>(tabId: string, script: string): Promise<T>;

  /**
   * Execute a function in a tab, passing runtime data as arguments.
   *
   * The function is injected by reference and `args` crosses the boundary as
   * structured-cloned data, so argument values are never parsed as code. This
   * is the only safe way to inject anything derived from a network response.
   *
   * @param tabId The ID of the tab to execute the function in
   * @param func The function to execute in the page
   * @param args Structured-cloneable arguments passed to `func`
   * @returns A promise that resolves with the return value of `func`
   */
  executeFunction<Args extends unknown[], R>(
    tabId: string,
    func: (...args: Args) => R,
    args: Args,
  ): Promise<R>;

  /**
   * Insert CSS into a tab
   * @param tabId The ID of the tab to insert CSS into
   * @param css The CSS to insert
   * @returns A promise that resolves when the CSS is inserted
   */
  insertCSS(tabId: string, css: string): Promise<void>;

  /**
   * Show a notification
   * @param options The notification options
   * @returns A promise that resolves with the notification ID
   */
  showNotification(options: NotificationOptions): Promise<string>;

  /**
   * Set a badge on the extension icon
   * @param text The badge text
   * @param color The badge color
   * @returns A promise that resolves when the badge is set
   */
  setBadge(text: string, color: string): Promise<void>;

  /**
   * Open the extension options page
   * @returns A promise that resolves when the options page is opened
   */
  openOptionsPage(): Promise<void>;

  /**
   * Get the extension URL
   * @param path The path to get the URL for
   * @returns The extension URL
   */
  getExtensionUrl(path: string): string;

  /**
   * Get the manifest
   * @returns The manifest
   */
  getManifest(): any;
}

/**
 * Message context
 */
export enum MessageContext {
  /** Background script context */
  BACKGROUND = 'background',
  /** Content script context */
  CONTENT = 'content',
  /** Popup context */
  POPUP = 'popup',
  /** Options page context */
  OPTIONS = 'options',
}

/**
 * Message handlers
 */
export interface MessageHandlers {
  /** Handler for messages from the background script */
  [MessageContext.BACKGROUND]?: (message: any) => Promise<any>;
  /** Handler for messages from content scripts */
  [MessageContext.CONTENT]?: (message: any) => Promise<any>;
  /** Handler for messages from the popup */
  [MessageContext.POPUP]?: (message: any) => Promise<any>;
  /** Handler for messages from the options page */
  [MessageContext.OPTIONS]?: (message: any) => Promise<any>;
}

/**
 * Tab interface
 */
export interface Tab {
  /** The ID of the tab */
  id: string;
  /** The URL of the tab */
  url: string;
  /** The title of the tab */
  title: string;
  /** Whether the tab is active */
  active: boolean;
  /** The index of the tab */
  index: number;
  /** The ID of the window the tab is in */
  windowId: string;
}

/**
 * Notification options
 */
export interface NotificationOptions {
  /** The type of notification */
  type: 'basic' | 'image' | 'list' | 'progress';
  /** The notification title */
  title: string;
  /** The notification message */
  message: string;
  /** The notification icon URL */
  iconUrl?: string;
  /** The notification context message */
  contextMessage?: string;
  /** The notification buttons */
  buttons?: { title: string }[];
  /** The notification items (for list type) */
  items?: { title: string; message: string }[];
  /** The notification progress (for progress type) */
  progress?: number;
}