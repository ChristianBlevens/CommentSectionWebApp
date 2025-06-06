const config = require('../config');

// Validation schemas
const schemas = {
  comment: {
    content: {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: config.security.maxCommentLength,
    },
    pageId: {
      required: true,
      type: 'string',
      maxLength: 255,
    },
    parentId: {
      required: false,
      type: 'number',
      min: 1,
    },
  },
  
  report: {
    reason: {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: config.security.maxReportLength,
    },
  },
  
  vote: {
    type: {
      required: true,
      type: 'string',
      enum: ['like', 'dislike'],
    },
  },
  
  pageId: {
    pageId: {
      required: true,
      type: 'string',
      maxLength: 255,
    },
  },
};

// Validate request against schema
function validateRequest(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return next(new Error(`Unknown schema: ${schemaName}`));
    }
    
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      
      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip validation if not required and not provided
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }
      
      // Type validation
      if (rules.type) {
        const valueType = typeof value;
        if (rules.type === 'number' && (valueType !== 'number' || isNaN(value))) {
          errors.push(`${field} must be a number`);
          continue;
        }
        if (rules.type === 'string' && valueType !== 'string') {
          errors.push(`${field} must be a string`);
          continue;
        }
      }
      
      // String length validation
      if (rules.type === 'string' && value) {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must not exceed ${rules.maxLength} characters`);
        }
      }
      
      // Number range validation
      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${field} must not exceed ${rules.max}`);
        }
      }
      
      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: errors,
      });
    }
    
    next();
  };
}

// Sanitize HTML content
function sanitizeContent(req, res, next) {
  if (req.body.content) {
    // Basic sanitization - remove script tags and event handlers
    req.body.content = req.body.content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .trim();
  }
  next();
}

module.exports = {
  validateRequest,
  sanitizeContent,
};