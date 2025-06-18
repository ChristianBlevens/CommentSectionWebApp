// DOM manipulation helpers
const DOMUtils = {
    // Scroll element into view
    scrollToElement(elementId, options = {}) {
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({
                behavior: options.smooth !== false ? 'smooth' : 'auto',
                block: options.block || 'center'
            });
        }
    },

    // Get YouTube video ID from URL
    getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    // Get Vimeo video ID from URL
    getVimeoId(url) {
        const regExp = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/;
        const match = url.match(regExp);
        return match ? match[5] : null;
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

    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    },

    // Debounce function for performance
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Check if element is in viewport
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    },

    // Add loading spinner
    showLoader(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<div class="loader">Loading...</div>';
        }
    },

    // Remove loading spinner
    hideLoader(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            const loader = container.querySelector('.loader');
            if (loader) {
                loader.remove();
            }
        }
    }
};