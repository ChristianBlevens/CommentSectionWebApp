// Moderation module for managing moderation functionality
import { BaseModule } from '../../core/base-module.js';
import { EventBus } from '../../core/event-bus.js';
import { StateManager } from '../../core/state-manager.js';
import { ApiClient } from '../../core/api-client.js';
import { DomUtils, DateUtils, StringUtils } from '../../utils/index.js';

class ModerationModule extends BaseModule {
  constructor() {
    super();
    this.name = 'moderation';
    
    // Module state
    this.state = {
      // Reports
      reports: [],
      filteredReports: [],
      pageReports: [],
      totalPendingReports: 0,
      loadingReports: false,
      reportsLoaded: false,
      selectedReportsPage: 'all',
      pageSearchQuery: '',
      pages: [],
      filteredPages: [],
      showPageDropdown: false,
      
      // Users
      users: [],
      filteredUsers: [],
      paginatedUsers: [],
      loadingUsers: false,
      usersLoaded: false,
      userSearchQuery: '',
      userFilter: 'all',
      currentUserPage: 1,
      totalUserPages: 1,
      usersPerPage: 20,
      expandedUsers: new Set(),
      userCommentsDisplayCount: new Map(),
      
      // Moderation logs
      moderationLogs: [],
      moderators: [],
      selectedModeratorId: 'all',
      loadingLogs: false,
      logsLoaded: false,
      
      // UI state
      showBanDropdown: new Map(),
      banNotification: null,
      warningNotification: null,
      
      // User permissions
      isModerator: false,
      isSuperModerator: false
    };
    
    // API client instance
    this.api = new ApiClient();
    
    // Event bus instance
    this.eventBus = window.eventBus || new EventBus();
    
    // State manager instance
    this.stateManager = window.stateManager || new StateManager();
  }

  // Initialize the module
  async initialize(config = {}) {
    this.config = config;
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Check moderator status
    this.checkModeratorStatus();
    
    this.initialized = true;
    this.emit('moderation:initialized');
    
    return true;
  }

  // Setup event listeners
  setupEventListeners() {
    // Listen for auth changes
    this.on('auth:login', (user) => this.handleAuthChange(user));
    this.on('auth:logout', () => this.handleLogout());
    
    // Listen for comment actions
    this.on('comments:reported', (data) => this.handleCommentReported(data));
    
    // Setup DOM event listeners
    this.setupDomListeners();
  }

  // Setup DOM event listeners
  setupDomListeners() {
    // Close dropdowns on outside click
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.ban-dropdown-container')) {
        this.closeAllBanDropdowns();
      }
    });
  }

  // Check moderator status
  checkModeratorStatus() {
    const user = this.stateManager.getState('auth', 'user');
    if (user) {
      this.state.isModerator = user.is_moderator || false;
      this.state.isSuperModerator = user.is_super_moderator || false;
    }
  }

  // Handle auth change
  handleAuthChange(user) {
    this.state.isModerator = user.is_moderator || false;
    this.state.isSuperModerator = user.is_super_moderator || false;
    
    // Check for warnings if not moderator
    if (!this.state.isModerator) {
      this.checkWarnings();
    }
  }

  // Handle logout
  handleLogout() {
    this.state.isModerator = false;
    this.state.isSuperModerator = false;
    this.clearModeratorData();
  }

  // Check for warnings
  async checkWarnings() {
    try {
      const response = await this.api.get('/api/users/warnings/unread');
      
      if (response.warnings && response.warnings.length > 0) {
        const warning = response.warnings[0];
        this.state.warningNotification = {
          show: true,
          reason: warning.reason,
          created_at: warning.created_at,
          id: warning.id
        };
        
        this.emit('moderation:warningReceived', warning);
      }
    } catch (error) {
      console.error('Error checking warnings:', error);
    }
  }

  // Acknowledge warning
  async acknowledgeWarning(warningId) {
    try {
      await this.api.post('/api/users/warnings/acknowledge', {
        warning_id: warningId
      });
      
      this.state.warningNotification = null;
      this.emit('moderation:warningAcknowledged', { warningId });
    } catch (error) {
      console.error('Error acknowledging warning:', error);
    }
  }

  // Load report count
  async loadReportCount() {
    if (!this.state.isModerator) return;
    
    try {
      const response = await this.api.get('/api/reports/count');
      this.state.totalPendingReports = response.count || 0;
      
      this.emit('moderation:reportCountUpdated', { count: this.state.totalPendingReports });
    } catch (error) {
      console.error('Error loading report count:', error);
    }
  }

  // Load reports
  async loadReports() {
    if (!this.state.isModerator) return;
    
    this.state.loadingReports = true;
    this.emit('moderation:reportsLoading');
    
    try {
      const response = await this.api.get('/api/reports');
      
      if (response.reports) {
        this.state.reports = response.reports;
        this.state.pages = [...new Set(response.reports.map(r => r.page_url))];
        this.filterReports();
        this.state.reportsLoaded = true;
        
        this.emit('moderation:reportsLoaded', { reports: this.state.reports });
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      this.emit('moderation:error', { error: error.message });
    } finally {
      this.state.loadingReports = false;
    }
  }

  // Filter reports
  filterReports() {
    if (this.state.selectedReportsPage === 'all') {
      this.state.pageReports = this.state.reports;
    } else {
      this.state.pageReports = this.state.reports.filter(
        report => report.page_url === this.state.selectedReportsPage
      );
    }
    
    this.state.filteredReports = this.state.pageReports;
  }

  // Delete reported comment
  async deleteReportedComment(reportId) {
    const report = this.state.reports.find(r => r.id === reportId);
    if (!report) return;
    
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      // Delete the comment
      await this.api.delete(`/api/comments/${report.comment_id}`);
      
      // Resolve the report
      await this.resolveReport(reportId);
      
      // Emit event for comments module
      this.emit('moderation:commentDeleted', { commentId: report.comment_id });
      
      // Show notification
      this.showNotification('Comment deleted successfully');
    } catch (error) {
      console.error('Error deleting comment:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Dismiss report
  async dismissReport(reportId) {
    if (!confirm('Are you sure you want to dismiss this report?')) return;
    
    await this.resolveReport(reportId);
  }

  // Resolve report
  async resolveReport(reportId) {
    try {
      await this.api.post(`/api/reports/${reportId}/resolve`);
      
      // Remove from state
      this.state.reports = this.state.reports.filter(r => r.id !== reportId);
      this.filterReports();
      
      // Update count
      this.state.totalPendingReports = Math.max(0, this.state.totalPendingReports - 1);
      
      this.emit('moderation:reportResolved', { reportId });
    } catch (error) {
      console.error('Error resolving report:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Load users
  async loadUsers() {
    if (!this.state.isModerator) return;
    
    this.state.loadingUsers = true;
    this.emit('moderation:usersLoading');
    
    try {
      const response = await this.api.get('/api/users');
      
      if (response.users) {
        this.state.users = response.users;
        this.filterUsers();
        this.state.usersLoaded = true;
        
        this.emit('moderation:usersLoaded', { users: this.state.users });
      }
    } catch (error) {
      console.error('Error loading users:', error);
      this.emit('moderation:error', { error: error.message });
    } finally {
      this.state.loadingUsers = false;
    }
  }

  // Filter users
  filterUsers() {
    let filtered = [...this.state.users];
    
    // Apply search filter
    if (this.state.userSearchQuery) {
      const query = this.state.userSearchQuery.toLowerCase();
      filtered = filtered.filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.display_name?.toLowerCase().includes(query) ||
        user.id.toString().includes(query)
      );
    }
    
    // Apply status filter
    switch (this.state.userFilter) {
      case 'banned':
        filtered = filtered.filter(user => user.is_banned);
        break;
      case 'warned':
        filtered = filtered.filter(user => user.warning_count > 0);
        break;
      case 'moderators':
        filtered = filtered.filter(user => user.is_moderator);
        break;
      case 'active':
        filtered = filtered.filter(user => !user.is_banned);
        break;
    }
    
    // Sort by activity
    filtered.sort((a, b) => {
      const dateA = new Date(a.last_activity || a.created_at);
      const dateB = new Date(b.last_activity || b.created_at);
      return dateB - dateA;
    });
    
    this.state.filteredUsers = filtered;
    this.updatePaginatedUsers();
  }

  // Update paginated users
  updatePaginatedUsers() {
    const start = (this.state.currentUserPage - 1) * this.state.usersPerPage;
    const end = start + this.state.usersPerPage;
    
    this.state.paginatedUsers = this.state.filteredUsers.slice(start, end);
    this.state.totalUserPages = Math.ceil(this.state.filteredUsers.length / this.state.usersPerPage);
  }

  // Ban user
  async banUser(userId, userName, duration, reason) {
    try {
      const response = await this.api.post(`/api/users/${userId}/ban`, {
        duration: duration,
        reason: reason
      });
      
      if (response.success) {
        // Update user state
        const user = this.state.users.find(u => u.id === userId);
        if (user) {
          user.is_banned = true;
          user.ban_expires_at = response.ban_expires_at;
        }
        
        // Show notification
        this.state.banNotification = {
          show: true,
          message: `${userName} has been banned.\n${response.ban_duration_text}`,
          expired: false
        };
        
        // Auto-hide notification
        setTimeout(() => {
          if (this.state.banNotification) {
            this.state.banNotification.show = false;
          }
        }, 5000);
        
        // Emit event
        this.emit('moderation:userBanned', { 
          userId, 
          userName, 
          duration,
          reason 
        });
        
        // Refresh users
        this.filterUsers();
      }
    } catch (error) {
      console.error('Error banning user:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Show custom ban input
  showCustomBanInput(userId, userName) {
    const duration = prompt('Enter ban duration (e.g., "30m", "24h", "7d", "permanent"):');
    if (!duration) return;
    
    const reason = prompt(`Why are you banning ${userName}?`);
    if (!reason) return;
    
    this.banUser(userId, userName, duration, reason);
  }

  // Unban user
  async unbanUser(userId) {
    if (!confirm('Are you sure you want to unban this user?')) return;
    
    try {
      await this.api.post(`/api/users/${userId}/unban`);
      
      // Update user state
      const user = this.state.users.find(u => u.id === userId);
      if (user) {
        user.is_banned = false;
        user.ban_expires_at = null;
      }
      
      // Emit event
      this.emit('moderation:userUnbanned', { userId });
      
      // Refresh users
      this.filterUsers();
      
      this.showNotification('User unbanned successfully');
    } catch (error) {
      console.error('Error unbanning user:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Warn user
  async warnUser(userId) {
    const reason = prompt('Enter warning reason:');
    if (!reason) return;
    
    try {
      await this.api.post(`/api/users/${userId}/warn`, {
        reason: reason.trim()
      });
      
      // Update user state
      const user = this.state.users.find(u => u.id === userId);
      if (user) {
        user.warning_count = (user.warning_count || 0) + 1;
      }
      
      // Emit event
      this.emit('moderation:userWarned', { userId, reason });
      
      this.showNotification('Warning issued successfully');
    } catch (error) {
      console.error('Error warning user:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Toggle moderator status
  async toggleModerator(userId) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return;
    
    const action = user.is_moderator ? 'revoke' : 'grant';
    const confirmMsg = user.is_moderator 
      ? 'Are you sure you want to revoke moderator privileges?' 
      : 'Are you sure you want to grant moderator privileges?';
    
    if (!confirm(confirmMsg)) return;
    
    try {
      await this.api.post(`/api/users/${userId}/moderator`, {
        action: action
      });
      
      // Update user state
      user.is_moderator = !user.is_moderator;
      
      // Emit event
      this.emit('moderation:moderatorToggled', { userId, isModerator: user.is_moderator });
      
      this.showNotification(`Moderator privileges ${action}ed successfully`);
    } catch (error) {
      console.error('Error toggling moderator:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Load moderation logs
  async loadModerationLogs() {
    if (!this.state.isModerator) return;
    
    this.state.loadingLogs = true;
    this.emit('moderation:logsLoading');
    
    try {
      const params = {};
      if (this.state.selectedModeratorId !== 'all') {
        params.moderator_id = this.state.selectedModeratorId;
      }
      
      const response = await this.api.get('/api/moderation-logs', params);
      
      if (response.logs) {
        this.state.moderationLogs = response.logs;
        this.state.moderators = response.moderators || [];
        this.state.logsLoaded = true;
        
        this.emit('moderation:logsLoaded', { logs: this.state.moderationLogs });
      }
    } catch (error) {
      console.error('Error loading moderation logs:', error);
      this.emit('moderation:error', { error: error.message });
    } finally {
      this.state.loadingLogs = false;
    }
  }

  // Toggle ban dropdown
  toggleBanDropdown(userId, event) {
    event.stopPropagation();
    
    // Close all other dropdowns
    this.closeAllBanDropdowns();
    
    // Toggle this dropdown
    const isOpen = this.state.showBanDropdown.get(userId);
    this.state.showBanDropdown.set(userId, !isOpen);
    
    this.emit('moderation:banDropdownToggled', { userId, isOpen: !isOpen });
  }

  // Close all ban dropdowns
  closeAllBanDropdowns() {
    this.state.showBanDropdown.clear();
  }

  // Load user details
  async loadUserDetails(userId) {
    try {
      const response = await this.api.get(`/api/users/${userId}/details`);
      
      // Update user with detailed info
      const user = this.state.users.find(u => u.id === userId);
      if (user && response.user) {
        Object.assign(user, response.user);
        
        // Initialize comments display count
        this.state.userCommentsDisplayCount.set(userId, 5);
        
        this.emit('moderation:userDetailsLoaded', { userId, details: response.user });
      }
    } catch (error) {
      console.error('Error loading user details:', error);
    }
  }

  // Toggle user expanded
  async toggleUserExpanded(userId) {
    if (this.state.expandedUsers.has(userId)) {
      this.state.expandedUsers.delete(userId);
    } else {
      this.state.expandedUsers.add(userId);
      
      // Load details if not loaded
      const user = this.state.users.find(u => u.id === userId);
      if (user && !user.recent_comments) {
        await this.loadUserDetails(userId);
      }
    }
    
    this.emit('moderation:userExpandedToggled', { userId });
  }

  // Delete user comment
  async deleteUserComment(userId, commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      await this.api.delete(`/api/comments/${commentId}`);
      
      // Remove from user's comments
      const user = this.state.users.find(u => u.id === userId);
      if (user && user.recent_comments) {
        user.recent_comments = user.recent_comments.filter(c => c.id !== commentId);
        user.total_comments = Math.max(0, user.total_comments - 1);
      }
      
      // Emit event
      this.emit('moderation:commentDeleted', { commentId });
      
      this.showNotification('Comment deleted successfully');
    } catch (error) {
      console.error('Error deleting comment:', error);
      this.emit('moderation:error', { error: error.message });
    }
  }

  // Load more user comments
  loadMoreUserComments(userId) {
    const currentCount = this.state.userCommentsDisplayCount.get(userId) || 5;
    this.state.userCommentsDisplayCount.set(userId, currentCount + 5);
    
    this.emit('moderation:userCommentsExpanded', { userId, count: currentCount + 5 });
  }

  // Show notification
  showNotification(message, type = 'success') {
    this.emit('moderation:notification', { message, type });
  }

  // Clear moderator data
  clearModeratorData() {
    this.state.reports = [];
    this.state.users = [];
    this.state.moderationLogs = [];
    this.state.expandedUsers.clear();
    this.state.userCommentsDisplayCount.clear();
    this.state.showBanDropdown.clear();
  }

  // Format action type
  formatActionType(action) {
    const actionMap = {
      'delete_comment': 'Deleted Comment',
      'ban_user': 'Banned User',
      'unban_user': 'Unbanned User',
      'warn_user': 'Warned User',
      'resolve_report': 'Resolved Report',
      'grant_moderator': 'Granted Moderator',
      'revoke_moderator': 'Revoked Moderator'
    };
    
    return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Handle comment reported
  handleCommentReported(data) {
    // Increment pending reports count
    this.state.totalPendingReports++;
    
    // Reload reports if viewing reports tab
    if (this.state.reportsLoaded) {
      this.loadReports();
    }
  }

  // Cleanup module
  cleanup() {
    super.cleanup();
    this.clearModeratorData();
  }
}

// Export module
export default ModerationModule;