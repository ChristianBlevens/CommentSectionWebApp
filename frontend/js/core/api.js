// API communication layer
const API = {
    // Get base API URL
    getBaseUrl() {
        return window.location.origin;
    },

    // Build request headers with auth
    getHeaders() {
        const sessionToken = localStorage.getItem('sessionToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }
        return headers;
    },

    // Handle auth errors
    async handleAuthError(response) {
        if (response.status === 401) {
            console.log('Session expired, clearing localStorage');
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
            window.location.reload();
            return true;
        }
        return false;
    },

    // Comments API
    comments: {
        async getAll(pageId = null) {
            // Get pageId from parameter or URL
            const currentPageId = pageId || new URLSearchParams(window.location.search).get('pageId') || 'default';
            const response = await fetch(`${API.getBaseUrl()}/api/comments?pageId=${encodeURIComponent(currentPageId)}`);
            if (!response.ok) throw new Error('Failed to fetch comments');
            return response.json();
        },

        async create(content, parentId = null, pageId = null) {
            const currentPageId = pageId || new URLSearchParams(window.location.search).get('pageId') || 'default';
            const response = await fetch(`${API.getBaseUrl()}/api/comments`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ 
                    content, 
                    parentId: parentId,  // Note: backend expects camelCase
                    pageId: currentPageId 
                })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to create comment');
            return response.json();
        },

        async update(commentId, content) {
            const response = await fetch(`${API.getBaseUrl()}/api/comments/${commentId}`, {
                method: 'PUT',
                headers: API.getHeaders(),
                body: JSON.stringify({ content })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to update comment');
            return response.json();
        },

        async delete(commentId) {
            const response = await fetch(`${API.getBaseUrl()}/api/comments/${commentId}`, {
                method: 'DELETE',
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to delete comment');
            return response.json();
        },

        async vote(commentId, voteType) {
            const response = await fetch(`${API.getBaseUrl()}/api/comments/${commentId}/vote`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ vote_type: voteType })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to vote');
            return response.json();
        }
    },

    // Reports API
    reports: {
        async getAll() {
            const response = await fetch(`${API.getBaseUrl()}/api/moderation/reports`, {
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to fetch reports');
            return response.json();
        },

        async create(commentId, reason) {
            const response = await fetch(`${API.getBaseUrl()}/api/moderation/reports`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ comment_id: commentId, reason })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to create report');
            return response.json();
        },

        async resolve(reportId, action) {
            const response = await fetch(`${API.getBaseUrl()}/api/moderation/reports/${reportId}/resolve`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ action })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to resolve report');
            return response.json();
        }
    },

    // Users API
    users: {
        async getAll() {
            const response = await fetch(`${API.getBaseUrl()}/api/users`, {
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to fetch users');
            return response.json();
        },

        async ban(userId, duration, reason, deleteComments = false) {
            const response = await fetch(`${API.getBaseUrl()}/api/users/${userId}/ban`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ duration, reason, deleteComments })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to ban user');
            return response.json();
        },

        async unban(userId) {
            const response = await fetch(`${API.getBaseUrl()}/api/users/${userId}/unban`, {
                method: 'POST',
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to unban user');
            return response.json();
        },

        async warn(userId, reason) {
            const response = await fetch(`${API.getBaseUrl()}/api/users/${userId}/warn`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ reason })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to warn user');
            return response.json();
        },

        async toggleModerator(userId) {
            const response = await fetch(`${API.getBaseUrl()}/api/users/${userId}/toggle-moderator`, {
                method: 'POST',
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to toggle moderator status');
            return response.json();
        }
    },

    // Moderation logs API
    moderationLogs: {
        async getAll() {
            const response = await fetch(`${API.getBaseUrl()}/api/moderation/logs`, {
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to fetch moderation logs');
            return response.json();
        }
    },

    // Analytics API
    analytics: {
        async get(timeframe = '24h') {
            const response = await fetch(`${API.getBaseUrl()}/api/analytics?timeframe=${timeframe}`, {
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to fetch analytics');
            return response.json();
        }
    },

    // Theme API
    theme: {
        async get() {
            const response = await fetch(`${API.getBaseUrl()}/api/theme`, {
                headers: API.getHeaders()
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to fetch theme');
            return response.json();
        },

        async save(colors) {
            const response = await fetch(`${API.getBaseUrl()}/api/theme`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify({ colors })
            });
            
            if (await API.handleAuthError(response)) return null;
            if (!response.ok) throw new Error('Failed to save theme');
            return response.json();
        }
    },

    // Session API
    session: {
        async validate() {
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) return null;

            const response = await fetch(`${API.getBaseUrl()}/api/session/validate`, {
                headers: { 'Authorization': `Bearer ${sessionToken}` }
            });
            
            if (!response.ok) return null;
            return response.json();
        },

        async logout() {
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) return;

            try {
                await fetch(`${API.getBaseUrl()}/api/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${sessionToken}` }
                });
            } catch (error) {
                console.error('Logout failed:', error);
            }
        }
    }
};