// Storage utility functions for localStorage and sessionStorage
export const StorageUtils = {
  // Check if storage is available
  isStorageAvailable(type = 'localStorage') {
    try {
      const storage = window[type];
      const test = '__storage_test__';
      storage.setItem(test, test);
      storage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  // Get item from storage
  getItem(key, storage = 'localStorage') {
    if (!this.isStorageAvailable(storage)) return null;
    
    try {
      const item = window[storage].getItem(key);
      // Try to parse JSON
      if (item) {
        return JSON.parse(item);
      }
      return null;
    } catch {
      // Return raw value if not JSON
      return window[storage].getItem(key);
    }
  },

  // Set item in storage
  setItem(key, value, storage = 'localStorage') {
    if (!this.isStorageAvailable(storage)) return false;
    
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      window[storage].setItem(key, serialized);
      return true;
    } catch (e) {
      console.error('Storage error:', e);
      return false;
    }
  },

  // Remove item from storage
  removeItem(key, storage = 'localStorage') {
    if (!this.isStorageAvailable(storage)) return false;
    
    try {
      window[storage].removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  // Clear storage
  clear(storage = 'localStorage') {
    if (!this.isStorageAvailable(storage)) return false;
    
    try {
      window[storage].clear();
      return true;
    } catch {
      return false;
    }
  },

  // Get all keys
  getKeys(storage = 'localStorage') {
    if (!this.isStorageAvailable(storage)) return [];
    
    const keys = [];
    for (let i = 0; i < window[storage].length; i++) {
      keys.push(window[storage].key(i));
    }
    return keys;
  },

  // Get storage size
  getSize(storage = 'localStorage') {
    if (!this.isStorageAvailable(storage)) return 0;
    
    let size = 0;
    for (let key in window[storage]) {
      if (window[storage].hasOwnProperty(key)) {
        size += window[storage][key].length + key.length;
      }
    }
    return size;
  },

  // Set item with expiration
  setItemWithExpiry(key, value, ttl, storage = 'localStorage') {
    const now = new Date();
    const item = {
      value: value,
      expiry: now.getTime() + ttl
    };
    return this.setItem(key, item, storage);
  },

  // Get item with expiry check
  getItemWithExpiry(key, storage = 'localStorage') {
    const item = this.getItem(key, storage);
    
    if (!item) return null;
    
    // Check if item has expiry
    if (item.expiry) {
      const now = new Date();
      if (now.getTime() > item.expiry) {
        this.removeItem(key, storage);
        return null;
      }
      return item.value;
    }
    
    // Return item as-is if no expiry
    return item;
  },

  // Storage with namespace
  createNamespace(namespace) {
    return {
      getItem: (key) => this.getItem(`${namespace}:${key}`),
      setItem: (key, value) => this.setItem(`${namespace}:${key}`, value),
      removeItem: (key) => this.removeItem(`${namespace}:${key}`),
      clear: () => {
        const keys = this.getKeys();
        keys.forEach(key => {
          if (key.startsWith(`${namespace}:`)) {
            this.removeItem(key);
          }
        });
      },
      getKeys: () => {
        const keys = this.getKeys();
        return keys
          .filter(key => key.startsWith(`${namespace}:`))
          .map(key => key.substring(namespace.length + 1));
      }
    };
  },

  // Compress data before storing
  compress(data) {
    try {
      // Simple compression using repeated pattern replacement
      const json = JSON.stringify(data);
      const compressed = json
        .replace(/(["\w]+)(?=.*\1)/g, '') // Remove duplicates
        .replace(/\s+/g, ''); // Remove whitespace
      return compressed;
    } catch {
      return data;
    }
  },

  // Decompress data after retrieval
  decompress(data) {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  },

  // Store compressed data
  setCompressed(key, value, storage = 'localStorage') {
    const compressed = this.compress(value);
    return this.setItem(key, compressed, storage);
  },

  // Get compressed data
  getCompressed(key, storage = 'localStorage') {
    const compressed = this.getItem(key, storage);
    return compressed ? this.decompress(compressed) : null;
  },

  // Batch operations
  setMultiple(items, storage = 'localStorage') {
    const results = {};
    Object.entries(items).forEach(([key, value]) => {
      results[key] = this.setItem(key, value, storage);
    });
    return results;
  },

  // Get multiple items
  getMultiple(keys, storage = 'localStorage') {
    const results = {};
    keys.forEach(key => {
      results[key] = this.getItem(key, storage);
    });
    return results;
  },

  // Remove multiple items
  removeMultiple(keys, storage = 'localStorage') {
    const results = {};
    keys.forEach(key => {
      results[key] = this.removeItem(key, storage);
    });
    return results;
  },

  // Storage event listener
  onChange(callback, storage = 'localStorage') {
    const handler = (e) => {
      if (e.storageArea === window[storage]) {
        callback({
          key: e.key,
          oldValue: e.oldValue ? JSON.parse(e.oldValue) : null,
          newValue: e.newValue ? JSON.parse(e.newValue) : null,
          url: e.url
        });
      }
    };
    
    window.addEventListener('storage', handler);
    
    // Return unsubscribe function
    return () => window.removeEventListener('storage', handler);
  },

  // Migrate data between storages
  migrate(fromStorage, toStorage, keys = null) {
    const keysToMigrate = keys || this.getKeys(fromStorage);
    const results = {};
    
    keysToMigrate.forEach(key => {
      const value = this.getItem(key, fromStorage);
      if (value !== null) {
        results[key] = this.setItem(key, value, toStorage);
        if (results[key]) {
          this.removeItem(key, fromStorage);
        }
      }
    });
    
    return results;
  },

  // Backup storage data
  backup(storage = 'localStorage') {
    const backup = {};
    const keys = this.getKeys(storage);
    
    keys.forEach(key => {
      backup[key] = this.getItem(key, storage);
    });
    
    return {
      timestamp: new Date().toISOString(),
      storage: storage,
      data: backup
    };
  },

  // Restore from backup
  restore(backup, storage = 'localStorage') {
    if (!backup || !backup.data) return false;
    
    try {
      Object.entries(backup.data).forEach(([key, value]) => {
        this.setItem(key, value, storage);
      });
      return true;
    } catch {
      return false;
    }
  },

  // Storage quota info
  async getQuotaInfo() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentage: ((estimate.usage || 0) / (estimate.quota || 1)) * 100
        };
      } catch {
        return null;
      }
    }
    return null;
  }
};

// Create shortcuts for common operations
export const LocalStorage = StorageUtils.createNamespace('app');
export const SessionStorage = {
  getItem: (key) => StorageUtils.getItem(key, 'sessionStorage'),
  setItem: (key, value) => StorageUtils.setItem(key, value, 'sessionStorage'),
  removeItem: (key) => StorageUtils.removeItem(key, 'sessionStorage'),
  clear: () => StorageUtils.clear('sessionStorage')
};

// Export individual functions for convenience
export const { getItem, setItem, removeItem, clear } = StorageUtils;