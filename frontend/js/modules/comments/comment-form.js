// Comment form component for posting and editing comments
import { DomUtils, ValidationUtils, EventUtils } from '../../utils/index.js';

export class CommentForm {
  constructor(options = {}) {
    this.options = {
      maxLength: 5000,
      minLength: 1,
      enableMarkdown: true,
      enablePreview: true,
      enableToolbar: true,
      placeholder: 'Write a comment...',
      ...options
    };
    
    // Form state
    this.state = {
      text: '',
      isSubmitting: false,
      showPreview: false,
      errors: []
    };
    
    // DOM elements
    this.container = null;
    this.textarea = null;
    this.previewArea = null;
    this.charCounter = null;
    
    // Event handlers
    this.onSubmit = options.onSubmit || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.onChange = options.onChange || (() => {});
  }

  // Render form
  render(container) {
    this.container = container;
    
    const formHtml = `
      <div class="comment-form">
        ${this.options.enableToolbar ? this.renderToolbar() : ''}
        
        <div class="comment-form-content">
          <textarea 
            class="comment-textarea" 
            placeholder="${this.options.placeholder}"
            maxlength="${this.options.maxLength}"
            rows="4"
          >${this.state.text}</textarea>
          
          ${this.options.enablePreview ? `
            <div class="comment-preview ${this.state.showPreview ? 'show' : ''}" style="display: none;">
              <div class="preview-content"></div>
            </div>
          ` : ''}
        </div>
        
        <div class="comment-form-footer">
          <div class="form-info">
            <span class="char-counter">
              <span class="current">0</span> / <span class="max">${this.options.maxLength}</span>
            </span>
            
            ${this.options.enableMarkdown ? `
              <span class="markdown-hint">
                <i class="fab fa-markdown"></i> Markdown supported
              </span>
            ` : ''}
          </div>
          
          <div class="form-actions">
            <button class="btn btn-text" type="button" onclick="this.handleCancel()">
              Cancel
            </button>
            <button class="btn btn-primary" type="submit" disabled>
              Post Comment
            </button>
          </div>
        </div>
        
        <div class="comment-form-errors" style="display: none;"></div>
      </div>
    `;
    
    this.container.innerHTML = formHtml;
    
    // Get references to elements
    this.textarea = this.container.querySelector('.comment-textarea');
    this.previewArea = this.container.querySelector('.comment-preview');
    this.charCounter = this.container.querySelector('.char-counter .current');
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Focus textarea
    this.textarea.focus();
  }

  // Render toolbar
  renderToolbar() {
    return `
      <div class="comment-toolbar">
        <div class="toolbar-group">
          <button type="button" class="toolbar-btn" onclick="this.insertMarkdown('**', '**')" title="Bold">
            <i class="fas fa-bold"></i>
          </button>
          <button type="button" class="toolbar-btn" onclick="this.insertMarkdown('_', '_')" title="Italic">
            <i class="fas fa-italic"></i>
          </button>
          <button type="button" class="toolbar-btn" onclick="this.insertMarkdown('\`', '\`')" title="Code">
            <i class="fas fa-code"></i>
          </button>
          <button type="button" class="toolbar-btn" onclick="this.insertMarkdown('[', '](url)')" title="Link">
            <i class="fas fa-link"></i>
          </button>
        </div>
        
        <div class="toolbar-group">
          <button type="button" class="toolbar-btn" onclick="this.insertImage()" title="Image">
            <i class="fas fa-image"></i>
          </button>
          <button type="button" class="toolbar-btn" onclick="this.insertVideo()" title="Video">
            <i class="fas fa-video"></i>
          </button>
          <button type="button" class="toolbar-btn" onclick="this.insertList()" title="List">
            <i class="fas fa-list"></i>
          </button>
          <button type="button" class="toolbar-btn" onclick="this.insertQuote()" title="Quote">
            <i class="fas fa-quote-left"></i>
          </button>
        </div>
        
        ${this.options.enablePreview ? `
          <div class="toolbar-group toolbar-right">
            <button type="button" class="toolbar-btn toggle-preview" onclick="this.togglePreview()" title="Preview">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Setup event listeners
  setupEventListeners() {
    // Textarea events
    this.textarea.addEventListener('input', this.handleInput.bind(this));
    this.textarea.addEventListener('keydown', this.handleKeydown.bind(this));
    
    // Form submission
    const form = this.container.querySelector('.comment-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.addEventListener('click', this.handleSubmit.bind(this));
    
    // Cancel button
    const cancelBtn = form.querySelector('.btn-text');
    cancelBtn.addEventListener('click', this.handleCancel.bind(this));
    
    // Toolbar buttons
    if (this.options.enableToolbar) {
      this.setupToolbarListeners();
    }
  }

  // Setup toolbar listeners
  setupToolbarListeners() {
    const toolbar = this.container.querySelector('.comment-toolbar');
    
    // Make toolbar methods available
    toolbar.insertMarkdown = this.insertMarkdown.bind(this);
    toolbar.insertImage = this.insertImage.bind(this);
    toolbar.insertVideo = this.insertVideo.bind(this);
    toolbar.insertList = this.insertList.bind(this);
    toolbar.insertQuote = this.insertQuote.bind(this);
    toolbar.togglePreview = this.togglePreview.bind(this);
  }

  // Handle input
  handleInput(event) {
    const text = event.target.value;
    this.state.text = text;
    
    // Update character counter
    this.updateCharCounter(text.length);
    
    // Update submit button
    this.updateSubmitButton();
    
    // Update preview if shown
    if (this.state.showPreview) {
      this.updatePreview();
    }
    
    // Call change handler
    this.onChange(text);
  }

  // Handle keydown
  handleKeydown(event) {
    // Submit on Ctrl/Cmd + Enter
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.handleSubmit();
    }
  }

  // Handle submit
  async handleSubmit(event) {
    if (event) event.preventDefault();
    
    // Validate form
    if (!this.validate()) {
      return;
    }
    
    // Set submitting state
    this.setSubmitting(true);
    
    try {
      // Call submit handler
      await this.onSubmit(this.state.text.trim());
      
      // Clear form on success
      this.clear();
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.setSubmitting(false);
    }
  }

  // Handle cancel
  handleCancel() {
    if (this.state.text && !confirm('Discard your comment?')) {
      return;
    }
    
    this.clear();
    this.onCancel();
  }

  // Validate form
  validate() {
    const errors = [];
    const text = this.state.text.trim();
    
    if (!text) {
      errors.push('Comment cannot be empty');
    } else if (text.length < this.options.minLength) {
      errors.push(`Comment must be at least ${this.options.minLength} characters`);
    } else if (text.length > this.options.maxLength) {
      errors.push(`Comment cannot exceed ${this.options.maxLength} characters`);
    }
    
    if (errors.length > 0) {
      this.showErrors(errors);
      return false;
    }
    
    this.hideErrors();
    return true;
  }

  // Insert markdown
  insertMarkdown(before, after) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const text = this.textarea.value;
    const selectedText = text.substring(start, end);
    
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    
    this.textarea.value = newText;
    this.state.text = newText;
    
    // Update cursor position
    const cursorPos = start + before.length + selectedText.length;
    this.textarea.setSelectionRange(cursorPos, cursorPos);
    this.textarea.focus();
    
    // Trigger input event
    this.textarea.dispatchEvent(new Event('input'));
  }

  // Insert image
  insertImage() {
    const url = prompt('Enter image URL:');
    if (url) {
      this.insertMarkdown('![Image](', `${url})`);
    }
  }

  // Insert video
  insertVideo() {
    const url = prompt('Enter YouTube video URL:');
    if (url) {
      const videoId = this.extractYouTubeId(url);
      if (videoId) {
        this.insertMarkdown('', `\n[youtube:${videoId}]\n`);
      } else {
        alert('Invalid YouTube URL');
      }
    }
  }

  // Insert list
  insertList() {
    this.insertMarkdown('\n- ', '\n');
  }

  // Insert quote
  insertQuote() {
    this.insertMarkdown('\n> ', '\n');
  }

  // Toggle preview
  togglePreview() {
    this.state.showPreview = !this.state.showPreview;
    
    if (this.state.showPreview) {
      this.previewArea.style.display = 'block';
      this.textarea.style.display = 'none';
      this.updatePreview();
    } else {
      this.previewArea.style.display = 'none';
      this.textarea.style.display = 'block';
      this.textarea.focus();
    }
    
    // Update button state
    const previewBtn = this.container.querySelector('.toggle-preview');
    if (previewBtn) {
      previewBtn.classList.toggle('active', this.state.showPreview);
    }
  }

  // Update preview
  updatePreview() {
    if (!this.previewArea) return;
    
    const previewContent = this.previewArea.querySelector('.preview-content');
    if (this.state.text.trim()) {
      // Render markdown
      const html = window.md ? window.md.render(this.state.text) : this.state.text;
      previewContent.innerHTML = html;
    } else {
      previewContent.innerHTML = '<p class="preview-empty">Nothing to preview</p>';
    }
  }

  // Update character counter
  updateCharCounter(length) {
    if (!this.charCounter) return;
    
    this.charCounter.textContent = length;
    
    // Add warning class if near limit
    const counter = this.charCounter.parentElement;
    counter.classList.toggle('warning', length > this.options.maxLength * 0.9);
    counter.classList.toggle('error', length >= this.options.maxLength);
  }

  // Update submit button
  updateSubmitButton() {
    const submitBtn = this.container.querySelector('button[type="submit"]');
    const hasText = this.state.text.trim().length > 0;
    const withinLimit = this.state.text.length <= this.options.maxLength;
    
    submitBtn.disabled = !hasText || !withinLimit || this.state.isSubmitting;
  }

  // Set submitting state
  setSubmitting(isSubmitting) {
    this.state.isSubmitting = isSubmitting;
    
    const submitBtn = this.container.querySelector('button[type="submit"]');
    submitBtn.disabled = isSubmitting;
    submitBtn.innerHTML = isSubmitting ? 
      '<i class="fas fa-spinner fa-spin"></i> Posting...' : 
      'Post Comment';
    
    // Disable form elements
    this.textarea.disabled = isSubmitting;
    const toolbar = this.container.querySelector('.comment-toolbar');
    if (toolbar) {
      toolbar.querySelectorAll('button').forEach(btn => {
        btn.disabled = isSubmitting;
      });
    }
  }

  // Show errors
  showErrors(errors) {
    const errorContainer = this.container.querySelector('.comment-form-errors');
    errorContainer.innerHTML = errors.map(error => 
      `<div class="error-message"><i class="fas fa-exclamation-circle"></i> ${error}</div>`
    ).join('');
    errorContainer.style.display = 'block';
  }

  // Show single error
  showError(error) {
    this.showErrors([error]);
  }

  // Hide errors
  hideErrors() {
    const errorContainer = this.container.querySelector('.comment-form-errors');
    errorContainer.innerHTML = '';
    errorContainer.style.display = 'none';
  }

  // Clear form
  clear() {
    this.state.text = '';
    this.textarea.value = '';
    this.updateCharCounter(0);
    this.updateSubmitButton();
    this.hideErrors();
    
    if (this.state.showPreview) {
      this.togglePreview();
    }
  }

  // Set text
  setText(text) {
    this.state.text = text;
    this.textarea.value = text;
    this.updateCharCounter(text.length);
    this.updateSubmitButton();
    
    if (this.state.showPreview) {
      this.updatePreview();
    }
  }

  // Get text
  getText() {
    return this.state.text;
  }

  // Extract YouTube ID
  extractYouTubeId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  // Destroy form
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Export form
export default CommentForm;