// Users management application
function usersApp() {
    // Ensure components are initialized
    if (!window.commentRenderer && window.CommentRenderer) {
        window.commentRenderer = new CommentRenderer();
    }
    
    return {
        user: null,
        users: [],
        userHistory: {},
        userComments: {},
        expandedUser: null,
        searchQuery: '',
        currentPage: 1,
        totalPages: 1,
        totalUsers: 0,
        limit: 50,
        searchTimeout: null,
        apiUrl: '/api',
        moderationUrl: '/moderation',

        async init() {
            // Set global instance for event handlers
            window.usersAppInstance = this;
            
            this.user = await Auth.checkExistingSession();
            if (!this.user || !this.user.is_moderator) {
                window.location.href = 'index.html';
                return;
            }
            
            await this.loadUsers();
        },

        async loadUsers() {
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const params = new URLSearchParams({
                    page: this.currentPage,
                    limit: this.limit
                });
                
                if (this.searchQuery) {
                    params.append('search', this.searchQuery);
                }
                
                const response = await fetch(`${this.apiUrl}/users?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (!response.ok) throw new Error('Failed to load users');
                
                const data = await response.json();
                this.users = data.users;
                this.totalUsers = data.total;
                this.totalPages = Math.ceil(data.total / this.limit);
                
                // Load history for each user
                for (const user of this.users) {
                    await this.loadUserHistory(user.id);
                }
            } catch (error) {
                console.error('Error loading users:', error);
                alert('Failed to load users');
            }
        },

        async loadUserHistory(userId) {
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/users/${userId}/history`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (!response.ok) throw new Error('Failed to load user history');
                
                const history = await response.json();
                this.userHistory[userId] = history;
            } catch (error) {
                console.error('Error loading user history:', error);
            }
        },

        async loadUserComments(userId) {
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/comments/user/${userId}?limit=10`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (!response.ok) throw new Error('Failed to load user comments');
                
                const comments = await response.json();
                this.userComments[userId] = comments;
            } catch (error) {
                console.error('Error loading user comments:', error);
                this.userComments[userId] = [];
            }
        },

        toggleUserDetails(userId) {
            if (this.expandedUser === userId) {
                this.expandedUser = null;
            } else {
                this.expandedUser = userId;
            }
        },

        debouncedSearch() {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.currentPage = 1;
                this.loadUsers();
            }, 300);
        },

        changePage(page) {
            if (page < 1 || page > this.totalPages) return;
            this.currentPage = page;
            this.loadUsers();
            window.scrollTo(0, 0);
        },

        get visiblePages() {
            const pages = [];
            const maxVisible = 5;
            const halfVisible = Math.floor(maxVisible / 2);
            
            let start = Math.max(1, this.currentPage - halfVisible);
            let end = Math.min(this.totalPages, start + maxVisible - 1);
            
            if (end - start + 1 < maxVisible) {
                start = Math.max(1, end - maxVisible + 1);
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            
            return pages;
        },

        async banUser(userId, userName, duration) {
            const reason = prompt(`Why are you banning ${userName}?`);
            if (!reason) return;
            
            const result = await BanHandler.banUser(
                this.apiUrl,
                userId,
                userName,
                duration,
                reason,
                false
            );
            
            if (result.success) {
                await this.loadUsers();
                await this.loadUserHistory(userId);
            } else if (result.expired) {
                await this.signOut();
            }
        },

        async showCustomBanInput(userId, userName) {
            const duration = prompt('Enter ban duration (e.g., 30m, 6h, 1d):');
            if (!duration) return;
            
            if (!Utils.validateBanDuration(duration)) {
                alert('Invalid duration format. Use format like: 30m, 6h, 1d');
                return;
            }
            
            await this.banUser(userId, userName, duration);
        },

        async warnUser(userId, userName) {
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

        async toggleModerator(userId, isModerator) {
            const action = isModerator ? 'make' : 'remove';
            const confirmation = confirm(`Are you sure you want to ${action} this user as a moderator?`);
            if (!confirmation) return;
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/users/${userId}/moderator`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ isModerator })
                });
                
                if (response.ok) {
                    await this.loadUsers();
                } else {
                    throw new Error('Failed to update moderator status');
                }
            } catch (error) {
                console.error('Error updating moderator status:', error);
                alert('Failed to update moderator status');
            }
        },

        async deleteComment(commentId) {
            if (!confirm('Are you sure you want to delete this comment?')) return;
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/comments/${commentId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    // Reload comments for the user
                    const userId = this.expandedUser;
                    if (userId) {
                        await this.loadUserComments(userId);
                    }
                } else {
                    throw new Error('Failed to delete comment');
                }
            } catch (error) {
                console.error('Error deleting comment:', error);
                alert('Failed to delete comment');
            }
        },

        async reportComment(commentId) {
            const reason = prompt('Why are you reporting this comment?');
            if (!reason) return;
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/comments/${commentId}/report`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ reason })
                });
                
                if (response.ok) {
                    alert('Comment reported successfully');
                } else {
                    throw new Error('Failed to report comment');
                }
            } catch (error) {
                console.error('Error reporting comment:', error);
                alert('Failed to report comment');
            }
        },

        renderMarkdown(content) {
            // Use the global comment renderer
            if (window.commentRenderer) {
                return window.commentRenderer.renderMarkdown(content);
            }
            // Fallback
            return content;
        },

        renderCommentForUser(comment) {
            // Check if comment renderer is available
            if (!window.commentRenderer || typeof window.commentRenderer.renderSimpleComment !== 'function') {
                console.error('Comment renderer component not loaded');
                // Initialize if not available
                if (!window.commentRenderer) {
                    window.commentRenderer = new CommentRenderer();
                }
            }
            
            // Add custom actions to the simple comment
            const renderedComment = window.commentRenderer ? window.commentRenderer.renderSimpleComment(comment) : '';
            
            // Add action buttons
            const actionsHtml = `
                <div class="flex space-x-2 mt-2">
                    <button onclick="window.usersAppInstance.deleteComment(${comment.id})" 
                            class="text-xs text-red-600 hover:text-red-800">
                        Delete
                    </button>
                    <button onclick="window.usersAppInstance.reportComment(${comment.id})" 
                            class="text-xs text-yellow-600 hover:text-yellow-800">
                        Report
                    </button>
                </div>
            `;
            
            // Insert actions before the closing div
            if (renderedComment) {
                const closingDivIndex = renderedComment.lastIndexOf('</div>');
                if (closingDivIndex > -1) {
                    return renderedComment.slice(0, closingDivIndex) + actionsHtml + renderedComment.slice(closingDivIndex);
                }
            }
            
            return renderedComment + actionsHtml;
        },

        getRelativeTime(dateString) {
            return Utils.getRelativeTime(dateString);
        },

        async signOut() {
            await Auth.signOut(this.apiUrl);
            window.location.href = 'index.html';
        }
    };
}

// Expose to global scope for Alpine.js
window.usersApp = usersApp;