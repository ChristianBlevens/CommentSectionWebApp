// Reports App - Global reports management
function reportsApp() {
    return {
        // State
        user: null,
        reports: [],
        filteredReports: [],
        pages: [],
        filteredPages: [],
        selectedPage: null,
        showPageDropdown: false,
        pageSearchQuery: '',
        loading: true,
        apiUrl: '/api',
        showBanDropdown: null,
        
        async init() {
            console.log('Reports app initializing...');
            
            // Check session
            await this.checkExistingSession();
            
            // Setup OAuth listener
            Auth.setupOAuthListener(async (user) => {
                this.user = user;
                if (user.is_moderator) {
                    await this.loadReports();
                }
            });
        },
        
        async checkExistingSession() {
            this.user = await Auth.checkExistingSession();
            
            if (this.user) {
                console.log('Found existing session:', this.user.username);
                
                if (this.user.is_moderator) {
                    await this.loadReports();
                } else {
                    this.loading = false;
                }
            } else {
                console.log('No existing user session found');
                this.loading = false;
            }
        },
        
        signInWithDiscord() {
            Auth.signInWithDiscord();
        },
        
        async loadReports() {
            this.loading = true;
            const sessionToken = localStorage.getItem('sessionToken');
            
            if (!sessionToken) {
                console.error('No session token found');
                this.loading = false;
                this.user = null;
                localStorage.removeItem('user');
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/reports`, {
                    headers: { 
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    this.reports = await response.json();
                    console.log(`Loaded ${this.reports.length} reports`);
                    
                    // Extract pages from reports
                    this.extractPagesFromReports();
                    
                    // Apply filter
                    if (this.selectedPage) {
                        this.filteredReports = this.reports.filter(r => r.page_id === this.selectedPage);
                    } else {
                        this.filteredReports = [...this.reports];
                    }
                } else if (response.status === 401) {
                    console.error('Session expired or invalid');
                    this.user = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('sessionToken');
                } else if (response.status === 403) {
                    console.error('Not authorized to view reports');
                    this.user.is_moderator = false;
                }
            } catch (error) {
                console.error('Error loading reports:', error);
            } finally {
                this.loading = false;
            }
        },
        
        extractPagesFromReports() {
            const pageMap = new Map();
            this.reports.forEach(report => {
                if (!pageMap.has(report.page_id)) {
                    pageMap.set(report.page_id, {
                        page_id: report.page_id,
                        report_count: 0
                    });
                }
                pageMap.get(report.page_id).report_count++;
            });
            
            // Convert to array and sort by report count
            this.pages = Array.from(pageMap.values()).sort((a, b) => b.report_count - a.report_count);
            this.filteredPages = [...this.pages];
            console.log(`Extracted ${this.pages.length} pages from reports:`, this.pages);
        },
        
        filterPages() {
            if (!this.pageSearchQuery) {
                this.filteredPages = [...this.pages];
            } else {
                const query = this.pageSearchQuery.toLowerCase();
                this.filteredPages = this.pages.filter(page => 
                    page.page_id.toLowerCase().includes(query)
                );
            }
        },
        
        selectPage(pageId) {
            this.selectedPage = pageId;
            this.showPageDropdown = false;
            
            // Filter reports
            if (pageId) {
                this.filteredReports = this.reports.filter(r => r.page_id === pageId);
            } else {
                this.filteredReports = [...this.reports];
            }
        },
        
        async deleteComment(report) {
            if (!confirm('Delete this reported comment?')) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                this.handleSessionExpired();
                return;
            }
            
            try {
                const deleteResponse = await fetch(`${this.apiUrl}/comments/${report.comment_id}`, {
                    method: 'DELETE',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (deleteResponse.status === 401) {
                    alert('Session expired. Please sign in again.');
                    this.handleSessionExpired();
                    return;
                }
                
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete comment');
                }
                
                // Resolve the report
                await fetch(`${this.apiUrl}/reports/${report.id}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ 
                        action: 'resolved'
                    })
                });
                
                // Update local state
                this.reports = this.reports.filter(r => r.id !== report.id);
                this.filteredReports = this.reports.filter(r => 
                    !this.selectedPage || r.page_id === this.selectedPage
                );
                
                this.extractPagesFromReports();
                
                alert('Comment deleted successfully');
                
            } catch (error) {
                console.error('Error deleting comment:', error);
                alert('Failed to delete comment');
            }
        },
        
        async dismissReport(reportId) {
            if (!confirm('Dismiss this report?')) {
                return;
            }
            
            const sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
                alert('Session expired. Please sign in again.');
                this.handleSessionExpired();
                return;
            }
            
            try {
                const response = await fetch(`${this.apiUrl}/reports/${reportId}/resolve`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ 
                        action: 'dismissed'
                    })
                });
                
                if (response.status === 401) {
                    alert('Session expired. Please sign in again.');
                    this.handleSessionExpired();
                    return;
                }
                
                if (response.ok) {
                    this.reports = this.reports.filter(r => r.id !== reportId);
                    this.filteredReports = this.reports.filter(r => 
                        !this.selectedPage || r.page_id === this.selectedPage
                    );
                    
                    this.extractPagesFromReports();
                    
                    alert('Report dismissed');
                } else {
                    throw new Error('Failed to dismiss report');
                }
            } catch (error) {
                console.error('Error dismissing report:', error);
                alert('Failed to dismiss report');
            }
        },
        
        // Ban functionality
        toggleBanDropdown(reportId, event) {
            this.showBanDropdown = BanHandler.toggleBanDropdown(this.showBanDropdown, reportId, event);
        },
        
        async banUserWithDuration(userId, userName, duration) {
            await BanHandler.banUserWithDuration(userId, userName, duration, this.banUser.bind(this));
        },
        
        async showCustomBanInput(userId, userName) {
            await BanHandler.showCustomBanInput(userId, userName, this.banUserWithDuration.bind(this));
        },
        
        async banUser(userId, userName, duration, reason) {
            const result = await BanHandler.banUser(
                this.apiUrl, 
                userId, 
                userName, 
                duration, 
                reason, 
                duration === 'permanent' // Only delete comments for permanent bans
            );
            
            if (result.success) {
                await this.loadReports();
                this.showBanDropdown = null;
            } else if (result.expired) {
                this.handleSessionExpired();
            }
        },
        
        handleSessionExpired() {
            this.user = null;
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
        },
        
        getRelativeTime(dateString) {
            return Utils.getRelativeTime(dateString);
        },
        
        renderReportCard(report) {
            const reportHtml = `
                <div class="report-card">
                    <div class="report-header">
                        <div>
                            <div class="report-meta">
                                <i class="fas fa-flag"></i>
                                Reported by: <span class="font-medium">${report.reporter_name || 'Anonymous'}</span>
                            </div>
                            <div class="report-meta">
                                <i class="fas fa-clock"></i>
                                ${this.getRelativeTime(report.reported_at)}
                            </div>
                            <div class="report-meta">
                                <i class="fas fa-file-alt"></i>
                                Page: <span class="font-medium">${report.page_id}</span>
                            </div>
                        </div>
                        <div>
                            <div class="report-meta">
                                <i class="fas fa-user"></i>
                                Comment by: <span class="font-medium">${report.comment_user_name || 'Unknown'}</span>
                            </div>
                            <div class="report-meta">
                                <i class="fas fa-exclamation-circle"></i>
                                Reason: <span class="font-medium">${report.reason}</span>
                            </div>
                            ${report.user_history ? `
                                <button onclick="window.unifiedAppInstance.toggleUserHistory(${JSON.stringify(report).replace(/"/g, '&quot;')})" 
                                        class="text-blue-600 hover:text-blue-800 text-sm">
                                    <i class="fas fa-history mr-1"></i>
                                    View user history
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="report-content">
                        <div class="report-content-label">Reported Comment:</div>
                        <div class="report-content-text">${report.comment_content || 'Content not available'}</div>
                    </div>
                    
                    ${report.showHistory && report.user_history ? `
                        <div class="bg-gray-50 rounded-lg p-4 mb-4">
                            <h4 class="font-semibold mb-3">User History</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-600">Total comments:</span>
                                    <span class="font-medium ml-1">${report.user_history.comment_count || 0}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Times reported:</span>
                                    <span class="font-medium ml-1">${report.user_history.times_reported || 0}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Ban count:</span>
                                    <span class="font-medium ml-1">${report.user_history.ban_count || 0}</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="report-actions">
                        <button onclick="window.unifiedAppInstance.jumpToComment('${report.comment_id}')" 
                                class="report-action-btn bg-gray-600 hover:bg-gray-700 text-white">
                            <i class="fas fa-eye mr-2"></i>View Comment
                        </button>
                        <button onclick="window.unifiedAppInstance.deleteComment(${JSON.stringify(report).replace(/"/g, '&quot;')})" 
                                class="report-action-btn bg-red-600 hover:bg-red-700 text-white">
                            <i class="fas fa-trash mr-2"></i>Delete Comment
                        </button>
                        <button onclick="window.unifiedAppInstance.dismissReport(${report.id})" 
                                class="report-action-btn bg-green-600 hover:bg-green-700 text-white">
                            <i class="fas fa-check mr-2"></i>Dismiss Report
                        </button>
                        
                        <!-- Ban dropdown -->
                        <div class="relative">
                            <button onclick="window.unifiedAppInstance.toggleBanDropdown(${report.id}, event)" 
                                    class="report-action-btn bg-orange-600 hover:bg-orange-700 text-white">
                                <i class="fas fa-ban mr-2"></i>Ban User
                            </button>
                            ${this.showBanDropdown === report.id ? `
                                <div class="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
                                    <button onclick="window.unifiedAppInstance.banUserWithDuration('${report.comment_user_id}', '${report.comment_user_name}', '30m')" 
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Ban for 30 minutes
                                    </button>
                                    <button onclick="window.unifiedAppInstance.banUserWithDuration('${report.comment_user_id}', '${report.comment_user_name}', '6h')" 
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Ban for 6 hours
                                    </button>
                                    <button onclick="window.unifiedAppInstance.banUserWithDuration('${report.comment_user_id}', '${report.comment_user_name}', '1d')" 
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Ban for 1 day
                                    </button>
                                    <button onclick="window.unifiedAppInstance.banUserWithDuration('${report.comment_user_id}', '${report.comment_user_name}', '7d')" 
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Ban for 7 days
                                    </button>
                                    <button onclick="window.unifiedAppInstance.banUserWithDuration('${report.comment_user_id}', '${report.comment_user_name}', 'permanent')" 
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Permanent ban
                                    </button>
                                    <button onclick="window.unifiedAppInstance.showCustomBanInput('${report.comment_user_id}', '${report.comment_user_name}')" 
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border-t">
                                        Custom duration...
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            
            return reportHtml;
        }
    };
}