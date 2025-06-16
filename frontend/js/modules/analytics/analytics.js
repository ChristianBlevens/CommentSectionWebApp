// Analytics module for activity data visualization
import { BaseModule } from '../../core/base-module.js';
import { EventBus } from '../../core/event-bus.js';
import { StateManager } from '../../core/state-manager.js';
import { ApiClient } from '../../core/api-client.js';
import { DateUtils } from '../../utils/index.js';

class AnalyticsModule extends BaseModule {
  constructor() {
    super();
    this.name = 'analytics';
    
    // Module state
    this.state = {
      isLoading: false,
      bubbleChartData: null,
      timeframe: 'day',
      dateIndex: 0,
      availableDates: [],
      selectedDate: null,
      chartInstance: null,
      isVisible: false,
      error: null
    };
    
    // API client instance
    this.api = new ApiClient();
    
    // Event bus instance
    this.eventBus = window.eventBus || new EventBus();
    
    // State manager instance
    this.stateManager = window.stateManager || new StateManager();
    
    // D3.js reference
    this.d3 = null;
    
    // Chart container
    this.chartContainer = null;
  }

  // Initialize the module
  async initialize(config = {}) {
    this.config = config;
    
    // Check if D3.js is available
    if (!window.d3) {
      console.warn('D3.js not found. Analytics charts will not be available.');
      this.emit('analytics:error', { error: 'D3.js library not loaded' });
      return false;
    }
    
    this.d3 = window.d3;
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.initialized = true;
    this.emit('analytics:initialized');
    
    return true;
  }

  // Setup event listeners
  setupEventListeners() {
    // Listen for auth changes
    this.on('auth:login', (user) => this.handleAuthChange(user));
    this.on('auth:logout', () => this.handleLogout());
    
    // Listen for visibility changes
    this.on('analytics:show', () => this.show());
    this.on('analytics:hide', () => this.hide());
  }

  // Handle auth change
  handleAuthChange(user) {
    // Analytics is typically restricted to moderators
    if (user && user.is_moderator) {
      this.emit('analytics:available');
    }
  }

  // Handle logout
  handleLogout() {
    this.clearData();
    this.hide();
  }

  // Show analytics
  async show() {
    this.state.isVisible = true;
    
    // Load data if not already loaded
    if (!this.state.bubbleChartData) {
      await this.loadData();
    }
    
    this.emit('analytics:shown');
  }

  // Hide analytics
  hide() {
    this.state.isVisible = false;
    this.emit('analytics:hidden');
  }

  // Load analytics data
  async loadData() {
    this.state.isLoading = true;
    this.state.error = null;
    this.emit('analytics:loading');
    
    try {
      const params = new URLSearchParams({
        period: this.state.timeframe,
        date_index: this.state.dateIndex
      });
      
      const response = await this.api.get(`/api/analytics/activity-data?${params}`);
      
      if (response.data) {
        this.state.bubbleChartData = response.data;
        this.state.availableDates = response.available_dates || [];
        this.state.selectedDate = response.selected_date || null;
        
        // Render chart if container is available
        if (this.chartContainer) {
          this.renderBubbleChart();
        }
        
        this.emit('analytics:dataLoaded', { data: response.data });
      }
    } catch (error) {
      this.state.error = error.message;
      this.emit('analytics:error', { error: error.message });
    } finally {
      this.state.isLoading = false;
    }
  }

  // Set timeframe
  async setTimeframe(timeframe) {
    if (this.state.timeframe === timeframe) return;
    
    this.state.timeframe = timeframe;
    this.state.dateIndex = 0; // Reset to most recent
    
    await this.loadData();
    
    this.emit('analytics:timeframeChanged', { timeframe });
  }

  // Set date index
  async setDateIndex(index) {
    if (this.state.dateIndex === index) return;
    
    this.state.dateIndex = index;
    
    await this.loadData();
    
    this.emit('analytics:dateChanged', { index, date: this.state.selectedDate });
  }

  // Set chart container
  setChartContainer(container) {
    this.chartContainer = container;
    
    // Render chart if data is available
    if (this.state.bubbleChartData && this.d3) {
      this.renderBubbleChart();
    }
  }

  // Render bubble chart
  renderBubbleChart() {
    if (!this.chartContainer || !this.d3 || !this.state.bubbleChartData) {
      return;
    }
    
    // Clear existing chart
    this.d3.select(this.chartContainer).selectAll("*").remove();
    
    const data = this.state.bubbleChartData;
    const container = this.chartContainer;
    
    // Set dimensions
    const width = container.offsetWidth || 800;
    const height = 600;
    
    // Create SVG
    const svg = this.d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    
    // Process data - flatten nested structure
    const nodes = [];
    data.forEach(page => {
      page.authors.forEach(author => {
        nodes.push({
          id: `${page.page_path}-${author.author}`,
          page: page.page_path,
          author: author.author,
          comments: author.comments,
          url: page.page_path
        });
      });
    });
    
    // Create scales
    const radiusScale = this.d3.scaleSqrt()
      .domain([0, this.d3.max(nodes, d => d.comments)])
      .range([5, 50]);
    
    const colorScale = this.d3.scaleOrdinal()
      .domain([...new Set(nodes.map(d => d.page))])
      .range(this.d3.schemeCategory10);
    
    // Create force simulation
    const simulation = this.d3.forceSimulation(nodes)
      .force("x", this.d3.forceX(width / 2).strength(0.05))
      .force("y", this.d3.forceY(height / 2).strength(0.05))
      .force("collide", this.d3.forceCollide(d => radiusScale(d.comments) + 2))
      .force("charge", this.d3.forceManyBody().strength(-50));
    
    // Create tooltip
    const tooltip = this.d3.select("body")
      .append("div")
      .attr("class", "analytics-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "rgba(0, 0, 0, 0.8)")
      .style("color", "white")
      .style("padding", "10px")
      .style("border-radius", "5px")
      .style("font-size", "14px")
      .style("pointer-events", "none")
      .style("z-index", "1000");
    
    // Create bubbles
    const bubbles = svg.selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", d => radiusScale(d.comments))
      .attr("fill", d => colorScale(d.page))
      .attr("fill-opacity", 0.7)
      .attr("stroke", d => colorScale(d.page))
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        tooltip.style("visibility", "visible")
          .html(`
            <strong>${d.author}</strong><br>
            Page: ${d.page}<br>
            Comments: ${d.comments}
          `);
      })
      .on("mousemove", (event) => {
        tooltip.style("top", (event.pageY - 10) + "px")
          .style("left", (event.pageX + 10) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("visibility", "hidden");
      })
      .on("click", (event, d) => {
        if (d.url) {
          window.open(d.url, '_blank');
        }
      });
    
    // Add labels for larger bubbles
    const labels = svg.selectAll("text")
      .data(nodes.filter(d => radiusScale(d.comments) > 20))
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .style("font-size", "12px")
      .style("fill", "white")
      .style("pointer-events", "none")
      .text(d => d.author.substring(0, 10) + (d.author.length > 10 ? "..." : ""));
    
    // Update positions on simulation tick
    simulation.on("tick", () => {
      bubbles
        .attr("cx", d => Math.max(radiusScale(d.comments), Math.min(width - radiusScale(d.comments), d.x)))
        .attr("cy", d => Math.max(radiusScale(d.comments), Math.min(height - radiusScale(d.comments), d.y)));
      
      labels
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });
    
    // Clean up tooltip on unmount
    this.chartInstance = {
      svg,
      tooltip,
      simulation
    };
    
    this.emit('analytics:chartRendered');
  }

  // Export chart as image
  async exportChart() {
    if (!this.chartContainer || !this.chartInstance) {
      console.error('No chart to export');
      return;
    }
    
    try {
      const svg = this.chartContainer.querySelector('svg');
      if (!svg) return;
      
      // Get SVG data
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      
      // Convert to canvas
      const img = new Image();
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svg.getAttribute('width');
        canvas.height = svg.getAttribute('height');
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // Download as PNG
        canvas.toBlob((blob) => {
          const link = document.createElement('a');
          link.download = `analytics-${this.state.timeframe}-${Date.now()}.png`;
          link.href = URL.createObjectURL(blob);
          link.click();
          
          // Clean up
          URL.revokeObjectURL(url);
          URL.revokeObjectURL(link.href);
        });
      };
      
      img.src = url;
      
      this.emit('analytics:exported');
    } catch (error) {
      console.error('Error exporting chart:', error);
      this.emit('analytics:error', { error: 'Failed to export chart' });
    }
  }

  // Get available dates for dropdown
  getAvailableDates() {
    return this.state.availableDates.map((date, index) => ({
      value: index,
      label: this.formatDateLabel(date),
      date: date
    }));
  }

  // Format date label for display
  formatDateLabel(date) {
    const d = new Date(date);
    
    switch (this.state.timeframe) {
      case 'day':
        return DateUtils.formatDate(d, 'default');
      case 'week':
        const weekEnd = new Date(d);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return `Week of ${DateUtils.formatDate(d, 'short')} - ${DateUtils.formatDate(weekEnd, 'short')}`;
      case 'month':
        return d.toLocaleDateString('default', { month: 'long', year: 'numeric' });
      default:
        return DateUtils.formatDate(d, 'default');
    }
  }

  // Get summary statistics
  getSummaryStats() {
    if (!this.state.bubbleChartData) {
      return {
        totalPages: 0,
        totalAuthors: 0,
        totalComments: 0,
        avgCommentsPerPage: 0,
        avgCommentsPerAuthor: 0
      };
    }
    
    const data = this.state.bubbleChartData;
    let totalAuthors = 0;
    let totalComments = 0;
    
    data.forEach(page => {
      totalAuthors += page.authors.length;
      page.authors.forEach(author => {
        totalComments += author.comments;
      });
    });
    
    return {
      totalPages: data.length,
      totalAuthors,
      totalComments,
      avgCommentsPerPage: data.length > 0 ? (totalComments / data.length).toFixed(1) : 0,
      avgCommentsPerAuthor: totalAuthors > 0 ? (totalComments / totalAuthors).toFixed(1) : 0
    };
  }

  // Clear data
  clearData() {
    this.state.bubbleChartData = null;
    this.state.availableDates = [];
    this.state.selectedDate = null;
    
    // Clean up chart
    if (this.chartInstance) {
      if (this.chartInstance.tooltip) {
        this.chartInstance.tooltip.remove();
      }
      if (this.chartInstance.simulation) {
        this.chartInstance.simulation.stop();
      }
      this.chartInstance = null;
    }
    
    // Clear container
    if (this.chartContainer && this.d3) {
      this.d3.select(this.chartContainer).selectAll("*").remove();
    }
  }

  // Cleanup module
  cleanup() {
    super.cleanup();
    this.clearData();
  }
}

// Export module
export default AnalyticsModule;