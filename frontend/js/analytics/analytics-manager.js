// Analytics data management
window.AnalyticsManager = {
    // Load analytics data
    async loadAnalyticsData(timeframe = null, dateIndex = null) {
        this.analyticsLoading = true;
        
        if (timeframe !== null) this.analyticsTimeframe = timeframe;
        if (dateIndex !== null) this.analyticsDateIndex = dateIndex;
        
        try {
            const params = new URLSearchParams({
                timeframe: this.analyticsTimeframe,
                dateIndex: this.analyticsDateIndex
            });
            
            const response = await fetch(`${API_URL}/api/analytics?${params}`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            const data = await response.json();
            
            // Process data for bubble chart
            this.bubbleChartData = this.processBubbleChartData(data);
            
            // Process period summary data
            if (data.periodSummary && this.analyticsTimeframe !== 'quarter') {
                this.periodSummaryData = this.processPeriodSummaryData(data.periodSummary);
            } else {
                this.periodSummaryData = null;
            }
            
            // Update selected period date
            this.selectedPeriodDate = data.periodDate || null;
            
            // Render charts after data is loaded
            this.$nextTick(() => {
                window.ChartRenderer.renderBubbleChart.call(this);
                if (this.periodSummaryData) {
                    window.ChartRenderer.renderPeriodSummary.call(this);
                }
            });
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            this.analyticsLoading = false;
        }
    },
    
    // Process data for bubble chart
    processBubbleChartData(data) {
        if (!data.hourly || !Array.isArray(data.hourly)) return [];
        
        return data.hourly.map(item => ({
            hour: item.hour,
            dayOfWeek: item.day_of_week,
            value: item.comment_count,
            avgEngagement: item.avg_engagement || 0
        }));
    },
    
    // Process period summary data
    processPeriodSummaryData(summary) {
        if (!summary || !Array.isArray(summary)) return null;
        
        return summary.map(item => ({
            label: this.formatPeriodLabel(item),
            comments: item.comment_count || 0,
            users: item.unique_users || 0,
            engagement: item.avg_engagement || 0
        }));
    },
    
    // Format period label based on timeframe
    formatPeriodLabel(item) {
        switch (this.analyticsTimeframe) {
            case 'day':
                return `${item.hour}:00`;
            case 'week':
                return this.getDayName(item.day_of_week);
            case 'month':
                return `Day ${item.day}`;
            default:
                return item.label || '';
        }
    },
    
    // Get day name from number
    getDayName(dayNumber) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayNumber] || '';
    },
    
    // Export analytics data
    exportAnalyticsData(format = 'json') {
        if (!this.bubbleChartData) return;
        
        let content, mimeType, extension;
        
        if (format === 'csv') {
            // Convert to CSV
            const headers = ['Hour', 'Day of Week', 'Comments', 'Avg Engagement'];
            const rows = this.bubbleChartData.map(d => [
                d.hour,
                this.getDayName(d.dayOfWeek),
                d.value,
                d.avgEngagement.toFixed(2)
            ]);
            
            content = [headers, ...rows].map(row => row.join(',')).join('\n');
            mimeType = 'text/csv';
            extension = 'csv';
        } else {
            // Export as JSON
            const exportData = {
                timeframe: this.analyticsTimeframe,
                dateIndex: this.analyticsDateIndex,
                selectedDate: this.selectedPeriodDate,
                hourlyData: this.bubbleChartData,
                periodSummary: this.periodSummaryData
            };
            
            content = JSON.stringify(exportData, null, 2);
            mimeType = 'application/json';
            extension = 'json';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${this.analyticsTimeframe}-${Date.now()}.${extension}`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
};