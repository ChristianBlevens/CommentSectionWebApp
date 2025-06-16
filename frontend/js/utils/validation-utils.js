// Validation utility functions for form inputs and data
export const ValidationUtils = {
  // Email validation
  isEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  // URL validation
  isURL(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  // Phone number validation (basic)
  isPhoneNumber(value) {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10;
  },

  // Check if value is empty
  isEmpty(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  },

  // Required field validation
  isRequired(value) {
    return !this.isEmpty(value);
  },

  // Minimum length validation
  minLength(value, min) {
    if (typeof value === 'string') return value.length >= min;
    if (Array.isArray(value)) return value.length >= min;
    return false;
  },

  // Maximum length validation
  maxLength(value, max) {
    if (typeof value === 'string') return value.length <= max;
    if (Array.isArray(value)) return value.length <= max;
    return false;
  },

  // Length range validation
  lengthBetween(value, min, max) {
    return this.minLength(value, min) && this.maxLength(value, max);
  },

  // Number validation
  isNumber(value) {
    return !isNaN(value) && isFinite(value);
  },

  // Integer validation
  isInteger(value) {
    return Number.isInteger(Number(value));
  },

  // Positive number validation
  isPositive(value) {
    return this.isNumber(value) && Number(value) > 0;
  },

  // Number range validation
  isInRange(value, min, max) {
    const num = Number(value);
    return this.isNumber(value) && num >= min && num <= max;
  },

  // Alpha characters only
  isAlpha(value) {
    return /^[a-zA-Z]+$/.test(value);
  },

  // Alphanumeric characters only
  isAlphanumeric(value) {
    return /^[a-zA-Z0-9]+$/.test(value);
  },

  // Username validation (alphanumeric, underscore, dash)
  isUsername(value) {
    return /^[a-zA-Z0-9_-]{3,16}$/.test(value);
  },

  // Password strength validation
  getPasswordStrength(password) {
    let strength = 0;
    const checks = {
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      numbers: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    // Calculate strength
    Object.values(checks).forEach(passed => {
      if (passed) strength++;
    });
    
    // Return strength level
    const levels = ['very-weak', 'weak', 'fair', 'good', 'strong'];
    return {
      score: strength,
      level: levels[strength] || levels[0],
      checks
    };
  },

  // Credit card validation (Luhn algorithm)
  isCreditCard(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    
    let sum = 0;
    let isEven = false;
    
    // Loop through digits from right to left
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  },

  // Date validation
  isValidDate(value) {
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
  },

  // Date is in future
  isFutureDate(value) {
    const date = new Date(value);
    return this.isValidDate(value) && date > new Date();
  },

  // Date is in past
  isPastDate(value) {
    const date = new Date(value);
    return this.isValidDate(value) && date < new Date();
  },

  // File type validation
  isFileType(file, allowedTypes) {
    if (!file || !file.type) return false;
    
    // Convert allowed types to array if string
    const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    
    // Check if file type matches any allowed type
    return types.some(type => {
      if (type.includes('*')) {
        // Handle wildcards like image/*
        const [category] = type.split('/');
        return file.type.startsWith(category + '/');
      }
      return file.type === type;
    });
  },

  // File size validation
  isFileSize(file, maxSizeInBytes) {
    return file && file.size <= maxSizeInBytes;
  },

  // Image dimension validation
  async isImageDimensions(file, constraints = {}) {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) {
        resolve(false);
        return;
      }
      
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        const { minWidth, maxWidth, minHeight, maxHeight } = constraints;
        let valid = true;
        
        if (minWidth && img.width < minWidth) valid = false;
        if (maxWidth && img.width > maxWidth) valid = false;
        if (minHeight && img.height < minHeight) valid = false;
        if (maxHeight && img.height > maxHeight) valid = false;
        
        URL.revokeObjectURL(url);
        resolve(valid);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      
      img.src = url;
    });
  },

  // Custom pattern validation
  matchesPattern(value, pattern) {
    if (typeof pattern === 'string') {
      pattern = new RegExp(pattern);
    }
    return pattern.test(value);
  },

  // Validate multiple rules
  validate(value, rules) {
    const errors = [];
    
    // Process each rule
    Object.entries(rules).forEach(([rule, param]) => {
      let isValid = true;
      let message = '';
      
      switch (rule) {
        case 'required':
          if (param && !this.isRequired(value)) {
            isValid = false;
            message = 'This field is required';
          }
          break;
          
        case 'email':
          if (param && !this.isEmail(value)) {
            isValid = false;
            message = 'Please enter a valid email address';
          }
          break;
          
        case 'minLength':
          if (!this.minLength(value, param)) {
            isValid = false;
            message = `Minimum length is ${param} characters`;
          }
          break;
          
        case 'maxLength':
          if (!this.maxLength(value, param)) {
            isValid = false;
            message = `Maximum length is ${param} characters`;
          }
          break;
          
        case 'pattern':
          if (!this.matchesPattern(value, param)) {
            isValid = false;
            message = 'Invalid format';
          }
          break;
          
        case 'custom':
          if (typeof param === 'function') {
            const result = param(value);
            if (result !== true) {
              isValid = false;
              message = typeof result === 'string' ? result : 'Invalid value';
            }
          }
          break;
      }
      
      if (!isValid) {
        errors.push({ rule, message });
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Sanitize input
  sanitize(value, type = 'text') {
    if (typeof value !== 'string') return value;
    
    switch (type) {
      case 'html':
        // Remove script tags and event handlers
        return value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/on\w+\s*=\s*'[^']*'/gi, '');
          
      case 'sql':
        // Basic SQL injection prevention
        return value.replace(/['";\\]/g, '');
        
      case 'filename':
        // Safe filename
        return value.replace(/[^a-zA-Z0-9._-]/g, '_');
        
      case 'url':
        // URL encode
        return encodeURIComponent(value);
        
      default:
        // Basic text sanitization
        return value.trim();
    }
  },

  // Create validator function
  createValidator(rules) {
    return (value) => this.validate(value, rules);
  }
};

// Export individual functions for convenience
export const { isEmail, isRequired, isEmpty, validate } = ValidationUtils;