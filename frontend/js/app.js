// Initialize markdown helper
function initializeMarkdown() {
    if (!window.md) {
        window.md = MarkdownProcessor.createInstance();
    }
}

// Main application initialization
function unifiedApp() {
    return {
        // Initialize state
        ...AppState.getInitialState(),
        
        // Initialize app
        async init() {
            console.log('Initializing Comment Section App');
            
            // Initialize dropdowns
            Dropdowns.init();
            
            // Check existing session
            const existingUser = await Auth.checkExistingSession();
            if (existingUser) {
                this.user = existingUser;
            }
            
            // Initialize markdown
            if (!window.md) {
                window.md = MarkdownProcessor.createInstance();
            }
            
            // Load initial data
            await this.loadComments();
            
            // Load theme if super moderator
            if (AppState.hasPermission(this, 'super_moderate')) {
                await ThemeEditor.loadTheme(this);
            }
            
            // Setup iframe communication
            window.addEventListener('message', (event) => {
                if (event.data?.type === 'resize' && event.data.height) {
                    const newHeight = Math.min(event.data.height, window.innerHeight * 0.9);
                    this.$el.style.height = `${newHeight}px`;
                }
            });
            
            // Setup window resize handler
            const resizeHandler = DOMUtils.debounce(() => {
                if (this.analytics) {
                    Analytics.updateBubbleChart(this);
                    Analytics.updateBarChart(this);
                }
            }, 250);
            
            window.addEventListener('resize', resizeHandler);
            
            // Store instance for global access
            window.unifiedAppInstance = this;
        },
        
        // Authentication methods
        signIn() {
            Auth.signInWithDiscord();
        },
        
        async signOut() {
            await Auth.signOut();
            this.user = null;
            location.reload();
        },
        
        // Comment methods
        async loadComments() {
            await Comments.loadComments(this);
        },
        
        setSortBy(sortBy) {
            this.sortBy = sortBy;
            Comments.applySort(this);
            Comments.applySearch(this);
        },
        
        updateSearch() {
            Comments.applySearch(this);
        },
        
        async submitComment() {
            await Comments.createComment(this);
        },
        
        async saveEdit() {
            if (this.editingComment) {
                await Comments.updateComment(this, this.editingComment.id);
            }
        },
        
        async deleteComment(commentId) {
            await Comments.deleteComment(this, commentId);
        },
        
        async voteComment(commentId, voteType) {
            await Comments.voteComment(this, commentId, voteType);
        },
        
        startReply(parentId) {
            this.replyingTo = parentId;
            this.$nextTick(() => {
                const textarea = this.$refs.commentTextarea;
                if (textarea) textarea.focus();
            });
        },
        
        cancelReply() {
            this.replyingTo = null;
            this.newCommentText = '';
            this.commentPreview = '';
        },
        
        startEdit(comment) {
            this.editingComment = comment;
            this.editText = comment.content;
        },
        
        cancelEdit() {
            this.editingComment = null;
            this.editText = '';
        },
        
        focusOnComment(commentId) {
            Comments.focusOnComment(this, commentId);
        },
        
        exitFocusMode() {
            Comments.exitFocusMode(this);
        },
        
        async reportComment(commentId) {
            await Comments.reportComment(this, commentId);
        },
        
        // Mention methods
        checkMention(event) {
            Mentions.checkForMention(this, event.target);
        },
        
        selectMention(user) {
            const textarea = this.$refs.commentTextarea;
            Mentions.selectMention(this, user, textarea);
            this.updatePreview();
        },
        
        handleKeydown(event) {
            if (Mentions.handleMentionKeyboard(this, event, event.target)) {
                return;
            }
            
            // Handle Ctrl+Enter to submit
            if (event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                this.submitComment();
            }
        },
        
        // Markdown methods
        updatePreview() {
            if (this.newCommentText) {
                const processed = MarkdownProcessor.preprocessMarkdown(this.newCommentText);
                this.commentPreview = window.md.render(processed);
                
                this.$nextTick(() => {
                    DOMUtils.attachSpoilerHandlers();
                });
            } else {
                this.commentPreview = '';
            }
        },
        
        insertMarkdown(before, after) {
            const textarea = this.$refs.commentTextarea;
            MarkdownProcessor.insertMarkdown(textarea, before, after, () => this.updatePreview());
        },
        
        // Moderation methods
        async loadReports() {
            await Moderation.loadReports(this);
        },
        
        filterReports() {
            Moderation.filterReports(this);
        },
        
        selectReportsPage(page) {
            this.selectedReportsPage = page;
            this.showPageDropdown = false;
            this.filterReports();
        },
        
        async resolveReport(reportId, action, commentContent) {
            await Moderation.resolveReport(this, reportId, action, commentContent);
        },
        
        async loadUsers() {
            await Moderation.loadUsers(this);
        },
        
        filterUsers() {
            this.currentUserPage = 1;
            Moderation.filterUsers(this);
        },
        
        changePage(direction) {
            if (direction === 'prev' && this.currentUserPage > 1) {
                this.currentUserPage--;
            } else if (direction === 'next' && this.currentUserPage < this.totalUserPages) {
                this.currentUserPage++;
            }
            Moderation.filterUsers(this);
        },
        
        toggleUser(userId) {
            Moderation.toggleUserExpansion(this, userId);
        },
        
        showMoreComments(userId) {
            Moderation.showMoreUserComments(this, userId);
        },
        
        async banUser(userId, userName, duration) {
            await Moderation.banUser(this, userId, userName, duration);
        },
        
        async unbanUser(userId) {
            await Moderation.unbanUser(this, userId);
        },
        
        async warnUser(userId, userName) {
            await Moderation.warnUser(this, userId, userName);
        },
        
        async toggleModerator(userId) {
            await Moderation.toggleModerator(this, userId);
        },
        
        async loadModerationLogs() {
            await Moderation.loadModerationLogs(this);
        },
        
        getFilteredLogs() {
            return Moderation.getFilteredLogs(this);
        },
        
        // Theme methods
        applyPreset(presetName) {
            ThemeEditor.applyPreset(this, presetName);
        },
        
        updateColor(category, key, value) {
            ThemeEditor.updateColor(this, category, key, value);
        },
        
        async saveTheme() {
            await ThemeEditor.saveTheme(this);
        },
        
        resetTheme() {
            ThemeEditor.resetTheme(this);
        },
        
        exportTheme() {
            ThemeEditor.exportTheme(this);
        },
        
        importTheme(event) {
            const file = event.target.files[0];
            if (file) {
                ThemeEditor.importTheme(this, file);
            }
        },
        
        async pickColor(category, key) {
            await ThemeEditor.pickColor(this, category, key);
        },
        
        // Analytics methods
        async loadAnalytics(timeframe) {
            await Analytics.loadAnalytics(this, timeframe);
        },
        
        exportChart(chartId) {
            Analytics.exportChart(chartId);
        },
        
        // Dropdown methods
        toggleBanDropdown(reportId, event) {
            Dropdowns.toggleBanDropdown(this, reportId, event);
        },
        
        togglePageDropdown(event) {
            Dropdowns.togglePageDropdown(this, event);
        },
        
        // Utility methods
        getRelativeTime(dateString) {
            return Utils.getRelativeTime(dateString);
        },
        
        // Ban methods
        async banUserWithDuration(userId, userName, duration) {
            await Moderation.banUserWithDuration(this, userId, userName, duration);
        },
        
        showCustomBanInput(userId, userName) {
            await Moderation.showCustomBanInput(this, userId, userName);
        },
        
        // Additional methods required by HTML
        signInWithDiscord() {
            Auth.signInWithDiscord();
        },
        
        sortComments() {
            Comments.applySort(this);
            Comments.applySearch(this);
        },
        
        filterComments() {
            Comments.applySearch(this);
        },
        
        renderComment(comment, level = 0) {
            return Comments.renderComment(comment, this, level);
        },
        
        handleCommentInput() {
            this.checkMention({ target: this.$refs.commentTextarea });
        },
        
        handleMentionKeydown(event) {
            this.handleKeydown(event);
        },
        
        insertMention(user) {
            this.selectMention(user);
        },
        
        insertImage() {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdown('![', `](${url})`);
            }
        },
        
        insertVideo() {
            const url = prompt('Enter YouTube or Vimeo URL:');
            if (url) {
                this.insertMarkdown('!video[', `](${url})`);
            }
        },
        
        toggleSearchMode() {
            const modes = ['and', 'or', 'not'];
            const currentIndex = modes.indexOf(this.searchMode);
            this.searchMode = modes[(currentIndex + 1) % modes.length];
            this.filterComments();
        },
        
        getSearchModeIcon() {
            switch(this.searchMode) {
                case 'and': return 'AND';
                case 'or': return 'OR';
                case 'not': return 'NOT';
                default: return 'AND';
            }
        },
        
        // Placeholder methods that need implementation
        acknowledgeWarning() {
            this.warningNotification.show = false;
        },
        
        jumpToComment(commentId) {
            this.focusOnComment(commentId);
            DOMUtils.scrollToElement(`comment-${commentId}`);
        },
        
        deleteReportedComment(report) {
            this.resolveReport(report.id, 'delete', report.content);
        },
        
        dismissReport(reportId) {
            this.resolveReport(reportId, 'dismiss', '');
        },
        
        toggleUserExpanded(userId) {
            this.toggleUser(userId);
        },
        
        getDisplayedComments(user) {
            const count = this.userCommentsDisplayCount[user.id] || 5;
            return (user.comments || []).slice(0, count);
        },
        
        shouldShowLoadMoreButton(user) {
            const displayCount = this.userCommentsDisplayCount[user.id] || 5;
            return user.comments && user.comments.length > displayCount;
        },
        
        loadMoreUserComments(userId) {
            this.showMoreComments(userId);
        },
        
        getDisplayedWarnings(user) {
            return user.warnings || [];
        },
        
        deleteUserComment(commentId) {
            this.deleteComment(commentId);
        },
        
        formatActionType(actionType) {
            const formatted = actionType.replace(/_/g, ' ');
            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        },
        
        // Theme editor methods
        formatColorLabel(key) {
            return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        },
        
        updateThemeColor(category, key, value) {
            this.updateColor(category, key, value);
        },
        
        pickColorFromScreen(category, key) {
            this.pickColor(category, key);
        },
        
        undoLastChange() {
            // TODO: Implement undo functionality
            console.log('Undo not implemented yet');
        },
        
        // Analytics methods
        loadAnalyticsData() {
            this.loadAnalytics(this.selectedTimeframe);
        },
        
        exportBubbleChart() {
            this.exportChart('bubble-chart-container');
        },
        
        // Theme presets
        themePresets: ThemeEditor.presets
    };
}

// Global references for compatibility
window.unifiedApp = unifiedApp;

// Initialize markdown
initializeMarkdown();

// Setup OAuth listener
Auth.setupOAuthListener((user, data) => {
    if (window.unifiedAppInstance) {
        window.unifiedAppInstance.user = user;
        window.unifiedAppInstance.loadComments();
    }
});