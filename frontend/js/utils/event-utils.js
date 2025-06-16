// Event utility functions for handling DOM events
export const EventUtils = {
  // Add event listener with automatic cleanup
  on(element, event, handler, options = {}) {
    if (!element || !event || !handler) return null;
    
    // Support multiple events
    const events = event.split(' ');
    const listeners = [];
    
    events.forEach(evt => {
      element.addEventListener(evt, handler, options);
      listeners.push({ event: evt, handler, options });
    });
    
    // Return cleanup function
    return () => {
      listeners.forEach(({ event, handler, options }) => {
        element.removeEventListener(event, handler, options);
      });
    };
  },

  // Add one-time event listener
  once(element, event, handler, options = {}) {
    const onceHandler = (e) => {
      handler(e);
      element.removeEventListener(event, onceHandler, options);
    };
    
    element.addEventListener(event, onceHandler, options);
    return () => element.removeEventListener(event, onceHandler, options);
  },

  // Delegate event handling
  delegate(parent, selector, event, handler, options = {}) {
    const delegatedHandler = (e) => {
      const target = e.target.closest(selector);
      if (target && parent.contains(target)) {
        handler.call(target, e);
      }
    };
    
    parent.addEventListener(event, delegatedHandler, options);
    return () => parent.removeEventListener(event, delegatedHandler, options);
  },

  // Throttle event handler
  throttle(handler, delay = 100) {
    let timeoutId;
    let lastExec = 0;
    
    return function throttled(...args) {
      const now = Date.now();
      const remaining = delay - (now - lastExec);
      
      if (remaining <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        lastExec = now;
        handler.apply(this, args);
      } else if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastExec = Date.now();
          timeoutId = null;
          handler.apply(this, args);
        }, remaining);
      }
    };
  },

  // Debounce event handler
  debounce(handler, delay = 100) {
    let timeoutId;
    
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handler.apply(this, args);
      }, delay);
    };
  },

  // Create custom event
  createEvent(name, detail = {}, options = {}) {
    return new CustomEvent(name, {
      detail,
      bubbles: true,
      cancelable: true,
      ...options
    });
  },

  // Dispatch custom event
  dispatch(element, eventName, detail = {}, options = {}) {
    const event = this.createEvent(eventName, detail, options);
    return element.dispatchEvent(event);
  },

  // Stop event propagation and prevent default
  stop(event) {
    event.preventDefault();
    event.stopPropagation();
    return event;
  },

  // Get event target
  getTarget(event, selector) {
    if (!selector) return event.target;
    return event.target.closest(selector);
  },

  // Check if event is from keyboard
  isKeyboardEvent(event) {
    return event.type.startsWith('key');
  },

  // Check if event is from mouse
  isMouseEvent(event) {
    return event.type.startsWith('mouse') || event.type === 'click';
  },

  // Check if event is from touch
  isTouchEvent(event) {
    return event.type.startsWith('touch');
  },

  // Get key code/name
  getKey(event) {
    return event.key || event.keyCode;
  },

  // Check for modifier keys
  hasModifier(event) {
    return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
  },

  // Key combinations
  isKeyCombination(event, combination) {
    const parts = combination.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    
    // Check modifiers
    const hasCtrl = parts.includes('ctrl') || parts.includes('control');
    const hasMeta = parts.includes('meta') || parts.includes('cmd');
    const hasAlt = parts.includes('alt');
    const hasShift = parts.includes('shift');
    
    // Match modifiers
    if (hasCtrl && !event.ctrlKey) return false;
    if (hasMeta && !event.metaKey) return false;
    if (hasAlt && !event.altKey) return false;
    if (hasShift && !event.shiftKey) return false;
    
    // Match key
    return event.key.toLowerCase() === key;
  },

  // Touch event helpers
  getTouchPoint(event, index = 0) {
    if (event.touches && event.touches[index]) {
      return {
        x: event.touches[index].clientX,
        y: event.touches[index].clientY
      };
    }
    return null;
  },

  // Mouse position
  getMousePosition(event) {
    return {
      x: event.clientX,
      y: event.clientY,
      pageX: event.pageX,
      pageY: event.pageY
    };
  },

  // Prevent text selection
  preventSelection(element) {
    const handler = (e) => {
      e.preventDefault();
      return false;
    };
    
    element.addEventListener('selectstart', handler);
    element.style.userSelect = 'none';
    
    return () => {
      element.removeEventListener('selectstart', handler);
      element.style.userSelect = '';
    };
  },

  // Long press detection
  onLongPress(element, handler, duration = 500) {
    let timeoutId;
    let startTime;
    
    const start = (e) => {
      startTime = Date.now();
      timeoutId = setTimeout(() => {
        handler(e);
      }, duration);
    };
    
    const cancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    // Mouse events
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    
    // Touch events
    element.addEventListener('touchstart', start);
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchcancel', cancel);
    
    // Return cleanup function
    return () => {
      element.removeEventListener('mousedown', start);
      element.removeEventListener('mouseup', cancel);
      element.removeEventListener('mouseleave', cancel);
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchend', cancel);
      element.removeEventListener('touchcancel', cancel);
    };
  },

  // Double tap/click detection
  onDoubleTap(element, handler, maxDelay = 300) {
    let lastTap = 0;
    
    const tapHandler = (e) => {
      const now = Date.now();
      const timeSince = now - lastTap;
      
      if (timeSince < maxDelay && timeSince > 0) {
        handler(e);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    };
    
    element.addEventListener('click', tapHandler);
    element.addEventListener('touchend', tapHandler);
    
    return () => {
      element.removeEventListener('click', tapHandler);
      element.removeEventListener('touchend', tapHandler);
    };
  },

  // Swipe detection
  onSwipe(element, handlers = {}, threshold = 50) {
    let startX, startY, startTime;
    
    const handleStart = (e) => {
      const point = this.isTouchEvent(e) ? this.getTouchPoint(e) : this.getMousePosition(e);
      startX = point.x;
      startY = point.y;
      startTime = Date.now();
    };
    
    const handleEnd = (e) => {
      if (!startX || !startY) return;
      
      const point = this.isTouchEvent(e) 
        ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
        : this.getMousePosition(e);
      
      const deltaX = point.x - startX;
      const deltaY = point.y - startY;
      const deltaTime = Date.now() - startTime;
      
      // Check if it's a swipe
      if (deltaTime < 1000) {
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal swipe
          if (deltaX > 0 && handlers.right) {
            handlers.right(e, { distance: deltaX, duration: deltaTime });
          } else if (deltaX < 0 && handlers.left) {
            handlers.left(e, { distance: Math.abs(deltaX), duration: deltaTime });
          }
        } else if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
          // Vertical swipe
          if (deltaY > 0 && handlers.down) {
            handlers.down(e, { distance: deltaY, duration: deltaTime });
          } else if (deltaY < 0 && handlers.up) {
            handlers.up(e, { distance: Math.abs(deltaY), duration: deltaTime });
          }
        }
      }
      
      // Reset
      startX = startY = startTime = null;
    };
    
    // Add listeners
    element.addEventListener('touchstart', handleStart);
    element.addEventListener('touchend', handleEnd);
    element.addEventListener('mousedown', handleStart);
    element.addEventListener('mouseup', handleEnd);
    
    // Return cleanup
    return () => {
      element.removeEventListener('touchstart', handleStart);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('mousedown', handleStart);
      element.removeEventListener('mouseup', handleEnd);
    };
  },

  // Keyboard shortcuts
  createShortcuts(shortcuts) {
    const handler = (e) => {
      Object.entries(shortcuts).forEach(([combo, callback]) => {
        if (this.isKeyCombination(e, combo)) {
          e.preventDefault();
          callback(e);
        }
      });
    };
    
    document.addEventListener('keydown', handler);
    
    return () => document.removeEventListener('keydown', handler);
  }
};

// Export individual functions for convenience
export const { on, once, delegate, throttle, debounce } = EventUtils;