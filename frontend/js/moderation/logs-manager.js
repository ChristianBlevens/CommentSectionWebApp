// Moderation logs management functions
window.LogsManager = {
    // Load moderation logs
    async loadModerationLogs() {
        if (!this.user?.is_moderator) return;
        
        this.loadingLogs = true;
        try {
            const response = await fetch(`${API_URL}/api/moderation/logs`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            this.moderationLogs = await response.json();
            this.logsLoaded = true;
            
            // Extract unique moderators
            const moderatorSet = new Set();
            this.moderationLogs.forEach(log => {
                if (log.moderator_id && log.moderator_name) {
                    moderatorSet.add(JSON.stringify({
                        id: log.moderator_id,
                        name: log.moderator_name
                    }));
                }
            });
            
            this.moderators = Array.from(moderatorSet).map(m => JSON.parse(m));
        } catch (error) {
            console.error('Error loading moderation logs:', error);
        } finally {
            this.loadingLogs = false;
        }
    },
    
    // Get filtered logs based on selected moderator
    getFilteredLogs() {
        if (this.selectedModeratorId === 'all') {
            return this.moderationLogs;
        }
        return this.moderationLogs.filter(log => log.moderator_id === this.selectedModeratorId);
    },
    
    // Format action type for display
    formatActionType(action) {
        const actionMap = {
            'delete_comment': 'Deleted Comment',
            'ban_user': 'Banned User',
            'unban_user': 'Unbanned User',
            'warn_user': 'Warned User',
            'resolve_report': 'Resolved Report',
            'add_moderator': 'Added Moderator',
            'remove_moderator': 'Removed Moderator'
        };
        return actionMap[action] || action;
    },
    
    // Get action icon
    getActionIcon(action) {
        const iconMap = {
            'delete_comment': '🗑️',
            'ban_user': '🚫',
            'unban_user': '✅',
            'warn_user': '⚠️',
            'resolve_report': '✔️',
            'add_moderator': '👑',
            'remove_moderator': '👤'
        };
        return iconMap[action] || '📋';
    },
    
    // Format action type with icon
    formatActionTypeWithIcon(actionType) {
        const icon = this.getActionIcon(actionType);
        const text = this.formatActionType(actionType);
        return `${icon} ${text}`;
    }
};