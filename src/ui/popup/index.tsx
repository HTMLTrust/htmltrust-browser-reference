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
    }
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
        const verificationResult = await adapter.sendMessage(MessageContext.BACKGROUND, {
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
          metadata: initialMetadata
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
      await adapter.sendMessage(MessageContext.BACKGROUND, {
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
      await adapter.sendMessage(MessageContext.BACKGROUND, {
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
      const verificationResult = await adapter.sendMessage(MessageContext.BACKGROUND, {
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
      const signResult = await adapter.sendMessage(MessageContext.BACKGROUND, {
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
        
        <div className="verification-status">
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