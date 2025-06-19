// User management functions
window.UsersManager = {
    // Load all users
    async loadUsers() {
        if (!this.user?.is_moderator) return;
        
        this.loadingUsers = true;
        try {
            const response = await fetch(`${API_URL}/api/users`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            this.users = await response.json();
            this.filterUsers();
            this.usersLoaded = true;
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            this.loadingUsers = false;
        }
    },
    
    // Filter users based on search and filter criteria
    filterUsers() {
        let filtered = [...this.users];
        
        // Apply search filter
        if (this.userSearchQuery) {
            const query = this.userSearchQuery.toLowerCase();
            filtered = filtered.filter(user => 
                user.username.toLowerCase().includes(query) ||
                user.id.includes(query)
            );
        }
        
        // Apply user type filter
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
            case 'active':
                filtered = filtered.filter(u => !u.is_banned);
                break;
        }
        
        this.filteredUsers = filtered;
        this.paginateUsers();
    },
    
    // Paginate users
    paginateUsers() {
        const start = (this.currentUserPage - 1) * this.usersPerPage;
        const end = start + this.usersPerPage;
        this.paginatedUsers = this.filteredUsers.slice(start, end);
        this.totalUserPages = Math.ceil(this.filteredUsers.length / this.usersPerPage);
    },
    
    // Toggle user expansion
    toggleUserExpansion(userId) {
        const index = this.expandedUsers.indexOf(userId);
        if (index === -1) {
            this.expandedUsers.push(userId);
            // Load user details if not already loaded
            this.loadUserDetails(userId);
        } else {
            this.expandedUsers.splice(index, 1);
        }
    },
    
    // Load user details (comments, reports, warnings)
    async loadUserDetails(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        try {
            // Load user's comments
            if (!user.comments) {
                const commentsResponse = await fetch(`${API_URL}/api/users/${userId}/comments?limit=10`, {
                    headers: window.ApiClient.getAuthHeaders()
                });
                if (commentsResponse.ok) {
                    user.comments = await commentsResponse.json();
                    this.userCommentsDisplayCount[userId] = Math.min(5, user.comments.length);
                }
            }
            
            // Load user's reports
            if (!user.reports_made && !user.reports_received) {
                const reportsResponse = await fetch(`${API_URL}/api/users/${userId}/reports`, {
                    headers: window.ApiClient.getAuthHeaders()
                });
                if (reportsResponse.ok) {
                    const reports = await reportsResponse.json();
                    user.reports_made = reports.made || [];
                    user.reports_received = reports.received || [];
                }
            }
            
            // Load user's warnings
            if (!user.warnings) {
                const warningsResponse = await fetch(`${API_URL}/api/users/${userId}/warnings`, {
                    headers: window.ApiClient.getAuthHeaders()
                });
                if (warningsResponse.ok) {
                    user.warnings = await warningsResponse.json();
                }
            }
            
            // Force re-render
            this.forceRerender = !this.forceRerender;
        } catch (error) {
            console.error('Error loading user details:', error);
        }
    },
    
    // Show more comments for a user
    showMoreComments(userId) {
        const current = this.userCommentsDisplayCount[userId] || 5;
        const user = this.users.find(u => u.id === userId);
        if (user && user.comments) {
            this.userCommentsDisplayCount[userId] = Math.min(current + 5, user.comments.length);
        }
    },
    
    // Toggle moderator status
    async toggleModerator(userId) {
        if (!this.user?.is_super_moderator) return;
        
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        const action = user.is_moderator ? 'remove' : 'add';
        const confirmMsg = user.is_moderator ? 
            `Remove moderator privileges from ${user.username}?` : 
            `Grant moderator privileges to ${user.username}?`;
            
        if (!confirm(confirmMsg)) return;
        
        try {
            const response = await fetch(`${API_URL}/api/users/${userId}/moderator`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ action })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            user.is_moderator = !user.is_moderator;
        } catch (error) {
            console.error('Error toggling moderator status:', error);
        }
    },
    
    // Warn a user
    async warnUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        const reason = prompt(`Why are you warning ${user.username}?`);
        if (!reason) return;
        
        try {
            const response = await fetch(`${API_URL}/api/users/${userId}/warn`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ reason })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            // Update local state
            user.warning_count = (user.warning_count || 0) + 1;
            user.latest_warning = reason;
            
            alert(`${user.username} has been warned.`);
        } catch (error) {
            console.error('Error warning user:', error);
        }
    },
    
    // Unban a user
    async unbanUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        if (!confirm(`Unban ${user.username}?`)) return;
        
        try {
            const response = await fetch(`${API_URL}/api/users/${userId}/unban`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            // Update local state
            user.is_banned = false;
            user.ban_expires_at = null;
            user.ban_reason = null;
            
            alert(`${user.username} has been unbanned.`);
        } catch (error) {
            console.error('Error unbanning user:', error);
        }
    }
};