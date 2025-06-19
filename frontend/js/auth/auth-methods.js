// Authentication methods for the unified app
window.AuthMethods = {
    // Sign in with Discord
    async signInWithDiscord() {
        const user = await Auth.signInWithDiscord();
        if (user) {
            this.user = user;
            
            // Grant super mod permissions
            const initialMods = (window.ENV?.INITIAL_MODERATORS || '').split(',').map(id => id.trim()).filter(Boolean);
            if (initialMods.includes(user.id)) {
                this.user.is_super_moderator = true;
            }
            
            await this.loadComments();
            
            if (this.user.is_moderator) {
                await this.loadReportCount();
            }
            
            if (this.user.is_super_moderator) {
                await this.initThemeEditor();
            }
            
            await this.checkWarnings();
        }
    },
    
    // Sign out
    async signOut() {
        await Auth.signOut();
        this.user = null;
        this.editingComment = null;
        this.replyingTo = null;
        await this.loadComments();
    },
    
    // Check for active warnings
    async checkWarnings() {
        try {
            const response = await fetch(`${API_URL}/api/warnings/active`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (response.ok) {
                const warnings = await response.json();
                if (warnings.length > 0) {
                    this.warningNotification = {
                        show: true,
                        message: `You have ${warnings.length} active warning${warnings.length > 1 ? 's' : ''}. Recent warning: "${warnings[0].reason}"`
                    };
                }
            }
        } catch (error) {
            console.error('Error checking warnings:', error);
        }
    },
    
    // Acknowledge warning
    async acknowledgeWarning() {
        this.warningNotification.show = false;
    }
};