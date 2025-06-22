// Set API base URL
const API_URL = window.location.origin;

// Shared utility functions
function getRelativeTime(dateString) {
    return Utils.getRelativeTime(dateString);
}

function renderMarkdown(text) {
    if (!window.md) {
        window.md = window.markdownit({
            html: true,
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
    
    const response = await BanHandler.banUser(API_URL, userId, userName, duration, reason);
    if (response.success) {
        // Display ban success message
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

// Setup markdown parser
function initializeMarkdown() {
    if (!window.md) {
        window.md = window.markdownit({
            html: true,
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
        // Ensure user object has all required properties
        window.unifiedAppInstance.user = {
            ...user,
            // Ensure both naming conventions are supported
            username: user.username || user.name,
            avatar: user.avatar || user.picture,
            // Set defaults if properties are missing
            allow_discord_dms: user.allow_discord_dms !== undefined ? user.allow_discord_dms : true,
            is_banned: user.is_banned || false
        };
        
        // Force Alpine.js to update the UI
        window.unifiedAppInstance.$nextTick(async () => {
            // Re-render components that depend on user state
            window.unifiedAppInstance.loadComments();
            
            // Check for warnings after successful OAuth login
            if (window.unifiedAppInstance.user) {
                await window.unifiedAppInstance.checkWarnings();
            }
        });
    }
});

// Build request headers with auth
function getAuthHeaders() {
    const sessionToken = localStorage.getItem('auth_token');
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
        filteredComments: [],
        loading: true,
        newCommentText: '',
        commentPreview: '',
        replyingTo: null,
        editingComment: null,
        editText: '',
        sortBy: 'likes', // Default to 'Top' sorting
        focusedCommentId: null,
        focusedComments: [],
        highlightedCommentId: null,
        pendingReportedCommentId: null,
        commentVotes: {},
        commentSearchQuery: '',
        searchMode: 'and', // 'and', 'or', 'not'
        forceRerender: false,
        
        // Mention dropdown state
        mentionDropdown: {
            show: false,
            users: [],
            selectedIndex: -1,
            searchTerm: '',
            mentionStart: 0
        },
        
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
        userCommentsDisplayCount: {}, // Track how many comments are displayed per user
        
        // Ban UI state
        showBanDropdown: null,
        banNotification: { show: false, message: '', expired: false },
        warningNotification: { show: false, message: '' },
        
        // Moderation logs data
        moderationLogs: [],
        moderators: [],
        selectedModeratorId: 'all',
        loadingLogs: false,
        logsLoaded: false,
        
        // Theme editor state
        themeColors: {
            primary: {
                main: '#3b82f6',
                hover: '#2563eb',  
                light: '#dbeafe'
            },
            backgrounds: {
                main: '#ffffff',
                secondary: '#f3f4f6',
                hover: '#f9fafb'
            },
            text: {
                primary: '#111827',
                secondary: '#6b7280',
                muted: '#9ca3af'
            },
            borders: {
                light: '#e5e7eb',
                medium: '#d1d5db'
            }
        },
        themePresets: {
            default: {
                displayName: 'Default (Auto-Match)',
                colors: null, // Will be populated by theme detection
                autoMatch: true
            },
            light: {
                displayName: 'Light',
                colors: {
                    primary: { main: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
                    backgrounds: { main: '#ffffff', secondary: '#f3f4f6', hover: '#f9fafb' },
                    text: { primary: '#111827', secondary: '#6b7280', muted: '#9ca3af' },
                    borders: { light: '#e5e7eb', medium: '#d1d5db' }
                }
            },
            dark: {
                displayName: 'Dark',
                colors: {
                    primary: { main: '#8b5cf6', hover: '#7c3aed', light: '#a78bfa' },
                    backgrounds: { main: '#1f2937', secondary: '#111827', hover: '#374151' },
                    text: { primary: '#f9fafb', secondary: '#d1d5db', muted: '#9ca3af' },
                    borders: { light: '#374151', medium: '#4b5563' }
                }
            },
            ocean: {
                displayName: 'Ocean',
                colors: {
                    primary: { main: '#0891b2', hover: '#0e7490', light: '#67e8f9' },
                    backgrounds: { main: '#f0fdfa', secondary: '#e6fffa', hover: '#ccfbf1' },
                    text: { primary: '#134e4a', secondary: '#0f766e', muted: '#14b8a6' },
                    borders: { light: '#5eead4', medium: '#2dd4bf' }
                }
            }
        },
        selectedPreset: 'default',
        selectedColorTarget: null,
        loadingTheme: false,
        themeLoaded: false,
        lastColorChange: null, // For undo functionality
        
        // Pages tab state
        pagesData: [],
        pagesCommentLimit: 25,
        pagesLoading: false,
        pagesComments: [], // Store flat list of comments for updates
        
        // Analytics state
        analyticsTab: false,
        bubbleChartData: null,
        analyticsTimeframe: 'day',
        analyticsDateIndex: 0,
        analyticsLoading: false,
        periodSummaryData: null,
        selectedPeriodDate: null,
        
        // Discord server URL
        discordServerUrl: '',
        
        // Navigation text visibility
        showNavText: false, // Always hide text, show icons only
        
        // Setup app on load
        async init() {
            // Store app reference globally
            window.unifiedAppInstance = this;
            
            // Create markdown parser
            window.md = window.markdownit({
                html: true,  // Changed from false to allow HTML passthrough
                breaks: true,
                linkify: true
            });
            
            // Load Discord server URL from config
            try {
                const response = await fetch('/api/config');
                if (response.ok) {
                    const config = await response.json();
                    this.discordServerUrl = config.discordServerUrl || '';
                }
            } catch (error) {
                console.error('Error loading config:', error);
            }
            
            // Restore user session
            const sessionUser = await Auth.checkExistingSession();
            if (sessionUser) {
                // Ensure user object has all required properties
                this.user = {
                    ...sessionUser,
                    // Ensure both naming conventions are supported
                    username: sessionUser.username || sessionUser.name,
                    avatar: sessionUser.avatar || sessionUser.picture,
                    // Set defaults if properties are missing
                    allow_discord_dms: sessionUser.allow_discord_dms !== undefined ? sessionUser.allow_discord_dms : true,
                    is_banned: sessionUser.is_banned || false
                };
            } else {
                this.user = null;
            }
            
            // Super moderator status comes from backend only
            
            // Fetch page comments
            await this.loadComments();
            
            // Set up hash navigation
            this.setupHashNavigation();
            
            // Get pending report count
            if (this.user?.is_moderator) {
                await this.loadReportCount();
            }
            
            // Check for warnings if user is authenticated
            if (this.user) {
                await this.checkWarnings();
            }
            
            // Setup markdown renderer
            if (window.initializeMarkdown) {
                window.initializeMarkdown();
            }
            
            // Initialize theme for all users
            await this.initThemeEditor();
            
            // Add resize handler for responsive charts
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    if (this.activeTab === 'analytics' && !this.analyticsLoading) {
                        // Redraw charts on resize
                        if (this.bubbleChartData) {
                            this.renderBubbleChart();
                        }
                        if (this.periodSummaryData && this.analyticsTimeframe !== 'quarter') {
                            this.renderBarChart();
                        }
                    }
                }, 250); // Debounce resize events
            });
            
            // Iframe communication setup
            const sendHeightToParent = () => {
                const height = Math.max(
                    document.body.scrollHeight,
                    document.body.offsetHeight,
                    document.documentElement.scrollHeight,
                    document.documentElement.offsetHeight
                );

                window.parent.postMessage({
                    type: 'resize',
                    height: height,
                    pageId: new URLSearchParams(window.location.search).get('pageId')
                }, '*');
            };

            // Send height on load
            window.addEventListener('load', sendHeightToParent);
            
            // Send height on DOM changes
            const observer = new MutationObserver(sendHeightToParent);
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });

            // Send height on window resize
            window.addEventListener('resize', sendHeightToParent);

            // Listen for messages from parent
            window.addEventListener('message', (event) => {
                if (event.data) {
                    if (event.data.type === 'getHeight' || event.data.action === 'requestHeight') {
                        sendHeightToParent();
                    } else if (event.data.type === 'setTheme' && event.data.theme) {
                        this.handleParentTheme(event.data.theme);
                    }
                }
            });
            
            // Navigation buttons show icons only for simplicity
        },
        
        // Removed overlap detection for simplicity
        
        // Fetch unread warnings
        async checkWarnings() {
            if (!this.user) {
                return; // Don't check warnings if not logged in
            }
            
            try {
                const response = await fetch(`${API_URL}/api/users/warnings/unread`, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const warnings = await response.json();
                    if (warnings.length > 0) {
                        // Combine all warning messages
                        const messages = warnings.map(w => 
                            `Reason: ${w.reason}${w.message ? '\n' + w.message : ''}`
                        ).join('\n\n');
                        
                        this.warningNotification = {
                            show: true,
                            message: messages,
                            count: warnings.length
                        };
                    }
                } else if (response.status === 401) {
                    // User is not authenticated, ignore
                    console.debug('User not authenticated for warning check');
                } else {
                    console.error('Failed to check warnings:', response.status);
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
        
        async toggleDiscordDMs() {
            if (!this.user) return;
            
            try {
                const response = await fetch(`${API_URL}/api/users/discord-dms`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({
                        allow_discord_dms: !this.user.allow_discord_dms
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.user.allow_discord_dms = data.allow_discord_dms;
                    
                    // Update stored user
                    localStorage.setItem('user', JSON.stringify(this.user));
                    
                    if (data.allow_discord_dms) {
                        alert('Discord DMs enabled! Make sure you\'ve joined our Discord server to receive mention notifications.');
                    } else {
                        alert('Discord DMs disabled. You will no longer receive mention notifications via Discord.');
                    }
                } else {
                    throw new Error('Failed to update Discord DM preference');
                }
            } catch (error) {
                console.error('Error toggling Discord DMs:', error);
                alert('Failed to update Discord DM preference');
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
                
                const url = `${API_URL}/api/comments?pageId=${encodeURIComponent(pageId)}`;
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
            // Helper to count total replies recursively
            const countReplies = (comment) => {
                let count = 0;
                if (comment.children && comment.children.length > 0) {
                    count = comment.children.length;
                    comment.children.forEach(child => {
                        count += countReplies(child);
                    });
                }
                return count;
            };

            // Function to recursively sort comments and their children
            const sortRecursive = (comments) => {
                let sorted = [...comments];
                
                // First, apply the selected sort order
                switch (this.sortBy) {
                    case 'likes':
                        // Top - sort by likes with newest as fallback
                        sorted.sort((a, b) => {
                            if (b.likes !== a.likes) {
                                return b.likes - a.likes;
                            }
                            // Fallback to newest when likes are equal
                            const dateA = new Date(a.created_at || a.createdAt);
                            const dateB = new Date(b.created_at || b.createdAt);
                            return dateB.getTime() - dateA.getTime();
                        });
                        break;
                    case 'popularity':
                        // Popular - sort by reply count with newest as fallback
                        sorted.sort((a, b) => {
                            const aReplies = countReplies(a);
                            const bReplies = countReplies(b);
                            if (bReplies !== aReplies) {
                                return bReplies - aReplies;
                            }
                            // Fallback to newest when reply counts are equal
                            const dateA = new Date(a.created_at || a.createdAt);
                            const dateB = new Date(b.created_at || b.createdAt);
                            return dateB.getTime() - dateA.getTime();
                        });
                        break;
                    case 'newest':
                        // Newest first - ensure proper date parsing
                        sorted.sort((a, b) => {
                            const dateA = new Date(a.created_at || a.createdAt);
                            const dateB = new Date(b.created_at || b.createdAt);
                            return dateB.getTime() - dateA.getTime();
                        });
                        break;
                    case 'oldest':
                        // Oldest first
                        sorted.sort((a, b) => {
                            const dateA = new Date(a.created_at || a.createdAt);
                            const dateB = new Date(b.created_at || b.createdAt);
                            return dateA.getTime() - dateB.getTime();
                        });
                        break;
                    default:
                        // Default to newest first
                        sorted.sort((a, b) => {
                            const dateA = new Date(a.created_at || a.createdAt);
                            const dateB = new Date(b.created_at || b.createdAt);
                            return dateB.getTime() - dateA.getTime();
                        });
                }
                
                // Then, move current user's comments to the top while maintaining their relative order
                if (this.user) {
                    const userComments = sorted.filter(comment => comment.isOwner);
                    const otherComments = sorted.filter(comment => !comment.isOwner);
                    sorted = [...userComments, ...otherComments];
                }
                
                // Sort children recursively using the same criteria
                sorted = sorted.map(comment => ({
                    ...comment,
                    children: comment.children ? sortRecursive(comment.children) : []
                }));
                
                return sorted;
            };
            
            this.sortedComments = sortRecursive(this.comments);
            this.filterComments();
        },
        
        toggleSearchMode() {
            // Cycle through search modes: and -> or -> not -> and
            if (this.searchMode === 'and') {
                this.searchMode = 'or';
            } else if (this.searchMode === 'or') {
                this.searchMode = 'not';
            } else {
                this.searchMode = 'and';
            }
            this.filterComments();
        },
        
        getSearchModeIcon() {
            switch (this.searchMode) {
                case 'and': return 'AND';
                case 'or': return 'OR';
                case 'not': return 'NOT';
                default: return 'AND';
            }
        },
        
        filterComments() {
            if (!this.commentSearchQuery.trim()) {
                this.filteredComments = this.sortedComments;
                return;
            }
            
            // Split query into individual words and convert to lowercase
            const searchTerms = this.commentSearchQuery.toLowerCase().trim().split(/\s+/);
            
            // Recursive function to search through comments and their children
            const searchComment = (comment) => {
                // Get searchable text from comment
                const searchableContent = (comment.content || '').toLowerCase();
                const searchableAuthor = (comment.userName || '').toLowerCase();
                const searchableText = searchableContent + ' ' + searchableAuthor;
                
                let matches = false;
                
                switch (this.searchMode) {
                    case 'and':
                        // ALL search terms must be present
                        matches = searchTerms.every(term => searchableText.includes(term));
                        break;
                    case 'or':
                        // AT LEAST ONE search term must be present
                        matches = searchTerms.some(term => searchableText.includes(term));
                        break;
                    case 'not':
                        // NONE of the search terms can be present
                        matches = !searchTerms.some(term => searchableText.includes(term));
                        break;
                }
                
                if (matches) {
                    return true;
                }
                
                // Check if any child comments match
                if (comment.children && comment.children.length > 0) {
                    return comment.children.some(child => searchComment(child));
                }
                
                return false;
            };
            
            // Filter top-level comments that match or have matching children
            this.filteredComments = this.sortedComments.filter(comment => searchComment(comment));
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
        
        async resolveReport(reportId) {
            try {
                const response = await fetch(`${API_URL}/api/reports/${reportId}/resolve`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ action: 'resolved' })
                });
                
                if (response.ok) {
                    this.reports = this.reports.filter(r => r.id !== reportId);
                    this.filterReports();
                    await this.loadReportCount();
                }
            } catch (error) {
                console.error('Error resolving report:', error);
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
                    console.log('Loaded user details:', details);
                    const userIndex = this.users.findIndex(u => u.id === userId);
                    if (userIndex !== -1) {
                        // Ensure we properly merge the details including comments
                        // Sort comments by created_at in descending order (most recent first)
                        const sortedComments = details.comments ? 
                            [...details.comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : 
                            [];
                        
                        // Sort reports by created_at in descending order (most recent first)
                        const sortedReports = details.reports_received ? 
                            [...details.reports_received].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : 
                            [];
                        
                        this.users[userIndex] = { 
                            ...this.users[userIndex], 
                            ...details,
                            comments: sortedComments,
                            ban_history: details.ban_history || [],
                            warnings: details.warnings || [],
                            reports_received: sortedReports
                        };
                        // Initialize comments display count to 5 if not set
                        if (!this.userCommentsDisplayCount[userId] && details.comments && details.comments.length > 0) {
                            this.userCommentsDisplayCount[userId] = 5;
                        }
                        this.filterUsers();
                    }
                }
            } catch (error) {
                console.error('Error loading user details:', error);
            }
        },
        
        async warnUser(userId, userName, reportId = null) {
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
                    
                    // If this was from a report, resolve it
                    if (reportId) {
                        await this.resolveReport(reportId);
                    }
                    
                    if (this.activeTab === 'users') {
                        await this.loadUsers();
                    } else if (this.activeTab === 'reports') {
                        await this.loadReports();
                    }
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
                    headers: {
                        ...getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
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
            // Get current display count, default to 5
            const currentCount = this.userCommentsDisplayCount[userId] || 5;
            
            // Increment by 5, max 25
            const newCount = Math.min(currentCount + 5, 25);
            this.userCommentsDisplayCount[userId] = newCount;
            
            // Force re-render by updating the user object
            const userIndex = this.users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                this.users[userIndex] = { ...this.users[userIndex] };
                this.filterUsers();
            }
        },
        
        getDisplayedComments(userItem) {
            if (!userItem.comments || userItem.comments.length === 0) {
                return [];
            }
            const displayCount = this.userCommentsDisplayCount[userItem.id] || 5;
            return userItem.comments.slice(0, displayCount);
        },
        
        getDisplayedWarnings(userItem) {
            if (!userItem.warnings || userItem.warnings.length === 0) {
                return [];
            }
            // Sort by date (most recent first) and limit to 5
            return userItem.warnings
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5);
        },
        
        shouldShowLoadMoreButton(userItem) {
            if (!userItem.comments || userItem.comments.length === 0) return false;
            const displayCount = this.userCommentsDisplayCount[userItem.id] || 5;
            return userItem.comments.length > displayCount && displayCount < 25;
        },
        
        // Moderation logs methods
        async loadModerationLogs() {
            if (this.activeTab !== 'logs') return;
            if (!this.user?.is_moderator) return;
            
            this.loadingLogs = true;
            try {
                let url = `${API_URL}/api/moderation-logs?limit=25`;
                if (this.selectedModeratorId && this.selectedModeratorId !== 'all') {
                    url += `&userId=${this.selectedModeratorId}`;
                }
                
                const response = await fetch(url, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.moderationLogs = data.logs || [];
                    this.moderators = data.moderators || [];
                    
                    // Parse JSON details
                    this.moderationLogs.forEach(log => {
                        if (log.details && typeof log.details === 'string') {
                            try {
                                log.details = JSON.parse(log.details);
                            } catch (e) {
                                log.details = {};
                            }
                        }
                    });
                    
                    this.logsLoaded = true;
                }
            } catch (error) {
                console.error('Error loading moderation logs:', error);
            } finally {
                this.loadingLogs = false;
            }
        },
        
        formatActionType(actionType) {
            const actionLabels = {
                'ban_user': 'banned',
                'unban_user': 'unbanned',
                'warn_user': 'warned',
                'delete_comment': 'deleted comment from',
                'dismiss_report': 'dismissed report against',
                'resolve_report': 'resolved report against',
                'grant_moderator': 'granted moderator to',
                'revoke_moderator': 'revoked moderator from'
            };
            const label = actionLabels[actionType] || actionType;
            // For multi-word actions, split into separate spans
            return label.split(' ').map(word => `<span>${word}</span>`).join('');
        },
        
        // Helper methods
        updatePreview() {
            this.commentPreview = renderMarkdown(this.newCommentText);
        },
        
        handleCommentInput() {
            const textarea = this.$refs.commentTextarea;
            const { value, selectionStart } = textarea;
            const textBeforeCursor = value.substring(0, selectionStart);
            const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
            
            if (mentionMatch) {
                this.mentionDropdown.searchTerm = mentionMatch[1];
                this.mentionDropdown.mentionStart = mentionMatch.index + 1;
                
                // Debug logging
                console.debug('Mention detected:', {
                    searchTerm: this.mentionDropdown.searchTerm,
                    length: this.mentionDropdown.searchTerm.length
                });
                
                if (this.mentionDropdown.searchTerm.length >= 0) {
                    // Search for users for any length of search term (including empty string and single characters)
                    this.searchMentionUsers();
                }
            } else {
                this.mentionDropdown.show = false;
            }
        },
        
        async searchMentionUsers() {
            try {
                const response = await fetch(
                    `${API_URL}/api/mention-users?q=${encodeURIComponent(this.mentionDropdown.searchTerm)}&limit=5`,
                    { 
                        headers: getAuthHeaders(),
                        credentials: 'include'
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    this.mentionDropdown.users = data.users || [];
                    this.mentionDropdown.show = this.mentionDropdown.users.length > 0;
                    this.mentionDropdown.selectedIndex = -1;
                } else {
                    if (response.status === 401) {
                        // Session expired
                        await handleAuthError(response);
                    }
                    this.mentionDropdown.show = false;
                }
            } catch (error) {
                console.error('User search error:', error);
                this.mentionDropdown.show = false;
            }
        },
        
        insertMention(user) {
            const textarea = this.$refs.commentTextarea;
            const before = this.newCommentText.substring(0, this.mentionDropdown.mentionStart - 1);
            const after = this.newCommentText.substring(textarea.selectionStart);
            
            this.newCommentText = before + `@${user.name} ` + after;
            this.updatePreview();
            this.mentionDropdown.show = false;
            
            this.$nextTick(() => {
                const newPosition = this.mentionDropdown.mentionStart - 1 + `@${user.name} `.length;
                textarea.setSelectionRange(newPosition, newPosition);
                textarea.focus();
            });
        },
        
        handleMentionKeydown(event) {
            if (!this.mentionDropdown.show) return;
            
            const { key } = event;
            if (key === 'ArrowDown') {
                event.preventDefault();
                this.mentionDropdown.selectedIndex = Math.min(
                    this.mentionDropdown.selectedIndex + 1, 
                    this.mentionDropdown.users.length - 1
                );
            } else if (key === 'ArrowUp') {
                event.preventDefault();
                this.mentionDropdown.selectedIndex = Math.max(this.mentionDropdown.selectedIndex - 1, -1);
            } else if (key === 'Enter' && this.mentionDropdown.selectedIndex >= 0) {
                event.preventDefault();
                this.insertMention(this.mentionDropdown.users[this.mentionDropdown.selectedIndex]);
            } else if (key === 'Escape') {
                this.mentionDropdown.show = false;
            }
        },
        
        getRelativeTime(dateString) {
            return getRelativeTime(dateString);
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
        renderComment(comment, depth = 0, context = 'main') {
            if (!comment) return '';
            
            const MAX_DEPTH = 5;
            const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
            const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
            const displayAuthor = isDeleted ? '[deleted]' : comment.userName;
            
            const processed = isDeleted ? '' : window.MarkdownProcessor?.preprocessMarkdown(displayContent) || displayContent;
            const content = isDeleted ? '' : window.md?.render(processed) || displayContent;
            
            const hasChildren = comment.children && comment.children.length > 0;
            
            // Add prefix to IDs when rendering in pages context to avoid duplicates
            const idPrefix = context === 'pages' ? 'pages-' : '';
            
            let html = `
                <div class="comment-wrapper">
                    <div class="comment-container ${depth > 0 ? 'comment-depth-' + depth : ''} ${!hasChildren ? 'no-children' : ''}" 
                         data-comment-id="${comment.id}">
                        <div class="comment-line" onclick="window.unifiedAppInstance.toggleCollapse(event)"></div>
                        
                        <div class="comment-content ${this.highlightedCommentId == comment.id ? 'reported-comment' : ''}" id="${idPrefix}comment-${comment.id}">
                        
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
                                <button onclick="if(window.unifiedAppInstance) window.unifiedAppInstance.voteComment('${comment.id}', 'like', '${context}')" 
                                        class="comment-action ${comment.userVote === 'like' ? 'active-like' : ''}">
                                    <i class="fas fa-thumbs-up"></i>
                                    <span>${comment.likes}</span>
                                </button>
                                <button onclick="if(window.unifiedAppInstance) window.unifiedAppInstance.voteComment('${comment.id}', 'dislike', '${context}')" 
                                        class="comment-action ${comment.userVote === 'dislike' ? 'active-dislike' : ''}">
                                    <i class="fas fa-thumbs-down"></i>
                                    <span>${comment.dislikes}</span>
                                </button>
                                <button onclick="window.unifiedAppInstance.showReplyForm('${comment.id}', '${context}')" 
                                        class="comment-action">
                                    <i class="fas fa-comment"></i>
                                    Reply
                                </button>
                                ${this.user ? `
                                    <div class="comment-dropdown-container">
                                        <button onclick="window.unifiedAppInstance.toggleCommentDropdown('${comment.id}', '${context}')" 
                                                class="btn-base comment-options-btn" id="${idPrefix}options-btn-${comment.id}">
                                            <i class="fas fa-ellipsis-v"></i>
                                        </button>
                                        <div id="${idPrefix}dropdown-${comment.id}" 
                                             class="dropdown-base comment-dropdown"
                                             style="top: 100%; left: 0; margin-top: 5px;">
                                            <button onclick="window.unifiedAppInstance.reportComment('${comment.id}', '${context}')" 
                                                    class="dropdown-item-base comment-dropdown-item">
                                                <i class="fas fa-flag"></i>
                                                Report
                                            </button>
                                            ${(comment.isOwner || this.user.is_moderator) ? `
                                                <button onclick="window.unifiedAppInstance.deleteComment('${comment.id}', '${context}')" 
                                                        class="dropdown-item-base comment-dropdown-item">
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
                        <div id="${idPrefix}reply-form-${comment.id}" style="display: none;" class="reply-form">
                            <textarea id="${idPrefix}reply-textarea-${comment.id}" 
                                      placeholder="Write a reply..."
                                      class="textarea-base reply-textarea"></textarea>
                            <div class="reply-toolbar">
                                <div class="markdown-buttons">
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '**', '**', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-bold"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '*', '*', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-italic"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '~~', '~~', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-strikethrough"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '## ', '', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-heading"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertMarkdownForReply('${comment.id}', '||', '||', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-eye-slash"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertImageForReply('${comment.id}', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-image"></i>
                                    </button>
                                    <button onclick="window.unifiedAppInstance.insertVideoForReply('${comment.id}', '${context}')" class="btn-base markdown-btn">
                                        <i class="fas fa-video"></i>
                                    </button>
                                </div>
                                <div class="reply-actions">
                                    <button onclick="window.unifiedAppInstance.cancelReply('${comment.id}', '${context}')" 
                                            class="btn-base btn btn-secondary">
                                        Cancel
                                    </button>
                                    <button onclick="window.unifiedAppInstance.submitReply('${comment.id}', '${context}')" 
                                            class="btn-base btn btn-primary">
                                        Reply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="comment-children">
                        ${depth < MAX_DEPTH && comment.children?.length > 0 ? 
                            comment.children.map(child => this.renderComment(child, depth + 1, context)).join('') : 
                            (depth >= MAX_DEPTH && comment.children?.length > 0 ? `
                                <div class="ml-4 mt-2">
                                    <button onclick="window.location.hash = '${idPrefix}comment-${comment.id}'" 
                                            class="btn-base btn btn-primary text-sm">
                                        <i class="fas fa-comments mr-1"></i>
                                        View ${comment.children.length} ${comment.children.length === 1 ? 'reply' : 'replies'}
                                    </button>
                                </div>
                            ` : '')
                        }
                    </div>
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
        async voteComment(commentId, voteType, context = 'main') {
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
                    
                    // Update visual elements immediately
                    const commentElement = document.getElementById(`comment-${commentId}`);
                    if (commentElement) {
                        // Update like button
                        const likeBtn = commentElement.querySelector('.comment-action:has(.fa-thumbs-up)');
                        if (likeBtn) {
                            const likeCount = likeBtn.querySelector('span');
                            if (likeCount) likeCount.textContent = result.likes;
                            
                            if (result.userVote === 'like') {
                                likeBtn.classList.add('active-like');
                            } else {
                                likeBtn.classList.remove('active-like');
                            }
                        }
                        
                        // Update dislike button
                        const dislikeBtn = commentElement.querySelector('.comment-action:has(.fa-thumbs-down)');
                        if (dislikeBtn) {
                            const dislikeCount = dislikeBtn.querySelector('span');
                            if (dislikeCount) dislikeCount.textContent = result.dislikes;
                            
                            if (result.userVote === 'dislike') {
                                dislikeBtn.classList.add('active-dislike');
                            } else {
                                dislikeBtn.classList.remove('active-dislike');
                            }
                        }
                    }
                    
                    // Update the comment in all arrays
                    const updateCommentInArray = (comments) => {
                        for (let i = 0; i < comments.length; i++) {
                            if (comments[i].id === commentId) {
                                comments[i].likes = result.likes;
                                comments[i].dislikes = result.dislikes;
                                comments[i].userVote = result.userVote;
                                return true;
                            }
                            if (comments[i].children && updateCommentInArray(comments[i].children)) {
                                return true;
                            }
                        }
                        return false;
                    };
                    
                    // Update in all arrays to trigger reactivity
                    updateCommentInArray(this.comments);
                    updateCommentInArray(this.sortedComments);
                    updateCommentInArray(this.filteredComments);
                    
                    // IMPORTANT: Also update in pages comments
                    if (this.pagesComments && this.pagesComments.length > 0) {
                        updateCommentInArray(this.pagesComments);
                        // Rebuild pages data to reflect changes
                        this.rebuildPagesData();
                    }
                    
                    // Force re-render by updating the comments key
                    // This triggers Alpine to re-evaluate x-html
                    this.forceRerender = !this.forceRerender;
                    
                    // Also update the filtered comments to trigger reactivity
                    this.filteredComments = [...this.filteredComments];
                }
            } catch (error) {
                console.error('Error voting:', error);
            }
        },
        
        async deleteComment(commentId, context = 'main') {
            if (!confirm('Delete this comment?')) return;
            
            try {
                const response = await fetch(`${API_URL}/api/comments/${commentId}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    // Mark comment as deleted locally for immediate visual feedback
                    const markAsDeleted = (comments) => {
                        for (let comment of comments) {
                            if (comment.id === commentId) {
                                comment.content = '[deleted]';
                                comment.deleted = true;
                                comment.userName = '[deleted]';
                                comment.userPicture = '';
                                return true;
                            }
                            if (comment.children && markAsDeleted(comment.children)) {
                                return true;
                            }
                        }
                        return false;
                    };
                    
                    // Update in all arrays
                    markAsDeleted(this.comments);
                    markAsDeleted(this.sortedComments);
                    markAsDeleted(this.filteredComments);
                    
                    // If in focus mode, update focused comments too
                    if (this.focusedCommentId) {
                        markAsDeleted(this.focusedComments);
                        // Force re-render
                        this.focusedComments = [...this.focusedComments];
                    }
                    
                    // IMPORTANT: Also update in pages comments
                    if (this.pagesComments && this.pagesComments.length > 0) {
                        markAsDeleted(this.pagesComments);
                        // Rebuild pages data to reflect changes
                        this.rebuildPagesData();
                    }
                    
                    // Force re-render
                    this.filteredComments = [...this.filteredComments];
                    
                    // Then reload comments to get the actual server state
                    await this.loadComments();
                    
                    // If in focus mode, refresh the focused view with updated data
                    if (this.focusedCommentId) {
                        const currentFocusId = this.focusedCommentId;
                        this.enterFocusMode(currentFocusId, this.highlightedCommentId === currentFocusId);
                    }
                }
            } catch (error) {
                console.error('Error deleting comment:', error);
            }
        },
        
        async reportComment(commentId, context = 'main') {
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
        
        showReplyForm(commentId, context = 'main') {
            const idPrefix = context === 'pages' ? 'pages-' : '';
            const form = document.getElementById(`${idPrefix}reply-form-${commentId}`);
            if (form) {
                form.style.display = form.style.display === 'none' ? 'block' : 'none';
            }
        },
        
        cancelReply(commentId, context = 'main') {
            const idPrefix = context === 'pages' ? 'pages-' : '';
            const form = document.getElementById(`${idPrefix}reply-form-${commentId}`);
            const textarea = document.getElementById(`${idPrefix}reply-textarea-${commentId}`);
            if (form) form.style.display = 'none';
            if (textarea) textarea.value = '';
        },
        
        async submitReply(commentId, context = 'main') {
            const idPrefix = context === 'pages' ? 'pages-' : '';
            const textarea = document.getElementById(`${idPrefix}reply-textarea-${commentId}`);
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
                    this.cancelReply(commentId, context);
                    await this.loadComments();
                    
                    // IMPORTANT: Also reload pages data if we're on the pages tab
                    if (this.activeTab === 'pages') {
                        await this.loadPagesData();
                    }
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
        
        toggleCommentDropdown(commentId, context = 'main') {
            const idPrefix = context === 'pages' ? 'pages-' : '';
            const dropdown = document.getElementById(`${idPrefix}dropdown-${commentId}`);
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
        
        enterFocusMode(commentId, isFromReport = false) {
            // Simply update the hash and let the hash navigation handler do the work
            window.location.hash = `comment-${commentId}`;
        },
        
        exitFocusMode() {
            this.focusedCommentId = null;
            this.focusedComments = [];
            this.highlightedCommentId = null;
            
            // Clear hash from URL
            if (window.location.hash) {
                history.pushState(null, null, window.location.pathname + window.location.search);
            }
        },
        
        setupHashNavigation() {
            // Handle initial hash on page load
            this.handleHashNavigation();
            
            // Listen for hash changes
            window.addEventListener('hashchange', () => this.handleHashNavigation());
        },
        
        async handleHashNavigation() {
            const hash = window.location.hash;
            
            if (hash && hash.startsWith('#comment-')) {
                const commentId = parseInt(hash.substring(9));
                
                if (!isNaN(commentId)) {
                    // Check if this is a reported comment view
                    const isFromReport = this.pendingReportedCommentId === commentId;
                    this.pendingReportedCommentId = null; // Clear the flag
                    
                    // First try to find comment in current page's comments
                    let comment = this.findComment(commentId, this.comments);
                    
                    if (!comment) {
                        // Comment not on current page - fetch it from API
                        comment = await this.fetchCommentById(commentId);
                    }
                    
                    if (comment) {
                        // Build focus mode view from scratch
                        await this.buildFocusMode(comment, isFromReport);
                    }
                }
            } else if (!hash && this.focusedCommentId) {
                // No hash means exit focus mode
                this.exitFocusMode();
            }
        },
        
        async fetchCommentById(commentId) {
            try {
                const response = await fetch(`/api/comments/${commentId}`);
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                console.error('Failed to fetch comment:', error);
            }
            return null;
        },
        
        async buildFocusMode(comment, isFromReport = false) {
            // Clear current focus
            this.focusedComments = [];
            
            // If comment has a parent, fetch and add it first
            if (comment.parentId) {
                let parent = this.findComment(comment.parentId, this.comments);
                if (!parent) {
                    parent = await this.fetchCommentById(comment.parentId);
                }
                if (parent) {
                    this.focusedComments.push(parent);
                    this.focusedCommentId = parent.id;
                }
            } else {
                // No parent, comment is the root
                this.focusedComments.push(comment);
                this.focusedCommentId = comment.id;
            }
            
            // Only highlight if viewing from reports
            this.highlightedCommentId = isFromReport ? comment.id : null;
            
            // Update URL to reflect focus mode
            if (window.location.hash !== `#comment-${comment.id}`) {
                history.replaceState(null, null, `#comment-${comment.id}`);
            }
            
            // Scroll to focused content after render
            this.$nextTick(() => {
                const focusedContent = document.getElementById('focused-content');
                if (focusedContent) {
                    focusedContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        },
        
        viewReportedComment(commentId) {
            // Set a flag that we're viewing from reports
            console.log('viewReportedComment called with:', commentId);
            this.pendingReportedCommentId = commentId;
            window.location.hash = `comment-${commentId}`;
        },
        
        insertMarkdownForReply(commentId, before, after) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (textarea) {
                window.insertMarkdown(textarea, before, after);
            }
        },
        
        insertImageForReply(commentId, context = 'main') {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdownForReply(commentId, `![Image](${url})`, '', context);
            }
        },
        
        insertVideoForReply(commentId, context = 'main') {
            const url = prompt('Enter YouTube video URL:');
            if (url) {
                const videoId = window.extractYouTubeId(url);
                if (videoId) {
                    this.insertMarkdownForReply(commentId, `[youtube:${videoId}]`, '', context);
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
        },
        
        // Theme Editor Methods
        
        // Initialize theme editor
        async initThemeEditor() {
            // Always load theme, but use different endpoints based on auth status
            await this.loadTheme();
            this.injectThemeStyles();
        },
        
        // Load saved theme from backend
        async loadTheme() {
            this.loadingTheme = true;
            try {
                let response;
                
                // Use authenticated endpoint for super moderators, public endpoint for everyone else
                if (this.user?.is_super_moderator && Auth.getToken()) {
                    response = await fetch(`${API_URL}/api/theme`, {
                        headers: {
                            'Authorization': `Bearer ${Auth.getToken()}`
                        }
                    });
                } else {
                    // Use public endpoint that doesn't require authentication
                    response = await fetch(`${API_URL}/api/theme/public`);
                }
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.preset) {
                        // Site has a saved preset preference
                        this.selectedPreset = data.preset;
                        if (data.preset === 'default') {
                            // Request theme from parent for auto-matching
                            window.parent.postMessage({ type: 'requestTheme' }, '*');
                        } else if (data.colors) {
                            // Use saved colors for non-default presets
                            this.themeColors = data.colors;
                            this.injectThemeStyles();
                        }
                    } else if (data.colors && !data.preset) {
                        // Site has custom colors but no preset (legacy)
                        this.selectedPreset = 'custom';
                        this.themeColors = data.colors;
                        this.injectThemeStyles();
                    }
                }
            } catch (error) {
                console.error('Error loading theme:', error);
            } finally {
                this.loadingTheme = false;
                this.themeLoaded = true;
            }
        },
        
        // Update a theme color
        updateThemeColor(category, key, value) {
            // Validate hex color
            if (!/^#[0-9A-F]{6}$/i.test(value)) return;
            
            // Store the last change for undo
            this.lastColorChange = {
                category: category,
                key: key,
                oldValue: this.themeColors[category][key],
                newValue: value
            };
            
            this.themeColors[category][key] = value;
            this.injectThemeStyles();
        },
        
        // Apply a preset theme
        applyPreset(presetName) {
            const preset = this.themePresets[presetName];
            if (preset) {
                this.selectedPreset = presetName;
                if (presetName === 'default') {
                    // Request theme from parent for auto-matching
                    window.parent.postMessage({ type: 'requestTheme' }, '*');
                } else if (preset.colors) {
                    this.themeColors = JSON.parse(JSON.stringify(preset.colors));
                    this.injectThemeStyles();
                }
            }
        },
        
        // Inject theme styles into the page
        injectThemeStyles() {
            let styleEl = document.getElementById('custom-theme-styles');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'custom-theme-styles';
                document.head.appendChild(styleEl);
            }
            
            let css = ':root {\n';
            
            // Generate CSS variables from theme colors
            Object.entries(this.themeColors).forEach(([category, colors]) => {
                Object.entries(colors).forEach(([key, value]) => {
                    css += `  --color-${category}-${key}: ${value};\n`;
                });
            });
            
            css += '}';
            styleEl.textContent = css;
        },
        
        // Save theme to backend
        async saveTheme() {
            this.loadingTheme = true;
            try {
                const response = await fetch(`${API_URL}/api/theme`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Auth.getToken()}`
                    },
                    body: JSON.stringify({
                        colors: this.themeColors,
                        preset: this.selectedPreset
                    })
                });
                
                if (response.ok) {
                    alert('Theme saved successfully!');
                } else {
                    throw new Error('Failed to save theme');
                }
            } catch (error) {
                console.error('Error saving theme:', error);
                alert('Failed to save theme');
            } finally {
                this.loadingTheme = false;
            }
        },
        
        // Reset theme to defaults
        resetTheme() {
            if (confirm('Reset to default theme (auto-match parent site)?')) {
                this.selectedPreset = 'default';
                // Clear any custom colors
                this.themeColors = null;
                // The parent theme will be reapplied via message
                window.parent.postMessage({ type: 'requestTheme' }, '*');
            }
        },
        
        // Export theme as JSON
        exportTheme() {
            const exportData = {
                name: 'Custom Theme',
                exportDate: new Date().toISOString(),
                colors: this.themeColors
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `theme-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },
        
        // Import theme from file
        importTheme() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        if (data.colors) {
                            this.themeColors = data.colors;
                            this.injectThemeStyles();
                            alert('Theme imported successfully!');
                        }
                    } catch (error) {
                        console.error('Import error:', error);
                        alert('Failed to import theme');
                    }
                }
            };
            input.click();
        },
        
        // Helper to format color labels
        formatColorLabel(key) {
            return key.replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase());
        },
        
        // Pick color from screen using EyeDropper API
        async pickColorFromScreen(category, key) {
            if (!window.EyeDropper) return;
            
            try {
                const eyeDropper = new window.EyeDropper();
                const result = await eyeDropper.open();
                const hexColor = result.sRGBHex;
                
                // Apply the picked color
                this.updateThemeColor(category, key, hexColor);
            } catch (e) {
                // User canceled the eyedropper
                console.log('EyeDropper canceled');
            }
        },
        
        // Undo last color change
        undoLastChange() {
            if (!this.lastColorChange) return;
            
            const { category, key, oldValue, newValue } = this.lastColorChange;
            
            // Swap old and new values
            this.themeColors[category][key] = oldValue;
            this.lastColorChange = {
                category: category,
                key: key,
                oldValue: newValue,
                newValue: oldValue
            };
            
            this.injectThemeStyles();
        },
        
        // Handle theme data from parent window
        handleParentTheme(parentTheme) {
            // Only apply parent theme if using "default" preset
            if (this.selectedPreset === 'default' && !this.showThemeEditor) {
                // Store the detected theme
                this.themePresets.default.colors = {
                    primary: parentTheme.primary || this.getDefaultColors().primary,
                    backgrounds: parentTheme.backgrounds || this.getDefaultColors().backgrounds,
                    text: parentTheme.text || this.getDefaultColors().text,
                    status: this.getDefaultColors().status, // Keep our status colors
                    borders: parentTheme.borders || this.getDefaultColors().borders
                };
                
                // Apply the detected theme
                this.themeColors = this.themePresets.default.colors;
                this.injectThemeStyles();
            }
        },
        
        // Get default colors (light theme)
        getDefaultColors() {
            return {
                primary: {
                    main: '#3b82f6',
                    hover: '#2563eb',
                    light: '#dbeafe'
                },
                backgrounds: {
                    main: '#ffffff',
                    secondary: '#f3f4f6',
                    hover: '#f9fafb'
                },
                text: {
                    primary: '#111827',
                    secondary: '#6b7280',
                    muted: '#9ca3af',
                    inverse: '#ffffff'
                },
                status: {
                    success: '#10b981',
                    warning: '#f59e0b',
                    error: '#ef4444'
                },
                borders: {
                    light: '#e5e7eb',
                    medium: '#d1d5db'
                }
            };
        },
        
        // Analytics methods
        async loadAnalyticsData() {
            this.analyticsLoading = true;
            try {
                // For 90-day view, just load single period
                if (this.analyticsTimeframe === 'quarter') {
                    const params = new URLSearchParams({
                        period: 'quarter',
                        index: 0
                    });
                    
                    const response = await fetch(`${API_URL}/api/analytics/activity-data?${params}`, {
                        headers: getAuthHeaders()
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        this.bubbleChartData = data;
                        this.$nextTick(() => {
                            setTimeout(() => {
                                this.renderBubbleChart();
                            }, 50);
                        });
                    }
                } else {
                    // For day/week/month, load period summary for bar chart
                    await this.loadPeriodSummary();
                    
                    // Load data for selected period or most recent
                    const targetDate = this.selectedPeriodDate || (this.periodSummaryData && this.periodSummaryData[this.periodSummaryData.length - 1]?.date);
                    if (targetDate) {
                        await this.loadAnalyticsForDate(targetDate);
                    } else {
                        // No data available yet, render empty bar chart
                        this.$nextTick(() => {
                            this.renderBarChart();
                        });
                    }
                }
            } catch (error) {
                console.error('Error loading analytics:', error);
                this.showNotification('Failed to load analytics data', 'error');
            } finally {
                this.analyticsLoading = false;
            }
        },
        
        async loadPeriodSummary() {
            const count = this.analyticsTimeframe === 'day' ? 24 : 
                         this.analyticsTimeframe === 'week' ? 12 : 3;
            
            console.log(`Loading period summary for ${this.analyticsTimeframe}, count: ${count}`);
            
            const response = await fetch(`${API_URL}/api/analytics/period-summary?period=${this.analyticsTimeframe}&count=${count}`, {
                headers: getAuthHeaders()
            });
            
            const data = await response.json();
            console.log('Period summary response:', data);
            
            if (data.success) {
                this.periodSummaryData = data.data;
                console.log('Period summary data set:', this.periodSummaryData);
                
                // Log first few entries to see the structure
                if (this.periodSummaryData && this.periodSummaryData.length > 0) {
                    console.log('First entry:', JSON.stringify(this.periodSummaryData[0]));
                    console.log('Last entry:', JSON.stringify(this.periodSummaryData[this.periodSummaryData.length - 1]));
                    // Find entries with non-zero totalComments
                    const nonZeroEntries = this.periodSummaryData.filter(d => d.totalComments > 0);
                    console.log('Entries with comments:', nonZeroEntries.length, 'out of', this.periodSummaryData.length);
                    if (nonZeroEntries.length > 0) {
                        console.log('First non-zero entry:', JSON.stringify(nonZeroEntries[0]));
                    }
                }
                
                this.$nextTick(() => {
                    // Ensure DOM is ready and visible
                    setTimeout(() => {
                        this.renderBarChart();
                    }, 100);
                });
            } else {
                console.error('Failed to load period summary:', data.error);
            }
        },
        
        async loadAnalyticsForDate(date) {
            try {
                console.log('loadAnalyticsForDate called with date:', date);
                
                // Calculate index based on date
                // Use the most recent date from periodSummaryData as reference
                const referenceDate = this.periodSummaryData && this.periodSummaryData.length > 0 
                    ? new Date(this.periodSummaryData[this.periodSummaryData.length - 1].date)
                    : new Date();
                referenceDate.setDate(referenceDate.getDate() + 1); // Add one day since we want "yesterday" to be index 0
                
                const targetDate = new Date(date);
                const daysDiff = Math.floor((referenceDate - targetDate) / (1000 * 60 * 60 * 24));
                
                let index = 0;
                if (this.analyticsTimeframe === 'day') {
                    index = daysDiff - 1;
                } else if (this.analyticsTimeframe === 'week') {
                    index = Math.floor(daysDiff / 7);
                } else if (this.analyticsTimeframe === 'month') {
                    index = Math.floor(daysDiff / 30);
                }
                
                console.log(`Loading data for date: ${date}, calculated index: ${index}`);
                
                const params = new URLSearchParams({
                    period: this.analyticsTimeframe,
                    index: Math.max(0, index)
                });
                
                console.log('Fetching analytics with params:', params.toString());
                
                const response = await fetch(`${API_URL}/api/analytics/activity-data?${params}`, {
                    headers: getAuthHeaders()
                });
                
                const data = await response.json();
                console.log('Analytics data received:', data);
                
                if (data.success) {
                    console.log('Setting bubbleChartData:', data);
                    console.log('Setting selectedPeriodDate:', date);
                    this.bubbleChartData = data;
                    this.selectedPeriodDate = date;
                    
                    // Force Alpine.js to update the UI
                    this.$nextTick(() => {
                        console.log('Next tick - rendering bubble chart');
                        console.log('Current selectedPeriodDate:', this.selectedPeriodDate);
                        setTimeout(() => {
                            this.renderBubbleChart();
                        }, 50);
                    });
                } else {
                    console.error('Failed to load analytics data:', data.error);
                }
            } catch (error) {
                console.error('Error in loadAnalyticsForDate:', error);
            }
        },
        
        renderBubbleChart() {
            console.log('=== renderBubbleChart called ===');
            console.log('bubbleChartData:', this.bubbleChartData);
            
            const container = document.getElementById('bubble-chart-container');
            if (!container || !this.bubbleChartData) {
                console.log('Cannot render bubble chart - container:', !!container, 'data:', !!this.bubbleChartData);
                return;
            }
            
            // Clear existing chart
            d3.select(container).selectAll('*').remove();
            
            // Make responsive dimensions
            const containerRect = container.getBoundingClientRect();
            const width = containerRect.width || container.clientWidth || window.innerWidth * 0.9;
            const height = Math.min(600, window.innerHeight * 0.5); // 50% of viewport height, max 600px
            const padding = 2;
            
            // If container has no width, wait and retry
            if (width === 0) {
                setTimeout(() => this.renderBubbleChart(), 100);
                return;
            }
            
            const svg = d3.select(container)
                .append('svg')
                .attr('width', '100%')
                .attr('height', '100%')
                .attr('viewBox', `0 0 ${width} ${height}`)
                .attr('preserveAspectRatio', 'xMidYMid meet')
                .attr('id', 'bubble-chart-svg');
            
            const data = this.bubbleChartData.pages || [];
            
            // Check if we have valid data
            if (data.length === 0) {
                container.innerHTML = '<div class="text-center text-secondary p-4">No data available for this period</div>';
                return;
            }
            
            const maxCount = d3.max(data, d => d.commentCount) || 1;
            
            const radiusScale = d3.scaleSqrt()
                .domain([0, maxCount])
                .range([5, 50]);
            
            const colorScale = d3.scaleThreshold()
                .domain([0.1, 0.3, 0.5, 0.8].map(d => d * maxCount))
                .range(['var(--color-primary)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--color-danger)']);
            
            const nodes = data.map(d => ({
                ...d,
                radius: radiusScale(d.commentCount),
                x: width / 2,
                y: height / 2
            }));
            
            const simulation = d3.forceSimulation(nodes)
                .force('charge', d3.forceManyBody().strength(5))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(d => d.radius + padding));
            
            const bubbles = svg.selectAll('.bubble')
                .data(nodes)
                .enter()
                .append('g')
                .attr('class', 'bubble');
            
            bubbles.append('circle')
                .attr('r', d => d.radius)
                .style('fill', d => colorScale(d.commentCount))
                .style('stroke', 'var(--color-background)')
                .style('stroke-width', '2px')
                .style('cursor', 'pointer')
                .style('transition', 'all 0.2s ease')
                .on('mouseenter', function(event, d) {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('r', d.radius * 1.2);
                    
                    // Show tooltip
                    const tooltip = d3.select('body').append('div')
                        .attr('class', 'bubble-tooltip')
                        .style('opacity', 0);
                    
                    tooltip.transition()
                        .duration(200)
                        .style('opacity', .9);
                    
                    tooltip.html(`
                        <strong>${d.pageName}</strong><br/>
                        Comments: ${d.commentCount}<br/>
                        <small>Click to view</small>
                    `)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 28) + 'px');
                })
                .on('mouseleave', function(event, d) {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .attr('r', d.radius);
                    
                    d3.selectAll('.bubble-tooltip').remove();
                })
                .on('click', (event, d) => {
                    window.open(d.url, '_blank');
                });
            
            bubbles.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '.3em')
                .style('fill', 'var(--color-background)')
                .style('font-size', '12px')
                .style('font-weight', 'bold')
                .style('pointer-events', 'none')
                .text(d => d.commentCount);
            
            simulation.on('tick', () => {
                bubbles.attr('transform', d => `translate(${d.x},${d.y})`);
            });
        },
        
        renderBarChart() {
            console.log('=== renderBarChart called ===');
            console.log('Period summary data:', this.periodSummaryData);
            
            const container = document.getElementById('bar-chart-container');
            if (!container) {
                console.log('Bar chart container not found');
                return;
            }
            
            // Clear existing chart
            d3.select(container).selectAll('*').remove();
            
            
            // If no data, show empty state
            if (!this.periodSummaryData || this.periodSummaryData.length === 0) {
                const svg = d3.select(container)
                    .append('svg')
                    .attr('width', container.clientWidth)
                    .attr('height', 60);
                
                svg.append('text')
                    .attr('x', container.clientWidth / 2)
                    .attr('y', 30)
                    .attr('text-anchor', 'middle')
                    .style('font-size', '12px')
                    .style('fill', 'var(--color-text-muted)')
                    .text('Loading data...');
                return;
            }
            
            const margin = { top: 5, right: 10, bottom: 25, left: 10 };
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width || container.clientWidth || window.innerWidth * 0.9;
            const totalHeight = 60;
            const width = totalWidth - margin.left - margin.right;
            const height = totalHeight - margin.top - margin.bottom;
            
            const svg = d3.select(container)
                .append('svg')
                .attr('width', '100%')
                .attr('height', totalHeight)
                .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
                .attr('preserveAspectRatio', 'xMidYMid meet');
            
            const g = svg.append('g')
                .attr('transform', `translate(${margin.left},${margin.top})`);
            
            // Keep data in original order (oldest to newest)
            const reversedData = [...this.periodSummaryData];
            
            // Scales
            const xScale = d3.scaleBand()
                .domain(reversedData.map(d => d.date))
                .range([0, width])
                .padding(0.2);
            
            // Normalize heights to always reach max
            const maxComments = d3.max(this.periodSummaryData, d => d.totalComments) || 1;
            console.log('Max comments in period summary:', maxComments);
            console.log('Sample data:', this.periodSummaryData.slice(0, 3));
            const yScale = d3.scaleLinear()
                .domain([0, maxComments])
                .range([height, 0]);
            
            // X axis with minimal ticks
            const tickInterval = Math.ceil(reversedData.length / 8); // Show ~8 labels max
            const xAxis = g.append('g')
                .attr('transform', `translate(0,${height})`)
                .attr('class', 'axis')
                .call(d3.axisBottom(xScale)
                    .tickValues(reversedData.filter((d, i) => i % tickInterval === 0).map(d => d.date))
                    .tickFormat(d => {
                        const endDate = new Date(d);
                        if (this.analyticsTimeframe === 'day') {
                            return endDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                        } else if (this.analyticsTimeframe === 'week') {
                            // Show range for 7-day period
                            const startDate = new Date(endDate);
                            startDate.setDate(startDate.getDate() - 6);
                            return `${startDate.getMonth() + 1}/${startDate.getDate()}-${endDate.getMonth() + 1}/${endDate.getDate()}`;
                        } else {
                            // Show range for 30-day period
                            const startDate = new Date(endDate);
                            startDate.setDate(startDate.getDate() - 29);
                            return `${startDate.getMonth() + 1}/${startDate.getDate()}-${endDate.getMonth() + 1}/${endDate.getDate()}`;
                        }
                    })
                    .tickSize(3));
            
            // Remove domain line
            xAxis.select('.domain').remove();
            
            // Debug bar data
            console.log('Drawing bars with data:', reversedData);
            reversedData.forEach(d => {
                console.log(`Date: ${d.date}, Comments: ${d.totalComments}, Y: ${yScale(d.totalComments)}, Height: ${height - yScale(d.totalComments)}`);
            });
            
            // Store reference to component instance
            const self = this;
            
            // Bars
            const bars = g.selectAll('.bar')
                .data(reversedData)
                .enter()
                .append('rect')
                .attr('class', d => `bar ${d.date === this.selectedPeriodDate ? 'selected' : ''}`)
                .attr('x', d => xScale(d.date))
                .attr('width', xScale.bandwidth())
                .attr('y', d => {
                    if (d.totalComments === 0) return height - 2; // Minimum 2px height
                    return yScale(d.totalComments);
                })
                .attr('height', d => {
                    if (d.totalComments === 0) return 2; // Minimum 2px height
                    return height - yScale(d.totalComments);
                })
                .style('cursor', 'pointer')  // Always show pointer since totalComments might be wrong
                .style('pointer-events', 'all')  // Ensure clicks are enabled
                .on('click', function(event, d) {
                    console.log('Bar click event triggered');
                    console.log('Data:', d);
                    console.log('Total comments:', d.totalComments);
                    
                    // Always allow clicking to see if there's data
                    // The totalComments field seems to be incorrectly showing 0
                    console.log('Bar clicked for date:', d.date);
                    console.log('Calling loadAnalyticsForDate...');
                    self.loadAnalyticsForDate(d.date);
                    // Update selected state
                    d3.selectAll('.bar').classed('selected', false);
                    d3.select(this).classed('selected', true);
                })
                .on('mouseenter', function(event, d) {
                    // Always show tooltip
                    const tooltip = d3.select('body').append('div')
                            .attr('class', 'bubble-tooltip')
                            .style('opacity', 0);
                        
                        tooltip.transition()
                            .duration(200)
                            .style('opacity', .9);
                        
                    const endDate = new Date(d.date);
                    let dateStr;
                    
                    if (self.analyticsTimeframe === 'day') {
                        dateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    } else if (self.analyticsTimeframe === 'week') {
                        const startDate = new Date(endDate);
                        startDate.setDate(startDate.getDate() - 6);
                        dateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                    } else {
                        const startDate = new Date(endDate);
                        startDate.setDate(startDate.getDate() - 29);
                        dateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                    }
                    
                    tooltip.html(`${dateStr}<br/>${d.totalComments} comments`)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 40) + 'px');
                })
                .on('mouseleave', function() {
                    d3.selectAll('.bubble-tooltip').remove();
                });
        },
        
        exportBubbleChart() {
            const svgElement = document.getElementById('bubble-chart-svg');
            if (!svgElement) return;
            
            const svgString = new XMLSerializer().serializeToString(svgElement);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = svgElement.clientWidth;
            canvas.height = svgElement.clientHeight;
            
            const img = new Image();
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            img.onload = () => {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob((blob) => {
                    const a = document.createElement('a');
                    const url = URL.createObjectURL(blob);
                    a.href = url;
                    a.download = `comment-activity-${new Date().toISOString().split('T')[0]}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                });
                
                URL.revokeObjectURL(url);
            };
            
            img.src = url;
        },

        async loadPagesData() {
            // Check if user is moderator
            if (!this.user || !this.user.is_moderator) {
                console.log('User is not a moderator, cannot load pages data');
                return;
            }
            
            this.pagesLoading = true;
            try {
                // Build request options with auth headers
                const options = {
                    credentials: 'include'
                };
                
                const sessionToken = localStorage.getItem('sessionToken');
                if (sessionToken) {
                    options.headers = getAuthHeaders();
                }
                
                // Use the new optimized endpoint for recent comments
                const params = new URLSearchParams({
                    limit: this.pagesCommentLimit
                });
                
                const url = `${API_URL}/api/pages/recent-comments?${params.toString()}`;
                const commentsResponse = await fetch(url, options);
                
                if (!commentsResponse.ok) {
                    throw new Error('Failed to fetch recent comments');
                }
                
                const allComments = await commentsResponse.json();
                
                // IMPORTANT: Normalize field names from snake_case to camelCase
                // The API returns snake_case but renderComment expects camelCase
                allComments.forEach(comment => {
                    // Normalize field names
                    comment.userName = comment.user_name;
                    comment.userPicture = comment.user_picture;
                    comment.createdAt = comment.created_at;
                    comment.updatedAt = comment.updated_at;
                    comment.parentId = comment.parent_id;
                    comment.pageId = comment.page_id;
                    comment.userId = comment.user_id;
                    comment.userVote = comment.user_vote || null;
                });
                
                // Build comment trees maintaining parent-child relationships
                const commentMap = new Map();
                const rootComments = [];
                
                // First pass: create map of all comments
                allComments.forEach(comment => {
                    comment.children = [];
                    commentMap.set(comment.id, comment);
                });
                
                // Second pass: build tree structure
                allComments.forEach(comment => {
                    if (comment.parent_id) {
                        const parent = commentMap.get(comment.parent_id);
                        if (parent) {
                            parent.children.push(comment);
                        } else {
                            // Parent not in the fetched set, treat as root
                            rootComments.push(comment);
                        }
                    } else {
                        rootComments.push(comment);
                    }
                });
                
                // Group comments by page
                const pageGroups = new Map();
                
                rootComments.forEach(comment => {
                    const pageId = comment.page_id;
                    if (!pageGroups.has(pageId)) {
                        pageGroups.set(pageId, {
                            pageId: pageId,
                            comments: [],
                            totalCount: 0
                        });
                    }
                    pageGroups.get(pageId).comments.push(comment);
                });
                
                // Count total comments including children for each page
                pageGroups.forEach(page => {
                    page.totalCount = page.comments.reduce((count, comment) => {
                        return count + 1 + this.countChildComments(comment);
                    }, 0);
                });
                
                // Convert to array and sort by total comment count
                this.pagesData = Array.from(pageGroups.values())
                    .sort((a, b) => b.totalCount - a.totalCount)
                    .map(page => ({
                        ...page,
                        commentCount: page.totalCount
                    }));
                    
                // IMPORTANT: Store page comments in a searchable structure for updates
                // This allows vote/delete/report updates to work properly
                this.pagesComments = allComments;
                    
            } catch (error) {
                console.error('Error loading pages data:', error);
                alert('Failed to load pages data');
            } finally {
                this.pagesLoading = false;
            }
        },

        // Helper function to count nested comments
        countChildComments(comment) {
            let count = comment.children.length;
            comment.children.forEach(child => {
                count += this.countChildComments(child);
            });
            return count;
        },

        renderPageComments(comments) {
            if (!comments || comments.length === 0) {
                return '<p class="text-gray-500">No comments in this page.</p>';
            }
            
            // Render comments using the existing comment rendering logic with 'pages' context
            // This ensures all interactions work correctly by using unique IDs for pages tab
            return comments.map(comment => this.renderComment(comment, 0, 'pages')).join('');
        },

        // Helper function to rebuild pages data after updates
        rebuildPagesData() {
            // Build comment trees maintaining parent-child relationships
            const commentMap = new Map();
            const rootComments = [];
            
            // Reset children arrays
            this.pagesComments.forEach(comment => {
                comment.children = [];
                commentMap.set(comment.id, comment);
            });
            
            // Build tree structure
            this.pagesComments.forEach(comment => {
                if (comment.parent_id) {
                    const parent = commentMap.get(comment.parent_id);
                    if (parent) {
                        parent.children.push(comment);
                    } else {
                        rootComments.push(comment);
                    }
                } else {
                    rootComments.push(comment);
                }
            });
            
            // Group comments by page
            const pageGroups = new Map();
            
            rootComments.forEach(comment => {
                const pageId = comment.page_id;
                if (!pageGroups.has(pageId)) {
                    pageGroups.set(pageId, {
                        pageId: pageId,
                        comments: [],
                        totalCount: 0
                    });
                }
                pageGroups.get(pageId).comments.push(comment);
            });
            
            // Count total comments including children for each page
            pageGroups.forEach(page => {
                page.totalCount = page.comments.reduce((count, comment) => {
                    return count + 1 + this.countChildComments(comment);
                }, 0);
            });
            
            // Convert to array and sort by total comment count
            this.pagesData = Array.from(pageGroups.values())
                .sort((a, b) => b.totalCount - a.totalCount)
                .map(page => ({
                    ...page,
                    commentCount: page.totalCount
                }));
        }
    };
}