# Content Signing API Integration - Refactoring Documentation

## Overview of the Refactoring Process

The Content Signing browser plugin has undergone a significant refactoring to integrate with the new Content Signing API. This refactoring involved replacing the previous WebAuthn-based authentication system with a more flexible API key-based approach, implementing a new API client for interacting with the Content Signing API, and updating the content signing and verification flows to work with the new API.

The refactoring was guided by the API integration plan outlined in `docs/api_integration_plan.md`, which provided a detailed roadmap for the changes needed. The primary goals of this refactoring were:

1. Replace WebAuthn authentication with API key-based authentication
2. Implement server configuration management to support multiple API endpoints
3. Create a comprehensive API client for the Content Signing API
4. Update the signing and verification flows to use the new API
5. Maintain backward compatibility where possible

## Key Components Modified

### 1. Authentication System (`src/core/auth/auth-service.ts`)

The authentication system underwent a complete overhaul, transitioning from WebAuthn to API key-based authentication:

- Removed WebAuthn client and related code
- Implemented API key storage and management
- Added support for multiple server configurations
- Created methods for author creation and API key association
- Updated authentication state management to check for API keys

### 2. API Client (`src/core/api/content-signing-client.ts`)

A new API client was created to interact with the Content Signing API:

- Implemented comprehensive methods for all API endpoints
- Added support for different API key types (author, general, admin)
- Created methods for content signing and verification
- Implemented directory services for key and content lookup

### 3. Data Types (`src/core/common/types.ts`)

The data types were updated to align with the new API:

- Added new types for API entities (Author, PublicKey, ContentSignature, etc.)
- Updated Settings type to include server configurations
- Added ServerConfig type for managing multiple API endpoints
- Maintained backward compatibility with existing types where possible

### 4. Background Script (`src/background/index.ts`)

The background script was updated to use the new API client and authentication system:

- Updated content signing and verification flows
- Implemented signature discovery mechanisms
- Added server configuration management
- Updated message handlers for popup, content, and options pages

### 5. Constants (`src/core/common/constants.ts`)

Constants were updated to include new API endpoints and types:

- Added Content Signing API endpoints
- Added author key types and cryptographic algorithms
- Updated default settings to include server configurations
- Maintained legacy constants for backward compatibility

## The New API Client

The new Content Signing API client (`src/core/api/content-signing-client.ts`) is a comprehensive client for interacting with the Content Signing API. It provides methods for all API endpoints and handles authentication, error handling, and response parsing.

### Key Features

1. **Flexible Configuration**: The client can be configured with different base URLs and timeout settings, allowing it to work with multiple API endpoints.

2. **API Key Management**: The client supports different types of API keys (author, general, admin) and provides methods for setting and clearing these keys.

3. **Author Management**: Methods for creating, retrieving, updating, and deleting authors, as well as retrieving an author's public key.

4. **Content Signing and Verification**: Core methods for signing content and verifying signatures.

5. **Directory Services**: Methods for searching public keys, getting key reputation, reporting keys, searching signed content, finding content occurrences, and reporting content misuse.

6. **Error Handling**: Comprehensive error handling with standardized error codes and messages.

### Usage Example

```typescript
// Create a client instance
const client = new ContentSigningClient({
  baseUrl: 'https://api.contentsigning.example.com/v1'
});

// Set an API key for authentication
client.setApiKey('your-api-key', 'author');

// Sign content
const signature = await client.signContent(
  'content-hash',
  'example.com',
  { title: 'Example Content', creator: 'John Doe' }
);

// Verify content
const verificationResult = await client.verifyContent(
  'content-hash',
  'example.com',
  'author-id',
  'signature'
);
```

## Authentication Mechanism Changes

The authentication mechanism has been completely redesigned, moving from WebAuthn to API keys. This change provides more flexibility and better supports the multi-server configuration model.

### Previous WebAuthn Authentication

The previous authentication system used WebAuthn for user registration and authentication:

1. User would register using WebAuthn, creating credentials on their device
2. Authentication would verify these credentials
3. User information was stored locally
4. A single backend server was assumed

### New API Key Authentication

The new authentication system uses API keys associated with specific server configurations:

1. **Server Configurations**: Users can configure multiple server endpoints, each with its own API key and author ID.
2. **Active Server**: One server is designated as active, and its API key is used for operations.
3. **Author Creation**: Users can create a new author on a server, which returns an API key.
4. **API Key Association**: Users can associate an existing API key with a server configuration.
5. **Authentication State**: A user is considered authenticated if they have an API key for the active server.

### Key Benefits

1. **Multiple Servers**: Support for multiple server configurations allows users to work with different environments (e.g., staging, production).
2. **Simplified Authentication**: API keys are simpler to manage than WebAuthn credentials.
3. **Flexibility**: Different API key types (author, general, admin) support different operations.
4. **Improved Security**: API keys are stored per server, limiting the impact of a compromised key.

## Content Verification and Signing

The content verification and signing processes have been updated to work with the new API, while maintaining the core functionality of the previous implementation.

### Content Signing Process

1. **Content Extraction**: The `ContentProcessor` extracts and normalizes content from the page.
2. **Content Hashing**: A hash of the normalized content is generated.
3. **Claims Collection**: Claims about the content are collected, either from user input or extracted metadata.
4. **API Call**: The content hash, domain, and claims are sent to the API for signing.
5. **Signature Storage**: The returned signature is stored in the page as meta tags.

### Content Verification Process

1. **Content Extraction**: The `ContentProcessor` extracts and normalizes content from the page.
2. **Signature Discovery**: The system attempts to find a signature for the content through:
   - Meta tags in the page
   - Directory lookup using the content hash
3. **API Call**: If a signature is found, the content hash, domain, author ID, and signature are sent to the API for verification.
4. **Result Handling**: The verification result is processed and displayed to the user.

### Signature Discovery

One of the key challenges in the refactoring was implementing a robust signature discovery mechanism. The current implementation uses two approaches:

1. **Signed Section Elements**: Looks for `<signed-section>` elements in the page with `keyid`, `signature`, `algorithm`, and `content-hash` attributes (as defined in the spec). The `authorId` is extracted from the `keyid` URL (the last path segment before `/public-key`).
2. **Directory Lookup**: If no `<signed-section>` element is found, it searches the directory for signatures matching the content hash.

This approach aligns with the spec paper's `<signed-section>` HTML format while maintaining backward compatibility through the directory lookup fallback.

## Migration Steps for Existing Users

Existing users will need to migrate from the WebAuthn-based system to the new API key-based system. The following steps are recommended:

1. **Update the Extension**: Users should update to the latest version of the extension, which includes the refactored code.

2. **Server Configuration**: Users will need to configure at least one server endpoint in the extension settings.

3. **Author Creation or API Key Association**:
   - New users can create an author on the server, which will generate an API key.
   - Existing users with an API key can associate it with a server configuration.

4. **Verify Existing Content**: Users should verify that their existing signed content is still recognized by the new system.

5. **Update Signature Storage**: For optimal compatibility, users may need to update how signatures are stored in their content (e.g., adding meta tags).

## Technical Implementation Details

### Server Configuration Management

Server configurations are stored in the extension settings and include:

- Server ID: A unique identifier for the server configuration
- Name: A user-friendly name for the server
- URL: The base URL of the API endpoint
- Author API Key: The API key for author operations (optional)
- Author ID: The ID of the author associated with the API key (optional)
- General API Key: The API key for general operations (optional)
- Active Status: Whether this is the active server configuration

The `AuthService` provides methods for managing these configurations:

- `addServerConfig`: Add a new server configuration
- `updateServerConfig`: Update an existing server configuration
- `removeServerConfig`: Remove a server configuration
- `setActiveServer`: Set a server as active

### API Key Storage

API keys are stored securely within the server configurations in the extension settings. The `AuthService` handles the storage and retrieval of these keys, ensuring they are only used with the appropriate server.

### Content Processing

The `ContentProcessor` remains largely unchanged, continuing to handle:

- Content extraction from the DOM
- Content normalization
- Metadata extraction
- Content hashing

This ensures compatibility with previously signed content while supporting the new API.

### Signature Format

The new signature format includes:

- Content Hash: The hash of the normalized content
- Domain: The domain associated with the content
- Author ID: The ID of the author who signed the content
- Signature: The cryptographic signature
- Claims: Additional claims about the content

This format is compatible with the API and provides rich information about the signed content.

## Conclusion

The refactoring of the Content Signing browser plugin to integrate with the new Content Signing API represents a significant improvement in functionality, flexibility, and security. The new API client provides comprehensive access to the API's capabilities, while the updated authentication system supports multiple server configurations and API key management.

The content signing and verification processes have been enhanced to work with the new API while maintaining compatibility with existing content. The signature discovery mechanism provides flexibility in how signatures are stored and retrieved.

These changes position the plugin for future enhancements, such as improved directory services, reputation systems, and content reporting features, all of which are supported by the new API.