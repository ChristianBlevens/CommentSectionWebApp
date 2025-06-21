// User authentication handler
const Auth = {
    // Validate stored session
    async checkExistingSession() {
        const savedUser = localStorage.getItem('user');
        const sessionToken = localStorage.getItem('sessionToken');
        
        console.log('Checking existing session:', {
            hasUser: !!savedUser,
            hasToken: !!sessionToken,
            token: sessionToken ? sessionToken.substring(0, 10) + '...' : null
        });
        
        if (!savedUser || !sessionToken) {
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
            return null;
        }
        
        // Verify token with API
        try {
            const response = await fetch(`${window.location.origin}/api/session/validate`, {
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });
            
            if (response.ok) {
                const validatedUser = await response.json();
                console.log('Session validated, user:', validatedUser);
                
                // Store internal ID separately for current user actions
                if (validatedUser._internalId) {
                    sessionStorage.setItem('_uid', validatedUser._internalId);
                    delete validatedUser._internalId;
                }
                
                // Save fresh user data
                localStorage.setItem('user', JSON.stringify(validatedUser));
                return validatedUser;
            } else {
                console.log('Session invalid, clearing localStorage');
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                return null;
            }
        } catch (e) {
            console.error('Session validation failed:', e);
            // Use cached data offline
            try {
                const user = JSON.parse(savedUser);
                console.log('Using cached user due to network error:', user);
                return user;
            } catch (parseError) {
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                return null;
            }
        }
    },

    // Launch Discord OAuth flow
    signInWithDiscord() {
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem('discord_state', state);
        
        // Store state globally for iframe scenarios
        window.discordAuthState = state;
        
        const clientId = CONFIG.discordClientId;
        const redirectUri = encodeURIComponent(CONFIG.discordRedirectUri);
        const scope = 'identify';
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
        
        const width = 500;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        const authWindow = window.open(
            discordAuthUrl,
            'discord-auth',
            `width=${width},height=${height},left=${left},top=${top}`
        );
        
        // Set up message handler for state requests from popup
        const messageHandler = (event) => {
            if (event.data?.type === 'discord-state-request' && event.origin === window.location.origin) {
                event.source.postMessage({ 
                    type: 'discord-state-response', 
                    state: state 
                }, event.origin);
            }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Clean up handler after 5 minutes
        setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            delete window.discordAuthState;
        }, 300000);
    },

    // Logout user
    async signOut(apiUrl = window.location.origin) {
        const sessionToken = localStorage.getItem('sessionToken');
        if (sessionToken) {
            try {
                await fetch(`${apiUrl}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
            } catch (error) {
                console.error('Logout failed:', error);
            }
        }
        
        localStorage.removeItem('user');
        localStorage.removeItem('sessionToken');
        sessionStorage.removeItem('_uid');
    },

    // Handle OAuth callback messages
    setupOAuthListener(callback) {
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'discord-login-success') {
                const user = event.data.user;
                
                // Extract and store internal ID
                if (user._internalId) {
                    sessionStorage.setItem('_uid', user._internalId);
                    delete user._internalId;
                }
                
                localStorage.setItem('user', JSON.stringify(user));
                if (event.data.sessionToken) {
                    localStorage.setItem('sessionToken', event.data.sessionToken);
                }
                callback(user, event.data);
            }
        });
    },
    
    // Get current session token
    getToken() {
        return localStorage.getItem('sessionToken');
    }
};