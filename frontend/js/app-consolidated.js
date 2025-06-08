// Consolidated JavaScript from all frontend pages
// This file will be refactored into modular components

// ===== SHARED CONFIGURATION =====
let CONFIG = {
    backendUrl: window.location.origin,
    moderationUrl: window.location.origin,
    discordClientId: '',
    discordRedirectUri: ''
};

// Load configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            CONFIG.discordClientId = config.discordClientId;
            CONFIG.discordRedirectUri = config.discordRedirectUri;
            CONFIG.backendUrl = window.location.origin;
            CONFIG.moderationUrl = window.location.origin;
            console.log('Configuration loaded:', CONFIG);
        } else {
            console.error('Failed to load configuration');
            CONFIG = {
                discordClientId: '',
                discordRedirectUri: window.location.origin + '/oauth-callback.html'
            };
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
        CONFIG = {
            discordClientId: '',
            discordRedirectUri: window.location.origin + '/oauth-callback.html'
        };
    }
}

// Load config immediately
loadConfig();

// ===== COMMENT APP (index.html) =====
function commentApp() {
    return {
        user: null,
        comments: [],
        sortedComments: [],
        loading: true,
        newCommentText: '',
        commentPreview: '',
        replyTexts: {},
        sortBy: 'likes',
        pageId: '',
        md: null,
        apiUrl: '/api',
        moderationUrl: '/moderation/api',
        focusedCommentId: null,
        focusedComments: [],
        reportedCommentId: null,
        pageReports: [],
        showReportsPanel: false,
        loadingReports: false,
        showBanDropdown: null,
        banNotification: null,

        init() {
            // Set global instance
            window.commentAppInstance = this;
            
            // Get page ID
            this.pageId = this.getPageId();
            
            // Initialize markdown
            this.initMarkdown();
            
            // Check session
            this.checkExistingSession();
            
            // Load comments
            this.loadComments();
            
            // Load reports if moderator
            if (this.user && this.user.is_moderator) {
                this.loadPageReports();
            }
            
            // Check for comment hash in URL
            const hash = window.location.hash;
            if (hash && hash.startsWith('#comment-')) {
                const commentId = hash.substring(9); // Remove '#comment-' prefix
                // Wait for comments to load before focusing
                setTimeout(() => {
                    this.focusOnComment(commentId);
                }, 1000);
            }
            
            // Listen for OAuth messages
            window.addEventListener('message', (event) => {
                if (event.data?.type === 'discord-login-success') {
                    this.user = event.data.user;
                    localStorage.setItem('user', JSON.stringify(this.user));
                    if (event.data.sessionToken) {
                        localStorage.setItem('sessionToken', event.data.sessionToken);
                    }
                    
                    // Check for ban info
                    if (this.user.ban_info) {
                        this.showBanNotification(this.user.ban_info);
                    } else if (this.user.ban_expired) {
                        this.showBanExpiredNotification();
                    }
                    
                    this.loadComments();
                    // Load reports if user became a moderator
                    if (this.user && this.user.is_moderator) {
                        this.loadPageReports();
                    }
                }
            });
            
            // Close dropdowns when clicking outside
            document.addEventListener('click', (event) => {
                if (!event.target.closest('.comment-options-btn') && !event.target.closest('.comment-dropdown')) {
                    document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
                        dropdown.classList.remove('show');
                    });
                }
            });
            
            // Listen for hash changes (browser back/forward)
            window.addEventListener('hashchange', () => {
                const hash = window.location.hash;
                if (hash && hash.startsWith('#comment-')) {
                    const commentId = hash.substring(9);
                    this.focusOnComment(commentId);
                } else {
                    // No hash, exit focus mode if we're in it
                    if (this.focusedCommentId || this.reportedCommentId) {
                        this.exitFocusMode();
                    }
                }
            });
        },

        // Get page ID from URL params
        getPageId() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('pageId') || window.PAGE_ID || 'default';
        },

        // Initialize markdown processor
        initMarkdown() {
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
        },

        // Preprocess markdown for custom features
        preprocessMarkdown(text) {
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
        },

        // Extract YouTube video ID
        getYoutubeId(url) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        },

        // Extract Vimeo video ID
        getVimeoId(url) {
            const regExp = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/;
            const match = url.match(regExp);
            return match ? match[5] : null;
        },

        // Check existing session
        async checkExistingSession() {
            const savedUser = localStorage.getItem('user');
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (savedUser && sessionToken) {
                this.user = JSON.parse(savedUser);
                // Check ban status for returning users
                await this.checkBanStatus();
            } else {
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
            }
        },
        
        // Check ban status
        async checkBanStatus() {
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken || !this.user) return;
            
            try {
                const response = await fetch(`${this.apiUrl}/check-ban-status`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    const banStatus = await response.json();
                    
                    if (banStatus.ban_expired) {
                        this.showBanExpiredNotification();
                        this.user.is_banned = false;
                    } else if (banStatus.is_banned) {
                        this.showBanNotification(banStatus);
                        this.user.is_banned = true;
                    }
                }
            } catch (error) {
                console.error('Error checking ban status:', error);
            }
        },

        // Sign in with Discord
        signInWithDiscord() {
            const state = Math.random().toString(36).substring(7);
            localStorage.setItem('discord_state', state);
            
            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CONFIG.discordClientId}&redirect_uri=${encodeURIComponent(CONFIG.discordRedirectUri)}&response_type=code&scope=identify&state=${state}`;
            
            const width = 500;
            const height = 700;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;
            
            window.open(authUrl, 'discord-auth', `width=${width},height=${height},left=${left},top=${top}`);
        },

        // Sign out
        async signOut() {
            const sessionToken = localStorage.getItem('sessionToken');
            if (sessionToken) {
                try {
                    await fetch(`${this.apiUrl}/logout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${sessionToken}`
                        }
                    });
                } catch (error) {
                    console.error('Logout failed:', error);
                }
            }
            
            this.user = null;
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
        },

        // Load comments
        async loadComments() {
            try {
                const url = `${this.apiUrl}/comments/${this.pageId}${this.user ? `?userId=${this.user.id}` : ''}`;
                const response = await fetch(url);
                const data = await response.json();
                
                this.comments = data;
                this.buildCommentTree();
                this.sortComments();
                
                // Load reports if user is moderator
                if (this.user && this.user.is_moderator) {
                    this.loadPageReports();
                }
            } catch (error) {
                console.error('Error loading comments:', error);
            } finally {
                this.loading = false;
            }
        },

        // Build comment tree
        buildCommentTree() {
            const commentMap = {};
            const rootComments = [];

            // Create map
            this.comments.forEach(comment => {
                comment.children = [];
                commentMap[comment.id] = comment;
            });

            // Build tree
            this.comments.forEach(comment => {
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

            this.comments = rootComments;
        },

        // Sort comments
        sortComments() {
            const sortFn = this.getSortFunction();
            
            const sortRecursive = (comments) => {
                comments.sort(sortFn);
                comments.forEach(comment => {
                    if (comment.children?.length > 0) {
                        sortRecursive(comment.children);
                    }
                });
            };

            sortRecursive(this.comments);
            this.sortedComments = [...this.comments];
            
            this.$nextTick(() => {
                this.attachSpoilerHandlers();
            });
        },

        // Get sort function
        getSortFunction() {
            switch (this.sortBy) {
                case 'likes':
                    return (a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes);
                case 'popularity':
                    return (a, b) => this.countTotalReplies(b) - this.countTotalReplies(a);
                case 'newest':
                    return (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
                case 'oldest':
                    return (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
                default:
                    return () => 0;
            }
        },
        
        // Count total replies
        countTotalReplies(comment) {
            let count = 0;
            if (comment.children?.length > 0) {
                count += comment.children.length;
                comment.children.forEach(child => {
                    count += this.countTotalReplies(child);
                });
            }
            return count;
        },

        // Update preview
        updatePreview() {
            const processed = this.preprocessMarkdown(this.newCommentText);
            this.commentPreview = this.md.render(processed);
            this.$nextTick(() => {
                this.attachSpoilerHandlers();
            });
        },

        // Insert markdown
        insertMarkdown(before, after) {
            const textarea = document.querySelector('textarea');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const selectedText = text.substring(start, end);
            
            const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
            this.newCommentText = newText;
            
            this.$nextTick(() => {
                textarea.focus();
                const newCursorPos = start + before.length + selectedText.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
                this.updatePreview();
            });
        },

        // Insert image
        insertImage() {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdown(`![Image](${url})`, '');
            }
        },

        // Insert video
        insertVideo() {
            const url = prompt('Enter video URL (YouTube or Vimeo):');
            if (url) {
                this.insertMarkdown(`!video[Video](${url})`, '');
            }
        },

        // Submit comment
        async submitComment(parentId = null) {
            if (!this.user) {
                alert('Please sign in to comment');
                return;
            }
            
            // Check if user is banned
            if (this.user.is_banned) {
                await this.checkBanStatus();
                if (this.user.is_banned) {
                    alert('You are banned from commenting');
                    return;
                }
            }
            
            const content = parentId ? this.replyTexts[parentId] : this.newCommentText;
            if (!content?.trim()) return;
            
            try {
                // Moderate content first
                const moderationResponse = await fetch(`${this.moderationUrl}/moderate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, userId: this.user.id })
                });

                const moderationResult = await moderationResponse.json();

                if (!moderationResult.approved) {
                    alert(`Your comment was not approved. Reason: ${moderationResult.reason}`);
                    return;
                }

                // Submit to backend
                const sessionToken = localStorage.getItem('sessionToken');
                if (!sessionToken) {
                    alert('Please sign in again');
                    return;
                }
                
                const response = await fetch(`${this.apiUrl}/comments`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        pageId: this.pageId,
                        content: content,
                        parentId: parentId
                    })
                });

                const newComment = await response.json();
                
                // Add to tree
                this.addCommentToTree(newComment);
                
                // Clear form
                if (parentId) {
                    this.cancelReply(parentId);
                } else {
                    this.newCommentText = '';
                    this.commentPreview = '';
                }

                // Resort
                this.sortComments();

            } catch (error) {
                console.error('Error submitting comment:', error);
                alert('Failed to submit comment. Please try again.');
            }
        },

        // Add comment to tree
        addCommentToTree(comment) {
            comment.children = [];
            
            if (!comment.parentId) {
                this.comments.push(comment);
            } else {
                const parent = this.findComment(comment.parentId, this.comments);
                if (parent) {
                    parent.children.push(comment);
                } else {
                    this.comments.push(comment);
                }
            }
        },

        // Find comment
        findComment(id, comments) {
            for (const comment of comments) {
                if (comment.id == id) return comment;
                if (comment.children?.length > 0) {
                    const found = this.findComment(id, comment.children);
                    if (found) return found;
                }
            }
            return null;
        },

        // Vote on comment
        async voteComment(commentId, voteType) {
            if (!this.user) {
                alert('Please sign in to vote');
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/comments/${commentId}/vote`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ voteType })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to vote');
                }

                const result = await response.json();
                
                // Update local state
                const comment = this.findComment(commentId, this.comments);
                if (comment) {
                    comment.likes = result.likes;
                    comment.dislikes = result.dislikes;
                    comment.userVote = result.userVote;
                }

                if (this.sortBy === 'likes') {
                    this.sortComments();
                }

            } catch (error) {
                console.error('Error voting:', error);
                alert('Failed to vote. Please try again.');
            }
        },

        // Show reply form
        showReplyForm(commentId) {
            if (!this.user) {
                alert('Please sign in to reply');
                return;
            }
            
            // Hide all other reply forms
            document.querySelectorAll('[id^="reply-form-"]').forEach(form => {
                form.style.display = 'none';
            });
            
            // Show this form
            const replyForm = document.getElementById(`reply-form-${commentId}`);
            if (replyForm) {
                replyForm.style.display = 'block';
                const textarea = document.getElementById(`reply-textarea-${commentId}`);
                if (textarea) {
                    textarea.focus();
                }
            }
        },

        // Cancel reply
        cancelReply(commentId) {
            const replyForm = document.getElementById(`reply-form-${commentId}`);
            if (replyForm) {
                replyForm.style.display = 'none';
            }
            
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (textarea) {
                textarea.value = '';
            }
            
            delete this.replyTexts[commentId];
        },
        
        // Submit reply
        async submitReply(commentId) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (!textarea?.value.trim()) return;
            
            this.replyTexts[commentId] = textarea.value;
            await this.submitComment(commentId);
            this.cancelReply(commentId);
        },

        // Insert markdown for reply
        insertMarkdownForReply(commentId, before, after) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (!textarea) return;
            
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const selectedText = text.substring(start, end);
            
            const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
            textarea.value = newText;
            this.replyTexts[commentId] = newText;
            
            this.$nextTick(() => {
                textarea.focus();
                const newCursorPos = start + before.length + selectedText.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            });
        },

        // Insert image for reply
        insertImageForReply(commentId) {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdownForReply(commentId, `![Image](${url})`, '');
            }
        },

        // Insert video for reply
        insertVideoForReply(commentId) {
            const url = prompt('Enter video URL (YouTube or Vimeo):');
            if (url) {
                this.insertMarkdownForReply(commentId, `!video[Video](${url})`, '');
            }
        },

        // Render comment
        renderComment(comment, depth = 0) {
            if (!comment) return '';
            
            const MAX_DEPTH = 4;
            const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
            const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
            const displayAuthor = isDeleted ? '[deleted]' : comment.userName;
            
            const processed = isDeleted ? '' : this.preprocessMarkdown(displayContent);
            const content = isDeleted ? '' : this.md.render(processed);
            
            let html = `
                <div class="comment-container ${depth > 0 ? 'comment-depth-' + depth : ''}" 
                     data-comment-id="${comment.id}">
                    ${depth > 0 ? '<div class="comment-line" onclick="window.commentAppInstance.toggleCollapse(event)"></div>' : ''}
                    
                    <div class="comment-content ${this.reportedCommentId == comment.id ? 'reported-comment' : ''}" id="comment-${comment.id}">
                        
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
                                <button onclick="window.commentAppInstance.voteComment('${comment.id}', 'like')" 
                                        class="comment-action ${comment.userVote === 'like' ? 'active-like' : ''}">
                                    <i class="fas fa-thumbs-up"></i>
                                    <span>${comment.likes}</span>
                                </button>
                                <button onclick="window.commentAppInstance.voteComment('${comment.id}', 'dislike')" 
                                        class="comment-action ${comment.userVote === 'dislike' ? 'active-dislike' : ''}">
                                    <i class="fas fa-thumbs-down"></i>
                                    <span>${comment.dislikes}</span>
                                </button>
                                <button onclick="window.commentAppInstance.showReplyForm('${comment.id}')" 
                                        class="comment-action">
                                    <i class="fas fa-comment"></i>
                                    Reply
                                </button>
                                ${this.user ? `
                                    <div class="comment-dropdown-container">
                                        <button onclick="window.commentAppInstance.toggleDropdown('${comment.id}', event)" 
                                                class="comment-options-btn" id="options-btn-${comment.id}">
                                            <i class="fas fa-ellipsis-v"></i>
                                        </button>
                                        <div id="dropdown-${comment.id}" class="comment-dropdown">
                                            <button onclick="window.commentAppInstance.reportComment('${comment.id}')" 
                                                    class="comment-dropdown-item">
                                                <i class="fas fa-flag"></i>
                                                Report
                                            </button>
                                            ${(comment.userId === this.user.id || this.user.is_moderator) ? `
                                                <button onclick="window.commentAppInstance.deleteComment('${comment.id}')" 
                                                        class="comment-dropdown-item">
                                                    <i class="fas fa-trash"></i>
                                                    Delete
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                        
                        <!-- Reply form -->
                        <div id="reply-form-${comment.id}" style="display: none;" class="reply-form">
                            <textarea id="reply-textarea-${comment.id}" 
                                      placeholder="Write a reply..."
                                      class="reply-textarea"></textarea>
                            <div class="reply-toolbar">
                                <div class="markdown-buttons">
                                    <button onclick="window.commentAppInstance.insertMarkdownForReply('${comment.id}', '**', '**')" class="markdown-btn">
                                        <i class="fas fa-bold"></i>
                                    </button>
                                    <button onclick="window.commentAppInstance.insertMarkdownForReply('${comment.id}', '*', '*')" class="markdown-btn">
                                        <i class="fas fa-italic"></i>
                                    </button>
                                    <button onclick="window.commentAppInstance.insertMarkdownForReply('${comment.id}', '~~', '~~')" class="markdown-btn">
                                        <i class="fas fa-strikethrough"></i>
                                    </button>
                                    <button onclick="window.commentAppInstance.insertMarkdownForReply('${comment.id}', '## ', '')" class="markdown-btn">
                                        <i class="fas fa-heading"></i>
                                    </button>
                                    <button onclick="window.commentAppInstance.insertMarkdownForReply('${comment.id}', '||', '||')" class="markdown-btn">
                                        <i class="fas fa-eye-slash"></i>
                                    </button>
                                    <button onclick="window.commentAppInstance.insertImageForReply('${comment.id}')" class="markdown-btn">
                                        <i class="fas fa-image"></i>
                                    </button>
                                    <button onclick="window.commentAppInstance.insertVideoForReply('${comment.id}')" class="markdown-btn">
                                        <i class="fas fa-video"></i>
                                    </button>
                                </div>
                                <div class="reply-actions">
                                    <button onclick="window.commentAppInstance.cancelReply('${comment.id}')" 
                                            class="btn-secondary">
                                        Cancel
                                    </button>
                                    <button onclick="window.commentAppInstance.submitReply('${comment.id}')" 
                                            class="btn-primary">
                                        Reply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="comment-children">
                        ${depth < MAX_DEPTH && comment.children?.length > 0 ? 
                            comment.children.map(child => this.renderComment(child, depth + 1)).join('') : 
                            (depth >= MAX_DEPTH && comment.children?.length > 0 ? `
                                <div class="ml-4 mt-2">
                                    <button onclick="window.commentAppInstance.viewReplies('${comment.id}')" 
                                            class="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-2 rounded hover:bg-blue-50 transition-colors">
                                        <i class="fas fa-comments mr-1"></i>
                                        View ${comment.children.length} ${comment.children.length === 1 ? 'reply' : 'replies'}
                                    </button>
                                </div>
                            ` : '')
                        }
                </div>
            `;
            
            setTimeout(() => this.attachSpoilerHandlers(), 0);
            
            return html;
        },

        // Delete comment
        async deleteComment(commentId) {
            // Close dropdown
            document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
            
            if (!this.user) {
                alert('Please sign in to delete comments');
                return;
            }
            
            if (!confirm('Are you sure you want to delete this comment?')) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/comments/${commentId}`, {
                    method: 'DELETE',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to delete comment');
                }
                
                this.removeCommentFromTree(commentId);
                this.sortComments();
                
            } catch (error) {
                console.error('Error deleting comment:', error);
                alert('Failed to delete comment');
            }
        },
        
        // Remove comment from tree
        removeCommentFromTree(commentId) {
            const markAsDeleted = (comments) => {
                for (let i = 0; i < comments.length; i++) {
                    if (comments[i].id == commentId) {
                        if (comments[i].children?.length > 0) {
                            comments[i].deleted = true;
                            comments[i].content = '[deleted]';
                            comments[i].userName = '[deleted]';
                            comments[i].userPicture = '';
                            return true;
                        } else {
                            comments.splice(i, 1);
                            return true;
                        }
                    }
                    if (comments[i].children && markAsDeleted(comments[i].children)) {
                        return true;
                    }
                }
                return false;
            };
            
            markAsDeleted(this.comments);
        },
        
        // Report comment
        async reportComment(commentId) {
            // Close dropdown
            document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
            
            if (!this.user) {
                alert('Please sign in to report comments');
                return;
            }
            
            const reason = prompt('Please provide a reason for reporting this comment:');
            if (!reason) return; // User cancelled
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/comments/${commentId}/report`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ 
                        reason: reason || 'No reason provided'
                    })
                });
                
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to report comment');
                }
                
                alert('Comment reported successfully');
                
            } catch (error) {
                console.error('Error reporting comment:', error);
                alert(error.message || 'Failed to report comment');
            }
        },
        
        // Toggle collapse
        toggleCollapse(event) {
            event.stopPropagation();
            const container = event.target.closest('.comment-container');
            if (container) {
                container.classList.toggle('collapsed');
            }
        },
        
        // Get relative time
        getRelativeTime(dateString) {
            const date = new Date(dateString);
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
                    return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
                }
            }
            
            return 'just now';
        },
        
        // Attach spoiler handlers
        attachSpoilerHandlers() {
            document.querySelectorAll('.spoiler').forEach(spoiler => {
                const newSpoiler = spoiler.cloneNode(true);
                spoiler.parentNode.replaceChild(newSpoiler, spoiler);
                
                newSpoiler.addEventListener('click', function(e) {
                    e.stopPropagation();
                    this.classList.toggle('revealed');
                });
            });
        },
        
        
        // Toggle dropdown menu
        toggleDropdown(commentId, event) {
            event.stopPropagation();
            const dropdown = document.getElementById(`dropdown-${commentId}`);
            const button = document.getElementById(`options-btn-${commentId}`);
            const allDropdowns = document.querySelectorAll('.comment-dropdown');
            
            // Close all other dropdowns
            allDropdowns.forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                }
            });
            
            // Toggle current dropdown
            dropdown.classList.toggle('show');
            
            // Position dropdown using fixed positioning
            if (dropdown.classList.contains('show')) {
                const buttonRect = button.getBoundingClientRect();
                
                // Position below the button
                dropdown.style.top = (buttonRect.bottom + 4) + 'px';
                dropdown.style.left = (buttonRect.right - dropdown.offsetWidth) + 'px';
                
                // Adjust if it goes off screen
                const dropdownRect = dropdown.getBoundingClientRect();
                
                // Check right edge
                if (dropdownRect.right > window.innerWidth - 10) {
                    dropdown.style.left = (window.innerWidth - dropdown.offsetWidth - 10) + 'px';
                }
                
                // Check left edge
                if (dropdownRect.left < 10) {
                    dropdown.style.left = '10px';
                }
                
                // Check bottom edge
                if (dropdownRect.bottom > window.innerHeight - 10) {
                    // Position above the button instead
                    dropdown.style.top = (buttonRect.top - dropdown.offsetHeight - 4) + 'px';
                }
            }
        },
        
        
        // View replies button handler
        viewReplies(commentId) {
            this.enterFocusMode(commentId);
        },
        
        // Enter focus mode
        enterFocusMode(commentId) {
            const comment = this.findComment(commentId, this.comments);
            if (!comment) return;
            
            // Set focused comment
            this.focusedCommentId = commentId;
            
            // Create focused comments array with just this comment
            this.focusedComments = [comment];
            
            // Update URL with the comment ID
            history.replaceState(null, null, `#comment-${commentId}`);
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        
        // Exit focus mode
        exitFocusMode() {
            this.focusedCommentId = null;
            this.focusedComments = [];
            this.reportedCommentId = null;
            
            // Remove hash from URL
            history.pushState(null, null, window.location.pathname + window.location.search);
            
            // Reload all comments to ensure replies are included
            this.loadComments();
        },
        
        // Focus on a specific comment (with parent loading if necessary)
        async focusOnComment(commentId) {
            // First, try to find the comment in the current tree
            let comment = this.findComment(commentId, this.comments);
            
            if (!comment) {
                // Comment not in current view, need to load it
                await this.loadParentThread(commentId);
                return; // loadParentThread will handle the focusing
            }
            
            // Check if this comment has a parent that should be shown
            const parentComment = this.findParentOfComment(commentId, this.comments);
            
            if (parentComment) {
                // Focus on the parent but mark the target comment as reported
                this.reportedCommentId = commentId;
                this.focusedCommentId = parentComment.id;
                this.focusedComments = [parentComment];
                
                // Update URL with the comment ID
                history.replaceState(null, null, `#comment-${commentId}`);
                
                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                // This is a top-level comment, just highlight it
                this.reportedCommentId = commentId;
                
                // Update URL with the comment ID
                history.replaceState(null, null, `#comment-${commentId}`);
                
                // Scroll to the comment
                setTimeout(() => {
                    const element = document.getElementById(`comment-${commentId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        },
        
        // Load parent thread for a comment
        async loadParentThread(commentId) {
            // Since we might not have a specific thread endpoint, we'll reload all comments
            // and then try to find the comment's parent
            await this.loadComments();
            
            // Now try to find the comment and its parent
            const comment = this.findComment(commentId, this.comments);
            
            if (comment) {
                const parentComment = this.findParentOfComment(commentId, this.comments);
                
                if (parentComment) {
                    // Focus on the parent but mark the target comment as reported
                    this.reportedCommentId = commentId;
                    this.focusedCommentId = parentComment.id;
                    this.focusedComments = [parentComment];
                    
                    // Update URL with the comment ID
                    history.replaceState(null, null, `#comment-${commentId}`);
                    
                    // Scroll to top
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    // It's a top-level comment
                    this.reportedCommentId = commentId;
                    
                    // Update URL with the comment ID
                    history.replaceState(null, null, `#comment-${commentId}`);
                    
                    // Scroll to the comment
                    setTimeout(() => {
                        const element = document.getElementById(`comment-${commentId}`);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 100);
                }
            } else {
                // Comment not found at all
                alert('Comment not found. It may have been deleted.');
            }
        },
        
        // Find parent of a comment
        findParentOfComment(targetId, comments, parent = null) {
            for (const comment of comments) {
                if (comment.id == targetId) {
                    return parent;
                }
                if (comment.children?.length > 0) {
                    const found = this.findParentOfComment(targetId, comment.children, comment);
                    if (found !== null) return found;
                }
            }
            return null;
        },
        
        // Toggle reports panel
        toggleReportsPanel() {
            this.showReportsPanel = !this.showReportsPanel;
            if (this.showReportsPanel && this.pageReports.length === 0) {
                this.loadPageReports();
            }
        },
        
        // Load reports for current page
        async loadPageReports() {
            if (!this.user || !this.user.is_moderator) return;
            
            this.loadingReports = true;
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                this.loadingReports = false;
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/reports/${encodeURIComponent(this.pageId)}`, {
                    headers: { 
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    this.pageReports = await response.json();
                } else if (response.status === 401) {
                    this.user = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('sessionToken');
                }
            } catch (error) {
                console.error('Error loading reports:', error);
            } finally {
                this.loadingReports = false;
            }
        },
        
        // Jump to comment (updated to use focusOnComment)
        jumpToComment(commentId) {
            this.focusOnComment(commentId);
        },
        
        // Delete reported comment
        async deleteReportedComment(report) {
            if (!confirm('Delete this reported comment?')) return;
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                return;
            }
            
            try {
                // Delete the comment
                const deleteResponse = await fetch(`${this.apiUrl}/comments/${report.comment_id}`, {
                    method: 'DELETE',
                    headers: { 
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete comment');
                }
                
                // Resolve the report
                await fetch(`${this.apiUrl}/reports/${report.id}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ action: 'resolved' })
                });
                
                // Remove from list
                this.pageReports = this.pageReports.filter(r => r.id !== report.id);
                
                // Reload comments to reflect deletion
                this.loadComments();
                
                alert('Comment deleted successfully');
            } catch (error) {
                console.error('Error deleting comment:', error);
                alert('Failed to delete comment');
            }
        },
        
        // Dismiss report
        async dismissReport(reportId) {
            if (!confirm('Dismiss this report?')) return;
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/reports/${reportId}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ action: 'dismissed' })
                });
                
                if (response.ok) {
                    // Remove from list
                    this.pageReports = this.pageReports.filter(r => r.id !== reportId);
                    alert('Report dismissed');
                } else {
                    throw new Error('Failed to dismiss report');
                }
            } catch (error) {
                console.error('Error dismissing report:', error);
                alert('Failed to dismiss report');
            }
        },
        
        // Toggle ban dropdown
        toggleBanDropdown(reportId, event) {
            event.stopPropagation();
            this.showBanDropdown = this.showBanDropdown === reportId ? null : reportId;
        },
        
        // Ban user with duration
        async banUserWithDuration(userId, userName, duration) {
            const reason = prompt(`Why are you banning ${userName}?`);
            if (!reason) return;
            
            await this.banUser(userId, userName, duration, reason);
        },
        
        // Show custom ban input
        async showCustomBanInput(userId, userName) {
            const duration = prompt('Enter ban duration (e.g., 30m, 6h, 1d):');
            if (!duration) return;
            
            // Validate duration format
            if (!/^\d+[mhd]?$/.test(duration)) {
                alert('Invalid duration format. Use format like: 30m, 6h, 1d');
                return;
            }
            
            await this.banUserWithDuration(userId, userName, duration);
        },
        
        // Ban user
        async banUser(userId, userName, duration, reason) {
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/users/${userId}/ban`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        duration: duration,
                        reason: reason,
                        deleteComments: false // Don't delete comments for temporary bans
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`${userName} has been banned.\n${result.ban_duration_text}`);
                    
                    // Reload reports
                    if (this.pageReports.length > 0) {
                        this.loadPageReports();
                    }
                    
                    // Close dropdown
                    this.showBanDropdown = null;
                } else {
                    throw new Error('Failed to ban user');
                }
            } catch (error) {
                console.error('Error banning user:', error);
                alert('Failed to ban user');
            }
        },
        
        // Show ban notification
        showBanNotification(banInfo) {
            const message = banInfo.permanent 
                ? `You are permanently banned from commenting.\nReason: ${banInfo.ban_reason}`
                : `You are banned from commenting.\nTime remaining: ${banInfo.remaining_text}\nReason: ${banInfo.ban_reason}`;
            
            this.banNotification = {
                show: true,
                message: message,
                permanent: banInfo.permanent
            };
            
            // Auto-hide notification after 10 seconds for temporary bans
            if (!banInfo.permanent) {
                setTimeout(() => {
                    if (this.banNotification) {
                        this.banNotification.show = false;
                    }
                }, 10000);
            }
        },
        
        // Show ban expired notification
        showBanExpiredNotification() {
            this.banNotification = {
                show: true,
                message: 'Good news! Your ban has expired. You can now comment again.',
                expired: true
            };
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                if (this.banNotification) {
                    this.banNotification.show = false;
                }
            }, 5000);
        }
        
    }
}

// ===== REPORTS APP (reports.html) =====
function reportsApp() {
    return {
        user: null,
        reports: [],
        filteredReports: [],
        pages: [],
        filteredPages: [],
        selectedPage: null,
        showPageDropdown: false,
        pageSearchQuery: '',
        loading: true,
        apiUrl: '/api',
        showBanDropdown: null,
        
        init() {
            console.log('Reports app initializing...');
            this.checkExistingSession();
            
            // Listen for login messages
            window.addEventListener('message', async (event) => {
                if (event.data && event.data.type === 'discord-login-success') {
                    console.log('Received Discord login success');
                    this.user = event.data.user;
                    localStorage.setItem('user', JSON.stringify(this.user));
                    if (event.data.sessionToken) {
                        localStorage.setItem('sessionToken', event.data.sessionToken);
                    }
                    if (this.user.is_moderator) {
                        // Load reports (pages will be extracted from reports)
                        await this.loadReports();
                    }
                }
            });
        },
        
        async checkExistingSession() {
            const savedUser = localStorage.getItem('user');
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (savedUser && sessionToken) {
                this.user = JSON.parse(savedUser);
                console.log('Found existing session:', this.user.username);
                
                // Try to load reports - server will verify permissions
                if (this.user.is_moderator) {
                    // Load reports (pages will be extracted from reports)
                    await this.loadReports();
                } else {
                    this.loading = false;
                }
            } else {
                console.log('No existing user session found');
                // Clear any partial data
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                this.loading = false;
            }
        },
        
        signInWithDiscord() {
            // Normal Discord OAuth flow
            const state = Math.random().toString(36).substring(7);
            localStorage.setItem('discord_state', state);
            const clientId = CONFIG.discordClientId;
            const redirectUri = encodeURIComponent(CONFIG.discordRedirectUri);
            const scope = 'identify';
            const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
            
            const width = 500;
            const height = 700;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;
            
            window.open(
                discordAuthUrl,
                'discord-auth',
                `width=${width},height=${height},left=${left},top=${top}`
            );
        },
        
        async loadReports() {
            this.loading = true;
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                this.loading = false;
                this.user = null;
                localStorage.removeItem('user');
                return;
            }
            
            try {
                // Always load all reports initially
                const response = await fetch(`${this.apiUrl}/reports`, {
                    headers: { 
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    this.reports = await response.json();
                    console.log(`Loaded ${this.reports.length} reports`);
                    
                    // Extract unique pages from reports
                    const pageMap = new Map();
                    this.reports.forEach(report => {
                        if (!pageMap.has(report.page_id)) {
                            pageMap.set(report.page_id, {
                                page_id: report.page_id,
                                report_count: 0
                            });
                        }
                        pageMap.get(report.page_id).report_count++;
                    });
                    
                    // Convert to array and sort by report count (most reports first)
                    this.pages = Array.from(pageMap.values()).sort((a, b) => b.report_count - a.report_count);
                    this.filteredPages = [...this.pages];
                    console.log(`Extracted ${this.pages.length} pages from reports:`, this.pages);
                    
                    // Apply selected page filter if any
                    if (this.selectedPage) {
                        this.filteredReports = this.reports.filter(r => r.page_id === this.selectedPage);
                    } else {
                        this.filteredReports = [...this.reports];
                    }
                } else if (response.status === 401) {
                    console.error('Session expired or invalid');
                    this.user = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('sessionToken');
                } else if (response.status === 403) {
                    console.error('Not authorized to view reports');
                    this.user.is_moderator = false;
                }
            } catch (error) {
                console.error('Error loading reports:', error);
            } finally {
                this.loading = false;
            }
        },
        
        
        filterPages() {
            if (!this.pageSearchQuery) {
                this.filteredPages = [...this.pages];
            } else {
                const query = this.pageSearchQuery.toLowerCase();
                this.filteredPages = this.pages.filter(page => 
                    page.page_id.toLowerCase().includes(query)
                );
            }
        },
        
        updatePagesFromReports() {
            // Extract unique pages from reports
            const pageMap = new Map();
            this.reports.forEach(report => {
                if (!pageMap.has(report.page_id)) {
                    pageMap.set(report.page_id, {
                        page_id: report.page_id,
                        report_count: 0
                    });
                }
                pageMap.get(report.page_id).report_count++;
            });
            
            // Convert to array and sort by report count (most reports first)
            this.pages = Array.from(pageMap.values()).sort((a, b) => b.report_count - a.report_count);
            this.filteredPages = [...this.pages];
        },
        
        selectPage(pageId) {
            this.selectedPage = pageId;
            this.showPageDropdown = false;
            
            // Filter reports based on selected page
            if (pageId) {
                this.filteredReports = this.reports.filter(r => r.page_id === pageId);
            } else {
                this.filteredReports = [...this.reports];
            }
        },
        
        async deleteComment(report) {
            if (!confirm('Delete this reported comment?')) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                this.user = null;
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                return;
            }
            
            try {
                // Delete the comment
                const deleteResponse = await fetch(`${this.apiUrl}/comments/${report.comment_id}`, {
                    method: 'DELETE',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (deleteResponse.status === 401) {
                    alert('Session expired. Please sign in again.');
                    this.user = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('sessionToken');
                    return;
                }
                
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete comment');
                }
                
                // Resolve the report
                await fetch(`${this.apiUrl}/reports/${report.id}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ 
                        action: 'resolved'
                    })
                });
                
                // Remove from list
                this.reports = this.reports.filter(r => r.id !== report.id);
                this.filteredReports = this.reports.filter(r => 
                    !this.selectedPage || r.page_id === this.selectedPage
                );
                
                // Update pages array
                this.updatePagesFromReports();
                
                alert('Comment deleted successfully');
                
            } catch (error) {
                console.error('Error deleting comment:', error);
                alert('Failed to delete comment');
            }
        },
        
        async dismissReport(reportId) {
            if (!confirm('Dismiss this report?')) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                this.user = null;
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/reports/${reportId}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ 
                        action: 'dismissed'
                    })
                });
                
                if (response.status === 401) {
                    alert('Session expired. Please sign in again.');
                    this.user = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('sessionToken');
                    return;
                }
                
                if (response.ok) {
                    this.reports = this.reports.filter(r => r.id !== reportId);
                    this.filteredReports = this.reports.filter(r => 
                        !this.selectedPage || r.page_id === this.selectedPage
                    );
                    
                    // Update pages array
                    this.updatePagesFromReports();
                    
                    alert('Report dismissed');
                } else {
                    throw new Error('Failed to dismiss report');
                }
            } catch (error) {
                console.error('Error dismissing report:', error);
                alert('Failed to dismiss report');
            }
        },
        
        // Toggle ban dropdown
        toggleBanDropdown(reportId, event) {
            event.stopPropagation();
            this.showBanDropdown = this.showBanDropdown === reportId ? null : reportId;
        },
        
        // Ban user with duration
        async banUserWithDuration(userId, userName, duration) {
            const reason = prompt(`Why are you banning ${userName}?`);
            if (!reason) return;
            
            await this.banUser(userId, userName, duration, reason);
        },
        
        // Show custom ban input
        async showCustomBanInput(userId, userName) {
            const duration = prompt('Enter ban duration (e.g., 30m, 6h, 1d):');
            if (!duration) return;
            
            // Validate duration format
            if (!/^\d+[mhd]?$/.test(duration)) {
                alert('Invalid duration format. Use format like: 30m, 6h, 1d');
                return;
            }
            
            await this.banUserWithDuration(userId, userName, duration);
        },
        
        // Ban user
        async banUser(userId, userName, duration, reason) {
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                this.user = null;
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/users/${userId}/ban`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        duration: duration,
                        reason: reason,
                        deleteComments: duration === 'permanent' // Only delete comments for permanent bans
                    })
                });
                
                if (response.status === 401) {
                    alert('Session expired. Please sign in again.');
                    this.user = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('sessionToken');
                    return;
                }
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`${userName} has been banned.\n${result.ban_duration_text}`);
                    
                    // Reload reports to reflect changes
                    await this.loadReports();
                    
                    // Close dropdown
                    this.showBanDropdown = null;
                } else {
                    throw new Error('Failed to ban user');
                }
            } catch (error) {
                console.error('Error banning user:', error);
                alert('Failed to ban user');
            }
        }
    }
}

// ===== MODERATOR APP (moderators.html) =====
function moderatorApp() {
    return {
        user: null,
        moderators: [],
        loading: true,
        newModeratorId: '',
        apiUrl: '/api',
        
        init() {
            console.log('Moderator app initializing...');
            this.checkExistingSession();
            
            // Listen for login messages
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'discord-login-success') {
                    console.log('Received Discord login success');
                    this.user = event.data.user;
                    localStorage.setItem('user', JSON.stringify(this.user));
                    if (event.data.sessionToken) {
                        localStorage.setItem('sessionToken', event.data.sessionToken);
                    }
                    if (this.user.is_moderator) {
                        this.loadModerators();
                    }
                }
            });
        },
        
        checkExistingSession() {
            const savedUser = localStorage.getItem('user');
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (savedUser && sessionToken) {
                this.user = JSON.parse(savedUser);
                console.log('Found existing session:', this.user.username);
                
                // Try to load moderators - server will verify permissions
                if (this.user.is_moderator) {
                    this.loadModerators();
                } else {
                    this.loading = false;
                }
            } else {
                console.log('No existing user session found');
                // Clear any partial data
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                this.loading = false;
            }
        },
        
        signInWithDiscord() {
            // Discord OAuth flow
            const state = Math.random().toString(36).substring(7);
            localStorage.setItem('discord_state', state);
            const clientId = CONFIG.discordClientId;
            const redirectUri = encodeURIComponent(CONFIG.discordRedirectUri);
            const scope = 'identify';
            const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
            
            const width = 500;
            const height = 700;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;
            
            window.open(
                discordAuthUrl,
                'discord-auth',
                `width=${width},height=${height},left=${left},top=${top}`
            );
        },
        
        async loadModerators() {
            this.loading = true;
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                alert('Please sign in again');
                this.loading = false;
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/moderators`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    this.moderators = await response.json();
                    console.log(`Loaded ${this.moderators.length} moderators`);
                } else if (response.status === 401) {
                    console.error('Unauthorized: Invalid or expired session');
                    alert('Your session has expired. Please sign in again.');
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('user');
                    this.user = null;
                } else if (response.status === 403) {
                    console.error('Forbidden: Not a moderator');
                    alert('You do not have permission to view moderators');
                } else {
                    console.error('Error loading moderators:', response.status);
                    alert('Failed to load moderators');
                }
            } catch (error) {
                console.error('Error loading moderators:', error);
                alert('Network error. Please try again.');
            } finally {
                this.loading = false;
            }
        },
        
        async addModerator() {
            if (!this.newModeratorId.trim()) return;
            
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/users/${this.newModeratorId}/moderator`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        isModerator: true
                    })
                });
                
                if (response.ok) {
                    alert('Moderator added successfully');
                    this.newModeratorId = '';
                    await this.loadModerators();
                } else if (response.status === 401) {
                    console.error('Unauthorized: Invalid or expired session');
                    alert('Your session has expired. Please sign in again.');
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('user');
                    this.user = null;
                } else if (response.status === 403) {
                    console.error('Forbidden: Not a moderator');
                    alert('You do not have permission to add moderators');
                } else if (response.status === 404) {
                    alert('User not found');
                } else {
                    const error = await response.json();
                    alert(error.error || 'Failed to add moderator');
                }
            } catch (error) {
                console.error('Error adding moderator:', error);
                alert('Network error. Please try again.');
            }
        },
        
        async removeModerator(modId, modName) {
            if (modId === this.user.id) {
                alert('You cannot remove yourself as a moderator');
                return;
            }
            
            if (!confirm(`Remove ${modName} as a moderator?`)) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/users/${modId}/moderator`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        isModerator: false
                    })
                });
                
                if (response.ok) {
                    alert('Moderator removed successfully');
                    await this.loadModerators();
                } else if (response.status === 401) {
                    console.error('Unauthorized: Invalid or expired session');
                    alert('Your session has expired. Please sign in again.');
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('user');
                    this.user = null;
                } else if (response.status === 403) {
                    console.error('Forbidden: Not a moderator');
                    alert('You do not have permission to remove moderators');
                } else if (response.status === 404) {
                    alert('User not found');
                } else {
                    alert('Failed to remove moderator');
                }
            } catch (error) {
                console.error('Error removing moderator:', error);
                alert('Network error. Please try again.');
            }
        }
    }
}