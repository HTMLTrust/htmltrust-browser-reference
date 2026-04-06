# Content Signing Plugin - API Integration Plan

**1. Goal:** Refactor the browser plugin to replace the current WebAuthn-based authentication and placeholder signing/verification logic with the new Content Signing API (OpenAPI spec provided), incorporating per-server API key management.

**2. Current State Summary:**

*   **Authentication:** Uses WebAuthn, managed by `AuthService` interacting with a legacy backend (`/api/v1/webauthn/...`). Stores user info locally.
*   **Content Processing:** `ContentProcessor` handles DOM extraction, normalization, metadata gathering, and hashing (SHA-256, Simhash).
*   **Signing/Verification:** Placeholder logic in `background/index.ts`. No actual cryptographic signing or API calls are made. Relies on `ContentProcessor` for content preparation.
*   **Key Management:** Implicitly tied to WebAuthn credentials.
*   **Trust Directory:** `TrustDirectoryClient` exists but seems unused in core signing/verification flow.
*   **Server Config:** Likely uses a single hardcoded or basic setting for the backend URL.

**3. Target State (New API):**

*   **Authentication:** API Key-based (`AuthorApiKey` for signing/author updates, `GeneralApiKey` for general reads/reports, `AdminApiKey` for admin tasks). Keys are obtained during author creation (`POST /authors`) or potentially through a separate provisioning process. Keys are managed per configured server endpoint.
*   **Author Management:** API handles author creation, updates, and public key retrieval (`/authors`, `/authors/{authorId}/public-key`).
*   **Signing:** Requires `AuthorApiKey` associated with the active server. Client sends `contentHash`, `domain`, and `claims` to `POST /content/sign`. API performs signing using the author's server-side private key and returns the `ContentSignature`.
*   **Verification:** Public endpoint (`POST /content/verify`). Client sends `contentHash`, `domain`, `authorId`, and `signature`. API verifies against the author's public key and returns validity status, author details, and claims. Uses the active server URL.
*   **Directory Services:** API provides endpoints for searching keys, content, getting reputation, reporting keys/content (`/directory/...`).
*   **Server Config:** Plugin settings allow managing multiple server endpoints (e.g., staging, production), each with an optional associated `AuthorApiKey` and `authorId`. One server is marked as active.

**4. Functionality Mapping & Gap Analysis:**

| Current Plugin Functionality        | New API Endpoint(s)                                     | Mapping Notes & Gaps                                                                                                                                                                                                                                                           |
| :---------------------------------- | :------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Registration** (WebAuthn)    | `POST /authors`                                         | **Major Change:** Replace WebAuthn flow with API call against the *active server*. Need UI/flow for user to initiate author creation (providing name, type). Plugin needs to securely store the returned `AuthorApiKey` & `authorId` *associated with that server URL* in settings. **Gap:** API returns key *once*. Need robust storage/recovery mechanism. |
| **User Authentication** (WebAuthn)  | N/A (Uses `AuthorApiKey` header for active server)      | **Major Change:** Replace WebAuthn login flow. Authenticated state now depends on having a valid `AuthorApiKey` stored *for the active server*.                                                                                                                                    |
| **Get Current User Info**           | `GET /authors/{authorId}` (Requires Author ID for active server) | Need to use the stored `authorId` associated with the active server. Can fetch details if needed.                                                                                                                                                                            |
| **Sign Content** (Placeholder)      | `POST /content/sign` (Requires `AuthorApiKey` for active server) | **Major Change:** Replace placeholder with API call to the *active server*. Plugin sends `contentHash`, `domain`, `claims`. API handles signing. Need UI for selecting/inputting claims.                                                                                             |
| **Verify Content** (Placeholder)    | `POST /content/verify` (Uses active server URL)         | **Major Change:** Replace placeholder. Plugin needs to find the signature (e.g., from page metadata, directory lookup), extract necessary fields (`contentHash`, `domain`, `authorId`, `signature`), and call the API on the *active server*.                                        |
| **Content Extraction/Hashing**      | N/A (Client-side responsibility)                        | **No Change:** `ContentProcessor` logic remains relevant for preparing `contentHash`.                                                                                                                                                                                          |
| **Metadata Extraction**             | N/A (Client-side, potentially used for claims)          | **No Change:** `ContentProcessor` logic remains. Extracted metadata could pre-populate claims for signing.                                                                                                                                                                   |
| **Trust Directory Lookup** (Unused) | `/directory/*` endpoints (Uses active server URL)       | **Opportunity:** Can now implement features using `/directory/keys`, `/directory/content`, `/directory/keys/{keyId}/reputation` against the *active server* for richer verification context.                                                                                 |
| **Settings Management**             | N/A (Client-side)                                       | **Change:** Settings need to be extended to manage a list of server configurations (URL, optional ApiKey, optional AuthorId, active status).                                                                                                                                     |
| **Sign Out**                        | N/A (Client-side action)                                | **Change:** Signing out means deleting the stored `AuthorApiKey` and `authorId` *for the active server configuration*.                                                                                                                                                         |
| **Key Reporting** (N/A)             | `POST /directory/keys/{keyId}/report`                   | **New Feature:** Can add UI/functionality to report keys using this endpoint (requires `GeneralApiKey`, potentially also managed per server or globally).                                                                                                                   |
| **Content Misuse Reporting** (N/A)  | `POST /directory/content/report`                        | **New Feature:** Can add UI/functionality to report content misuse (requires `GeneralApiKey`).                                                                                                                                                                                 |
| **Claim Type Management** (N/A)     | `GET /claims`, `POST /claims` (Admin), `GET /claims/{id}` | **Potential Enhancement:** Plugin could fetch available claim types (`GET /claims` from active server) to populate UI choices during signing. Creating claims (`POST /claims`) is admin-only.                                                                                 |

**Gaps Summary:**

1.  **API Key Management:** Secure storage and potential recovery/backup of the `AuthorApiKey` is critical and not explicitly handled by the API itself after initial creation. Needs careful implementation within the plugin's settings storage.
2.  **Signature Discovery:** The API verifies a *provided* signature. The plugin needs a mechanism to *find* the signature associated with the content on a page (e.g., embedded metadata, separate manifest file, directory lookup via `GET /directory/content`). This discovery mechanism is outside the scope of the provided API spec and needs design.
3.  **General API Key Provisioning:** How does the plugin obtain a `GeneralApiKey` needed for reporting or potentially other read-only directory operations? This isn't covered in the author flow. Needs a strategy (e.g., user input in options).

**5. Refactoring Plan:**

```mermaid
graph TD
    subgraph Initialization
        A[Load Settings] --> B(Initialize API Client);
        A --> C(Load Stored Auth/Server Config);
        C --> D{API Key Present for Active Server?};
        D -- Yes --> E[Set Authenticated State];
        D -- No --> F[Set Unauthenticated State];
    end

    subgraph Settings & Config [Settings & Server Configuration]
        SA[User Action: Manage Servers (Options UI)] --> SB[Update Server List in Settings];
        SB --> SC[Store Updated Settings (URL, optional ApiKey, optional AuthorId)];
        SC --> SD[Re-initialize API Client / Update Auth State];
    end

    subgraph Authentication [Authentication Flow]
        G[User Action: Register/Login/Associate Key] --> H{API Key Stored for Active Server?};
        H -- No --> I[UI: Prompt for Author Details or Existing Key];
        I -- Register --> J(Call POST /authors on Active Server);
        J -- Success --> K[Store AuthorApiKey & authorId for Server];
        K --> L[Set Authenticated State];
        J -- Failure --> M[Show Error];
        I -- Associate Existing Key --> K;
        H -- Yes --> L;
        N[User Action: Sign Out / Disassociate Key] --> O[Clear Stored API Key & authorId for Active Server];
        O --> P[Set Unauthenticated State];
    end

    subgraph Signing [Content Signing Flow]
        Q[User Action: Sign Page] --> R{Authenticated for Active Server?};
        R -- No --> S[Prompt Login/Register/Associate Key];
        R -- Yes --> T[Extract/Process Content (ContentProcessor)];
        T --> U[UI: Prompt for Claims];
        U --> V[Prepare Payload (contentHash, domain, claims)];
        V --> W(Call POST /content/sign w/ Server's AuthorApiKey);
        W -- Success --> X[Store/Display Signature Info];
        W -- Failure --> Y[Show Error];
    end

    subgraph Verification [Content Verification Flow]
        Z[Page Load / User Action: Verify] --> AA[Extract/Process Content (ContentProcessor)];
        AA --> BB[Discover Signature (Metadata/Directory?)];
        BB -- Found --> CC[Prepare Payload (contentHash, domain, authorId, signature)];
        CC --> DD(Call POST /content/verify using active server URL);
        DD -- Success --> EE[Display Verification Result (Valid/Invalid, Author, Claims)];
        BB -- Not Found --> FF[Display 'Not Signed'];
        DD -- Failure --> GG[Show Error];
    end

    subgraph Directory [Directory Interaction (Optional)]
        HH[Verification Flow] --> II(Call GET /directory/keys/{keyId}/reputation on Active Server);
        II --> JJ[Display Key Reputation];
        KK[User Action: Report Key/Content] --> LL{GeneralApiKey Present?};
        LL -- Yes --> MM[Call POST /directory/.../report on Active Server];
        LL -- No --> NN[Inform User (Feature Unavailable)];
    end

    style K fill:#cfc,stroke:#333,stroke-width:2px
    style O fill:#fcc,stroke:#333,stroke-width:2px
    style W fill:#ccf,stroke:#333,stroke-width:2px
    style DD fill:#ccf,stroke:#333,stroke-width:2px
    style BB fill:#f9f,stroke:#333,stroke-width:2px;
    style SB fill:#ffc,stroke:#333,stroke-width:2px;
```

**Detailed Steps:**

1.  **API Client Module:**
    *   Create a new module (e.g., `src/core/api/content-signing-client.ts`) to encapsulate all interactions with the new API.
    *   Implement methods for each required endpoint (`createAuthor`, `signContent`, `verifyContent`, `getAuthor`, `getAuthorPublicKey`, potentially directory calls).
    *   Methods requiring authentication should accept the relevant API key (`AuthorApiKey` or `GeneralApiKey`) and add it to the request headers.
    *   Methods should accept the base URL for the target server.
    *   Replace `TrustDirectoryClient` usage if its functionality is covered by the new API's `/directory` endpoints.

2.  **Settings & Configuration:**
    *   Modify the `Settings` type (`src/core/common/types.ts`) to include a structure for server configurations (e.g., `serverConfigs: { id: string; name: string; url: string; apiKey?: string; authorId?: string; isActive?: boolean }[]`). Use a unique `id` for each config.
    *   Update the options UI (`src/ui/options/index.tsx`) to manage this list: add/edit/delete servers, input optional API keys/author IDs, and select an active server.
    *   Refactor `background/index.ts` initialization to load these server configs and determine the active server URL and associated key/authorId (if any).
    *   Update `AuthService` and `ContentSigningClient` consumers to pass the API key, author ID, and URL associated with the *active* server configuration when making calls.

3.  **Authentication Refactoring (`AuthService` & UI):**
    *   **Remove WebAuthn:** Delete `WebAuthnClient` and all related code in `AuthService`.
    *   **API Key Storage:** Modify `AuthService` (or a new dedicated service/manager) to interact with the settings storage to retrieve/update the `AuthorApiKey` and `authorId` for a given server configuration. **Crucially, decide on the storage mechanism (e.g., `chrome.storage.local`, consider security implications).**
    *   **New State:** `isAuthenticated` should now check for the presence of an `AuthorApiKey` associated with the *active* server configuration in settings. `getCurrentUser` might fetch author details using the stored `authorId` and the API client (`GET /authors/{authorId}` on the active server).
    *   **New Flows:**
        *   Implement `createAuthor` flow: Calls the API client's `createAuthor` method against the active server, updates the active server's config with the returned key/ID upon success.
        *   Implement `associateApiKey` flow: Allows users to paste an existing key/ID and associate it with a server config.
        *   Implement `signOut` (or `disassociateKey`): Clears the key/ID for the *active* server configuration in settings.
    *   **UI Changes:** Update popup/options UI to remove WebAuthn elements and add flows for managing server configs, creating an author, associating an existing API key, and signing out/disassociating the key for the active server.

4.  **Signing Logic (`background/index.ts`):**
    *   Modify `signContent` function:
        *   Check authentication status using the refactored `AuthService` (checking active server config).
        *   Retrieve the stored `AuthorApiKey` and URL for the *active* server.
        *   Extract content using `ContentProcessor` (`contentHash`).
        *   Get the current `domain`.
        *   **Add UI interaction (via messaging) to collect `claims` from the user.**
        *   Call the API client's `signContent` method with the key, hash, domain, claims, and active server URL.
        *   Handle the response (display success/error, potentially store the returned signature details).

5.  **Verification Logic (`background/index.ts`):**
    *   Modify `verifyContent` function:
        *   Retrieve the *active* server URL.
        *   Extract content using `ContentProcessor` (`contentHash`).
        *   Get the current `domain`.
        *   **Implement Signature Discovery:** Determine how to find the `signature` and `authorId` for the content (this is a key missing piece - needs design. Options: check meta tags, look for a linked manifest, query `GET /directory/content` with `contentHash` on the active server).
        *   If signature details are found, call the API client's `verifyContent` method with hash, domain, authorId, signature, using the active server URL.
        *   Handle the response: Update UI/badge based on `valid` status, display author info and claims.
        *   If no signature is found, indicate "Not Signed".

6.  **Types/Interfaces:**
    *   Update `src/core/common/types.ts`:
        *   Modify or replace the `User` type to align with the API's `Author` schema.
        *   Add types corresponding to API schemas (`ContentSignature`, `Claim`, `PublicKey`, etc.) if not already present or sufficiently similar.
        *   Update `Settings` type as described in step 2.

7.  **Component Updates (UI):**
    *   `ProfileManager.tsx`/`ProfileSelector.tsx`: Adapt to handle server configurations and associated API keys instead of WebAuthn users.
    *   `MetadataInput.tsx`: Could be repurposed or enhanced for inputting claims during signing.
    *   `VerificationStatus.tsx`: Update to display richer verification info from the API (author details, claims).
    *   Options UI: Major updates needed for server configuration management.

8.  **Address Gaps:**
    *   **API Key Storage:** Implement the chosen secure storage method within the settings structure.
    *   **Signature Discovery:** Design and implement the mechanism to find signatures on a page.
    *   **General API Key:** Determine how the `GeneralApiKey` will be provided/managed if reporting features are implemented (e.g., user input in options, potentially per-server or global).

9.  **Testing Strategy:**
    *   Unit tests for the new API client module (mocking API calls).
    *   Unit tests for the refactored `AuthService` / settings manager.
    *   Unit tests for server configuration logic.
    *   Integration tests for signing and verification flows (potentially using mock API responses or a staging API environment).
    *   Integration tests for switching active servers.
    *   End-to-end tests simulating user actions in the browser (managing servers, signing, verifying).