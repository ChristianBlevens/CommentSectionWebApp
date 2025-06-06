// API Client Module
class CommentAPI {
    constructor() {
        this.baseUrl = window.location.origin;
        this.config = null;
        this.configPromise = null;
    }

    // Load configuration from backend
    async loadConfig() {
        if (this.config) return this.config;
        
        if (!this.configPromise) {
            this.configPromise = fetch('/health/config')
                .then(response => {
                    if (!response.ok) throw new Error('Failed to load configuration');
                    return response.json();
                })
                .then(config => {
                    this.config = config;
                    console.log('Configuration loaded:', config);
                    return config;
                })
                .catch(error => {
                    console.error('Failed to load configuration:', error);
                    // Fallback configuration
                    this.config = {
                        discordClientId: '',
                        redirectUri: `${window.location.origin}/oauth-callback.html`,
                        maxCommentLength: 5000,
                        maxReportLength: 500,
                        environment: 'development'
                    };
                    return this.config;
                });
        }
        
        return this.configPromise;
    }

    // Get auth headers
    getAuthHeaders() {
        const token = localStorage.getItem('sessionToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }

    // Check session
    async checkSession() {
        const token = localStorage.getItem('sessionToken');
        if (!token) return null;

        try {
            const response = await fetch('/api/auth/session', {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Clear invalid session
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('user');
                }
                return null;
            }

            const data = await response.json();
            return data.user;
        } catch (error) {
            console.error('Session check failed:', error);
            return null;
        }
    }

    // Discord OAuth
    async getDiscordAuthUrl() {
        const config = await this.loadConfig();
        
        if (!config.discordClientId) {
            throw new Error('Discord authentication is not configured on this server');
        }
        
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem('discord_state', state);

        const params = new URLSearchParams({
            client_id: config.discordClientId,
            redirect_uri: config.redirectUri || `${window.location.origin}/oauth-callback.html`,
            response_type: 'code',
            scope: 'identify email',
            state: state
        });

        return `https://discord.com/api/oauth2/authorize?${params}`;
    }

    // Exchange Discord code for session
    async authenticateDiscord(code, state) {
        const response = await fetch('/api/auth/discord/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Authentication failed');
        }

        const data = await response.json();
        
        // Store session
        localStorage.setItem('sessionToken', data.sessionToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        return data;
    }

    // Logout
    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: this.getAuthHeaders()
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
    }

    // Get comments for a page
    async getComments(pageId) {
        const response = await fetch(`/api/comments/page/${pageId}`, {
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to load comments');
        }

        return response.json();
    }

    // Create comment
    async createComment(pageId, content, parentId = null) {
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({
                pageId,
                content,
                parentId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || error.reason || 'Failed to create comment');
        }

        return response.json();
    }

    // Vote on comment
    async voteComment(commentId, voteType) {
        const response = await fetch(`/api/comments/${commentId}/vote`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ type: voteType })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to vote');
        }

        return response.json();
    }

    // Delete comment
    async deleteComment(commentId) {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete comment');
        }

        return response.json();
    }

    // Report comment
    async reportComment(commentId, reason) {
        const response = await fetch(`/api/comments/${commentId}/report`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ reason })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to report comment');
        }

        return response.json();
    }

    // Get reports (moderator only)
    async getReports(pageId = null) {
        const params = pageId ? `?pageId=${pageId}` : '';
        const response = await fetch(`/api/reports${params}`, {
            headers: this.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to load reports');
        }

        return response.json();
    }

    // Resolve report (moderator only)
    async resolveReport(reportId, action, notes = '') {
        const response = await fetch(`/api/reports/${reportId}/resolve`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ action, notes })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to resolve report');
        }

        return response.json();
    }

    // Ban user (moderator only)
    async banUser(userId, ban = true) {
        const response = await fetch(`/api/users/${userId}/ban`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ ban })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to ban user');
        }

        return response.json();
    }
}

// Export as global
window.CommentAPI = CommentAPI;