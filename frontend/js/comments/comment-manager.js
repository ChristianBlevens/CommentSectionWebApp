// Comment management functions
window.CommentManager = {
    // Load comments from server
    async loadComments() {
        this.loading = true;
        const pageKey = window.pageKey || document.querySelector('meta[name="page-key"]')?.content || window.location.pathname;
        
        try {
            const response = await fetch(`${API_URL}/api/comments?page_key=${encodeURIComponent(pageKey)}`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            const comments = await response.json();
            this.comments = comments;
            this.sortComments();
            
            // Process votes
            this.commentVotes = {};
            for (const comment of comments) {
                if (comment.user_vote) {
                    this.commentVotes[comment.id] = comment.user_vote;
                }
            }
            
            // Check if we need to focus on a specific comment
            const urlParams = new URLSearchParams(window.location.search);
            const focusId = urlParams.get('comment_id') || urlParams.get('focus');
            if (focusId) {
                await this.$nextTick();
                this.focusOnComment(focusId);
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        } finally {
            this.loading = false;
        }
    },
    
    // Sort comments based on selected criteria
    sortComments() {
        // Make a copy to avoid mutating original
        let sorted = [...this.comments];
        
        // Sort based on selected criteria
        switch (this.sortBy) {
            case 'newest':
                sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                break;
            case 'oldest':
                sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                break;
            case 'likes':
                sorted.sort((a, b) => b.likes - a.likes);
                break;
            case 'popularity':
                // Popularity = likes + total replies (recursive)
                const getPopularity = (comment) => {
                    const replies = this.comments.filter(c => c.parent_id === comment.id);
                    const replyCount = replies.length + replies.reduce((sum, reply) => sum + getPopularity(reply), 0);
                    return comment.likes + replyCount;
                };
                sorted.sort((a, b) => getPopularity(b) - getPopularity(a));
                break;
        }
        
        this.sortedComments = sorted;
        this.filterComments();
    },
    
    // Filter comments based on search query
    filterComments() {
        if (!this.commentSearchQuery.trim()) {
            this.filteredComments = this.sortedComments;
            return;
        }
        
        const queries = this.commentSearchQuery.toLowerCase().split(' ').filter(q => q.length > 0);
        
        this.filteredComments = this.sortedComments.filter(comment => {
            const content = comment.content.toLowerCase();
            const userName = comment.user_name.toLowerCase();
            const searchText = content + ' ' + userName;
            
            switch (this.searchMode) {
                case 'and':
                    // All terms must be present
                    return queries.every(query => searchText.includes(query));
                case 'or':
                    // At least one term must be present
                    return queries.some(query => searchText.includes(query));
                case 'not':
                    // None of the terms should be present
                    return !queries.some(query => searchText.includes(query));
                default:
                    return true;
            }
        });
    },
    
    // Submit a new comment or reply
    async submitComment() {
        if (!this.newCommentText.trim() || !this.user) return;
        
        const pageKey = window.pageKey || document.querySelector('meta[name="page-key"]')?.content || window.location.pathname;
        const payload = {
            content: this.newCommentText,
            page_key: pageKey,
            parent_id: this.replyingTo
        };
        
        try {
            const response = await fetch(`${API_URL}/api/comments`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            const comment = await response.json();
            this.comments.push(comment);
            this.newCommentText = '';
            this.commentPreview = '';
            this.replyingTo = null;
            this.sortComments();
            
            // Close mention dropdown
            this.mentionDropdown.show = false;
        } catch (error) {
            console.error('Error posting comment:', error);
        }
    }
};