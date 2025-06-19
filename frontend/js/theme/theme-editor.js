// Theme editor functions
window.ThemeEditor = {
    // Initialize theme editor
    async initThemeEditor() {
        if (!this.user?.is_super_moderator) return;
        
        await this.loadTheme();
    },
    
    // Load current theme
    async loadTheme() {
        this.loadingTheme = true;
        try {
            const response = await fetch(`${API_URL}/api/theme`, {
                headers: window.ApiClient.getAuthHeaders()
            });
            
            if (response.ok) {
                const theme = await response.json();
                if (theme && theme.colors) {
                    this.themeColors = theme.colors;
                    this.applyTheme();
                }
            }
            this.themeLoaded = true;
        } catch (error) {
            console.error('Error loading theme:', error);
        } finally {
            this.loadingTheme = false;
        }
    },
    
    // Apply theme to CSS variables
    applyTheme() {
        const root = document.documentElement;
        
        // Apply primary colors
        root.style.setProperty('--primary-color', this.themeColors.primary.main);
        root.style.setProperty('--primary-hover', this.themeColors.primary.hover);
        root.style.setProperty('--primary-light', this.themeColors.primary.light);
        
        // Apply background colors
        root.style.setProperty('--bg-main', this.themeColors.backgrounds.main);
        root.style.setProperty('--bg-secondary', this.themeColors.backgrounds.secondary);
        root.style.setProperty('--bg-hover', this.themeColors.backgrounds.hover);
        
        // Apply text colors
        root.style.setProperty('--text-primary', this.themeColors.text.primary);
        root.style.setProperty('--text-secondary', this.themeColors.text.secondary);
        root.style.setProperty('--text-muted', this.themeColors.text.muted);
        
        // Apply border colors
        root.style.setProperty('--border-light', this.themeColors.borders.light);
        root.style.setProperty('--border-medium', this.themeColors.borders.medium);
    },
    
    // Update color
    updateColor(category, key, value) {
        // Store previous value for undo
        this.lastColorChange = {
            category,
            key,
            oldValue: this.themeColors[category][key],
            newValue: value
        };
        
        this.themeColors[category][key] = value;
        this.applyTheme();
    },
    
    // Save theme
    async saveTheme() {
        try {
            const response = await fetch(`${API_URL}/api/theme`, {
                method: 'POST',
                headers: window.ApiClient.getAuthHeaders(),
                body: JSON.stringify({ colors: this.themeColors })
            });
            
            if (await window.ApiClient.handleAuthError(response)) return;
            
            alert('Theme saved successfully!');
        } catch (error) {
            console.error('Error saving theme:', error);
            alert('Failed to save theme');
        }
    },
    
    // Apply preset
    applyPreset(presetName) {
        const preset = this.themePresets[presetName];
        if (!preset) return;
        
        this.selectedPreset = presetName;
        this.themeColors = JSON.parse(JSON.stringify(preset.colors)); // Deep copy
        this.applyTheme();
    },
    
    // Export theme
    exportTheme() {
        const theme = {
            name: 'Custom Theme',
            colors: this.themeColors
        };
        
        const json = JSON.stringify(theme, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'theme.json';
        a.click();
        
        URL.revokeObjectURL(url);
    },
    
    // Import theme
    async importTheme(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const theme = JSON.parse(text);
            
            if (theme.colors) {
                this.themeColors = theme.colors;
                this.applyTheme();
                this.selectedPreset = 'custom';
            }
        } catch (error) {
            alert('Invalid theme file');
        }
        
        // Reset file input
        event.target.value = '';
    },
    
    // Undo last change
    undoColorChange() {
        if (!this.lastColorChange) return;
        
        const { category, key, oldValue } = this.lastColorChange;
        this.themeColors[category][key] = oldValue;
        this.applyTheme();
        this.lastColorChange = null;
    },
    
    // Open color picker
    openColorPicker(category, key) {
        this.selectedColorTarget = { category, key };
        // The actual color picker is handled by Alpine's x-model binding
    }
};