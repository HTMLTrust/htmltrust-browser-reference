/**
 * Core types for the Content Signing extension
 */

/**
 * Represents a signed content item
 */
export interface SignedContent {
  /** The original content that was signed */
  content: string;
  /** The content hash that was signed */
  contentHash: string;
  /** The signature of the content hash */
  signature: string;
  /** The public key that can verify the signature */
  publicKey: string;
  /** The timestamp when the content was signed */
  timestamp: number;
  /** The user who signed the content */
  userId: string;
  /** Metadata associated with the content */
  metadata?: {
    /** Generic metadata */
    generic?: Record<string, string>;
    /** Dublin Core metadata */
    dublinCore?: Record<string, string>;
    /** Open Graph metadata */
    openGraph?: Record<string, string>;
    /** Schema.org metadata */
    schemaOrg?: Record<string, string>;
  };
}

/**
 * Represents a user in the system
 */
export interface User {
  /** Unique identifier for the user */
  id: string;
  /** User's display name */
  name: string;
  /** User's email address */
  email: string;
  /** User's public key */
  publicKey: string;
  /** User's verification status */
  verified: boolean;
}

/**
 * Represents an author in the Content Signing API
 */
export interface Author {
  /** Unique identifier for the author */
  id: string;
  /** Name of the author */
  name: string;
  /** Description of the author */
  description?: string;
  /** URL associated with the author */
  url?: string;
  /** Type of the author key */
  keyType: 'HUMAN' | 'AI' | 'HUMAN_AI_MIX' | 'ORGANIZATION';
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Represents a public key in the Content Signing API
 */
export interface PublicKey {
  /** Unique identifier for the public key */
  id: string;
  /** ID of the author this key belongs to */
  authorId: string;
  /** The public key in PEM format */
  key: string;
  /** The cryptographic algorithm used */
  algorithm: 'RSA' | 'ECDSA' | 'ED25519';
  /** Creation timestamp */
  createdAt: string;
  /** Expiration timestamp (if applicable) */
  expiresAt?: string;
}

/**
 * Represents a claim type in the Content Signing API
 */
export interface Claim {
  /** Unique identifier for the claim type */
  id: string;
  /** Name of the claim type */
  name: string;
  /** Description of what this claim type represents */
  description: string;
  /** Possible values for this claim type (if applicable) */
  possibleValues?: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Represents a content signature in the Content Signing API
 */
export interface ContentSignature {
  /** Hash of the normalized content */
  contentHash: string;
  /** Domain associated with the content */
  domain: string;
  /** ID of the author who signed the content */
  authorId: string;
  /** Cryptographic signature binding content, hash, domain, and author key */
  signature: string;
  /** Claims about the content */
  claims: Record<string, any>;
  /** Creation timestamp */
  createdAt?: string;
}

/**
 * Represents key reputation information in the Content Signing API
 */
export interface KeyReputation {
  /** ID of the public key */
  keyId: string;
  /** Trust score between 0 and 1 */
  trustScore: number;
  /** Number of verified signatures using this key */
  verifiedSignatures: number;
  /** Number of reports against this key */
  reports?: number;
  /** Last update timestamp */
  lastUpdated?: string;
}

/**
 * Represents a content occurrence in the Content Signing API
 */
export interface ContentOccurrence {
  /** URL where the content was found */
  url: string;
  /** Domain where the content was found */
  domain: string;
  /** When the content was first seen at this location */
  firstSeen: string;
  /** When the content was last seen at this location */
  lastSeen?: string;
  /** ID of the author who signed the content at this location (if any) */
  authorId?: string;
  /** Whether the signature at this location is valid */
  signatureValid?: boolean;
}

/**
 * Represents a server configuration for the Content Signing API
 */
export interface ServerConfig {
  /** Unique identifier for the server configuration */
  id: string;
  /** Name of the server configuration */
  name: string;
  /** URL of the server */
  url: string;
  /** API key for author-specific operations */
  authorApiKey?: string;
  /** ID of the author associated with the API key */
  authorId?: string;
  /** API key for general operations */
  generalApiKey?: string;
  /** Whether this is the active server configuration */
  isActive: boolean;
}

/**
 * Represents a trust directory entry
 */
export interface TrustDirectoryEntry {
  /** Unique identifier for the entry */
  id: string;
  /** The user who owns this entry */
  userId: string;
  /** The domain this entry is for */
  domain: string;
  /** The public key for this domain */
  publicKey: string;
  /** When this entry was created */
  createdAt: number;
  /** When this entry was last updated */
  updatedAt: number;
  /** Whether this entry is active */
  active: boolean;
}

/**
 * Represents the trust status of a verification
 */
export type TrustStatus = 'trusted' | 'untrusted' | 'unknown';

/**
 * Represents the result of a content verification
 */
export interface VerificationResult {
  /** Whether the verification was successful */
  verified: boolean;
  /** The reason for verification failure, if any */
  reason?: string;
  /** The user who signed the content, if verified */
  user?: User;
  /** The trust directory entry used for verification, if any */
  trustDirectoryEntry?: TrustDirectoryEntry;
  /** The timestamp when the verification was performed */
  verifiedAt: number;
  /** The trust status of the verification */
  trustStatus?: TrustStatus;
  /** The domain of the content */
  domain?: string;
  /** Settings for displaying verification UI */
  settings?: {
    /** Whether to automatically verify content */
    autoVerify?: boolean;
    /** Whether to show verification badges */
    showBadges?: boolean;
    /** Whether to highlight verified content */
    highlightVerified?: boolean;
    /** Whether to highlight unverified content */
    highlightUnverified?: boolean;
  };
}

/**
 * Represents the extension settings
 */
export interface Settings {
  /** Whether to automatically verify content */
  autoVerify: boolean;
  /** Whether to show verification badges */
  showBadges: boolean;
  /** Whether to highlight verified content */
  highlightVerified: boolean;
  /** Whether to highlight unverified content */
  highlightUnverified: boolean;
  /**
   * The trust directory URL.
   * @deprecated Use `trustDirectoryUrls` (a list of directory base URLs).
   * Retained for back-compat with persisted settings; on read, normalize to
   * the list form via getTrustDirectoryUrls(settings).
   */
  trustDirectoryUrl?: string;
  /**
   * Trust directory base URLs used by the keyid resolver chain (third
   * resolver after did:web and direct URL). Order matters: the first
   * directory that resolves a keyid wins.
   */
  trustDirectoryUrls?: string[];
  /**
   * User's personal trust list, expressed as keyid strings (typically
   * did:web identifiers or direct public-key URLs). Empty by default;
   * keyids in this list contribute +40 to the policy score per spec §3.1.
   */
  personalTrustList?: string[];
  /**
   * Domains the user explicitly trusts. Empty by default; matching domains
   * contribute +30 to the policy score per spec §3.1.
   */
  trustedDomains?: string[];
  /** The user's preferred authentication method */
  authMethod: 'apikey' | 'webauthn' | 'password';
  /** Server configurations for the Content Signing API */
  serverConfigs: ServerConfig[];
  /** ID of the active server configuration */
  activeServerId?: string;
}

/**
 * Normalize the (possibly legacy) trust-directory settings to a list. Returns
 * the explicit list if present, otherwise wraps the single legacy URL in a
 * one-element array, otherwise returns an empty array. Caller should use this
 * as the single source of truth for "the directories the resolver chain and
 * the policy evaluator will consult".
 */
export function getTrustDirectoryUrls(settings: Pick<Settings, 'trustDirectoryUrls' | 'trustDirectoryUrl'>): string[] {
  if (settings.trustDirectoryUrls && settings.trustDirectoryUrls.length > 0) {
    return settings.trustDirectoryUrls.filter((u) => u && u.trim().length > 0);
  }
  if (settings.trustDirectoryUrl && settings.trustDirectoryUrl.trim().length > 0) {
    return [settings.trustDirectoryUrl.trim()];
  }
  return [];
}

/**
 * Represents an error in the extension
 */
export interface ExtensionError {
  /** The error code */
  code: string;
  /** The error message */
  message: string;
  /** The error details */
  details?: any;
}

/**
 * Represents the type of vote cast on an author
 */
export enum VoteType {
  /** Upvote (positive) */
  UPVOTE = 'upvote',
  /** Downvote (negative) */
  DOWNVOTE = 'downvote',
  /** Neutral (retract vote) */
  NEUTRAL = 'neutral',
}

/**
 * Represents a vote cast on an author (used for local state)
 */
export interface AuthorVote {
  /** ID of the author being voted on */
  authorId: string;
  /** The type of vote cast */
  vote: VoteType;
  /** Timestamp when the vote was cast */
  timestamp: number;
  /** Optional: URL of the content where the vote was cast */
  url?: string;
  /** Optional: Hash of the content where the vote was cast */
  contentHash?: string;
}

/**
 * Represents the payload for batch vote submission
 */
export type BatchedVotesPayload = Record<string, VoteType>; // { authorId1: 'upvote', authorId2: 'neutral', ... }

/**
 * Represents the result of a batch vote submission
 */
export interface BatchVoteResult {
  /** Overall success status */
  success: boolean;
  /** Details about individual vote results */
  results?: Record<string, {
    /** Whether this specific vote was processed successfully */
    success: boolean;
    /** Error message if the vote failed */
    error?: string;
  }>;
  /** General error message if the entire batch failed */
  error?: string;
}

/**
 * Represents a profile for content signing
 */
export interface Profile {
  /** Unique identifier for the profile */
  id: string;
  /** Name of the profile */
  name: string;
  /** Description of the profile */
  description?: string;
  /** Whether this is the default profile */
  isDefault: boolean;
  /** Trust directory URL for this profile */
  trustDirectoryUrl: string;
  /** Metadata associated with the profile */
  metadata: {
    /** Dublin Core metadata */
    dublinCore?: Record<string, string>;
    /** Open Graph metadata */
    openGraph?: Record<string, string>;
    /** Schema.org metadata */
    schemaOrg?: Record<string, string>;
  };
  /** When this profile was created */
  createdAt: number;
  /** When this profile was last updated */
  updatedAt: number;
}