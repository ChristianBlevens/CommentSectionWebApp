// Reactions module for emoji reactions on comments
import { BaseModule } from '../../core/base-module.js';
import { EventBus } from '../../core/event-bus.js';
import { StateManager } from '../../core/state-manager.js';
import { ApiClient } from '../../core/api-client.js';
import { DomUtils } from '../../utils/index.js';

class ReactionsModule extends BaseModule {
  constructor() {
    super();
    this.name = 'reactions';
    
    // Module state
    this.state = {
      availableReactions: ['👍', '❤️', '😂', '😮', '😢', '😡'],
      commentReactions: new Map(), // Map of commentId -> reactions data
      userReactions: new Map(), // Map of commentId -> user's reaction
      isLoading: false
    };
    
    // API client instance
    this.api = new ApiClient();
    
    // Event bus instance
    this.eventBus = window.eventBus || new EventBus();
    
    // State manager instance
    this.stateManager = window.stateManager || new StateManager();
  }

  // Initialize the module
  async initialize(config = {}) {
    this.config = {
      availableReactions: ['👍', '❤️', '😂', '😮', '😢', '😡'],
      maxReactionsPerComment: 1,
      ...config
    };
    
    // Update available reactions from config
    if (this.config.availableReactions) {
      this.state.availableReactions = this.config.availableReactions;
    }
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.initialized = true;
    this.emit('reactions:initialized');
    
    return true;
  }

  // Setup event listeners
  setupEventListeners() {
    // Listen for comment events
    this.on('comments:loaded', (data) => this.loadReactionsForComments(data.comments));
    this.on('comments:added', (data) => this.initializeCommentReactions(data.comment.id));
    this.on('comments:deleted', (data) => this.removeCommentReactions(data.commentId));
    
    // Listen for auth changes
    this.on('auth:login', () => this.refreshUserReactions());
    this.on('auth:logout', () => this.clearUserReactions());
  }

  // Load reactions for multiple comments
  async loadReactionsForComments(comments) {
    if (!comments || comments.length === 0) return;
    
    const commentIds = comments.map(c => c.id);
    
    try {
      const response = await this.api.post('/api/reactions/batch', { commentIds });
      
      if (response.reactions) {
        // Update reactions state
        response.reactions.forEach(data => {
          this.state.commentReactions.set(data.commentId, data.reactions);
          if (data.userReaction) {
            this.state.userReactions.set(data.commentId, data.userReaction);
          }
        });
        
        this.emit('reactions:loaded', { reactions: response.reactions });
      }
    } catch (error) {
      console.error('Failed to load reactions:', error);
    }
  }

  // Initialize reactions for a new comment
  initializeCommentReactions(commentId) {
    const emptyReactions = {};
    this.state.availableReactions.forEach(emoji => {
      emptyReactions[emoji] = 0;
    });
    
    this.state.commentReactions.set(commentId, emptyReactions);
  }

  // Add or update reaction
  async toggleReaction(commentId, emoji) {
    const currentReaction = this.state.userReactions.get(commentId);
    
    // Check if user is authenticated
    const user = this.stateManager.getState('auth', 'user');
    if (!user) {
      this.emit('auth:required');
      return;
    }
    
    try {
      // If clicking the same reaction, remove it
      const isRemoving = currentReaction === emoji;
      
      const response = await this.api.post(`/api/comments/${commentId}/react`, {
        reaction: isRemoving ? null : emoji
      });
      
      if (response.success) {
        // Update local state
        if (isRemoving) {
          this.state.userReactions.delete(commentId);
        } else {
          this.state.userReactions.set(commentId, emoji);
        }
        
        // Update reaction counts
        if (response.reactions) {
          this.state.commentReactions.set(commentId, response.reactions);
        }
        
        this.emit('reactions:updated', {
          commentId,
          reaction: isRemoving ? null : emoji,
          reactions: response.reactions
        });
      }
    } catch (error) {
      console.error('Failed to update reaction:', error);
      this.emit('reactions:error', { error: error.message });
    }
  }

  // Get reactions for a comment
  getCommentReactions(commentId) {
    return this.state.commentReactions.get(commentId) || this.getEmptyReactions();
  }

  // Get user's reaction for a comment
  getUserReaction(commentId) {
    return this.state.userReactions.get(commentId) || null;
  }

  // Get empty reactions object
  getEmptyReactions() {
    const reactions = {};
    this.state.availableReactions.forEach(emoji => {
      reactions[emoji] = 0;
    });
    return reactions;
  }

  // Remove reactions for deleted comment
  removeCommentReactions(commentId) {
    this.state.commentReactions.delete(commentId);
    this.state.userReactions.delete(commentId);
  }

  // Refresh user reactions after login
  async refreshUserReactions() {
    // Get all comment IDs that have reactions
    const commentIds = Array.from(this.state.commentReactions.keys());
    if (commentIds.length > 0) {
      await this.loadReactionsForComments(commentIds);
    }
  }

  // Clear user reactions on logout
  clearUserReactions() {
    this.state.userReactions.clear();
  }

  // Render reactions UI for a comment
  renderReactions(commentId) {
    const container = DomUtils.createElement('div', {
      className: 'reactions-container',
      attrs: { 'data-comment-id': commentId }
    });
    
    const reactions = this.getCommentReactions(commentId);
    const userReaction = this.getUserReaction(commentId);
    
    // Render reaction buttons
    this.state.availableReactions.forEach(emoji => {
      const count = reactions[emoji] || 0;
      const isActive = userReaction === emoji;
      
      const button = DomUtils.createElement('button', {
        className: `reaction-btn ${isActive ? 'active' : ''} ${count > 0 ? 'has-reactions' : ''}`,
        attrs: {
          'data-emoji': emoji,
          'title': `React with ${emoji}`
        },
        events: {
          click: () => this.toggleReaction(commentId, emoji)
        }
      });
      
      // Add emoji
      const emojiSpan = DomUtils.createElement('span', {
        className: 'reaction-emoji',
        html: emoji
      });
      button.appendChild(emojiSpan);
      
      // Add count if > 0
      if (count > 0) {
        const countSpan = DomUtils.createElement('span', {
          className: 'reaction-count',
          html: count.toString()
        });
        button.appendChild(countSpan);
      }
      
      container.appendChild(button);
    });
    
    return container;
  }

  // Update reactions UI for a comment
  updateReactionsUI(commentId) {
    const container = document.querySelector(`.reactions-container[data-comment-id="${commentId}"]`);
    if (!container) return;
    
    // Re-render reactions
    const newContainer = this.renderReactions(commentId);
    container.replaceWith(newContainer);
  }

  // Get reaction summary for display
  getReactionSummary(commentId) {
    const reactions = this.getCommentReactions(commentId);
    const summary = [];
    
    // Get top reactions
    Object.entries(reactions)
      .filter(([emoji, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([emoji, count]) => {
        summary.push({ emoji, count });
      });
    
    return summary;
  }

  // Get total reaction count
  getTotalReactions(commentId) {
    const reactions = this.getCommentReactions(commentId);
    return Object.values(reactions).reduce((sum, count) => sum + count, 0);
  }

  // Cleanup module
  cleanup() {
    super.cleanup();
    this.state.commentReactions.clear();
    this.state.userReactions.clear();
  }
}

// Export module
export default ReactionsModule;