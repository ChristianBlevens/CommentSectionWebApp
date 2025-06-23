class MentionHandler {
    constructor(textarea, onSelect) {
        this.textarea = textarea;
        this.onSelect = onSelect;
        this.dropdown = null;
        this.users = [];
        this.selectedIndex = -1;
        this.mentionStart = 0;
        this.searchTerm = '';
        this.isSearching = false;
        
        this.bindEvents();
        this.createDropdown();
    }
    
    bindEvents() {
        this.textarea.addEventListener('input', this.handleInput.bind(this));
        this.textarea.addEventListener('keydown', this.handleKeydown.bind(this));
        this.textarea.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown(), 200);
        });
    }
    
    createDropdown() {
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'mention-dropdown';
        this.dropdown.style.display = 'none';
        this.dropdown.style.position = 'absolute';
        this.dropdown.style.zIndex = '1000';
        
        // Insert dropdown after textarea
        this.textarea.parentNode.insertBefore(this.dropdown, this.textarea.nextSibling);
    }
    
    handleInput(event) {
        const { value, selectionStart } = this.textarea;
        const textBeforeCursor = value.substring(0, selectionStart);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            this.searchTerm = mentionMatch[1];
            this.mentionStart = mentionMatch.index + 1;
            
            // Debug logging
            console.debug('Mention detected:', {
                searchTerm: this.searchTerm,
                length: this.searchTerm.length
            });
            
            // Search for users for any length of search term (including empty string and single characters)
            this.searchUsers();
        } else {
            this.hideDropdown();
        }
    }
    
    async searchUsers() {
        if (this.isSearching) return;
        this.isSearching = true;
        
        try {
            // Fix for single character search
            let searchUrl = `${API_URL || window.location.origin}/api/mention-users?q=${encodeURIComponent(this.searchTerm)}`;
            
            // If single character, use empty search and filter client-side
            if (this.searchTerm.length === 1) {
                const response = await fetch(`${API_URL || window.location.origin}/api/mention-users?q=`, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const allUsers = await response.json();
                    // Handle both array response and object with users property
                    const userArray = Array.isArray(allUsers) ? allUsers : (allUsers.users || []);
                    this.users = userArray.filter(user => 
                        user.name.toLowerCase().startsWith(this.searchTerm.toLowerCase())
                    ).slice(0, 5);
                    this.showDropdown();
                }
            } else {
                // Normal search for 0 or 2+ characters
                const response = await fetch(searchUrl, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    // Handle both array response and object with users property
                    this.users = Array.isArray(data) ? data : (data.users || []);
                    this.showDropdown();
                } else if (response.status === 401) {
                    // Session expired
                    if (typeof handleAuthError === 'function') {
                        await handleAuthError(response);
                    }
                    this.hideDropdown();
                }
            }
        } catch (error) {
            console.error('User search error:', error);
            this.hideDropdown();
        } finally {
            this.isSearching = false;
        }
    }
    
    showDropdown() {
        if (this.users.length === 0) {
            this.hideDropdown();
            return;
        }
        
        this.selectedIndex = -1;
        this.dropdown.innerHTML = '';
        
        this.users.forEach((user, index) => {
            const item = document.createElement('div');
            item.className = 'mention-dropdown-item';
            if (index === this.selectedIndex) {
                item.classList.add('selected');
            }
            
            // Create user display with avatar
            const avatar = document.createElement('img');
            avatar.src = user.avatar || '/images/default-avatar.png';
            avatar.className = 'mention-avatar';
            avatar.alt = user.name;
            
            const name = document.createElement('span');
            name.textContent = user.name;
            name.className = 'mention-name';
            
            item.appendChild(avatar);
            item.appendChild(name);
            
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectUser(user);
            });
            
            this.dropdown.appendChild(item);
        });
        
        this.dropdown.style.display = 'block';
        this.positionDropdown();
    }
    
    positionDropdown() {
        // Get textarea position and dimensions
        const rect = this.textarea.getBoundingClientRect();
        const textareaStyle = window.getComputedStyle(this.textarea);
        
        // Position dropdown below cursor position
        // This is a simplified version - in production you might want more precise positioning
        this.dropdown.style.left = '0';
        this.dropdown.style.top = `${this.textarea.offsetHeight}px`;
        this.dropdown.style.width = `${rect.width}px`;
    }
    
    hideDropdown() {
        this.dropdown.style.display = 'none';
        this.users = [];
        this.selectedIndex = -1;
    }
    
    handleKeydown(event) {
        if (this.dropdown.style.display === 'none') return;
        
        const { key } = event;
        if (key === 'ArrowDown') {
            event.preventDefault();
            this.selectedIndex = Math.min(
                this.selectedIndex + 1, 
                this.users.length - 1
            );
            this.updateSelection();
        } else if (key === 'ArrowUp') {
            event.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
            this.updateSelection();
        } else if (key === 'Enter' && this.selectedIndex >= 0) {
            event.preventDefault();
            this.selectUser(this.users[this.selectedIndex]);
        } else if (key === 'Escape') {
            this.hideDropdown();
        }
    }
    
    updateSelection() {
        const items = this.dropdown.querySelectorAll('.mention-dropdown-item');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    selectUser(user) {
        const before = this.textarea.value.substring(0, this.mentionStart - 1);
        const after = this.textarea.value.substring(this.textarea.selectionStart);
        
        this.textarea.value = before + `@${user.name} ` + after;
        
        // Trigger input event for any listeners
        const event = new Event('input', { bubbles: true });
        this.textarea.dispatchEvent(event);
        
        this.hideDropdown();
        
        // Set cursor position after mention
        const newPosition = this.mentionStart - 1 + `@${user.name} `.length;
        this.textarea.setSelectionRange(newPosition, newPosition);
        this.textarea.focus();
        
        // Call the onSelect callback if provided
        if (this.onSelect) {
            this.onSelect(user);
        }
    }
    
    destroy() {
        this.textarea.removeEventListener('input', this.handleInput);
        this.textarea.removeEventListener('keydown', this.handleKeydown);
        if (this.dropdown && this.dropdown.parentNode) {
            this.dropdown.parentNode.removeChild(this.dropdown);
        }
    }
}

// Helper function to get auth headers if not globally available
if (typeof getAuthHeaders === 'undefined') {
    window.getAuthHeaders = function() {
        const sessionToken = localStorage.getItem('auth_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }
        return headers;
    };
}