// Comment rendering functions
window.CommentRenderer = {
    // Main function to render a comment
    renderComment(comment, depth = 0, isPreview = false) {
        const isDeleted = comment.deleted || comment.deleted_at;
        const isFocused = this.highlightedCommentId === comment.id;
        const isOwnComment = this.user && comment.user_id === this.user.id;
        const userVote = this.commentVotes[comment.id];
        
        let commentHTML = `
            <div id="comment-${comment.id}" class="comment-container ${isFocused ? 'highlighted' : ''} ${isDeleted ? 'deleted' : ''}" style="margin-left: ${Math.min(depth * 20, 100)}px;">
                <div class="comment-header">
                    <span class="comment-author">${isDeleted ? '[deleted]' : comment.user_name}</span>
                    <span class="comment-time">${window.GeneralHelpers.getRelativeTime(comment.created_at)}</span>
                    ${comment.edited_at && !isDeleted ? '<span class="comment-edited">(edited)</span>' : ''}
                    ${comment.deleted_by_moderator ? '<span class="deleted-by-mod">[Removed by moderator]</span>' : ''}
                </div>
                
                <div class="comment-content ${this.editingComment === comment.id ? 'editing' : ''}">
                    ${this.editingComment === comment.id ? `
                        <div class="edit-form">
                            <textarea 
                                id="edit-${comment.id}" 
                                x-model="editText" 
                                @input="handleMentionInput($event)"
                                class="edit-input"
                                rows="4"
                            >${this.editText}</textarea>
                            <div x-show="mentionDropdown.show" class="mention-dropdown" style="display: none;">
                                <template x-for="(user, index) in mentionDropdown.users" :key="user.id">
                                    <div 
                                        @click="selectMention(user, 'edit-${comment.id}')"
                                        :class="{'selected': index === mentionDropdown.selectedIndex}"
                                        class="mention-item"
                                        x-text="user.name"
                                    ></div>
                                </template>
                            </div>
                            <div class="edit-preview markdown-preview" x-html="renderMarkdown(editText)"></div>
                            <div class="edit-actions">
                                <button @click="saveEdit()" class="btn btn-primary">Save</button>
                                <button @click="cancelEdit()" class="btn btn-secondary">Cancel</button>
                            </div>
                        </div>
                    ` : `
                        <div class="comment-text ${!isDeleted && (isOwnComment || (this.user && this.user.is_moderator)) ? 'has-actions' : ''}">
                            ${isDeleted ? '<p>[deleted]</p>' : `<div class="markdown-content" x-html="renderMarkdown('${comment.content.replace(/'/g, "\\'")}')"></div>`}
                            
                            ${!isDeleted && (isOwnComment || (this.user && this.user.is_moderator)) ? `
                                <div class="comment-dropdown-container">
                                    <button class="comment-menu-btn" @click="toggleDropdown('${comment.id}', $event)">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                            <circle cx="8" cy="2" r="1.5"/>
                                            <circle cx="8" cy="8" r="1.5"/>
                                            <circle cx="8" cy="14" r="1.5"/>
                                        </svg>
                                    </button>
                                    <div id="dropdown-${comment.id}" class="comment-dropdown">
                                        ${isOwnComment ? `
                                            <button @click="startEdit(${JSON.stringify(comment).replace(/"/g, '&quot;')})" class="dropdown-item">
                                                Edit
                                            </button>
                                            <button @click="deleteComment('${comment.id}')" class="dropdown-item delete">
                                                Delete
                                            </button>
                                        ` : ''}
                                        ${this.user && this.user.is_moderator && !isOwnComment ? `
                                            <button @click="deleteComment('${comment.id}', true)" class="dropdown-item delete">
                                                Delete (Moderator)
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `}
                </div>
                
                ${!isDeleted && !isPreview ? `
                    <div class="comment-actions">
                        <button 
                            @click="voteComment('${comment.id}', 'like')" 
                            class="vote-btn ${userVote === 'like' ? 'active' : ''}"
                            title="${this.user ? 'Like' : 'Sign in to like'}"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M7 10V3H9C10 3 11 4 11 5V6H14V8H12L11 10M7 10H3M7 10V14M3 10V14"/>
                            </svg>
                            <span>${comment.likes || 0}</span>
                        </button>
                        
                        <button 
                            @click="voteComment('${comment.id}', 'dislike')" 
                            class="vote-btn ${userVote === 'dislike' ? 'active' : ''}"
                            title="${this.user ? 'Dislike' : 'Sign in to dislike'}"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 6V13H7C6 13 5 12 5 11V10H2V8H4L5 6M9 6H13M9 6V2M13 6V2"/>
                            </svg>
                            <span>${comment.dislikes || 0}</span>
                        </button>
                        
                        <button @click="startReply('${comment.id}')" class="reply-btn">
                            Reply
                        </button>
                        
                        ${!isOwnComment ? `
                            <button @click="reportComment('${comment.id}')" class="report-btn" title="Report comment">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M2 2v12h12V2H2zm2 2h8v8H4V4zm2 2v4h4V6H6z"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
                
                ${this.replyingTo === comment.id ? `
                    <div class="reply-form">
                        <div class="reply-header">
                            Replying to ${comment.user_name}
                            <button @click="cancelReply()" class="cancel-reply">×</button>
                        </div>
                        <textarea 
                            id="comment-input"
                            x-model="newCommentText" 
                            @input="handleMentionInput($event)"
                            placeholder="Write a reply..."
                            rows="3"
                            class="reply-input"
                        ></textarea>
                        <div x-show="mentionDropdown.show" class="mention-dropdown" style="display: none;">
                            <template x-for="(user, index) in mentionDropdown.users" :key="user.id">
                                <div 
                                    @click="selectMention(user)"
                                    :class="{'selected': index === mentionDropdown.selectedIndex}"
                                    class="mention-item"
                                    x-text="user.name"
                                ></div>
                            </template>
                        </div>
                        <div x-show="newCommentText" class="reply-preview markdown-preview" x-html="renderMarkdown(newCommentText)"></div>
                        <div class="reply-actions">
                            <button @click="submitComment()" :disabled="!newCommentText.trim()" class="btn btn-primary">
                                Post Reply
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Add replies if not in preview mode
        if (!isPreview) {
            const replies = this.comments.filter(c => c.parent_id === comment.id);
            if (replies.length > 0) {
                commentHTML += '<div class="replies">';
                replies.forEach(reply => {
                    commentHTML += this.renderComment(reply, depth + 1);
                });
                commentHTML += '</div>';
            }
        }
        
        return commentHTML;
    },
    
    // Toggle dropdown menu
    toggleDropdown(commentId, event) {
        event.stopPropagation();
        const dropdown = document.getElementById(`dropdown-${commentId}`);
        const wasShown = dropdown.classList.contains('show');
        
        // Close all other dropdowns
        document.querySelectorAll('.comment-dropdown.show').forEach(d => {
            d.classList.remove('show');
        });
        
        // Remove has-open-dropdown from all comments
        document.querySelectorAll('.comment-content.has-open-dropdown').forEach(c => {
            c.classList.remove('has-open-dropdown');
        });
        
        if (!wasShown) {
            dropdown.classList.add('show');
            // Add class to comment content for styling
            dropdown.closest('.comment-content')?.classList.add('has-open-dropdown');
        }
    }
};