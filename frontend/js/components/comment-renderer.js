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

    // Build comment tree from flat array
    buildCommentTree(comments) {
        const commentMap = {};
        const rootComments = [];

        // Create map
        comments.forEach(comment => {
            comment.children = [];
            commentMap[comment.id] = comment;
        });

        // Build tree
        comments.forEach(comment => {
            if (comment.parentId) {
                const parent = commentMap[comment.parentId];
                if (parent) {
                    parent.children.push(comment);
                } else {
                    rootComments.push(comment);
                }
            } else {
                rootComments.push(comment);
            }
        });

        return rootComments;
    }

    // Main render method that matches comment-app.js exactly
    renderComment(comment, context = {}) {
        const {
            depth = 0,
            user = null,
            reportedCommentId = null,
            appInstance = null // Either commentAppInstance or usersAppInstance
        } = context;

        if (!comment) return '';
        
        const MAX_DEPTH = 4;
        const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
        const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
        const displayAuthor = isDeleted ? '[deleted]' : comment.userName;
        
        const processed = isDeleted ? '' : this.preprocessMarkdown(displayContent);
        const content = isDeleted ? '' : this.renderMarkdown(processed);
        
        let html = `
            <div class="comment-container ${depth > 0 ? 'comment-depth-' + Math.min(depth, MAX_DEPTH) : ''}" 
                 data-comment-id="${comment.id}">
                ${depth > 0 ? `<div class="comment-line" onclick="${appInstance}.toggleCollapse(event)"></div>` : ''}
                
                <div class="comment-content ${reportedCommentId == comment.id ? 'reported-comment' : ''}" id="comment-${comment.id}">
                    
                    <div class="comment-header">
                        ${!isDeleted ? `<img src="${comment.userPicture}" class="comment-avatar">` : '<div class="comment-avatar bg-gray-300"></div>'}
                        <div class="comment-meta">
                            <span class="comment-author">${displayAuthor}</span>
                            <span class="comment-time">${this.getRelativeTime(comment.createdAt)}</span>
                        </div>
                    </div>
                    
                    <div class="comment-body">
                        ${isDeleted ? '<span class="text-gray-500 italic">[Comment deleted]</span>' : `<div class="markdown-content">${content}</div>`}
                    </div>
                    
                    ${!isDeleted ? `
                        <div class="comment-actions">
                            ${this.renderCommentActions(comment, context)}
                        </div>
                    ` : ''}
                    
                    ${this.renderReplyForm(comment.id, appInstance)}
                </div>
                
                <div class="comment-children">
                    ${this.renderChildren(comment, depth, context, MAX_DEPTH)}
                </div>
            </div>
        `;
        
        setTimeout(() => {
            if (typeof Utils !== 'undefined' && Utils.attachSpoilerHandlers) {
                Utils.attachSpoilerHandlers();
            }
        }, 0);
        
        return html;
    }

    renderCommentActions(comment, context) {
        const { user, appInstance } = context;
        
        // For users page - simplified actions
        if (appInstance === 'window.usersAppInstance') {
            return `
                <button onclick="${appInstance}.deleteComment('${comment.id}')" 
                        class="comment-action">
                    <i class="fas fa-trash"></i>
                    Delete
                </button>
                <button onclick="${appInstance}.reportComment('${comment.id}')" 
                        class="comment-action">
                    <i class="fas fa-flag"></i>
                    Report
                </button>
            `;
        }
        
        // For index page - full actions
        return `
            <button onclick="${appInstance}.voteComment('${comment.id}', 'like')" 
                    class="comment-action ${comment.userVote === 'like' ? 'active-like' : ''}">
                <i class="fas fa-thumbs-up"></i>
                <span>${comment.likes}</span>
            </button>
            <button onclick="${appInstance}.voteComment('${comment.id}', 'dislike')" 
                    class="comment-action ${comment.userVote === 'dislike' ? 'active-dislike' : ''}">
                <i class="fas fa-thumbs-down"></i>
                <span>${comment.dislikes}</span>
            </button>
            <button onclick="${appInstance}.showReplyForm('${comment.id}')" 
                    class="comment-action">
                <i class="fas fa-comment"></i>
                Reply
            </button>
            ${user ? `
                <div class="comment-dropdown-container">
                    <button onclick="${appInstance}.toggleDropdown('${comment.id}', event)" 
                            class="comment-options-btn" id="options-btn-${comment.id}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="dropdown-${comment.id}" class="comment-dropdown">
                        <button onclick="${appInstance}.reportComment('${comment.id}')" 
                                class="comment-dropdown-item">
                            <i class="fas fa-flag"></i>
                            Report
                        </button>
                        ${(comment.userId === user.id || user.is_moderator) ? `
                            <button onclick="${appInstance}.deleteComment('${comment.id}')" 
                                    class="comment-dropdown-item">
                                <i class="fas fa-trash"></i>
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
        `;
    }

    renderReplyForm(commentId, appInstance) {
        // Only render reply form for comment app
        if (appInstance !== 'window.commentAppInstance') {
            return '';
        }
        
        return `
            <div id="reply-form-${commentId}" style="display: none;" class="reply-form">
                <textarea id="reply-textarea-${commentId}" 
                          placeholder="Write a reply..."
                          class="reply-textarea"></textarea>
                <div class="reply-toolbar">
                    <div class="markdown-buttons">
                        <button onclick="${appInstance}.insertMarkdownForReply('${commentId}', '**', '**')" class="markdown-btn">
                            <i class="fas fa-bold"></i>
                        </button>
                        <button onclick="${appInstance}.insertMarkdownForReply('${commentId}', '*', '*')" class="markdown-btn">
                            <i class="fas fa-italic"></i>
                        </button>
                        <button onclick="${appInstance}.insertMarkdownForReply('${commentId}', '~~', '~~')" class="markdown-btn">
                            <i class="fas fa-strikethrough"></i>
                        </button>
                        <button onclick="${appInstance}.insertMarkdownForReply('${commentId}', '## ', '')" class="markdown-btn">
                            <i class="fas fa-heading"></i>
                        </button>
                        <button onclick="${appInstance}.insertMarkdownForReply('${commentId}', '||', '||')" class="markdown-btn">
                            <i class="fas fa-eye-slash"></i>
                        </button>
                        <button onclick="${appInstance}.insertImageForReply('${commentId}')" class="markdown-btn">
                            <i class="fas fa-image"></i>
                        </button>
                        <button onclick="${appInstance}.insertVideoForReply('${commentId}')" class="markdown-btn">
                            <i class="fas fa-video"></i>
                        </button>
                    </div>
                    <div class="reply-actions">
                        <button onclick="${appInstance}.cancelReply('${commentId}')" 
                                class="btn-secondary">
                            Cancel
                        </button>
                        <button onclick="${appInstance}.submitReply('${commentId}')" 
                                class="btn-primary">
                            Reply
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderChildren(comment, depth, context, maxDepth) {
        const { appInstance } = context;
        
        if (depth < maxDepth && comment.children?.length > 0) {
            return comment.children.map(child => 
                this.renderComment(child, { ...context, depth: depth + 1 })
            ).join('');
        } else if (depth >= maxDepth && comment.children?.length > 0) {
            return `
                <div class="ml-4 mt-2">
                    <button onclick="${appInstance}.viewReplies('${comment.id}')" 
                            class="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-2 rounded hover:bg-blue-50 transition-colors">
                        <i class="fas fa-comments mr-1"></i>
                        View ${comment.children.length} ${comment.children.length === 1 ? 'reply' : 'replies'}
                    </button>
                </div>
            `;
        }
        return '';
    }

    // Legacy method for backward compatibility
    renderComment_old(comment, options = {}) {
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