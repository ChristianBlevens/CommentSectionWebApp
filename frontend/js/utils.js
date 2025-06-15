// Utility functions and classes

const API_URL = window.API_URL || '';

// Get auth headers
function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };
    
    const sessionToken = localStorage.getItem('sessionToken');
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    
    return headers;
}

// API client for all requests
class APIClient {
    static async request(url, options = {}) {
        const defaultOptions = {
            headers: getAuthHeaders(),
            credentials: 'include'
        };
        
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(`${API_URL}${url}`, finalOptions);
            
            // Handle 401 errors
            if (response.status === 401) {
                const responseText = await response.text();
                let responseJson;
                try {
                    responseJson = JSON.parse(responseText);
                } catch (e) {
                    responseJson = { error: 'Session expired' };
                }
                
                if (responseJson.error === 'Session expired' || responseJson.error === 'No session token provided') {
                    await this.handleAuthError(responseJson);
                    return null;
                }
            }
            
            // Handle other errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            return response;
        } catch (error) {
            console.error(`API Error [${url}]:`, error);
            throw error;
        }
    }
    
    static async handleAuthError(response) {
        console.log('Session expired, redirecting to login...');
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        
        // Reset app state if available
        if (window.unifiedAppInstance) {
            window.unifiedAppInstance.user = null;
            window.unifiedAppInstance.isLoggedIn = false;
            window.unifiedAppInstance.activeTab = 'comments';
            window.unifiedAppInstance.reports = [];
            window.unifiedAppInstance.users = [];
            window.unifiedAppInstance.reportsLoaded = false;
            window.unifiedAppInstance.usersLoaded = false;
            window.unifiedAppInstance.moderationLogs = [];
            window.unifiedAppInstance.logsLoaded = false;
        }
        
        window.location.href = '/';
    }
    
    static async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }
    
    static async post(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    static async put(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    static async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }
}

// Notification manager
class NotificationManager {
    static show(type, message, duration = 5000) {
        if (!window.unifiedAppInstance) {
            console.error('No unified app instance found');
            return null;
        }
        
        const notification = {
            show: true,
            message: message,
            type: type,
            expired: false
        };
        
        // Set notification based on type
        switch(type) {
            case 'ban':
                window.unifiedAppInstance.banNotification = notification;
                break;
            case 'warning':
                window.unifiedAppInstance.warningNotification = notification;
                break;
            default:
                window.unifiedAppInstance[`${type}Notification`] = notification;
        }
        
        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => {
                const notificationKey = type === 'ban' ? 'banNotification' : 
                                      type === 'warning' ? 'warningNotification' : 
                                      `${type}Notification`;
                
                if (window.unifiedAppInstance[notificationKey]) {
                    window.unifiedAppInstance[notificationKey].show = false;
                }
            }, duration);
        }
        
        return notification;
    }
    
    static hide(type) {
        if (!window.unifiedAppInstance) return;
        
        const notificationKey = type === 'ban' ? 'banNotification' : 
                              type === 'warning' ? 'warningNotification' : 
                              `${type}Notification`;
        
        if (window.unifiedAppInstance[notificationKey]) {
            window.unifiedAppInstance[notificationKey].show = false;
        }
    }
}

// Comment tree operations
class CommentTreeManager {
    static findComment(commentId, comments) {
        for (const comment of comments) {
            if (comment.id == commentId) return comment;
            if (comment.children && comment.children.length > 0) {
                const found = this.findComment(commentId, comment.children);
                if (found) return found;
            }
        }
        return null;
    }
    
    static updateComment(commentId, updates, comments) {
        for (let i = 0; i < comments.length; i++) {
            if (comments[i].id === commentId) {
                Object.assign(comments[i], updates);
                return true;
            }
            if (comments[i].children && this.updateComment(commentId, updates, comments[i].children)) {
                return true;
            }
        }
        return false;
    }
    
    static deleteComment(commentId, comments) {
        return this.updateComment(commentId, {
            content: '[deleted]',
            deleted: true,
            userName: '[deleted]',
            userPicture: ''
        }, comments);
    }
    
    static addReply(parentId, reply, comments) {
        const parent = this.findComment(parentId, comments);
        if (parent) {
            if (!parent.children) {
                parent.children = [];
            }
            parent.children.push(reply);
            return true;
        }
        return false;
    }
    
    static removeComment(commentId, comments) {
        for (let i = 0; i < comments.length; i++) {
            if (comments[i].id === commentId) {
                comments.splice(i, 1);
                return true;
            }
            if (comments[i].children && this.removeComment(commentId, comments[i].children)) {
                return true;
            }
        }
        return false;
    }
    
    static countComments(comments) {
        let count = 0;
        for (const comment of comments) {
            count++;
            if (comment.children && comment.children.length > 0) {
                count += this.countComments(comment.children);
            }
        }
        return count;
    }
}

// Dropdown manager
class DropdownManager {
    static activeDropdowns = new Set();
    
    static toggle(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        
        const isOpen = dropdown.classList.contains('show');
        
        // Close all other dropdowns
        this.closeAll();
        
        // Toggle this dropdown
        if (!isOpen) {
            dropdown.classList.add('show');
            this.activeDropdowns.add(dropdownId);
        }
    }
    
    static close(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.classList.remove('show');
            this.activeDropdowns.delete(dropdownId);
        }
    }
    
    static closeAll() {
        this.activeDropdowns.forEach(id => {
            const dropdown = document.getElementById(id);
            if (dropdown) {
                dropdown.classList.remove('show');
            }
        });
        this.activeDropdowns.clear();
    }
    
    static init() {
        // Close dropdowns when clicking outside
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.dropdown-container')) {
                this.closeAll();
            }
        });
        
        // Prevent dropdown from closing when clicking inside
        document.addEventListener('click', (event) => {
            if (event.target.closest('.dropdown')) {
                event.stopPropagation();
            }
        });
    }
}

// Form helpers
class FormHelper {
    static async promptWithValidation(message, validator = null, defaultValue = '') {
        const input = prompt(message, defaultValue);
        
        if (input === null) return null; // User cancelled
        
        if (!input.trim()) {
            alert('Input cannot be empty');
            return null;
        }
        
        if (validator && !validator(input)) {
            alert('Invalid input. Please try again.');
            return null;
        }
        
        return input.trim();
    }
    
    static confirmAction(message) {
        return confirm(message);
    }
    
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    static validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    static sanitizeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }
}

// DOM helpers
class DOMHelper {
    static show(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'block';
        }
    }
    
    static hide(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'none';
        }
    }
    
    static toggle(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = element.style.display === 'none' ? 'block' : 'none';
        }
    }
    
    static addClass(element, className) {
        if (element) {
            element.classList.add(className);
        }
    }
    
    static removeClass(element, className) {
        if (element) {
            element.classList.remove(className);
        }
    }
    
    static toggleClass(element, className) {
        if (element) {
            element.classList.toggle(className);
        }
    }
    
    static scrollToElement(elementId, options = { behavior: 'smooth', block: 'center' }) {
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView(options);
        }
    }
}

// Date formatting
class DateHelper {
    static formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
        if (diffInSeconds < 2628000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
        if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2628000)} months ago`;
        return `${Math.floor(diffInSeconds / 31536000)} years ago`;
    }
    
    static formatDate(dateString, options = { dateStyle: 'medium', timeStyle: 'short' }) {
        const date = new Date(dateString);
        return date.toLocaleString(undefined, options);
    }
    
    static getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInMs = now - date;
        
        const seconds = Math.floor(diffInMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        return { seconds, minutes, hours, days };
    }
}

// Local storage wrapper
class StorageHelper {
    static get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error reading from localStorage:`, error);
            return defaultValue;
        }
    }
    
    static set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error writing to localStorage:`, error);
            return false;
        }
    }
    
    static remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Error removing from localStorage:`, error);
            return false;
        }
    }
    
    static clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error(`Error clearing localStorage:`, error);
            return false;
        }
    }
}

// Markdown insertion helpers
class MarkdownHelper {
    static insertMarkdown(textareaId, prefix, suffix = '') {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        const replacement = prefix + selectedText + suffix;
        
        textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
        
        // Set cursor position
        const newPosition = start + prefix.length + selectedText.length;
        textarea.setSelectionRange(newPosition, newPosition);
        textarea.focus();
    }
    
    static insertLink(textareaId) {
        const url = FormHelper.promptWithValidation('Enter URL:', FormHelper.validateUrl);
        if (!url) return;
        
        const text = FormHelper.promptWithValidation('Enter link text:') || url;
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        
        const markdown = `[${text}](${url})`;
        const start = textarea.selectionStart;
        
        textarea.value = textarea.value.substring(0, start) + markdown + textarea.value.substring(start);
        textarea.setSelectionRange(start + markdown.length, start + markdown.length);
        textarea.focus();
    }
    
    static insertImage(textareaId) {
        const url = FormHelper.promptWithValidation('Enter image URL:', FormHelper.validateUrl);
        if (!url) return;
        
        const alt = FormHelper.promptWithValidation('Enter alt text:') || 'Image';
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        
        const markdown = `![${alt}](${url})`;
        const start = textarea.selectionStart;
        
        textarea.value = textarea.value.substring(0, start) + markdown + textarea.value.substring(start);
        textarea.setSelectionRange(start + markdown.length, start + markdown.length);
        textarea.focus();
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APIClient,
        NotificationManager,
        CommentTreeManager,
        DropdownManager,
        FormHelper,
        DOMHelper,
        DateHelper,
        StorageHelper,
        MarkdownHelper,
        getAuthHeaders
    };
}