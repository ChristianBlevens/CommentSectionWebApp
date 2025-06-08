// Report Card Component
// Reusable component for rendering report cards with user history

class ReportCard {
    constructor() {
        this.banDropdowns = new Map();
    }

    getRelativeTime(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);
        
        if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
        if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderReportCard(report, options = {}) {
        const {
            showPageInfo = false,
            showViewInContext = false,
            onToggleHistory = null,
            onJumpToComment = null,
            onViewInContext = null,
            onDeleteComment = null,
            onBanUser = null,
            onWarnUser = null,
            onDismiss = null,
            onToggleBanDropdown = null,
            showBanDropdown = false
        } = options;

        const userHistory = report.user_history || {};
        const hasBanHistory = userHistory.banHistory?.length > 0;
        const hasReportedHistory = userHistory.reportedHistory?.length > 0;
        const hasHistory = hasBanHistory || hasReportedHistory;

        return `
            <div class="report-card" data-report-id="${report.id}">
                ${this.renderHeader(report, showPageInfo)}
                ${this.renderContent(report)}
                ${hasHistory ? this.renderHistorySummary(userHistory) : ''}
                ${this.renderActions(report, {
                    showViewInContext,
                    onToggleHistory,
                    onJumpToComment,
                    onViewInContext,
                    onDeleteComment,
                    onBanUser,
                    onWarnUser,
                    onDismiss,
                    onToggleBanDropdown,
                    showBanDropdown
                })}
                ${report.showHistory && userHistory ? this.renderExpandedHistory(userHistory) : ''}
            </div>
        `;
    }

    renderHeader(report, showPageInfo) {
        return `
            <div class="report-header">
                <div>
                    ${showPageInfo ? `
                        <p class="report-meta">
                            <i class="fas fa-file-alt"></i>
                            Page: <span class="font-medium">${this.escapeHtml(report.page_id)}</span>
                        </p>
                    ` : ''}
                    <p class="report-meta">
                        <i class="fas fa-user"></i>
                        Reported by: <span class="font-medium">${this.escapeHtml(report.reporter_name)}</span>
                    </p>
                    <p class="report-meta">
                        <i class="fas fa-clock"></i>
                        <span>${this.getRelativeTime(report.created_at)}</span>
                    </p>
                </div>
                <div>
                    <p class="report-meta">
                        <i class="fas fa-exclamation-circle"></i>
                        Reason: <span class="font-medium">${this.escapeHtml(report.reason)}</span>
                    </p>
                </div>
            </div>
        `;
    }

    renderContent(report) {
        return `
            <div class="report-content">
                <p class="report-content-label">
                    Comment by: <span>${this.escapeHtml(report.comment_user_name)}</span>
                </p>
                <div class="report-content-text">${this.escapeHtml(report.content)}</div>
            </div>
        `;
    }

    renderHistorySummary(userHistory) {
        const banHistory = userHistory.banHistory || [];
        const reportedHistory = userHistory.reportedHistory || [];
        
        return `
            <div class="mb-3 p-3 bg-gray-50 rounded text-sm">
                ${banHistory.length > 0 ? `
                    <div class="mb-2">
                        <span class="font-semibold text-red-600">Previous Bans:</span> 
                        <span>${banHistory.length}</span>
                        ${banHistory[0] ? `
                            <span class="text-gray-600">
                                (Last: <span>${this.getRelativeTime(banHistory[0].performed_at)}</span>)
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
                ${reportedHistory.length > 0 ? `
                    <div>
                        <span class="font-semibold text-yellow-600">Times Reported:</span> 
                        <span>${reportedHistory.length}</span>
                        <span class="text-gray-600">
                            (<span>${reportedHistory.filter(r => r.status === 'resolved').length}</span> resolved,
                            <span>${reportedHistory.filter(r => r.status === 'dismissed').length}</span> dismissed)
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderActions(report, options) {
        const {
            showViewInContext,
            onToggleHistory,
            onJumpToComment,
            onViewInContext,
            onDeleteComment,
            onBanUser,
            onWarnUser,
            onDismiss,
            onToggleBanDropdown,
            showBanDropdown
        } = options;

        return `
            <div class="report-actions">
                ${onToggleHistory ? `
                    <button class="report-action-btn history" 
                            onclick="(${onToggleHistory})(${report.id})">
                        ${report.showHistory ? 'Hide History' : 'View History'}
                    </button>
                ` : ''}
                
                ${showViewInContext && onViewInContext ? `
                    <a href="${onViewInContext(report)}" 
                       target="_blank"
                       class="report-action-btn view">
                        <i class="fas fa-external-link-alt"></i>View in Context
                    </a>
                ` : onJumpToComment ? `
                    <button class="report-action-btn view"
                            onclick="(${onJumpToComment})(${report.comment_id})">
                        <i class="fas fa-eye"></i>View Comment
                    </button>
                ` : ''}
                
                ${onDeleteComment ? `
                    <button class="report-action-btn delete"
                            onclick="(${onDeleteComment})(${report.id})">
                        <i class="fas fa-trash"></i>Delete Comment
                    </button>
                ` : ''}
                
                ${onBanUser ? this.renderBanDropdown(report, {
                    onBanUser,
                    onToggleBanDropdown,
                    showBanDropdown
                }) : ''}
                
                ${onWarnUser ? `
                    <button class="report-action-btn warn"
                            onclick="(${onWarnUser})(${report.comment_user_id}, '${this.escapeHtml(report.comment_user_name)}')">
                        <i class="fas fa-exclamation-triangle"></i>Warn User
                    </button>
                ` : ''}
                
                ${onDismiss ? `
                    <button class="report-action-btn dismiss"
                            onclick="(${onDismiss})(${report.id})">
                        <i class="fas fa-times"></i>Dismiss
                    </button>
                ` : ''}
            </div>
        `;
    }

    renderBanDropdown(report, options) {
        const { onBanUser, onToggleBanDropdown, showBanDropdown } = options;
        
        return `
            <div class="ban-dropdown-container">
                <button class="report-action-btn ban"
                        onclick="${onToggleBanDropdown ? `(${onToggleBanDropdown})(${report.id}, event)` : ''}">
                    <i class="fas fa-ban"></i>Ban User
                </button>
                ${showBanDropdown === report.id ? `
                    <div class="ban-dropdown" id="ban-dropdown-${report.id}">
                        <div class="ban-dropdown-inner">
                            ${this.renderBanOptions(report, onBanUser)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderBanOptions(report, onBanUser) {
        const durations = [
            { value: '30m', label: '30 minutes' },
            { value: '6h', label: '6 hours' },
            { value: '1d', label: '1 day' },
            { value: '3d', label: '3 days' },
            { value: '7d', label: '1 week' },
            { value: '30d', label: '1 month' },
            { value: '90d', label: '3 months' },
            { value: 'permanent', label: 'Permanent', className: 'text-red-600' }
        ];

        return durations.map(duration => `
            <button class="ban-dropdown-item ${duration.className || ''}"
                    onclick="(${onBanUser})(${report.comment_user_id}, '${this.escapeHtml(report.comment_user_name)}', '${duration.value}')">
                ${duration.label}
            </button>
        `).join('') + `
            <div class="ban-dropdown-divider">
                <button class="ban-dropdown-item text-blue-600"
                        onclick="(${onBanUser})(${report.comment_user_id}, '${this.escapeHtml(report.comment_user_name)}', 'custom')">
                    <i class="fas fa-clock mr-1"></i>Custom duration
                </button>
            </div>
        `;
    }

    renderExpandedHistory(userHistory) {
        return `
            <div class="mt-3 p-3 bg-gray-50 rounded text-sm">
                <h4 class="font-semibold mb-2">Full User History</h4>
                
                ${this.renderBanHistory(userHistory.banHistory)}
                ${this.renderReportedHistory(userHistory.reportedHistory)}
                ${this.renderReportHistory(userHistory.reportHistory)}
            </div>
        `;
    }

    renderBanHistory(banHistory) {
        if (!banHistory?.length) return '';
        
        return `
            <div class="mb-3">
                <h5 class="font-medium text-red-600 mb-1">Ban History:</h5>
                <div class="space-y-1">
                    ${banHistory.slice(0, 5).map(ban => `
                        <div class="text-xs">
                            <span>${ban.action === 'ban' ? '🚫' : '✅'}</span>
                            <span>${ban.action}</span>
                            ${ban.duration ? `<span>(${ban.duration})</span>` : ''}
                            by <span>${this.escapeHtml(ban.performed_by_name)}</span>
                            - <span>${this.getRelativeTime(ban.performed_at)}</span>
                            ${ban.reason ? `
                                <span class="block ml-4 text-gray-600">Reason: ${this.escapeHtml(ban.reason)}</span>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderReportedHistory(reportedHistory) {
        if (!reportedHistory?.length) return '';
        
        return `
            <div class="mb-3">
                <h5 class="font-medium text-yellow-600 mb-1">Reported History:</h5>
                <div class="space-y-1">
                    ${reportedHistory.slice(0, 5).map(rep => `
                        <div class="text-xs">
                            Reported by <span>${this.escapeHtml(rep.reporter_name)}</span>
                            - <span>${this.getRelativeTime(rep.reported_at)}</span>
                            <span class="ml-1 px-1 py-0.5 rounded text-xs ${this.getStatusClass(rep.status)}">
                                ${rep.status}
                            </span>
                            ${rep.reason ? `
                                <span class="block ml-4 text-gray-600">Reason: ${this.escapeHtml(rep.reason)}</span>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderReportHistory(reportHistory) {
        if (!reportHistory?.length) return '';
        
        const resolved = reportHistory.filter(r => r.status === 'resolved').length;
        const dismissed = reportHistory.filter(r => r.status === 'dismissed').length;
        
        return `
            <div>
                <h5 class="font-medium text-blue-600 mb-1">Reports Made by User:</h5>
                <div class="text-xs text-gray-600">
                    Total reports: <span>${reportHistory.length}</span>
                    (Resolved: <span>${resolved}</span>,
                    Dismissed: <span>${dismissed}</span>)
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        const classes = {
            'resolved': 'bg-green-100 text-green-800',
            'dismissed': 'bg-gray-100 text-gray-800',
            'pending': 'bg-yellow-100 text-yellow-800'
        };
        return classes[status] || '';
    }
}

// Create singleton instance
const reportCard = new ReportCard();

// Export for use in other files
if (typeof window !== 'undefined') {
    window.ReportCard = ReportCard;
    window.reportCard = reportCard;
    // Log availability for debugging
    console.log('ReportCard component loaded and available');
}