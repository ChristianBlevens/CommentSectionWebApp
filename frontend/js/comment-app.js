// Comment App - Main comment system functionality
function commentApp() {
    // Ensure components are initialized
    if (!window.reportCard && window.ReportCard) {
        window.reportCard = new ReportCard();
    }
    if (!window.commentRenderer && window.CommentRenderer) {
        window.commentRenderer = new CommentRenderer();
    }
    
    return {
        // State
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

        async init() {
            // Set global instance for event handlers
            window.commentAppInstance = this;
            
            // Get page ID
            this.pageId = this.getPageId();
            
            // Initialize markdown
            this.md = MarkdownProcessor.createInstance();
            
            // Check session
            this.user = await Auth.checkExistingSession();
            if (this.user) {
                await this.checkBanStatus();
                await this.checkForWarnings();
            }
            
            // Load comments
            await this.loadComments();
            
            // Load reports if moderator
            if (this.user?.is_moderator) {
                await this.loadPageReports();
            }
            
            // Handle URL hash
            this.handleInitialHash();
            
            // Setup event listeners
            this.setupEventListeners();
        },

        setupEventListeners() {
            // OAuth listener
            Auth.setupOAuthListener(async (user, data) => {
                this.user = user;
                
                // Check for ban info
                if (user.ban_info) {
                    this.showBanNotification(user.ban_info);
                } else if (user.ban_expired) {
                    this.showBanExpiredNotification();
                }
                
                await this.loadComments();
                if (user.is_moderator) {
                    await this.loadPageReports();
                }
                
                // Check for warnings
                await this.checkForWarnings();
            });
            
            // Close dropdowns when clicking outside
            document.addEventListener('click', (event) => {
                if (!event.target.closest('.comment-options-btn') && !event.target.closest('.comment-dropdown')) {
                    document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
                        dropdown.classList.remove('show');
                    });
                }
            });
            
            // Hash change listener
            window.addEventListener('hashchange', () => {
                const hash = window.location.hash;
                if (hash && hash.startsWith('#comment-')) {
                    const commentId = hash.substring(9);
                    this.focusOnComment(commentId);
                } else if (this.focusedCommentId || this.reportedCommentId) {
                    this.exitFocusMode();
                }
            });
        },

        handleInitialHash() {
            const hash = window.location.hash;
            if (hash && hash.startsWith('#comment-')) {
                const commentId = hash.substring(9);
                setTimeout(() => this.focusOnComment(commentId), 1000);
            }
        },

        getPageId() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('pageId') || window.PAGE_ID || 'default';
        },

        // Authentication methods
        signInWithDiscord() {
            Auth.signInWithDiscord();
        },

        async signOut() {
            await Auth.signOut(this.apiUrl);
            this.user = null;
        },

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

        // Comment loading and tree building
        async loadComments() {
            try {
                const url = `${this.apiUrl}/comments/${this.pageId}${this.user ? `?userId=${this.user.id}` : ''}`;
                const sessionToken = localStorage.getItem('sessionToken');
                
                const headers = {};
                if (sessionToken) {
                    headers['Authorization'] = `Bearer ${sessionToken}`;
                }
                
                const response = await fetch(url, { headers });
                const data = await response.json();
                
                this.comments = data;
                this.buildCommentTree();
                this.sortComments();
                
                if (this.user?.is_moderator) {
                    await this.loadPageReports();
                }
            } catch (error) {
                console.error('Error loading comments:', error);
            } finally {
                this.loading = false;
            }
        },

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
            
            this.$nextTick(() => Utils.attachSpoilerHandlers());
        },

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

        // Comment submission
        async submitComment(parentId = null) {
            if (!this.user) {
                alert('Please sign in to comment');
                return;
            }
            
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

        // Comment actions
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

        async deleteComment(commentId) {
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

        async reportComment(commentId) {
            document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
            
            if (!this.user) {
                alert('Please sign in to report comments');
                return;
            }
            
            const reason = prompt('Please provide a reason for reporting this comment:');
            if (!reason) return;
            
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

        // Edit functionality
        editComment(commentId) {
            // Placeholder for edit functionality
            console.log('Edit comment:', commentId);
            alert('Edit functionality coming soon!');
        },

        showReplyBox(commentId) {
            this.showReplyForm(commentId);
        },

        // Reply functionality
        showReplyForm(commentId) {
            if (!this.user) {
                alert('Please sign in to reply');
                return;
            }
            
            document.querySelectorAll('[id^="reply-form-"]').forEach(form => {
                form.style.display = 'none';
            });
            
            const replyForm = document.getElementById(`reply-form-${commentId}`);
            if (replyForm) {
                replyForm.style.display = 'block';
                const textarea = document.getElementById(`reply-textarea-${commentId}`);
                if (textarea) {
                    textarea.focus();
                }
            }
        },

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

        async submitReply(commentId) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (!textarea?.value.trim()) return;
            
            this.replyTexts[commentId] = textarea.value;
            await this.submitComment(commentId);
            this.cancelReply(commentId);
        },

        // Markdown editing
        updatePreview() {
            const processed = MarkdownProcessor.preprocessMarkdown(this.newCommentText);
            this.commentPreview = this.md.render(processed);
            this.$nextTick(() => Utils.attachSpoilerHandlers());
        },

        insertMarkdown(before, after) {
            const textarea = document.querySelector('textarea');
            this.newCommentText = MarkdownProcessor.insertMarkdown(
                textarea, 
                before, 
                after, 
                () => this.updatePreview()
            );
        },

        insertImage() {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdown(`![Image](${url})`, '');
            }
        },

        insertVideo() {
            const url = prompt('Enter video URL (YouTube or Vimeo):');
            if (url) {
                this.insertMarkdown(`!video[Video](${url})`, '');
            }
        },

        insertMarkdownForReply(commentId, before, after) {
            const textarea = document.getElementById(`reply-textarea-${commentId}`);
            if (!textarea) return;
            
            this.replyTexts[commentId] = MarkdownProcessor.insertMarkdown(
                textarea, 
                before, 
                after
            );
        },

        insertImageForReply(commentId) {
            const url = prompt('Enter image URL:');
            if (url) {
                this.insertMarkdownForReply(commentId, `![Image](${url})`, '');
            }
        },

        insertVideoForReply(commentId) {
            const url = prompt('Enter video URL (YouTube or Vimeo):');
            if (url) {
                this.insertMarkdownForReply(commentId, `!video[Video](${url})`, '');
            }
        },

        async jumpToComment(commentId) {
            const element = document.getElementById(`comment-${commentId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-comment');
                setTimeout(() => {
                    element.classList.remove('highlight-comment');
                }, 2000);
            }
        },

        // Focus mode
        viewReplies(commentId) {
            this.enterFocusMode(commentId);
        },

        enterFocusMode(commentId) {
            const comment = this.findComment(commentId, this.comments);
            if (!comment) return;
            
            this.focusedCommentId = commentId;
            this.focusedComments = [comment];
            
            history.replaceState(null, null, `#comment-${commentId}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        exitFocusMode() {
            this.focusedCommentId = null;
            this.focusedComments = [];
            this.reportedCommentId = null;
            
            history.pushState(null, null, window.location.pathname + window.location.search);
            this.loadComments();
        },

        async focusOnComment(commentId) {
            let comment = this.findComment(commentId, this.comments);
            
            if (!comment) {
                await this.loadParentThread(commentId);
                return;
            }
            
            const parentComment = this.findParentOfComment(commentId, this.comments);
            
            if (parentComment) {
                this.reportedCommentId = commentId;
                this.focusedCommentId = parentComment.id;
                this.focusedComments = [parentComment];
                
                history.replaceState(null, null, `#comment-${commentId}`);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                this.reportedCommentId = commentId;
                history.replaceState(null, null, `#comment-${commentId}`);
                
                setTimeout(() => {
                    const element = document.getElementById(`comment-${commentId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        },

        async loadParentThread(commentId) {
            await this.loadComments();
            
            const comment = this.findComment(commentId, this.comments);
            
            if (comment) {
                const parentComment = this.findParentOfComment(commentId, this.comments);
                
                if (parentComment) {
                    this.reportedCommentId = commentId;
                    this.focusedCommentId = parentComment.id;
                    this.focusedComments = [parentComment];
                    
                    history.replaceState(null, null, `#comment-${commentId}`);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    this.reportedCommentId = commentId;
                    history.replaceState(null, null, `#comment-${commentId}`);
                    
                    setTimeout(() => {
                        const element = document.getElementById(`comment-${commentId}`);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 100);
                }
            } else {
                alert('Comment not found. It may have been deleted.');
            }
        },

        // UI helpers
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
            const button = document.getElementById(`options-btn-${commentId}`);
            const allDropdowns = document.querySelectorAll('.comment-dropdown');
            
            allDropdowns.forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('show');
                }
            });
            
            dropdown.classList.toggle('show');
            
            if (dropdown.classList.contains('show')) {
                const buttonRect = button.getBoundingClientRect();
                
                dropdown.style.top = (buttonRect.bottom + 4) + 'px';
                dropdown.style.left = (buttonRect.right - dropdown.offsetWidth) + 'px';
                
                const dropdownRect = dropdown.getBoundingClientRect();
                
                if (dropdownRect.right > window.innerWidth - 10) {
                    dropdown.style.left = (window.innerWidth - dropdown.offsetWidth - 10) + 'px';
                }
                
                if (dropdownRect.left < 10) {
                    dropdown.style.left = '10px';
                }
                
                if (dropdownRect.bottom > window.innerHeight - 10) {
                    dropdown.style.top = (buttonRect.top - dropdown.offsetHeight - 4) + 'px';
                }
            }
        },

        getRelativeTime(dateString) {
            return Utils.getRelativeTime(dateString);
        },
        
        async checkForWarnings() {
            if (!this.user) return;
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/warnings`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    const warnings = await response.json();
                    if (warnings.length > 0) {
                        // Show each warning
                        for (const warning of warnings) {
                            await this.showWarning(warning);
                        }
                    }
                }
            } catch (error) {
                console.error('Error checking warnings:', error);
            }
        },
        
        async showWarning(warning) {
            const severityColors = {
                info: 'bg-blue-100 text-blue-800 border-blue-300',
                warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                severe: 'bg-red-100 text-red-800 border-red-300'
            };
            
            const severityIcons = {
                info: 'ℹ️',
                warning: '⚠️',
                severe: '⛔'
            };
            
            const warningHtml = `
                <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" id="warning-${warning.id}">
                    <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6 ${severityColors[warning.severity]} border-2">
                        <div class="flex items-start space-x-3">
                            <span class="text-2xl">${severityIcons[warning.severity]}</span>
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold mb-2">Administrator Notice</h3>
                                <p class="mb-4">${warning.message}</p>
                                <p class="text-sm mb-4">Issued by: ${warning.issued_by_name} - ${Utils.getRelativeTime(warning.issued_at)}</p>
                                <button onclick="window.commentAppInstance.acknowledgeWarning(${warning.id})" class="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700">
                                    I understand
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', warningHtml);
        },
        
        async acknowledgeWarning(warningId) {
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                await fetch(`${this.apiUrl}/warnings/${warningId}/acknowledge`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                document.getElementById(`warning-${warningId}`).remove();
            } catch (error) {
                console.error('Error acknowledging warning:', error);
            }
        },

        // Moderation panel
        toggleReportsPanel() {
            this.showReportsPanel = !this.showReportsPanel;
            if (this.showReportsPanel && this.pageReports.length === 0) {
                this.loadPageReports();
            }
        },

        async loadPageReports() {
            if (!this.user?.is_moderator) return;
            
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
                    // Load user history for each report
                    for (const report of this.pageReports) {
                        await this.loadUserHistoryForReport(report);
                    }
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
        
        async loadUserHistoryForReport(report) {
            if (!report.comment_user_id) return;
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/users/${report.comment_user_id}/history`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    report.user_history = await response.json();
                }
            } catch (error) {
                console.error('Error loading user history:', error);
            }
        },
        
        toggleUserHistory(reportId) {
            const report = this.pageReports.find(r => r.id === reportId);
            if (report) {
                this.$set(report, 'showHistory', !report.showHistory);
            }
        },

        renderReportCard(report) {
            // Ensure reportCard is available
            if (!window.reportCard || typeof window.reportCard.renderReportCard !== 'function') {
                console.error('Report card component not loaded');
                // Initialize if not available
                if (!window.reportCard) {
                    window.reportCard = new ReportCard();
                }
                // Retry if now available
                if (window.reportCard && typeof window.reportCard.renderReportCard === 'function') {
                    return window.reportCard.renderReportCard(report, {
                showPageInfo: false,
                showViewInContext: false,
                onToggleHistory: (reportId) => this.toggleUserHistory(reportId),
                onJumpToComment: (commentId) => this.jumpToComment(commentId),
                onDeleteComment: (reportId) => {
                    const report = this.pageReports.find(r => r.id === reportId);
                    if (report) this.deleteReportedComment(report);
                },
                onBanUser: (userId, userName, duration) => {
                    if (duration === 'custom') {
                        this.showCustomBanInput(userId, userName);
                    } else {
                        this.banUserWithDuration(userId, userName, duration);
                    }
                },
                onWarnUser: (userId, userName) => this.warnUserFromReport(userId, userName),
                onDismiss: (reportId) => this.dismissReport(reportId),
                onToggleBanDropdown: (reportId, event) => this.toggleBanDropdown(reportId, event),
                showBanDropdown: this.showBanDropdown
            });
                }
                return '<div class="text-gray-500">Loading report...</div>';
            }
            return window.reportCard.renderReportCard(report, {
                showPageInfo: false,
                showViewInContext: false,
                onToggleHistory: (reportId) => this.toggleUserHistory(reportId),
                onJumpToComment: (commentId) => this.jumpToComment(commentId),
                onDeleteComment: (reportId) => {
                    const report = this.pageReports.find(r => r.id === reportId);
                    if (report) this.deleteReportedComment(report);
                },
                onBanUser: (userId, userName, duration) => {
                    if (duration === 'custom') {
                        this.showCustomBanInput(userId, userName);
                    } else {
                        this.banUserWithDuration(userId, userName, duration);
                    }
                },
                onWarnUser: (userId, userName) => this.warnUserFromReport(userId, userName),
                onDismiss: (reportId) => this.dismissReport(reportId),
                onToggleBanDropdown: (reportId, event) => this.toggleBanDropdown(reportId, event),
                showBanDropdown: this.showBanDropdown
            });
        },

        jumpToComment(commentId) {
            this.focusOnComment(commentId);
        },

        async deleteReportedComment(report) {
            if (!confirm('Delete this reported comment?')) return;
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                return;
            }
            
            try {
                const deleteResponse = await fetch(`${this.apiUrl}/comments/${report.comment_id}`, {
                    method: 'DELETE',
                    headers: { 
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete comment');
                }
                
                await fetch(`${this.apiUrl}/reports/${report.id}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ action: 'resolved' })
                });
                
                this.pageReports = this.pageReports.filter(r => r.id !== report.id);
                this.loadComments();
                
                alert('Comment deleted successfully');
            } catch (error) {
                console.error('Error deleting comment:', error);
                alert('Failed to delete comment');
            }
        },

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

        // Ban functionality
        toggleBanDropdown(reportId, event) {
            this.showBanDropdown = BanHandler.toggleBanDropdown(this.showBanDropdown, reportId, event);
        },

        async banUserWithDuration(userId, userName, duration) {
            await BanHandler.banUserWithDuration(userId, userName, duration, this.banUser.bind(this));
        },

        async showCustomBanInput(userId, userName) {
            await BanHandler.showCustomBanInput(userId, userName, this.banUserWithDuration.bind(this));
        },

        async banUser(userId, userName, duration, reason) {
            const result = await BanHandler.banUser(this.apiUrl, userId, userName, duration, reason, false);
            
            if (result.success) {
                if (this.pageReports.length > 0) {
                    await this.loadPageReports();
                }
                this.showBanDropdown = null;
            } else if (result.expired) {
                this.user = null;
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
            }
        },
        
        async warnUserFromReport(userId, userName) {
            const message = prompt(`What warning would you like to send to ${userName}?`);
            if (!message) return;
            
            const severityOptions = ['info', 'warning', 'severe'];
            const severityIndex = prompt('Select severity:\n1. Info (blue)\n2. Warning (yellow)\n3. Severe (red)\n\nEnter 1, 2, or 3:');
            
            if (!severityIndex || !['1', '2', '3'].includes(severityIndex)) {
                alert('Invalid severity selection');
                return;
            }
            
            const severity = severityOptions[parseInt(severityIndex) - 1];
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/users/${userId}/warn`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ message, severity })
                });
                
                if (response.ok) {
                    alert(`Warning sent to ${userName}`);
                } else {
                    throw new Error('Failed to send warning');
                }
            } catch (error) {
                console.error('Error warning user:', error);
                alert('Failed to send warning');
            }
        },

        showBanNotification(banInfo) {
            const message = banInfo.permanent 
                ? `You are permanently banned from commenting.\nReason: ${banInfo.ban_reason}`
                : `You are banned from commenting.\nTime remaining: ${banInfo.remaining_text}\nReason: ${banInfo.ban_reason}`;
            
            this.banNotification = {
                show: true,
                message: message,
                permanent: banInfo.permanent
            };
            
            if (!banInfo.permanent) {
                setTimeout(() => {
                    if (this.banNotification) {
                        this.banNotification.show = false;
                    }
                }, 10000);
            }
        },

        showBanExpiredNotification() {
            this.banNotification = {
                show: true,
                message: 'Good news! Your ban has expired. You can now comment again.',
                expired: true
            };
            
            setTimeout(() => {
                if (this.banNotification) {
                    this.banNotification.show = false;
                }
            }, 5000);
        },

        // Render comment HTML
        renderComment(comment, depth = 0) {
            if (!comment) return '';
            
            const MAX_DEPTH = 4;
            const isDeleted = !comment.content || comment.content === '[deleted]' || comment.deleted;
            const displayContent = isDeleted ? '[Comment deleted]' : comment.content;
            const displayAuthor = isDeleted ? '[deleted]' : comment.userName;
            
            const processed = isDeleted ? '' : MarkdownProcessor.preprocessMarkdown(displayContent);
            const content = isDeleted ? '' : this.md.render(processed);
            
            let html = `
                <div class="comment-container ${depth > 0 ? 'comment-depth-' + Math.min(depth, MAX_DEPTH) : ''}" 
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
            
            setTimeout(() => Utils.attachSpoilerHandlers(), 0);
            
            return html;
        }
    };
}