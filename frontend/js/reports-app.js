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
                    
                    // Load user history for each report
                    for (const report of this.reports) {
                        await this.loadUserHistoryForReport(report);
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
        
        async warnUser(userId, userName) {
            const message = prompt(`What warning would you like to send to ${userName}?`);
            if (!message) return;
            
            const severityOptions = ['info', 'warning', 'severe'];
            const severityIndex = prompt('Select severity:\n1. Info (blue)\n2. Warning (yellow)\n3. Severe (red)\n\nEnter 1, 2, or 3:');
            
            if (!severityIndex || !['1', '2', '3'].includes(severityIndex)) {
                alert('Invalid severity selection');
                return;
            }
            
            const severity = severityOptions[parseInt(severityIndex) - 1];
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/users/${userId}/warn`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    body: JSON.stringify({ message, severity })
                });
                
                if (response.ok) {
                    alert(`Warning sent to ${userName}`);
                } else if (response.status === 401) {
                    alert('Session expired. Please sign in again.');
                    this.handleSessionExpired();
                } else {
                    throw new Error('Failed to send warning');
                }
            } catch (error) {
                console.error('Error warning user:', error);
                alert('Failed to send warning');
            }
        },
        
        handleSessionExpired() {
            this.user = null;
            localStorage.removeItem('user');
            localStorage.removeItem('sessionToken');
        },
        
        async loadUserHistoryForReport(report) {
            if (!report.comment_user_id) return;
            
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch(`${this.apiUrl}/users/${report.comment_user_id}/history`, {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
                
                if (response.ok) {
                    report.user_history = await response.json();
                }
            } catch (error) {
                console.error('Error loading user history:', error);
            }
        },
        
        toggleUserHistory(reportId) {
            const report = this.reports.find(r => r.id === reportId);
            if (report) {
                this.$set(report, 'showHistory', !report.showHistory);
            }
        },

        renderReportCard(report) {
            return window.reportCard.renderReportCard(report, {
                showPageInfo: true,
                showViewInContext: true,
                onToggleHistory: (reportId) => this.toggleUserHistory(reportId),
                onViewInContext: (report) => `index.html?pageId=${report.page_id}#comment-${report.comment_id}`,
                onDeleteComment: (reportId) => {
                    const report = this.filteredReports.find(r => r.id === reportId);
                    if (report) this.deleteComment(report);
                },
                onBanUser: (userId, userName, duration) => {
                    if (duration === 'custom') {
                        this.showCustomBanInput(userId, userName);
                    } else {
                        this.banUserWithDuration(userId, userName, duration);
                    }
                },
                onWarnUser: (userId, userName) => this.warnUser(userId, userName),
                onDismiss: (reportId) => this.dismissReport(reportId),
                onToggleBanDropdown: (reportId, event) => this.toggleBanDropdown(reportId, event),
                showBanDropdown: this.showBanDropdown
            });
        },
        
        getRelativeTime(dateString) {
            return Utils.getRelativeTime(dateString);
        }
    };
}