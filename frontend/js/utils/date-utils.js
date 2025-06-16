// Date utility functions for formatting and manipulation
export const DateUtils = {
  // Format date to relative time
  getRelativeTime(date) {
    const now = new Date();
    const then = new Date(date);
    const seconds = Math.floor((now - then) / 1000);
    
    // Define time intervals
    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'week', seconds: 604800 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 },
      { label: 'second', seconds: 1 }
    ];
    
    // Find appropriate interval
    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) {
        return count === 1 
          ? `1 ${interval.label} ago`
          : `${count} ${interval.label}s ago`;
      }
    }
    
    return 'just now';
  },

  // Format date to specific format
  formatDate(date, format = 'default') {
    const d = new Date(date);
    
    // Format patterns
    const formats = {
      default: { 
        dateStyle: 'medium', 
        timeStyle: 'short' 
      },
      short: { 
        dateStyle: 'short' 
      },
      long: { 
        dateStyle: 'long', 
        timeStyle: 'medium' 
      },
      time: { 
        timeStyle: 'short' 
      },
      date: { 
        dateStyle: 'medium' 
      },
      iso: () => d.toISOString(),
      custom: (pattern) => this.customFormat(d, pattern)
    };
    
    // Handle ISO format
    if (format === 'iso') {
      return formats.iso();
    }
    
    // Handle custom format
    if (format.includes('%')) {
      return formats.custom(format);
    }
    
    // Use predefined format
    const formatter = formats[format] || formats.default;
    return d.toLocaleString(undefined, formatter);
  },

  // Custom date formatting
  customFormat(date, pattern) {
    const d = new Date(date);
    
    // Format tokens
    const tokens = {
      '%Y': d.getFullYear(),
      '%y': String(d.getFullYear()).slice(-2),
      '%m': String(d.getMonth() + 1).padStart(2, '0'),
      '%d': String(d.getDate()).padStart(2, '0'),
      '%H': String(d.getHours()).padStart(2, '0'),
      '%M': String(d.getMinutes()).padStart(2, '0'),
      '%S': String(d.getSeconds()).padStart(2, '0'),
      '%B': d.toLocaleString('default', { month: 'long' }),
      '%b': d.toLocaleString('default', { month: 'short' }),
      '%A': d.toLocaleString('default', { weekday: 'long' }),
      '%a': d.toLocaleString('default', { weekday: 'short' })
    };
    
    // Replace tokens
    return pattern.replace(/%[YymdHMSBbAa]/g, match => tokens[match] || match);
  },

  // Parse date from various formats
  parseDate(input) {
    if (!input) return null;
    
    // Already a date
    if (input instanceof Date) {
      return input;
    }
    
    // Timestamp
    if (typeof input === 'number') {
      return new Date(input);
    }
    
    // ISO string or parseable string
    const date = new Date(input);
    return isNaN(date.getTime()) ? null : date;
  },

  // Check if date is valid
  isValidDate(date) {
    const d = this.parseDate(date);
    return d instanceof Date && !isNaN(d.getTime());
  },

  // Get date parts
  getDateParts(date) {
    const d = new Date(date);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
      dayOfWeek: d.getDay(),
      timestamp: d.getTime()
    };
  },

  // Add time to date
  addTime(date, amount, unit = 'days') {
    const d = new Date(date);
    
    // Time unit multipliers
    const units = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000, // Approximate
      years: 365 * 24 * 60 * 60 * 1000 // Approximate
    };
    
    // Special handling for months and years
    if (unit === 'months') {
      d.setMonth(d.getMonth() + amount);
    } else if (unit === 'years') {
      d.setFullYear(d.getFullYear() + amount);
    } else {
      const multiplier = units[unit] || units.days;
      d.setTime(d.getTime() + (amount * multiplier));
    }
    
    return d;
  },

  // Subtract time from date
  subtractTime(date, amount, unit = 'days') {
    return this.addTime(date, -amount, unit);
  },

  // Get difference between dates
  getDateDiff(date1, date2, unit = 'days') {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d1 - d2);
    
    // Time unit divisors
    const units = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000, // Approximate
      years: 365 * 24 * 60 * 60 * 1000 // Approximate
    };
    
    const divisor = units[unit] || units.days;
    return Math.floor(diff / divisor);
  },

  // Check if date is today
  isToday(date) {
    const d = new Date(date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  },

  // Check if date is yesterday
  isYesterday(date) {
    const d = new Date(date);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return d.toDateString() === yesterday.toDateString();
  },

  // Check if date is this week
  isThisWeek(date) {
    const d = new Date(date);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    return d >= weekStart;
  },

  // Get start of day
  startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // Get end of day
  endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  },

  // Get calendar days for month
  getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    // Add previous month's trailing days
    const firstDayOfWeek = firstDay.getDay();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isPrevMonth: true
      });
    }
    
    // Add current month's days
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: this.isToday(date)
      });
    }
    
    // Add next month's leading days
    const remainingDays = 42 - days.length; // 6 weeks
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        isCurrentMonth: false,
        isNextMonth: true
      });
    }
    
    return days;
  },

  // Format duration
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  },

  // Get timezone offset string
  getTimezoneOffset(date = new Date()) {
    const offset = date.getTimezoneOffset();
    const absOffset = Math.abs(offset);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    const sign = offset <= 0 ? '+' : '-';
    
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
};

// Export individual functions for convenience
export const { getRelativeTime, formatDate, parseDate, isValidDate } = DateUtils;