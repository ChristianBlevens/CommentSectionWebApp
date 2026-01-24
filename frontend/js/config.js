// App configuration settings
const CONFIG = {
    backendUrl: window.location.origin,
    moderationUrl: window.location.origin,
    basePath: window.BASE_PATH || '',
    discordClientId: '',
    discordRedirectUri: ''
};

// Fetch config from API
async function loadConfig() {
    try {
        const response = await fetch(window.buildApiUrl('/config'));
        if (response.ok) {
            const config = await response.json();
            CONFIG.discordClientId = config.discordClientId;
            CONFIG.discordRedirectUri = config.discordRedirectUri;
            CONFIG.backendUrl = window.location.origin;
            CONFIG.moderationUrl = window.location.origin;
            CONFIG.basePath = window.BASE_PATH || '';

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
    CONFIG.discordRedirectUri = window.location.origin + (window.BASE_PATH || '') + '/oauth-callback.html';
    CONFIG.basePath = window.BASE_PATH || '';
}

// Initialize on page load
loadConfig();
