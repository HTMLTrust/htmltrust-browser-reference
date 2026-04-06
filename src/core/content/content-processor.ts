/**
 * Content processing utilities for DOM normalization and hashing
 */
import { hashContent } from '../common/utils';
import * as simhash from 'simhash-js';

/**
 * Options for content extraction
 */
export interface ContentExtractionOptions {
  /** Whether to include images in the extracted content */
  includeImages?: boolean;
  /** Whether to include links in the extracted content */
  includeLinks?: boolean;
  /** Whether to include metadata in the extracted content */
  includeMetadata?: boolean;
  /** CSS selector for the main content area */
  contentSelector?: string;
}

/**
 * Extracted content from a document
 */
export interface ExtractedContent {
  /** The title of the document */
  title: string;
  /** The main content of the document */
  content: string;
  /** The URL of the document */
  url: string;
  /** The hash of the content */
  contentHash: string;
  /** The simhash of the content for fuzzy matching */
  simhash: string;
  /** The timestamp when the content was extracted */
  timestamp: number;
  /** Generic metadata from the document */
  metadata?: Record<string, string>;
  /** Structured metadata according to standards */
  structuredMetadata?: {
    /** Dublin Core metadata */
    dublinCore?: {
      /** Creator of the content */
      creator?: string;
      /** Subject or keywords */
      subject?: string;
      /** Description of the content */
      description?: string;
      /** Publisher of the content */
      publisher?: string;
      /** Contributors to the content */
      contributor?: string;
      /** Date associated with the content */
      date?: string;
      /** Resource type */
      type?: string;
      /** File format or MIME type */
      format?: string;
      /** Resource identifier */
      identifier?: string;
      /** Source of the content */
      source?: string;
      /** Language of the content */
      language?: string;
      /** Relation to other resources */
      relation?: string;
      /** Spatial or temporal coverage */
      coverage?: string;
      /** Rights information */
      rights?: string;
    };
    /** Open Graph metadata */
    openGraph?: {
      /** Title of the content */
      title?: string;
      /** Type of content */
      type?: string;
      /** Image URL */
      image?: string;
      /** Canonical URL */
      url?: string;
      /** Site name */
      siteName?: string;
      /** Description */
      description?: string;
      /** Locale */
      locale?: string;
      /** Audio URL */
      audio?: string;
      /** Video URL */
      video?: string;
    };
    /** Schema.org metadata */
    schemaOrg?: {
      /** Type of content */
      type?: string;
      /** Name/title */
      name?: string;
      /** Description */
      description?: string;
      /** Author information */
      author?: {
        /** Author type */
        type?: string;
        /** Author name */
        name?: string;
        /** Author URL */
        url?: string;
      };
      /** Date published */
      datePublished?: string;
      /** Date modified */
      dateModified?: string;
      /** Publisher information */
      publisher?: {
        /** Publisher type */
        type?: string;
        /** Publisher name */
        name?: string;
        /** Publisher URL */
        url?: string;
      };
      /** Main image URL */
      image?: string;
      /** URL of the content */
      url?: string;
    };
  };
}

/**
 * Content processor for DOM normalization and hashing
 */
export class ContentProcessor {
  /**
   * Extract content from a document
   * @param document The document to extract content from
   * @param options The extraction options
   * @returns The extracted content
   */
  extractContent(document: Document, options: ContentExtractionOptions = {}): ExtractedContent {
    // Extract the title
    const title = document.title;
    
    // Extract the URL
    const url = document.URL;
    
    // Extract the main content
    let contentElement: Element | null = null;
    
    if (options.contentSelector) {
      contentElement = document.querySelector(options.contentSelector);
    }
    
    if (!contentElement) {
      // Try to find the main content area using common selectors
      const selectors = [
        'article',
        'main',
        '.content',
        '#content',
        '.article',
        '#article',
        '.post',
        '#post',
      ];
      
      for (const selector of selectors) {
        contentElement = document.querySelector(selector);
        if (contentElement) break;
      }
      
      // If still not found, use the body
      if (!contentElement) {
        contentElement = document.body;
      }
    }
    
    // Clone the content element to avoid modifying the original
    const contentClone = contentElement.cloneNode(true) as Element;
    
    // Remove elements that should not be included
    if (!options.includeImages) {
      const images = contentClone.querySelectorAll('img');
      images.forEach(img => img.remove());
    }
    
    if (!options.includeLinks) {
      const links = contentClone.querySelectorAll('a');
      links.forEach(link => {
        const text = document.createTextNode(link.textContent || '');
        link.parentNode?.replaceChild(text, link);
      });
    }
    
    // Remove script and style elements
    const scripts = contentClone.querySelectorAll('script, style, noscript');
    scripts.forEach(script => script.remove());
    
    // Remove comments
    this.removeComments(contentClone);
    
    // Normalize whitespace
    const content = this.normalizeWhitespace(contentClone.textContent || '');
    
    // Extract metadata if requested
    let metadata: Record<string, string> | undefined;
    let structuredMetadata: ExtractedContent['structuredMetadata'] | undefined;
    
    if (options.includeMetadata) {
      metadata = {};
      structuredMetadata = {
        dublinCore: {},
        openGraph: {},
        schemaOrg: {}
      };
      const metaTags = document.querySelectorAll('meta');
      
      // Extract generic metadata
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content = meta.getAttribute('content');
        
        if (name && content) {
          metadata![name] = content;
        }
      });
      
      // Extract Dublin Core metadata
      const dublinCoreMetadata = structuredMetadata.dublinCore!;
      const dcPrefixes = ['dc.', 'DC.', 'dcterms.', 'DCTERMS.', 'dc:', 'DC:'];
      
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content = meta.getAttribute('content');
        
        if (name && content) {
          for (const prefix of dcPrefixes) {
            if (name.startsWith(prefix)) {
              const element = name.substring(prefix.length).toLowerCase();
              switch (element) {
                case 'title':
                case 'creator':
                case 'subject':
                case 'description':
                case 'publisher':
                case 'contributor':
                case 'date':
                case 'type':
                case 'format':
                case 'identifier':
                case 'source':
                case 'language':
                case 'relation':
                case 'coverage':
                case 'rights':
                  (dublinCoreMetadata as Record<string, string>)[element] = content;
                  break;
              }
              break;
            }
          }
        }
      });
      
      if (Object.keys(dublinCoreMetadata).length > 0) {
        structuredMetadata.dublinCore = dublinCoreMetadata;
      }
      
      // Extract Open Graph metadata
      const openGraphMetadata = structuredMetadata.openGraph!;
      
      metaTags.forEach(meta => {
        const property = meta.getAttribute('property');
        const content = meta.getAttribute('content');
        
        if (property && content && property.startsWith('og:')) {
          const element = property.substring(3).toLowerCase();
          switch (element) {
            case 'title':
            case 'type':
            case 'image':
            case 'url':
            case 'description':
            case 'locale':
            case 'audio':
            case 'video':
              openGraphMetadata[element] = content;
              break;
            case 'site_name':
              openGraphMetadata.siteName = content;
              break;
          }
        }
      });
      
      if (Object.keys(openGraphMetadata).length > 0) {
        structuredMetadata.openGraph = openGraphMetadata;
      }
      
      // Extract Schema.org metadata
      const schemaOrgMetadata = structuredMetadata.schemaOrg!;
      
      // Look for JSON-LD script tags
      const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
      scriptTags.forEach(script => {
        try {
          const jsonData = JSON.parse(script.textContent || '');
          
          // Check if it's Schema.org data
          if (jsonData['@context'] && jsonData['@context'].includes('schema.org')) {
            schemaOrgMetadata.type = jsonData['@type'];
            schemaOrgMetadata.name = jsonData.name || jsonData.headline;
            schemaOrgMetadata.description = jsonData.description;
            schemaOrgMetadata.url = jsonData.url;
            schemaOrgMetadata.image = jsonData.image;
            schemaOrgMetadata.datePublished = jsonData.datePublished;
            schemaOrgMetadata.dateModified = jsonData.dateModified;
            
            if (jsonData.author) {
              schemaOrgMetadata.author = {
                type: jsonData.author['@type'],
                name: jsonData.author.name,
                url: jsonData.author.url
              };
            }
            
            if (jsonData.publisher) {
              schemaOrgMetadata.publisher = {
                type: jsonData.publisher['@type'],
                name: jsonData.publisher.name,
                url: jsonData.publisher.url
              };
            }
          }
        } catch (e) {
          // Ignore JSON parsing errors
          console.error('Error parsing Schema.org JSON-LD:', e);
        }
      });
      
      // Also look for microdata
      const itemScopes = document.querySelectorAll('[itemscope]');
      itemScopes.forEach(itemScope => {
        const itemType = itemScope.getAttribute('itemtype');
        
        if (itemType && itemType.includes('schema.org')) {
          if (!schemaOrgMetadata.type) {
            schemaOrgMetadata.type = itemType.split('/').pop();
          }
          
          const nameElement = itemScope.querySelector('[itemprop="name"], [itemprop="headline"]');
          if (nameElement && !schemaOrgMetadata.name) {
            schemaOrgMetadata.name = nameElement.getAttribute('content') || nameElement.textContent || '';
          }
          
          const descriptionElement = itemScope.querySelector('[itemprop="description"]');
          if (descriptionElement && !schemaOrgMetadata.description) {
            schemaOrgMetadata.description = descriptionElement.getAttribute('content') || descriptionElement.textContent || '';
          }
        }
      });
      
      if (Object.keys(schemaOrgMetadata).length > 0) {
        structuredMetadata.schemaOrg = schemaOrgMetadata;
      }
    }
    
    // Generate content hash
    const contentHash = hashContent(content);
    
    // Generate simhash for fuzzy matching
    const simhasher = new simhash.SimHash();
    const contentSimhash = simhasher.hash(content).toString(16);
    
    return {
      title,
      content,
      url,
      contentHash,
      simhash: contentSimhash,
      timestamp: Date.now(),
      metadata,
      structuredMetadata,
    };
  }

  /**
   * Calculate the similarity between two pieces of content
   * @param content1 The first content
   * @param content2 The second content
   * @returns A number between 0 and 1 representing the similarity
   */
  calculateSimilarity(content1: string, content2: string): number {
    const simhasher = new simhash.SimHash();
    const hash1 = simhasher.hash(content1);
    const hash2 = simhasher.hash(content2);
    
    // Calculate Hamming distance
    const distance = simhash.SimHash.hammingDistance(hash1, hash2);
    
    // Convert to similarity (0-1)
    const maxDistance = 64; // 64-bit hash
    return 1 - (distance / maxDistance);
  }

  /**
   * Remove comments from an element
   * @param element The element to remove comments from
   */
  private removeComments(element: Node): void {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_COMMENT
    );
    
    const comments: Comment[] = [];
    let comment: Comment | null;
    
    while ((comment = walker.nextNode() as Comment | null)) {
      comments.push(comment);
    }
    
    comments.forEach(comment => comment.remove());
    
    // Process child elements
    const childNodes = element.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      this.removeComments(childNodes[i]);
    }
  }

  /**
   * Normalize whitespace in a string
   * @param text The text to normalize
   * @returns The normalized text
   */
  private normalizeWhitespace(text: string): string {
    // Replace all whitespace sequences with a single space
    return text.replace(/\s+/g, ' ').trim();
  }
}