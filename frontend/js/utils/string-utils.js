// String utility functions for text manipulation
export const StringUtils = {
  // Truncate string with ellipsis
  truncate(str, length, suffix = '...') {
    if (str.length <= length) return str;
    return str.substring(0, length - suffix.length) + suffix;
  },

  // Truncate by words
  truncateWords(str, wordCount, suffix = '...') {
    const words = str.split(' ');
    if (words.length <= wordCount) return str;
    return words.slice(0, wordCount).join(' ') + suffix;
  },

  // Convert to title case
  toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },

  // Convert to camel case
  toCamelCase(str) {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/\s+/g, '');
  },

  // Convert to kebab case
  toKebabCase(str) {
    return str
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
      .map(x => x.toLowerCase())
      .join('-');
  },

  // Convert to snake case
  toSnakeCase(str) {
    return str
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
      .map(x => x.toLowerCase())
      .join('_');
  },

  // Convert to pascal case
  toPascalCase(str) {
    return str
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
      .map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
      .join('');
  },

  // Slugify string
  slugify(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  // Remove HTML tags
  stripHtml(str) {
    return str.replace(/<[^>]*>/g, '');
  },

  // Escape HTML
  escapeHtml(str) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    };
    return str.replace(/[&<>"'\/]/g, char => map[char]);
  },

  // Unescape HTML
  unescapeHtml(str) {
    const map = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x2F;': '/'
    };
    return str.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&#x2F;/g, entity => map[entity]);
  },

  // Count words
  countWords(str) {
    return str.trim().split(/\s+/).filter(word => word.length > 0).length;
  },

  // Count lines
  countLines(str) {
    return str.split('\n').length;
  },

  // Highlight text
  highlight(text, search, className = 'highlight') {
    if (!search) return text;
    
    const regex = new RegExp(`(${this.escapeRegex(search)})`, 'gi');
    return text.replace(regex, `<span class="${className}">$1</span>`);
  },

  // Escape regex special characters
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // Pad string
  pad(str, length, char = ' ', position = 'right') {
    const padLength = length - str.length;
    if (padLength <= 0) return str;
    
    const padding = char.repeat(padLength);
    
    switch (position) {
      case 'left':
        return padding + str;
      case 'both':
        const leftPad = Math.floor(padLength / 2);
        const rightPad = padLength - leftPad;
        return char.repeat(leftPad) + str + char.repeat(rightPad);
      default:
        return str + padding;
    }
  },

  // Remove extra whitespace
  normalizeWhitespace(str) {
    return str.replace(/\s+/g, ' ').trim();
  },

  // Extract initials
  getInitials(name) {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  },

  // Format number with separators
  formatNumber(num, separator = ',') {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  },

  // Format bytes
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  // Generate random string
  generateRandomString(length = 8, chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Generate UUID
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // Parse query string
  parseQueryString(query) {
    const params = new URLSearchParams(query);
    const result = {};
    
    for (const [key, value] of params) {
      if (result[key]) {
        // Handle multiple values
        if (Array.isArray(result[key])) {
          result[key].push(value);
        } else {
          result[key] = [result[key], value];
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  },

  // Build query string
  buildQueryString(params) {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, v));
      } else if (value !== null && value !== undefined) {
        searchParams.append(key, value);
      }
    });
    
    return searchParams.toString();
  },

  // Template string interpolation
  template(str, data) {
    return str.replace(/\${(\w+)}/g, (match, key) => {
      return data.hasOwnProperty(key) ? data[key] : match;
    });
  },

  // Compare strings with tolerance
  fuzzyMatch(str1, str2, threshold = 0.8) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    const similarity = (longer.length - editDistance) / longer.length;
    
    return similarity >= threshold;
  },

  // Levenshtein distance
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  },

  // Extract URLs from text
  extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  },

  // Extract hashtags from text
  extractHashtags(text) {
    const hashtagRegex = /#\w+/g;
    return text.match(hashtagRegex) || [];
  },

  // Extract mentions from text
  extractMentions(text) {
    const mentionRegex = /@\w+/g;
    return text.match(mentionRegex) || [];
  }
};

// Export individual functions for convenience
export const { truncate, slugify, escapeHtml, formatNumber } = StringUtils;