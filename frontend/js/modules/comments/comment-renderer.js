// Comment renderer for generating comment HTML
import { DomUtils, DateUtils, StringUtils } from '../../utils/index.js';

export class CommentRenderer {
  constructor(options = {}) {
    this.options = {
      maxDepth: 5,
      enableVoting: true,
      enableReplies: true,
      enableActions: true,
      enableAvatars: true,
      ...options
    };
    
    // Current user info
    this.currentUser = null;
    
    // Vote state
    this.userVotes = {};
  }

  // Set current user
  setCurrentUser(user) {
    this.currentUser = user;
  }

  // Set user votes
  setUserVotes(votes) {
    this.userVotes = votes || {};
  }

  // Render comment tree
  renderCommentTree(comments, depth = 0) {
    if (!comments || comments.length === 0) {
      return '';
    }
    
    return comments.map(comment => this.renderComment(comment, depth)).join('');
  }

  // Render single comment
  renderComment(comment, depth = 0) {
    const isNested = depth > 0;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const userVote = this.userVotes[comment.id];
    const isAuthor = this.currentUser && this.currentUser.id === comment.user_id;
    const isModerator = this.currentUser && this.currentUser.role === 'moderator';
    
    // Build comment HTML
    const commentHtml = `
      <div class="comment ${isNested ? 'nested-comment' : ''} ${comment.highlighted ? 'highlighted' : ''}" 
           data-comment-id="${comment.id}" 
           data-depth="${depth}"
           style="${isNested && depth <= this.options.maxDepth ? `margin-left: ${depth * 20}px` : ''}">
        
        <div class="comment-content ${comment.collapsed ? 'collapsed' : ''}">
          ${this.renderCommentHeader(comment, isAuthor, isModerator)}
          
          <div class="comment-body">
            ${comment.content_html || StringUtils.escapeHtml(comment.content)}
          </div>
          
          ${this.options.enableActions ? this.renderCommentActions(comment, userVote, isAuthor, isModerator) : ''}
        </div>
        
        ${hasReplies && depth < this.options.maxDepth ? this.renderReplies(comment, depth) : ''}
        ${hasReplies && depth >= this.options.maxDepth ? this.renderViewRepliesButton(comment) : ''}
      </div>
    `;
    
    return commentHtml;
  }

  // Render comment header
  renderCommentHeader(comment, isAuthor, isModerator) {
    return `
      <div class="comment-header">
        ${this.options.enableAvatars ? this.renderAvatar(comment) : ''}
        
        <div class="comment-meta">
          <span class="comment-author ${comment.author_role || ''}" 
                ${comment.author_role ? `title="${this.getRoleTitle(comment.author_role)}"` : ''}>
            ${StringUtils.escapeHtml(comment.author_name)}
            ${isAuthor ? '<span class="author-badge">You</span>' : ''}
            ${comment.author_role === 'moderator' ? '<span class="mod-badge">MOD</span>' : ''}
          </span>
          
          <span class="comment-time" title="${new Date(comment.created_at).toLocaleString()}">
            ${DateUtils.getRelativeTime(comment.created_at)}
          </span>
          
          ${comment.edited_at ? `
            <span class="comment-edited" title="Edited ${new Date(comment.edited_at).toLocaleString()}">
              (edited)
            </span>
          ` : ''}
          
          ${comment.parent_id ? `
            <span class="comment-reply-indicator">
              <i class="fas fa-reply"></i> Reply
            </span>
          ` : ''}
        </div>
        
        ${this.renderCommentDropdown(comment, isAuthor, isModerator)}
      </div>
    `;
  }

  // Render avatar
  renderAvatar(comment) {
    if (comment.author_avatar) {
      return `
        <img class="comment-avatar" 
             src="${StringUtils.escapeHtml(comment.author_avatar)}" 
             alt="${StringUtils.escapeHtml(comment.author_name)}'s avatar"
             loading="lazy">
      `;
    }
    
    // Default avatar with initials
    const initials = StringUtils.getInitials(comment.author_name);
    return `
      <div class="comment-avatar default-avatar" 
           style="background-color: ${this.getAvatarColor(comment.user_id)}">
        ${initials}
      </div>
    `;
  }

  // Get avatar background color
  getAvatarColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FECA57', '#48DBFB', '#0ABDE3', '#006BA6'
    ];
    const index = parseInt(userId, 10) % colors.length;
    return colors[index];
  }

  // Render comment dropdown
  renderCommentDropdown(comment, isAuthor, isModerator) {
    const hasActions = isAuthor || isModerator || this.currentUser;
    if (!hasActions) return '';
    
    return `
      <div class="comment-dropdown-container">
        <button class="comment-dropdown-trigger" 
                onclick="commentsModule.toggleCommentDropdown('${comment.id}', event)"
                aria-label="Comment options">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        
        <div class="comment-dropdown">
          ${isAuthor ? `
            <button class="dropdown-item" onclick="commentsModule.startEditingComment('${comment.id}')">
              <i class="fas fa-edit"></i> Edit
            </button>
          ` : ''}
          
          ${(isAuthor || isModerator) ? `
            <button class="dropdown-item" onclick="commentsModule.deleteComment('${comment.id}')">
              <i class="fas fa-trash"></i> Delete
            </button>
          ` : ''}
          
          ${this.currentUser && !isAuthor ? `
            <button class="dropdown-item" onclick="commentsModule.reportComment('${comment.id}')">
              <i class="fas fa-flag"></i> Report
            </button>
          ` : ''}
          
          <button class="dropdown-item" onclick="commentsModule.copyCommentLink('${comment.id}')">
            <i class="fas fa-link"></i> Copy Link
          </button>
        </div>
      </div>
    `;
  }

  // Render comment actions
  renderCommentActions(comment, userVote, isAuthor, isModerator) {
    return `
      <div class="comment-actions">
        ${this.options.enableVoting ? this.renderVoteButtons(comment, userVote) : ''}
        
        ${this.options.enableReplies && this.currentUser ? `
          <button class="comment-reply-btn" 
                  onclick="commentsModule.showReplyForm('${comment.id}')">
            <i class="fas fa-reply"></i> Reply
          </button>
        ` : ''}
        
        ${comment.replies && comment.replies.length > 0 ? `
          <button class="comment-toggle-replies" 
                  onclick="commentsModule.toggleReplies('${comment.id}')">
            <i class="fas fa-chevron-down"></i> 
            ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}
          </button>
        ` : ''}
      </div>
    `;
  }

  // Render vote buttons
  renderVoteButtons(comment, userVote) {
    const score = (comment.likes || 0) - (comment.dislikes || 0);
    
    return `
      <div class="comment-votes">
        <button class="vote-btn upvote ${userVote === 'like' ? 'active' : ''}" 
                onclick="commentsModule.voteComment('${comment.id}', 'like')"
                ${!this.currentUser ? 'disabled title="Login to vote"' : ''}>
          <i class="fas fa-arrow-up"></i>
        </button>
        
        <span class="vote-count ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}">
          ${score}
        </span>
        
        <button class="vote-btn downvote ${userVote === 'dislike' ? 'active' : ''}" 
                onclick="commentsModule.voteComment('${comment.id}', 'dislike')"
                ${!this.currentUser ? 'disabled title="Login to vote"' : ''}>
          <i class="fas fa-arrow-down"></i>
        </button>
      </div>
    `;
  }

  // Render replies
  renderReplies(comment, depth) {
    if (!comment.replies || comment.replies.length === 0) {
      return '';
    }
    
    return `
      <div class="comment-replies ${comment.repliesCollapsed ? 'collapsed' : ''}">
        ${this.renderCommentTree(comment.replies, depth + 1)}
      </div>
    `;
  }

  // Render view replies button
  renderViewRepliesButton(comment) {
    return `
      <div class="comment-view-replies">
        <button class="view-replies-btn" 
                onclick="commentsModule.enterFocusMode('${comment.id}')">
          <i class="fas fa-expand"></i> 
          View ${comment.replies.length} nested ${comment.replies.length === 1 ? 'reply' : 'replies'}
        </button>
      </div>
    `;
  }

  // Get role title
  getRoleTitle(role) {
    const titles = {
      'moderator': 'Moderator',
      'admin': 'Administrator',
      'author': 'Post Author',
      'contributor': 'Contributor'
    };
    return titles[role] || role;
  }

  // Render empty state
  renderEmptyState() {
    return `
      <div class="comments-empty">
        <i class="fas fa-comments"></i>
        <p>No comments yet. Be the first to comment!</p>
      </div>
    `;
  }

  // Render loading state
  renderLoadingState() {
    return `
      <div class="comments-loading">
        <div class="spinner"></div>
        <p>Loading comments...</p>
      </div>
    `;
  }

  // Render error state
  renderErrorState(error) {
    return `
      <div class="comments-error">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading comments: ${StringUtils.escapeHtml(error)}</p>
        <button onclick="commentsModule.loadComments()">Try Again</button>
      </div>
    `;
  }
}

// Export renderer
export default CommentRenderer;