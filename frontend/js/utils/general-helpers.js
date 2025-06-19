// General helper functions
function getRelativeTime(dateString) {
    return Utils.getRelativeTime(dateString);
}

function extractYouTubeId(url) {
    return Utils.getYoutubeId(url);
}

async function banUserWithDuration(userId, userName, duration) {
    const reason = prompt(`Why are you banning ${userName}?`);
    if (!reason) return;
    
    const response = await BanHandler.banUser(API_URL, userId, userName, duration, reason);
    if (response.success) {
        // Display ban success message
        if (window.unifiedAppInstance) {
            window.unifiedAppInstance.banNotification = {
                show: true,
                message: `${userName} has been banned.\n${response.result.ban_duration_text}`,
                expired: false
            };
            setTimeout(() => {
                if (window.unifiedAppInstance.banNotification) {
                    window.unifiedAppInstance.banNotification.show = false;
                }
            }, 5000);
        }
    }
}

function showCustomBanInput(userId, userName) {
    BanHandler.showCustomBanInput(userId, userName, banUserWithDuration);
}

window.GeneralHelpers = {
    getRelativeTime,
    extractYouTubeId,
    banUserWithDuration,
    showCustomBanInput
};