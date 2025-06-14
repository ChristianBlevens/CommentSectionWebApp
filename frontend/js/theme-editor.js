// Theme Editor JavaScript
(function() {
    'use strict';

    // Default theme colors
    const defaultColors = {
        primary: {
            main: '#3b82f6',
            hover: '#2563eb',
            light: '#dbeafe'
        },
        backgrounds: {
            main: '#ffffff',
            secondary: '#f3f4f6',
            hover: '#f9fafb'
        },
        text: {
            primary: '#111827',
            secondary: '#6b7280',
            muted: '#9ca3af'
        },
        status: {
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        },
        borders: {
            light: '#e5e7eb',
            medium: '#d1d5db'
        }
    };

    // Built-in presets
    const builtInPresets = {
        light: {
            name: 'Classic Light',
            colors: { ...defaultColors }
        },
        dark: {
            name: 'Midnight Dark',
            colors: {
                primary: {
                    main: '#8b5cf6',
                    hover: '#7c3aed',
                    light: '#a78bfa'
                },
                backgrounds: {
                    main: '#0f0f23',
                    secondary: '#1a1a2e',
                    hover: '#16213e'
                },
                text: {
                    primary: '#eef2ff',
                    secondary: '#c7d2fe',
                    muted: '#a5b4fc'
                },
                status: {
                    success: '#4ade80',
                    warning: '#fbbf24',
                    error: '#f87171'
                },
                borders: {
                    light: '#1e293b',
                    medium: '#334155'
                }
            }
        },
        ocean: {
            name: 'Ocean Breeze',
            colors: {
                primary: {
                    main: '#0891b2',
                    hover: '#0e7490',
                    light: '#67e8f9'
                },
                backgrounds: {
                    main: '#f0fdfa',
                    secondary: '#ccfbf1',
                    hover: '#99f6e4'
                },
                text: {
                    primary: '#134e4a',
                    secondary: '#0f766e',
                    muted: '#14b8a6'
                },
                status: {
                    success: '#10b981',
                    warning: '#f59e0b',
                    error: '#f43f5e'
                },
                borders: {
                    light: '#5eead4',
                    medium: '#2dd4bf'
                }
            }
        },
        sunset: {
            name: 'Sunset Glow',
            colors: {
                primary: {
                    main: '#f97316',
                    hover: '#ea580c',
                    light: '#fed7aa'
                },
                backgrounds: {
                    main: '#fffbeb',
                    secondary: '#fef3c7',
                    hover: '#fde68a'
                },
                text: {
                    primary: '#78350f',
                    secondary: '#92400e',
                    muted: '#b45309'
                },
                status: {
                    success: '#65a30d',
                    warning: '#eab308',
                    error: '#dc2626'
                },
                borders: {
                    light: '#fde047',
                    medium: '#facc15'
                }
            }
        }
    };

    class ThemeEditor {
        constructor() {
            this.currentColors = JSON.parse(JSON.stringify(defaultColors));
            this.customPresets = {};
            this.history = [];
            this.historyIndex = -1;
            this.maxHistorySize = 50;
            this.eyedropperActive = false;
            this.selectedColorTarget = null;
            this.hasEyeDropperAPI = 'EyeDropper' in window;
            this.themeHistory = []; // Initialize to prevent TypeError
            
            this.init();
        }

        async init() {
            // Load saved theme and data
            await this.loadSavedTheme();
            await this.loadCustomPresets();
            await this.loadThemeHistory();
            
            // Initialize UI
            this.setupColorInputs();
            this.setupButtons();
            this.setupEyedropper();
            this.renderPresets();
            this.renderHistory();
            this.injectStyles();
            
            // Save initial state to history after all loading is complete
            // This creates the first history entry
            this.saveToHistory();
            
            // Listen for keyboard shortcuts
            document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        }

        setupColorInputs() {
            // Setup all color inputs
            document.querySelectorAll('.color-input').forEach(input => {
                const category = input.dataset.category;
                const key = input.dataset.key;
                
                // Set initial values
                if (this.currentColors[category] && this.currentColors[category][key]) {
                    const color = this.currentColors[category][key];
                    input.value = color;
                    const hexInput = document.getElementById(`${category}-${key}-hex`);
                    if (hexInput) {
                        hexInput.value = color;
                    }
                } else {
                    console.warn(`Missing color value for ${category}.${key}`);
                }
                
                // Add change listener
                input.addEventListener('input', (e) => {
                    this.updateColor(category, key, e.target.value);
                });
            });
            
            // Setup hex inputs
            document.querySelectorAll('.color-hex').forEach(input => {
                input.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-F]{6}$/i.test(value)) {
                        const id = input.id.replace('-hex', '');
                        const colorInput = document.getElementById(id);
                        const category = colorInput.dataset.category;
                        const key = colorInput.dataset.key;
                        colorInput.value = value;
                        this.updateColor(category, key, value);
                    }
                });
            });
            
            // Setup pick buttons
            document.querySelectorAll('.pick-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = btn.dataset.target;
                    const input = document.getElementById(targetId);
                    if (input) {
                        this.selectedColorTarget = {
                            category: input.dataset.category,
                            key: input.dataset.key,
                            inputId: targetId
                        };
                        console.log('Pick button clicked for:', this.selectedColorTarget);
                        this.startEyedropper();
                    } else {
                        console.error('Target input not found:', targetId);
                    }
                });
            });
        }

        setupButtons() {
            // Save theme button
            document.getElementById('saveThemeBtn').addEventListener('click', () => {
                this.saveTheme();
            });
            
            // Export button
            document.getElementById('exportBtn').addEventListener('click', () => {
                this.exportTheme();
            });
            
            // Import button
            document.getElementById('importBtn').addEventListener('click', () => {
                document.getElementById('importFileInput').click();
            });
            
            // Import file input
            document.getElementById('importFileInput').addEventListener('change', (e) => {
                this.handleImport(e);
            });
            
            // Reset button
            document.getElementById('resetBtn').addEventListener('click', () => {
                if (confirm('Reset all colors to default? This cannot be undone.')) {
                    this.resetTheme();
                }
            });
            
            // Undo/Redo buttons
            document.getElementById('undoBtn').addEventListener('click', () => {
                this.undo();
            });
            
            document.getElementById('redoBtn').addEventListener('click', () => {
                this.redo();
            });
            
            // Save preset button
            document.getElementById('savePresetBtn').addEventListener('click', () => {
                this.saveAsPreset();
            });
            
            // Preset name input enter key
            document.getElementById('presetNameInput').addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.saveAsPreset();
                }
            });
        }

        setupEyedropper() {
            const overlay = document.getElementById('colorPickerOverlay');
            const tooltip = document.getElementById('colorPreviewTooltip');
            const indicator = document.getElementById('eyedropperIndicator');
            
            overlay.addEventListener('click', (e) => {
                if (this.eyedropperActive) {
                    this.pickColorFromElement(e);
                }
            });
            
            overlay.addEventListener('mousemove', (e) => {
                if (this.eyedropperActive) {
                    // Update tooltip position and color
                    tooltip.style.left = (e.pageX + 20) + 'px';
                    tooltip.style.top = (e.pageY - 40) + 'px';
                }
            });
        }

        handleKeyboard(e) {
            // ESC to cancel eyedropper
            if (e.key === 'Escape' && this.eyedropperActive) {
                this.stopEyedropper();
            }
            
            // Ctrl/Cmd + Z for undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            
            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z for redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }
        }

        updateColor(category, key, value, skipHistory = false) {
            // Validate color
            if (!/^#[0-9A-F]{6}$/i.test(value)) {
                return;
            }
            
            // Check if the color actually changed
            const oldValue = this.currentColors[category]?.[key];
            if (oldValue === value) {
                return; // No change, don't update history
            }
            
            // Save to history before changing
            if (!skipHistory) {
                this.saveToHistory();
            }
            
            // Update color
            if (!this.currentColors[category]) {
                this.currentColors[category] = {};
            }
            this.currentColors[category][key] = value;
            
            // Update UI
            document.getElementById(`${category}-${key}`).value = value;
            document.getElementById(`${category}-${key}-hex`).value = value;
            
            // Generate smart defaults for primary color
            if (!skipHistory && category === 'primary' && key === 'main') {
                this.generateSmartDefaults(value);
            }
            
            // Apply styles
            this.injectStyles();
        }

        generateSmartDefaults(mainColor) {
            // Parse the main color
            const r = parseInt(mainColor.slice(1, 3), 16);
            const g = parseInt(mainColor.slice(3, 5), 16);
            const b = parseInt(mainColor.slice(5, 7), 16);
            
            // Generate hover (darker)
            const hover = '#' + 
                Math.max(0, r - 30).toString(16).padStart(2, '0') +
                Math.max(0, g - 30).toString(16).padStart(2, '0') +
                Math.max(0, b - 30).toString(16).padStart(2, '0');
            
            // Generate light (lighter)
            const light = '#' + 
                Math.min(255, r + 100).toString(16).padStart(2, '0') +
                Math.min(255, g + 100).toString(16).padStart(2, '0') +
                Math.min(255, b + 100).toString(16).padStart(2, '0');
            
            // Apply smart defaults
            this.updateColor('primary', 'hover', hover, true);
            this.updateColor('primary', 'light', light, true);
        }

        saveToHistory() {
            // Remove any states after current index
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            
            // Add current state
            const currentState = JSON.parse(JSON.stringify(this.currentColors));
            this.history.push(currentState);
            
            // Limit history size
            if (this.history.length > this.maxHistorySize) {
                this.history.shift();
            } else {
                this.historyIndex++;
            }
            
            // Update undo/redo buttons
            this.updateUndoRedoButtons();
        }

        undo() {
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.currentColors = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
                this.applyColorsToUI();
                this.injectStyles();
                this.updateUndoRedoButtons();
            }
        }

        redo() {
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                this.currentColors = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
                this.applyColorsToUI();
                this.injectStyles();
                this.updateUndoRedoButtons();
            }
        }

        updateUndoRedoButtons() {
            document.getElementById('undoBtn').disabled = this.historyIndex <= 0;
            document.getElementById('redoBtn').disabled = this.historyIndex >= this.history.length - 1;
        }

        applyColorsToUI() {
            // Update all color inputs with current colors
            Object.entries(this.currentColors).forEach(([category, colors]) => {
                Object.entries(colors).forEach(([key, value]) => {
                    const input = document.getElementById(`${category}-${key}`);
                    const hexInput = document.getElementById(`${category}-${key}-hex`);
                    if (input && hexInput) {
                        input.value = value;
                        hexInput.value = value;
                    }
                });
            });
        }

        injectStyles() {
            const iframe = document.getElementById('preview-frame');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            
            // Remove existing custom style
            const existingStyle = iframeDoc.getElementById('custom-theme');
            if (existingStyle) {
                existingStyle.remove();
            }
            
            // Create CSS from colors
            const css = this.generateCSS();
            
            // Inject new style
            const style = iframeDoc.createElement('style');
            style.id = 'custom-theme';
            style.textContent = css;
            iframeDoc.head.appendChild(style);
        }

        generateCSS() {
            let css = ':root {\n';
            
            // Convert nested colors to CSS variables
            Object.entries(this.currentColors).forEach(([category, colors]) => {
                Object.entries(colors).forEach(([key, value]) => {
                    css += `  --color-${category}-${key}: ${value};\n`;
                });
            });
            
            css += '}\n\n';
            
            // Add component-specific styles that use the variables
            css += `
/* Apply theme colors to components */
.comment-section {
    background-color: var(--color-backgrounds-main);
    color: var(--color-text-primary);
}

.comment {
    background-color: var(--color-backgrounds-secondary);
    border-color: var(--color-borders-light);
}

.comment:hover {
    background-color: var(--color-backgrounds-hover);
}

.comment-author {
    color: var(--color-text-primary);
}

.comment-time {
    color: var(--color-text-muted);
}

.comment-content {
    color: var(--color-text-primary);
}

.btn-primary, .submit-button {
    background-color: var(--color-primary-main);
    color: white;
}

.btn-primary:hover, .submit-button:hover {
    background-color: var(--color-primary-hover);
}

.comment-input, textarea {
    background-color: var(--color-backgrounds-main);
    border-color: var(--color-borders-medium);
    color: var(--color-text-primary);
}

.comment-input:focus, textarea:focus {
    border-color: var(--color-primary-main);
}

.success-message {
    color: var(--color-status-success);
}

.warning-message {
    color: var(--color-status-warning);
}

.error-message {
    color: var(--color-status-error);
}

.moderation-panel {
    background-color: var(--color-backgrounds-secondary);
    border-color: var(--color-borders-medium);
}

.badge {
    background-color: var(--color-primary-light);
    color: var(--color-primary-main);
}

/* Theme-aware utility classes */
.bg-main { background-color: var(--color-backgrounds-main); }
.bg-secondary { background-color: var(--color-backgrounds-secondary); }
.bg-hover { background-color: var(--color-backgrounds-hover); }
.bg-error { background-color: var(--color-status-error); }
.bg-success { background-color: var(--color-status-success); }
.bg-warning { background-color: var(--color-status-warning); }
.bg-primary { background-color: var(--color-primary-main); }

.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-muted { color: var(--color-text-muted); }
.text-inverse { color: var(--color-text-inverse); }
.text-error { color: var(--color-status-error); }
.text-success { color: var(--color-status-success); }
.text-warning { color: var(--color-status-warning); }
.text-link { color: var(--color-primary-main); }

.border-light { border-color: var(--color-borders-light); }
.border-medium { border-color: var(--color-borders-medium); }

/* Component styles */
.page-container {
    background-color: var(--color-backgrounds-secondary);
    color: var(--color-text-primary);
}

.card {
    background-color: var(--color-backgrounds-main);
    border: 1px solid var(--color-borders-light);
    border-radius: 8px;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.notification-success {
    background-color: var(--color-status-success);
    color: var(--color-text-inverse);
}

.notification-error {
    background-color: var(--color-status-error);
    color: var(--color-text-inverse);
}

.notification-warning {
    background-color: var(--color-status-warning);
    color: var(--color-text-inverse);
}`;
            
            return css;
        }

        async startEyedropper() {
            // Try native EyeDropper API first
            if (this.hasEyeDropperAPI) {
                try {
                    const eyeDropper = new window.EyeDropper();
                    const result = await eyeDropper.open();
                    const hexColor = result.sRGBHex;
                    
                    if (this.selectedColorTarget) {
                        const { category, key } = this.selectedColorTarget;
                        this.updateColor(category, key, hexColor);
                    }
                    return;
                } catch (e) {
                    // User canceled or error occurred
                    console.log('EyeDropper canceled or not supported');
                }
            }
            
            // Fallback to iframe picker
            this.eyedropperActive = true;
            document.getElementById('colorPickerOverlay').style.display = 'block';
            document.getElementById('eyedropperIndicator').style.display = 'block';
            document.getElementById('colorPreviewTooltip').style.display = 'block';
            
            // Change cursor for iframe
            const iframe = document.getElementById('preview-frame');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.body.style.cursor = 'crosshair';
        }

        stopEyedropper() {
            this.eyedropperActive = false;
            document.getElementById('colorPickerOverlay').style.display = 'none';
            document.getElementById('eyedropperIndicator').style.display = 'none';
            document.getElementById('colorPreviewTooltip').style.display = 'none';
            
            // Reset cursor
            const iframe = document.getElementById('preview-frame');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.body.style.cursor = '';
        }

        pickColorFromElement(e) {
            const iframe = document.getElementById('preview-frame');
            const rect = iframe.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const element = iframeDoc.elementFromPoint(x, y);
            
            if (element) {
                const computedStyle = iframe.contentWindow.getComputedStyle(element);
                
                // Determine which color to pick based on element
                let color = computedStyle.backgroundColor;
                if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
                    color = computedStyle.color;
                }
                
                const hexColor = this.rgbToHex(color);
                
                if (this.selectedColorTarget) {
                    const { category, key } = this.selectedColorTarget;
                    this.updateColor(category, key, hexColor);
                }
                
                this.stopEyedropper();
            }
        }

        rgbToHex(rgb) {
            const result = rgb.match(/\d+/g);
            if (!result) return '#000000';
            return '#' + result.slice(0, 3).map(x => {
                const hex = parseInt(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
        }

        renderPresets() {
            const presetList = document.getElementById('presetList');
            presetList.innerHTML = '';
            
            // Render built-in presets
            Object.entries(builtInPresets).forEach(([id, preset]) => {
                const item = this.createPresetItem(id, preset.name, preset.colors, true);
                presetList.appendChild(item);
            });
            
            // Render custom presets
            Object.entries(this.customPresets).forEach(([id, preset]) => {
                const item = this.createPresetItem(id, preset.name, preset.colors, false);
                presetList.appendChild(item);
            });
        }

        createPresetItem(id, name, colors, isBuiltIn) {
            const div = document.createElement('div');
            div.className = 'preset-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'preset-name';
            nameSpan.textContent = name;
            
            const colorsDiv = document.createElement('div');
            colorsDiv.className = 'preset-colors';
            
            // Show key colors
            const keyColors = [
                colors.primary?.main,
                colors.backgrounds?.main,
                colors.text?.primary
            ];
            
            keyColors.forEach(color => {
                if (color) {
                    const chip = document.createElement('div');
                    chip.className = 'preset-color-chip';
                    chip.style.backgroundColor = color;
                    colorsDiv.appendChild(chip);
                }
            });
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'preset-actions';
            
            const applyBtn = document.createElement('button');
            applyBtn.className = 'btn-secondary';
            applyBtn.textContent = 'Apply';
            applyBtn.style.fontSize = '12px';
            applyBtn.style.padding = '4px 12px';
            applyBtn.addEventListener('click', () => {
                this.loadPreset(colors);
            });
            actionsDiv.appendChild(applyBtn);
            
            if (!isBuiltIn) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-secondary';
                deleteBtn.textContent = 'Delete';
                deleteBtn.style.fontSize = '12px';
                deleteBtn.style.padding = '4px 12px';
                deleteBtn.style.marginLeft = '5px';
                deleteBtn.addEventListener('click', () => {
                    this.deletePreset(id);
                });
                actionsDiv.appendChild(deleteBtn);
            }
            
            div.appendChild(nameSpan);
            div.appendChild(colorsDiv);
            div.appendChild(actionsDiv);
            
            return div;
        }

        loadPreset(colors) {
            this.saveToHistory();
            this.currentColors = JSON.parse(JSON.stringify(colors));
            this.applyColorsToUI();
            this.injectStyles();
        }

        async saveAsPreset() {
            const nameInput = document.getElementById('presetNameInput');
            const name = nameInput.value.trim();
            
            if (!name) {
                alert('Please enter a preset name');
                return;
            }
            
            const id = name.toLowerCase().replace(/\s+/g, '-');
            this.customPresets[id] = {
                name: name,
                colors: JSON.parse(JSON.stringify(this.currentColors))
            };
            
            await this.saveCustomPresets();
            this.renderPresets();
            nameInput.value = '';
            
            alert(`Theme "${name}" saved!`);
        }

        async deletePreset(id) {
            if (confirm(`Delete theme "${this.customPresets[id].name}"?`)) {
                delete this.customPresets[id];
                await this.saveCustomPresets();
                this.renderPresets();
            }
        }

        renderHistory() {
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            
            if (!this.themeHistory || this.themeHistory.length === 0) {
                historyList.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">No theme history yet</p>';
                return;
            }
            
            this.themeHistory.slice(0, 10).forEach((entry, index) => {
                const div = document.createElement('div');
                div.className = 'history-item';
                
                const infoDiv = document.createElement('div');
                infoDiv.className = 'history-info';
                
                const nameDiv = document.createElement('div');
                nameDiv.className = 'history-name';
                nameDiv.textContent = entry.name || 'Untitled';
                
                const timeDiv = document.createElement('div');
                timeDiv.className = 'history-time';
                timeDiv.textContent = this.formatRelativeTime(entry.timestamp);
                
                infoDiv.appendChild(nameDiv);
                infoDiv.appendChild(timeDiv);
                
                const colorsDiv = document.createElement('div');
                colorsDiv.className = 'preset-colors';
                
                // Show key colors
                const keyColors = [
                    entry.colors.primary?.main,
                    entry.colors.backgrounds?.main,
                    entry.colors.text?.primary
                ];
                
                keyColors.forEach(color => {
                    if (color) {
                        const chip = document.createElement('div');
                        chip.className = 'preset-color-chip';
                        chip.style.backgroundColor = color;
                        colorsDiv.appendChild(chip);
                    }
                });
                
                div.appendChild(infoDiv);
                div.appendChild(colorsDiv);
                
                div.addEventListener('click', () => {
                    this.loadFromHistory(index);
                });
                
                historyList.appendChild(div);
            });
        }

        loadFromHistory(index) {
            const entry = this.themeHistory[index];
            if (entry) {
                this.saveToHistory();
                this.currentColors = JSON.parse(JSON.stringify(entry.colors));
                this.applyColorsToUI();
                this.injectStyles();
            }
        }

        formatRelativeTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff/60000)} min ago`;
            if (diff < 86400000) return `${Math.floor(diff/3600000)} hours ago`;
            if (diff < 604800000) return `${Math.floor(diff/86400000)} days ago`;
            
            return date.toLocaleDateString();
        }

        async addToHistory(name = null) {
            const entry = {
                timestamp: new Date().toISOString(),
                name: name || `Theme at ${new Date().toLocaleTimeString()}`,
                colors: JSON.parse(JSON.stringify(this.currentColors))
            };
            
            this.themeHistory.unshift(entry);
            
            // Keep only last 20 entries
            if (this.themeHistory.length > 20) {
                this.themeHistory = this.themeHistory.slice(0, 20);
            }
            
            await this.saveThemeHistory();
            this.renderHistory();
        }

        async saveTheme() {
            try {
                // Add to history first
                await this.addToHistory('Saved Theme');
                
                // Get the API base URL from config or current origin
                const apiBase = window.CONFIG?.backendUrl || window.location.origin;
                
                const response = await fetch(`${apiBase}/api/theme`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        colors: this.currentColors,
                        css: this.generateCSS()
                    })
                });
                
                if (response.ok) {
                    alert('Theme saved and applied successfully!');
                } else {
                    alert('Failed to save theme. Make sure you are logged in as a super moderator.');
                }
            } catch (error) {
                console.error('Error saving theme:', error);
                alert('Error saving theme');
            }
        }

        exportTheme() {
            const exportData = {
                name: prompt('Theme name:', 'My Custom Theme') || 'Custom Theme',
                exportDate: new Date().toISOString(),
                colors: this.currentColors,
                css: this.generateCSS()
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `comment-theme-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        async handleImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                
                if (file.name.endsWith('.json')) {
                    const data = JSON.parse(text);
                    if (data.colors) {
                        this.saveToHistory();
                        this.currentColors = data.colors;
                        this.applyColorsToUI();
                        this.injectStyles();
                        alert(`Theme "${data.name || 'Imported'}" loaded successfully!`);
                    } else {
                        throw new Error('Invalid theme file');
                    }
                } else if (file.name.endsWith('.css')) {
                    // Parse CSS variables
                    const cssVars = this.parseCSSVariables(text);
                    if (Object.keys(cssVars).length > 0) {
                        this.applyParsedCSS(cssVars);
                        alert('CSS theme imported successfully!');
                    } else {
                        throw new Error('No CSS variables found');
                    }
                }
            } catch (error) {
                console.error('Import error:', error);
                alert('Failed to import theme: ' + error.message);
            }
            
            // Clear the input
            event.target.value = '';
        }

        parseCSSVariables(css) {
            const vars = {};
            const regex = /--color-([\w-]+):\s*([^;]+);/g;
            let match;
            
            while ((match = regex.exec(css)) !== null) {
                vars[match[1]] = match[2].trim();
            }
            
            return vars;
        }

        applyParsedCSS(vars) {
            this.saveToHistory();
            
            Object.entries(vars).forEach(([key, value]) => {
                const parts = key.split('-');
                if (parts.length >= 2) {
                    const category = parts[0];
                    const subkey = parts.slice(1).join('');
                    
                    if (!this.currentColors[category]) {
                        this.currentColors[category] = {};
                    }
                    
                    this.currentColors[category][subkey] = value;
                }
            });
            
            this.applyColorsToUI();
            this.injectStyles();
        }

        resetTheme() {
            this.currentColors = JSON.parse(JSON.stringify(defaultColors));
            this.applyColorsToUI();
            this.injectStyles();
            this.history = [];
            this.historyIndex = -1;
            this.saveToHistory();
            this.updateUndoRedoButtons();
        }

        async loadSavedTheme() {
            try {
                const apiBase = window.CONFIG?.backendUrl || window.location.origin;
                const response = await fetch(`${apiBase}/api/theme`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.colors) {
                        // Merge saved colors with defaults to ensure all properties exist
                        this.currentColors = this.mergeColors(defaultColors, data.colors);
                    }
                }
            } catch (error) {
                console.error('Error loading saved theme:', error);
            }
        }
        
        mergeColors(defaults, saved) {
            const merged = JSON.parse(JSON.stringify(defaults));
            
            // Deep merge saved colors into defaults
            Object.keys(saved).forEach(category => {
                if (merged[category]) {
                    Object.keys(saved[category]).forEach(key => {
                        if (saved[category][key]) {
                            merged[category][key] = saved[category][key];
                        }
                    });
                }
            });
            
            return merged;
        }

        async loadCustomPresets() {
            try {
                const apiBase = window.CONFIG?.backendUrl || window.location.origin;
                const response = await fetch(`${apiBase}/api/theme/presets`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    this.customPresets = data || {};
                }
            } catch (error) {
                console.error('Error loading presets:', error);
            }
        }

        async saveCustomPresets() {
            try {
                const apiBase = window.CONFIG?.backendUrl || window.location.origin;
                const response = await fetch(`${apiBase}/api/theme/presets`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(this.customPresets)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to save presets');
                }
            } catch (error) {
                console.error('Error saving presets:', error);
            }
        }

        async loadThemeHistory() {
            try {
                const apiBase = window.CONFIG?.backendUrl || window.location.origin;
                const response = await fetch(`${apiBase}/api/theme/history`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    this.themeHistory = data || [];
                }
            } catch (error) {
                console.error('Error loading history:', error);
            }
        }

        async saveThemeHistory() {
            try {
                const apiBase = window.CONFIG?.backendUrl || window.location.origin;
                const response = await fetch(`${apiBase}/api/theme/history`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(this.themeHistory)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to save history');
                }
            } catch (error) {
                console.error('Error saving history:', error);
            }
        }
    }

    // Initialize theme editor when DOM is ready and config is loaded
    function initializeThemeEditor() {
        // Wait for config to be loaded
        if (window.CONFIG && window.CONFIG.backendUrl) {
            new ThemeEditor();
        } else {
            // Retry after a short delay
            setTimeout(initializeThemeEditor, 100);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeThemeEditor);
    } else {
        initializeThemeEditor();
    }
})();