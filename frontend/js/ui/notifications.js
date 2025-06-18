// Notification management
const Notifications = {
    // Show ban notification
    showBanNotification(state, message, duration = 5000) {
        state.banNotification = {
            show: true,
            message: message,
            expired: false
        };
        
        setTimeout(() => {
            if (state.banNotification.show) {
                state.banNotification.show = false;
            }
        }, duration);
    },

    // Show warning notification
    showWarningNotification(state, message, duration = 3000) {
        state.warningNotification = {
            show: true,
            message: message
        };
        
        setTimeout(() => {
            if (state.warningNotification.show) {
                state.warningNotification.show = false;
            }
        }, duration);
    },

    // Show session expired notification
    showSessionExpired(state) {
        state.banNotification = {
            show: true,
            message: 'Session expired. Please sign in again.',
            expired: true
        };
    },

    // Hide all notifications
    hideAllNotifications(state) {
        state.banNotification.show = false;
        state.warningNotification.show = false;
    },

    // Generate notification HTML
    renderNotifications(state) {
        const notifications = [];
        
        // Ban notification
        if (state.banNotification.show) {
            const type = state.banNotification.expired ? 'warning' : 'success';
            notifications.push(`
                <div class="notification notification-${type}">
                    <span>${state.banNotification.message}</span>
                    <button onclick="window.notificationsInstance.hideBan()" class="notification-close">×</button>
                </div>
            `);
        }
        
        // Warning notification
        if (state.warningNotification.show) {
            notifications.push(`
                <div class="notification notification-info">
                    <span>${state.warningNotification.message}</span>
                    <button onclick="window.notificationsInstance.hideWarning()" class="notification-close">×</button>
                </div>
            `);
        }
        
        return notifications.join('');
    }
};