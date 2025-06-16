// Configuration manager for modules and application settings
class ConfigManager {
  constructor() {
    this.config = {};
    this.moduleConfig = {};
    this.initialized = false;
  }

  // Initialize configuration manager
  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadConfig();
      await this.loadModuleConfig();
      this.initialized = true;
      EventBus.emit('config:loaded');
    } catch (error) {
      console.error('Failed to initialize ConfigManager:', error);
      throw error;
    }
  }

  // Load main application config
  async loadConfig() {
    try {
      // Try to load from API first
      const response = await api.get('/api/config');
      this.config = response;
    } catch (error) {
      console.warn('Failed to load config from API, using defaults:', error);
      this.config = this.getDefaultConfig();
    }
  }

  // Load module configuration
  async loadModuleConfig() {
    try {
      // Check local storage for cached config
      const cached = this.getFromStorage('moduleConfig');
      if (cached) {
        this.moduleConfig = cached;
      }

      // Try to fetch from server
      const response = await fetch('/config/modules.json');
      if (response.ok) {
        const config = await response.json();
        this.moduleConfig = config;
        
        // Cache for next time
        this.saveToStorage('moduleConfig', config);
      }
    } catch (error) {
      console.warn('Failed to load module config, using defaults:', error);
      this.moduleConfig = this.getDefaultModuleConfig();
    }
  }

  // Enable a module
  async enableModule(moduleName) {
    if (!this.moduleConfig.activeModules.includes(moduleName)) {
      this.moduleConfig.activeModules.push(moduleName);
      await this.saveModuleConfig();
      
      EventBus.emit('module:enabled', { module: moduleName });
      return true;
    }
    return false;
  }

  // Disable a module
  async disableModule(moduleName) {
    const index = this.moduleConfig.activeModules.indexOf(moduleName);
    if (index > -1) {
      // Check if module is required
      const moduleInfo = this.moduleConfig.availableModules[moduleName];
      if (moduleInfo?.required) {
        throw new Error(`Module ${moduleName} is required and cannot be disabled`);
      }

      // Check dependencies
      const dependents = this.findDependentModules(moduleName);
      if (dependents.length > 0) {
        throw new Error(
          `Cannot disable ${moduleName}. The following modules depend on it: ${dependents.join(', ')}`
        );
      }

      // Remove from active modules
      this.moduleConfig.activeModules.splice(index, 1);
      await this.saveModuleConfig();
      
      EventBus.emit('module:disabled', { module: moduleName });
      return true;
    }
    return false;
  }

  // Find modules that depend on a given module
  findDependentModules(moduleName) {
    const dependents = [];
    
    for (const [name, info] of Object.entries(this.moduleConfig.availableModules)) {
      if (info.dependencies?.includes(moduleName) && 
          this.moduleConfig.activeModules.includes(name)) {
        dependents.push(name);
      }
    }
    
    return dependents;
  }

  // Save module configuration
  async saveModuleConfig() {
    // Save to local storage
    this.saveToStorage('moduleConfig', this.moduleConfig);
    
    // Try to save to server
    try {
      await api.put('/api/config/modules', {
        activeModules: this.moduleConfig.activeModules
      });
    } catch (error) {
      console.warn('Failed to save module config to server:', error);
    }
  }

  // Get module configuration
  getModuleConfig(moduleName) {
    return this.moduleConfig.availableModules?.[moduleName]?.config || {};
  }

  // Update module configuration
  async updateModuleConfig(moduleName, config) {
    if (this.moduleConfig.availableModules[moduleName]) {
      this.moduleConfig.availableModules[moduleName].config = {
        ...this.moduleConfig.availableModules[moduleName].config,
        ...config
      };
      await this.saveModuleConfig();
      
      EventBus.emit('module:configUpdated', { module: moduleName, config });
    }
  }

  // Get configuration value
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  // Set configuration value
  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!obj[k] || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
    EventBus.emit('config:changed', { key, value });
  }

  // Get active modules
  getActiveModules() {
    return this.moduleConfig.activeModules || [];
  }

  // Get available modules
  getAvailableModules() {
    return this.moduleConfig.availableModules || {};
  }

  // Check if module is active
  isModuleActive(moduleName) {
    return this.moduleConfig.activeModules?.includes(moduleName) || false;
  }

  // Storage helpers
  getFromStorage(key) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Error reading from storage:', error);
      return null;
    }
  }

  saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  // Default configurations
  getDefaultConfig() {
    return {
      api: {
        baseUrl: window.location.origin,
        timeout: 30000
      },
      auth: {
        redirectOnExpire: false,
        sessionDuration: 86400
      },
      ui: {
        theme: 'light',
        animations: true,
        language: 'en'
      },
      features: {
        darkMode: true,
        reactions: true,
        mentions: true
      }
    };
  }

  getDefaultModuleConfig() {
    return {
      activeModules: ['comments', 'markdown'],
      availableModules: {
        comments: {
          name: 'Comments',
          description: 'Core commenting functionality',
          required: true,
          dependencies: ['markdown'],
          config: {
            maxNestingDepth: 3,
            commentsPerPage: 20,
            enableVoting: true
          }
        },
        markdown: {
          name: 'Markdown',
          description: 'Markdown formatting support',
          required: false,
          dependencies: [],
          config: {
            enableSpoilers: true,
            enableCodeHighlight: true
          }
        },
        moderation: {
          name: 'Moderation',
          description: 'Moderation tools for moderators',
          required: false,
          dependencies: [],
          permissions: ['moderator'],
          config: {
            enableReports: true,
            enableBanning: true
          }
        },
        analytics: {
          name: 'Analytics',
          description: 'Comment analytics dashboard',
          required: false,
          dependencies: [],
          permissions: ['moderator'],
          config: {
            chartType: 'bubble',
            defaultTimeRange: '7d'
          }
        },
        themeEditor: {
          name: 'Theme Editor',
          description: 'Visual theme customization',
          required: false,
          dependencies: [],
          permissions: ['super_moderator'],
          config: {}
        },
        reactions: {
          name: 'Reactions',
          description: 'Emoji reactions for comments',
          required: false,
          dependencies: ['comments'],
          config: {
            availableReactions: ['👍', '❤️', '😂', '😮', '😢', '😡']
          }
        },
        mentions: {
          name: 'Mentions',
          description: 'User mention functionality',
          required: false,
          dependencies: ['comments'],
          config: {
            notifyMentioned: true
          }
        }
      }
    };
  }
}

// Create global instance
window.ConfigManager = new ConfigManager();