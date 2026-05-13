/**
 * Popup entry point
 */
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Settings, User, Profile } from '../../core/common';
import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_PROFILE } from '../../core/common/constants';
import { PlatformAdapter, MessageContext } from '../../platforms/common';
import { MetadataInput, ProfileSelector } from '../components';

// Import styles
import '../../assets/profile-selector.css';

// Import platform-specific adapter
// This will be replaced with the correct adapter at build time
import { ChromiumAdapter } from '../../platforms/chromium';

// Initialize platform adapter
const platformAdapter: PlatformAdapter = new ChromiumAdapter();

/**
 * Per-section verification snapshot served by the content script.
 * Mirrors PageVerification in src/content-scripts/index.ts.
 */
interface PageVerification {
  index: number;
  valid: boolean;
  reason: string | null;
  trustScore: number;
  trustIndicator: 'green' | 'yellow' | 'red';
  trustLabel: string;
  keyid: string;
  algorithm: string;
  signedAt: string;
  domain: string;
  claims: Record<string, string>;
}

/**
 * Popup component props
 */
interface PopupProps {
  adapter: PlatformAdapter;
}

/**
 * Popup component state
 */
interface PopupState {
  user: User | null;
  settings: Settings;
  profiles: Profile[];
  activeProfileId: string | null;
  isLoading: boolean;
  error: string | null;
  currentUrl: string;
  isVerified: boolean;
  verificationStatus: string;
  showMetadataInput: boolean;
  metadata: {
    dublinCore: Record<string, string>;
    openGraph: Record<string, string>;
    schemaOrg: Record<string, string>;
  };
  pageVerifications: PageVerification[];
  pageVerificationsLoaded: boolean;
}

/**
 * Send GET_PAGE_VERIFICATIONS to the active tab's content script.
 * Returns an empty list on any error so the popup always renders.
 */
async function loadPageVerifications(): Promise<PageVerification[]> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return [];
    const reply = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_VERIFICATIONS' });
    return Array.isArray(reply?.results) ? (reply.results as PageVerification[]) : [];
  } catch {
    return [];
  }
}

/**
 * Popup component
 */
const Popup: React.FC<PopupProps> = ({ adapter }) => {
  const [state, setState] = useState<PopupState>({
    user: null,
    settings: DEFAULT_SETTINGS,
    profiles: [],
    activeProfileId: null,
    isLoading: true,
    error: null,
    currentUrl: '',
    isVerified: false,
    verificationStatus: 'Not verified',
    showMetadataInput: false,
    metadata: {
      dublinCore: {},
      openGraph: {},
      schemaOrg: {}
    },
    pageVerifications: [],
    pageVerificationsLoaded: false,
  });

  useEffect(() => {
    const initializePopup = async () => {
      try {
        // Get the current tab
        const currentTab = await adapter.getCurrentTab();
        
        // Get the storage interface
        const storage = adapter.getStorage();
        
        // Get the user from storage
        const user = await storage.get<User>(STORAGE_KEYS.USER);
        
        // Get the settings from storage
        const settings = await storage.get<Settings>(STORAGE_KEYS.SETTINGS) || DEFAULT_SETTINGS;
        
        // Get the profiles from storage
        let profiles = await storage.get<Profile[]>(STORAGE_KEYS.PROFILES) || [];
        
        // If no profiles exist, create the default profile
        if (profiles.length === 0) {
          profiles = [DEFAULT_PROFILE];
          await storage.set(STORAGE_KEYS.PROFILES, profiles);
        }
        
        // Get the active profile ID from storage
        const activeProfileId = await storage.get<string>(STORAGE_KEYS.ACTIVE_PROFILE) ||
          profiles.find(p => p.isDefault)?.id || profiles[0].id;
        
        // Get the verification status for the current URL
        const verificationResult = await adapter.sendMessage(MessageContext.POPUP, {
          type: 'GET_VERIFICATION_STATUS',
          url: currentTab.url,
        });
        
        // Get the initial metadata from the active profile
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        const initialMetadata = {
          dublinCore: activeProfile?.metadata?.dublinCore || {},
          openGraph: activeProfile?.metadata?.openGraph || {},
          schemaOrg: activeProfile?.metadata?.schemaOrg || {}
        };
        
        setState({
          user,
          settings,
          profiles,
          activeProfileId,
          isLoading: false,
          error: null,
          currentUrl: currentTab.url,
          isVerified: verificationResult?.verified || false,
          verificationStatus: verificationResult?.status || 'Not verified',
          showMetadataInput: false,
          metadata: initialMetadata,
          pageVerifications: [],
          pageVerificationsLoaded: false,
        });

        // Pull per-section results from the active tab's content script.
        // Best-effort: pages without signed-section content reply with
        // results=[] (or with nothing at all if the content script never
        // initialized), and we treat both the same.
        loadPageVerifications().then((results) => {
          setState((prev) => ({
            ...prev,
            pageVerifications: results,
            pageVerificationsLoaded: true,
          }));
        });
      } catch (error) {
        setState(prevState => ({
          ...prevState,
          isLoading: false,
          error: (error as Error).message,
        }));
      }
    };
    
    initializePopup();
  }, [adapter]);

  const handleSignIn = async () => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Send a message to the background script to open the sign-in page
      await adapter.sendMessage(MessageContext.POPUP, {
        type: 'OPEN_SIGN_IN',
      });
      
      setState(prevState => ({ ...prevState, isLoading: false }));
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  const handleSignOut = async () => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Send a message to the background script to sign out
      await adapter.sendMessage(MessageContext.POPUP, {
        type: 'SIGN_OUT',
      });
      
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        user: null,
      }));
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  const handleVerifyContent = async () => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Send a message to the background script to verify the content
      const verificationResult = await adapter.sendMessage(MessageContext.POPUP, {
        type: 'VERIFY_CONTENT',
        url: state.currentUrl,
      });
      
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        isVerified: verificationResult?.verified || false,
        verificationStatus: verificationResult?.status || 'Not verified',
      }));
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  const handleSignContent = async () => {
    // If metadata input is not shown, show it first
    if (!state.showMetadataInput) {
      setState(prevState => ({
        ...prevState,
        showMetadataInput: true
      }));
      return;
    }
    
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Get the active profile
      const activeProfile = state.profiles.find(p => p.id === state.activeProfileId) ||
        state.profiles.find(p => p.isDefault) ||
        state.profiles[0];
      
      // Send a message to the background script to sign the content
      const signResult = await adapter.sendMessage(MessageContext.POPUP, {
        type: 'SIGN_CONTENT',
        url: state.currentUrl,
        metadata: state.metadata,
        trustDirectoryUrl: activeProfile.trustDirectoryUrl
      });
      
      // Save the metadata to the profile
      const updatedProfiles = state.profiles.map(profile => {
        if (profile.id === activeProfile.id) {
          return {
            ...profile,
            metadata: {
              dublinCore: state.metadata.dublinCore,
              openGraph: state.metadata.openGraph,
              schemaOrg: state.metadata.schemaOrg
            },
            updatedAt: Date.now()
          };
        }
        return profile;
      });
      
      // Save the updated profiles to storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.PROFILES, updatedProfiles);
      
      setState(prevState => ({
        ...prevState,
        profiles: updatedProfiles,
        isLoading: false,
        isVerified: true,
        verificationStatus: 'Signed by you',
        showMetadataInput: false
      }));
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };
  
  // Handle metadata changes
  const handleMetadataChange = (metadata: PopupState['metadata']) => {
    setState(prevState => ({
      ...prevState,
      metadata
    }));
  };
  
  // Handle profile selection
  const handleProfileSelect = async (profileId: string) => {
    try {
      // Find the selected profile
      const selectedProfile = state.profiles.find(p => p.id === profileId);
      if (!selectedProfile) return;
      
      // Update the active profile in storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.ACTIVE_PROFILE, profileId);
      
      // Update the metadata with the profile's metadata
      const profileMetadata = {
        dublinCore: selectedProfile.metadata.dublinCore || {},
        openGraph: selectedProfile.metadata.openGraph || {},
        schemaOrg: selectedProfile.metadata.schemaOrg || {}
      };
      
      setState(prevState => ({
        ...prevState,
        activeProfileId: profileId,
        metadata: profileMetadata
      }));
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        error: (error as Error).message,
      }));
    }
  };

  const handleOpenOptions = async () => {
    await adapter.openOptionsPage();
  };

  if (state.isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (state.error) {
    return <div className="error">Error: {state.error}</div>;
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>Content Signing</h1>
        {state.user ? (
          <div className="user-info">
            <span>Signed in as {state.user.name}</span>
            <button onClick={handleSignOut}>Sign Out</button>
          </div>
        ) : (
          <button onClick={handleSignIn}>Sign In</button>
        )}
      </header>
      
      <main className="popup-content">
        <div className="current-url">
          <h2>Current Page</h2>
          <p>{state.currentUrl}</p>
        </div>
        
        <div className="htmltrust-sections">
          <h2>HTMLTrust Sections{state.pageVerifications.length > 0 ? ` (${state.pageVerifications.length})` : ''}</h2>
          {!state.pageVerificationsLoaded ? (
            <p style={{ opacity: 0.7 }}>Verifying…</p>
          ) : state.pageVerifications.length === 0 ? (
            <p style={{ opacity: 0.7 }}>No signed sections on this page.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {state.pageVerifications.map((v) => {
                const bg = v.valid
                  ? '#d4edda'
                  : '#f8d7da';
                const fg = v.valid ? '#155724' : '#721c24';
                const trustBg =
                  v.trustIndicator === 'green' ? '#d4edda'
                  : v.trustIndicator === 'red' ? '#f8d7da'
                  : '#fff3cd';
                const trustFg =
                  v.trustIndicator === 'green' ? '#155724'
                  : v.trustIndicator === 'red' ? '#721c24'
                  : '#856404';
                return (
                  <li
                    key={v.index}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      padding: 8,
                      marginBottom: 8,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 4 }}>
                        {v.valid ? '✓ Signature valid' : `✗ Signature invalid${v.reason ? ` (${v.reason})` : ''}`}
                      </span>
                      <span style={{ background: trustBg, color: trustFg, padding: '2px 8px', borderRadius: 4 }}>
                        Trust {v.trustScore}% · {v.trustLabel}
                      </span>
                    </div>
                    {v.keyid ? (
                      <div style={{ wordBreak: 'break-all' }}>
                        <strong>Signer:</strong> {v.keyid}
                      </div>
                    ) : null}
                    {v.signedAt ? (
                      <div>
                        <strong>Signed at:</strong> {v.signedAt}
                      </div>
                    ) : null}
                    {v.domain ? (
                      <div>
                        <strong>Domain:</strong> {v.domain}
                      </div>
                    ) : null}
                    {Object.keys(v.claims).length > 0 ? (
                      <div style={{ marginTop: 4 }}>
                        <strong>Claims:</strong>
                        <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                          {Object.entries(v.claims).map(([k, val]) => (
                            <li key={k}>
                              <em>{k}</em>: {val}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="verification-status" style={{ display: 'none' }}>
          <h2>Verification Status</h2>
          <p className={state.isVerified ? 'verified' : 'not-verified'}>
            {state.verificationStatus}
          </p>
        </div>
        
        {state.showMetadataInput ? (
          <div className="metadata-section">
            <h2>Add Metadata</h2>
            
            {state.profiles.length > 0 && (
              <ProfileSelector
                profiles={state.profiles}
                selectedProfileId={state.activeProfileId || undefined}
                onSelectProfile={handleProfileSelect}
              />
            )}
            
            <p>Add metadata to be included with your signature:</p>
            <MetadataInput
              initialMetadata={state.metadata}
              onChange={handleMetadataChange}
            />
            <div className="metadata-actions">
              <button onClick={() => setState(prevState => ({ ...prevState, showMetadataInput: false }))}>
                Cancel
              </button>
              <button onClick={handleSignContent} className="primary">
                Sign with Metadata
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button onClick={handleVerifyContent} disabled={!state.settings.autoVerify}>
              Verify Content
            </button>
            
            {state.user && (
              <button onClick={handleSignContent}>
                Sign Content
              </button>
            )}
          </div>
        )}
      </main>
      
      <footer className="popup-footer">
        <button onClick={handleOpenOptions}>Options</button>
        <div className="version">v{adapter.getManifest().version}</div>
      </footer>
    </div>
  );
};

// Render the popup
const container = document.getElementById('popup-root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup adapter={platformAdapter} />);
}