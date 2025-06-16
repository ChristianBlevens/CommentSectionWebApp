// DOM utility functions for common operations
export const DomUtils = {
  // Query selectors
  $(selector, parent = document) {
    return parent.querySelector(selector);
  },

  // Query all selectors
  $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  },

  // Create element with options
  createElement(tag, options = {}) {
    const element = document.createElement(tag);
    
    // Set attributes
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
    
    // Set properties
    if (options.props) {
      Object.entries(options.props).forEach(([key, value]) => {
        element[key] = value;
      });
    }
    
    // Add classes
    if (options.className) {
      element.className = options.className;
    }
    
    // Add styles
    if (options.style) {
      Object.assign(element.style, options.style);
    }
    
    // Add event listeners
    if (options.events) {
      Object.entries(options.events).forEach(([event, handler]) => {
        element.addEventListener(event, handler);
      });
    }
    
    // Add children
    if (options.children) {
      options.children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else {
          element.appendChild(child);
        }
      });
    }
    
    // Set innerHTML
    if (options.html) {
      element.innerHTML = options.html;
    }
    
    return element;
  },

  // Add class names
  addClass(element, ...classNames) {
    element.classList.add(...classNames);
    return element;
  },

  // Remove class names
  removeClass(element, ...classNames) {
    element.classList.remove(...classNames);
    return element;
  },

  // Toggle class names
  toggleClass(element, className, force) {
    element.classList.toggle(className, force);
    return element;
  },

  // Check if element has class
  hasClass(element, className) {
    return element.classList.contains(className);
  },

  // Set multiple attributes
  setAttributes(element, attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    return element;
  },

  // Get data attributes
  getDataAttributes(element) {
    return Object.entries(element.dataset).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  },

  // Show element
  show(element) {
    element.style.display = '';
    return element;
  },

  // Hide element
  hide(element) {
    element.style.display = 'none';
    return element;
  },

  // Toggle visibility
  toggle(element, show) {
    if (show === undefined) {
      show = element.style.display === 'none';
    }
    element.style.display = show ? '' : 'none';
    return element;
  },

  // Remove element from DOM
  remove(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  },

  // Empty element content
  empty(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    return element;
  },

  // Insert element after reference
  insertAfter(newElement, referenceElement) {
    referenceElement.parentNode.insertBefore(newElement, referenceElement.nextSibling);
    return newElement;
  },

  // Wrap element with wrapper
  wrap(element, wrapper) {
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);
    return wrapper;
  },

  // Unwrap element
  unwrap(element) {
    const parent = element.parentNode;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  },

  // Get element position
  getPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    };
  },

  // Check if element is visible in viewport
  isInViewport(element, threshold = 0) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= -threshold &&
      rect.left >= -threshold &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + threshold &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) + threshold
    );
  },

  // Animate element
  animate(element, keyframes, options = {}) {
    if (!element.animate) return Promise.resolve();
    
    const animation = element.animate(keyframes, {
      duration: 300,
      easing: 'ease-in-out',
      fill: 'forwards',
      ...options
    });
    
    return animation.finished;
  },

  // Find closest parent matching selector
  closest(element, selector) {
    return element.closest(selector);
  },

  // Get or set text content
  text(element, content) {
    if (content === undefined) {
      return element.textContent;
    }
    element.textContent = content;
    return element;
  },

  // Get or set HTML content
  html(element, content) {
    if (content === undefined) {
      return element.innerHTML;
    }
    element.innerHTML = content;
    return element;
  },

  // Trigger custom event
  trigger(element, eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      cancelable: true
    });
    return element.dispatchEvent(event);
  },

  // Wait for element to appear
  waitForElement(selector, parent = document, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = this.$(selector, parent);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        const element = this.$(selector, parent);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(parent, {
        childList: true,
        subtree: true
      });
      
      // Timeout
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
};

// Export individual functions for convenience
export const { $, $$, createElement, addClass, removeClass, toggleClass, hasClass } = DomUtils;