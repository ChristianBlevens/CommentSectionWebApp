// Analytics features
const Analytics = {
    // Load analytics data based on timeframe
    async loadAnalyticsData(state) {
        state.analyticsLoading = true;
        try {
            // For 90-day view, just load single period
            if (state.analyticsTimeframe === 'quarter') {
                const data = await API.analytics.getActivityData('quarter', 0);
                if (data.success) {
                    state.bubbleChartData = data;
                    await new Promise(resolve => state.$nextTick(resolve));
                    setTimeout(() => {
                        this.renderBubbleChart(state);
                    }, 50);
                }
            } else {
                // For day/week/month, load period summary for bar chart
                await this.loadPeriodSummary(state);
                
                // Load data for selected period or most recent
                const targetDate = state.selectedPeriodDate || 
                    (state.periodSummaryData && state.periodSummaryData[state.periodSummaryData.length - 1]?.date);
                    
                if (targetDate) {
                    await this.loadPeriodData(state, targetDate);
                }
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            state.analyticsLoading = false;
        }
    },
    
    // Load period summary for bar chart
    async loadPeriodSummary(state) {
        try {
            const data = await API.analytics.getPeriodSummary(state.analyticsTimeframe);
            if (data.success) {
                state.periodSummaryData = data.summary;
                await new Promise(resolve => state.$nextTick(resolve));
                this.renderBarChart(state);
            }
        } catch (error) {
            console.error('Error loading period summary:', error);
        }
    },
    
    // Load data for specific period
    async loadPeriodData(state, date) {
        try {
            // Find index of the date in summary data
            const index = state.periodSummaryData?.findIndex(d => d.date === date) ?? 0;
            
            const data = await API.analytics.getActivityData(state.analyticsTimeframe, index);
            if (data.success) {
                state.bubbleChartData = data;
                state.selectedPeriodDate = date;
                await new Promise(resolve => state.$nextTick(resolve));
                setTimeout(() => {
                    this.renderBubbleChart(state);
                }, 50);
            }
        } catch (error) {
            console.error('Error loading period data:', error);
        }
    },

    // Render bubble chart
    renderBubbleChart(state) {
        const container = document.getElementById('bubble-chart-container');
        if (!container || !state.bubbleChartData) return;
        
        // Clear existing chart
        d3.select(container).selectAll("*").remove();
        
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = 600 - margin.top - margin.bottom;
        
        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
            
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Prepare data
        const data = state.bubbleChartData.data;
        if (!data || data.length === 0) {
            g.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .style('fill', '#6b7280')
                .text('No activity data available for this period');
            return;
        }
        
        // Create hierarchy
        const root = d3.hierarchy({ children: data })
            .sum(d => d.totalActivity)
            .sort((a, b) => b.value - a.value);
            
        // Create bubble layout
        const pack = d3.pack()
            .size([width, height])
            .padding(3);
            
        const nodes = pack(root).descendants().filter(d => d.depth === 1);
        
        // Color scale
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        
        // Create nodes
        const node = g.selectAll('.node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.x},${d.y})`);
            
        // Add circles
        node.append('circle')
            .attr('r', d => d.r)
            .style('fill', (d, i) => colorScale(i))
            .style('fill-opacity', 0.7)
            .style('stroke', (d, i) => colorScale(i))
            .style('stroke-width', 2);
            
        // Add labels
        node.append('text')
            .attr('dy', '.3em')
            .style('text-anchor', 'middle')
            .style('font-size', d => Math.min(d.r / 3, 14) + 'px')
            .style('fill', '#111827')
            .text(d => d.data.pageId)
            .each(function(d) {
                const self = d3.select(this);
                const text = d.data.pageId;
                if (text.length * 7 > d.r * 2) {
                    self.text(text.substring(0, Math.floor(d.r * 2 / 7)) + '...');
                }
            });
            
        // Add count labels
        node.append('text')
            .attr('dy', '1.5em')
            .style('text-anchor', 'middle')
            .style('font-size', d => Math.min(d.r / 4, 12) + 'px')
            .style('fill', '#6b7280')
            .text(d => d.data.totalActivity);
            
        // Add tooltip
        node.append('title')
            .text(d => `${d.data.pageId}: ${d.data.totalActivity} activities`);
    },
    
    // Render bar chart for navigation
    renderBarChart(state) {
        const container = document.getElementById('bar-chart-container');
        if (!container || !state.periodSummaryData || state.analyticsTimeframe === 'quarter') return;
        
        // Clear existing chart
        d3.select(container).selectAll("*").remove();
        
        const margin = { top: 10, right: 10, bottom: 30, left: 10 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = 80 - margin.top - margin.bottom;
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
            
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
            
        const data = state.periodSummaryData;
        
        // Scales
        const x = d3.scaleBand()
            .domain(data.map(d => d.date))
            .range([0, width])
            .padding(0.1);
            
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.totalComments)])
            .range([height, 0]);
            
        // Bars
        g.selectAll('.bar')
            .data(data)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d.date))
            .attr('y', d => y(d.totalComments))
            .attr('width', x.bandwidth())
            .attr('height', d => height - y(d.totalComments))
            .style('fill', d => d.date === state.selectedPeriodDate ? '#3b82f6' : '#e5e7eb')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                this.loadPeriodData(state, d.date);
            });
            
        // Add labels for significant dates
        const labelInterval = Math.ceil(data.length / 10);
        g.selectAll('.label')
            .data(data.filter((d, i) => i % labelInterval === 0))
            .enter().append('text')
            .attr('x', d => x(d.date) + x.bandwidth() / 2)
            .attr('y', height + 20)
            .attr('text-anchor', 'middle')
            .style('font-size', '10px')
            .style('fill', '#6b7280')
            .text(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    },
    
    // Export chart as PNG
    exportBubbleChart(state) {
        const container = document.getElementById('bubble-chart-container');
        if (!container) return;
        
        const svg = container.querySelector('svg');
        if (!svg) return;
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Get SVG data
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        // Create image
        const img = new Image();
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            context.fillStyle = 'white';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(img, 0, 0);
            
            // Download
            canvas.toBlob(function(blob) {
                const link = document.createElement('a');
                link.download = `comment-activity-${state.analyticsTimeframe}-${new Date().toISOString().split('T')[0]}.png`;
                link.href = URL.createObjectURL(blob);
                link.click();
            });
            
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }
};