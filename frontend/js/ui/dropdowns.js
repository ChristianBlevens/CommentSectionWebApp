// Dropdown menu management
const Dropdowns = {
    // Initialize global dropdown handlers
    init() {
        // Close dropdowns on outside click
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.comment-dropdown-container')) {
                this.closeAllDropdowns();
            }
            
            if (!event.target.closest('.page-dropdown-container')) {
                const dropdowns = document.querySelectorAll('.page-dropdown');
                dropdowns.forEach(d => d.classList.remove('show'));
            }
        });
    },

    // Close all comment dropdowns
    closeAllDropdowns() {
        document.querySelectorAll('.comment-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        
        document.querySelectorAll('.comment-content.has-open-dropdown').forEach(comment => {
            comment.classList.remove('has-open-dropdown');
        });
    },

    // Toggle specific dropdown
    toggleDropdown(dropdownId, event) {
        if (event) {
            event.stopPropagation();
        }
        
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        
        const isOpen = dropdown.classList.contains('show');
        this.closeAllDropdowns();
        
        if (!isOpen) {
            dropdown.classList.add('show');
            
            // Add class to parent comment if it's a comment dropdown
            const parentComment = dropdown.closest('.comment-content');
            if (parentComment) {
                parentComment.classList.add('has-open-dropdown');
            }
        }
    },

    // Handle ban dropdown
    toggleBanDropdown(state, reportId, event) {
        if (event) {
            event.stopPropagation();
        }
        
        if (state.showBanDropdown === reportId) {
            state.showBanDropdown = null;
        } else {
            state.showBanDropdown = reportId;
        }
    },

    // Handle page filter dropdown
    togglePageDropdown(state, event) {
        if (event) {
            event.stopPropagation();
        }
        
        state.showPageDropdown = !state.showPageDropdown;
    },

    // Position dropdown to avoid overflow
    positionDropdown(dropdown) {
        const rect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        // Reset position
        dropdown.style.top = '';
        dropdown.style.bottom = '';
        
        // If dropdown would overflow bottom
        if (rect.bottom > viewportHeight) {
            dropdown.style.bottom = '100%';
            dropdown.style.top = 'auto';
        }
    }
};