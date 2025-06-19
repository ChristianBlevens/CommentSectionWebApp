// Chart rendering functions using D3.js
window.ChartRenderer = {
    // Render bubble chart
    renderBubbleChart() {
        const container = document.getElementById('bubble-chart');
        if (!container || !this.bubbleChartData || this.bubbleChartData.length === 0) return;
        
        // Clear existing chart
        d3.select(container).selectAll('*').remove();
        
        // Set dimensions
        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;
        
        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Define scales
        const xScale = d3.scaleLinear()
            .domain([0, 23])
            .range([0, width]);
        
        const yScale = d3.scaleLinear()
            .domain([0, 6])
            .range([height, 0]);
        
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(this.bubbleChartData, d => d.value)])
            .range([0, 30]);
        
        const colorScale = d3.scaleSequential(d3.interpolateViridis)
            .domain([0, d3.max(this.bubbleChartData, d => d.avgEngagement)]);
        
        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale).tickFormat(d => `${d}:00`))
            .append('text')
            .attr('x', width / 2)
            .attr('y', 40)
            .attr('fill', 'currentColor')
            .style('text-anchor', 'middle')
            .text('Hour of Day');
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        g.append('g')
            .call(d3.axisLeft(yScale).tickFormat(d => dayNames[d]))
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -40)
            .attr('x', -height / 2)
            .attr('fill', 'currentColor')
            .style('text-anchor', 'middle')
            .text('Day of Week');
        
        // Add bubbles
        const bubbles = g.selectAll('.bubble')
            .data(this.bubbleChartData)
            .enter().append('g')
            .attr('class', 'bubble');
        
        bubbles.append('circle')
            .attr('cx', d => xScale(d.hour))
            .attr('cy', d => yScale(d.dayOfWeek))
            .attr('r', d => radiusScale(d.value))
            .attr('fill', d => colorScale(d.avgEngagement))
            .attr('opacity', 0.7)
            .attr('stroke', 'var(--border-medium)')
            .attr('stroke-width', 1);
        
        // Add labels for larger bubbles
        bubbles.filter(d => d.value > 0)
            .append('text')
            .attr('x', d => xScale(d.hour))
            .attr('y', d => yScale(d.dayOfWeek))
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', 'var(--text-primary)')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .text(d => d.value);
        
        // Add tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'chart-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background', 'var(--bg-main)')
            .style('border', '1px solid var(--border-medium)')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('font-size', '12px');
        
        bubbles.on('mouseover', (event, d) => {
            tooltip.transition().duration(200).style('opacity', .9);
            tooltip.html(`
                <strong>${dayNames[d.dayOfWeek]} ${d.hour}:00</strong><br/>
                Comments: ${d.value}<br/>
                Avg Engagement: ${d.avgEngagement.toFixed(1)}
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', () => {
            tooltip.transition().duration(500).style('opacity', 0);
        });
        
        // Add title
        svg.append('text')
            .attr('x', (width + margin.left + margin.right) / 2)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .attr('fill', 'var(--text-primary)')
            .text('Comment Activity Heatmap');
    },
    
    // Render period summary chart
    renderPeriodSummary() {
        const container = document.getElementById('period-summary-chart');
        if (!container || !this.periodSummaryData) return;
        
        // Clear existing chart
        d3.select(container).selectAll('*').remove();
        
        // Set dimensions
        const margin = { top: 40, right: 120, bottom: 60, left: 60 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = 300 - margin.top - margin.bottom;
        
        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Define scales
        const xScale = d3.scaleBand()
            .domain(this.periodSummaryData.map(d => d.label))
            .range([0, width])
            .padding(0.1);
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(this.periodSummaryData, d => Math.max(d.comments, d.users))])
            .nice()
            .range([height, 0]);
        
        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)');
        
        g.append('g')
            .call(d3.axisLeft(yScale));
        
        // Add bars for comments
        g.selectAll('.bar-comments')
            .data(this.periodSummaryData)
            .enter().append('rect')
            .attr('class', 'bar-comments')
            .attr('x', d => xScale(d.label))
            .attr('y', d => yScale(d.comments))
            .attr('width', xScale.bandwidth() / 2)
            .attr('height', d => height - yScale(d.comments))
            .attr('fill', 'var(--primary-color)')
            .attr('opacity', 0.8);
        
        // Add bars for users
        g.selectAll('.bar-users')
            .data(this.periodSummaryData)
            .enter().append('rect')
            .attr('class', 'bar-users')
            .attr('x', d => xScale(d.label) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d.users))
            .attr('width', xScale.bandwidth() / 2)
            .attr('height', d => height - yScale(d.users))
            .attr('fill', 'var(--primary-hover)')
            .attr('opacity', 0.8);
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width + margin.left + 20}, ${margin.top})`);
        
        const legendData = [
            { label: 'Comments', color: 'var(--primary-color)' },
            { label: 'Users', color: 'var(--primary-hover)' }
        ];
        
        legend.selectAll('.legend-item')
            .data(legendData)
            .enter().append('g')
            .attr('class', 'legend-item')
            .attr('transform', (d, i) => `translate(0, ${i * 20})`)
            .each(function(d) {
                const item = d3.select(this);
                
                item.append('rect')
                    .attr('width', 15)
                    .attr('height', 15)
                    .attr('fill', d.color)
                    .attr('opacity', 0.8);
                
                item.append('text')
                    .attr('x', 20)
                    .attr('y', 12)
                    .text(d.label)
                    .style('font-size', '12px')
                    .attr('fill', 'var(--text-primary)');
            });
        
        // Add title
        svg.append('text')
            .attr('x', (width + margin.left + margin.right) / 2)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .attr('fill', 'var(--text-primary)')
            .text(`${this.analyticsTimeframe.charAt(0).toUpperCase() + this.analyticsTimeframe.slice(1)} Summary`);
    }
};