/**
 * Background script entry point
 */
import {
  Settings,
  VerificationResult,
  ServerConfig,
  ContentSignature,
  VoteType,
  AuthorVote,
  BatchedVotesPayload,
  BatchVoteResult,
} from "../core/common";
import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  MESSAGE_TYPES,
} from "../core/common/constants";
import { AuthService } from "../core/auth";
import { ContentSigningClient } from "../core/api";
import { ContentProcessor } from "../core/content";
import { PlatformAdapter, MessageContext } from "../platforms/common";

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

let contentProcessor: ContentProcessor;
let settings: Settings = DEFAULT_SETTINGS;
let contentSigningClient: ContentSigningClient | null = null;

/**
 * Initialize the background script
 */
async function initialize() {
  try {
    // Load settings from storage
    const storedSettings = await storage.get<Settings>(STORAGE_KEYS.SETTINGS);
    settings = storedSettings || DEFAULT_SETTINGS;

    // Initialize the content processor
    contentProcessor = new ContentProcessor();

    // Initialize the auth service
    await authService.initialize();

    // Register message listeners
    registerMessageListeners();

    // Set up badge
    updateBadge();

    // Set up alarm for periodic vote submission
    setupVoteSubmissionAlarm();

    console.log("Content Signing background script initialized");
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
async function handlePopupMessage(message: any): Promise<any> {
  switch (message.type) {
    case "GET_VERIFICATION_STATUS":
      return getVerificationStatus(message.url);
    case "VERIFY_CONTENT":
      return verifyContent(message.url);
    case "SIGN_CONTENT":
      return signContent(message.url, message.claims);
    case "CREATE_AUTHOR":
      return createAuthor(
        message.name,
        message.keyType,
        message.description,
        message.url,
      );
    case "ASSOCIATE_API_KEY":
      return associateApiKey(message.authorId, message.apiKey);
    case "SIGN_OUT":
      return signOut();
    case "GET_ACTIVE_SERVER":
      return getActiveServer();
    case "SET_ACTIVE_SERVER":
      return setActiveServer(message.serverId);
    case "GET_ALL_SERVERS":
      return getAllServers();
    case "ADD_SERVER":
      return addServer(message.name, message.url, message.setAsActive);
    case "UPDATE_SERVER":
      return updateServer(message.id, message.updates);
    case "REMOVE_SERVER":
      return removeServer(message.id);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Handle messages from content scripts
 * @param message The message to handle
 * @returns A promise that resolves with the response
 */
async function handleContentMessage(message: any): Promise<any> {
  switch (message.type) {
    case MESSAGE_TYPES.CONTENT_DETECTED:
      return handleContentDetected(message.url, message.content);
    case MESSAGE_TYPES.SUBMIT_VOTE:
      return handleVoteSubmission(
        message.authorId,
        message.vote,
        message.url,
        message.contentHash,
      );
    case "GET_AUTHOR_VOTE":
      return getAuthorVote(message.authorId);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Handle messages from the options page
 * @param message The message to handle
 * @returns A promise that resolves with the response
 */
async function handleOptionsMessage(message: any): Promise<any> {
  switch (message.type) {
    case "UPDATE_SETTINGS":
      return updateSettings(message.settings);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Get the verification status for a URL
 * @param url The URL to get the verification status for
 * @returns The verification status
 */
async function getVerificationStatus(url: string): Promise<any> {
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
 * Verify content at a URL
 * @param url The URL to verify content at
 * @returns The verification result
 */
async function verifyContent(url: string): Promise<any> {
  try {
    // Get the current tab
    const currentTab = await platformAdapter.getCurrentTab();

    // Execute a script to extract the content
    const extractedContent = await platformAdapter.executeScript<any>(
      currentTab.id,
      `
      (() => {
        const contentProcessor = new ContentProcessor();
        return contentProcessor.extractContent(document);
      })()
    `,
    );

    // Get the active server configuration
    const activeServer = authService.getActiveServerConfig();
    if (!activeServer) {
      throw new Error("No active server configuration found");
    }

    // Get the Content Signing client
    const contentSigningClient = authService.getContentSigningClient();
    if (!contentSigningClient) {
      throw new Error("Content Signing client not initialized");
    }

    // Try to find a signature for this content
    // This is a simplified approach - in a real implementation, we would need a more robust
    // mechanism to discover signatures (e.g., from meta tags, linked manifests, or directory lookup)
    let signature: ContentSignature | null = null;
    let authorId: string | null = null;

    // Option 1: Check for signature in <signed-section> elements
    const metaTags = await platformAdapter.executeScript<any>(
      currentTab.id,
      `
      (() => {
        const signed = document.querySelector('signed-section[signature]');
        if (!signed) return { signature: null, authorId: null, keyid: null, algorithm: null, contentHash: null, innerMeta: {} };
        const keyid = signed.getAttribute('keyid') || '';
        // Extract authorId from keyid URL (last path segment before /public-key)
        const keyidParts = keyid.replace(/\\/public-key$/, '').split('/');
        const authorId = keyidParts[keyidParts.length - 1] || null;

        // Read inner metadata from <meta> tags
        const metas = signed.querySelectorAll('meta');
        const innerMeta = {};
        metas.forEach(m => {
          const name = m.getAttribute('name');
          const content = m.getAttribute('content');
          if (name && content) innerMeta[name] = content;
        });

        return {
          signature: signed.getAttribute('signature'),
          authorId: authorId,
          keyid: keyid,
          algorithm: signed.getAttribute('algorithm'),
          contentHash: signed.getAttribute('content-hash'),
          innerMeta: innerMeta
        };
      })()
    `,
    );

    if (metaTags.signature && metaTags.authorId) {
      // Build claims from inner meta tags (claim:* entries)
      const innerClaims: Record<string, string> = {};
      const innerMeta = metaTags.innerMeta || {};
      for (const [key, value] of Object.entries(innerMeta)) {
        if (key.startsWith("claim:")) {
          innerClaims[key.slice("claim:".length)] = value as string;
        }
      }
      signature = {
        contentHash: extractedContent.contentHash,
        domain: new URL(url).hostname,
        authorId: metaTags.authorId,
        signature: metaTags.signature,
        claims: innerClaims,
      };
      authorId = metaTags.authorId;
    }

    // Option 2: If no signature found in signed-section, try to search the directory
    if (!signature && !authorId) {
      try {
        const searchResult = await contentSigningClient.searchSignedContent({
          contentHash: extractedContent.contentHash,
        });

        if (searchResult.signatures.length > 0) {
          // Use the first signature found
          const foundSignature = searchResult.signatures[0];
          signature = {
            contentHash: foundSignature.contentHash,
            domain: foundSignature.domain,
            authorId: foundSignature.authorId,
            signature: foundSignature.signature,
            claims: foundSignature.claims,
          };
          authorId = foundSignature.authorId;
        }
      } catch (error) {
        console.error("Failed to search for signatures:", error);
        // Continue with verification attempt if we have a signature from meta tags
      }
    }

    // If we found a signature, verify it
    let verificationResult: VerificationResult;

    if (signature && authorId) {
      try {
        const result = await contentSigningClient.verifyContent(
          extractedContent.contentHash,
          new URL(url).hostname,
          authorId,
          signature.signature,
        );

        verificationResult = {
          verified: result.valid,
          reason: result.valid ? undefined : "Signature verification failed",
          verifiedAt: Date.now(),
          domain: new URL(url).hostname,
          user: result.author
            ? {
                id: result.author.id,
                name: result.author.name,
                email: "", // Not provided by the API
                publicKey: "", // We would need to fetch this separately
                verified: true,
              }
            : undefined,
          trustStatus: result.valid ? "trusted" : "untrusted",
        };
      } catch (error) {
        verificationResult = {
          verified: false,
          reason: `Verification error: ${(error as Error).message}`,
          verifiedAt: Date.now(),
          domain: new URL(url).hostname,
          trustStatus: "unknown",
        };
      }
    } else {
      verificationResult = {
        verified: false,
        reason: "No signature found for this content",
        verifiedAt: Date.now(),
        domain: new URL(url).hostname,
        trustStatus: "unknown",
      };
    }

    // Cache the verification result
    const verificationResults =
      (await storage.get<Record<string, VerificationResult>>(
        STORAGE_KEYS.VERIFICATION_RESULTS,
      )) || {};
    verificationResults[url] = verificationResult;
    await storage.set(STORAGE_KEYS.VERIFICATION_RESULTS, verificationResults);

    // Update the badge
    updateBadge();

    return {
      verified: verificationResult.verified,
      status: verificationResult.verified
        ? "Verified"
        : verificationResult.reason || "Not verified",
      result: verificationResult,
    };
  } catch (error) {
    console.error("Failed to verify content:", error);
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
  claims: Record<string, any> = {},
): Promise<any> {
  try {
    // Check if the user is authenticated
    if (!authService.isAuthenticated()) {
      throw new Error("User is not authenticated");
    }

    // Get the current tab
    const currentTab = await platformAdapter.getCurrentTab();

    // Execute a script to extract the content
    const extractedContent = await platformAdapter.executeScript<any>(
      currentTab.id,
      `
      (() => {
        const contentProcessor = new ContentProcessor();
        return contentProcessor.extractContent(document);
      })()
    `,
    );

    // Get the Content Signing client
    const contentSigningClient = authService.getContentSigningClient();
    if (!contentSigningClient) {
      throw new Error("Content Signing client not initialized");
    }

    // If no claims provided, use some defaults based on extracted metadata
    if (Object.keys(claims).length === 0 && extractedContent.metadata) {
      claims = {
        title: extractedContent.title,
      };

      // Add Dublin Core metadata if available
      if (extractedContent.structuredMetadata?.dublinCore) {
        const dc = extractedContent.structuredMetadata.dublinCore;
        if (dc.creator) claims.creator = dc.creator;
        if (dc.description) claims.description = dc.description;
        if (dc.subject) claims.subject = dc.subject;
        if (dc.type) claims.contentType = dc.type;
      }

      // Add Schema.org metadata if available
      if (extractedContent.structuredMetadata?.schemaOrg) {
        const schema = extractedContent.structuredMetadata.schemaOrg;
        if (schema.datePublished) claims.datePublished = schema.datePublished;
        if (schema.dateModified) claims.dateModified = schema.dateModified;
        if (schema.author?.name) claims.author = schema.author.name;
      }
    }

    // Sign the content
    const signature = await contentSigningClient.signContent(
      extractedContent.contentHash,
      new URL(url).hostname,
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
      domain: new URL(url).hostname,
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

    // Inject the signature into the page as a <signed-section> element
    const activeServer = authService.getActiveServerConfig();
    const serverUrl = activeServer ? activeServer.url.replace(/\/+$/, "") : "";
    const claimsJson = JSON.stringify(signature.claims || {})
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
    const signedAt = signature.createdAt || new Date().toISOString();
    await platformAdapter.executeScript<void>(
      currentTab.id,
      `
      (() => {
        // Remove any existing signature elements
        document.querySelectorAll('signed-section[signature]').forEach(el => el.remove());

        // Find the main content element
        const content = document.querySelector('article') || document.querySelector('main') || document.querySelector('.content') || document.body;

        // Create a signed-section element with the signature
        const signedSection = document.createElement('signed-section');
        signedSection.setAttribute('signature', '${signature.signature}');
        signedSection.setAttribute('keyid', '${serverUrl}/api/authors/${signature.authorId}/public-key');
        signedSection.setAttribute('algorithm', 'ed25519');
        signedSection.setAttribute('content-hash', '${signature.contentHash}');

        // Add timestamp meta
        const timestampMeta = document.createElement('meta');
        timestampMeta.setAttribute('name', 'signed-at');
        timestampMeta.setAttribute('content', '${signedAt}');
        signedSection.appendChild(timestampMeta);

        // Add claims meta tags
        const claims = JSON.parse('${claimsJson}');
        for (const [key, value] of Object.entries(claims)) {
          const claimMeta = document.createElement('meta');
          claimMeta.setAttribute('name', 'claim:' + key);
          claimMeta.setAttribute('content', String(value));
          signedSection.appendChild(claimMeta);
        }

        signedSection.style.display = 'none';

        // Insert after the content
        content.parentNode.insertBefore(signedSection, content.nextSibling);
      })()
    `,
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
): Promise<any> {
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
async function associateApiKey(authorId: string, apiKey: string): Promise<any> {
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
async function signOut(): Promise<any> {
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
async function getActiveServer(): Promise<any> {
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
async function setActiveServer(serverId: string): Promise<any> {
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
async function getAllServers(): Promise<any> {
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
): Promise<any> {
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
): Promise<any> {
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
async function removeServer(id: string): Promise<any> {
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
  settings = newSettings;
  await storage.set(STORAGE_KEYS.SETTINGS, settings);

  // Update the badge
  updateBadge();
}

/**
 * Handle content detected
 * @param url The URL where content was detected
 * @param content The detected content
 * @returns A promise that resolves with the verification result
 */
async function handleContentDetected(url: string, content: any): Promise<any> {
  try {
    // If auto-verify is enabled, verify the content
    if (settings.autoVerify) {
      return verifyContent(url);
    }

    return {
      verified: false,
      status: "Auto-verification disabled",
      result: null,
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

    // Set the badge based on the verification status
    if (status.verified) {
      await platformAdapter.setBadge("✓", "#4CAF50");
    } else {
      await platformAdapter.setBadge("", "");
    }
  } catch (error) {
    console.error("Failed to update badge:", error);
  }
}

/**
 * Set up the alarm for periodic vote submission
 */
function setupVoteSubmissionAlarm(): void {
  // Clear any existing alarms
  chrome.alarms.clear("syncVotesAlarm");

  // Create a new alarm that fires every 5 minutes
  chrome.alarms.create("syncVotesAlarm", {
    periodInMinutes: 5,
  });

  // Add an alarm listener
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "syncVotesAlarm") {
      submitPendingVotes();
    }
  });

  // Also trigger on browser startup
  chrome.runtime.onStartup.addListener(() => {
    submitPendingVotes();
  });
}

/**
 * Handle vote submission from content script
 * @param authorId The ID of the author to vote on
 * @param vote The type of vote to cast
 * @param url Optional URL where the vote was cast
 * @param contentHash Optional content hash where the vote was cast
 * @returns A promise that resolves with the result
 */
async function handleVoteSubmission(
  authorId: string,
  vote: VoteType,
  url?: string,
  contentHash?: string,
): Promise<any> {
  try {
    // Create the vote object
    const authorVote: AuthorVote = {
      authorId,
      vote,
      timestamp: Date.now(),
      url,
      contentHash,
    };

    // Update local state based on vote type
    if (vote === VoteType.NEUTRAL) {
      // Remove the vote if it's neutral (retraction)
      await storage.remove(`${STORAGE_KEYS.AUTHOR_VOTES}:${authorId}`);
    } else {
      // Store the vote
      await storage.set(`${STORAGE_KEYS.AUTHOR_VOTES}:${authorId}`, authorVote);
    }

    // Add to pending votes queue
    const pendingVotes =
      (await storage.get<BatchedVotesPayload>(STORAGE_KEYS.PENDING_VOTES)) ||
      {};
    pendingVotes[authorId] = vote;
    await storage.set(STORAGE_KEYS.PENDING_VOTES, pendingVotes);

    // Send acknowledgment back to content script
    platformAdapter.sendMessage(MessageContext.CONTENT, {
      type: MESSAGE_TYPES.VOTE_ACKNOWLEDGED,
      authorId,
      success: true,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to handle vote submission:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get the current vote for an author
 * @param authorId The ID of the author
 * @returns A promise that resolves with the vote
 */
async function getAuthorVote(authorId: string): Promise<any> {
  try {
    const vote = await storage.get<AuthorVote>(
      `${STORAGE_KEYS.AUTHOR_VOTES}:${authorId}`,
    );
    return { vote: vote?.vote || null };
  } catch (error) {
    console.error("Failed to get author vote:", error);
    return { vote: null };
  }
}

/**
 * Submit pending votes to the server
 * @returns A promise that resolves when the votes are submitted
 */
async function submitPendingVotes(): Promise<void> {
  try {
    // Get the pending votes
    const pendingVotes = await storage.get<BatchedVotesPayload>(
      STORAGE_KEYS.PENDING_VOTES,
    );

    // If there are no pending votes, return
    if (!pendingVotes || Object.keys(pendingVotes).length === 0) {
      return;
    }

    // Get the Content Signing client
    if (!contentSigningClient) {
      contentSigningClient = authService.getContentSigningClient();
    }

    if (!contentSigningClient) {
      console.error("Content Signing client not initialized");
      return;
    }

    // Submit the votes
    const result = await contentSigningClient.submitBatchedVotes(pendingVotes);

    // If successful, clear the pending votes
    if (result.success) {
      await storage.set(STORAGE_KEYS.PENDING_VOTES, {});
      console.log("Successfully submitted pending votes");
    } else if (result.results) {
      // Handle partial success - remove successful votes from pending
      const updatedPendingVotes: BatchedVotesPayload = {};

      for (const [authorId, vote] of Object.entries(pendingVotes)) {
        const voteResult = result.results[authorId];
        if (!voteResult || !voteResult.success) {
          // Keep votes that failed in the pending queue
          updatedPendingVotes[authorId] = vote;
        }
      }

      await storage.set(STORAGE_KEYS.PENDING_VOTES, updatedPendingVotes);
      console.log("Partially submitted pending votes");
    }
  } catch (error) {
    console.error("Failed to submit pending votes:", error);
  }
}

// Initialize the background script
initialize();
