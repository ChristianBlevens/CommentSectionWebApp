// Theme Editor JavaScript - Clean Implementation
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
            muted: '#9ca3af',
            inverse: '#ffffff'
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
        default: {
            name: 'Default Theme',
            colors: JSON.parse(JSON.stringify(defaultColors))
        },
        dark: {
            name: 'Dark Mode',
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
                    muted: '#a5b4fc',
                    inverse: '#0f0f23'
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
                    muted: '#14b8a6',
                    inverse: '#ffffff'
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
        }
    };

    class ThemeEditor {
        constructor() {
            this.currentColors = JSON.parse(JSON.stringify(defaultColors));
            this.customPresets = {};
            this.history = [];
            this.historyIndex = -1;
            
            this.init();
        }

        async init() {
            // Load saved theme
            await this.loadSavedTheme();
            
            // Setup UI components
            this.setupColorInputs();
            this.setupButtons();
            this.renderPresets();
            
            // Apply initial styles
            this.updatePreview();
            
            // Wait for iframe to load
            const iframe = document.getElementById('preview-frame');
            if (iframe) {
                iframe.addEventListener('load', () => {
                    this.updatePreview();
                });
            }
        }

        async loadSavedTheme() {
            try {
                const token = localStorage.getItem('sessionToken');
                const response = await fetch('/api/theme', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.colors) {
                        // Merge with defaults to ensure all properties exist
                        Object.keys(data.colors).forEach(category => {
                            if (this.currentColors[category]) {
                                Object.keys(data.colors[category]).forEach(key => {
                                    if (data.colors[category][key]) {
                                        this.currentColors[category][key] = data.colors[category][key];
                                    }
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                console.log('No saved theme found, using defaults');
            }
        }

        setupColorInputs() {
            // Setup color inputs
            document.querySelectorAll('.color-input').forEach(input => {
                const category = input.dataset.category;
                const key = input.dataset.key;
                
                // Set initial value
                if (this.currentColors[category] && this.currentColors[category][key]) {
                    input.value = this.currentColors[category][key];
                    
                    // Update hex input
                    const hexInput = document.getElementById(`${category}-${key}-hex`);
                    if (hexInput) {
                        hexInput.value = this.currentColors[category][key];
                    }
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
                        if (colorInput) {
                            colorInput.value = value;
                            const category = colorInput.dataset.category;
                            const key = colorInput.dataset.key;
                            this.updateColor(category, key, value);
                        }
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
                        // Use native color picker
                        input.click();
                    }
                });
            });
        }

        setupButtons() {
            // Save theme
            const saveBtn = document.getElementById('saveThemeBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveTheme());
            }
            
            // Export
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportTheme());
            }
            
            // Import
            const importBtn = document.getElementById('importBtn');
            if (importBtn) {
                importBtn.addEventListener('click', () => {
                    document.getElementById('importFileInput').click();
                });
            }
            
            // Import file
            const importFile = document.getElementById('importFileInput');
            if (importFile) {
                importFile.addEventListener('change', (e) => this.importTheme(e));
            }
            
            // Reset
            const resetBtn = document.getElementById('resetBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    if (confirm('Reset all colors to default?')) {
                        this.resetTheme();
                    }
                });
            }
            
            // Undo/Redo
            const undoBtn = document.getElementById('undoBtn');
            if (undoBtn) {
                undoBtn.addEventListener('click', () => this.undo());
            }
            
            const redoBtn = document.getElementById('redoBtn');
            if (redoBtn) {
                redoBtn.addEventListener('click', () => this.redo());
            }
            
            // Save preset
            const savePresetBtn = document.getElementById('savePresetBtn');
            if (savePresetBtn) {
                savePresetBtn.addEventListener('click', () => this.saveAsPreset());
            }
        }

        updateColor(category, key, value) {
            if (!/^#[0-9A-F]{6}$/i.test(value)) return;
            
            // Save to history
            this.saveToHistory();
            
            // Update color
            this.currentColors[category][key] = value;
            
            // Update hex input
            const hexInput = document.getElementById(`${category}-${key}-hex`);
            if (hexInput && hexInput.value !== value) {
                hexInput.value = value;
            }
            
            // Update preview
            this.updatePreview();
        }

        updatePreview() {
            const iframe = document.getElementById('preview-frame');
            if (!iframe) return;
            
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc || !iframeDoc.head) {
                    // Iframe not ready yet
                    return;
                }
                
                // Remove existing style
                let style = iframeDoc.getElementById('theme-editor-preview');
                if (!style) {
                    style = iframeDoc.createElement('style');
                    style.id = 'theme-editor-preview';
                    iframeDoc.head.appendChild(style);
                }
                
                // Generate CSS
                let css = ':root {\n';
                Object.entries(this.currentColors).forEach(([category, colors]) => {
                    Object.entries(colors).forEach(([key, value]) => {
                        css += `    --color-${category}-${key}: ${value};\n`;
                    });
                });
                css += '}\n';
                
                style.textContent = css;
            } catch (error) {
                // Cross-origin or other error, ignore
            }
        }

        renderPresets() {
            const presetList = document.getElementById('presetList');
            if (!presetList) return;
            
            presetList.innerHTML = '';
            
            // Render built-in presets
            Object.entries(builtInPresets).forEach(([id, preset]) => {
                const div = document.createElement('div');
                div.className = 'preset-item';
                div.innerHTML = `
                    <span class="preset-name">${preset.name}</span>
                    <div class="preset-colors">
                        <span class="preset-color-chip" style="background: ${preset.colors.primary.main}"></span>
                        <span class="preset-color-chip" style="background: ${preset.colors.backgrounds.main}"></span>
                        <span class="preset-color-chip" style="background: ${preset.colors.text.primary}"></span>
                    </div>
                `;
                div.addEventListener('click', () => this.applyPreset(preset.colors));
                presetList.appendChild(div);
            });
            
            // Render custom presets
            Object.entries(this.customPresets).forEach(([id, preset]) => {
                const div = document.createElement('div');
                div.className = 'preset-item';
                div.innerHTML = `
                    <span class="preset-name">${preset.name}</span>
                    <div class="preset-colors">
                        <span class="preset-color-chip" style="background: ${preset.colors.primary.main}"></span>
                        <span class="preset-color-chip" style="background: ${preset.colors.backgrounds.main}"></span>
                        <span class="preset-color-chip" style="background: ${preset.colors.text.primary}"></span>
                    </div>
                `;
                div.addEventListener('click', () => this.applyPreset(preset.colors));
                presetList.appendChild(div);
            });
        }

        applyPreset(colors) {
            this.saveToHistory();
            this.currentColors = JSON.parse(JSON.stringify(colors));
            
            // Update all inputs
            document.querySelectorAll('.color-input').forEach(input => {
                const category = input.dataset.category;
                const key = input.dataset.key;
                if (this.currentColors[category] && this.currentColors[category][key]) {
                    input.value = this.currentColors[category][key];
                    const hexInput = document.getElementById(`${category}-${key}-hex`);
                    if (hexInput) {
                        hexInput.value = this.currentColors[category][key];
                    }
                }
            });
            
            this.updatePreview();
        }

        async saveTheme() {
            try {
                const token = localStorage.getItem('sessionToken');
                const response = await fetch('/api/theme', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ colors: this.currentColors })
                });
                
                if (response.ok) {
                    alert('Theme saved successfully!');
                } else {
                    alert('Failed to save theme');
                }
            } catch (error) {
                alert('Error saving theme: ' + error.message);
            }
        }

        exportTheme() {
            const data = {
                name: 'Custom Theme',
                colors: this.currentColors,
                exportDate: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'theme.json';
            a.click();
            URL.revokeObjectURL(url);
        }

        importTheme(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.colors) {
                        this.applyPreset(data.colors);
                        alert('Theme imported successfully!');
                    }
                } catch (error) {
                    alert('Invalid theme file');
                }
            };
            reader.readAsText(file);
        }

        resetTheme() {
            this.currentColors = JSON.parse(JSON.stringify(defaultColors));
            
            // Update all inputs
            document.querySelectorAll('.color-input').forEach(input => {
                const category = input.dataset.category;
                const key = input.dataset.key;
                if (this.currentColors[category] && this.currentColors[category][key]) {
                    input.value = this.currentColors[category][key];
                    const hexInput = document.getElementById(`${category}-${key}-hex`);
                    if (hexInput) {
                        hexInput.value = this.currentColors[category][key];
                    }
                }
            });
            
            this.updatePreview();
            this.history = [];
            this.historyIndex = -1;
            this.updateUndoRedoButtons();
        }

        saveToHistory() {
            // Limit history
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            
            this.history.push(JSON.parse(JSON.stringify(this.currentColors)));
            if (this.history.length > 50) {
                this.history.shift();
            } else {
                this.historyIndex++;
            }
            
            this.updateUndoRedoButtons();
        }

        undo() {
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.applyHistoryState();
            }
        }

        redo() {
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                this.applyHistoryState();
            }
        }

        applyHistoryState() {
            this.currentColors = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            
            // Update all inputs
            document.querySelectorAll('.color-input').forEach(input => {
                const category = input.dataset.category;
                const key = input.dataset.key;
                if (this.currentColors[category] && this.currentColors[category][key]) {
                    input.value = this.currentColors[category][key];
                    const hexInput = document.getElementById(`${category}-${key}-hex`);
                    if (hexInput) {
                        hexInput.value = this.currentColors[category][key];
                    }
                }
            });
            
            this.updatePreview();
            this.updateUndoRedoButtons();
        }

        updateUndoRedoButtons() {
            const undoBtn = document.getElementById('undoBtn');
            const redoBtn = document.getElementById('redoBtn');
            
            if (undoBtn) {
                undoBtn.disabled = this.historyIndex <= 0;
            }
            
            if (redoBtn) {
                redoBtn.disabled = this.historyIndex >= this.history.length - 1;
            }
        }

        saveAsPreset() {
            const input = document.getElementById('presetNameInput');
            const name = input.value.trim();
            
            if (!name) {
                alert('Please enter a preset name');
                return;
            }
            
            const id = 'custom_' + Date.now();
            this.customPresets[id] = {
                name: name,
                colors: JSON.parse(JSON.stringify(this.currentColors))
            };
            
            // Save to server
            this.saveCustomPresets();
            
            // Re-render presets
            this.renderPresets();
            
            // Clear input
            input.value = '';
        }

        async saveCustomPresets() {
            try {
                const token = localStorage.getItem('sessionToken');
                await fetch('/api/theme/presets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(this.customPresets)
                });
            } catch (error) {
                console.error('Error saving custom presets:', error);
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.themeEditor = new ThemeEditor();
        });
    } else {
        window.themeEditor = new ThemeEditor();
    }
})();