// User ban management
const BanHandler = {
    // Show/hide ban options menu
    toggleBanDropdown(currentDropdown, reportId, event) {
        console.log('[BAN DEBUG] BanHandler.toggleBanDropdown called:', { currentDropdown, reportId });
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
        console.log('[BAN DEBUG] BanHandler.banUser called with:', { apiUrl, userId, userName, duration, reason, deleteComments });
        
        const sessionToken = localStorage.getItem('auth_token');
        console.log('[BAN DEBUG] Session token exists:', !!sessionToken);
        if (!sessionToken) {
            alert('Session expired. Please sign in again.');
            return { success: false, expired: true };
        }
        
        try {
            const banUrl = `${apiUrl}/api/users/${userId}/ban`;
            console.log('[BAN DEBUG] Making request to:', banUrl);
            
            const requestBody = {
                duration: duration,
                reason: reason,
                deleteComments: deleteComments
            };
            console.log('[BAN DEBUG] Request body:', requestBody);
            
            const response = await fetch(banUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify(requestBody)
            });
            
            console.log('[BAN DEBUG] Response status:', response.status);
            console.log('[BAN DEBUG] Response ok:', response.ok);
            
            if (response.status === 401) {
                alert('Session expired. Please sign in again.');
                return { success: false, expired: true };
            }
            
            if (response.ok) {
                const result = await response.json();
                console.log('[BAN DEBUG] Ban successful, result:', result);
                alert(`${userName} has been banned.\n${result.ban_duration_text}`);
                return { success: true, result };
            } else {
                const errorText = await response.text();
                console.error('[BAN DEBUG] Ban failed, error response:', errorText);
                throw new Error('Failed to ban user');
            }
        } catch (error) {
            console.error('[BAN DEBUG] Error in banUser:', error);
            console.error('[BAN DEBUG] Error stack:', error.stack);
            alert('Failed to ban user');
            return { success: false };
        }
    }
};