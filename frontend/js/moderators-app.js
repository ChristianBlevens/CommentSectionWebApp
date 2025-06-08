// Moderators App - Moderator management
function moderatorApp() {
    return {
        // State
        user: null,
        moderators: [],
        loading: true,
        newModeratorId: '',
        apiUrl: '/api',
        
        async init() {
            console.log('Moderator app initializing...');
            
            // Check session
            await this.checkExistingSession();
            
            // Setup OAuth listener
            Auth.setupOAuthListener((user) => {
                this.user = user;
                if (user.is_moderator) {
                    this.loadModerators();
                }
            });
        },
        
        async checkExistingSession() {
            this.user = await Auth.checkExistingSession();
            
            if (this.user) {
                console.log('Found existing session:', this.user.username);
                
                if (this.user.is_moderator) {
                    await this.loadModerators();
                } else {
                    this.loading = false;
                }
            } else {
                console.log('No existing user session found');
                this.loading = false;
            }
        },
        
        signInWithDiscord() {
            Auth.signInWithDiscord();
        },
        
        async loadModerators() {
            this.loading = true;
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                alert('Please sign in again');
                this.loading = false;
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/moderators`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    this.moderators = await response.json();
                    console.log(`Loaded ${this.moderators.length} moderators`);
                } else if (response.status === 401) {
                    console.error('Unauthorized: Invalid or expired session');
                    alert('Your session has expired. Please sign in again.');
                    this.handleSessionExpired();
                } else if (response.status === 403) {
                    console.error('Forbidden: Not a moderator');
                    alert('You do not have permission to view moderators');
                } else {
                    console.error('Error loading moderators:', response.status);
                    alert('Failed to load moderators');
                }
            } catch (error) {
                console.error('Error loading moderators:', error);
                alert('Network error. Please try again.');
            } finally {
                this.loading = false;
            }
        },
        
        async addModerator() {
            if (!this.newModeratorId.trim()) return;
            
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/users/${this.newModeratorId}/moderator`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        isModerator: true
                    })
                });
                
                if (response.ok) {
                    alert('Moderator added successfully');
                    this.newModeratorId = '';
                    await this.loadModerators();
                } else if (response.status === 401) {
                    console.error('Unauthorized: Invalid or expired session');
                    alert('Your session has expired. Please sign in again.');
                    this.handleSessionExpired();
                } else if (response.status === 403) {
                    console.error('Forbidden: Not a moderator');
                    alert('You do not have permission to add moderators');
                } else if (response.status === 404) {
                    alert('User not found');
                } else {
                    const error = await response.json();
                    alert(error.error || 'Failed to add moderator');
                }
            } catch (error) {
                console.error('Error adding moderator:', error);
                alert('Network error. Please try again.');
            }
        },
        
        async removeModerator(modId, modName) {
            if (modId === this.user.id) {
                alert('You cannot remove yourself as a moderator');
                return;
            }
            
            if (!confirm(`Remove ${modName} as a moderator?`)) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                alert('Please sign in again');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/users/${modId}/moderator`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({
                        isModerator: false
                    })
                });
                
                if (response.ok) {
                    alert('Moderator removed successfully');
                    await this.loadModerators();
                } else if (response.status === 401) {
                    console.error('Unauthorized: Invalid or expired session');
                    alert('Your session has expired. Please sign in again.');
                    this.handleSessionExpired();
                } else if (response.status === 403) {
                    console.error('Forbidden: Not a moderator');
                    alert('You do not have permission to remove moderators');
                } else if (response.status === 404) {
                    alert('User not found');
                } else {
                    alert('Failed to remove moderator');
                }
            } catch (error) {
                console.error('Error removing moderator:', error);
                alert('Network error. Please try again.');
            }
        },
        
        handleSessionExpired() {
            this.user = null;
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
        }
    };
}

// Expose to global scope for Alpine.js
window.moderatorApp = moderatorApp;