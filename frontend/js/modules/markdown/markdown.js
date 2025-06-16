// Markdown module for rendering and processing markdown content
import { BaseModule } from '../../core/base-module.js';
import { EventBus } from '../../core/event-bus.js';
import { StringUtils } from '../../utils/index.js';

class MarkdownModule extends BaseModule {
  constructor() {
    super();
    this.name = 'markdown';
    
    // Module state
    this.state = {
      renderer: null,
      enabledFeatures: {
        spoilers: true,
        codeHighlight: true,
        youtube: true,
        mentions: true,
        emoji: true
      }
    };
    
    // Event bus instance
    this.eventBus = window.eventBus || new EventBus();
  }

  // Initialize the module
  async initialize(config = {}) {
    this.config = {
      html: false,
      breaks: true,
      linkify: true,
      typographer: true,
      ...config
    };
    
    // Initialize markdown-it
    this.initializeRenderer();
    
    // Setup custom rules
    this.setupCustomRules();
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.initialized = true;
    this.emit('markdown:initialized');
    
    return true;
  }

  // Initialize markdown renderer
  initializeRenderer() {
    if (!window.markdownit) {
      console.error('markdown-it library not found');
      return;
    }
    
    // Create renderer instance
    this.state.renderer = window.markdownit({
      html: this.config.html,
      breaks: this.config.breaks,
      linkify: this.config.linkify,
      typographer: this.config.typographer
    });
    
    // Store reference globally for compatibility
    window.md = this.state.renderer;
  }

  // Setup custom markdown rules
  setupCustomRules() {
    if (!this.state.renderer) return;
    
    // Add spoiler syntax
    if (this.state.enabledFeatures.spoilers) {
      this.addSpoilerRule();
    }
    
    // Add YouTube embed syntax
    if (this.state.enabledFeatures.youtube) {
      this.addYouTubeRule();
    }
    
    // Add mention syntax
    if (this.state.enabledFeatures.mentions) {
      this.addMentionRule();
    }
  }

  // Add spoiler rule: ||spoiler text||
  addSpoilerRule() {
    this.state.renderer.inline.ruler.before('emphasis', 'spoiler', (state, silent) => {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      
      // Check for ||
      if (marker !== 0x7C || state.src.charCodeAt(start + 1) !== 0x7C) {
        return false;
      }
      
      if (silent) return false;
      
      // Find closing ||
      let end = start + 2;
      while (end < state.posMax - 1) {
        if (state.src.charCodeAt(end) === 0x7C && state.src.charCodeAt(end + 1) === 0x7C) {
          break;
        }
        end++;
      }
      
      if (end >= state.posMax - 1) return false;
      
      // Create spoiler token
      const token = state.push('spoiler', 'span', 0);
      token.content = state.src.slice(start + 2, end);
      
      state.pos = end + 2;
      return true;
    });
    
    // Add renderer
    this.state.renderer.renderer.rules.spoiler = (tokens, idx) => {
      const content = StringUtils.escapeHtml(tokens[idx].content);
      return `<span class="spoiler" onclick="this.classList.toggle('revealed')">${content}</span>`;
    };
  }

  // Add YouTube rule: [youtube:VIDEO_ID]
  addYouTubeRule() {
    this.state.renderer.inline.ruler.before('link', 'youtube', (state, silent) => {
      const start = state.pos;
      
      // Check for [youtube:
      if (state.src.slice(start, start + 9) !== '[youtube:') {
        return false;
      }
      
      if (silent) return false;
      
      // Find closing ]
      const end = state.src.indexOf(']', start + 9);
      if (end === -1) return false;
      
      // Extract video ID
      const videoId = state.src.slice(start + 9, end);
      
      // Validate video ID
      if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return false;
      }
      
      // Create token
      const token = state.push('youtube', 'div', 0);
      token.videoId = videoId;
      
      state.pos = end + 1;
      return true;
    });
    
    // Add renderer
    this.state.renderer.renderer.rules.youtube = (tokens, idx) => {
      const videoId = tokens[idx].videoId;
      return `
        <div class="youtube-embed">
          <iframe 
            src="https://www.youtube.com/embed/${videoId}"
            frameborder="0"
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
      `;
    };
  }

  // Add mention rule: @username
  addMentionRule() {
    this.state.renderer.inline.ruler.before('emphasis', 'mention', (state, silent) => {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      
      // Check for @
      if (marker !== 0x40) return false;
      
      // Must be preceded by whitespace or start of line
      if (start > 0 && !/\s/.test(state.src[start - 1])) {
        return false;
      }
      
      if (silent) return false;
      
      // Find end of username
      let end = start + 1;
      while (end < state.posMax && /[a-zA-Z0-9_-]/.test(state.src[end])) {
        end++;
      }
      
      if (end === start + 1) return false;
      
      // Extract username
      const username = state.src.slice(start + 1, end);
      
      // Create token
      const token = state.push('mention', 'span', 0);
      token.username = username;
      
      state.pos = end;
      return true;
    });
    
    // Add renderer
    this.state.renderer.renderer.rules.mention = (tokens, idx) => {
      const username = StringUtils.escapeHtml(tokens[idx].username);
      return `<span class="mention" data-username="${username}">@${username}</span>`;
    };
  }

  // Setup event listeners
  setupEventListeners() {
    // Listen for render requests
    this.on('markdown:render', (data) => {
      const html = this.render(data.text);
      this.emit('markdown:rendered', { html, id: data.id });
    });
  }

  // Render markdown to HTML
  render(text) {
    if (!this.state.renderer) {
      return StringUtils.escapeHtml(text);
    }
    
    // Preprocess text
    const processed = this.preprocessMarkdown(text);
    
    // Render with markdown-it
    const html = this.state.renderer.render(processed);
    
    // Postprocess HTML
    return this.postprocessHtml(html);
  }

  // Preprocess markdown before rendering
  preprocessMarkdown(text) {
    // Handle special cases or custom syntax
    let processed = text;
    
    // Convert old spoiler syntax if needed
    processed = processed.replace(/\[spoiler\](.*?)\[\/spoiler\]/g, '||$1||');
    
    return processed;
  }

  // Postprocess HTML after rendering
  postprocessHtml(html) {
    // Add target="_blank" to external links
    html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
    
    // Add lazy loading to images
    html = html.replace(/<img /g, '<img loading="lazy" ');
    
    return html;
  }

  // Insert markdown syntax at cursor position
  insertMarkdown(textarea, before, after) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    
    // Build new text
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    
    // Update textarea
    textarea.value = newText;
    
    // Update cursor position
    const cursorPos = start + before.length + selectedText.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();
    
    // Trigger input event
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    return newText;
  }

  // Get toolbar actions
  getToolbarActions() {
    return [
      {
        name: 'bold',
        icon: 'bold',
        title: 'Bold',
        before: '**',
        after: '**'
      },
      {
        name: 'italic',
        icon: 'italic',
        title: 'Italic',
        before: '_',
        after: '_'
      },
      {
        name: 'strikethrough',
        icon: 'strikethrough',
        title: 'Strikethrough',
        before: '~~',
        after: '~~'
      },
      {
        name: 'code',
        icon: 'code',
        title: 'Code',
        before: '`',
        after: '`'
      },
      {
        name: 'link',
        icon: 'link',
        title: 'Link',
        handler: (textarea) => {
          const url = prompt('Enter URL:');
          if (url) {
            this.insertMarkdown(textarea, '[', `](${url})`);
          }
        }
      },
      {
        name: 'image',
        icon: 'image',
        title: 'Image',
        handler: (textarea) => {
          const url = prompt('Enter image URL:');
          if (url) {
            this.insertMarkdown(textarea, '![', `](${url})`);
          }
        }
      },
      {
        name: 'spoiler',
        icon: 'eye-slash',
        title: 'Spoiler',
        before: '||',
        after: '||'
      },
      {
        name: 'quote',
        icon: 'quote-right',
        title: 'Quote',
        before: '\n> ',
        after: '\n'
      },
      {
        name: 'list',
        icon: 'list-ul',
        title: 'List',
        before: '\n- ',
        after: ''
      }
    ];
  }

  // Check if feature is enabled
  isFeatureEnabled(feature) {
    return this.state.enabledFeatures[feature] || false;
  }

  // Enable/disable feature
  setFeatureEnabled(feature, enabled) {
    this.state.enabledFeatures[feature] = enabled;
    
    // Reinitialize rules if needed
    if (this.initialized) {
      this.setupCustomRules();
    }
  }

  // Get markdown help text
  getHelpText() {
    return `
**Markdown Formatting:**
- **Bold**: \`**text**\` or \`__text__\`
- *Italic*: \`*text*\` or \`_text_\`
- ~~Strikethrough~~: \`~~text~~\`
- \`Code\`: \`\`text\`\`
- [Link](url): \`[text](url)\`
- ![Image](url): \`![alt](url)\`
- > Quote: \`> text\`
- List: \`- item\`

**Special Features:**
- Spoiler: \`||hidden text||\`
- YouTube: \`[youtube:VIDEO_ID]\`
- Mention: \`@username\`
    `.trim();
  }

  // Cleanup module
  cleanup() {
    super.cleanup();
    this.state.renderer = null;
    window.md = null;
  }
}

// Export module
export default MarkdownModule;