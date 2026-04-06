/**
 * Content script entry point
 */
import { MESSAGE_TYPES, CSS_CLASSES, TRUST_STATUS, STORAGE_KEYS } from '../core/common/constants';
import { ContentProcessor } from '../core/content';
import { PlatformAdapter, MessageContext } from '../platforms/common';
import { VerificationResult, TrustStatus, VoteType, AuthorVote } from '../core/common/types';

// Import platform-specific adapter
// This will be replaced with the correct adapter at build time
import { ChromiumAdapter } from '../platforms/chromium';

// Initialize platform adapter
const platformAdapter: PlatformAdapter = new ChromiumAdapter();

// Initialize content processor
const contentProcessor = new ContentProcessor();

/**
 * Initialize the content script
 */
async function initialize() {
  try {
    console.log('Content Signing content script initialized');

    // Extract content from the page
    const extractedContent = contentProcessor.extractContent(document);

    // Notify the background script that content was detected
    const response = await platformAdapter.sendMessage(MessageContext.BACKGROUND, {
      type: MESSAGE_TYPES.CONTENT_DETECTED,
      url: window.location.href,
      content: extractedContent,
    });

    // If we received a response, apply the verification UI
    if (response) {
      applyVerificationUI(response);
    }

    // Listen for messages from the background script
    listenForMessages();
  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
}

/**
 * Apply verification UI to the page
 * @param verificationResult The verification result
 */
function applyVerificationUI(verificationResult: VerificationResult) {
  try {
    // Get settings from the verification result
    const settings = verificationResult.settings || {
      showBadges: true,
      highlightVerified: true,
      highlightUnverified: false,
    };

    // Find content elements to highlight
    const contentElements = findContentElements();
    
    // Apply verification UI to each content element
    contentElements.forEach(element => {
      applyVerificationUIToElement(element, verificationResult, settings);
    });
  } catch (error) {
    console.error('Failed to apply verification UI:', error);
  }
}

/**
 * Find content elements on the page
 * @returns An array of content elements
 */
function findContentElements(): Element[] {
  // Try to find main content containers first
  const mainContainers = Array.from(document.querySelectorAll('article, main, [role="main"], .content, #content'));
  
  if (mainContainers.length > 0) {
    return mainContainers;
  }
  
  // If no main containers found, look for sections or large text blocks
  const sections = Array.from(document.querySelectorAll('section, .post, #post, .entry, #entry'));
  
  if (sections.length > 0) {
    return sections;
  }
  
  // If still nothing found, use paragraphs and headings
  return Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
}

/**
 * Apply verification UI to a specific element
 * @param element The element to apply verification UI to
 * @param verificationResult The verification result
 * @param settings The settings for the verification UI
 */
function applyVerificationUIToElement(
  element: Element,
  verificationResult: VerificationResult,
  settings: NonNullable<VerificationResult['settings']>
) {
  // Add content outline class
  element.classList.add(CSS_CLASSES.CONTENT_OUTLINE);
  
  // Determine verification status class
  if (verificationResult.verified) {
    if (settings.highlightVerified) {
      element.classList.add(CSS_CLASSES.VERIFIED_CONTENT);
    }
  } else {
    if (settings.highlightUnverified) {
      element.classList.add(CSS_CLASSES.UNVERIFIED_CONTENT);
    }
  }
  
  // Add verification badges if enabled
  if (settings.showBadges) {
    addVerificationBadges(element, verificationResult);
  }
}

/**
 * Add verification badges to an element
 * @param element The element to add badges to
 * @param verificationResult The verification result
 */
function addVerificationBadges(element: Element, verificationResult: VerificationResult) {
  try {
    // Create badge container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = CSS_CLASSES.VERIFICATION_BADGES;
    
    // Add validity badge
    const validityBadge = createValidityBadge(verificationResult);
    badgeContainer.appendChild(validityBadge);
    
    // Add trust badge
    const trustBadge = createTrustBadge(verificationResult);
    badgeContainer.appendChild(trustBadge);
    
    // Add the badge container to the element
    element.appendChild(badgeContainer);
  } catch (error) {
    console.error('Failed to add verification badges:', error);
  }
}

/**
 * Create a validity badge
 * @param verificationResult The verification result
 * @returns The validity badge element
 */
function createValidityBadge(verificationResult: VerificationResult): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.VALIDITY_BADGE}`;
  
  if (verificationResult.verified) {
    badge.classList.add(CSS_CLASSES.VERIFICATION_BADGE_VERIFIED);
    badge.textContent = '✓';
    
    // Add tooltip
    const tooltip = document.createElement('span');
    tooltip.className = CSS_CLASSES.TOOLTIP;
    tooltip.textContent = `Verified by ${verificationResult.user?.name || 'unknown'}`;
    
    // Add vote buttons if we have an author ID
    if (verificationResult.user?.id) {
      const voteButtons = createVoteButtons(verificationResult.user.id);
      tooltip.appendChild(voteButtons);
    }
    
    badge.appendChild(tooltip);
  } else {
    badge.classList.add(CSS_CLASSES.VERIFICATION_BADGE_UNVERIFIED);
    badge.textContent = '✗';
    
    // Add tooltip
    const tooltip = document.createElement('span');
    tooltip.className = CSS_CLASSES.TOOLTIP;
    tooltip.textContent = verificationResult.reason || 'Not verified';
    badge.appendChild(tooltip);
  }
  
  return badge;
}

/**
 * Create a trust badge
 * @param verificationResult The verification result
 * @returns The trust badge element
 */
function createTrustBadge(verificationResult: VerificationResult): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `${CSS_CLASSES.VERIFICATION_BADGE} ${CSS_CLASSES.TRUST_BADGE}`;
  
  // Determine trust status
  const trustStatus = determineTrustStatus(verificationResult);
  
  switch (trustStatus) {
    case TRUST_STATUS.TRUSTED:
      badge.classList.add(CSS_CLASSES.TRUST_BADGE_TRUSTED);
      badge.textContent = '🔒';
      
      // Add tooltip
      const trustedTooltip = document.createElement('span');
      trustedTooltip.className = CSS_CLASSES.TOOLTIP;
      trustedTooltip.textContent = `Trusted source: ${verificationResult.domain || 'unknown domain'}`;
      badge.appendChild(trustedTooltip);
      break;
      
    case TRUST_STATUS.UNTRUSTED:
      badge.classList.add(CSS_CLASSES.TRUST_BADGE_UNTRUSTED);
      badge.textContent = '⚠️';
      
      // Add tooltip
      const untrustedTooltip = document.createElement('span');
      untrustedTooltip.className = CSS_CLASSES.TOOLTIP;
      untrustedTooltip.textContent = `Untrusted source: ${verificationResult.domain || 'unknown domain'}`;
      badge.appendChild(untrustedTooltip);
      break;
      
    case TRUST_STATUS.UNKNOWN:
    default:
      badge.classList.add(CSS_CLASSES.TRUST_BADGE_UNKNOWN);
      badge.textContent = '?';
      
      // Add tooltip
      const unknownTooltip = document.createElement('span');
      unknownTooltip.className = CSS_CLASSES.TOOLTIP;
      unknownTooltip.textContent = `Unknown source: ${verificationResult.domain || 'unknown domain'}`;
      badge.appendChild(unknownTooltip);
      break;
  }
  
  return badge;
}

/**
 * Create vote buttons for an author
 * @param authorId The ID of the author to vote on
 * @returns The vote buttons container element
 */
function createVoteButtons(authorId: string): HTMLElement {
  // Create container
  const container = document.createElement('div');
  container.className = CSS_CLASSES.VOTE_BUTTONS;
  
  // Create upvote button
  const upvoteButton = document.createElement('button');
  upvoteButton.className = `${CSS_CLASSES.VOTE_BUTTON} ${CSS_CLASSES.UPVOTE_BUTTON}`;
  upvoteButton.textContent = '👍';
  upvoteButton.title = 'Upvote this author';
  upvoteButton.dataset.authorId = authorId;
  upvoteButton.dataset.voteType = VoteType.UPVOTE;
  
  // Create downvote button
  const downvoteButton = document.createElement('button');
  downvoteButton.className = `${CSS_CLASSES.VOTE_BUTTON} ${CSS_CLASSES.DOWNVOTE_BUTTON}`;
  downvoteButton.textContent = '👎';
  downvoteButton.title = 'Downvote this author';
  downvoteButton.dataset.authorId = authorId;
  downvoteButton.dataset.voteType = VoteType.DOWNVOTE;
  
  // Add event listeners
  upvoteButton.addEventListener('click', handleVoteButtonClick);
  downvoteButton.addEventListener('click', handleVoteButtonClick);
  
  // Add buttons to container
  container.appendChild(upvoteButton);
  container.appendChild(downvoteButton);
  
  // Check if we have an existing vote for this author and update UI accordingly
  checkExistingVote(authorId, upvoteButton, downvoteButton);
  
  return container;
}

/**
 * Check if there's an existing vote for an author and update button states
 * @param authorId The ID of the author
 * @param upvoteButton The upvote button element
 * @param downvoteButton The downvote button element
 */
async function checkExistingVote(
  authorId: string,
  upvoteButton: HTMLButtonElement,
  downvoteButton: HTMLButtonElement
): Promise<void> {
  try {
    // Request the current vote state from the background script
    const response = await platformAdapter.sendMessage(MessageContext.BACKGROUND, {
      type: 'GET_AUTHOR_VOTE',
      authorId,
    });
    
    if (response && response.vote) {
      // Update button states based on current vote
      if (response.vote === VoteType.UPVOTE) {
        upvoteButton.classList.add(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
        downvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      } else if (response.vote === VoteType.DOWNVOTE) {
        downvoteButton.classList.add(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
        upvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      } else {
        upvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
        downvoteButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      }
    }
  } catch (error) {
    console.error('Failed to check existing vote:', error);
  }
}

/**
 * Handle vote button click
 * @param event The click event
 */
async function handleVoteButtonClick(event: MouseEvent): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  
  const button = event.currentTarget as HTMLButtonElement;
  const authorId = button.dataset.authorId;
  const voteType = button.dataset.voteType as VoteType;
  
  if (!authorId || !voteType) {
    console.error('Missing authorId or voteType in vote button');
    return;
  }
  
  // Determine if this is a toggle (clicking already active button)
  const isToggle = button.classList.contains(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
  const finalVoteType = isToggle ? VoteType.NEUTRAL : voteType;
  
  // Find the container and buttons once to use throughout the function
  const container = button.parentElement;
  const upvoteButton = container?.querySelector(`.${CSS_CLASSES.UPVOTE_BUTTON}`) as HTMLButtonElement;
  const downvoteButton = container?.querySelector(`.${CSS_CLASSES.DOWNVOTE_BUTTON}`) as HTMLButtonElement;
  
  try {
    // Find the other button (to update its state)
    const otherButton = voteType === VoteType.UPVOTE ? downvoteButton : upvoteButton;
    
    // Update button states immediately for responsive UI
    if (finalVoteType === VoteType.NEUTRAL) {
      // Remove active state if toggling off
      button.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
    } else {
      // Set this button as active and remove active from other button
      button.classList.add(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      if (otherButton) {
        otherButton.classList.remove(CSS_CLASSES.VOTE_BUTTON_ACTIVE);
      }
    }
    
    // Send vote to background script
    await platformAdapter.sendMessage(MessageContext.BACKGROUND, {
      type: MESSAGE_TYPES.SUBMIT_VOTE,
      authorId,
      vote: finalVoteType,
      url: window.location.href,
      contentHash: null, // Could be added if we have access to the content hash
    });
    
    console.log(`Vote ${finalVoteType} submitted for author ${authorId}`);
  } catch (error) {
    console.error('Failed to submit vote:', error);
    // Revert UI changes on error
    if (upvoteButton && downvoteButton) {
      checkExistingVote(authorId, upvoteButton, downvoteButton);
    }
  }
}

/**
 * Determine the trust status of a verification result
 * @param verificationResult The verification result
 * @returns The trust status
 */
function determineTrustStatus(verificationResult: VerificationResult): TrustStatus {
  // If the trust status is already set, use it
  if (verificationResult.trustStatus) {
    return verificationResult.trustStatus;
  }
  
  // If not verified, it's untrusted
  if (!verificationResult.verified) {
    return TRUST_STATUS.UNTRUSTED;
  }
  
  // If there's a trust directory entry, it's trusted
  if (verificationResult.trustDirectoryEntry) {
    return TRUST_STATUS.TRUSTED;
  }
  
  // If there's a user but no trust directory entry, check if the user is verified
  if (verificationResult.user) {
    return verificationResult.user.verified ? TRUST_STATUS.TRUSTED : TRUST_STATUS.UNTRUSTED;
  }
  
  // Otherwise, it's unknown
  return TRUST_STATUS.UNKNOWN;
}

/**
 * Listen for messages from the background script
 */
function listenForMessages() {
  platformAdapter.registerMessageListeners({
    [MessageContext.BACKGROUND]: async (message: any) => {
      switch (message.type) {
        case 'UPDATE_VERIFICATION_UI':
          applyVerificationUI(message.verificationResult);
          return { success: true };
        case MESSAGE_TYPES.VOTE_ACKNOWLEDGED:
          // Update vote button states if needed
          if (message.authorId) {
            const upvoteButtons = document.querySelectorAll(
              `.${CSS_CLASSES.UPVOTE_BUTTON}[data-author-id="${message.authorId}"]`
            );
            const downvoteButtons = document.querySelectorAll(
              `.${CSS_CLASSES.DOWNVOTE_BUTTON}[data-author-id="${message.authorId}"]`
            );
            
            upvoteButtons.forEach((upvoteButton) => {
              downvoteButtons.forEach((downvoteButton) => {
                checkExistingVote(
                  message.authorId,
                  upvoteButton as HTMLButtonElement,
                  downvoteButton as HTMLButtonElement
                );
              });
            });
          }
          return { success: true };
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    },
  });
}

// Initialize the content script
initialize();