// Define API_URL globally
const API_URL = window.location.origin;

// Global helper functions
function getRelativeTime(dateString) {
    return Utils.getRelativeTime(dateString);
}

function renderMarkdown(text) {
    if (!window.md) {
        window.md = window.markdownit({
            html: false,
            breaks: true,
            linkify: true
        });
    }
    const processed = window.MarkdownProcessor?.preprocessMarkdown(text) || text;
    return window.md.render(processed);
}

function insertMarkdown(textarea, before, after) {
    return MarkdownProcessor.insertMarkdown(textarea, before, after);
}

function extractYouTubeId(url) {
    return Utils.getYoutubeId(url);
}

async function banUserWithDuration(userId, userName, duration) {
    const reason = prompt(`Why are you banning ${userName}?`);
    if (!reason) return;
    
    const response = await BanHandler.banUser(API_URL + '/api', userId, userName, duration, reason);
    if (response.success) {
        // Show ban notification
        if (window.unifiedAppInstance) {
            window.unifiedAppInstance.banNotification = {
                show: true,
                message: `${userName} has been banned.\n${response.result.ban_duration_text}`,
                expired: false
            };
            setTimeout(() => {
                if (window.unifiedAppInstance.banNotification) {
                    window.unifiedAppInstance.banNotification.show = false;
                }
            }, 5000);
        }
    }
}

function showCustomBanInput(userId, userName) {
    BanHandler.showCustomBanInput(userId, userName, banUserWithDuration);
}

// Initialize markdown processor on page load
function initializeMarkdown() {
    if (!window.md) {
        window.md = window.markdownit({
            html: false,
            breaks: true,
            linkify: true
        });
    }
}

// Setup OAuth message listener
Auth.setupOAuthListener((user, data) => {
    if (window.unifiedAppInstance) {
        window.unifiedAppInstance.user = user;
        window.unifiedAppInstance.loadComments();
    }
});

function unifiedApp() {
    return {
        // Core state
        user: null,
        comments: [],
        sortedComments: [],
        loading: true,
        newCommentText: '',
        commentPreview: '',
        replyingTo: null,
        editingComment: null,
        editText: '',
        sortBy: 'popularity',
        focusedCommentId: null,
        focusedComments: [],
        commentVotes: {},
        
        // Moderation panel state
        activeTab: 'comments',
        
        // Reports state
        reports: [],
        filteredReports: [],
        pageReports: [],
        totalPendingReports: 0,
        loadingReports: false,
        selectedReportsPage: null,
        pageSearchQuery: '',
        pages: [],
        filteredPages: [],
        showPageDropdown: false,
        
        // Users state
        users: [],
        filteredUsers: [],
        paginatedUsers: [],
        loadingUsers: false,
        userSearchQuery: '',
        userFilter: 'all',
        currentUserPage: 1,
        totalUserPages: 1,
        usersPerPage: 20,
        expandedUsers: [],
        
        // Ban state
        showBanDropdown: null,
        banNotification: { show: false, message: '', expired: false },
        warningNotification: { show: false, message: '' },
        
        // Initialize the app
        async init() {
            // Set global instance for event handlers
            window.unifiedAppInstance = this;
            
            // Initialize markdown
            window.md = window.markdownit({
                html: false,
                breaks: true,
                linkify: true
            });
            
            // Check authentication
            this.user = await Auth.checkExistingSession();
            
            // Check for warnings if user is authenticated
            if (this.user) {
                await this.checkWarnings();
                
                // Set super moderator status for initial moderators
                const initialMods = (window.ENV?.INITIAL_MODERATORS || '').split(',').map(id => id.trim()).filter(Boolean);
                if (initialMods.includes(this.user.id)) {
                    this.user.is_super_moderator = true;
                }
            }
            
            // Load comments for the current page
            await this.loadComments();
            
            // Load report count if user is moderator
            if (this.user?.is_moderator) {
                await this.loadReportCount();
            }
            
            // Initialize markdown processor
            if (window.initializeMarkdown) {
                window.initializeMarkdown();
            }
            
            // Set up auto-refresh
            setInterval(() => {
                this.loadComments();
                if (this.user?.is_moderator) {
                    this.loadReportCount();
                }
            }, 30000);
        },
        
        // Check for warnings
        async checkWarnings() {
            try {
                const response = await fetch(`${API_URL}/api/users/warnings/unread`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const warnings = await response.json();
                    if (warnings.length > 0) {
                        // Show the most recent warning
                        const warning = warnings[0];
                        this.warningNotification = {
                            show: true,
                            message: warning.message || warning.reason || 'You have received a warning from a moderator.'
                        };
                    }
                }
            } catch (error) {
                console.error('Error checking warnings:', error);
            }
        },
        
        // Acknowledge warning
        async acknowledgeWarning() {
            try {
                await fetch(`${API_URL}/api/users/warnings/acknowledge`, {
                    method: 'POST',
                    credentials: 'include'
                });
                this.warningNotification = null;
            } catch (error) {
                console.error('Error acknowledging warning:', error);
            }
        },
        
        // Load report count
        async loadReportCount() {
            try {
                const response = await fetch(`${API_URL}/api/reports/count`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.totalPendingReports = data.count || 0;
                }
            } catch (error) {
                console.error('Error loading report count:', error);
            }
        },
        
        // Authentication methods
        async signInWithDiscord() {
            Auth.signInWithDiscord();
        },
        
        async signOut() {
            await Auth.signOut(API_URL);
            this.user = null;
            this.activeTab = 'comments';
            await this.loadComments();
        },
        
        // Comment methods
        async loadComments() {
            this.loading = true;
            try {
                const params = new URLSearchParams(window.location.search);
                const pageId = params.get('pageId') || 'default';
                
                const response = await fetch(`${API_URL}/api/comments?pageId=${encodeURIComponent(pageId)}`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const flatComments = await response.json();
                    this.comments = this.buildCommentTree(flatComments);
                    this.sortComments();
                }
            } catch (error) {
                console.error('Error loading comments:', error);
            } finally {
                this.loading = false;
            }
        },
        
        sortComments() {
            let sorted = [...this.comments];
            
            switch (this.sortBy) {
                case 'likes':
                    sorted.sort((a, b) => b.likes - a.likes);
                    break;
                case 'popularity':
                    sorted.sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes));
                    break;
                case 'newest':
                    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    break;
                case 'oldest':
                    sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    break;
            }
            
            this.sortedComments = sorted;
        },
        
        async submitComment() {
            if (!this.newCommentText.trim() || !this.user || this.user.is_banned) return;
            
            try {
                const params = new URLSearchParams(window.location.search);
                const pageId = params.get('pageId') || 'default';
                
                const response = await fetch(`${API_URL}/api/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        content: this.newCommentText.trim(),
                        page_id: pageId
                    })
                });
                
                if (response.ok) {
                    this.newCommentText = '';
                    this.commentPreview = '';
                    await this.loadComments();
                } else {
                    const error = await response.json();
                    alert(error.error || 'Failed to post comment');
                }
            } catch (error) {
                console.error('Error posting comment:', error);
                alert('Failed to post comment');
            }
        },
        
        // Report methods
        async loadReports() {
            if (this.activeTab !== 'reports') return;
            
            this.loadingReports = true;
            try {
                const response = await fetch(`${API_URL}/api/reports/all`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.reports = data.reports || [];
                    this.pages = data.pages || [];
                    this.filterReports();
                    this.filterPages();
                }
            } catch (error) {
                console.error('Error loading reports:', error);
            } finally {
                this.loadingReports = false;
            }
        },
        
        filterReports() {
            if (this.selectedReportsPage) {
                this.filteredReports = this.reports.filter(r => r.page_id === this.selectedReportsPage);
            } else {
                this.filteredReports = [...this.reports];
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
        
        selectReportsPage(pageId) {
            this.selectedReportsPage = pageId;
            this.showPageDropdown = false;
            this.filterReports();
        },
        
        async deleteReportedComment(report) {
            if (!confirm(`Delete comment by ${report.comment_user_name}?`)) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${report.comment_id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    await this.dismissReport(report.id);
                    if (report.page_id === this.pageId) {
                        await this.loadComments();
                    }
                }
            } catch (error) {
                console.error('Error deleting comment:', error);
            }
        },
        
        async dismissReport(reportId) {
            try {
                const response = await fetch(`${API_URL}/api/reports/${reportId}/resolve`, {
                    method: 'PUT',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    this.reports = this.reports.filter(r => r.id !== reportId);
                    this.filterReports();
                    await this.loadReportCount();
                }
            } catch (error) {
                console.error('Error dismissing report:', error);
            }
        },
        
        // User management methods
        async loadUsers() {
            if (this.activeTab !== 'users') return;
            
            this.loadingUsers = true;
            try {
                const response = await fetch(`${API_URL}/api/users`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    this.users = await response.json();
                    this.filterUsers();
                }
            } catch (error) {
                console.error('Error loading users:', error);
            } finally {
                this.loadingUsers = false;
            }
        },
        
        filterUsers() {
            let filtered = [...this.users];
            
            // Apply search filter
            if (this.userSearchQuery) {
                const query = this.userSearchQuery.toLowerCase();
                filtered = filtered.filter(user => 
                    user.name.toLowerCase().includes(query) ||
                    user.id.toLowerCase().includes(query)
                );
            }
            
            // Apply type filter
            switch (this.userFilter) {
                case 'moderators':
                    filtered = filtered.filter(u => u.is_moderator);
                    break;
                case 'banned':
                    filtered = filtered.filter(u => u.is_banned);
                    break;
                case 'warned':
                    filtered = filtered.filter(u => u.warning_count > 0);
                    break;
                case 'reported':
                    filtered = filtered.filter(u => u.total_reports_received > 0);
                    break;
            }
            
            this.filteredUsers = filtered;
            this.totalUserPages = Math.ceil(filtered.length / this.usersPerPage);
            this.currentUserPage = 1;
            this.updatePaginatedUsers();
        },
        
        updatePaginatedUsers() {
            const start = (this.currentUserPage - 1) * this.usersPerPage;
            const end = start + this.usersPerPage;
            this.paginatedUsers = this.filteredUsers.slice(start, end);
        },
        
        toggleUserExpanded(userId) {
            const index = this.expandedUsers.indexOf(userId);
            if (index === -1) {
                this.expandedUsers.push(userId);
                this.loadUserDetails(userId);
            } else {
                this.expandedUsers.splice(index, 1);
            }
        },
        
        async loadUserDetails(userId) {
            try {
                const response = await fetch(`${API_URL}/api/users/${userId}/full`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const details = await response.json();
                    const userIndex = this.users.findIndex(u => u.id === userId);
                    if (userIndex !== -1) {
                        this.users[userIndex] = { ...this.users[userIndex], ...details };
                        this.filterUsers();
                    }
                }
            } catch (error) {
                console.error('Error loading user details:', error);
            }
        },
        
        async warnUser(userId, userName) {
            const reason = prompt(`Why are you warning ${userName}?`);
            if (!reason) return;
            
            const message = prompt('Enter a message for the user (optional):');
            
            try {
                const response = await fetch(`${API_URL}/api/users/${userId}/warn`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ reason, message })
                });
                
                if (response.ok) {
                    alert(`${userName} has been warned.`);
                    await this.loadUsers();
                }
            } catch (error) {
                console.error('Error warning user:', error);
            }
        },
        
        async toggleModerator(userId, userName, makeMod) {
            const action = makeMod ? 'make moderator' : 'remove moderator status from';
            if (!confirm(`Are you sure you want to ${action} ${userName}?`)) return;
            
            try {
                const response = await fetch(`${API_URL}/api/users/${userId}/moderator`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ is_moderator: makeMod })
                });
                
                if (response.ok) {
                    await this.loadUsers();
                }
            } catch (error) {
                console.error('Error toggling moderator:', error);
            }
        },
        
        async unbanUser(userId, userName) {
            if (!confirm(`Unban ${userName}?`)) return;
            
            try {
                const response = await fetch(`${API_URL}/api/users/${userId}/unban`, {
                    method: 'POST',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    alert(`${userName} has been unbanned.`);
                    await this.loadUsers();
                }
            } catch (error) {
                console.error('Error unbanning user:', error);
            }
        },
        
        async deleteUserComment(commentId) {
            if (!confirm('Delete this comment?')) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    // Reload user details
                    const user = this.paginatedUsers.find(u => 
                        u.comments && u.comments.some(c => c.id === commentId)
                    );
                    if (user) {
                        await this.loadUserDetails(user.id);
                    }
                }
            } catch (error) {
                console.error('Error deleting comment:', error);
            }
        },
        
        async loadMoreUserComments(userId) {
            // This would need a new API endpoint to paginate user comments
            alert('Load more comments feature coming soon!');
        },
        
        // Helper methods
        updatePreview() {
            this.commentPreview = renderMarkdown(this.newCommentText);
        },
        
        getRelativeTime(dateString) {
            return getRelativeTime(dateString);
        },
        
        jumpToComment(commentId) {
            const element = document.getElementById(`comment-${commentId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
                element.classList.add('highlight');
                setTimeout(() => element.classList.remove('highlight'), 2000);
            }
        },
        
        toggleBanDropdown(id, event) {
            if (event) {
                event.stopPropagation();
            }
            this.showBanDropdown = this.showBanDropdown === id ? null : id;
        },
        
        async banUserWithDuration(userId, userName, duration) {
            await window.banUserWithDuration(userId, userName, duration);
            this.showBanDropdown = null;
            
            // Reload data based on current tab
            if (this.activeTab === 'reports') {
                await this.loadReports();
            } else if (this.activeTab === 'users') {
                await this.loadUsers();
            }
        },
        
        showCustomBanInput(userId, userName) {
            window.showCustomBanInput(userId, userName);
            this.showBanDropdown = null;
        },
        
        // Comment rendering methods
        renderComment(comment, depth = 0) {
            if (!comment) return '';
            
            const MAX_DEPTH = 4;
            const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
            const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
            const displayAuthor = isDeleted ? '[deleted]' : comment.userName;
            
            const processed = isDeleted ? '' : window.MarkdownProcessor?.preprocessMarkdown(displayContent) || displayContent;
            const content = isDeleted ? '' : window.md?.render(processed) || displayContent;
            
            let html = `
                <div class="comment-container ${depth > 0 ? 'comment-depth-' + depth : ''}" 
                     data-comment-id="${comment.id}">
                    ${depth > 0 ? '<div class="comment-line" onclick="window.unifiedAppInstance.toggleCollapse(event)"></div>' : ''}
                    
                    <div class="comment-content ${this.focusedCommentId == comment.id ? 'reported-comment' : ''}" id="comment-${comment.id}">
                        
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
                                <button onclick="window.unifiedAppInstance.voteComment('${comment.id}', 'like')" 
                                        class="comment-action ${comment.userVote === 'like' ? 'active-like' : ''}">
                                    <i class="fas fa-thumbs-up"></i>
                                    <span>${comment.likes}</span>
                                </button>
                                <button onclick="window.unifiedAppInstance.voteComment('${comment.id}', 'dislike')" 
                                        class="comment-action ${comment.userVote === 'dislike' ? 'active-dislike' : ''}">
                                    <i class="fas fa-thumbs-down"></i>
                                    <span>${comment.dislikes}</span>
                                </button>
                                <button onclick="window.unifiedAppInstance.showReplyForm('${comment.id}')" 
                                        class="comment-action">
                                    <i class="fas fa-comment"></i>
                                    Reply
                                </button>
                                ${this.user ? `
                                    <div class="comment-dropdown-container">
                                        <button onclick="window.unifiedAppInstance.toggleDropdown('${comment.id}', event)" 
                                                class="comment-options-btn" id="options-btn-${comment.id}">
                                            <i class="fas fa-ellipsis-v"></i>
                                        </button>
                                        <div id="dropdown-${comment.id}" class="comment-dropdown">
                                            <button onclick="window.unifiedAppInstance.reportComment('${comment.id}')" 
                                                    class="comment-dropdown-item">
                                                <i class="fas fa-flag"></i>
                                                Report
                                            </button>
                                            ${(comment.userId === this.user.id || this.user.is_moderator) ? `
                                                <button onclick="window.unifiedAppInstance.deleteComment('${comment.id}')" 
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
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '**', '**')" class="markdown-btn">
                                        <i class="fas fa-bold"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '*', '*')" class="markdown-btn">
                                        <i class="fas fa-italic"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '~~', '~~')" class="markdown-btn">
                                        <i class="fas fa-strikethrough"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '## ', '')" class="markdown-btn">
                                        <i class="fas fa-heading"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '||', '||')" class="markdown-btn">
                                        <i class="fas fa-eye-slash"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertImageForReply('${comment.id}')" class="markdown-btn">
                                        <i class="fas fa-image"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertVideoForReply('${comment.id}')" class="markdown-btn">
                                        <i class="fas fa-video"></i>
                                    </button>
                                </div>
                                <div class="reply-actions">
                                    <button onclick="window.unifiedAppInstance.cancelReply('${comment.id}')" 
                                            class="btn-secondary">
                                        Cancel
                                    </button>
                                    <button onclick="window.unifiedAppInstance.submitReply('${comment.id}')" 
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
                                    <button onclick="window.unifiedAppInstance.viewReplies('${comment.id}')" 
                                            class="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-2 rounded hover:bg-blue-50 transition-colors">
                                        <i class="fas fa-comments mr-1"></i>
                                        View ${comment.children.length} ${comment.children.length === 1 ? 'reply' : 'replies'}
                                    </button>
                                </div>
                            ` : '')
                        }
                </div>
            `;
            
            setTimeout(() => window.Utils?.attachSpoilerHandlers(), 0);
            
            return html;
        },
        
        insertMarkdown(before, after) {
            const textarea = document.querySelector('textarea[x-model="newCommentText"]');
            if (textarea) {
                window.insertMarkdown(textarea, before, after);
                this.newCommentText = textarea.value;
                this.updatePreview();
            }
        },
        
        insertImage() {
            const url = prompt('Enter image URL:');
            if (url) {
                this.newCommentText += `\n![Image](${url})\n`;
                this.updatePreview();
            }
        },
        
        insertVideo() {
            const url = prompt('Enter YouTube video URL:');
            if (url) {
                const videoId = window.extractYouTubeId(url);
                if (videoId) {
                    this.newCommentText += `\n[youtube:${videoId}]\n`;
                    this.updatePreview();
                } else {
                    alert('Invalid YouTube URL');
                }
            }
        },
        
        // Get pageId from URL
        get pageId() {
            const params = new URLSearchParams(window.location.search);
            return params.get('pageId') || 'default';
        },
        
        // Additional comment methods
        async voteComment(commentId, voteType) {
            if (!this.user) {
                alert('Please sign in to vote');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}/vote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ vote_type: voteType })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    const comment = this.findComment(commentId, this.comments);
                    if (comment) {
                        comment.likes = result.likes;
                        comment.dislikes = result.dislikes;
                        comment.userVote = result.userVote;
                    }
                }
            } catch (error) {
                console.error('Error voting:', error);
            }
        },
        
        async deleteComment(commentId) {
            if (!confirm('Delete this comment?')) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    await this.loadComments();
                }
            } catch (error) {
                console.error('Error deleting comment:', error);
            }
        },
        
        async reportComment(commentId) {
            const reason = prompt('Please provide a reason for reporting this comment:');
            if (!reason) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}/report`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ reason })
                });
                
                if (response.ok) {
                    alert('Comment reported. Thank you for helping keep our community safe.');
                }
            } catch (error) {
                console.error('Error reporting comment:', error);
            }
        },
        
        showReplyForm(commentId) {
            const form = document.getElementById(`reply-form-${commentId}`);
            if (form) {
                form.style.display = form.style.display === 'none' ? 'block' : 'none';
            }
        },
        
        cancelReply(commentId) {
            const form = document.getElementById(`reply-form-${commentId}`);
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (form) form.style.display = 'none';
            if (textarea) textarea.value = '';
        },
        
        async submitReply(commentId) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (!textarea || !textarea.value.trim()) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        content: textarea.value.trim(),
                        page_id: this.pageId,
                        parent_id: commentId
                    })
                });
                
                if (response.ok) {
                    this.cancelReply(commentId);
                    await this.loadComments();
                }
            } catch (error) {
                console.error('Error posting reply:', error);
            }
        },
        
        findComment(commentId, comments) {
            for (const comment of comments) {
                if (comment.id == commentId) return comment;
                if (comment.children) {
                    const found = this.findComment(commentId, comment.children);
                    if (found) return found;
                }
            }
            return null;
        },
        
        toggleCollapse(event) {
            event.stopPropagation();
            const container = event.target.closest('.comment-container');
            if (container) {
                container.classList.toggle('collapsed');
            }
        },
        
        toggleDropdown(commentId, event) {
            event.stopPropagation();
            const dropdown = document.getElementById(`dropdown-${commentId}`);
            const allDropdowns = document.querySelectorAll('.comment-dropdown');
            
            allDropdowns.forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                }
            });
            
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        },
        
        viewReplies(commentId) {
            this.enterFocusMode(commentId);
        },
        
        enterFocusMode(commentId) {
            const comment = this.findComment(commentId, this.comments);
            if (!comment) return;
            
            this.focusedCommentId = commentId;
            this.focusedComments = [comment];
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        
        exitFocusMode() {
            this.focusedCommentId = null;
            this.focusedComments = [];
        },
        
        insertMarkdownForReply(commentId, before, after) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (textarea) {
                window.insertMarkdown(textarea, before, after);
            }
        },
        
        insertImageForReply(commentId) {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdownForReply(commentId, `![Image](${url})`, '');
            }
        },
        
        insertVideoForReply(commentId) {
            const url = prompt('Enter YouTube video URL:');
            if (url) {
                const videoId = window.extractYouTubeId(url);
                if (videoId) {
                    this.insertMarkdownForReply(commentId, `[youtube:${videoId}]`, '');
                } else {
                    alert('Invalid YouTube URL');
                }
            }
        },
        
        buildCommentTree(comments) {
            const commentMap = {};
            const rootComments = [];
            
            // First pass: create map
            comments.forEach(comment => {
                comment.children = [];
                commentMap[comment.id] = comment;
            });
            
            // Second pass: build tree
            comments.forEach(comment => {
                if (comment.parent_id && commentMap[comment.parent_id]) {
                    commentMap[comment.parent_id].children.push(comment);
                } else {
                    rootComments.push(comment);
                }
            });
            
            return rootComments;
        }
    };
}