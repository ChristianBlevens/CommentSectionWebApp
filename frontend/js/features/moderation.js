// Moderation features
const Moderation = {
    // Load reports
    async loadReports(state) {
        if (state.loadingReports || !AppState.hasPermission(state, 'moderate')) return;
        
        state.loadingReports = true;
        try {
            const data = await API.reports.getAll();
            state.reports = data.reports || [];
            state.pages = data.pages || [];
            state.totalPendingReports = state.reports.length; // All are pending due to query
            
            // If selectedReportsPage is not set, default to current page
            if (state.selectedReportsPage === null) {
                state.selectedReportsPage = state.pageId;
            }
            
            this.filterReports(state);
            state.reportsLoaded = true;
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            state.loadingReports = false;
        }
    },

    // Filter reports by page
    filterReports(state) {
        if (state.selectedReportsPage && state.selectedReportsPage !== 'all') {
            state.filteredReports = state.reports.filter(r => r.page_id === state.selectedReportsPage);
        } else {
            state.filteredReports = [...state.reports];
        }
        
        // Filter pages for dropdown
        if (state.pageSearchQuery) {
            const query = state.pageSearchQuery.toLowerCase();
            state.filteredPages = state.pages.filter(page => 
                page.page_id.toLowerCase().includes(query)
            );
        } else {
            state.filteredPages = [...state.pages];
        }
    },

    // Resolve report
    async resolveReport(state, reportId, action, commentContent) {
        try {
            await API.reports.resolve(reportId, action);
            
            // Remove from local state
            state.reports = state.reports.filter(r => r.id !== reportId);
            state.totalPendingReports = state.reports.filter(r => r.status === 'pending').length;
            
            // Show success message based on action
            const messages = {
                'delete': 'Comment deleted and report resolved',
                'dismiss': 'Report dismissed',
                'warn': 'User warned and report resolved',
                'ban': 'User banned and report resolved'
            };
            
            if (action === 'warn' || action === 'ban') {
                state.warningNotification = {
                    show: true,
                    message: messages[action]
                };
                setTimeout(() => {
                    state.warningNotification.show = false;
                }, 3000);
            }
            
            this.filterReports(state);
        } catch (error) {
            console.error('Error resolving report:', error);
            alert('Failed to resolve report');
        }
    },

    // Load users
    async loadUsers(state) {
        if (state.loadingUsers || !AppState.hasPermission(state, 'moderate')) return;
        
        state.loadingUsers = true;
        try {
            const data = await API.users.getAll();
            state.users = data.users || [];
            
            // Extract moderators for filter
            state.moderators = state.users
                .filter(u => u.is_moderator || u.is_super_moderator)
                .map(u => ({ id: u.id, username: u.username }));
            
            this.filterUsers(state);
            state.usersLoaded = true;
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            state.loadingUsers = false;
        }
    },

    // Filter users
    filterUsers(state) {
        let filtered = state.users;
        
        // Apply filter
        switch (state.userFilter) {
            case 'moderators':
                filtered = filtered.filter(u => u.is_moderator || u.is_super_moderator);
                break;
            case 'banned':
                filtered = filtered.filter(u => u.is_banned);
                break;
            case 'warned':
                filtered = filtered.filter(u => u.warning_count > 0);
                break;
        }
        
        // Apply search
        if (state.userSearchQuery) {
            const query = state.userSearchQuery.toLowerCase();
            filtered = filtered.filter(u => 
                u.username.toLowerCase().includes(query) ||
                u.id.toString().includes(query)
            );
        }
        
        state.filteredUsers = filtered;
        
        // Paginate
        const start = (state.currentUserPage - 1) * state.usersPerPage;
        const end = start + state.usersPerPage;
        state.paginatedUsers = filtered.slice(start, end);
        state.totalUserPages = Math.ceil(filtered.length / state.usersPerPage);
    },

    // Ban user
    async banUser(state, userId, userName, duration = null) {
        if (!duration) {
            duration = '1h'; // Default duration
        }
        
        const reason = prompt(`Why are you banning ${userName}?`);
        if (!reason) return;
        
        try {
            const result = await API.users.ban(userId, duration, reason);
            
            if (result) {
                Notifications.showBanNotification(state, `${userName} has been banned.\n${result.ban_duration_text}`);
                
                // Update local state
                const user = state.users.find(u => u.id === userId);
                if (user) {
                    user.is_banned = true;
                    user.ban_expires_at = result.ban_expires_at;
                }
                
                this.filterUsers(state);
            }
        } catch (error) {
            console.error('Error banning user:', error);
            alert('Failed to ban user');
        }
    },
    
    // Ban user with custom duration
    async banUserWithDuration(state, userId, userName, duration) {
        await this.banUser(state, userId, userName, duration);
    },
    
    // Show custom ban duration input
    async showCustomBanInput(state, userId, userName) {
        const duration = prompt('Enter ban duration (e.g., 30m, 6h, 1d):');
        if (!duration) return;
        
        if (!ValidationUtils.validateBanDuration(duration)) {
            alert('Invalid duration format. Use format like: 30m, 6h, 1d');
            return;
        }
        
        await this.banUserWithDuration(state, userId, userName, duration);
    },

    // Unban user
    async unbanUser(state, userId) {
        if (!confirm('Are you sure you want to unban this user?')) return;
        
        try {
            await API.users.unban(userId);
            
            // Update local state
            const user = state.users.find(u => u.id === userId);
            if (user) {
                user.is_banned = false;
                user.ban_expires_at = null;
            }
            
            this.filterUsers(state);
        } catch (error) {
            console.error('Error unbanning user:', error);
            alert('Failed to unban user');
        }
    },

    // Warn user
    async warnUser(state, userId, userName) {
        const reason = prompt(`Why are you warning ${userName}?`);
        if (!reason) return;
        
        try {
            await API.users.warn(userId, reason);
            
            // Update local state
            const user = state.users.find(u => u.id === userId);
            if (user) {
                user.warning_count = (user.warning_count || 0) + 1;
            }
            
            state.warningNotification = {
                show: true,
                message: `${userName} has been warned`
            };
            setTimeout(() => {
                state.warningNotification.show = false;
            }, 3000);
            
            this.filterUsers(state);
        } catch (error) {
            console.error('Error warning user:', error);
            alert('Failed to warn user');
        }
    },

    // Toggle moderator status
    async toggleModerator(state, userId) {
        const user = state.users.find(u => u.id === userId);
        if (!user) return;
        
        const action = user.is_moderator ? 'revoke' : 'grant';
        const message = `Are you sure you want to ${action} moderator privileges for ${user.username}?`;
        
        if (!confirm(message)) return;
        
        try {
            await API.users.toggleModerator(userId);
            
            // Update local state
            user.is_moderator = !user.is_moderator;
            
            // Update moderators list
            state.moderators = state.users
                .filter(u => u.is_moderator || u.is_super_moderator)
                .map(u => ({ id: u.id, username: u.username }));
            
            this.filterUsers(state);
        } catch (error) {
            console.error('Error toggling moderator status:', error);
            alert('Failed to update moderator status');
        }
    },

    // Load moderation logs
    async loadModerationLogs(state) {
        if (state.loadingLogs || !AppState.hasPermission(state, 'moderate')) return;
        
        state.loadingLogs = true;
        try {
            const data = await API.moderationLogs.getAll(state.selectedModeratorId);
            state.moderationLogs = data.logs || [];
            state.moderators = data.moderators || [];
            
            // Parse JSON details
            state.moderationLogs.forEach(log => {
                if (log.details && typeof log.details === 'string') {
                    try {
                        log.details = JSON.parse(log.details);
                    } catch (e) {
                        log.details = {};
                    }
                }
            });
            
            state.logsLoaded = true;
        } catch (error) {
            console.error('Error loading moderation logs:', error);
        } finally {
            state.loadingLogs = false;
        }
    },

    // Filter moderation logs by moderator
    getFilteredLogs(state) {
        if (state.selectedModeratorId === 'all') {
            return state.moderationLogs;
        }
        return state.moderationLogs.filter(
            log => log.moderator_id === parseInt(state.selectedModeratorId)
        );
    },

    // Toggle user expansion in user list
    toggleUserExpansion(state, userId) {
        const index = state.expandedUsers.indexOf(userId);
        if (index > -1) {
            state.expandedUsers.splice(index, 1);
            delete state.userCommentsDisplayCount[userId];
        } else {
            state.expandedUsers.push(userId);
            state.userCommentsDisplayCount[userId] = 5;
        }
    },

    // Show more comments for user
    showMoreUserComments(state, userId) {
        const current = state.userCommentsDisplayCount[userId] || 5;
        state.userCommentsDisplayCount[userId] = current + 10;
    }
};