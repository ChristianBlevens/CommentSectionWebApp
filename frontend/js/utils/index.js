// Central export for all utility modules
export * from './dom-utils.js';
export * from './date-utils.js';
export * from './validation-utils.js';
export * from './string-utils.js';
export * from './storage-utils.js';
export * from './event-utils.js';

// Re-export commonly used utilities for convenience
import { DomUtils } from './dom-utils.js';
import { DateUtils } from './date-utils.js';
import { ValidationUtils } from './validation-utils.js';
import { StringUtils } from './string-utils.js';
import { StorageUtils } from './storage-utils.js';
import { EventUtils } from './event-utils.js';

// Create a unified utils object
export const Utils = {
  dom: DomUtils,
  date: DateUtils,
  validation: ValidationUtils,
  string: StringUtils,
  storage: StorageUtils,
  event: EventUtils
};

// Export default
export default Utils;