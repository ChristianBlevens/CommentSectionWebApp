// Analytics features
const Analytics = {
    // Load analytics data
    async loadAnalytics(state, timeframe = '24h') {
        if (state.analyticsLoading || !AppState.hasPermission(state, 'moderate')) return;
        
        state.analyticsLoading = true;
        state.selectedTimeframe = timeframe;
        
        try {
            const data = await API.analytics.get(timeframe);
            state.analytics = data;
            
            // Update visualizations
            if (state.analytics) {
                this.updateBubbleChart(state);
                this.updateBarChart(state);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            state.analyticsLoading = false;
        }
    },

    // Create bubble chart visualization
    updateBubbleChart(state) {
        const container = document.querySelector('#bubble-chart');
        if (!container || !state.analytics) return;
        
        // Clear previous chart
        d3.select(container).selectAll("*").remove();
        
        const width = container.clientWidth;
        const height = 400;
        
        // Prepare data
        const data = state.analytics.by_page.map(page => ({
            name: page.page_path,
            value: page.comment_count,
            comments: page.comment_count
        }));
        
        // Create color scale
        const maxComments = Math.max(...data.map(d => d.comments));
        const colorScale = d3.scaleSequential()
            .domain([0, maxComments])
            .interpolator(d3.interpolateBlues);
        
        // Create bubble layout
        const pack = d3.pack()
            .size([width, height])
            .padding(5);
        
        const root = d3.hierarchy({children: data})
            .sum(d => d.value);
        
        const nodes = pack(root).leaves();
        
        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);
        
        // Create bubbles
        const bubbles = svg.selectAll('.bubble')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'bubble')
            .attr('transform', d => `translate(${d.x},${d.y})`);
        
        // Add circles
        bubbles.append('circle')
            .attr('r', d => d.r)
            .style('fill', d => colorScale(d.data.comments))
            .style('opacity', 0.8)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                state.selectedPage = d.data.name;
                window.open(d.data.name, '_blank');
            })
            .on('mouseover', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style('opacity', 1)
                    .attr('r', d.r * 1.1);
                
                // Show tooltip
                const tooltip = d3.select('body').append('div')
                    .attr('class', 'analytics-tooltip')
                    .style('opacity', 0);
                
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                
                tooltip.html(`
                    <strong>${d.data.name}</strong><br/>
                    ${d.data.comments} comments
                `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 28) + 'px');
            })
            .on('mouseout', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style('opacity', 0.8)
                    .attr('r', d.r);
                
                d3.selectAll('.analytics-tooltip').remove();
            });
        
        // Add labels for larger bubbles
        bubbles.filter(d => d.r > 30)
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '.3em')
            .style('font-size', d => Math.min(d.r / 3, 14) + 'px')
            .style('pointer-events', 'none')
            .text(d => {
                const path = d.data.name;
                const parts = path.split('/');
                return parts[parts.length - 1] || 'Home';
            });
    },

    // Create bar chart visualization
    updateBarChart(state) {
        const container = document.querySelector('#bar-chart');
        if (!container || !state.analytics) return;
        
        // Clear previous chart
        d3.select(container).selectAll("*").remove();
        
        const margin = {top: 20, right: 20, bottom: 70, left: 50};
        const width = container.clientWidth - margin.left - margin.right;
        const height = 300 - margin.top - margin.bottom;
        
        // Prepare data
        const data = state.analytics.by_time.map(item => ({
            time: new Date(item.time_bucket),
            count: item.comment_count
        }));
        
        // Create scales
        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.time))
            .range([0, width]);
        
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.count)])
            .range([height, 0]);
        
        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Add X axis
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x)
                .tickFormat(d3.timeFormat(this.getTimeFormat(state.selectedTimeframe))));
        
        // Add Y axis
        svg.append('g')
            .call(d3.axisLeft(y));
        
        // Add bars
        svg.selectAll('.bar')
            .data(data)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d.time))
            .attr('width', width / data.length * 0.8)
            .attr('y', d => y(d.count))
            .attr('height', d => height - y(d.count))
            .style('fill', '#3b82f6')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                state.selectedDate = d.time;
                // Could implement drill-down functionality here
            })
            .on('mouseover', function(event, d) {
                d3.select(this).style('fill', '#2563eb');
                
                // Show tooltip
                const tooltip = d3.select('body').append('div')
                    .attr('class', 'analytics-tooltip')
                    .style('opacity', 0);
                
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                
                tooltip.html(`
                    <strong>${d3.timeFormat('%Y-%m-%d %H:%M')(d.time)}</strong><br/>
                    ${d.count} comments
                `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 28) + 'px');
            })
            .on('mouseout', function() {
                d3.select(this).style('fill', '#3b82f6');
                d3.selectAll('.analytics-tooltip').remove();
            });
        
        // Add labels
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 0 - margin.left)
            .attr('x', 0 - (height / 2))
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .text('Comment Count');
        
        svg.append('text')
            .attr('transform', `translate(${width / 2}, ${height + margin.bottom})`)
            .style('text-anchor', 'middle')
            .text('Time');
    },

    // Get appropriate time format based on timeframe
    getTimeFormat(timeframe) {
        switch(timeframe) {
            case '24h':
                return '%H:%M';
            case '7d':
                return '%m/%d';
            case '30d':
                return '%m/%d';
            default:
                return '%Y-%m-%d';
        }
    },

    // Export chart as image
    exportChart(chartId) {
        const chartElement = document.querySelector(`#${chartId} svg`);
        if (!chartElement) return;
        
        // Get SVG data
        const svgData = new XMLSerializer().serializeToString(chartElement);
        const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
        
        // Convert to PNG using canvas
        const img = new Image();
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = chartElement.clientWidth;
            canvas.height = chartElement.clientHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // Download PNG
            canvas.toBlob(function(blob) {
                const link = document.createElement('a');
                link.download = `${chartId}-${Date.now()}.png`;
                link.href = URL.createObjectURL(blob);
                link.click();
            });
            
            URL.revokeObjectURL(url);
        };
        
        img.src = url;
    }
};