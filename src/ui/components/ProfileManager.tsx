/**
 * Profile management component
 */
import React, { useState, useEffect } from 'react';
import { Profile } from '../../core/common/types';

/**
 * Props for the ProfileManager component
 */
export interface ProfileManagerProps {
  /** List of available profiles */
  profiles: Profile[];
  /** Currently active profile */
  activeProfileId?: string;
  /** Callback for when a profile is selected */
  onSelectProfile?: (profileId: string) => void;
  /** Callback for when a profile is created */
  onCreateProfile?: (profile: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) => void;
  /** Callback for when a profile is updated */
  onUpdateProfile?: (profile: Profile) => void;
  /** Callback for when a profile is deleted */
  onDeleteProfile?: (profileId: string) => void;
}

/**
 * Component for managing profiles
 */
export const ProfileManager: React.FC<ProfileManagerProps> = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
}) => {
  // State for the form
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isDefault: false,
    trustDirectoryUrl: '',
  });

  // Get the active profile
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles.find(p => p.isDefault) || profiles[0];

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingProfile) {
      // Update existing profile
      if (onUpdateProfile) {
        onUpdateProfile({
          ...editingProfile,
          name: formData.name,
          description: formData.description,
          isDefault: formData.isDefault,
          trustDirectoryUrl: formData.trustDirectoryUrl,
          updatedAt: Date.now(),
        });
      }
    } else {
      // Create new profile
      if (onCreateProfile) {
        onCreateProfile({
          name: formData.name,
          description: formData.description,
          isDefault: formData.isDefault,
          trustDirectoryUrl: formData.trustDirectoryUrl,
          metadata: {
            dublinCore: {},
            openGraph: {},
            schemaOrg: {},
          },
        });
      }
    }
    
    // Reset form
    setIsEditing(false);
    setEditingProfile(null);
    setFormData({
      name: '',
      description: '',
      isDefault: false,
      trustDirectoryUrl: '',
    });
  };

  // Handle edit profile
  const handleEditProfile = (profile: Profile) => {
    setIsEditing(true);
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      description: profile.description || '',
      isDefault: profile.isDefault,
      trustDirectoryUrl: profile.trustDirectoryUrl,
    });
  };

  // Handle delete profile
  const handleDeleteProfile = (profileId: string) => {
    if (window.confirm('Are you sure you want to delete this profile?')) {
      if (onDeleteProfile) {
        onDeleteProfile(profileId);
      }
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingProfile(null);
    setFormData({
      name: '',
      description: '',
      isDefault: false,
      trustDirectoryUrl: '',
    });
  };

  return (
    <div className="profile-manager">
      <div className="profile-list">
        <h3>Profiles</h3>
        
        {profiles.length === 0 ? (
          <p>No profiles available. Create a new profile to get started.</p>
        ) : (
          <ul>
            {profiles.map(profile => (
              <li key={profile.id} className={profile.id === activeProfile?.id ? 'active' : ''}>
                <div className="profile-item">
                  <div className="profile-info">
                    <h4>{profile.name} {profile.isDefault && <span className="default-badge">Default</span>}</h4>
                    {profile.description && <p>{profile.description}</p>}
                  </div>
                  <div className="profile-actions">
                    {profile.id !== activeProfile?.id && onSelectProfile && (
                      <button onClick={() => onSelectProfile(profile.id)}>Select</button>
                    )}
                    <button onClick={() => handleEditProfile(profile)}>Edit</button>
                    {!profile.isDefault && onDeleteProfile && (
                      <button onClick={() => handleDeleteProfile(profile.id)}>Delete</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="create-profile-btn">
            Create New Profile
          </button>
        )}
      </div>
      
      {isEditing && (
        <div className="profile-form">
          <h3>{editingProfile ? 'Edit Profile' : 'Create New Profile'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">
                Profile Name:
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter profile name"
                />
              </label>
            </div>
            
            <div className="form-group">
              <label htmlFor="description">
                Description:
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter profile description (optional)"
                />
              </label>
            </div>
            
            <div className="form-group">
              <label htmlFor="trustDirectoryUrl">
                Trust Directory URL:
                <input
                  type="text"
                  id="trustDirectoryUrl"
                  name="trustDirectoryUrl"
                  value={formData.trustDirectoryUrl}
                  onChange={handleInputChange}
                  required
                  placeholder="https://api.trustdirectory.example.com"
                />
              </label>
            </div>
            
            <div className="form-group checkbox">
              <label htmlFor="isDefault">
                <input
                  type="checkbox"
                  id="isDefault"
                  name="isDefault"
                  checked={formData.isDefault}
                  onChange={handleInputChange}
                />
                Set as default profile
              </label>
            </div>
            
            <div className="form-actions">
              <button type="button" onClick={handleCancelEdit}>Cancel</button>
              <button type="submit" className="primary">
                {editingProfile ? 'Update Profile' : 'Create Profile'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};