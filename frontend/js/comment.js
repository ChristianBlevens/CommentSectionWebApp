// Comment Component
class CommentComponent {
    constructor(comment, user, depth = 0) {
        this.comment = comment;
        this.user = user;
        this.depth = depth;
        this.MAX_DEPTH = 4;
    }

    render(isFocused = false) {
        if (!this.comment) return '';

        const shouldShowLoadMore = this.depth >= this.MAX_DEPTH && this.comment.children?.length > 0;
        
        // Check if comment is deleted
        const isDeleted = !this.comment.content || this.comment.content === '[deleted]' || this.comment.is_deleted;
        const displayContent = isDeleted ? '[Comment deleted]' : this.comment.content;
        const displayAuthor = isDeleted ? '[deleted]' : (this.comment.user_name || this.comment.userName);
        const displayPicture = isDeleted ? '' : (this.comment.user_picture || this.comment.userPicture);
        
        const content = isDeleted ? '' : this.renderMarkdown(displayContent);
        
        return `
            <div class="comment-container ${this.depth > 0 ? 'comment-depth-' + this.depth : ''} ${isFocused ? 'focused-chain' : ''}" 
                 data-comment-id="${this.comment.id}">
                <!-- Vertical connection line -->
                ${this.depth > 0 && !isFocused ? '<div class="comment-line" onclick="window.commentApp.toggleCollapse(event)"></div>' : ''}
                
                <div class="comment-content" id="comment-${this.comment.id}">
                    <!-- Collapse indicator -->
                    ${this.comment.children?.length > 0 ? `
                        <div class="comment-collapse-indicator" onclick="window.commentApp.toggleCollapse(event)"></div>
                    ` : ''}
                    
                    <!-- Report button -->
                    ${this.user && !isDeleted && this.user.id !== this.comment.user_id ? `
                        <button onclick="window.commentApp.reportComment('${this.comment.id}')" 
                                class="comment-report-btn text-gray-400 hover:text-red-600"
                                title="Report comment">
                            <i class="fas fa-flag text-sm"></i>
                        </button>
                    ` : ''}
                    
                    <!-- Comment header -->
                    <div class="comment-header">
                        ${!isDeleted && displayPicture ? 
                            `<img src="${displayPicture}" class="comment-avatar" alt="${displayAuthor}">` : 
                            '<div class="comment-avatar bg-gray-300"></div>'}
                        <div class="comment-meta">
                            <span class="comment-author">${displayAuthor}</span>
                            ${this.comment.is_moderator ? '<span class="text-blue-600 text-xs"><i class="fas fa-shield-alt"></i></span>' : ''}
                            <span class="comment-time">${this.getRelativeTime(this.comment.created_at || this.comment.createdAt)}</span>
                        </div>
                    </div>
                    
                    <!-- Comment body -->
                    <div class="comment-body">
                        ${isDeleted ? '<span class="comment-deleted">[Comment deleted]</span>' : `<div class="markdown-content">${content}</div>`}
                    </div>
                    
                    <!-- Comment actions -->
                    ${!isDeleted ? `
                        <div class="comment-actions">
                            <button onclick="window.commentApp.voteComment('${this.comment.id}', 'like')" 
                                    class="comment-action vote-button ${this.comment.userVote === 'like' ? 'active-like' : ''}"
                                    title="${this.user ? (this.comment.userVote === 'like' ? 'Remove upvote' : 'Upvote') : 'Sign in to upvote'}">
                                <i class="fas fa-thumbs-up"></i>
                                <span>${this.comment.likes || 0}</span>
                            </button>
                            <button onclick="window.commentApp.voteComment('${this.comment.id}', 'dislike')" 
                                    class="comment-action vote-button ${this.comment.userVote === 'dislike' ? 'active-dislike' : ''}"
                                    title="${this.user ? (this.comment.userVote === 'dislike' ? 'Remove downvote' : 'Downvote') : 'Sign in to downvote'}">
                                <i class="fas fa-thumbs-down"></i>
                                <span>${this.comment.dislikes || 0}</span>
                            </button>
                            <button onclick="window.commentApp.showReplyForm('${this.comment.id}')" 
                                    class="comment-action">
                                <i class="fas fa-comment"></i>
                                <span>Reply</span>
                            </button>
                            ${(this.user && (this.comment.user_id === this.user.id || this.user.is_moderator)) ? `
                                <button onclick="window.commentApp.deleteComment('${this.comment.id}')" 
                                        class="comment-action text-red-600 hover:text-red-800">
                                    <i class="fas fa-trash"></i>
                                    <span>Delete</span>
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <!-- Reply form -->
                    <div id="reply-form-${this.comment.id}" style="display: none;" class="reply-form">
                        <textarea id="reply-textarea-${this.comment.id}" 
                                  placeholder="What are your thoughts?"
                                  class="reply-textarea"></textarea>
                        <div class="reply-toolbar">
                            <div class="markdown-buttons">
                                <button onclick="window.commentApp.insertMarkdownForReply('${this.comment.id}', '**', '**')" title="Bold" class="markdown-btn">
                                    <i class="fas fa-bold"></i>
                                </button>
                                <button onclick="window.commentApp.insertMarkdownForReply('${this.comment.id}', '*', '*')" title="Italic" class="markdown-btn">
                                    <i class="fas fa-italic"></i>
                                </button>
                                <button onclick="window.commentApp.insertMarkdownForReply('${this.comment.id}', '~~', '~~')" title="Strikethrough" class="markdown-btn">
                                    <i class="fas fa-strikethrough"></i>
                                </button>
                                <button onclick="window.commentApp.insertMarkdownForReply('${this.comment.id}', '||', '||')" title="Spoiler" class="markdown-btn">
                                    <i class="fas fa-eye-slash"></i>
                                </button>
                            </div>
                            <div class="reply-actions">
                                <button onclick="window.commentApp.submitReply('${this.comment.id}')" 
                                        class="reply-submit">Submit</button>
                                <button onclick="window.commentApp.cancelReply('${this.comment.id}')" 
                                        class="reply-cancel">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Children (replies) -->
                ${!shouldShowLoadMore && this.comment.children ? `
                    <div class="comment-children">
                        ${this.comment.children.map(child => 
                            new CommentComponent(child, this.user, this.depth + 1).render(isFocused)
                        ).join('')}
                    </div>
                ` : ''}
                
                <!-- Load more for deep threads -->
                ${shouldShowLoadMore ? `
                    <div class="load-more-container">
                        <button onclick="window.commentApp.loadDeepThread('${this.comment.id}')" 
                                class="load-more-btn">
                            Continue this thread →
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderMarkdown(text) {
        if (!window.markdownIt) return this.escapeHtml(text);
        
        const md = window.markdownIt({
            html: false,
            breaks: true,
            linkify: true
        });

        // Process spoilers
        text = text.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
        
        // Process video embeds
        text = this.processVideoEmbeds(text);
        
        return md.render(text);
    }

    processVideoEmbeds(text) {
        const videoRegex = /!video\[(.*?)\]\((.*?)\)/g;
        
        return text.replace(videoRegex, (match, alt, url) => {
            const youtubeId = this.getYoutubeId(url);
            const vimeoId = this.getVimeoId(url);
            
            if (youtubeId) {
                return `<div class="video-embed-container">
                    <div class="video-embed-wrapper">
                        <iframe src="https://www.youtube.com/embed/${youtubeId}" 
                                allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>
                    </div>
                </div>`;
            } else if (vimeoId) {
                return `<div class="video-embed-container">
                    <div class="video-embed-wrapper">
                        <iframe src="https://player.vimeo.com/video/${vimeoId}" 
                                allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>
                    </div>
                </div>`;
            }
            
            return match;
        });
    }

    getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    getVimeoId(url) {
        const regExp = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/;
        const match = url.match(regExp);
        return match ? match[5] : null;
    }

    getRelativeTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
            }
        }
        
        return 'just now';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.CommentComponent = CommentComponent;