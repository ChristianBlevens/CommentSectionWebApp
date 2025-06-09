// Authentication module
const Auth = {
    // Check existing session
    async checkExistingSession() {
        const savedUser = localStorage.getItem('user');
        const sessionToken = localStorage.getItem('sessionToken');
        
        console.log('Checking existing session:', {
            hasUser: !!savedUser,
            hasToken: !!sessionToken,
            token: sessionToken ? sessionToken.substring(0, 10) + '...' : null
        });
        
        if (savedUser && sessionToken) {
            try {
                const user = JSON.parse(savedUser);
                console.log('Loaded user from localStorage:', user);
                return user;
            } catch (e) {
                console.error('Failed to parse saved user:', e);
                localStorage.removeItem('user');
                localStorage.removeItem('sessionToken');
                return null;
            }
        } else {
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
            return null;
        }
    },

    // Sign in with Discord
    signInWithDiscord() {
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem('discord_state', state);
        const clientId = CONFIG.discordClientId;
        const redirectUri = encodeURIComponent(CONFIG.discordRedirectUri);
        const scope = 'identify';
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
        
        const width = 500;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        window.open(
            discordAuthUrl,
            'discord-auth',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    },

    // Sign out
    async signOut(apiUrl = '/api') {
        const sessionToken = localStorage.getItem('sessionToken');
        if (sessionToken) {
            try {
                await fetch(`${apiUrl}/logout`, {
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
    },

    // Setup OAuth message listener
    setupOAuthListener(callback) {
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'discord-login-success') {
                const user = event.data.user;
                localStorage.setItem('user', JSON.stringify(user));
                if (event.data.sessionToken) {
                    localStorage.setItem('sessionToken', event.data.sessionToken);
                }
                callback(user, event.data);
            }
        });
    }
};