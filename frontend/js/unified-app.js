// Set API base URL
const API_URL = window.location.origin;

// Shared utility functions
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
    
    const shadowBan = confirm('Make this a shadow ban? (User won\'t be notified)');
    
    const response = await BanHandler.banUser(API_URL, userId, userName, duration, reason, false, shadowBan);
    if (response.success) {
        // Display ban success message
        if (window.unifiedAppInstance) {
            window.unifiedAppInstance.banNotification = {
                show: true,
                message: `${userName} has been ${shadowBan ? 'shadow ' : ''}banned.\n${response.result.ban_duration_text}`,
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

// Setup markdown parser
function initializeMarkdown() {
    if (!window.md) {
        window.md = window.markdownit({
            html: false,
            breaks: true,
            linkify: true
        });
    }
}

// Close dropdowns on outside click
document.addEventListener('click', (event) => {
    if (!event.target.closest('.comment-dropdown-container')) {
        document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        // Remove has-open-dropdown class from all comments
        document.querySelectorAll('.comment-content.has-open-dropdown').forEach(comment => {
            comment.classList.remove('has-open-dropdown');
        });
    }
});

// Handle Discord login callbacks
Auth.setupOAuthListener((user, data) => {
    if (window.unifiedAppInstance) {
        window.unifiedAppInstance.user = user;
        window.unifiedAppInstance.loadComments();
    }
});

// Build request headers with auth
function getAuthHeaders() {
    const sessionToken = localStorage.getItem('sessionToken');
    const headers = {
        'Content-Type': 'application/json'
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
}

// Clear session on auth failure
async function handleAuthError(response) {
    if (response.status === 401) {
        console.log('Session expired, clearing localStorage');
        localStorage.removeItem('user');
        localStorage.removeItem('sessionToken');
        // Refresh page to clear state
        window.location.reload();
        return true;
    }
    return false;
}

function unifiedApp() {
    return {
        // Main app data
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
        highlightedCommentId: null,
        commentVotes: {},
        
        // Moderator dashboard state
        activeTab: 'comments',
        
        // Report management data
        reports: [],
        filteredReports: [],
        pageReports: [],
        totalPendingReports: 0,
        loadingReports: false,
        reportsLoaded: false,
        selectedReportsPage: null,
        pageSearchQuery: '',
        pages: [],
        filteredPages: [],
        showPageDropdown: false,
        
        // User management data
        users: [],
        filteredUsers: [],
        paginatedUsers: [],
        loadingUsers: false,
        usersLoaded: false,
        userSearchQuery: '',
        userFilter: 'all',
        currentUserPage: 1,
        totalUserPages: 1,
        usersPerPage: 20,
        expandedUsers: [],
        
        // Ban UI state
        showBanDropdown: null,
        banNotification: { show: false, message: '', expired: false },
        
        // Page lock state
        pageLocked: false,
        pageLockReason: '',
        
        // Comment drafts
        commentDraft: '',
        draftSaveTimeout: null,
        
        // Search state
        searchQuery: '',
        warningNotification: { show: false, message: '' },
        
        // Setup app on load
        async init() {
            // Store app reference globally
            window.unifiedAppInstance = this;
            
            // Create markdown parser
            window.md = window.markdownit({
                html: false,
                breaks: true,
                linkify: true
            });
            
            // Restore user session
            this.user = await Auth.checkExistingSession();
            
            // Grant super mod permissions
            if (this.user) {
                const initialMods = (window.ENV?.INITIAL_MODERATORS || '').split(',').map(id => id.trim()).filter(Boolean);
                if (initialMods.includes(this.user.id)) {
                    this.user.is_super_moderator = true;
                }
                
                // Check for unread warnings
                await this.checkWarnings();
            }
            
            // Check page lock status
            await this.checkPageLockStatus();
            
            // Fetch page comments
            await this.loadComments();
            
            // Get pending report count
            if (this.user?.is_moderator) {
                await this.loadReportCount();
            }
            
            // Load comment draft
            if (this.user) {
                await this.loadDraft();
            }
            
            // Setup markdown renderer
            if (window.initializeMarkdown) {
                window.initializeMarkdown();
            }
            
            // Setup responsive layout handler
            this.setupResponsiveLayout();
        },
        
        // Check for element overlap and adjust layout
        setupResponsiveLayout() {
            const checkOverlap = () => {
                const container = document.querySelector('.sorting-search-container');
                if (!container) return;
                
                const sortingWrapper = container.querySelector('.sorting-buttons-wrapper');
                const searchWrapper = container.querySelector('.search-controls-wrapper');
                
                if (!sortingWrapper || !searchWrapper) return;
                
                // Get bounding rectangles
                const sortingRect = sortingWrapper.getBoundingClientRect();
                const searchRect = searchWrapper.getBoundingClientRect();
                
                // Check if elements overlap or are too close
                const gap = 20; // Minimum gap in pixels
                const overlapping = sortingRect.right + gap > searchRect.left;
                
                // Toggle stacked class based on overlap
                if (overlapping && !container.classList.contains('stacked')) {
                    container.classList.add('stacked');
                } else if (!overlapping && container.classList.contains('stacked')) {
                    // Only remove stacked if there's enough space
                    const containerWidth = container.getBoundingClientRect().width;
                    const totalNeededWidth = sortingWrapper.scrollWidth + searchWrapper.scrollWidth + gap * 2;
                    
                    if (containerWidth > totalNeededWidth) {
                        container.classList.remove('stacked');
                    }
                }
            };
            
            // Check on load and resize
            checkOverlap();
            window.addEventListener('resize', checkOverlap);
            
            // Also check after Alpine renders
            setTimeout(checkOverlap, 100);
        },
        
        // Fetch unread warnings
        async checkWarnings() {
            try {
                const response = await fetch(`${API_URL}/api/users/warnings/unread`, {
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
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
            this.reports = [];
            this.users = [];
            this.totalPendingReports = 0;
            this.reportsLoaded = false;
            this.usersLoaded = false;
            await this.loadComments();
        },
        
        // Check page lock status
        async checkPageLockStatus() {
            try {
                const pageId = Utils.getPageId();
                const response = await fetch(`${API_URL}/api/pages/${encodeURIComponent(pageId)}/lock-status`);
                if (response.ok) {
                    const data = await response.json();
                    this.pageLocked = data.locked;
                    this.pageLockReason = data.lockReason || '';
                }
            } catch (error) {
                console.error('Error checking page lock status:', error);
            }
        },
        
        // Toggle page lock
        async togglePageLock() {
            const pageId = Utils.getPageId();
            const lock = !this.pageLocked;
            const reason = lock ? prompt('Enter reason for locking this page:') : null;
            
            if (lock && !reason) return;
            
            try {
                const response = await fetch(`${API_URL}/api/pages/${encodeURIComponent(pageId)}/lock`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Auth.getToken()}`
                    },
                    body: JSON.stringify({ lock, reason })
                });
                
                if (response.ok) {
                    this.pageLocked = lock;
                    this.pageLockReason = reason || '';
                    await this.loadComments();
                } else {
                    throw new Error('Failed to update page lock');
                }
            } catch (error) {
                console.error('Error toggling page lock:', error);
                alert('Failed to update page lock status');
            }
        },
        
        // Comment methods
        async loadComments() {
            this.loading = true;
            try {
                const params = new URLSearchParams(window.location.search);
                const pageId = params.get('pageId') || 'default';
                
                // Build request options - only add auth headers if user is logged in
                const options = {
                    credentials: 'include'
                };
                
                const sessionToken = localStorage.getItem('sessionToken');
                if (sessionToken) {
                    options.headers = getAuthHeaders();
                }
                
                let url = `${API_URL}/api/comments?pageId=${encodeURIComponent(pageId)}`;
                if (this.searchQuery) {
                    url += `&search=${encodeURIComponent(this.searchQuery)}`;
                }
                console.log('Loading comments from URL:', url);
                const response = await fetch(url, options);
                
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
        
        // Draft management
        async loadDraft() {
            try {
                const pageId = Utils.getPageId();
                const parentId = this.replyingTo;
                const response = await fetch(`${API_URL}/api/drafts?pageId=${encodeURIComponent(pageId)}${parentId ? `&parentId=${parentId}` : ''}`, {
                    headers: {
                        'Authorization': `Bearer ${Auth.getToken()}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.draft) {
                        this.newCommentText = data.draft.content;
                        this.commentDraft = data.draft.content;
                        this.updatePreview();
                    }
                }
            } catch (error) {
                console.error('Error loading draft:', error);
            }
        },
        
        async saveDraft() {
            if (!this.user || !this.newCommentText.trim()) return;
            
            try {
                const pageId = Utils.getPageId();
                await fetch(`${API_URL}/api/drafts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Auth.getToken()}`
                    },
                    body: JSON.stringify({
                        pageId,
                        content: this.newCommentText,
                        parentId: this.replyingTo
                    })
                });
                this.commentDraft = this.newCommentText;
            } catch (error) {
                console.error('Error saving draft:', error);
            }
        },
        
        async deleteDraft() {
            try {
                const pageId = Utils.getPageId();
                const parentId = this.replyingTo;
                await fetch(`${API_URL}/api/drafts?pageId=${encodeURIComponent(pageId)}${parentId ? `&parentId=${parentId}` : ''}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${Auth.getToken()}`
                    }
                });
                this.commentDraft = '';
            } catch (error) {
                console.error('Error deleting draft:', error);
            }
        },
        
        onCommentTextChange() {
            this.updatePreview();
            
            // Clear existing timeout
            if (this.draftSaveTimeout) {
                clearTimeout(this.draftSaveTimeout);
            }
            
            // Save draft after 1 second of inactivity
            this.draftSaveTimeout = setTimeout(() => {
                this.saveDraft();
            }, 1000);
        },
        
        async searchComments() {
            await this.loadComments();
        },
        
        clearSearch() {
            this.searchQuery = '';
            this.loadComments();
        },
        
        async submitComment() {
            if (!this.newCommentText.trim() || !this.user || this.user.is_banned) return;
            
            try {
                const params = new URLSearchParams(window.location.search);
                const pageId = params.get('pageId') || 'default';
                
                const requestBody = {
                    content: this.newCommentText.trim(),
                    pageId: pageId
                };
                
                console.log('Submitting comment with body:', requestBody);
                
                const response = await fetch(`${API_URL}/api/comments`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify(requestBody)
                });
                
                if (response.ok) {
                    this.newCommentText = '';
                    this.commentPreview = '';
                    await this.deleteDraft(); // Delete draft after successful submission
                    await this.loadComments();
                } else {
                    if (await handleAuthError(response)) return;
                    const error = await response.json();
                    console.error('Comment submission error:', error);
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
            if (!this.user?.is_moderator) return;
            
            this.loadingReports = true;
            try {
                // Use the new consolidated endpoint with includePages parameter
                const url = `${API_URL}/api/reports?includePages=true&status=pending`;
                console.log('Loading reports from URL:', url);
                const response = await fetch(url, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Loaded reports data:', data);
                    this.reports = data.reports || [];
                    this.pages = data.pages || [];
                    
                    // If selectedReportsPage is not set, default to current page
                    if (this.selectedReportsPage === null) {
                        this.selectedReportsPage = this.pageId;
                    }
                    
                    this.filterReports();
                    this.filterPages();
                    this.reportsLoaded = true;
                    
                    // Also update the report count
                    this.totalPendingReports = this.reports.length;
                } else {
                    console.error('Failed to load reports:', response.status, response.statusText);
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Error details:', errorData);
                }
            } catch (error) {
                console.error('Error loading reports:', error);
            } finally {
                this.loadingReports = false;
            }
        },
        
        filterReports() {
            if (this.selectedReportsPage && this.selectedReportsPage !== 'all') {
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
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ action: 'dismissed' })
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
        
        // User admin functions
        async loadUsers() {
            if (this.activeTab !== 'users') return;
            if (!this.user?.is_moderator) return; // Moderators only
            
            this.loadingUsers = true;
            try {
                const response = await fetch(`${API_URL}/api/users`, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    this.users = await response.json();
                    this.filterUsers();
                    this.usersLoaded = true;
                }
            } catch (error) {
                console.error('Error loading users:', error);
            } finally {
                this.loadingUsers = false;
            }
        },
        
        filterUsers() {
            // Filter users client-side
            // TODO: Move to server-side filtering
            let filtered = [...this.users];
            
            // Search by name or email
            if (this.userSearchQuery) {
                const query = this.userSearchQuery.toLowerCase();
                filtered = filtered.filter(user => 
                    user.name.toLowerCase().includes(query) ||
                    user.id.toLowerCase().includes(query)
                );
            }
            
            // Apply type filter (already filtered from backend if loadUsers was called with filter)
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
                const url = `${API_URL}/api/users?userId=${userId}&includeDetails=true`;
                console.log('Loading user details from URL:', url);
                const response = await fetch(url, {
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
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
                    headers: getAuthHeaders(),
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
            // Enter focus mode on the reported comment
            this.enterFocusMode(commentId, true);
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
            
            // Reset loaded flags to force refresh
            if (this.activeTab === 'reports') {
                this.reportsLoaded = false;
                await this.loadReports();
            } else if (this.activeTab === 'users') {
                this.usersLoaded = false;
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
                    
                    <div class="comment-content ${this.highlightedCommentId == comment.id ? 'reported-comment' : ''}" id="comment-${comment.id}">
                        
                        <div class="comment-header">
                            ${!isDeleted ? `<img src="${comment.userPicture}" class="comment-avatar">` : '<div class="comment-avatar bg-gray-300"></div>'}
                            <div class="comment-meta">
                                <span class="comment-author">${displayAuthor}</span>
                                <span class="comment-time">${this.getRelativeTime(comment.createdAt)}</span>
                                ${comment.is_locked ? '<span class="text-yellow-600 ml-2"><i class="fas fa-lock text-xs"></i> Locked</span>' : ''}
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
                                ${!comment.is_locked && !this.pageLocked ? `
                                    <button onclick="window.unifiedAppInstance.showReplyForm('${comment.id}')" 
                                            class="comment-action">
                                        <i class="fas fa-comment"></i>
                                        Reply
                                    </button>
                                ` : ''}
                                ${this.user ? `
                                    <div class="comment-dropdown-container">
                                        <button onclick="window.unifiedAppInstance.toggleCommentDropdown('${comment.id}')" 
                                                class="comment-options-btn" id="options-btn-${comment.id}">
                                            <i class="fas fa-ellipsis-v"></i>
                                        </button>
                                        <div id="dropdown-${comment.id}" 
                                             class="comment-dropdown"
                                             style="top: 100%; left: 0; margin-top: 5px;">
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
                                            ${this.user.is_moderator && !isDeleted ? `
                                                <button onclick="window.unifiedAppInstance.toggleCommentLock('${comment.id}')" 
                                                        class="comment-dropdown-item">
                                                    <i class="fas ${comment.is_locked ? 'fa-lock-open' : 'fa-lock'}"></i>
                                                    ${comment.is_locked ? 'Unlock Thread' : 'Lock Thread'}
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
                                            class="reply-btn reply-btn-secondary">
                                        Cancel
                                    </button>
                                    <button onclick="window.unifiedAppInstance.submitReply('${comment.id}')" 
                                            class="reply-btn reply-btn-primary">
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
        
        // Extract page ID from query params
        get pageId() {
            const params = new URLSearchParams(window.location.search);
            return params.get('pageId') || 'default';
        },
        
        // Comment interaction methods
        async voteComment(commentId, voteType) {
            if (!this.user) {
                alert('Please sign in to vote');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}/vote`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ voteType: voteType })
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
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    await this.loadComments();
                }
            } catch (error) {
                console.error('Error deleting comment:', error);
            }
        },
        
        async toggleCommentLock(commentId) {
            const comment = this.findComment(commentId, this.comments);
            if (!comment) return;
            
            const lock = !comment.is_locked;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}/lock`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ lock })
                });
                
                if (response.ok) {
                    await this.loadComments();
                } else {
                    alert('Failed to update comment lock status');
                }
            } catch (error) {
                console.error('Error toggling comment lock:', error);
                alert('Failed to update comment lock status');
            }
        },
        
        async reportComment(commentId) {
            const reason = prompt('Please provide a reason for reporting this comment:');
            if (!reason) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}/report`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
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
            
            const requestBody = {
                content: textarea.value.trim(),
                pageId: this.pageId,
                parentId: parseInt(commentId, 10) // Ensure parentId is a number
            };
            
            console.log('Submitting reply with body:', requestBody);
            
            try {
                const response = await fetch(`${API_URL}/api/comments`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify(requestBody)
                });
                
                if (response.ok) {
                    this.cancelReply(commentId);
                    await this.loadComments();
                } else {
                    if (await handleAuthError(response)) return;
                    const error = await response.json();
                    console.error('Reply submission error:', error);
                    alert(error.error || 'Failed to post reply');
                }
            } catch (error) {
                console.error('Error posting reply:', error);
                alert('Failed to post reply');
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
        
        toggleCommentDropdown(commentId) {
            const dropdown = document.getElementById(`dropdown-${commentId}`);
            const allDropdowns = document.querySelectorAll('.comment-dropdown');
            const allComments = document.querySelectorAll('.comment-content');
            
            // Close all other dropdowns and remove has-open-dropdown class
            allDropdowns.forEach((d, index) => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                }
            });
            
            // Remove has-open-dropdown class from all comments
            allComments.forEach(comment => {
                comment.classList.remove('has-open-dropdown');
            });
            
            // Toggle current dropdown
            if (dropdown) {
                const isShowing = dropdown.classList.contains('show');
                dropdown.classList.toggle('show');
                
                // Add/remove has-open-dropdown class to the comment
                const commentElement = document.querySelector(`#comment-${commentId}`);
                if (commentElement) {
                    if (!isShowing) {
                        commentElement.classList.add('has-open-dropdown');
                    } else {
                        commentElement.classList.remove('has-open-dropdown');
                    }
                }
            }
        },
        
        viewReplies(commentId) {
            this.enterFocusMode(commentId);
        },
        
        enterFocusMode(commentId, isFromReport = false) {
            const comment = this.findComment(commentId, this.comments);
            if (!comment) return;
            
            // Store whether we're highlighting a reported comment
            this.highlightedCommentId = isFromReport ? commentId : null;
            
            // If the comment has a parent, show the parent as the root
            if (comment.parentId) {
                const parent = this.findComment(comment.parentId, this.comments);
                if (parent) {
                    this.focusedCommentId = parent.id;
                    this.focusedComments = [parent];
                } else {
                    // Parent not found, just show the comment
                    this.focusedCommentId = commentId;
                    this.focusedComments = [comment];
                }
            } else {
                // No parent, show the comment as root
                this.focusedCommentId = commentId;
                this.focusedComments = [comment];
            }
            
            // Wait for DOM to update, then scroll to the focused content
            setTimeout(() => {
                // Try to find the focus mode header first
                const focusHeader = document.querySelector('[x-show="focusedCommentId"]');
                if (focusHeader && focusHeader.offsetParent !== null) {
                    // Scroll to focus mode header with some offset
                    const offset = 20; // Small offset from top
                    const elementTop = focusHeader.getBoundingClientRect().top + window.pageYOffset;
                    window.scrollTo({
                        top: elementTop - offset,
                        behavior: 'smooth'
                    });
                } else {
                    // Fallback to comments container
                    const commentsContainer = document.querySelector('.comments-container');
                    if (commentsContainer) {
                        commentsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }, 100); // Small delay to ensure DOM is updated
        },
        
        exitFocusMode() {
            this.focusedCommentId = null;
            this.focusedComments = [];
            this.highlightedCommentId = null;
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
                if (comment.parentId && commentMap[comment.parentId]) {
                    commentMap[comment.parentId].children.push(comment);
                } else {
                    rootComments.push(comment);
                }
            });
            
            return rootComments;
        }
    };
}