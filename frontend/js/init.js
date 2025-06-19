// Initialization script - loads all modules in correct order
// This file should be loaded last after all module files

// Set API base URL globally
const API_URL = window.location.origin;

// Close dropdowns on outside click - global handler
document.addEventListener('click', (event) => {
    if (!event.target.closest('.comment-dropdown-container')) {
        document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        // Remove has-open-dropdown class from all comments
        document.querySelectorAll('.comment-content.has-open-dropdown').forEach(comment => {
            comment.classList.remove('has-open-dropdown');
        });
    }
});

// Handle Discord login callbacks
Auth.setupOAuthListener((user, data) => {
    if (window.unifiedAppInstance) {
        window.unifiedAppInstance.user = user;
        window.unifiedAppInstance.loadComments();
    }
});