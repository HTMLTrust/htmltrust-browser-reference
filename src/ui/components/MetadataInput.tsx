/**
 * Metadata input component for content signing
 */
import React, { useState } from 'react';

/**
 * Props for the MetadataInput component
 */
export interface MetadataInputProps {
  /** Initial metadata values */
  initialMetadata?: {
    dublinCore?: Record<string, string>;
    openGraph?: Record<string, string>;
    schemaOrg?: Record<string, string>;
  };
  /** Callback for when metadata changes */
  onChange?: (metadata: {
    dublinCore: Record<string, string>;
    openGraph: Record<string, string>;
    schemaOrg: Record<string, string>;
  }) => void;
}

/**
 * Component for inputting metadata during content signing
 */
export const MetadataInput: React.FC<MetadataInputProps> = ({
  initialMetadata,
  onChange,
}) => {
  // Dublin Core fields
  const dublinCoreFields = [
    { key: 'creator', label: 'Creator', description: 'Creator of the content' },
    { key: 'subject', label: 'Subject', description: 'Subject or keywords' },
    { key: 'description', label: 'Description', description: 'Description of the content' },
    { key: 'publisher', label: 'Publisher', description: 'Publisher of the content' },
    { key: 'contributor', label: 'Contributor', description: 'Contributors to the content' },
    { key: 'date', label: 'Date', description: 'Date associated with the content' },
    { key: 'type', label: 'Type', description: 'Resource type' },
    { key: 'format', label: 'Format', description: 'File format or MIME type' },
    { key: 'identifier', label: 'Identifier', description: 'Resource identifier' },
    { key: 'source', label: 'Source', description: 'Source of the content' },
    { key: 'language', label: 'Language', description: 'Language of the content' },
    { key: 'relation', label: 'Relation', description: 'Relation to other resources' },
    { key: 'coverage', label: 'Coverage', description: 'Spatial or temporal coverage' },
    { key: 'rights', label: 'Rights', description: 'Rights information' },
  ];

  // Open Graph fields
  const openGraphFields = [
    { key: 'title', label: 'Title', description: 'Title of the content' },
    { key: 'type', label: 'Type', description: 'Type of content' },
    { key: 'image', label: 'Image', description: 'Image URL' },
    { key: 'url', label: 'URL', description: 'Canonical URL' },
    { key: 'siteName', label: 'Site Name', description: 'Site name' },
    { key: 'description', label: 'Description', description: 'Description' },
    { key: 'locale', label: 'Locale', description: 'Locale' },
  ];

  // Schema.org fields
  const schemaOrgFields = [
    { key: 'name', label: 'Name', description: 'Name/title' },
    { key: 'description', label: 'Description', description: 'Description' },
    { key: 'datePublished', label: 'Date Published', description: 'Date published' },
    { key: 'dateModified', label: 'Date Modified', description: 'Date modified' },
    { key: 'image', label: 'Image', description: 'Main image URL' },
    { key: 'url', label: 'URL', description: 'URL of the content' },
  ];

  // State for metadata values
  const [metadata, setMetadata] = useState({
    dublinCore: initialMetadata?.dublinCore || {},
    openGraph: initialMetadata?.openGraph || {},
    schemaOrg: initialMetadata?.schemaOrg || {},
  });

  // State for active tab
  const [activeTab, setActiveTab] = useState<'dublinCore' | 'openGraph' | 'schemaOrg'>('dublinCore');

  // Handle input change
  const handleInputChange = (
    standard: 'dublinCore' | 'openGraph' | 'schemaOrg',
    key: string,
    value: string
  ) => {
    const updatedMetadata = {
      ...metadata,
      [standard]: {
        ...metadata[standard],
        [key]: value,
      },
    };
    
    setMetadata(updatedMetadata);
    
    if (onChange) {
      onChange(updatedMetadata);
    }
  };

  return (
    <div className="metadata-input">
      <h3>Metadata</h3>
      
      <div className="metadata-tabs">
        <button
          className={activeTab === 'dublinCore' ? 'active' : ''}
          onClick={() => setActiveTab('dublinCore')}
        >
          Dublin Core
        </button>
        <button
          className={activeTab === 'openGraph' ? 'active' : ''}
          onClick={() => setActiveTab('openGraph')}
        >
          Open Graph
        </button>
        <button
          className={activeTab === 'schemaOrg' ? 'active' : ''}
          onClick={() => setActiveTab('schemaOrg')}
        >
          Schema.org
        </button>
      </div>
      
      <div className="metadata-fields">
        {activeTab === 'dublinCore' && (
          <>
            <p className="metadata-description">
              Dublin Core is a widely used standard with 15 core elements for describing web resources.
            </p>
            {dublinCoreFields.map(field => (
              <div key={field.key} className="metadata-field">
                <label title={field.description}>
                  {field.label}:
                  <input
                    type="text"
                    value={metadata.dublinCore[field.key] || ''}
                    onChange={e => handleInputChange('dublinCore', field.key, e.target.value)}
                    placeholder={field.description}
                  />
                </label>
              </div>
            ))}
          </>
        )}
        
        {activeTab === 'openGraph' && (
          <>
            <p className="metadata-description">
              Open Graph Protocol is used for rich social media sharing on platforms like Facebook.
            </p>
            {openGraphFields.map(field => (
              <div key={field.key} className="metadata-field">
                <label title={field.description}>
                  {field.label}:
                  <input
                    type="text"
                    value={metadata.openGraph[field.key] || ''}
                    onChange={e => handleInputChange('openGraph', field.key, e.target.value)}
                    placeholder={field.description}
                  />
                </label>
              </div>
            ))}
          </>
        )}
        
        {activeTab === 'schemaOrg' && (
          <>
            <p className="metadata-description">
              Schema.org is a collaborative standard for structured data that improves search engine results.
            </p>
            {schemaOrgFields.map(field => (
              <div key={field.key} className="metadata-field">
                <label title={field.description}>
                  {field.label}:
                  <input
                    type="text"
                    value={metadata.schemaOrg[field.key] || ''}
                    onChange={e => handleInputChange('schemaOrg', field.key, e.target.value)}
                    placeholder={field.description}
                  />
                </label>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};