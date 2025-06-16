// Moderation UI renderer for moderation interface
import { DomUtils, DateUtils, StringUtils } from '../../utils/index.js';

export class ModerationUI {
  constructor(moderationModule) {
    this.moderation = moderationModule;
    this.container = null;
  }

  // Render moderation dashboard
  renderDashboard(container) {
    this.container = container;
    
    if (!this.moderation.state.isModerator) {
      this.container.innerHTML = '<p>Access denied. Moderator privileges required.</p>';
      return;
    }
    
    const dashboardHtml = `
      <div class="moderation-dashboard">
        <div class="moderation-header">
          <h2>Moderation Dashboard</h2>
          ${this.renderReportCount()}
        </div>
        
        <div class="moderation-tabs">
          <button class="tab-btn active" data-tab="reports">
            Reports ${this.moderation.state.totalPendingReports > 0 ? `(${this.moderation.state.totalPendingReports})` : ''}
          </button>
          <button class="tab-btn" data-tab="users">Users</button>
          <button class="tab-btn" data-tab="logs">Activity Logs</button>
        </div>
        
        <div class="moderation-content">
          <div class="tab-content active" data-tab="reports">
            ${this.renderReportsTab()}
          </div>
          <div class="tab-content" data-tab="users">
            ${this.renderUsersTab()}
          </div>
          <div class="tab-content" data-tab="logs">
            ${this.renderLogsTab()}
          </div>
        </div>
      </div>
    `;
    
    this.container.innerHTML = dashboardHtml;
    this.setupEventHandlers();
  }

  // Render report count
  renderReportCount() {
    if (this.moderation.state.totalPendingReports === 0) {
      return '';
    }
    
    return `
      <span class="report-count">
        <i class="fas fa-exclamation-triangle"></i>
        ${this.moderation.state.totalPendingReports} pending reports
      </span>
    `;
  }

  // Render reports tab
  renderReportsTab() {
    if (!this.moderation.state.reportsLoaded) {
      return this.renderLoadingState('Loading reports...');
    }
    
    if (this.moderation.state.reports.length === 0) {
      return this.renderEmptyState('No pending reports');
    }
    
    return `
      <div class="reports-section">
        ${this.renderPageFilter()}
        ${this.renderReportsList()}
      </div>
    `;
  }

  // Render page filter
  renderPageFilter() {
    const pages = this.moderation.state.filteredPages;
    
    return `
      <div class="page-filter">
        <div class="filter-dropdown">
          <button class="filter-dropdown-toggle" onclick="moderationModule.togglePageDropdown()">
            <i class="fas fa-filter"></i>
            ${this.moderation.state.selectedReportsPage === 'all' ? 'All Pages' : this.moderation.state.selectedReportsPage}
            <i class="fas fa-chevron-down"></i>
          </button>
          
          <div class="filter-dropdown-menu ${this.moderation.state.showPageDropdown ? 'show' : ''}">
            <input type="text" 
                   class="filter-search" 
                   placeholder="Search pages..."
                   value="${this.moderation.state.pageSearchQuery}"
                   oninput="moderationModule.searchPages(this.value)">
            
            <div class="filter-options">
              <button class="filter-option ${this.moderation.state.selectedReportsPage === 'all' ? 'active' : ''}"
                      onclick="moderationModule.selectReportsPage('all')">
                All Pages (${this.moderation.state.reports.length})
              </button>
              
              ${pages.map(page => `
                <button class="filter-option ${this.moderation.state.selectedReportsPage === page ? 'active' : ''}"
                        onclick="moderationModule.selectReportsPage('${StringUtils.escapeHtml(page)}')">
                  ${StringUtils.truncate(page, 50)}
                  (${this.moderation.state.reports.filter(r => r.page_url === page).length})
                </button>
              `).join('')}
            </div>
          </div>
        </div>
        
        <span class="filter-count">
          ${this.moderation.state.filteredReports.length} reports
        </span>
      </div>
    `;
  }

  // Render reports list
  renderReportsList() {
    return `
      <div class="reports-list">
        ${this.moderation.state.filteredReports.map(report => this.renderReport(report)).join('')}
      </div>
    `;
  }

  // Render single report
  renderReport(report) {
    return `
      <div class="report-item" data-report-id="${report.id}">
        <div class="report-header">
          <div class="report-meta">
            <span class="report-author">
              Reported by: ${StringUtils.escapeHtml(report.reporter_name)}
            </span>
            <span class="report-time">
              ${DateUtils.getRelativeTime(report.created_at)}
            </span>
          </div>
          <div class="report-actions">
            <button class="btn btn-small btn-danger" 
                    onclick="moderationModule.deleteReportedComment('${report.id}')">
              Delete Comment
            </button>
            <button class="btn btn-small btn-secondary" 
                    onclick="moderationModule.dismissReport('${report.id}')">
              Dismiss
            </button>
          </div>
        </div>
        
        <div class="report-reason">
          <strong>Reason:</strong> ${StringUtils.escapeHtml(report.reason)}
        </div>
        
        <div class="reported-comment">
          <div class="comment-author">
            ${StringUtils.escapeHtml(report.comment_author)}
            <span class="comment-time">
              ${DateUtils.getRelativeTime(report.comment_created_at)}
            </span>
          </div>
          <div class="comment-content">
            ${report.comment_content_html || StringUtils.escapeHtml(report.comment_content)}
          </div>
        </div>
        
        <div class="report-page">
          <i class="fas fa-link"></i>
          <a href="${StringUtils.escapeHtml(report.page_url)}" target="_blank">
            ${StringUtils.truncate(report.page_url, 60)}
          </a>
        </div>
      </div>
    `;
  }

  // Render users tab
  renderUsersTab() {
    if (!this.moderation.state.usersLoaded) {
      return this.renderLoadingState('Loading users...');
    }
    
    return `
      <div class="users-section">
        ${this.renderUserFilters()}
        ${this.renderUsersList()}
        ${this.renderUsersPagination()}
      </div>
    `;
  }

  // Render user filters
  renderUserFilters() {
    return `
      <div class="user-filters">
        <input type="text" 
               class="user-search" 
               placeholder="Search users..."
               value="${this.moderation.state.userSearchQuery}"
               oninput="moderationModule.searchUsers(this.value)">
        
        <div class="filter-buttons">
          <button class="filter-btn ${this.moderation.state.userFilter === 'all' ? 'active' : ''}"
                  onclick="moderationModule.setUserFilter('all')">
            All
          </button>
          <button class="filter-btn ${this.moderation.state.userFilter === 'active' ? 'active' : ''}"
                  onclick="moderationModule.setUserFilter('active')">
            Active
          </button>
          <button class="filter-btn ${this.moderation.state.userFilter === 'banned' ? 'active' : ''}"
                  onclick="moderationModule.setUserFilter('banned')">
            Banned
          </button>
          <button class="filter-btn ${this.moderation.state.userFilter === 'warned' ? 'active' : ''}"
                  onclick="moderationModule.setUserFilter('warned')">
            Warned
          </button>
          <button class="filter-btn ${this.moderation.state.userFilter === 'moderators' ? 'active' : ''}"
                  onclick="moderationModule.setUserFilter('moderators')">
            Moderators
          </button>
        </div>
      </div>
    `;
  }

  // Render users list
  renderUsersList() {
    if (this.moderation.state.paginatedUsers.length === 0) {
      return this.renderEmptyState('No users found');
    }
    
    return `
      <div class="users-list">
        ${this.moderation.state.paginatedUsers.map(user => this.renderUser(user)).join('')}
      </div>
    `;
  }

  // Render single user
  renderUser(user) {
    const isExpanded = this.moderation.state.expandedUsers.has(user.id);
    const showBanDropdown = this.moderation.state.showBanDropdown.get(user.id);
    
    return `
      <div class="user-item ${isExpanded ? 'expanded' : ''}" data-user-id="${user.id}">
        <div class="user-header">
          <div class="user-info">
            ${user.avatar_url ? `
              <img class="user-avatar" src="${user.avatar_url}" alt="${user.username}">
            ` : `
              <div class="user-avatar default">${StringUtils.getInitials(user.display_name || user.username)}</div>
            `}
            
            <div class="user-details">
              <div class="user-name">
                ${StringUtils.escapeHtml(user.display_name || user.username)}
                ${user.is_moderator ? '<span class="mod-badge">MOD</span>' : ''}
                ${user.is_banned ? '<span class="banned-badge">BANNED</span>' : ''}
              </div>
              <div class="user-meta">
                ID: ${user.id} | 
                Joined: ${DateUtils.formatDate(user.created_at, 'short')} |
                Comments: ${user.total_comments || 0} |
                Warnings: ${user.warning_count || 0}
              </div>
            </div>
          </div>
          
          <div class="user-actions">
            ${!user.is_banned ? `
              <div class="ban-dropdown-container">
                <button class="btn btn-small btn-danger" 
                        onclick="moderationModule.toggleBanDropdown('${user.id}', event)">
                  Ban User <i class="fas fa-chevron-down"></i>
                </button>
                
                <div class="ban-dropdown ${showBanDropdown ? 'show' : ''}">
                  <button onclick="moderationModule.banUser('${user.id}', '${user.username}', '1h', 'Temporary ban')">
                    1 Hour
                  </button>
                  <button onclick="moderationModule.banUser('${user.id}', '${user.username}', '24h', 'Temporary ban')">
                    24 Hours
                  </button>
                  <button onclick="moderationModule.banUser('${user.id}', '${user.username}', '7d', 'Temporary ban')">
                    7 Days
                  </button>
                  <button onclick="moderationModule.banUser('${user.id}', '${user.username}', '30d', 'Temporary ban')">
                    30 Days
                  </button>
                  <button onclick="moderationModule.banUser('${user.id}', '${user.username}', 'permanent', 'Permanent ban')">
                    Permanent
                  </button>
                  <button onclick="moderationModule.showCustomBanInput('${user.id}', '${user.username}')">
                    Custom Duration...
                  </button>
                </div>
              </div>
              
              <button class="btn btn-small btn-warning" 
                      onclick="moderationModule.warnUser('${user.id}')">
                Warn
              </button>
            ` : `
              <button class="btn btn-small btn-success" 
                      onclick="moderationModule.unbanUser('${user.id}')">
                Unban
              </button>
            `}
            
            ${this.moderation.state.isSuperModerator ? `
              <button class="btn btn-small ${user.is_moderator ? 'btn-secondary' : 'btn-primary'}" 
                      onclick="moderationModule.toggleModerator('${user.id}')">
                ${user.is_moderator ? 'Remove Mod' : 'Make Mod'}
              </button>
            ` : ''}
            
            <button class="btn btn-small btn-text" 
                    onclick="moderationModule.toggleUserExpanded('${user.id}')">
              <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
            </button>
          </div>
        </div>
        
        ${isExpanded ? this.renderUserExpanded(user) : ''}
      </div>
    `;
  }

  // Render expanded user details
  renderUserExpanded(user) {
    const displayCount = this.moderation.state.userCommentsDisplayCount.get(user.id) || 5;
    const comments = user.recent_comments || [];
    const displayedComments = comments.slice(0, displayCount);
    
    return `
      <div class="user-expanded">
        ${user.ban_expires_at ? `
          <div class="ban-info">
            <i class="fas fa-ban"></i>
            Ban expires: ${DateUtils.formatDate(user.ban_expires_at)}
          </div>
        ` : ''}
        
        ${comments.length > 0 ? `
          <div class="user-comments">
            <h4>Recent Comments</h4>
            ${displayedComments.map(comment => `
              <div class="user-comment">
                <div class="comment-header">
                  <span class="comment-time">
                    ${DateUtils.getRelativeTime(comment.created_at)}
                  </span>
                  <button class="btn btn-tiny btn-danger" 
                          onclick="moderationModule.deleteUserComment('${user.id}', '${comment.id}')">
                    Delete
                  </button>
                </div>
                <div class="comment-content">
                  ${comment.content_html || StringUtils.escapeHtml(comment.content)}
                </div>
              </div>
            `).join('')}
            
            ${comments.length > displayCount ? `
              <button class="btn btn-text" 
                      onclick="moderationModule.loadMoreUserComments('${user.id}')">
                Show more (${comments.length - displayCount} remaining)
              </button>
            ` : ''}
          </div>
        ` : `
          <p class="no-comments">No recent comments</p>
        `}
      </div>
    `;
  }

  // Render users pagination
  renderUsersPagination() {
    if (this.moderation.state.totalUserPages <= 1) return '';
    
    return `
      <div class="pagination">
        <button class="page-btn" 
                onclick="moderationModule.setUserPage(${this.moderation.state.currentUserPage - 1})"
                ${this.moderation.state.currentUserPage === 1 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i>
        </button>
        
        <span class="page-info">
          Page ${this.moderation.state.currentUserPage} of ${this.moderation.state.totalUserPages}
        </span>
        
        <button class="page-btn" 
                onclick="moderationModule.setUserPage(${this.moderation.state.currentUserPage + 1})"
                ${this.moderation.state.currentUserPage === this.moderation.state.totalUserPages ? 'disabled' : ''}>
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
  }

  // Render logs tab
  renderLogsTab() {
    if (!this.moderation.state.logsLoaded) {
      return this.renderLoadingState('Loading activity logs...');
    }
    
    return `
      <div class="logs-section">
        ${this.renderLogsFilter()}
        ${this.renderLogsList()}
      </div>
    `;
  }

  // Render logs filter
  renderLogsFilter() {
    return `
      <div class="logs-filter">
        <select class="moderator-select" 
                onchange="moderationModule.setSelectedModerator(this.value)">
          <option value="all">All Moderators</option>
          ${this.moderation.state.moderators.map(mod => `
            <option value="${mod.id}" ${this.moderation.state.selectedModeratorId === mod.id ? 'selected' : ''}>
              ${StringUtils.escapeHtml(mod.username)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  // Render logs list
  renderLogsList() {
    if (this.moderation.state.moderationLogs.length === 0) {
      return this.renderEmptyState('No activity logs');
    }
    
    return `
      <div class="logs-list">
        ${this.moderation.state.moderationLogs.map(log => this.renderLog(log)).join('')}
      </div>
    `;
  }

  // Render single log
  renderLog(log) {
    return `
      <div class="log-item">
        <div class="log-header">
          <span class="log-moderator">
            ${StringUtils.escapeHtml(log.moderator_name)}
          </span>
          <span class="log-time">
            ${DateUtils.getRelativeTime(log.created_at)}
          </span>
        </div>
        
        <div class="log-action">
          <i class="fas ${this.getActionIcon(log.action_type)}"></i>
          ${this.moderation.formatActionType(log.action_type)}
        </div>
        
        ${log.details ? `
          <div class="log-details">
            ${this.renderLogDetails(log.action_type, log.details)}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Get action icon
  getActionIcon(action) {
    const icons = {
      'delete_comment': 'fa-trash',
      'ban_user': 'fa-ban',
      'unban_user': 'fa-check-circle',
      'warn_user': 'fa-exclamation-triangle',
      'resolve_report': 'fa-check',
      'grant_moderator': 'fa-user-shield',
      'revoke_moderator': 'fa-user-times'
    };
    
    return icons[action] || 'fa-cog';
  }

  // Render log details
  renderLogDetails(action, details) {
    switch (action) {
      case 'ban_user':
        return `Banned ${details.username} for ${details.duration} - Reason: ${details.reason}`;
      case 'warn_user':
        return `Warned ${details.username} - Reason: ${details.reason}`;
      case 'delete_comment':
        return `Deleted comment by ${details.author}`;
      default:
        return JSON.stringify(details);
    }
  }

  // Render loading state
  renderLoadingState(message) {
    return `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
  }

  // Render empty state
  renderEmptyState(message) {
    return `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>${message}</p>
      </div>
    `;
  }

  // Setup event handlers
  setupEventHandlers() {
    // Tab switching
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  // Switch tab
  switchTab(tab) {
    // Update tab buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update tab content
    this.container.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.tab === tab);
    });
    
    // Load data if needed
    switch (tab) {
      case 'reports':
        if (!this.moderation.state.reportsLoaded) {
          this.moderation.loadReports();
        }
        break;
      case 'users':
        if (!this.moderation.state.usersLoaded) {
          this.moderation.loadUsers();
        }
        break;
      case 'logs':
        if (!this.moderation.state.logsLoaded) {
          this.moderation.loadModerationLogs();
        }
        break;
    }
  }
}

// Export UI
export default ModerationUI;