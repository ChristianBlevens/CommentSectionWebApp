// Comment Renderer Component
// Reusable component for rendering comments with markdown support

class CommentRenderer {
    constructor() {
        this.md = null;
        this.initMarkdown();
    }

    initMarkdown() {
        if (typeof window !== 'undefined' && window.markdownit) {
            this.md = window.markdownit({
                html: true,
                breaks: true,
                linkify: false
            });

            // Custom image renderer
            this.md.renderer.rules.image = (tokens, idx) => {
                const token = tokens[idx];
                const src = token.attrGet('src');
                const alt = token.attrGet('alt') || '';
                const title = token.attrGet('title') || '';
                
                return `<a href="${src}" target="_blank" rel="noopener noreferrer">
                          <img src="${src}" alt="${alt}" title="${title}" 
                               class="max-w-full h-auto rounded cursor-pointer hover:opacity-90 transition-opacity" />
                        </a>`;
            };
        }
    }

    preprocessMarkdown(text) {
        if (!text) return '';
        
        // Handle spoilers
        text = text.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>');
        
        // Handle video embeds
        const videoRegex = /!video\[(.*?)\]\((.*?)\)/g;
        
        return text.replace(videoRegex, (match, alt, url) => {
            const youtubeId = this.getYoutubeId(url);
            const vimeoId = this.getVimeoId(url);
            
            if (youtubeId) {
                return `<div class="embed-responsive embed-responsive-16by9">
                          <iframe class="embed-responsive-item" 
                                  src="https://www.youtube.com/embed/${youtubeId}" 
                                  frameborder="0" allowfullscreen></iframe>
                        </div>`;
            } else if (vimeoId) {
                return `<div class="embed-responsive embed-responsive-16by9">
                          <iframe class="embed-responsive-item" 
                                  src="https://player.vimeo.com/video/${vimeoId}" 
                                  frameborder="0" allowfullscreen></iframe>
                        </div>`;
            }
            
            return match;
        });
    }

    getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    getVimeoId(url) {
        const regExp = /vimeo.*\/(\d+)/i;
        const match = url.match(regExp);
        return match ? match[1] : null;
    }

    renderMarkdown(content) {
        if (!content || !this.md) return '';
        
        try {
            const preprocessed = this.preprocessMarkdown(content);
            return this.md.render(preprocessed);
        } catch (error) {
            console.error('Error rendering markdown:', error);
            return this.escapeHtml(content);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getRelativeTime(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);
        
        if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
        if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
    }

    renderComment(comment, options = {}) {
        const {
            showActions = true,
            showVoting = true,
            showReply = true,
            showReport = true,
            showDelete = false,
            currentUserId = null,
            isModerator = false,
            depth = 0,
            maxDepth = 4,
            onVote = null,
            onReply = null,
            onReport = null,
            onDelete = null,
            onEdit = null
        } = options;

        if (!comment) return '';

        const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
        const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
        const displayAuthor = isDeleted ? '[deleted]' : comment.userName;
        const isOwnComment = currentUserId && comment.userId === currentUserId;
        const canModerate = isModerator || isOwnComment;

        const renderedContent = isDeleted ? '' : this.renderMarkdown(displayContent);

        return `
            <div class="comment-container ${depth > 0 ? 'comment-depth-' + Math.min(depth, maxDepth) : ''}" 
                 data-comment-id="${comment.id}">
                ${depth > 0 ? '<div class="comment-line"></div>' : ''}
                
                <div class="comment-content" id="comment-${comment.id}">
                    <div class="comment-header">
                        ${!isDeleted ? `<img src="${comment.userPicture || '/default-avatar.png'}" class="comment-avatar" alt="${displayAuthor}">` : '<div class="comment-avatar bg-gray-300"></div>'}
                        <div class="comment-meta">
                            <span class="comment-author">${this.escapeHtml(displayAuthor)}</span>
                            <span class="comment-time">${this.getRelativeTime(comment.createdAt)}</span>
                        </div>
                    </div>
                    
                    <div class="comment-body">
                        ${isDeleted ? '<span class="text-gray-500 italic">[Comment deleted]</span>' : `<div class="markdown-content">${renderedContent}</div>`}
                    </div>
                    
                    ${showActions && !isDeleted ? this.renderActions(comment, {
                        showVoting,
                        showReply,
                        showReport,
                        showDelete: showDelete && canModerate,
                        showEdit: isOwnComment,
                        onVote,
                        onReply,
                        onReport,
                        onDelete,
                        onEdit
                    }) : ''}
                </div>
                
                ${comment.children && comment.children.length > 0 ? this.renderChildren(comment.children, {
                    ...options,
                    depth: depth + 1
                }) : ''}
            </div>
        `;
    }

    renderActions(comment, options) {
        const {
            showVoting,
            showReply,
            showReport,
            showDelete,
            showEdit,
            onVote,
            onReply,
            onReport,
            onDelete,
            onEdit
        } = options;

        return `
            <div class="comment-actions">
                ${showVoting ? `
                    <div class="vote-buttons">
                        <button class="vote-btn ${comment.userVote === 'like' ? 'active' : ''}" 
                                onclick="${onVote ? `(${onVote})(${comment.id}, 'like')` : ''}">
                            <i class="fas fa-thumbs-up"></i>
                            <span>${comment.likes || 0}</span>
                        </button>
                        <button class="vote-btn ${comment.userVote === 'dislike' ? 'active' : ''}" 
                                onclick="${onVote ? `(${onVote})(${comment.id}, 'dislike')` : ''}">
                            <i class="fas fa-thumbs-down"></i>
                            <span>${comment.dislikes || 0}</span>
                        </button>
                    </div>
                ` : ''}
                
                <div class="action-buttons">
                    ${showReply ? `
                        <button class="action-btn" onclick="${onReply ? `(${onReply})(${comment.id})` : ''}">
                            <i class="fas fa-reply"></i> Reply
                        </button>
                    ` : ''}
                    
                    ${showEdit ? `
                        <button class="action-btn" onclick="${onEdit ? `(${onEdit})(${comment.id})` : ''}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    ` : ''}
                    
                    ${showReport ? `
                        <button class="action-btn" onclick="${onReport ? `(${onReport})(${comment.id})` : ''}">
                            <i class="fas fa-flag"></i> Report
                        </button>
                    ` : ''}
                    
                    ${showDelete ? `
                        <button class="action-btn text-red-600" onclick="${onDelete ? `(${onDelete})(${comment.id})` : ''}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderChildren(children, options) {
        if (!children || children.length === 0) return '';
        
        return `
            <div class="comment-children">
                ${children.map(child => this.renderComment(child, options)).join('')}
            </div>
        `;
    }

    renderSimpleComment(comment) {
        // Simplified version for lists and previews
        const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
        const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
        const renderedContent = isDeleted ? '' : this.renderMarkdown(displayContent);

        return `
            <div class="comment-item bg-gray-50 p-3 rounded">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs text-gray-500">${this.getRelativeTime(comment.created_at || comment.createdAt)}</span>
                </div>
                <div class="text-sm">
                    ${isDeleted ? '<span class="text-gray-500 italic">[Comment deleted]</span>' : renderedContent}
                </div>
                ${comment.likes !== undefined ? `
                    <div class="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                        <span>👍 <span>${comment.likes || 0}</span></span>
                        <span>👎 <span>${comment.dislikes || 0}</span></span>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

// Create singleton instance
const commentRenderer = new CommentRenderer();

// Export for use in other files
if (typeof window !== 'undefined') {
    window.CommentRenderer = CommentRenderer;
    window.commentRenderer = commentRenderer;
    // Log availability for debugging
    console.log('CommentRenderer component loaded and available');
}