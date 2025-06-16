// Module loader with dependency management
class ModuleLoader {
  constructor() {
    this.modules = new Map(); // Available modules
    this.loadedModules = new Map(); // Loaded module instances
    this.config = null;
    this.loadingPromises = new Map(); // Track ongoing module loading
  }

  // Initialize the module loader
  async init() {
    try {
      // Load module configuration
      if (window.ConfigManager) {
        this.config = await ConfigManager.loadModuleConfig();
      }
      
      // Register all available modules
      this.registerCoreModules();
      
      // Load active modules based on config
      await this.loadActiveModules();
      
      // Emit ready event
      EventBus.emit('moduleLoader:ready');
    } catch (error) {
      console.error('Failed to initialize module loader:', error);
      throw error;
    }
  }

  // Register a module class
  registerModule(name, moduleClass) {
    if (this.modules.has(name)) {
      console.warn(`Module ${name} is already registered`);
    }
    this.modules.set(name, moduleClass);
    EventBus.emit('module:registered', { name, moduleClass });
  }

  // Load a module
  async loadModule(name) {
    // Check if already loaded
    if (this.loadedModules.has(name)) {
      return this.loadedModules.get(name);
    }

    // Check if already loading
    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name);
    }

    // Create loading promise
    const loadingPromise = this._loadModuleInternal(name);
    this.loadingPromises.set(name, loadingPromise);

    try {
      const module = await loadingPromise;
      this.loadingPromises.delete(name);
      return module;
    } catch (error) {
      this.loadingPromises.delete(name);
      throw error;
    }
  }

  // Internal module loading logic
  async _loadModuleInternal(name) {
    const ModuleClass = this.modules.get(name);
    if (!ModuleClass) {
      throw new Error(`Module ${name} not found`);
    }

    try {
      // Check and load dependencies first
      const dependencies = ModuleClass.dependencies || [];
      for (const dep of dependencies) {
        if (!this.loadedModules.has(dep)) {
          console.log(`Loading dependency ${dep} for module ${name}`);
          await this.loadModule(dep);
        }
      }

      // Check user permissions if required
      if (!this.checkModulePermissions(name)) {
        console.warn(`User lacks permissions for module ${name}`);
        return null;
      }

      // Create module instance
      console.log(`Creating instance of module ${name}`);
      const moduleInstance = new ModuleClass();
      
      // Initialize module
      await moduleInstance.init();
      
      // Store loaded module
      this.loadedModules.set(name, moduleInstance);
      
      // Emit module loaded event
      EventBus.emit('module:loaded', { name, instance: moduleInstance });
      
      console.log(`Module ${name} loaded successfully`);
      return moduleInstance;
    } catch (error) {
      console.error(`Failed to load module ${name}:`, error);
      throw error;
    }
  }

  // Unload a module
  async unloadModule(name) {
    const module = this.loadedModules.get(name);
    if (!module) {
      console.warn(`Module ${name} is not loaded`);
      return;
    }

    try {
      // Check if other modules depend on this one
      const dependents = this.findDependentModules(name);
      if (dependents.length > 0) {
        throw new Error(`Cannot unload ${name}. Dependent modules: ${dependents.join(', ')}`);
      }

      // Call module cleanup
      await module.destroy();

      // Remove from loaded modules
      this.loadedModules.delete(name);
      
      // Emit module unloaded event
      EventBus.emit('module:unloaded', { name });
      
      console.log(`Module ${name} unloaded successfully`);
    } catch (error) {
      console.error(`Failed to unload module ${name}:`, error);
      throw error;
    }
  }

  // Reload a module
  async reloadModule(name) {
    console.log(`Reloading module ${name}`);
    await this.unloadModule(name);
    return await this.loadModule(name);
  }

  // Get a loaded module instance
  getModule(name) {
    return this.loadedModules.get(name);
  }

  // Check if a module is loaded
  isModuleLoaded(name) {
    return this.loadedModules.has(name);
  }

  // Get all loaded modules
  getLoadedModules() {
    return Array.from(this.loadedModules.keys());
  }

  // Get all available modules
  getAvailableModules() {
    return Array.from(this.modules.keys());
  }

  // Load all active modules from config
  async loadActiveModules() {
    const activeModules = this.config?.activeModules || [];
    
    console.log(`Loading active modules: ${activeModules.join(', ')}`);
    
    for (const moduleName of activeModules) {
      try {
        await this.loadModule(moduleName);
      } catch (error) {
        console.error(`Failed to load module ${moduleName}:`, error);
        // Continue loading other modules
      }
    }
  }

  // Find modules that depend on a given module
  findDependentModules(moduleName) {
    const dependents = [];
    
    for (const [name, module] of this.loadedModules) {
      const ModuleClass = this.modules.get(name);
      const dependencies = ModuleClass.dependencies || [];
      
      if (dependencies.includes(moduleName)) {
        dependents.push(name);
      }
    }
    
    return dependents;
  }

  // Check if user has permissions for module
  checkModulePermissions(moduleName) {
    const moduleConfig = this.config?.availableModules?.[moduleName];
    if (!moduleConfig || !moduleConfig.permissions) {
      return true; // No permissions required
    }

    const user = StateManager.getState('auth', 'user');
    if (!user) {
      return false; // No user logged in
    }

    // Check required permissions
    const requiredPermissions = moduleConfig.permissions;
    for (const permission of requiredPermissions) {
      if (permission === 'moderator' && !user.is_moderator && !user.is_super_moderator) {
        return false;
      }
      if (permission === 'super_moderator' && !user.is_super_moderator) {
        return false;
      }
    }

    return true;
  }

  // Register core modules (to be called during init)
  registerCoreModules() {
    // This will be populated as modules are created
    console.log('Ready to register modules');
  }

  // Enable a module
  async enableModule(name) {
    if (window.ConfigManager) {
      await ConfigManager.enableModule(name);
      return await this.loadModule(name);
    }
  }

  // Disable a module
  async disableModule(name) {
    if (window.ConfigManager) {
      await ConfigManager.disableModule(name);
      await this.unloadModule(name);
    }
  }
}

// Create global instance
window.moduleLoader = new ModuleLoader();