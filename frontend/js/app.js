// Main application bootstrap file
import { ModuleLoader } from './core/module-loader.js';
import { ConfigManager } from './core/config-manager.js';
import { EventBus } from './core/event-bus.js';
import { StateManager } from './core/state-manager.js';
import { ApiClient } from './core/api-client.js';

// Import modules
import { CommentsModule } from './modules/comments/index.js';
import { ModerationModule } from './modules/moderation/index.js';
import { AnalyticsModule } from './modules/analytics/index.js';
import { ThemeEditorModule } from './modules/theme-editor/index.js';
import { ReactionsModule } from './modules/reactions/index.js';
import { MarkdownModule } from './modules/markdown/index.js';

// Create global instances
window.eventBus = new EventBus();
window.stateManager = new StateManager();
window.apiClient = new ApiClient();
window.configManager = new ConfigManager();
window.moduleLoader = new ModuleLoader();

// Register modules with loader
window.moduleLoader.register('comments', CommentsModule);
window.moduleLoader.register('moderation', ModerationModule);
window.moduleLoader.register('analytics', AnalyticsModule);
window.moduleLoader.register('theme-editor', ThemeEditorModule);
window.moduleLoader.register('reactions', ReactionsModule);
window.moduleLoader.register('markdown', MarkdownModule);

// Application class
class CommentSystemApp {
  constructor() {
    this.modules = {};
    this.initialized = false;
    this.config = null;
  }

  // Initialize application
  async initialize() {
    console.log('Initializing Comment System App...');
    
    try {
      // Load configuration
      await window.configManager.load('/js/modules.json');
      this.config = window.configManager.getConfig();
      
      // Set API base URL
      window.apiClient.baseUrl = this.config.apiUrl || window.location.origin;
      
      // Initialize module loader
      await window.moduleLoader.initialize(this.config);
      
      // Load active modules
      const activeModules = this.config.activeModules || ['comments'];
      console.log('Loading modules:', activeModules);
      
      for (const moduleName of activeModules) {
        try {
          const module = await window.moduleLoader.load(moduleName);
          this.modules[moduleName] = module;
          
          // Make module globally available with proper name
          const globalName = moduleName.replace(/-/g, '');
          window[`${globalName}Module`] = module;
        } catch (error) {
          console.error(`Failed to load module ${moduleName}:`, error);
        }
      }
      
      // Setup global event handlers
      this.setupGlobalEvents();
      
      // Initialize UI
      this.initializeUI();
      
      this.initialized = true;
      window.eventBus.emit('app:initialized');
      
      console.log('Comment System App initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Failed to initialize application');
    }
  }

  // Setup global event handlers
  setupGlobalEvents() {
    // Handle authentication
    window.eventBus.on('auth:required', () => {
      this.showAuthPrompt();
    });
    
    // Handle global errors
    window.eventBus.on('error', (data) => {
      this.showError(data.message || 'An error occurred');
    });
    
    // Handle notifications
    window.eventBus.on('notification', (data) => {
      this.showNotification(data.message, data.type);
    });
    
    // Setup auth listener
    if (window.Auth) {
      window.Auth.setupOAuthListener((user, data) => {
        window.stateManager.setState('auth', 'user', user);
        window.eventBus.emit('auth:login', user);
        
        // Reload comments if comments module is active
        if (this.modules.comments) {
          this.modules.comments.loadComments();
        }
      });
    }
  }

  // Initialize UI
  initializeUI() {
    // Initialize Alpine.js data if available
    if (window.Alpine) {
      this.initializeAlpineData();
    }
    
    // Setup comment form if comments module is active
    if (this.modules.comments) {
      this.setupCommentForm();
    }
    
    // Setup moderation dashboard if moderation module is active
    if (this.modules.moderation) {
      this.setupModerationDashboard();
    }
    
    // Setup analytics panel if analytics module is active
    if (this.modules.analytics) {
      this.setupAnalyticsPanel();
    }
    
    // Setup theme editor if theme-editor module is active
    if (this.modules['theme-editor']) {
      this.setupThemeEditor();
    }
  }

  // Initialize Alpine.js data
  initializeAlpineData() {
    const app = this;
    window.Alpine.data('commentSystem', () => ({
      // User state
      user: window.stateManager.getState('auth', 'user'),
      
      // UI state
      activeTab: 'comments',
      showModeratorDashboard: false,
      showAnalytics: false,
      showThemeEditor: false,
      
      // Comments state (proxy to module)
      get comments() {
        return app.modules.comments?.state.filteredComments || [];
      },
      
      get sortBy() {
        return app.modules.comments?.state.sortBy || 'likes';
      },
      
      get searchQuery() {
        return app.modules.comments?.state.searchQuery || '';
      },
      
      // Methods
      init() {
        // Check user permissions
        this.checkPermissions();
        
        // Listen for auth changes
        window.eventBus.on('auth:login', (user) => {
          this.user = user;
          this.checkPermissions();
        });
        
        window.eventBus.on('auth:logout', () => {
          this.user = null;
          this.checkPermissions();
        });
      },
      
      checkPermissions() {
        if (this.user) {
          this.showModeratorDashboard = this.user.is_moderator && app.modules.moderation;
          this.showAnalytics = this.user.is_moderator && app.modules.analytics;
          this.showThemeEditor = this.user.is_super_moderator && app.modules['theme-editor'];
        } else {
          this.showModeratorDashboard = false;
          this.showAnalytics = false;
          this.showThemeEditor = false;
        }
      },
      
      // Tab switching
      switchTab(tab) {
        this.activeTab = tab;
        window.eventBus.emit(`tab:${tab}:activated`);
      },
      
      // Auth methods
      login() {
        if (window.Auth) {
          window.Auth.login();
        }
      },
      
      logout() {
        if (window.Auth) {
          window.Auth.logout();
          window.stateManager.clearState('auth');
          window.eventBus.emit('auth:logout');
        }
      }
    }));
  }

  // Setup comment form
  setupCommentForm() {
    const formContainer = document.getElementById('comment-form-container');
    if (!formContainer) return;
    
    // Create comment form instance
    const CommentForm = this.modules.comments.CommentForm;
    const form = new CommentForm({
      onSubmit: async (text) => {
        await this.modules.comments.submitComment(text);
      },
      onChange: (text) => {
        this.modules.comments.updatePreview(text);
      }
    });
    
    // Render form
    form.render(formContainer);
  }

  // Setup moderation dashboard
  setupModerationDashboard() {
    const dashboardContainer = document.getElementById('moderation-dashboard');
    if (!dashboardContainer || !this.modules.moderation) return;
    
    // Create moderation UI instance
    const ModerationUI = this.modules.moderation.ModerationUI;
    const ui = new ModerationUI(this.modules.moderation);
    
    // Render dashboard
    ui.renderDashboard(dashboardContainer);
  }

  // Setup analytics panel
  setupAnalyticsPanel() {
    const analyticsContainer = document.getElementById('analytics-panel');
    if (!analyticsContainer || !this.modules.analytics) return;
    
    // Create analytics UI instance
    const AnalyticsUI = this.modules.analytics.AnalyticsUI;
    const ui = new AnalyticsUI(this.modules.analytics);
    
    // Render panel
    ui.renderPanel(analyticsContainer);
  }

  // Setup theme editor
  setupThemeEditor() {
    const themeContainer = document.getElementById('theme-editor');
    if (!themeContainer || !this.modules['theme-editor']) return;
    
    // Create theme editor UI instance
    const ThemeEditorUI = this.modules['theme-editor'].ThemeEditorUI;
    const ui = new ThemeEditorUI(this.modules['theme-editor']);
    
    // Render editor
    ui.renderPanel(themeContainer);
  }

  // Show auth prompt
  showAuthPrompt() {
    if (window.Auth) {
      const shouldLogin = confirm('You need to be logged in to perform this action. Would you like to login?');
      if (shouldLogin) {
        window.Auth.login();
      }
    }
  }

  // Show error message
  showError(message) {
    // Create error notification
    const notification = document.createElement('div');
    notification.className = 'notification notification-error';
    notification.innerHTML = `
      <i class="fas fa-exclamation-circle"></i>
      <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after delay
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  // Show notification
  showNotification(message, type = 'info') {
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icons = {
      success: 'check-circle',
      error: 'exclamation-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    };
    
    notification.innerHTML = `
      <i class="fas fa-${icons[type] || icons.info}"></i>
      <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after delay
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
}

// Create and initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Create app instance
  window.commentSystemApp = new CommentSystemApp();
  
  // Initialize app
  await window.commentSystemApp.initialize();
  
  // Initialize Alpine.js if available
  if (window.Alpine) {
    window.Alpine.start();
  }
});

// Export app class
export default CommentSystemApp;