// Theme Editor - Complete Rewrite
document.addEventListener('DOMContentLoaded', function() {
    // Theme configuration
    const themes = {
        default: {
            name: 'Default Light',
            primary: { main: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
            backgrounds: { main: '#ffffff', secondary: '#f3f4f6', hover: '#f9fafb' },
            text: { primary: '#111827', secondary: '#6b7280', muted: '#9ca3af', inverse: '#ffffff' },
            status: { success: '#10b981', warning: '#f59e0b', error: '#ef4444' },
            borders: { light: '#e5e7eb', medium: '#d1d5db' }
        },
        dark: {
            name: 'Dark Mode',
            primary: { main: '#8b5cf6', hover: '#7c3aed', light: '#a78bfa' },
            backgrounds: { main: '#0f0f23', secondary: '#1a1a2e', hover: '#16213e' },
            text: { primary: '#eef2ff', secondary: '#c7d2fe', muted: '#a5b4fc', inverse: '#0f0f23' },
            status: { success: '#4ade80', warning: '#fbbf24', error: '#f87171' },
            borders: { light: '#1e293b', medium: '#334155' }
        },
        ocean: {
            name: 'Ocean Theme',
            primary: { main: '#0891b2', hover: '#0e7490', light: '#67e8f9' },
            backgrounds: { main: '#f0fdfa', secondary: '#ccfbf1', hover: '#99f6e4' },
            text: { primary: '#134e4a', secondary: '#0f766e', muted: '#14b8a6', inverse: '#ffffff' },
            status: { success: '#10b981', warning: '#f59e0b', error: '#f43f5e' },
            borders: { light: '#5eead4', medium: '#2dd4bf' }
        }
    };

    // Current theme state
    let currentTheme = JSON.parse(JSON.stringify(themes.default));
    let history = [];
    let historyIndex = -1;

    // Initialize everything
    function init() {
        loadCurrentTheme();
        setupColorInputs();
        setupPresets();
        setupButtons();
        updatePreviewStyles();
    }

    // Load theme from API or use default
    async function loadCurrentTheme() {
        try {
            const response = await fetch('/api/theme', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.colors) {
                    // Merge saved colors into current theme
                    Object.keys(data.colors).forEach(category => {
                        if (currentTheme[category]) {
                            Object.assign(currentTheme[category], data.colors[category]);
                        }
                    });
                }
            }
        } catch (e) {
            console.log('Using default theme');
        }
        
        // Update all inputs with current theme
        updateAllInputs();
    }

    // Setup color inputs
    function setupColorInputs() {
        // For each color input
        document.querySelectorAll('.color-input').forEach(input => {
            const category = input.dataset.category;
            const key = input.dataset.key;
            
            // Set value from current theme
            if (currentTheme[category] && currentTheme[category][key]) {
                input.value = currentTheme[category][key];
            }
            
            // Handle color changes
            input.addEventListener('input', function(e) {
                handleColorChange(category, key, e.target.value);
            });
        });
        
        // For each hex input
        document.querySelectorAll('.color-hex').forEach(input => {
            input.addEventListener('input', function(e) {
                const value = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    const id = input.id.replace('-hex', '');
                    const colorInput = document.getElementById(id);
                    if (colorInput) {
                        colorInput.value = value;
                        const category = colorInput.dataset.category;
                        const key = colorInput.dataset.key;
                        handleColorChange(category, key, value);
                    }
                }
            });
        });
        
        // Setup pick buttons
        document.querySelectorAll('.pick-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = btn.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    input.click();
                }
            });
        });
    }

    // Handle color changes
    function handleColorChange(category, key, value) {
        if (!currentTheme[category]) {
            currentTheme[category] = {};
        }
        
        // Save to history
        saveHistory();
        
        // Update theme
        currentTheme[category][key] = value;
        
        // Update hex input
        const hexInput = document.getElementById(`${category}-${key}-hex`);
        if (hexInput) {
            hexInput.value = value;
        }
        
        // Update preview
        updatePreviewStyles();
    }

    // Setup preset buttons
    function setupPresets() {
        const presetList = document.getElementById('presetList');
        if (!presetList) return;
        
        presetList.innerHTML = '';
        
        // Add preset items
        Object.keys(themes).forEach(key => {
            const theme = themes[key];
            const item = document.createElement('div');
            item.className = 'preset-item';
            item.innerHTML = `
                <span class="preset-name">${theme.name}</span>
                <div class="preset-colors">
                    <span class="preset-color-chip" style="background: ${theme.primary.main}"></span>
                    <span class="preset-color-chip" style="background: ${theme.backgrounds.main}"></span>
                    <span class="preset-color-chip" style="background: ${theme.text.primary}"></span>
                </div>
            `;
            
            item.addEventListener('click', function() {
                applyTheme(theme);
            });
            
            presetList.appendChild(item);
        });
    }

    // Apply a theme
    function applyTheme(theme) {
        saveHistory();
        currentTheme = JSON.parse(JSON.stringify(theme));
        delete currentTheme.name; // Remove name property
        updateAllInputs();
        updatePreviewStyles();
    }

    // Update all inputs from current theme
    function updateAllInputs() {
        document.querySelectorAll('.color-input').forEach(input => {
            const category = input.dataset.category;
            const key = input.dataset.key;
            
            if (currentTheme[category] && currentTheme[category][key]) {
                input.value = currentTheme[category][key];
                
                // Update hex input too
                const hexInput = document.getElementById(`${category}-${key}-hex`);
                if (hexInput) {
                    hexInput.value = currentTheme[category][key];
                }
            }
        });
    }

    // Setup action buttons
    function setupButtons() {
        // Save theme
        document.getElementById('saveThemeBtn')?.addEventListener('click', saveTheme);
        
        // Export
        document.getElementById('exportBtn')?.addEventListener('click', exportTheme);
        
        // Import
        document.getElementById('importBtn')?.addEventListener('click', function() {
            document.getElementById('importFileInput')?.click();
        });
        
        document.getElementById('importFileInput')?.addEventListener('change', importTheme);
        
        // Reset
        document.getElementById('resetBtn')?.addEventListener('click', function() {
            if (confirm('Reset to default theme?')) {
                applyTheme(themes.default);
            }
        });
        
        // Undo/Redo
        document.getElementById('undoBtn')?.addEventListener('click', undo);
        document.getElementById('redoBtn')?.addEventListener('click', redo);
        
        // Save preset
        document.getElementById('savePresetBtn')?.addEventListener('click', savePreset);
    }

    // Update preview iframe
    function updatePreviewStyles() {
        const iframe = document.getElementById('preview-frame');
        if (!iframe) return;
        
        // Wait for iframe to load
        if (iframe.contentDocument) {
            applyStylesToIframe();
        } else {
            iframe.addEventListener('load', applyStylesToIframe);
        }
    }

    function applyStylesToIframe() {
        const iframe = document.getElementById('preview-frame');
        if (!iframe || !iframe.contentDocument) return;
        
        const doc = iframe.contentDocument;
        let style = doc.getElementById('theme-preview-styles');
        
        if (!style) {
            style = doc.createElement('style');
            style.id = 'theme-preview-styles';
            doc.head.appendChild(style);
        }
        
        // Build CSS
        let css = ':root {\n';
        Object.keys(currentTheme).forEach(category => {
            Object.keys(currentTheme[category]).forEach(key => {
                css += `    --color-${category}-${key}: ${currentTheme[category][key]};\n`;
            });
        });
        css += '}\n';
        
        style.textContent = css;
    }

    // Save theme to server
    async function saveTheme() {
        try {
            const response = await fetch('/api/theme', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
                },
                body: JSON.stringify({ colors: currentTheme })
            });
            
            if (response.ok) {
                alert('Theme saved!');
            } else {
                alert('Failed to save theme');
            }
        } catch (e) {
            alert('Error saving theme');
        }
    }

    // Export theme
    function exportTheme() {
        const data = {
            colors: currentTheme,
            exported: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'theme.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // Import theme
    function importTheme(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = JSON.parse(event.target.result);
                if (data.colors) {
                    currentTheme = data.colors;
                    updateAllInputs();
                    updatePreviewStyles();
                    alert('Theme imported!');
                }
            } catch (err) {
                alert('Invalid theme file');
            }
        };
        reader.readAsText(file);
    }

    // History management
    function saveHistory() {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(JSON.parse(JSON.stringify(currentTheme)));
        historyIndex++;
        
        // Limit history
        if (history.length > 50) {
            history.shift();
            historyIndex--;
        }
        
        updateHistoryButtons();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            currentTheme = JSON.parse(JSON.stringify(history[historyIndex]));
            updateAllInputs();
            updatePreviewStyles();
            updateHistoryButtons();
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            currentTheme = JSON.parse(JSON.stringify(history[historyIndex]));
            updateAllInputs();
            updatePreviewStyles();
            updateHistoryButtons();
        }
    }

    function updateHistoryButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) undoBtn.disabled = historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
    }

    // Save preset
    function savePreset() {
        const input = document.getElementById('presetNameInput');
        const name = input?.value.trim();
        
        if (!name) {
            alert('Enter a preset name');
            return;
        }
        
        // For now, just alert - would save to server
        alert('Preset saved: ' + name);
        input.value = '';
    }

    // Start the app
    init();
});