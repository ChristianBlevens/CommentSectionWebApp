// API utility functions
const API_URL = window.location.origin;

// Build request headers with auth
function getAuthHeaders() {
    const sessionToken = localStorage.getItem('sessionToken');
    const headers = {
        'Content-Type': 'application/json'
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
}

// Clear session on auth failure
async function handleAuthError(response) {
    if (response.status === 401) {
        console.log('Session expired, clearing localStorage');
        localStorage.removeItem('user');
        localStorage.removeItem('sessionToken');
        // Refresh page to clear state
        window.location.reload();
        return true;
    }
    return false;
}

window.ApiClient = {
    API_URL,
    getAuthHeaders,
    handleAuthError
};