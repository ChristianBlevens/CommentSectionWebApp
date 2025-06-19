// Reports management functions
window.ReportsManager = {
    // Load pending report count
    async loadReportCount() {
        try {
            const response = await fetch(`${API_URL}/api/reports/count`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                this.totalPendingReports = data.count;
            }
        } catch (error) {
            console.error('Error loading report count:', error);
        }
    },
    
    // Load all reports
    async loadReports() {
        if (!this.user?.is_moderator) return;
        
        this.loadingReports = true;
        try {
            const response = await fetch(`${API_URL}/api/reports`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            this.reports = await response.json();
            this.filterReportsByPage();
            this.reportsLoaded = true;
            
            // Extract unique pages
            const pageSet = new Set(this.reports.map(r => r.comment?.page_key).filter(Boolean));
            this.pages = Array.from(pageSet).sort();
            this.filteredPages = [...this.pages];
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            this.loadingReports = false;
        }
    },
    
    // Filter reports by selected page
    filterReportsByPage() {
        if (!this.selectedReportsPage) {
            this.filteredReports = this.reports;
        } else {
            this.filteredReports = this.reports.filter(r => 
                r.comment?.page_key === this.selectedReportsPage
            );
        }
    },
    
    // Search pages
    searchPages() {
        const query = this.pageSearchQuery.toLowerCase();
        if (!query) {
            this.filteredPages = [...this.pages];
        } else {
            this.filteredPages = this.pages.filter(page => 
                page.toLowerCase().includes(query)
            );
        }
    },
    
    // Select a page for filtering
    selectPage(page) {
        this.selectedReportsPage = page;
        this.filterReportsByPage();
        this.showPageDropdown = false;
        this.pageSearchQuery = '';
    },
    
    // Clear page filter
    clearPageFilter() {
        this.selectedReportsPage = null;
        this.filterReportsByPage();
        this.pageSearchQuery = '';
    },
    
    // Resolve a report
    async resolveReport(reportId, action) {
        try {
            const response = await fetch(`${API_URL}/api/reports/${reportId}/resolve`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ action })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            // Remove from local state
            this.reports = this.reports.filter(r => r.id !== reportId);
            this.filterReportsByPage();
            this.totalPendingReports = Math.max(0, this.totalPendingReports - 1);
        } catch (error) {
            console.error('Error resolving report:', error);
        }
    },
    
    // Delete reported comment
    async deleteReportedComment(report) {
        if (!confirm('Delete this reported comment?')) return;
        
        const reason = prompt('Reason for deletion:');
        if (!reason) return;
        
        try {
            const response = await fetch(`${API_URL}/api/comments/${report.comment_id}?moderate=true`, {
                method: 'DELETE',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ reason })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            // Auto-resolve the report
            await this.resolveReport(report.id, 'content_removed');
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    }
};