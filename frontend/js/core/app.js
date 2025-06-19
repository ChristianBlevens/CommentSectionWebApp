// Main unified app Alpine.js component
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
        selectedPreset: 'light',
        selectedColorTarget: null,
        loadingTheme: false,
        themeLoaded: false,
        lastColorChange: null, // For undo functionality
        
        // Analytics state
        analyticsTab: false,
        bubbleChartData: null,
        analyticsTimeframe: 'day',
        analyticsDateIndex: 0,
        analyticsLoading: false,
        periodSummaryData: null,
        selectedPeriodDate: null,
        
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
            }
            
            // Fetch page comments
            await this.loadComments();
            
            // Get pending report count
            if (this.user?.is_moderator) {
                await this.loadReportCount();
            }
            
            // Setup markdown renderer
            if (window.initializeMarkdown) {
                window.initializeMarkdown();
            }
            
            // Initialize theme editor
            if (this.user?.is_super_moderator) {
                await this.initThemeEditor();
            }
            
            // Add resize handler for responsive charts
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    if (this.activeTab === 'analytics' && !this.analyticsLoading) {
                        // Redraw charts on resize
                        if (this.bubbleChartData) {
                            window.ChartRenderer.renderBubbleChart.call(this);
                        }
                        if (this.periodSummaryData && this.analyticsTimeframe !== 'quarter') {
                            window.ChartRenderer.renderPeriodSummary.call(this);
                        }
                    }
                }, 250);
            });
            
            // Setup iframe height communication
            if (window.parent !== window) {
                const sendHeightToParent = () => {
                    const height = document.documentElement.scrollHeight;
                    window.parent.postMessage({ type: 'setHeight', height: height }, '*');
                };
                
                // Send initial height
                sendHeightToParent();
                
                // Watch for changes
                const observer = new MutationObserver(sendHeightToParent);
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true
                });
                
                // Also send on resize
                window.addEventListener('resize', sendHeightToParent);
                
                // Listen for height requests
                window.addEventListener('message', (event) => {
                    if (event.data && (event.data.type === 'getHeight' || event.data.action === 'requestHeight')) {
                        sendHeightToParent();
                    }
                });
            }
            
            // Check for warnings if user is logged in
            if (this.user) {
                await this.checkWarnings();
            }
        },
        
        // Helper method to access general helpers
        getRelativeTime(dateString) {
            return window.GeneralHelpers.getRelativeTime(dateString);
        },
        
        // Helper method for markdown rendering
        renderMarkdown(text) {
            return window.MarkdownHelpers.renderMarkdown(text);
        },
        
        // Bind all methods from external modules
        ...window.AuthMethods,
        ...window.CommentManager,
        ...window.CommentInteractions,
        ...window.CommentRenderer,
        ...window.ReportsManager,
        ...window.UsersManager,
        ...window.LogsManager,
        ...window.ThemeEditor,
        ...window.AnalyticsManager
    };
}

// Make it globally available
window.unifiedApp = unifiedApp;