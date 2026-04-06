/**
 * Constants for the Content Signing extension
 */

/**
 * Extension name
 */
export const EXTENSION_NAME = 'Content Signing';

/**
 * Extension version
 */
export const EXTENSION_VERSION = '1.0.0';

/**
 * Default settings for the extension
 */
export const DEFAULT_SETTINGS = {
  autoVerify: true,
  showBadges: true,
  highlightVerified: true,
  highlightUnverified: false,
  trustDirectoryUrl: 'https://api.trustdirectory.example.com',
  authMethod: 'apikey' as const,
  serverConfigs: [
    {
      id: 'default',
      name: 'Default Server',
      url: 'https://api.contentsigning.example.com/v1',
      isActive: true
    }
  ],
  activeServerId: 'default'
};

/**
 * Error codes
 */
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  WEBAUTHN_ERROR: 'WEBAUTHN_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Message types for communication between extension components
 */
export const MESSAGE_TYPES = {
  VERIFY_CONTENT: 'VERIFY_CONTENT',
  SIGN_CONTENT: 'SIGN_CONTENT',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_SETTINGS: 'GET_SETTINGS',
  AUTH_REQUEST: 'AUTH_REQUEST',
  AUTH_RESPONSE: 'AUTH_RESPONSE',
  CONTENT_DETECTED: 'CONTENT_DETECTED',
  SUBMIT_VOTE: 'SUBMIT_VOTE',
  VOTE_ACKNOWLEDGED: 'VOTE_ACKNOWLEDGED',
};

/**
 * Storage keys
 */
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  USER: 'user',
  TRUST_DIRECTORY_CACHE: 'trustDirectoryCache',
  VERIFICATION_RESULTS: 'verificationResults',
  PROFILES: 'profiles',
  ACTIVE_PROFILE: 'activeProfile',
  AUTHOR_VOTES: 'authorVotes', // Prefix for storing votes per author (e.g., 'authorVotes:authorId123')
  PENDING_VOTES: 'pendingVotes', // Queue of votes pending submission to the server
};

/**
 * Default profile for the extension
 */
export const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Default Profile',
  description: 'Default content signing profile',
  isDefault: true,
  trustDirectoryUrl: 'https://api.trustdirectory.example.com',
  metadata: {
    dublinCore: {},
    openGraph: {},
    schemaOrg: {},
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * CSS classes for content highlighting
 */
export const CSS_CLASSES = {
  CONTENT_OUTLINE: 'cs-content-outline',
  VERIFIED_CONTENT: 'cs-verified-content',
  UNVERIFIED_CONTENT: 'cs-unverified-content',
  UNKNOWN_CONTENT: 'cs-unknown-content',
  VERIFICATION_BADGES: 'cs-verification-badges',
  VERIFICATION_BADGE: 'cs-verification-badge',
  VALIDITY_BADGE: 'cs-validity-badge',
  VERIFICATION_BADGE_VERIFIED: 'cs-verification-badge-verified',
  VERIFICATION_BADGE_UNVERIFIED: 'cs-verification-badge-unverified',
  TRUST_BADGE: 'cs-trust-badge',
  TRUST_BADGE_TRUSTED: 'cs-trust-badge-trusted',
  TRUST_BADGE_UNTRUSTED: 'cs-trust-badge-untrusted',
  TRUST_BADGE_UNKNOWN: 'cs-trust-badge-unknown',
  TOOLTIP: 'cs-tooltip',
  VOTE_BUTTONS: 'cs-vote-buttons',
  VOTE_BUTTON: 'cs-vote-button',
  UPVOTE_BUTTON: 'cs-upvote-button',
  DOWNVOTE_BUTTON: 'cs-downvote-button',
  VOTE_BUTTON_ACTIVE: 'cs-vote-button-active',
};

/**
 * Trust status types
 */
export const TRUST_STATUS: {
  TRUSTED: 'trusted',
  UNTRUSTED: 'untrusted',
  UNKNOWN: 'unknown'
} = {
  TRUSTED: 'trusted' as const,
  UNTRUSTED: 'untrusted' as const,
  UNKNOWN: 'unknown' as const,
};

/**
 * WebAuthn related constants
 */
export const WEBAUTHN = {
  TIMEOUT: 60000, // 1 minute
  USER_VERIFICATION: 'preferred' as const,
  ATTESTATION: 'none' as const,
  AUTHENTICATOR_ATTACHMENT: 'platform' as const,
};

/**
 * API endpoints for the legacy Trust Directory API
 */
export const API_ENDPOINTS = {
  // Legacy endpoints
  TRUST_DIRECTORY: '/api/v1/trust-directory',
  USERS: '/api/v1/users',
  VERIFY: '/api/v1/verify',
  SIGN: '/api/v1/sign',
  WEBAUTHN_REGISTER_OPTIONS: '/api/v1/webauthn/register/options',
  WEBAUTHN_REGISTER_VERIFY: '/api/v1/webauthn/register/verify',
  WEBAUTHN_AUTHENTICATE_OPTIONS: '/api/v1/webauthn/authenticate/options',
  WEBAUTHN_AUTHENTICATE_VERIFY: '/api/v1/webauthn/authenticate/verify',
  
  // Content Signing API endpoints
  AUTHORS: '/authors',
  CONTENT_SIGN: '/content/sign',
  CONTENT_VERIFY: '/content/verify',
  CLAIMS: '/claims',
  DIRECTORY_KEYS: '/directory/keys',
  DIRECTORY_CONTENT: '/directory/content',
  VOTES_BATCH: '/votes/batch', // Endpoint for batch vote submission
};

/**
 * Author key types
 */
export const AUTHOR_KEY_TYPES: {
  HUMAN: 'HUMAN',
  AI: 'AI',
  HUMAN_AI_MIX: 'HUMAN_AI_MIX',
  ORGANIZATION: 'ORGANIZATION'
} = {
  HUMAN: 'HUMAN' as const,
  AI: 'AI' as const,
  HUMAN_AI_MIX: 'HUMAN_AI_MIX' as const,
  ORGANIZATION: 'ORGANIZATION' as const,
};

/**
 * Cryptographic algorithms
 */
export const CRYPTO_ALGORITHMS: {
  RSA: 'RSA',
  ECDSA: 'ECDSA',
  ED25519: 'ED25519'
} = {
  RSA: 'RSA' as const,
  ECDSA: 'ECDSA' as const,
  ED25519: 'ED25519' as const,
};

/**
 * Report reason types
 */
export const REPORT_REASONS = {
  IMPERSONATION: 'IMPERSONATION',
  MISINFORMATION: 'MISINFORMATION',
  SPAM: 'SPAM',
  OTHER: 'OTHER',
  COPYRIGHT_VIOLATION: 'COPYRIGHT_VIOLATION',
  UNAUTHORIZED_USE: 'UNAUTHORIZED_USE',
};

/**
 * Report status types
 */
export const REPORT_STATUS = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
};