// Mention handler for @mentions in comments
import { DomUtils, EventUtils } from '../../utils/index.js';

export class MentionHandler {
  constructor(options = {}) {
    this.options = {
      triggerChar: '@',
      minChars: 1,
      maxResults: 10,
      searchDelay: 300,
      ...options
    };
    
    // State
    this.state = {
      isActive: false,
      searchQuery: '',
      results: [],
      selectedIndex: 0,
      position: null,
      textarea: null
    };
    
    // Callbacks
    this.onSearch = options.onSearch || (() => Promise.resolve([]));
    this.onSelect = options.onSelect || (() => {});
    
    // Dropdown element
    this.dropdown = null;
    
    // Search debounce
    this.searchDebounced = EventUtils.debounce(this.performSearch.bind(this), this.options.searchDelay);
  }

  // Attach to textarea
  attach(textarea) {
    this.state.textarea = textarea;
    
    // Add event listeners
    textarea.addEventListener('input', this.handleInput.bind(this));
    textarea.addEventListener('keydown', this.handleKeydown.bind(this));
    textarea.addEventListener('blur', this.handleBlur.bind(this));
    
    // Create dropdown
    this.createDropdown();
  }

  // Detach from textarea
  detach() {
    if (this.state.textarea) {
      this.state.textarea.removeEventListener('input', this.handleInput.bind(this));
      this.state.textarea.removeEventListener('keydown', this.handleKeydown.bind(this));
      this.state.textarea.removeEventListener('blur', this.handleBlur.bind(this));
    }
    
    // Remove dropdown
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    
    this.state.textarea = null;
  }

  // Create dropdown
  createDropdown() {
    this.dropdown = DomUtils.createElement('div', {
      className: 'mention-dropdown',
      style: { display: 'none' }
    });
    
    document.body.appendChild(this.dropdown);
  }

  // Handle input event
  handleInput(event) {
    const textarea = event.target;
    const caretPos = textarea.selectionStart;
    const text = textarea.value;
    
    // Find mention trigger
    const triggerPos = this.findTriggerPosition(text, caretPos);
    
    if (triggerPos !== -1) {
      // Extract search query
      const query = text.substring(triggerPos + 1, caretPos);
      
      if (query.length >= this.options.minChars && !query.includes(' ')) {
        this.state.searchQuery = query;
        this.state.position = triggerPos;
        this.showDropdown();
        this.searchDebounced(query);
      } else {
        this.hideDropdown();
      }
    } else {
      this.hideDropdown();
    }
  }

  // Handle keydown event
  handleKeydown(event) {
    if (!this.state.isActive) return;
    
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.selectPrevious();
        break;
        
      case 'ArrowDown':
        event.preventDefault();
        this.selectNext();
        break;
        
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        this.confirmSelection();
        break;
        
      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;
    }
  }

  // Handle blur event
  handleBlur(event) {
    // Delay hide to allow click on dropdown
    setTimeout(() => {
      if (!this.dropdown.contains(document.activeElement)) {
        this.hideDropdown();
      }
    }, 200);
  }

  // Find trigger position
  findTriggerPosition(text, caretPos) {
    // Search backwards for trigger character
    for (let i = caretPos - 1; i >= 0; i--) {
      const char = text[i];
      
      if (char === this.options.triggerChar) {
        // Check if preceded by whitespace or start of text
        if (i === 0 || /\s/.test(text[i - 1])) {
          return i;
        }
      } else if (/\s/.test(char)) {
        // Stop at whitespace
        break;
      }
    }
    
    return -1;
  }

  // Perform search
  async performSearch(query) {
    try {
      const results = await this.onSearch(query);
      this.state.results = results.slice(0, this.options.maxResults);
      this.state.selectedIndex = 0;
      this.renderResults();
    } catch (error) {
      console.error('Mention search error:', error);
      this.state.results = [];
      this.renderResults();
    }
  }

  // Render results
  renderResults() {
    if (this.state.results.length === 0) {
      this.dropdown.innerHTML = `
        <div class="mention-no-results">
          No users found
        </div>
      `;
      return;
    }
    
    const resultsHtml = this.state.results.map((user, index) => `
      <div class="mention-item ${index === this.state.selectedIndex ? 'selected' : ''}"
           data-index="${index}">
        ${user.avatar ? `
          <img class="mention-avatar" src="${user.avatar}" alt="${user.name}">
        ` : `
          <div class="mention-avatar default">${this.getInitials(user.name)}</div>
        `}
        <div class="mention-info">
          <div class="mention-name">${this.highlightQuery(user.name)}</div>
          ${user.username ? `
            <div class="mention-username">@${this.highlightQuery(user.username)}</div>
          ` : ''}
        </div>
      </div>
    `).join('');
    
    this.dropdown.innerHTML = resultsHtml;
    
    // Add click handlers
    this.dropdown.querySelectorAll('.mention-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.state.selectedIndex = index;
        this.confirmSelection();
      });
    });
  }

  // Highlight query in text
  highlightQuery(text) {
    const query = this.state.searchQuery;
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  // Escape regex characters
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Get initials
  getInitials(name) {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // Show dropdown
  showDropdown() {
    if (!this.state.textarea || !this.dropdown) return;
    
    // Get textarea position
    const rect = this.state.textarea.getBoundingClientRect();
    const coords = this.getCaretCoordinates();
    
    // Position dropdown
    this.dropdown.style.position = 'fixed';
    this.dropdown.style.left = `${rect.left + coords.left}px`;
    this.dropdown.style.top = `${rect.top + coords.top + 20}px`;
    this.dropdown.style.display = 'block';
    
    this.state.isActive = true;
  }

  // Hide dropdown
  hideDropdown() {
    if (this.dropdown) {
      this.dropdown.style.display = 'none';
    }
    
    this.state.isActive = false;
    this.state.results = [];
    this.state.selectedIndex = 0;
  }

  // Get caret coordinates
  getCaretCoordinates() {
    const textarea = this.state.textarea;
    const text = textarea.value.substring(0, textarea.selectionStart);
    
    // Create mirror element
    const mirror = DomUtils.createElement('div', {
      className: 'mention-mirror',
      style: {
        position: 'absolute',
        visibility: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflow: 'hidden'
      }
    });
    
    // Copy textarea styles
    const styles = window.getComputedStyle(textarea);
    ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'padding', 'border'].forEach(prop => {
      mirror.style[prop] = styles[prop];
    });
    
    // Set dimensions
    mirror.style.width = `${textarea.offsetWidth}px`;
    mirror.style.height = `${textarea.offsetHeight}px`;
    
    // Insert text with marker
    mirror.textContent = text;
    const marker = DomUtils.createElement('span', { html: '|' });
    mirror.appendChild(marker);
    
    document.body.appendChild(mirror);
    
    // Get marker position
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    
    const coords = {
      left: markerRect.left - mirrorRect.left,
      top: markerRect.top - mirrorRect.top
    };
    
    // Clean up
    mirror.remove();
    
    return coords;
  }

  // Select previous item
  selectPrevious() {
    if (this.state.selectedIndex > 0) {
      this.state.selectedIndex--;
      this.renderResults();
    }
  }

  // Select next item
  selectNext() {
    if (this.state.selectedIndex < this.state.results.length - 1) {
      this.state.selectedIndex++;
      this.renderResults();
    }
  }

  // Confirm selection
  confirmSelection() {
    const selected = this.state.results[this.state.selectedIndex];
    if (!selected) return;
    
    const textarea = this.state.textarea;
    const text = textarea.value;
    const start = this.state.position;
    const end = textarea.selectionStart;
    
    // Build mention text
    const mentionText = `@${selected.username || selected.name} `;
    
    // Replace text
    const newText = text.substring(0, start) + mentionText + text.substring(end);
    textarea.value = newText;
    
    // Update cursor position
    const newPos = start + mentionText.length;
    textarea.setSelectionRange(newPos, newPos);
    
    // Trigger input event
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Hide dropdown
    this.hideDropdown();
    
    // Call callback
    this.onSelect(selected);
    
    // Focus textarea
    textarea.focus();
  }
}

// Export handler
export default MentionHandler;