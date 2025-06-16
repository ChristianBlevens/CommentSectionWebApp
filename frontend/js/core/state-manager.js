// Centralized state management for modules
class StateManager {
  constructor() {
    this.state = new Map();
    this.subscribers = new Map();
  }

  // Get state value for a module and key
  getState(module, key, defaultValue = null) {
    const moduleState = this.state.get(module);
    if (!moduleState) return defaultValue;
    return moduleState.get(key) ?? defaultValue;
  }

  // Set state value for a module and key
  setState(module, key, value) {
    if (!this.state.has(module)) {
      this.state.set(module, new Map());
    }
    
    const moduleState = this.state.get(module);
    const oldValue = moduleState.get(key);
    moduleState.set(key, value);
    
    // Notify subscribers
    this.notifySubscribers(module, key, value, oldValue);
  }

  // Subscribe to state changes
  subscribe(module, key, callback) {
    const subscriptionKey = `${module}:${key}`;
    
    if (!this.subscribers.has(subscriptionKey)) {
      this.subscribers.set(subscriptionKey, new Set());
    }
    
    this.subscribers.get(subscriptionKey).add(callback);
    
    // Call immediately with current value
    const currentValue = this.getState(module, key);
    callback(currentValue, undefined);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.get(subscriptionKey).delete(callback);
    };
  }

  // Notify subscribers of state changes
  notifySubscribers(module, key, newValue, oldValue) {
    const subscriptionKey = `${module}:${key}`;
    
    if (this.subscribers.has(subscriptionKey)) {
      this.subscribers.get(subscriptionKey).forEach(callback => {
        try {
          callback(newValue, oldValue);
        } catch (error) {
          console.error(`Error in state subscriber for ${subscriptionKey}:`, error);
        }
      });
    }
  }

  // Get entire module state
  getModuleState(module) {
    const moduleState = this.state.get(module);
    if (!moduleState) return {};
    
    // Return a copy to prevent direct mutations
    const stateCopy = {};
    moduleState.forEach((value, key) => {
      stateCopy[key] = value;
    });
    return stateCopy;
  }

  // Set multiple state values at once
  setModuleState(module, stateObject) {
    Object.entries(stateObject).forEach(([key, value]) => {
      this.setState(module, key, value);
    });
  }

  // Clear module state
  clearModuleState(module) {
    const moduleState = this.state.get(module);
    if (moduleState) {
      // Notify subscribers that values are being cleared
      moduleState.forEach((value, key) => {
        this.notifySubscribers(module, key, null, value);
      });
    }
    this.state.delete(module);
  }

  // Clear all state
  clearAll() {
    this.state.forEach((moduleState, module) => {
      this.clearModuleState(module);
    });
  }

  // Check if module has state
  hasModuleState(module) {
    return this.state.has(module);
  }

  // Get all modules with state
  getModules() {
    return Array.from(this.state.keys());
  }
}

// Create global instance
window.StateManager = new StateManager();