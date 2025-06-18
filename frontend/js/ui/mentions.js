// Mention dropdown functionality
const Mentions = {
    // Check for @ mentions while typing
    checkForMention(state, textarea) {
        const cursorPos = textarea.selectionStart;
        const text = textarea.value;
        const textBeforeCursor = text.substring(0, cursorPos);
        
        // Find last @ symbol
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex !== -1) {
            const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
            
            // Check if it's a valid mention context
            if (lastAtIndex === 0 || /\s/.test(text[lastAtIndex - 1])) {
                // Check if there's no space after @
                if (!textAfterAt.includes(' ')) {
                    state.mentionDropdown.searchTerm = textAfterAt.toLowerCase();
                    state.mentionDropdown.mentionStart = lastAtIndex;
                    this.updateMentionList(state);
                    return;
                }
            }
        }
        
        this.closeMentionDropdown(state);
    },

    // Update mention list based on search
    updateMentionList(state) {
        const searchTerm = state.mentionDropdown.searchTerm;
        
        // Get unique users from comments
        const userMap = new Map();
        state.comments.forEach(comment => {
            if (!userMap.has(comment.user_id)) {
                userMap.set(comment.user_id, {
                    id: comment.user_id,
                    username: comment.username,
                    avatar_url: comment.avatar_url
                });
            }
        });
        
        // Filter users
        let filteredUsers = Array.from(userMap.values());
        if (searchTerm) {
            filteredUsers = filteredUsers.filter(user => 
                user.username.toLowerCase().includes(searchTerm)
            );
        }
        
        // Limit to 10 users
        filteredUsers = filteredUsers.slice(0, 10);
        
        if (filteredUsers.length > 0) {
            state.mentionDropdown.users = filteredUsers;
            state.mentionDropdown.show = true;
            state.mentionDropdown.selectedIndex = 0;
        } else {
            this.closeMentionDropdown(state);
        }
    },

    // Close mention dropdown
    closeMentionDropdown(state) {
        AppState.resetMentionDropdown(state);
    },

    // Handle mention selection
    selectMention(state, user, textarea) {
        const start = state.mentionDropdown.mentionStart;
        const currentText = textarea.value;
        const beforeMention = currentText.substring(0, start);
        const afterCursor = currentText.substring(textarea.selectionStart);
        
        const mentionText = `@${user.username}[${user.id}] `;
        const newText = beforeMention + mentionText + afterCursor;
        
        textarea.value = newText;
        
        // Set cursor after mention
        const newCursorPos = start + mentionText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
        
        this.closeMentionDropdown(state);
    },

    // Handle keyboard navigation
    handleMentionKeyboard(state, event, textarea) {
        if (!state.mentionDropdown.show) return false;
        
        const { users, selectedIndex } = state.mentionDropdown;
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                state.mentionDropdown.selectedIndex = 
                    (selectedIndex + 1) % users.length;
                return true;
                
            case 'ArrowUp':
                event.preventDefault();
                state.mentionDropdown.selectedIndex = 
                    selectedIndex === 0 ? users.length - 1 : selectedIndex - 1;
                return true;
                
            case 'Enter':
            case 'Tab':
                event.preventDefault();
                if (users[selectedIndex]) {
                    this.selectMention(state, users[selectedIndex], textarea);
                }
                return true;
                
            case 'Escape':
                event.preventDefault();
                this.closeMentionDropdown(state);
                return true;
        }
        
        return false;
    },

    // Generate mention dropdown HTML
    renderDropdown(state) {
        if (!state.mentionDropdown.show) return '';
        
        const { users, selectedIndex } = state.mentionDropdown;
        
        return `
            <div class="mention-dropdown">
                ${users.map((user, index) => `
                    <div class="mention-item ${index === selectedIndex ? 'selected' : ''}"
                         onclick="window.mentionsInstance.selectMention(${user.id}, '${user.username}')">
                        <img src="${user.avatar_url}" alt="${user.username}" class="mention-avatar">
                        <span>${user.username}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
};