// App configuration settings
const CONFIG = {
    backendUrl: window.location.origin,
    moderationUrl: window.location.origin,
    discordClientId: '',
    discordRedirectUri: ''
};

// Environment variables for frontend
window.ENV = {
    DISCORD_SERVER_URL: '',
    INITIAL_MODERATORS: ''
};

// Fetch config from API
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            CONFIG.discordClientId = config.discordClientId;
            CONFIG.discordRedirectUri = config.discordRedirectUri;
            CONFIG.backendUrl = window.location.origin;
            CONFIG.moderationUrl = window.location.origin;
            
            // Set environment variables
            window.ENV.DISCORD_SERVER_URL = config.discordServerUrl;
            window.ENV.INITIAL_MODERATORS = config.initialModerators;
            
            console.log('Configuration loaded:', CONFIG);
        } else {
            console.error('Failed to load configuration');
            setDefaultConfig();
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
        setDefaultConfig();
    }
}

function setDefaultConfig() {
    CONFIG.discordClientId = '';
    CONFIG.discordRedirectUri = window.location.origin + '/oauth-callback.html';
}

// Initialize on page load
loadConfig();