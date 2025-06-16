// Theme editor UI renderer for theme customization interface
import { DomUtils, StringUtils } from '../../utils/index.js';

export class ThemeEditorUI {
  constructor(themeEditor) {
    this.themeEditor = themeEditor;
    this.container = null;
  }

  // Render theme editor panel
  renderPanel(container) {
    this.container = container;
    
    if (!this.themeEditor.state.canEdit) {
      this.container.innerHTML = '<p>Theme editor requires super moderator privileges.</p>';
      return;
    }
    
    const panelHtml = `
      <div class="theme-editor-panel">
        ${this.renderHeader()}
        ${this.renderPresets()}
        ${this.renderColorGroups()}
        ${this.renderActions()}
      </div>
    `;
    
    this.container.innerHTML = panelHtml;
    this.setupEventHandlers();
  }

  // Render header
  renderHeader() {
    return `
      <div class="theme-editor-header">
        <h2>
          <i class="fas fa-palette"></i>
          Theme Editor
        </h2>
        ${this.themeEditor.state.hasChanges ? `
          <span class="unsaved-indicator">
            <i class="fas fa-circle"></i> Unsaved changes
          </span>
        ` : ''}
      </div>
    `;
  }

  // Render preset selector
  renderPresets() {
    const presets = Object.keys(this.themeEditor.state.presets);
    
    return `
      <div class="theme-presets">
        <h3>Presets</h3>
        <div class="preset-buttons">
          ${presets.map(preset => `
            <button class="preset-btn ${this.themeEditor.state.selectedPreset === preset ? 'active' : ''}"
                    onclick="themeEditor.applyPreset('${preset}')"
                    title="Apply ${preset} theme">
              <i class="fas fa-${this.getPresetIcon(preset)}"></i>
              ${this.formatPresetName(preset)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Render color groups
  renderColorGroups() {
    const colorGroups = [
      { key: 'primary', label: 'Primary Colors', icon: 'star' },
      { key: 'backgrounds', label: 'Backgrounds', icon: 'fill' },
      { key: 'text', label: 'Text Colors', icon: 'font' },
      { key: 'borders', label: 'Borders', icon: 'border-style' }
    ];
    
    return `
      <div class="theme-colors">
        ${colorGroups.map(group => this.renderColorGroup(group)).join('')}
      </div>
    `;
  }

  // Render single color group
  renderColorGroup(group) {
    const colors = this.themeEditor.getColorCategory(group.key);
    
    return `
      <div class="color-group" data-group="${group.key}">
        <h3>
          <i class="fas fa-${group.icon}"></i>
          ${group.label}
        </h3>
        <div class="color-items">
          ${Object.entries(colors).map(([key, value]) => 
            this.renderColorItem(group.key, key, value)
          ).join('')}
        </div>
      </div>
    `;
  }

  // Render color item
  renderColorItem(category, key, value) {
    const id = `color-${category}-${key}`;
    
    return `
      <div class="color-item" data-category="${category}" data-key="${key}">
        <label for="${id}" class="color-label">
          ${this.themeEditor.formatColorLabel(key)}
        </label>
        <div class="color-controls">
          <input type="color" 
                 id="${id}"
                 class="color-input" 
                 value="${value}"
                 onchange="themeEditor.updateColor('${category}', '${key}', this.value)">
          <input type="text" 
                 class="color-text" 
                 value="${value}"
                 pattern="^#[0-9A-Fa-f]{6}$"
                 onchange="themeEditor.updateColor('${category}', '${key}', this.value)">
          ${this.themeEditor.supportsEyeDropper ? `
            <button class="color-picker-btn" 
                    onclick="themeEditor.pickColorFromScreen('${category}', '${key}')"
                    title="Pick color from screen">
              <i class="fas fa-eye-dropper"></i>
            </button>
          ` : ''}
        </div>
        <div class="color-preview" style="background-color: ${value}"></div>
      </div>
    `;
  }

  // Render actions
  renderActions() {
    return `
      <div class="theme-actions">
        <div class="action-group">
          <button class="btn btn-secondary" 
                  onclick="themeEditor.undoLastChange()"
                  ${!this.themeEditor.state.lastColorChange ? 'disabled' : ''}>
            <i class="fas fa-undo"></i> Undo
          </button>
          <button class="btn btn-secondary" onclick="themeEditor.resetTheme()">
            <i class="fas fa-sync"></i> Reset
          </button>
        </div>
        
        <div class="action-group">
          <button class="btn btn-secondary" onclick="themeEditor.exportTheme()">
            <i class="fas fa-download"></i> Export
          </button>
          <label class="btn btn-secondary">
            <i class="fas fa-upload"></i> Import
            <input type="file" 
                   accept=".json"
                   style="display: none"
                   onchange="this.handleImport(event)">
          </label>
        </div>
        
        <button class="btn btn-primary" 
                onclick="themeEditor.saveTheme()"
                ${!this.themeEditor.state.hasChanges || this.themeEditor.state.isSaving ? 'disabled' : ''}>
          ${this.themeEditor.state.isSaving ? 
            '<i class="fas fa-spinner fa-spin"></i> Saving...' : 
            '<i class="fas fa-save"></i> Save Theme'
          }
        </button>
      </div>
    `;
  }

  // Get preset icon
  getPresetIcon(preset) {
    const icons = {
      light: 'sun',
      dark: 'moon',
      ocean: 'water'
    };
    return icons[preset] || 'palette';
  }

  // Format preset name
  formatPresetName(preset) {
    return preset.charAt(0).toUpperCase() + preset.slice(1);
  }

  // Setup event handlers
  setupEventHandlers() {
    // Color input synchronization
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('color-input')) {
        const textInput = e.target.parentElement.querySelector('.color-text');
        if (textInput) {
          textInput.value = e.target.value;
        }
      } else if (e.target.classList.contains('color-text')) {
        const colorInput = e.target.parentElement.querySelector('.color-input');
        if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
          colorInput.value = e.target.value;
        }
      }
    });
    
    // File import handler
    const importInput = this.container.querySelector('input[type="file"]');
    if (importInput) {
      importInput.handleImport = (event) => {
        const file = event.target.files[0];
        if (file) {
          this.themeEditor.importTheme(file);
          event.target.value = ''; // Reset input
        }
      };
    }
    
    // Listen for theme editor events
    this.themeEditor.on('theme-editor:colorChanged', () => this.updateUI());
    this.themeEditor.on('theme-editor:presetApplied', () => this.updateUI());
    this.themeEditor.on('theme-editor:saved', () => this.updateUI());
    this.themeEditor.on('theme-editor:undone', () => this.updateUI());
    this.themeEditor.on('theme-editor:imported', () => this.updateUI());
  }

  // Update UI
  updateUI() {
    // Update header
    const header = this.container.querySelector('.theme-editor-header');
    if (header) {
      header.outerHTML = this.renderHeader();
    }
    
    // Update preset buttons
    const presetBtns = this.container.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      const preset = btn.textContent.trim().toLowerCase();
      btn.classList.toggle('active', preset === this.themeEditor.state.selectedPreset);
    });
    
    // Update color values
    Object.entries(this.themeEditor.state.colors).forEach(([category, colors]) => {
      Object.entries(colors).forEach(([key, value]) => {
        const colorItem = this.container.querySelector(
          `.color-item[data-category="${category}"][data-key="${key}"]`
        );
        
        if (colorItem) {
          const colorInput = colorItem.querySelector('.color-input');
          const textInput = colorItem.querySelector('.color-text');
          const preview = colorItem.querySelector('.color-preview');
          
          if (colorInput) colorInput.value = value;
          if (textInput) textInput.value = value;
          if (preview) preview.style.backgroundColor = value;
        }
      });
    });
    
    // Update action buttons
    const undoBtn = this.container.querySelector('button[onclick*="undoLastChange"]');
    if (undoBtn) {
      undoBtn.disabled = !this.themeEditor.state.lastColorChange;
    }
    
    const saveBtn = this.container.querySelector('button[onclick*="saveTheme"]');
    if (saveBtn) {
      saveBtn.disabled = !this.themeEditor.state.hasChanges || this.themeEditor.state.isSaving;
      saveBtn.innerHTML = this.themeEditor.state.isSaving ? 
        '<i class="fas fa-spinner fa-spin"></i> Saving...' : 
        '<i class="fas fa-save"></i> Save Theme';
    }
  }

  // Show live preview
  renderLivePreview() {
    return `
      <div class="theme-preview">
        <h3>Live Preview</h3>
        <div class="preview-content">
          <div class="preview-card">
            <h4>Sample Content</h4>
            <p class="text-secondary">This is how your theme looks in action.</p>
            <div class="preview-buttons">
              <button class="btn btn-primary">Primary Button</button>
              <button class="btn btn-secondary">Secondary Button</button>
            </div>
            <div class="preview-form">
              <input type="text" placeholder="Sample input field">
              <textarea placeholder="Sample textarea"></textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Export UI
export default ThemeEditorUI;