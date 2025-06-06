// Main Comment Application
class CommentApp {
    constructor() {
        this.api = new CommentAPI();
        this.user = null;
        this.comments = [];
        this.pageId = this.getPageId();
        this.sortBy = 'likes';
        this.loading = true;
    }

    async init() {
        console.log('Initializing comment app...');
        
        // Load configuration first
        await this.api.loadConfig();
        
        // Check for existing session
        await this.checkSession();
        
        // Load comments
        await this.loadComments();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Check for OAuth callback
        this.checkOAuthCallback();
        
        // Make app globally available
        window.commentApp = this;
        
        this.loading = false;
        this.render();
    }

    getPageId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('pageId') || window.PAGE_ID || 'default';
    }

    async checkSession() {
        try {
            this.user = await this.api.checkSession();
            if (this.user) {
                console.log('User authenticated:', this.user);
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }
    }

    setupEventListeners() {
        // Listen for OAuth success messages
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'discord-login-success') {
                console.log('Received Discord login success');
                this.user = event.data.user;
                this.loadComments();
                this.render();
            }
        });

        // Handle spoiler clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('spoiler')) {
                e.target.classList.toggle('revealed');
            }
        });
    }

    checkOAuthCallback() {
        // Check if this is the OAuth callback page
        if (window.location.pathname.includes('oauth-callback')) {
            // This should be handled by the oauth-callback.html page
            return;
        }
    }

    async signInWithDiscord() {
        try {
            // Ensure config is loaded
            const config = await this.api.loadConfig();
            
            if (!config.discordClientId) {
                alert('Discord authentication is not configured. Please contact the administrator.');
                console.error('Discord client ID not found in configuration');
                return;
            }
            
            const authUrl = await this.api.getDiscordAuthUrl();
            console.log('Discord auth URL:', authUrl);
            
            // Open in popup
            const width = 500;
            const height = 700;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;
            
            const authWindow = window.open(
                authUrl,
                'discord-auth',
                `width=${width},height=${height},left=${left},top=${top}`
            );
            
            if (authWindow) {
                authWindow.focus();
            }
        } catch (error) {
            console.error('Failed to start Discord authentication:', error);
            alert(error.message || 'Failed to start authentication. Please try again.');
        }
    }

    async signOut() {
        await this.api.logout();
        this.user = null;
        this.render();
    }

    async loadComments() {
        try {
            this.loading = true;
            this.render();
            
            const data = await this.api.getComments(this.pageId);
            
            // Build comment tree
            this.comments = this.buildCommentTree(data.comments || []);
            
            // Store user votes
            if (data.userVotes) {
                this.applyUserVotes(this.comments, data.userVotes);
            }
            
            this.sortComments();
            
        } catch (error) {
            console.error('Failed to load comments:', error);
            this.comments = [];
        } finally {
            this.loading = false;
            this.render();
        }
    }

    buildCommentTree(comments) {
        const commentMap = {};
        const roots = [];
        
        // First pass: create map
        comments.forEach(comment => {
            comment.children = [];
            commentMap[comment.id] = comment;
        });
        
        // Second pass: build tree
        comments.forEach(comment => {
            if (comment.parent_id) {
                const parent = commentMap[comment.parent_id];
                if (parent) {
                    parent.children.push(comment);
                } else {
                    roots.push(comment);
                }
            } else {
                roots.push(comment);
            }
        });
        
        return roots;
    }

    applyUserVotes(comments, userVotes) {
        comments.forEach(comment => {
            comment.userVote = userVotes[comment.id] || null;
            if (comment.children) {
                this.applyUserVotes(comment.children, userVotes);
            }
        });
    }

    sortComments() {
        const sortFn = this.sortBy === 'likes' 
            ? (a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes)
            : (a, b) => new Date(b.created_at) - new Date(a.created_at);
        
        this.comments.sort(sortFn);
        
        // Sort children recursively
        const sortChildren = (comments) => {
            comments.forEach(comment => {
                if (comment.children?.length > 0) {
                    comment.children.sort(sortFn);
                    sortChildren(comment.children);
                }
            });
        };
        
        sortChildren(this.comments);
    }

    async submitComment(parentId = null) {
        const textarea = parentId 
            ? document.getElementById(`reply-textarea-${parentId}`)
            : document.getElementById('new-comment-textarea');
        
        if (!textarea) return;
        
        const content = textarea.value.trim();
        if (!content) return;
        
        try {
            const button = parentId
                ? textarea.closest('.reply-form').querySelector('.reply-submit')
                : document.getElementById('submit-comment-btn');
            
            if (button) button.disabled = true;
            
            const result = await this.api.createComment(this.pageId, content, parentId);
            
            // Clear textarea
            textarea.value = '';
            
            // Hide reply form if it's a reply
            if (parentId) {
                this.cancelReply(parentId);
            }
            
            // Reload comments
            await this.loadComments();
            
        } catch (error) {
            console.error('Failed to submit comment:', error);
            alert(error.message || 'Failed to submit comment');
        }
    }

    async voteComment(commentId, voteType) {
        if (!this.user) {
            alert('Please sign in to vote');
            return;
        }
        
        try {
            const result = await this.api.voteComment(commentId, voteType);
            
            // Update local state
            const comment = this.findComment(commentId);
            if (comment) {
                comment.likes = result.likes;
                comment.dislikes = result.dislikes;
                comment.userVote = result.action === 'removed' ? null : voteType;
            }
            
            this.render();
            
        } catch (error) {
            console.error('Failed to vote:', error);
            alert(error.message || 'Failed to vote');
        }
    }

    async deleteComment(commentId) {
        if (!confirm('Are you sure you want to delete this comment?')) {
            return;
        }
        
        try {
            await this.api.deleteComment(commentId);
            await this.loadComments();
        } catch (error) {
            console.error('Failed to delete comment:', error);
            alert(error.message || 'Failed to delete comment');
        }
    }

    async reportComment(commentId) {
        const reason = prompt('Please provide a reason for reporting this comment:');
        if (!reason) return;
        
        try {
            await this.api.reportComment(commentId, reason);
            alert('Thank you for your report. Our moderators will review it.');
        } catch (error) {
            console.error('Failed to report comment:', error);
            alert(error.message || 'Failed to report comment');
        }
    }

    showReplyForm(commentId) {
        if (!this.user) {
            alert('Please sign in to reply');
            return;
        }
        
        // Hide other reply forms
        document.querySelectorAll('.reply-form').forEach(form => {
            form.style.display = 'none';
        });
        
        // Show this reply form
        const form = document.getElementById(`reply-form-${commentId}`);
        if (form) {
            form.style.display = 'block';
            const textarea = form.querySelector('textarea');
            if (textarea) textarea.focus();
        }
    }

    cancelReply(commentId) {
        const form = document.getElementById(`reply-form-${commentId}`);
        if (form) {
            form.style.display = 'none';
            const textarea = form.querySelector('textarea');
            if (textarea) textarea.value = '';
        }
    }

    submitReply(commentId) {
        this.submitComment(commentId);
    }

    insertMarkdownForReply(commentId, before, after) {
        const textarea = document.getElementById(`reply-textarea-${commentId}`);
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);
        
        textarea.value = text.substring(0, start) + before + selectedText + after + text.substring(end);
        textarea.focus();
        textarea.setSelectionRange(start + before.length, end + before.length);
    }

    toggleCollapse(event) {
        event.stopPropagation();
        const container = event.target.closest('.comment-container');
        if (container) {
            container.classList.toggle('collapsed');
        }
    }

    findComment(commentId, comments = this.comments) {
        for (const comment of comments) {
            if (comment.id === parseInt(commentId)) {
                return comment;
            }
            if (comment.children) {
                const found = this.findComment(commentId, comment.children);
                if (found) return found;
            }
        }
        return null;
    }

    render() {
        const container = document.getElementById('comment-app');
        if (!container) return;
        
        let html = '';
        
        // Header
        html += `
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h1 class="text-2xl font-bold mb-4">Comments</h1>
        `;
        
        // User section
        if (this.user) {
            html += `
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                        <img src="${this.user.picture || ''}" class="w-10 h-10 rounded-full mr-3" alt="${this.user.name}">
                        <span class="font-medium">${this.user.name}</span>
                        ${this.user.is_moderator ? '<span class="ml-2 text-blue-600 text-sm"><i class="fas fa-shield-alt"></i> Moderator</span>' : ''}
                    </div>
                    <button onclick="window.commentApp.signOut()" class="text-sm text-red-600 hover:text-red-800">
                        Sign Out
                    </button>
                </div>
                
                ${this.user.is_moderator ? this.renderModeratorPanel() : ''}
                
                <!-- New comment form -->
                <div class="mt-4">
                    <textarea id="new-comment-textarea" 
                              placeholder="Write your comment... (Markdown supported)"
                              class="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                              rows="4"></textarea>
                    <div class="mt-2 flex justify-between items-center">
                        <div class="text-sm text-gray-500">
                            Markdown supported: **bold**, *italic*, ~~strikethrough~~, ||spoiler||
                        </div>
                        <button id="submit-comment-btn" 
                                onclick="window.commentApp.submitComment()"
                                class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md">
                            Post Comment
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <button onclick="window.commentApp.signInWithDiscord()" 
                        class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md flex items-center transition-colors">
                    <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125 10.775 10.775 0 0 0 .372-.291.072.072 0 0 1 .077-.01c3.927 1.764 8.18 1.764 12.061 0a.071.071 0 0 1 .078.009c.12.098.246.198.373.292a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
                    </svg>
                    Sign in with Discord
                </button>
            `;
        }
        
        html += '</div>';
        
        // Sort controls
        html += `
            <div class="bg-white rounded-lg shadow-md p-4 mb-6">
                <div class="flex items-center gap-4">
                    <span class="text-sm text-gray-600">Sort by:</span>
                    <button onclick="window.commentApp.setSortBy('likes')" 
                            class="text-sm ${this.sortBy === 'likes' ? 'text-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-800'}">
                        Best
                    </button>
                    <button onclick="window.commentApp.setSortBy('newest')" 
                            class="text-sm ${this.sortBy === 'newest' ? 'text-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-800'}">
                        Newest
                    </button>
                </div>
            </div>
        `;
        
        // Comments section
        html += '<div class="comment-thread">';
        
        if (this.loading) {
            html += `
                <div class="text-center py-8">
                    <i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i>
                </div>
            `;
        } else if (this.comments.length === 0) {
            html += `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-comments text-4xl mb-4"></i>
                    <p>No comments yet. Be the first to comment!</p>
                </div>
            `;
        } else {
            this.comments.forEach(comment => {
                html += new CommentComponent(comment, this.user).render();
            });
        }
        
        html += '</div>';
        
        container.innerHTML = html;
    }

    setSortBy(sortBy) {
        this.sortBy = sortBy;
        this.sortComments();
        this.render();
    }

    renderModeratorPanel() {
        return `
            <div class="mb-6">
                <div class="bg-gray-100 rounded-lg p-4">
                    <h2 class="text-lg font-semibold mb-3 flex items-center">
                        <i class="fas fa-shield-alt mr-2 text-blue-600"></i>
                        Moderator Panel
                    </h2>
                    
                    <div class="flex gap-3">
                        <a href="/reports.html" 
                           class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md inline-flex items-center">
                            <i class="fas fa-flag mr-2"></i>
                            View All Reports
                        </a>
                        
                        <a href="/moderators.html" 
                           class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md inline-flex items-center">
                            <i class="fas fa-users-cog mr-2"></i>
                            Manage Moderators
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    async loadDeepThread(commentId) {
        // Implementation for loading deep comment threads
        // This would show the comment in a focused view with all its replies
        window.location.href = `?pageId=${this.pageId}&focus=${commentId}`;
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new CommentApp().init();
    });
} else {
    new CommentApp().init();
}