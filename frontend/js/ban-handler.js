// User ban management
const BanHandler = {
    // Show/hide ban options menu
    toggleBanDropdown(currentDropdown, reportId, event) {
        event.stopPropagation();
        return currentDropdown === reportId ? null : reportId;
    },

    // Prompt for ban reason
    async banUserWithDuration(userId, userName, duration, banUserFn) {
        const reason = prompt(`Why are you banning ${userName}?`);
        if (!reason) return;
        
        await banUserFn(userId, userName, duration, reason);
    },

    // Get custom ban duration
    async showCustomBanInput(userId, userName, banUserWithDurationFn) {
        const duration = prompt('Enter ban duration (e.g., 30m, 6h, 1d):');
        if (!duration) return;
        
        if (!Utils.validateBanDuration(duration)) {
            alert('Invalid duration format. Use format like: 30m, 6h, 1d');
            return;
        }
        
        await banUserWithDurationFn(userId, userName, duration);
    },

    // Execute ban request
    async banUser(apiUrl, userId, userName, duration, reason, deleteComments = false) {
        const sessionToken = localStorage.getItem('auth_token');
        if (!sessionToken) {
            alert('Session expired. Please sign in again.');
            return { success: false, expired: true };
        }
        
        try {
            const response = await fetch(`${apiUrl}/api/users/${userId}/ban`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    duration: duration,
                    reason: reason,
                    deleteComments: deleteComments
                })
            });
            
            if (response.status === 401) {
                alert('Session expired. Please sign in again.');
                return { success: false, expired: true };
            }
            
            if (response.ok) {
                const result = await response.json();
                alert(`${userName} has been banned.\n${result.ban_duration_text}`);
                return { success: true, result };
            } else {
                throw new Error('Failed to ban user');
            }
        } catch (error) {
            console.error('Error banning user:', error);
            alert('Failed to ban user');
            return { success: false };
        }
    }
};