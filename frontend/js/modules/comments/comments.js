// Comments module for managing comment functionality
import { BaseModule } from '../../core/base-module.js';
import { EventBus } from '../../core/event-bus.js';
import { StateManager } from '../../core/state-manager.js';
import { ApiClient } from '../../core/api-client.js';
import { DomUtils, DateUtils, StringUtils } from '../../utils/index.js';

class CommentsModule extends BaseModule {
  constructor() {
    super();
    this.name = 'comments';
    
    // Module state
    this.state = {
      comments: [],
      sortedComments: [],
      filteredComments: [],
      commentVotes: {},
      focusedCommentId: null,
      focusedComments: [],
      highlightedCommentId: null,
      searchQuery: '',
      searchMode: 'and',
      sortBy: 'likes',
      newCommentText: '',
      commentPreview: '',
      replyingTo: null,
      editingComment: null,
      editText: '',
      isLoading: false,
      error: null
    };
    
    // API client instance
    this.api = new ApiClient();
    
    // Event bus instance
    this.eventBus = window.eventBus || new EventBus();
    
    // State manager instance
    this.stateManager = window.stateManager || new StateManager();
    
    // Initialize markdown parser
    this.initializeMarkdown();
  }

  // Initialize the module
  async initialize(config = {}) {
    this.config = config;
    
    // Register state with state manager
    this.stateManager.setState(this.name, 'comments', this.state.comments);
    this.stateManager.setState(this.name, 'sortBy', this.state.sortBy);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Load initial comments
    await this.loadComments();
    
    this.initialized = true;
    this.emit('comments:initialized');
    
    return true;
  }

  // Setup event listeners
  setupEventListeners() {
    // Listen for auth changes
    this.on('auth:login', () => this.loadComments());
    this.on('auth:logout', () => this.clearComments());
    
    // Listen for moderation actions
    this.on('moderation:commentDeleted', (data) => this.handleCommentDeleted(data));
    this.on('moderation:userBanned', (data) => this.handleUserBanned(data));
    
    // Listen for theme changes
    this.on('theme:changed', () => this.updateCommentStyles());
    
    // Setup DOM event listeners
    this.setupDomListeners();
  }

  // Setup DOM event listeners
  setupDomListeners() {
    // Close dropdowns on outside click
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.comment-dropdown-container')) {
        this.closeAllDropdowns();
      }
    });
  }

  // Initialize markdown parser
  initializeMarkdown() {
    if (!window.md) {
      window.md = window.markdownit({
        html: false,
        breaks: true,
        linkify: true
      });
    }
  }

  // Load comments from API
  async loadComments() {
    this.state.isLoading = true;
    this.emit('comments:loading');
    
    try {
      const response = await this.api.get('/api/comments');
      
      if (response.comments) {
        this.state.comments = response.comments;
        this.state.commentVotes = response.userVotes || {};
        
        // Sort and filter comments
        this.sortComments();
        this.filterComments();
        
        // Update state manager
        this.stateManager.setState(this.name, 'comments', this.state.comments);
        
        this.emit('comments:loaded', { comments: this.state.comments });
      }
    } catch (error) {
      this.state.error = error.message;
      this.emit('comments:error', { error: error.message });
    } finally {
      this.state.isLoading = false;
    }
  }

  // Submit new comment
  async submitComment(text) {
    if (!text || !text.trim()) return;
    
    try {
      const response = await this.api.post('/api/comments', {
        content: text.trim()
      });
      
      if (response.comment) {
        // Add to comments array
        this.state.comments.unshift(response.comment);
        
        // Clear input
        this.state.newCommentText = '';
        this.state.commentPreview = '';
        
        // Resort and refilter
        this.sortComments();
        this.filterComments();
        
        this.emit('comments:added', { comment: response.comment });
      }
    } catch (error) {
      this.emit('comments:error', { error: error.message });
      throw error;
    }
  }

  // Submit reply to comment
  async submitReply(parentId, text) {
    if (!text || !text.trim() || !parentId) return;
    
    try {
      const response = await this.api.post('/api/comments', {
        content: text.trim(),
        parent_id: parentId
      });
      
      if (response.comment) {
        // Add to comments array
        this.state.comments.push(response.comment);
        
        // Clear reply state
        this.state.replyingTo = null;
        
        // Resort and refilter
        this.sortComments();
        this.filterComments();
        
        // If in focus mode, update focused comments
        if (this.state.focusedCommentId === parentId) {
          this.updateFocusedComments();
        }
        
        this.emit('comments:replied', { 
          comment: response.comment,
          parentId: parentId 
        });
      }
    } catch (error) {
      this.emit('comments:error', { error: error.message });
      throw error;
    }
  }

  // Vote on comment
  async voteComment(commentId, voteType) {
    try {
      const response = await this.api.post(`/api/comments/${commentId}/vote`, {
        vote_type: voteType
      });
      
      if (response.likes !== undefined) {
        // Update comment likes
        const comment = this.findComment(commentId);
        if (comment) {
          comment.likes = response.likes;
          comment.dislikes = response.dislikes;
        }
        
        // Update user votes
        this.state.commentVotes[commentId] = voteType;
        
        // Resort if sorting by likes
        if (this.state.sortBy === 'likes' || this.state.sortBy === 'popularity') {
          this.sortComments();
        }
        
        this.emit('comments:voted', { 
          commentId, 
          voteType,
          likes: response.likes,
          dislikes: response.dislikes
        });
      }
    } catch (error) {
      this.emit('comments:error', { error: error.message });
    }
  }

  // Delete comment
  async deleteComment(commentId) {
    const comment = this.findComment(commentId);
    if (!comment) return;
    
    const confirmMessage = comment.replies && comment.replies.length > 0
      ? 'This comment has replies. Deleting it will also delete all replies. Are you sure?'
      : 'Are you sure you want to delete this comment?';
    
    if (!confirm(confirmMessage)) return;
    
    try {
      await this.api.delete(`/api/comments/${commentId}`);
      
      // Remove from state
      this.removeCommentFromState(commentId);
      
      // Resort and refilter
      this.sortComments();
      this.filterComments();
      
      this.emit('comments:deleted', { commentId });
    } catch (error) {
      this.emit('comments:error', { error: error.message });
    }
  }

  // Report comment
  async reportComment(commentId) {
    const reason = prompt('Please provide a reason for reporting this comment:');
    if (!reason) return;
    
    try {
      await this.api.post(`/api/comments/${commentId}/report`, {
        reason: reason.trim()
      });
      
      this.emit('comments:reported', { commentId, reason });
      alert('Comment reported successfully');
    } catch (error) {
      this.emit('comments:error', { error: error.message });
    }
  }

  // Sort comments
  sortComments() {
    const sortFunctions = {
      likes: (a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes),
      popularity: (a, b) => {
        const scoreA = a.likes + a.dislikes + (a.replies?.length || 0) * 2;
        const scoreB = b.likes + b.dislikes + (b.replies?.length || 0) * 2;
        return scoreB - scoreA;
      },
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at)
    };
    
    const sortFn = sortFunctions[this.state.sortBy] || sortFunctions.likes;
    
    // Sort top-level comments
    const topLevel = this.state.comments.filter(c => !c.parent_id);
    const sorted = [...topLevel].sort(sortFn);
    
    // Sort replies for each comment
    const sortReplies = (comment) => {
      if (comment.replies && comment.replies.length > 0) {
        comment.replies = [...comment.replies].sort(sortFn);
        comment.replies.forEach(sortReplies);
      }
    };
    
    sorted.forEach(sortReplies);
    
    // Build tree structure
    this.state.sortedComments = this.buildCommentTree(sorted);
  }

  // Filter comments
  filterComments() {
    const query = this.state.searchQuery.toLowerCase().trim();
    
    if (!query) {
      this.state.filteredComments = this.state.sortedComments;
      return;
    }
    
    const terms = query.split(/\s+/);
    
    const matchesQuery = (comment) => {
      const text = comment.content.toLowerCase();
      const author = comment.author_name.toLowerCase();
      const combined = `${text} ${author}`;
      
      switch (this.state.searchMode) {
        case 'and':
          return terms.every(term => combined.includes(term));
        case 'or':
          return terms.some(term => combined.includes(term));
        case 'not':
          return !terms.some(term => combined.includes(term));
        default:
          return combined.includes(query);
      }
    };
    
    const filterRecursive = (comments) => {
      return comments.reduce((acc, comment) => {
        const matches = matchesQuery(comment);
        const filteredReplies = comment.replies ? filterRecursive(comment.replies) : [];
        
        if (matches || filteredReplies.length > 0) {
          acc.push({
            ...comment,
            replies: filteredReplies,
            highlighted: matches
          });
        }
        
        return acc;
      }, []);
    };
    
    this.state.filteredComments = filterRecursive(this.state.sortedComments);
  }

  // Build comment tree structure
  buildCommentTree(comments) {
    const commentMap = new Map();
    const rootComments = [];
    
    // First pass: create map
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });
    
    // Second pass: build tree
    this.state.comments.forEach(comment => {
      const commentNode = commentMap.get(comment.id);
      if (commentNode) {
        if (comment.parent_id) {
          const parent = commentMap.get(comment.parent_id);
          if (parent) {
            parent.replies.push(commentNode);
          }
        } else {
          rootComments.push(commentNode);
        }
      }
    });
    
    return rootComments;
  }

  // Find comment by ID
  findComment(commentId, comments = null) {
    if (!comments) {
      comments = this.state.comments;
    }
    
    for (const comment of comments) {
      if (comment.id === commentId) {
        return comment;
      }
      if (comment.replies) {
        const found = this.findComment(commentId, comment.replies);
        if (found) return found;
      }
    }
    
    return null;
  }

  // Remove comment from state
  removeCommentFromState(commentId) {
    // Remove from flat array
    this.state.comments = this.state.comments.filter(c => c.id !== commentId);
    
    // Remove votes
    delete this.state.commentVotes[commentId];
    
    // Clear editing/replying state if needed
    if (this.state.editingComment?.id === commentId) {
      this.state.editingComment = null;
      this.state.editText = '';
    }
    if (this.state.replyingTo === commentId) {
      this.state.replyingTo = null;
    }
  }

  // Enter focus mode
  enterFocusMode(commentId) {
    const comment = this.findComment(commentId);
    if (!comment) return;
    
    this.state.focusedCommentId = commentId;
    this.state.focusedComments = [comment];
    
    this.emit('comments:focusModeEntered', { commentId });
  }

  // Exit focus mode
  exitFocusMode() {
    this.state.focusedCommentId = null;
    this.state.focusedComments = [];
    
    this.emit('comments:focusModeExited');
  }

  // Update focused comments
  updateFocusedComments() {
    if (!this.state.focusedCommentId) return;
    
    const comment = this.findComment(this.state.focusedCommentId);
    if (comment) {
      this.state.focusedComments = [comment];
    }
  }

  // Toggle comment dropdown
  toggleCommentDropdown(commentId, event) {
    event.stopPropagation();
    
    const dropdown = event.target.closest('.comment-dropdown-container')?.querySelector('.comment-dropdown');
    if (!dropdown) return;
    
    // Close all other dropdowns
    this.closeAllDropdowns();
    
    // Toggle this dropdown
    dropdown.classList.toggle('show');
    
    // Add marker class to comment
    const commentEl = event.target.closest('.comment-content');
    if (commentEl) {
      commentEl.classList.toggle('has-open-dropdown');
    }
  }

  // Close all dropdowns
  closeAllDropdowns() {
    document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
      dropdown.classList.remove('show');
    });
    document.querySelectorAll('.comment-content.has-open-dropdown').forEach(comment => {
      comment.classList.remove('has-open-dropdown');
    });
  }

  // Handle comment deleted event
  handleCommentDeleted(data) {
    this.removeCommentFromState(data.commentId);
    this.sortComments();
    this.filterComments();
  }

  // Handle user banned event
  handleUserBanned(data) {
    // Remove all comments by banned user
    this.state.comments = this.state.comments.filter(c => c.user_id !== data.userId);
    this.sortComments();
    this.filterComments();
  }

  // Update comment styles for theme
  updateCommentStyles() {
    // Emit event for UI to handle theme updates
    this.emit('comments:themeUpdated');
  }

  // Clear all comments
  clearComments() {
    this.state.comments = [];
    this.state.sortedComments = [];
    this.state.filteredComments = [];
    this.state.commentVotes = {};
    this.state.focusedCommentId = null;
    this.state.focusedComments = [];
    
    this.emit('comments:cleared');
  }

  // Update search query
  setSearchQuery(query) {
    this.state.searchQuery = query;
    this.filterComments();
    this.emit('comments:searchUpdated', { query });
  }

  // Update search mode
  setSearchMode(mode) {
    this.state.searchMode = mode;
    this.filterComments();
    this.emit('comments:searchModeUpdated', { mode });
  }

  // Update sort order
  setSortOrder(sortBy) {
    this.state.sortBy = sortBy;
    this.stateManager.setState(this.name, 'sortBy', sortBy);
    this.sortComments();
    this.filterComments();
    this.emit('comments:sortUpdated', { sortBy });
  }

  // Show reply form
  showReplyForm(commentId) {
    this.state.replyingTo = commentId;
    this.emit('comments:replyFormShown', { commentId });
  }

  // Cancel reply
  cancelReply() {
    this.state.replyingTo = null;
    this.emit('comments:replyFormCancelled');
  }

  // Start editing comment
  startEditingComment(commentId) {
    const comment = this.findComment(commentId);
    if (!comment) return;
    
    this.state.editingComment = comment;
    this.state.editText = comment.content;
    
    this.emit('comments:editStarted', { commentId });
  }

  // Cancel editing
  cancelEditing() {
    this.state.editingComment = null;
    this.state.editText = '';
    
    this.emit('comments:editCancelled');
  }

  // Update preview
  updatePreview(text) {
    this.state.commentPreview = this.renderMarkdown(text);
    this.emit('comments:previewUpdated', { preview: this.state.commentPreview });
  }

  // Render markdown
  renderMarkdown(text) {
    if (!window.md) {
      this.initializeMarkdown();
    }
    return window.md.render(text);
  }

  // Get relative time
  getRelativeTime(date) {
    return DateUtils.getRelativeTime(date);
  }

  // Cleanup module
  cleanup() {
    super.cleanup();
    this.clearComments();
  }
}

// Export module
export default CommentsModule;