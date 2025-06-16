// Theme editor module for customizing application appearance
import { BaseModule } from '../../core/base-module.js';
import { EventBus } from '../../core/event-bus.js';
import { StateManager } from '../../core/state-manager.js';
import { ApiClient } from '../../core/api-client.js';
import { StorageUtils } from '../../utils/index.js';

class ThemeEditorModule extends BaseModule {
  constructor() {
    super();
    this.name = 'theme-editor';
    
    // Module state
    this.state = {
      // Current theme colors
      colors: {
        primary: {
          main: '#3b82f6',
          hover: '#2563eb',
          light: '#dbeafe'
        },
        backgrounds: {
          main: '#ffffff',
          secondary: '#f3f4f6',
          hover: '#f9fafb'
        },
        text: {
          primary: '#111827',
          secondary: '#6b7280',
          muted: '#9ca3af'
        },
        borders: {
          light: '#e5e7eb',
          medium: '#d1d5db'
        }
      },
      
      // Predefined theme presets
      presets: {
        light: {
          primary: { main: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
          backgrounds: { main: '#ffffff', secondary: '#f3f4f6', hover: '#f9fafb' },
          text: { primary: '#111827', secondary: '#6b7280', muted: '#9ca3af' },
          borders: { light: '#e5e7eb', medium: '#d1d5db' }
        },
        dark: {
          primary: { main: '#60a5fa', hover: '#3b82f6', light: '#1e3a8a' },
          backgrounds: { main: '#111827', secondary: '#1f2937', hover: '#374151' },
          text: { primary: '#f9fafb', secondary: '#e5e7eb', muted: '#9ca3af' },
          borders: { light: '#374151', medium: '#4b5563' }
        },
        ocean: {
          primary: { main: '#06b6d4', hover: '#0891b2', light: '#cffafe' },
          backgrounds: { main: '#f0fdfa', secondary: '#e6fffa', hover: '#ccfbf1' },
          text: { primary: '#134e4a', secondary: '#0f766e', muted: '#14b8a6' },
          borders: { light: '#99f6e4', medium: '#5eead4' }
        }
      },
      
      // Editor state
      selectedPreset: 'light',
      selectedColorTarget: null,
      isLoading: false,
      isLoaded: false,
      isSaving: false,
      hasChanges: false,
      lastColorChange: null,
      error: null,
      
      // Permissions
      canEdit: false
    };
    
    // API client instance
    this.api = new ApiClient();
    
    // Event bus instance
    this.eventBus = window.eventBus || new EventBus();
    
    // State manager instance
    this.stateManager = window.stateManager || new StateManager();
    
    // Style element reference
    this.styleElement = null;
  }

  // Initialize the module
  async initialize(config = {}) {
    this.config = config;
    
    // Check permissions
    this.checkPermissions();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Create style element
    this.createStyleElement();
    
    // Load saved theme
    if (this.state.canEdit) {
      await this.loadTheme();
    } else {
      // Apply default theme
      this.applyTheme();
    }
    
    this.initialized = true;
    this.emit('theme-editor:initialized');
    
    return true;
  }

  // Setup event listeners
  setupEventListeners() {
    // Listen for auth changes
    this.on('auth:login', (user) => this.handleAuthChange(user));
    this.on('auth:logout', () => this.handleLogout());
    
    // Listen for color picker if available
    if ('EyeDropper' in window) {
      this.supportsEyeDropper = true;
    }
  }

  // Check permissions
  checkPermissions() {
    const user = this.stateManager.getState('auth', 'user');
    this.state.canEdit = user && user.is_super_moderator === true;
  }

  // Handle auth change
  handleAuthChange(user) {
    this.state.canEdit = user && user.is_super_moderator === true;
    
    if (this.state.canEdit && !this.state.isLoaded) {
      this.loadTheme();
    }
  }

  // Handle logout
  handleLogout() {
    this.state.canEdit = false;
  }

  // Create style element
  createStyleElement() {
    // Remove existing element if any
    const existing = document.getElementById('custom-theme-styles');
    if (existing) {
      existing.remove();
    }
    
    // Create new style element
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'custom-theme-styles';
    document.head.appendChild(this.styleElement);
  }

  // Load theme from API
  async loadTheme() {
    if (!this.state.canEdit) return;
    
    this.state.isLoading = true;
    this.state.error = null;
    this.emit('theme-editor:loading');
    
    try {
      const response = await this.api.get('/api/theme');
      
      if (response.theme && response.theme.colors) {
        // Deep merge with defaults to ensure all properties exist
        this.state.colors = this.deepMerge(this.state.colors, response.theme.colors);
        this.state.isLoaded = true;
        
        // Apply loaded theme
        this.applyTheme();
        
        this.emit('theme-editor:loaded', { theme: response.theme });
      }
    } catch (error) {
      console.error('Error loading theme:', error);
      this.state.error = error.message;
      this.emit('theme-editor:error', { error: error.message });
      
      // Apply default theme on error
      this.applyTheme();
    } finally {
      this.state.isLoading = false;
    }
  }

  // Save theme to API
  async saveTheme() {
    if (!this.state.canEdit || !this.state.hasChanges) return;
    
    this.state.isSaving = true;
    this.state.error = null;
    this.emit('theme-editor:saving');
    
    try {
      await this.api.post('/api/theme', {
        theme: {
          colors: this.state.colors
        }
      });
      
      this.state.hasChanges = false;
      this.emit('theme-editor:saved');
      
      // Show success notification
      this.showNotification('Theme saved successfully');
    } catch (error) {
      console.error('Error saving theme:', error);
      this.state.error = error.message;
      this.emit('theme-editor:error', { error: error.message });
      
      this.showNotification('Failed to save theme', 'error');
    } finally {
      this.state.isSaving = false;
    }
  }

  // Update theme color
  updateColor(category, key, value) {
    if (!this.state.colors[category] || !this.state.colors[category].hasOwnProperty(key)) {
      console.error(`Invalid color target: ${category}.${key}`);
      return;
    }
    
    // Store last change for undo
    this.state.lastColorChange = {
      category,
      key,
      oldValue: this.state.colors[category][key],
      newValue: value
    };
    
    // Update color
    this.state.colors[category][key] = value;
    this.state.hasChanges = true;
    
    // Apply changes
    this.applyTheme();
    
    this.emit('theme-editor:colorChanged', { category, key, value });
  }

  // Apply preset theme
  applyPreset(presetName) {
    const preset = this.state.presets[presetName];
    if (!preset) {
      console.error(`Invalid preset: ${presetName}`);
      return;
    }
    
    // Store current colors for undo
    this.state.lastColorChange = {
      type: 'preset',
      oldColors: JSON.parse(JSON.stringify(this.state.colors)),
      newColors: preset
    };
    
    // Apply preset colors
    this.state.colors = JSON.parse(JSON.stringify(preset));
    this.state.selectedPreset = presetName;
    this.state.hasChanges = true;
    
    // Apply theme
    this.applyTheme();
    
    this.emit('theme-editor:presetApplied', { preset: presetName });
  }

  // Apply theme by injecting CSS variables
  applyTheme() {
    if (!this.styleElement) {
      this.createStyleElement();
    }
    
    // Generate CSS variables
    const cssVars = [];
    
    // Iterate through color categories
    Object.entries(this.state.colors).forEach(([category, colors]) => {
      Object.entries(colors).forEach(([key, value]) => {
        cssVars.push(`--color-${category}-${key}: ${value};`);
      });
    });
    
    // Generate CSS
    const css = `:root {\n  ${cssVars.join('\n  ')}\n}`;
    
    // Update style element
    this.styleElement.textContent = css;
    
    // Store in localStorage for persistence
    StorageUtils.setItem('theme-colors', this.state.colors);
    
    this.emit('theme-editor:applied');
  }

  // Reset to default theme
  resetTheme() {
    if (!confirm('Are you sure you want to reset to the default theme?')) {
      return;
    }
    
    // Apply light preset
    this.applyPreset('light');
    
    // Save if user has permission
    if (this.state.canEdit) {
      this.saveTheme();
    }
    
    this.emit('theme-editor:reset');
  }

  // Export theme as JSON
  exportTheme() {
    const themeData = {
      name: 'Custom Theme',
      version: '1.0.0',
      colors: this.state.colors,
      exportedAt: new Date().toISOString()
    };
    
    // Create blob
    const blob = new Blob([JSON.stringify(themeData, null, 2)], {
      type: 'application/json'
    });
    
    // Download file
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `theme-${Date.now()}.json`;
    link.click();
    
    // Clean up
    URL.revokeObjectURL(link.href);
    
    this.emit('theme-editor:exported');
  }

  // Import theme from JSON
  async importTheme(file) {
    try {
      const text = await file.text();
      const themeData = JSON.parse(text);
      
      // Validate theme data
      if (!themeData.colors || typeof themeData.colors !== 'object') {
        throw new Error('Invalid theme file format');
      }
      
      // Store current state for undo
      this.state.lastColorChange = {
        type: 'import',
        oldColors: JSON.parse(JSON.stringify(this.state.colors)),
        newColors: themeData.colors
      };
      
      // Apply imported colors
      this.state.colors = this.deepMerge(this.state.colors, themeData.colors);
      this.state.hasChanges = true;
      
      // Apply theme
      this.applyTheme();
      
      this.emit('theme-editor:imported', { theme: themeData });
      this.showNotification('Theme imported successfully');
    } catch (error) {
      console.error('Error importing theme:', error);
      this.emit('theme-editor:error', { error: 'Failed to import theme' });
      this.showNotification('Failed to import theme', 'error');
    }
  }

  // Pick color from screen (if supported)
  async pickColorFromScreen(category, key) {
    if (!this.supportsEyeDropper) {
      this.showNotification('Color picker not supported in this browser', 'warning');
      return;
    }
    
    try {
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      
      if (result.sRGBHex) {
        this.updateColor(category, key, result.sRGBHex);
      }
    } catch (error) {
      // User cancelled or error occurred
      console.log('EyeDropper cancelled or failed:', error);
    }
  }

  // Undo last color change
  undoLastChange() {
    if (!this.state.lastColorChange) {
      this.showNotification('Nothing to undo', 'info');
      return;
    }
    
    const change = this.state.lastColorChange;
    
    if (change.type === 'preset' || change.type === 'import') {
      // Restore entire color set
      this.state.colors = JSON.parse(JSON.stringify(change.oldColors));
    } else {
      // Restore single color
      this.state.colors[change.category][change.key] = change.oldValue;
    }
    
    // Clear last change
    this.state.lastColorChange = null;
    this.state.hasChanges = true;
    
    // Apply theme
    this.applyTheme();
    
    this.emit('theme-editor:undone');
    this.showNotification('Change undone');
  }

  // Get color value
  getColor(category, key) {
    return this.state.colors[category]?.[key] || null;
  }

  // Get all colors in category
  getColorCategory(category) {
    return this.state.colors[category] || {};
  }

  // Format color label
  formatColorLabel(key) {
    return key
      .split(/(?=[A-Z])/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Deep merge objects
  deepMerge(target, source) {
    const result = { ...target };
    
    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    });
    
    return result;
  }

  // Show notification
  showNotification(message, type = 'success') {
    this.emit('theme-editor:notification', { message, type });
  }

  // Cleanup module
  cleanup() {
    super.cleanup();
    
    // Remove style element
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }
}

// Export module
export default ThemeEditorModule;