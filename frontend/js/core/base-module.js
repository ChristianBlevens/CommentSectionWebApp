// Base class for all modules
class BaseModule {
  constructor() {
    this.name = this.constructor.name;
    this.initialized = false;
    this.config = {};
    this.subscriptions = [];
  }

  // Get module dependencies
  static get dependencies() {
    return [];
  }

  // Initialize the module
  async init() {
    if (this.initialized) return;
    
    try {
      // Load module configuration
      this.config = await this.loadConfig();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Call module-specific initialization
      await this.onInit();
      
      this.initialized = true;
      
      // Emit initialization event
      this.emit('module:initialized', { module: this.name });
    } catch (error) {
      console.error(`Failed to initialize module ${this.name}:`, error);
      throw error;
    }
  }

  // Destroy the module
  async destroy() {
    try {
      // Call module-specific cleanup
      await this.onDestroy();
      
      // Cleanup event listeners
      this.subscriptions.forEach(unsubscribe => unsubscribe());
      this.subscriptions = [];
      
      // Clear module state
      if (window.StateManager) {
        StateManager.clearModuleState(this.name);
      }
      
      this.initialized = false;
      
      // Emit destruction event
      this.emit('module:destroyed', { module: this.name });
    } catch (error) {
      console.error(`Failed to destroy module ${this.name}:`, error);
      throw error;
    }
  }

  // Load module configuration
  async loadConfig() {
    if (window.ConfigManager) {
      return ConfigManager.getModuleConfig(this.name);
    }
    return {};
  }

  // Setup event listeners (to be overridden by modules)
  setupEventListeners() {
    // Override in subclasses
  }

  // Module initialization (to be overridden)
  async onInit() {
    // Override in subclasses
  }

  // Module cleanup (to be overridden)
  async onDestroy() {
    // Override in subclasses
  }

  // Subscribe to events with automatic cleanup
  subscribe(event, handler) {
    const unsubscribe = EventBus.on(event, handler.bind(this));
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  // Emit events
  emit(event, data) {
    EventBus.emit(event, data);
  }

  // State management helpers
  getState(key, defaultValue) {
    return StateManager.getState(this.name, key, defaultValue);
  }

  setState(key, value) {
    StateManager.setState(this.name, key, value);
  }

  // Subscribe to state changes
  watchState(key, callback) {
    return StateManager.subscribe(this.name, key, callback);
  }

  // Check if module is initialized
  isInitialized() {
    return this.initialized;
  }

  // Get module name
  getName() {
    return this.name;
  }

  // Get module configuration
  getConfig(key, defaultValue) {
    if (key) {
      return this.config[key] ?? defaultValue;
    }
    return this.config;
  }

  // Update module configuration
  async updateConfig(config) {
    this.config = { ...this.config, ...config };
    if (this.onConfigChange) {
      await this.onConfigChange(this.config);
    }
  }

  // Handle configuration changes (to be overridden)
  async onConfigChange(newConfig) {
    // Override in subclasses if needed
  }

  // Utility method to check dependencies
  async checkDependencies() {
    const dependencies = this.constructor.dependencies || [];
    const missingDeps = [];
    
    for (const dep of dependencies) {
      if (window.moduleLoader && !window.moduleLoader.isModuleLoaded(dep)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      throw new Error(`Module ${this.name} is missing dependencies: ${missingDeps.join(', ')}`);
    }
  }

  // Log helper methods
  log(...args) {
    console.log(`[${this.name}]`, ...args);
  }

  warn(...args) {
    console.warn(`[${this.name}]`, ...args);
  }

  error(...args) {
    console.error(`[${this.name}]`, ...args);
  }
}