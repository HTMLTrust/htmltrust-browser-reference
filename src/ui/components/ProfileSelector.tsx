/**
 * Profile selector component
 */
import React from 'react';
import { Profile } from '../../core/common/types';

/**
 * Props for the ProfileSelector component
 */
export interface ProfileSelectorProps {
  /** List of available profiles */
  profiles: Profile[];
  /** Currently selected profile ID */
  selectedProfileId?: string;
  /** Callback for when a profile is selected */
  onSelectProfile: (profileId: string) => void;
}

/**
 * Component for selecting a profile during content signing
 */
export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfileId,
  onSelectProfile,
}) => {
  // Get the selected profile or default to the first profile
  const selectedProfile = 
    profiles.find(p => p.id === selectedProfileId) || 
    profiles.find(p => p.isDefault) || 
    profiles[0];

  // Handle profile change
  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectProfile(e.target.value);
  };

  if (profiles.length === 0) {
    return (
      <div className="profile-selector empty">
        <p>No profiles available. Please create a profile in the options page.</p>
      </div>
    );
  }

  return (
    <div className="profile-selector">
      <label htmlFor="profile-select">
        Profile:
        <select
          id="profile-select"
          value={selectedProfile?.id || ''}
          onChange={handleProfileChange}
        >
          {profiles.map(profile => (
            <option key={profile.id} value={profile.id}>
              {profile.name} {profile.isDefault ? '(Default)' : ''}
            </option>
          ))}
        </select>
      </label>
      
      {selectedProfile && (
        <div className="selected-profile-info">
          {selectedProfile.description && (
            <p className="profile-description">{selectedProfile.description}</p>
          )}
          <div className="profile-metadata-summary">
            <p>
              <strong>Trust Directory:</strong> {selectedProfile.trustDirectoryUrl}
            </p>
            <p>
              <strong>Metadata:</strong>{' '}
              {Object.keys(selectedProfile.metadata.dublinCore || {}).length +
                Object.keys(selectedProfile.metadata.openGraph || {}).length +
                Object.keys(selectedProfile.metadata.schemaOrg || {}).length}{' '}
              fields
            </p>
          </div>
        </div>
      )}
    </div>
  );
};