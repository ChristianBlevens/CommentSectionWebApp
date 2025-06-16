// Analytics UI renderer for analytics interface
import { DomUtils, DateUtils, StringUtils } from '../../utils/index.js';

export class AnalyticsUI {
  constructor(analyticsModule) {
    this.analytics = analyticsModule;
    this.container = null;
  }

  // Render analytics panel
  renderPanel(container) {
    this.container = container;
    
    const panelHtml = `
      <div class="analytics-panel">
        ${this.renderHeader()}
        ${this.renderControls()}
        ${this.renderContent()}
      </div>
    `;
    
    this.container.innerHTML = panelHtml;
    
    // Set up chart container
    const chartContainer = this.container.querySelector('#bubbleChart');
    if (chartContainer) {
      this.analytics.setChartContainer(chartContainer);
    }
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Load initial data if visible
    if (this.analytics.state.isVisible && !this.analytics.state.bubbleChartData) {
      this.analytics.loadData();
    }
  }

  // Render header
  renderHeader() {
    return `
      <div class="analytics-header">
        <h2>
          <i class="fas fa-chart-bubble"></i>
          Activity Analytics
        </h2>
        <button class="btn btn-secondary" onclick="analyticsModule.exportChart()">
          <i class="fas fa-download"></i> Export Chart
        </button>
      </div>
    `;
  }

  // Render controls
  renderControls() {
    return `
      <div class="analytics-controls">
        ${this.renderTimeframeSelector()}
        ${this.renderDateSelector()}
      </div>
    `;
  }

  // Render timeframe selector
  renderTimeframeSelector() {
    const timeframes = [
      { value: 'day', label: 'Daily' },
      { value: 'week', label: 'Weekly' },
      { value: 'month', label: 'Monthly' }
    ];
    
    return `
      <div class="timeframe-selector">
        ${timeframes.map(tf => `
          <button class="timeframe-btn ${this.analytics.state.timeframe === tf.value ? 'active' : ''}"
                  data-timeframe="${tf.value}"
                  onclick="analyticsModule.setTimeframe('${tf.value}')">
            ${tf.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  // Render date selector
  renderDateSelector() {
    const dates = this.analytics.getAvailableDates();
    
    return `
      <div class="date-selector">
        <select class="date-select" 
                onchange="analyticsModule.setDateIndex(parseInt(this.value))"
                ${this.analytics.state.isLoading ? 'disabled' : ''}>
          ${dates.map(date => `
            <option value="${date.value}" ${date.value === this.analytics.state.dateIndex ? 'selected' : ''}>
              ${date.label}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  // Render content
  renderContent() {
    if (this.analytics.state.isLoading) {
      return this.renderLoadingState();
    }
    
    if (this.analytics.state.error) {
      return this.renderErrorState(this.analytics.state.error);
    }
    
    return `
      <div class="analytics-content">
        <div class="chart-container">
          <div id="bubbleChart"></div>
        </div>
        ${this.renderStats()}
        ${this.renderInfo()}
      </div>
    `;
  }

  // Render statistics
  renderStats() {
    const stats = this.analytics.getSummaryStats();
    
    return `
      <div class="analytics-stats">
        <div class="stat-item">
          <div class="stat-value">${stats.totalPages}</div>
          <div class="stat-label">Active Pages</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.totalAuthors}</div>
          <div class="stat-label">Active Users</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.totalComments}</div>
          <div class="stat-label">Total Comments</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.avgCommentsPerPage}</div>
          <div class="stat-label">Avg per Page</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.avgCommentsPerAuthor}</div>
          <div class="stat-label">Avg per User</div>
        </div>
      </div>
    `;
  }

  // Render info
  renderInfo() {
    return `
      <div class="analytics-info">
        <p>
          <i class="fas fa-info-circle"></i>
          Bubble size represents comment count. Click on bubbles to view the page.
        </p>
      </div>
    `;
  }

  // Render loading state
  renderLoadingState() {
    return `
      <div class="analytics-loading">
        <div class="spinner"></div>
        <p>Loading analytics data...</p>
      </div>
    `;
  }

  // Render error state
  renderErrorState(error) {
    return `
      <div class="analytics-error">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading analytics: ${StringUtils.escapeHtml(error)}</p>
        <button class="btn btn-primary" onclick="analyticsModule.loadData()">
          Try Again
        </button>
      </div>
    `;
  }

  // Setup event handlers
  setupEventHandlers() {
    // Listen for analytics events
    this.analytics.on('analytics:loading', () => this.updateLoadingState(true));
    this.analytics.on('analytics:dataLoaded', () => this.updateLoadingState(false));
    this.analytics.on('analytics:error', (data) => this.showError(data.error));
    this.analytics.on('analytics:chartRendered', () => this.updateStats());
  }

  // Update loading state
  updateLoadingState(isLoading) {
    // Update controls
    const selects = this.container.querySelectorAll('select, button');
    selects.forEach(el => {
      el.disabled = isLoading;
    });
    
    // Update content if needed
    if (isLoading && !this.analytics.state.bubbleChartData) {
      const content = this.container.querySelector('.analytics-content');
      if (content) {
        content.innerHTML = this.renderLoadingState();
      }
    }
  }

  // Update stats
  updateStats() {
    const statsContainer = this.container.querySelector('.analytics-stats');
    if (statsContainer) {
      statsContainer.outerHTML = this.renderStats();
    }
  }

  // Show error
  showError(error) {
    const content = this.container.querySelector('.analytics-content');
    if (content) {
      content.innerHTML = this.renderErrorState(error);
    }
  }

  // Update timeframe buttons
  updateTimeframeButtons() {
    const buttons = this.container.querySelectorAll('.timeframe-btn');
    buttons.forEach(btn => {
      const timeframe = btn.dataset.timeframe;
      btn.classList.toggle('active', timeframe === this.analytics.state.timeframe);
    });
  }

  // Update date selector
  updateDateSelector() {
    const selector = this.container.querySelector('.date-selector');
    if (selector) {
      selector.innerHTML = this.renderDateSelector();
    }
  }
}

// Export UI
export default AnalyticsUI;