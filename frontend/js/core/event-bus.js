// Event bus for inter-module communication
class EventBus {
  constructor() {
    this.events = new Map();
  }

  // Subscribe to an event
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  // Unsubscribe from an event
  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
    }
  }

  // Emit an event with data
  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // Subscribe to an event that fires only once
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  // Clear all listeners for an event
  clear(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  // Get listener count for an event
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).size : 0;
  }
}

// Create global instance
window.EventBus = new EventBus();