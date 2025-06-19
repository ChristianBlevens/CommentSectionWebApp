// Application state management
const AppState = {
    // Initialize default state
    getInitialState() {
        return {
            // Core data
            user: null,
            comments: [],
            sortedComments: [],
            filteredComments: [],
            loading: true,
            pageId: new URLSearchParams(window.location.search).get('pageId') || 'default',
            
            // Comment interaction
            newCommentText: '',
            commentPreview: '',
            replyingTo: null,
            editingComment: null,
            editText: '',
            sortBy: 'likes',
            focusedCommentId: null,
            focusedComments: [],
            highlightedCommentId: null,
            commentVotes: {},
            
            // Search
            commentSearchQuery: '',
            searchMode: 'and',
            
            // UI state
            forceRerender: false,
            activeTab: 'comments',
            
            // Mention dropdown
            mentionDropdown: {
                show: false,
                users: [],
                selectedIndex: -1,
                searchTerm: '',
                mentionStart: 0
            },
            
            // Reports
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
            
            // Users
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
            userCommentsDisplayCount: {},
            
            // Notifications
            showBanDropdown: null,
            banNotification: { show: false, message: '', expired: false },
            warningNotification: { show: false, message: '' },
            
            // Moderation logs
            moderationLogs: [],
            moderators: [],
            selectedModeratorId: 'all',
            loadingLogs: false,
            logsLoaded: false,
            
            // Theme editor
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
                    main: '#e5e7eb',
                    focus: '#3b82f6'
                },
                accents: {
                    success: '#10b981',
                    warning: '#f59e0b',
                    error: '#ef4444',
                    info: '#3b82f6'
                }
            },
            themeInitialized: false,
            originalTheme: null,
            
            // Analytics
            analytics: null,
            selectedTimeframe: '24h',
            analyticsLoading: false,
            selectedPage: null,
            selectedDate: null,
            analyticsTimeframe: 'day',
            analyticsDateIndex: 0,
            selectedPeriodDate: null,
            analyticsTab: false,
            bubbleChartData: null,
            
            // Theme
            themeLoaded: false,
            selectedPreset: null,
            lastColorChange: null,
            loadingTheme: false
        };
    },
    
    // State update helpers
    updateState(state, updates) {
        return Object.assign(state, updates);
    },
    
    // Reset specific state sections
    resetCommentForm(state) {
        state.newCommentText = '';
        state.commentPreview = '';
        state.replyingTo = null;
        state.editingComment = null;
        state.editText = '';
    },
    
    resetMentionDropdown(state) {
        state.mentionDropdown = {
            show: false,
            users: [],
            selectedIndex: -1,
            searchTerm: '',
            mentionStart: 0
        };
    },
    
    // Get user from state or localStorage
    getCurrentUser(state) {
        if (state.user) return state.user;
        
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                return JSON.parse(savedUser);
            } catch (e) {
                return null;
            }
        }
        return null;
    },
    
    // Check if user has permission
    hasPermission(state, permission) {
        const user = this.getCurrentUser(state);
        if (!user) return false;
        
        switch (permission) {
            case 'moderate':
                return user.is_moderator || user.is_super_moderator;
            case 'super_moderate':
                return user.is_super_moderator;
            case 'comment':
                return !user.is_banned;
            default:
                return false;
        }
    }
};