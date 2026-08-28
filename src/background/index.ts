/**
 * Background script entry point
 */
import {
  Settings,
  VerificationResult,
  ServerConfig,
  ClaimMap,
  getTrustDirectorySubscriptions,
  validateTrustDirectorySubscription,
  buildKeyidUrl,
  requireCanonicalBase64,
  requireContentHash,
  requireTimestamp,
  sanitizeClaims,
} from "../core/common";
import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
} from "../core/common/constants";
import { AuthService } from "../core/auth";
import { extractSigningContent, hashSigningContent } from "../core/content/signing-extraction";
import { PlatformAdapter, MessageContext, ExtensionMessage } from "../platforms/common";
import { parseContentMessage, parseOptionsMessage, parsePopupMessage } from "./messages";

// Import platform-specific adapter
// This will be replaced with the correct adapter at build time
import { ChromiumAdapter } from "../platforms/chromium";

// Initialize platform adapter
const platformAdapter: PlatformAdapter = new ChromiumAdapter();

// Initialize services
const storage = platformAdapter.getStorage();
const authService = new AuthService({
  storage,
});

let settings: Settings = DEFAULT_SETTINGS;
function assertNever(value: never): never {
  throw new Error(`Unhandled message: ${String(value)}`);
}

function serializedOrigin(url: string): string {
  return new URL(url).origin;
}

/**
 * Initialize the background script
 */
async function initialize() {
  try {
    // Load settings from storage
    const storedSettings = await storage.get<Settings>(STORAGE_KEYS.SETTINGS);
    settings = storedSettings || DEFAULT_SETTINGS;

    // Initialize the auth service
    await authService.initialize();

    // Register message listeners
    registerMessageListeners();

    // Set up badge
    updateBadge();

  } catch (error) {
    console.error("Failed to initialize background script:", error);
  }
}

/**
 * Register message listeners
 */
function registerMessageListeners() {
  platformAdapter.registerMessageListeners({
    [MessageContext.POPUP]: handlePopupMessage,
    [MessageContext.CONTENT]: handleContentMessage,
    [MessageContext.OPTIONS]: handleOptionsMessage,
  });
}

/**
 * Handle messages from the popup
 * @param message The message to handle
 * @returns A promise that resolves with the response
 */
async function handlePopupMessage(message: ExtensionMessage): Promise<unknown> {
  const parsed = parsePopupMessage(message);
  switch (parsed.type) {
    case "SIGN_CONTENT":
      return signContent(parsed.url, parsed.claims);
    case "CREATE_AUTHOR":
      return createAuthor(
        parsed.name,
        parsed.keyType,
        parsed.description,
        parsed.url,
      );
    case "ASSOCIATE_API_KEY":
      return associateApiKey(parsed.authorId, parsed.apiKey);
    case "SIGN_OUT":
      return signOut();
    case "GET_ACTIVE_SERVER":
      return getActiveServer();
    case "SET_ACTIVE_SERVER":
      return setActiveServer(parsed.serverId);
    case "GET_ALL_SERVERS":
      return getAllServers();
    case "ADD_SERVER":
      return addServer(parsed.name, parsed.url, parsed.setAsActive);
    case "UPDATE_SERVER":
      return updateServer(parsed.id, parsed.updates);
    case "REMOVE_SERVER":
      return removeServer(parsed.id);
    default:
      return assertNever(parsed);
  }
}

/**
 * Handle messages from content scripts
 * @param message The message to handle
 * @returns A promise that resolves with the response
 */
async function handleContentMessage(message: ExtensionMessage): Promise<unknown> {
  const parsed = parseContentMessage(message);
  return handleContentDetected(parsed.url, parsed.verified);
}

/**
 * Handle messages from the options page
 * @param message The message to handle
 * @returns A promise that resolves with the response
 */
async function handleOptionsMessage(message: ExtensionMessage): Promise<unknown> {
  const parsed = parseOptionsMessage(message);
  return updateSettings(parsed.settings);
}

/**
 * Get the verification status for a URL
 * @param url The URL to get the verification status for
 * @returns The verification status
 */
async function getVerificationStatus(url: string) {
  try {
    // Check if we have a cached verification result
    const verificationResults =
      (await storage.get<Record<string, VerificationResult>>(
        STORAGE_KEYS.VERIFICATION_RESULTS,
      )) || {};
    const cachedResult = verificationResults[url];

    if (cachedResult) {
      return {
        verified: cachedResult.verified,
        status: cachedResult.verified ? "Verified" : "Not verified",
        result: cachedResult,
      };
    }

    return {
      verified: false,
      status: "Not verified",
      result: null,
    };
  } catch (error) {
    console.error("Failed to get verification status:", error);
    return {
      verified: false,
      status: "Error: " + (error as Error).message,
      result: null,
    };
  }
}

/**
 * Sign content at a URL
 * @param url The URL to sign content at
 * @param claims Optional claims about the content
 * @returns The signing result
 */
async function signContent(
  url: string,
  claims: ClaimMap = {},
) {
  try {
    // Check if the user is authenticated
    if (!authService.isAuthenticated()) {
      throw new Error("User is not authenticated");
    }

    // Get the current tab
    const currentTab = await platformAdapter.getCurrentTab();

    // Extract in the page, then normalize and hash in the extension service
    // worker. Passing a function avoids interpolating page-controlled data
    // into executable source.
    const extractedContent = await platformAdapter.executeFunction(
      currentTab.id,
      extractSigningContent,
      [],
    );
    const contentHash = await hashSigningContent(extractedContent.content);

    // Get the Content Signing client
    const contentSigningClient = authService.getContentSigningClient();
    if (!contentSigningClient) {
      throw new Error("Content Signing client not initialized");
    }

    // If no claims provided, use some defaults based on extracted metadata
    if (Object.keys(claims).length === 0) {
      claims = {
        title: extractedContent.title,
      };
    }

    // Sign the content
    const signature = await contentSigningClient.signContent(
      contentHash,
      serializedOrigin(url),
      claims,
    );

    // Create a verification result
    const currentAuthor = authService.getCurrentAuthor();
    const verificationResult: VerificationResult = {
      verified: true,
      user: currentAuthor
        ? {
            id: currentAuthor.id,
            name: currentAuthor.name,
            email: "", // Not provided by the API
            publicKey: "", // We would need to fetch this separately
            verified: true,
          }
        : undefined,
      verifiedAt: Date.now(),
      domain: serializedOrigin(url),
      trustStatus: "trusted",
    };

    // Cache the verification result
    const verificationResults =
      (await storage.get<Record<string, VerificationResult>>(
        STORAGE_KEYS.VERIFICATION_RESULTS,
      )) || {};
    verificationResults[url] = verificationResult;
    await storage.set(STORAGE_KEYS.VERIFICATION_RESULTS, verificationResults);

    // Update the badge
    updateBadge();

    // Inject the signature into the page as a <signed-section> element.
    //
    // Everything below the validation step comes from the trust server's
    // response. It is passed to executeFunction as structured-cloned arguments,
    // never interpolated into a script string, so a hostile or compromised
    // server cannot get code to run in the page. The validation is a second
    // line of defence and also keeps malformed signatures out of the DOM.
    const activeServer = authService.getActiveServerConfig();
    const serverUrl = activeServer ? activeServer.url.replace(/\/+$/, "") : "";
    const signedAt = signature.createdAt || new Date().toISOString();
    const injection = {
      signature: requireCanonicalBase64(signature.signature, "signature"),
      keyid: buildKeyidUrl(serverUrl, signature.authorId),
      contentHash: requireContentHash(signature.contentHash),
      signedAt: requireTimestamp(signedAt, "createdAt"),
      claims: sanitizeClaims(signature.claims),
    };

    await platformAdapter.executeFunction<[typeof injection], void>(
      currentTab.id,
      (data) => {
        // Remove any existing signature elements
        document
          .querySelectorAll("signed-section[signature]")
          .forEach((el) => el.remove());

        // Find the main content element
        const content =
          document.querySelector("article") ||
          document.querySelector("main") ||
          document.querySelector(".content") ||
          document.body;

        // Create a signed-section element with the signature
        const signedSection = document.createElement("signed-section");
        signedSection.setAttribute("signature", data.signature);
        signedSection.setAttribute("keyid", data.keyid);
        signedSection.setAttribute("algorithm", "ed25519");
        signedSection.setAttribute("content-hash", data.contentHash);

        // Add timestamp meta
        const timestampMeta = document.createElement("meta");
        timestampMeta.setAttribute("name", "signed-at");
        timestampMeta.setAttribute("content", data.signedAt);
        signedSection.appendChild(timestampMeta);

        // Add claims meta tags
        for (const [key, value] of data.claims) {
          const claimMeta = document.createElement("meta");
          claimMeta.setAttribute("name", "claim:" + key);
          claimMeta.setAttribute("content", value);
          signedSection.appendChild(claimMeta);
        }

        signedSection.style.display = "none";

        // Insert after the content
        content.parentNode?.insertBefore(signedSection, content.nextSibling);
      },
      [injection],
    );

    return {
      verified: true,
      status: "Content signed successfully",
      result: {
        signature,
        verificationResult,
      },
    };
  } catch (error) {
    console.error("Failed to sign content:", error);
    return {
      verified: false,
      status: "Error: " + (error as Error).message,
      result: null,
    };
  }
}

/**
 * Create a new author
 * @param name The name of the author
 * @param keyType The type of the author key
 * @param description Optional description of the author
 * @param url Optional URL associated with the author
 * @returns A promise that resolves with the created author
 */
async function createAuthor(
  name: string,
  keyType: "HUMAN" | "AI" | "HUMAN_AI_MIX" | "ORGANIZATION",
  description?: string,
  url?: string,
) {
  try {
    const author = await authService.createAuthor(
      name,
      keyType,
      description,
      url,
    );
    return {
      success: true,
      author,
    };
  } catch (error) {
    console.error("Failed to create author:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Associate an existing API key with the active server
 * @param authorId The ID of the author
 * @param apiKey The API key to associate
 * @returns A promise that resolves with the author details
 */
async function associateApiKey(authorId: string, apiKey: string) {
  try {
    const author = await authService.associateApiKey(authorId, apiKey);
    return {
      success: true,
      author,
    };
  } catch (error) {
    console.error("Failed to associate API key:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Sign out the current user
 * @returns A promise that resolves when the user is signed out
 */
async function signOut() {
  try {
    await authService.signOut();
    return {
      success: true,
    };
  } catch (error) {
    console.error("Failed to sign out:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get the active server configuration
 * @returns The active server configuration
 */
async function getActiveServer() {
  try {
    const activeServer = authService.getActiveServerConfig();
    return {
      success: true,
      server: activeServer,
    };
  } catch (error) {
    console.error("Failed to get active server:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Set the active server configuration
 * @param serverId The ID of the server configuration to set as active
 * @returns A promise that resolves when the active server is set
 */
async function setActiveServer(serverId: string) {
  try {
    await authService.setActiveServer(serverId);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Failed to set active server:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get all server configurations
 * @returns An array of all server configurations
 */
async function getAllServers() {
  try {
    const servers = authService.getAllServerConfigs();
    return {
      success: true,
      servers,
    };
  } catch (error) {
    console.error("Failed to get all servers:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Add a new server configuration
 * @param name The name of the server
 * @param url The URL of the server
 * @param setAsActive Whether to set this server as active
 * @returns A promise that resolves with the ID of the new server configuration
 */
async function addServer(
  name: string,
  url: string,
  setAsActive = false,
) {
  try {
    const serverId = await authService.addServerConfig(name, url, setAsActive);
    return {
      success: true,
      serverId,
    };
  } catch (error) {
    console.error("Failed to add server:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Update a server configuration
 * @param id The ID of the server configuration to update
 * @param updates The updates to apply
 * @returns A promise that resolves when the server configuration is updated
 */
async function updateServer(
  id: string,
  updates: Partial<Omit<ServerConfig, "id">>,
) {
  try {
    await authService.updateServerConfig(id, updates);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Failed to update server:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Remove a server configuration
 * @param id The ID of the server configuration to remove
 * @returns A promise that resolves when the server configuration is removed
 */
async function removeServer(id: string) {
  try {
    await authService.removeServerConfig(id);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Failed to remove server:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Update settings
 * @param newSettings The new settings
 * @returns A promise that resolves when the settings are updated
 */
async function updateSettings(newSettings: Settings): Promise<void> {
  if (Array.isArray(newSettings.trustDirectorySubscriptions)) {
    const invalid = newSettings.trustDirectorySubscriptions
      .map(validateTrustDirectorySubscription)
      .find((message): message is string => message !== null);
    if (invalid) throw new Error(invalid);
  }
  const subscriptions = getTrustDirectorySubscriptions(newSettings);
  if (Array.isArray(newSettings.trustDirectorySubscriptions) && subscriptions.length !== newSettings.trustDirectorySubscriptions.length) {
    throw new Error("Invalid trust directory subscription; use an HTTPS URL and a weight between 0 and 1");
  }
  settings = {
    ...newSettings,
    trustDirectorySubscriptions: subscriptions,
  };
  await storage.set(STORAGE_KEYS.SETTINGS, settings);

  // Update the badge
  updateBadge();
}

/**
 * Cache the aggregate produced by the content script's source-based verifier.
 * Keeping one verifier avoids loading the canonicalizer and resolver stack in
 * both extension entry points.
 */
async function handleContentDetected(
  url: string,
  verified = false,
) {
  try {
    const isVerified = settings.autoVerify && verified;
    const verificationResult: VerificationResult = {
      verified: isVerified,
      cryptoValid: isVerified,
      reason: isVerified
        ? undefined
        : settings.autoVerify
          ? "No verified signed sections"
          : "Auto-verification disabled",
      verifiedAt: Date.now(),
      domain: serializedOrigin(url),
      trustStatus: "unknown",
    };
    const verificationResults =
      (await storage.get<Record<string, VerificationResult>>(
        STORAGE_KEYS.VERIFICATION_RESULTS,
      )) || {};
    verificationResults[url] = verificationResult;
    await storage.set(STORAGE_KEYS.VERIFICATION_RESULTS, verificationResults);
    await updateBadge();

    return {
      verified: isVerified,
      status: isVerified ? "Verified" : verificationResult.reason,
      result: verificationResult,
    };
  } catch (error) {
    console.error("Failed to handle content detected:", error);
    return {
      verified: false,
      status: "Error: " + (error as Error).message,
      result: null,
    };
  }
}

/**
 * Update the extension badge
 */
async function updateBadge(): Promise<void> {
  try {
    // Get the current tab
    const currentTab = await platformAdapter.getCurrentTab();

    // Get the verification status for the current URL
    const status = await getVerificationStatus(currentTab.url);

    // Set the badge based on the verification status. Clearing the badge
    // means setting text to empty; color must still be a valid color string
    // because Chrome rejects an empty color spec ("The color specification
    // could not be parsed").
    if (status.verified) {
      await platformAdapter.setBadge("✓", "#4CAF50");
    } else {
      await platformAdapter.setBadge("", "#00000000");
    }
  } catch (error) {
    console.error("Failed to update badge:", error);
  }
}

// Initialize the background script
initialize();
