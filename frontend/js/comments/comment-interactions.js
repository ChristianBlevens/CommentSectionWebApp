// Comment interaction functions
window.CommentInteractions = {
    // Handle mention dropdown
    handleMentionInput(event) {
        const textarea = event.target;
        const text = textarea.value;
        const cursorPos = textarea.selectionStart;
        
        // Find if we're in a mention
        let mentionStart = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (text[i] === '@') {
                mentionStart = i;
                break;
            } else if (text[i] === ' ' || text[i] === '\n') {
                break;
            }
        }
        
        if (mentionStart !== -1) {
            const searchTerm = text.substring(mentionStart + 1, cursorPos).toLowerCase();
            this.mentionDropdown.searchTerm = searchTerm;
            this.mentionDropdown.mentionStart = mentionStart;
            
            // Get unique users from comments
            const users = [...new Set(this.comments.map(c => ({
                id: c.user_id,
                name: c.user_name
            })).filter(u => u.name.toLowerCase().includes(searchTerm)))];
            
            // Remove duplicates by user ID
            const uniqueUsers = users.filter((user, index, self) =>
                index === self.findIndex(u => u.id === user.id)
            );
            
            this.mentionDropdown.users = uniqueUsers.slice(0, 5);
            this.mentionDropdown.show = uniqueUsers.length > 0;
            this.mentionDropdown.selectedIndex = -1;
        } else {
            this.mentionDropdown.show = false;
        }
    },
    
    selectMention(user, textareaId = 'comment-input') {
        const textarea = document.getElementById(textareaId);
        const text = textarea.value;
        const before = text.substring(0, this.mentionDropdown.mentionStart);
        const after = text.substring(textarea.selectionStart);
        
        textarea.value = before + '@' + user.name + ' ' + after;
        textarea.focus();
        textarea.setSelectionRange(
            this.mentionDropdown.mentionStart + user.name.length + 2,
            this.mentionDropdown.mentionStart + user.name.length + 2
        );
        
        this.mentionDropdown.show = false;
        
        // Update model
        if (textareaId === 'comment-input') {
            this.newCommentText = textarea.value;
        } else if (textareaId.startsWith('edit-')) {
            this.editText = textarea.value;
        }
    },
    
    // Vote on a comment
    async voteComment(commentId, voteType) {
        if (!this.user) {
            await this.signInWithDiscord();
            return;
        }
        
        const currentVote = this.commentVotes[commentId];
        let newVote = voteType;
        
        // Toggle vote if clicking same type
        if (currentVote === voteType) {
            newVote = null;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/comments/${commentId}/vote`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ vote_type: newVote })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            const result = await response.json();
            
            // Update local state
            const comment = this.comments.find(c => c.id === commentId);
            if (comment) {
                comment.likes = result.likes;
                comment.dislikes = result.dislikes;
            }
            
            // Update vote tracking
            if (newVote) {
                this.commentVotes[commentId] = newVote;
            } else {
                delete this.commentVotes[commentId];
            }
        } catch (error) {
            console.error('Error voting:', error);
        }
    },
    
    // Start replying to a comment
    startReply(commentId) {
        if (!this.user) {
            this.signInWithDiscord();
            return;
        }
        this.replyingTo = commentId;
        this.$nextTick(() => {
            document.getElementById('comment-input')?.focus();
        });
    },
    
    // Cancel reply
    cancelReply() {
        this.replyingTo = null;
        this.newCommentText = '';
        this.commentPreview = '';
    },
    
    // Start editing a comment
    startEdit(comment) {
        this.editingComment = comment.id;
        this.editText = comment.content;
    },
    
    // Cancel edit
    cancelEdit() {
        this.editingComment = null;
        this.editText = '';
    },
    
    // Save edited comment
    async saveEdit() {
        if (!this.editText.trim()) return;
        
        try {
            const response = await fetch(`${API_URL}/api/comments/${this.editingComment}`, {
                method: 'PUT',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ content: this.editText })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            const updated = await response.json();
            const index = this.comments.findIndex(c => c.id === this.editingComment);
            if (index !== -1) {
                this.comments[index] = updated;
                this.sortComments();
            }
            
            this.editingComment = null;
            this.editText = '';
        } catch (error) {
            console.error('Error updating comment:', error);
        }
    },
    
    // Delete a comment
    async deleteComment(commentId, isModerator = false) {
        const confirmMsg = isModerator ? 
            'Delete this comment as a moderator?' : 
            'Are you sure you want to delete this comment?';
            
        if (!confirm(confirmMsg)) return;
        
        let reason = null;
        if (isModerator) {
            reason = prompt('Reason for deletion (optional):');
        }
        
        try {
            const url = `${API_URL}/api/comments/${commentId}${isModerator ? '?moderate=true' : ''}`;
            const body = isModerator && reason ? JSON.stringify({ reason }) : undefined;
            
            const response = await fetch(url, {
                method: 'DELETE',
                headers: window.ApiClient.getAuthHeaders(),
                body
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            // Update local state to mark as deleted
            const comment = this.comments.find(c => c.id === commentId);
            if (comment) {
                comment.deleted = true;
                comment.content = '[deleted]';
                comment.deleted_at = new Date().toISOString();
                comment.deleted_by_moderator = isModerator;
                this.sortComments();
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    },
    
    // Report a comment
    async reportComment(commentId) {
        const reason = prompt('Why are you reporting this comment?');
        if (!reason) return;
        
        try {
            const response = await fetch(`${API_URL}/api/reports`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({
                    comment_id: commentId,
                    reason: reason
                })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            alert('Report submitted. Thank you for helping keep our community safe.');
        } catch (error) {
            console.error('Error reporting comment:', error);
            alert('Failed to submit report. Please try again.');
        }
    },
    
    // Focus on a specific comment thread
    focusOnComment(commentId) {
        this.focusedCommentId = commentId;
        
        // Build the focused comment tree
        const buildThread = (id) => {
            const comment = this.comments.find(c => c.id === id);
            if (!comment) return [];
            
            const thread = [comment];
            
            // Add all ancestors
            let current = comment;
            while (current.parent_id) {
                const parent = this.comments.find(c => c.id === current.parent_id);
                if (parent) {
                    thread.unshift(parent);
                    current = parent;
                } else {
                    break;
                }
            }
            
            // Add all descendants recursively
            const addDescendants = (parentId) => {
                const children = this.comments.filter(c => c.parent_id === parentId);
                children.forEach(child => {
                    thread.push(child);
                    addDescendants(child.id);
                });
            };
            
            addDescendants(commentId);
            
            return thread;
        };
        
        this.focusedComments = buildThread(commentId);
        this.highlightedCommentId = commentId;
        
        // Scroll to the comment
        this.$nextTick(() => {
            const element = document.getElementById(`comment-${commentId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    },
    
    // Exit focus mode
    exitFocusMode() {
        this.focusedCommentId = null;
        this.focusedComments = [];
        this.highlightedCommentId = null;
        
        // Remove focus parameter from URL
        const url = new URL(window.location);
        url.searchParams.delete('comment_id');
        url.searchParams.delete('focus');
        window.history.replaceState({}, '', url);
    },
    
    // Build tree structure from flat comments
    buildCommentTree(comments, parentId = null) {
        return comments
            .filter(comment => comment.parent_id === parentId)
            .map(comment => ({
                ...comment,
                replies: this.buildCommentTree(comments, comment.id)
            }));
    }
};