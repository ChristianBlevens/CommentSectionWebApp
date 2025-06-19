// Comment management features
const Comments = {
    // Load all comments
    async loadComments(state) {
        state.loading = true;
        try {
            const data = await API.comments.getAll(state.pageId);
            state.comments = data.comments || [];
            state.commentVotes = data.user_votes || {};
            
            this.processComments(state);
            this.applySort(state);
            this.applySearch(state);
        } catch (error) {
            console.error('Error loading comments:', error);
            state.comments = [];
        } finally {
            state.loading = false;
        }
    },

    // Process comments into tree structure
    processComments(state) {
        const commentMap = {};
        const rootComments = [];
        
        // First pass: create comment map
        state.comments.forEach(comment => {
            comment.replies = [];
            commentMap[comment.id] = comment;
        });
        
        // Second pass: build tree structure
        state.comments.forEach(comment => {
            if (comment.parent_id && commentMap[comment.parent_id]) {
                commentMap[comment.parent_id].replies.push(comment);
            } else if (!comment.parent_id) {
                rootComments.push(comment);
            }
        });
        
        state.sortedComments = rootComments;
    },

    // Sort comments
    applySort(state) {
        const sortFn = this.getSortFunction(state.sortBy);
        this.sortCommentsRecursive(state.sortedComments, sortFn);
    },

    // Get sort function based on type
    getSortFunction(sortBy) {
        switch (sortBy) {
            case 'newest':
                return (a, b) => new Date(b.created_at) - new Date(a.created_at);
            case 'oldest':
                return (a, b) => new Date(a.created_at) - new Date(b.created_at);
            case 'likes':
            default:
                return (a, b) => (b.like_count - b.dislike_count) - (a.like_count - a.dislike_count);
        }
    },

    // Recursively sort comments and replies
    sortCommentsRecursive(comments, sortFn) {
        comments.sort(sortFn);
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                this.sortCommentsRecursive(comment.replies, sortFn);
            }
        });
    },

    // Search comments
    applySearch(state) {
        if (!state.commentSearchQuery) {
            state.filteredComments = state.sortedComments;
            return;
        }
        
        const terms = state.commentSearchQuery.toLowerCase().split(/\s+/).filter(t => t);
        state.filteredComments = this.filterCommentsRecursive(
            state.sortedComments, 
            terms, 
            state.searchMode
        );
    },

    // Recursively filter comments
    filterCommentsRecursive(comments, terms, mode) {
        return comments.reduce((acc, comment) => {
            const content = comment.content.toLowerCase();
            const username = comment.username.toLowerCase();
            const text = `${content} ${username}`;
            
            let matches = false;
            
            switch (mode) {
                case 'and':
                    matches = terms.every(term => text.includes(term));
                    break;
                case 'or':
                    matches = terms.some(term => text.includes(term));
                    break;
                case 'not':
                    matches = !terms.some(term => text.includes(term));
                    break;
            }
            
            const filteredReplies = comment.replies ? 
                this.filterCommentsRecursive(comment.replies, terms, mode) : [];
            
            if (matches || filteredReplies.length > 0) {
                acc.push({
                    ...comment,
                    replies: filteredReplies
                });
            }
            
            return acc;
        }, []);
    },

    // Create new comment
    async createComment(state) {
        if (!state.newCommentText.trim() || !AppState.hasPermission(state, 'comment')) return;
        
        try {
            const newComment = await API.comments.create(
                state.newCommentText,
                state.replyingTo,
                state.pageId
            );
            
            if (newComment) {
                state.comments.push(newComment);
                AppState.resetCommentForm(state);
                this.processComments(state);
                this.applySort(state);
                this.applySearch(state);
            }
        } catch (error) {
            console.error('Error creating comment:', error);
        }
    },

    // Update comment
    async updateComment(state, commentId) {
        try {
            const updated = await API.comments.update(commentId, state.editText);
            
            if (updated) {
                const index = state.comments.findIndex(c => c.id === commentId);
                if (index !== -1) {
                    state.comments[index] = updated;
                    this.processComments(state);
                    this.applySort(state);
                    this.applySearch(state);
                }
                state.editingComment = null;
                state.editText = '';
            }
        } catch (error) {
            console.error('Error updating comment:', error);
        }
    },

    // Delete comment
    async deleteComment(state, commentId) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        
        try {
            await API.comments.delete(commentId);
            state.comments = state.comments.filter(c => c.id !== commentId);
            this.processComments(state);
            this.applySort(state);
            this.applySearch(state);
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    },

    // Vote on comment
    async voteComment(state, commentId, voteType) {
        try {
            const result = await API.comments.vote(commentId, voteType);
            
            if (result) {
                // Update local state
                const comment = state.comments.find(c => c.id === commentId);
                if (comment) {
                    comment.like_count = result.like_count;
                    comment.dislike_count = result.dislike_count;
                }
                
                // Update vote tracking
                const currentVote = state.commentVotes[commentId];
                if (currentVote === voteType) {
                    delete state.commentVotes[commentId];
                } else {
                    state.commentVotes[commentId] = voteType;
                }
                
                // Re-sort if needed
                if (state.sortBy === 'likes') {
                    this.applySort(state);
                    this.applySearch(state);
                }
            }
        } catch (error) {
            console.error('Error voting:', error);
        }
    },

    // Focus on specific comment thread
    focusOnComment(state, commentId) {
        const findCommentPath = (comments, targetId, path = []) => {
            for (const comment of comments) {
                if (comment.id === targetId) {
                    return [...path, comment];
                }
                if (comment.replies) {
                    const found = findCommentPath(comment.replies, targetId, [...path, comment]);
                    if (found) return found;
                }
            }
            return null;
        };
        
        const path = findCommentPath(state.sortedComments, commentId);
        if (path) {
            state.focusedCommentId = commentId;
            state.focusedComments = [path[0]];
            state.highlightedCommentId = commentId;
            
            // Clear highlight after animation
            setTimeout(() => {
                state.highlightedCommentId = null;
            }, 2000);
        }
    },

    // Exit focus mode
    exitFocusMode(state) {
        state.focusedCommentId = null;
        state.focusedComments = [];
    },

    // Report comment
    async reportComment(state, commentId) {
        const reason = prompt('Why are you reporting this comment?');
        if (!reason) return;
        
        try {
            await API.reports.create(commentId, reason);
            alert('Comment reported successfully');
        } catch (error) {
            console.error('Error reporting comment:', error);
            alert('Failed to report comment');
        }
    },

    // Generate comment HTML
    renderComment(comment, state, level = 0) {
        const user = AppState.getCurrentUser(state);
        const userVote = state.commentVotes[comment.id];
        const isHighlighted = state.highlightedCommentId === comment.id;
        const canModerate = AppState.hasPermission(state, 'moderate');
        
        return `
            <div class="comment ${isHighlighted ? 'highlighted' : ''}" 
                 id="comment-${comment.id}" 
                 style="margin-left: ${level * 2}rem">
                <div class="comment-header">
                    <img src="${comment.avatar_url}" alt="${comment.username}" class="comment-avatar">
                    <div>
                        <span class="comment-author">${comment.username}</span>
                        <span class="comment-time">${Utils.getRelativeTime(comment.created_at)}</span>
                        ${comment.edited_at ? '<span class="comment-edited">(edited)</span>' : ''}
                    </div>
                </div>
                
                <div class="comment-content">
                    ${this.renderMarkdown(comment.content)}
                </div>
                
                <div class="comment-actions">
                    <button onclick="window.commentsInstance.voteComment(${comment.id}, 'like')"
                            class="vote-btn ${userVote === 'like' ? 'active' : ''}">
                        👍 ${comment.like_count}
                    </button>
                    <button onclick="window.commentsInstance.voteComment(${comment.id}, 'dislike')"
                            class="vote-btn ${userVote === 'dislike' ? 'active' : ''}">
                        👎 ${comment.dislike_count}
                    </button>
                    
                    ${user && !user.is_banned ? `
                        <button onclick="window.commentsInstance.startReply(${comment.id})"
                                class="action-btn">Reply</button>
                    ` : ''}
                    
                    ${user && user.id === comment.user_id ? `
                        <button onclick="window.commentsInstance.startEdit(${comment.id}, '${comment.content.replace(/'/g, "\\'")}')"
                                class="action-btn">Edit</button>
                        <button onclick="window.commentsInstance.deleteComment(${comment.id})"
                                class="action-btn delete">Delete</button>
                    ` : ''}
                    
                    ${user && user.id !== comment.user_id ? `
                        <button onclick="window.commentsInstance.reportComment(${comment.id})"
                                class="action-btn">Report</button>
                    ` : ''}
                    
                    ${canModerate && user.id !== comment.user_id ? `
                        <div class="comment-dropdown-container">
                            <button class="action-btn mod-action">Moderate ▼</button>
                            <div class="comment-dropdown">
                                <a onclick="window.commentsInstance.deleteComment(${comment.id})">Delete Comment</a>
                                <a onclick="window.moderationInstance.banUser('${comment.user_id}', '${comment.username}')">Ban User</a>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                ${comment.replies && comment.replies.length > 0 ? `
                    <div class="replies">
                        ${comment.replies.map(reply => 
                            this.renderComment(reply, state, level + 1)
                        ).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    },

    // Render markdown content
    renderMarkdown(text) {
        if (!window.md) {
            window.md = window.markdownit({
                html: false,
                breaks: true,
                linkify: true
            });
        }
        const processed = MarkdownProcessor.preprocessMarkdown(text);
        return window.md.render(processed);
    }
};