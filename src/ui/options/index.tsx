/**
 * Options page entry point
 */
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Settings, Profile, getTrustDirectoryUrls } from '../../core/common';
import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_PROFILE } from '../../core/common/constants';
import { PlatformAdapter, MessageContext } from '../../platforms/common';
import { ProfileManager } from '../../ui/components';

// Import styles
import '../../assets/profile-manager.css';

// Import platform-specific adapter
// This will be replaced with the correct adapter at build time
import { ChromiumAdapter } from '../../platforms/chromium';

// Initialize platform adapter
const platformAdapter: PlatformAdapter = new ChromiumAdapter();

/**
 * Options component props
 */
interface OptionsProps {
  adapter: PlatformAdapter;
}

/**
 * Options component state
 */
interface OptionsState {
  settings: Settings;
  profiles: Profile[];
  activeProfileId: string | null;
  isLoading: boolean;
  error: string | null;
  isSaved: boolean;
}

/**
 * Options component
 */
const Options: React.FC<OptionsProps> = ({ adapter }) => {
  const [state, setState] = useState<OptionsState>({
    settings: DEFAULT_SETTINGS,
    profiles: [],
    activeProfileId: null,
    isLoading: true,
    error: null,
    isSaved: false,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get the storage interface
        const storage = adapter.getStorage();
        
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
        
        setState({
          settings,
          profiles,
          activeProfileId,
          isLoading: false,
          error: null,
          isSaved: false,
        });
      } catch (error) {
        setState(prevState => ({
          ...prevState,
          isLoading: false,
          error: (error as Error).message,
        }));
      }
    };
    
    loadData();
  }, [adapter]);

  // Handle setting change
  const handleSettingChange = (key: keyof Settings, value: any) => {
    setState(prevState => ({
      ...prevState,
      settings: {
        ...prevState.settings,
        [key]: value,
      },
      isSaved: false,
    }));
  };

  // Handle save settings
  const handleSaveSettings = async () => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Save the settings to storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.SETTINGS, state.settings);
      
      // Notify the background script that settings have changed
      await adapter.sendMessage(MessageContext.OPTIONS, {
        type: 'UPDATE_SETTINGS',
        settings: state.settings,
      });
      
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        isSaved: true,
      }));
      
      // Reset the saved status after a delay
      setTimeout(() => {
        setState(prevState => ({
          ...prevState,
          isSaved: false,
        }));
      }, 3000);
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  // Handle reset settings
  const handleResetSettings = () => {
    setState(prevState => ({
      ...prevState,
      settings: DEFAULT_SETTINGS,
      isSaved: false,
    }));
  };

  // Handle create profile
  const handleCreateProfile = async (profileData: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Create a new profile
      const newProfile: Profile = {
        ...profileData,
        id: `profile_${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      // If this is the default profile, update other profiles
      const updatedProfiles = [...state.profiles];
      if (newProfile.isDefault) {
        updatedProfiles.forEach(profile => {
          if (profile.id !== newProfile.id) {
            profile.isDefault = false;
          }
        });
      }
      
      // Add the new profile
      updatedProfiles.push(newProfile);
      
      // Save the profiles to storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.PROFILES, updatedProfiles);
      
      // If this is the first profile or it's set as default, make it active
      if (updatedProfiles.length === 1 || newProfile.isDefault) {
        await storage.set(STORAGE_KEYS.ACTIVE_PROFILE, newProfile.id);
      }
      
      setState(prevState => ({
        ...prevState,
        profiles: updatedProfiles,
        activeProfileId: updatedProfiles.length === 1 || newProfile.isDefault
          ? newProfile.id
          : prevState.activeProfileId,
        isLoading: false,
        isSaved: true,
      }));
      
      // Reset the saved status after a delay
      setTimeout(() => {
        setState(prevState => ({
          ...prevState,
          isSaved: false,
        }));
      }, 3000);
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  // Handle update profile
  const handleUpdateProfile = async (updatedProfile: Profile) => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Update the profile
      const updatedProfiles = state.profiles.map(profile => {
        if (profile.id === updatedProfile.id) {
          return {
            ...updatedProfile,
            updatedAt: Date.now(),
          };
        }
        
        // If the updated profile is now default, update other profiles
        if (updatedProfile.isDefault && profile.id !== updatedProfile.id) {
          return {
            ...profile,
            isDefault: false,
          };
        }
        
        return profile;
      });
      
      // Save the profiles to storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.PROFILES, updatedProfiles);
      
      // If the updated profile is now default, make it active
      if (updatedProfile.isDefault) {
        await storage.set(STORAGE_KEYS.ACTIVE_PROFILE, updatedProfile.id);
      }
      
      setState(prevState => ({
        ...prevState,
        profiles: updatedProfiles,
        activeProfileId: updatedProfile.isDefault
          ? updatedProfile.id
          : prevState.activeProfileId,
        isLoading: false,
        isSaved: true,
      }));
      
      // Reset the saved status after a delay
      setTimeout(() => {
        setState(prevState => ({
          ...prevState,
          isSaved: false,
        }));
      }, 3000);
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  // Handle delete profile
  const handleDeleteProfile = async (profileId: string) => {
    try {
      // Don't allow deleting the last profile
      if (state.profiles.length <= 1) {
        throw new Error('Cannot delete the only profile');
      }
      
      // Don't allow deleting the default profile
      const profileToDelete = state.profiles.find(p => p.id === profileId);
      if (profileToDelete?.isDefault) {
        throw new Error('Cannot delete the default profile');
      }
      
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Remove the profile
      const updatedProfiles = state.profiles.filter(profile => profile.id !== profileId);
      
      // Save the profiles to storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.PROFILES, updatedProfiles);
      
      // If the deleted profile was active, switch to the default profile
      let newActiveProfileId = state.activeProfileId;
      if (state.activeProfileId === profileId) {
        const defaultProfile = updatedProfiles.find(p => p.isDefault) || updatedProfiles[0];
        newActiveProfileId = defaultProfile.id;
        await storage.set(STORAGE_KEYS.ACTIVE_PROFILE, newActiveProfileId);
      }
      
      setState(prevState => ({
        ...prevState,
        profiles: updatedProfiles,
        activeProfileId: newActiveProfileId,
        isLoading: false,
        isSaved: true,
      }));
      
      // Reset the saved status after a delay
      setTimeout(() => {
        setState(prevState => ({
          ...prevState,
          isSaved: false,
        }));
      }, 3000);
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  // Handle select profile
  const handleSelectProfile = async (profileId: string) => {
    try {
      setState(prevState => ({ ...prevState, isLoading: true }));
      
      // Save the active profile to storage
      const storage = adapter.getStorage();
      await storage.set(STORAGE_KEYS.ACTIVE_PROFILE, profileId);
      
      setState(prevState => ({
        ...prevState,
        activeProfileId: profileId,
        isLoading: false,
        isSaved: true,
      }));
      
      // Reset the saved status after a delay
      setTimeout(() => {
        setState(prevState => ({
          ...prevState,
          isSaved: false,
        }));
      }, 3000);
    } catch (error) {
      setState(prevState => ({
        ...prevState,
        isLoading: false,
        error: (error as Error).message,
      }));
    }
  };

  if (state.isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (state.error) {
    return <div className="error">Error: {state.error}</div>;
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>Content Signing Options</h1>
      </header>
      
      <main className="options-content">
        <div className="option-group">
          <h2>Profiles</h2>
          <p className="option-description">
            Manage your content signing profiles. Profiles allow you to save sets of metadata values and server configurations.
          </p>
          
          <ProfileManager
            profiles={state.profiles}
            activeProfileId={state.activeProfileId || undefined}
            onSelectProfile={handleSelectProfile}
            onCreateProfile={handleCreateProfile}
            onUpdateProfile={handleUpdateProfile}
            onDeleteProfile={handleDeleteProfile}
          />
        </div>
        
        <div className="option-group">
          <h2>Verification Settings</h2>
          
          <div className="option">
            <label>
              <input
                type="checkbox"
                checked={state.settings.autoVerify}
                onChange={(e) => handleSettingChange('autoVerify', e.target.checked)}
              />
              Automatically verify content
            </label>
            <p className="option-description">
              Automatically verify content when visiting a page
            </p>
          </div>
          
          <div className="option">
            <label>
              <input
                type="checkbox"
                checked={state.settings.showBadges}
                onChange={(e) => handleSettingChange('showBadges', e.target.checked)}
              />
              Show verification badges
            </label>
            <p className="option-description">
              Show badges next to verified content
            </p>
          </div>
          
          <div className="option">
            <label>
              <input
                type="checkbox"
                checked={state.settings.highlightVerified}
                onChange={(e) => handleSettingChange('highlightVerified', e.target.checked)}
              />
              Highlight verified content
            </label>
            <p className="option-description">
              Apply a highlight style to verified content
            </p>
          </div>
          
          <div className="option">
            <label>
              <input
                type="checkbox"
                checked={state.settings.highlightUnverified}
                onChange={(e) => handleSettingChange('highlightUnverified', e.target.checked)}
              />
              Highlight unverified content
            </label>
            <p className="option-description">
              Apply a highlight style to unverified content
            </p>
          </div>
        </div>
        
        <div className="option-group">
          <h2>Trust Directory Settings</h2>

          <div className="option">
            <label htmlFor="trustDirectoryUrls">
              Trust Directory URLs
            </label>
            <textarea
              id="trustDirectoryUrls"
              value={(getTrustDirectoryUrls(state.settings)).join('\n')}
              onChange={(e) => {
                // One URL per line; empty lines and surrounding whitespace are
                // trimmed at save time. Order matters: the resolver chain
                // tries each directory in order until one resolves a keyid.
                const list = e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                handleSettingChange('trustDirectoryUrls', list);
                // Clear the legacy single-URL field so getTrustDirectoryUrls
                // never falls back to it once the user has explicitly set
                // the list (even to empty).
                handleSettingChange('trustDirectoryUrl', '');
              }}
              placeholder={'https://eff.org/directory\nhttps://aclu.org/directory'}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
            <p className="option-description">
              One trust directory base URL per line. The keyid resolver chain
              consults these after did:web and direct-URL resolution. Leave
              empty if you only verify keyids that are themselves URLs or
              did:web identifiers.
            </p>
          </div>
        </div>

        <div className="option-group">
          <h2>Personal Trust Policy</h2>

          <div className="option">
            <label htmlFor="personalTrustList">
              Personal Trust List (keyids)
            </label>
            <textarea
              id="personalTrustList"
              value={(state.settings.personalTrustList ?? []).join('\n')}
              onChange={(e) => {
                const list = e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                handleSettingChange('personalTrustList', list);
              }}
              placeholder={'did:web:alice.example\nhttps://server.example/api/authors/abc/public-key'}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
            <p className="option-description">
              One keyid per line. Verified content signed by these keyids
              receives a +40 boost in the trust score (spec §3.1, option A).
            </p>
          </div>

          <div className="option">
            <label htmlFor="trustedDomains">
              Trusted Domains
            </label>
            <textarea
              id="trustedDomains"
              value={(state.settings.trustedDomains ?? []).join('\n')}
              onChange={(e) => {
                const list = e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                handleSettingChange('trustedDomains', list);
              }}
              placeholder={'nytimes.com\npropublica.org'}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
            <p className="option-description">
              One domain per line. Verified content whose signature binds to
              one of these domains receives a +30 boost (spec §3.1, option B).
            </p>
          </div>
        </div>
        
        <div className="option-group">
          <h2>Authentication Settings</h2>
          
          <div className="option">
            <label>
              Authentication Method
              <select
                value={state.settings.authMethod}
                onChange={(e) => handleSettingChange('authMethod', e.target.value)}
              >
                <option value="webauthn">WebAuthn</option>
                <option value="password">Password</option>
              </select>
            </label>
            <p className="option-description">
              The method to use for authentication
            </p>
          </div>
        </div>
      </main>
      
      <footer className="options-footer">
        <div className="status">
          {state.isSaved && <span className="saved">Settings saved!</span>}
        </div>
        <div className="actions">
          <button onClick={handleResetSettings}>Reset to Defaults</button>
          <button onClick={handleSaveSettings} className="primary">Save Settings</button>
        </div>
      </footer>
    </div>
  );
};

// Render the options page
const container = document.getElementById('options-root');
if (container) {
  const root = createRoot(container);
  root.render(<Options adapter={platformAdapter} />);
}