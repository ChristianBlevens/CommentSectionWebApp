// Input validation utilities
const ValidationUtils = {
    // Check ban duration format
    validateBanDuration(duration) {
        return /^\d+[mhd]?$/.test(duration);
    },

    // Parse ban duration to readable format
    parseBanDuration(duration) {
        const match = duration.match(/^(\d+)([mhd])?$/);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2] || 'h';
        
        const units = {
            'm': 'minute',
            'h': 'hour',
            'd': 'day'
        };
        
        const unitName = units[unit];
        return `${value} ${unitName}${value > 1 ? 's' : ''}`;
    },

    // Validate color hex format
    validateHexColor(color) {
        return /^#[0-9A-F]{6}$/i.test(color);
    },

    // Validate username
    validateUsername(username) {
        // Username should be 3-20 characters, alphanumeric and underscores
        return /^[a-zA-Z0-9_]{3,20}$/.test(username);
    },

    // Validate URL
    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // Sanitize HTML to prevent XSS
    sanitizeHtml(html) {
        const temp = document.createElement('div');
        temp.textContent = html;
        return temp.innerHTML;
    },

    // Check if text contains profanity (basic check)
    containsProfanity(text) {
        // This is a very basic check - in production, use a proper profanity filter
        const profanityList = ['badword1', 'badword2']; // Add actual words
        const lowerText = text.toLowerCase();
        return profanityList.some(word => lowerText.includes(word));
    }
};