// Helper functions
const Utils = {
    // Convert timestamp to "X ago" format
    getRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
            }
        }
        
        return 'just now';
    },

    // Check duration string format
    validateBanDuration(duration) {
        return /^\d+[mhd]?$/.test(duration);
    },

    // Enable spoiler reveal on click
    attachSpoilerHandlers() {
        document.querySelectorAll('.spoiler').forEach(spoiler => {
            const newSpoiler = spoiler.cloneNode(true);
            spoiler.parentNode.replaceChild(newSpoiler, spoiler);
            
            newSpoiler.addEventListener('click', function(e) {
                e.stopPropagation();
                this.classList.toggle('revealed');
            });
        });
    },

    // Parse YouTube URL for video ID
    getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    // Parse Vimeo URL for video ID
    getVimeoId(url) {
        const regExp = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/;
        const match = url.match(regExp);
        return match ? match[5] : null;
    }
};