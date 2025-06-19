// Theme editor features
const ThemeEditor = {
    // Theme presets
    presets: {
        light: {
            displayName: 'Light',
            primary: { main: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
            backgrounds: { main: '#ffffff', secondary: '#f3f4f6', hover: '#f9fafb' },
            text: { primary: '#111827', secondary: '#6b7280', muted: '#9ca3af' },
            borders: { main: '#e5e7eb', focus: '#3b82f6' },
            accents: { success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6' }
        },
        dark: {
            displayName: 'Dark',
            primary: { main: '#60a5fa', hover: '#3b82f6', light: '#1e3a8a' },
            backgrounds: { main: '#111827', secondary: '#1f2937', hover: '#374151' },
            text: { primary: '#f9fafb', secondary: '#d1d5db', muted: '#9ca3af' },
            borders: { main: '#374151', focus: '#60a5fa' },
            accents: { success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa' }
        },
        ocean: {
            displayName: 'Ocean',
            primary: { main: '#06b6d4', hover: '#0891b2', light: '#cffafe' },
            backgrounds: { main: '#ffffff', secondary: '#f0fdfa', hover: '#e6fffa' },
            text: { primary: '#134e4a', secondary: '#0f766e', muted: '#5eead4' },
            borders: { main: '#5eead4', focus: '#06b6d4' },
            accents: { success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#06b6d4' }
        }
    },

    // Load current theme
    async loadTheme(state) {
        if (!AppState.hasPermission(state, 'super_moderate')) return;
        
        try {
            const data = await API.theme.get();
            if (data && data.colors) {
                state.themeColors = data.colors;
                state.originalTheme = JSON.parse(JSON.stringify(data.colors));
                this.applyTheme(state.themeColors);
            }
            state.themeInitialized = true;
        } catch (error) {
            console.error('Error loading theme:', error);
            state.themeInitialized = true;
        }
    },

    // Apply theme colors
    applyTheme(colors) {
        if (!colors) return;
        
        // Ensure all required properties exist with defaults
        const themeColors = {
            primary: colors.primary || { main: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
            backgrounds: colors.backgrounds || { main: '#ffffff', secondary: '#f3f4f6', hover: '#f9fafb' },
            text: colors.text || { primary: '#111827', secondary: '#6b7280', muted: '#9ca3af' },
            borders: colors.borders || { main: '#e5e7eb', focus: '#3b82f6' },
            accents: colors.accents || { success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6' }
        };
        
        const styles = `
            :root {
                --primary-color: ${themeColors.primary.main};
                --primary-hover: ${themeColors.primary.hover};
                --primary-light: ${themeColors.primary.light};
                
                --bg-main: ${themeColors.backgrounds.main};
                --bg-secondary: ${themeColors.backgrounds.secondary};
                --bg-hover: ${themeColors.backgrounds.hover};
                
                --text-primary: ${themeColors.text.primary};
                --text-secondary: ${themeColors.text.secondary};
                --text-muted: ${themeColors.text.muted};
                
                --border-main: ${themeColors.borders.main};
                --border-focus: ${themeColors.borders.focus || themeColors.primary.main};
                
                --success: ${themeColors.accents.success};
                --warning: ${themeColors.accents.warning};
                --error: ${themeColors.accents.error};
                --info: ${themeColors.accents.info};
            }
        `;
        
        // Remove existing theme style
        const existingStyle = document.getElementById('dynamic-theme');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        // Add new theme style
        const styleElement = document.createElement('style');
        styleElement.id = 'dynamic-theme';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    },

    // Save theme
    async saveTheme(state) {
        if (!AppState.hasPermission(state, 'super_moderate')) return;
        
        try {
            await API.theme.save(state.themeColors);
            state.originalTheme = JSON.parse(JSON.stringify(state.themeColors));
            alert('Theme saved successfully!');
        } catch (error) {
            console.error('Error saving theme:', error);
            alert('Failed to save theme');
        }
    },

    // Apply preset
    applyPreset(state, presetName) {
        const preset = this.presets[presetName];
        if (preset) {
            state.themeColors = JSON.parse(JSON.stringify(preset));
            this.applyTheme(state.themeColors);
        }
    },

    // Update color
    updateColor(state, category, key, value) {
        if (!state.themeColors[category]) return;
        
        state.themeColors[category][key] = value;
        this.applyTheme(state.themeColors);
    },

    // Reset to original
    resetTheme(state) {
        if (state.originalTheme) {
            state.themeColors = JSON.parse(JSON.stringify(state.originalTheme));
            this.applyTheme(state.themeColors);
        }
    },

    // Export theme as JSON
    exportTheme(state) {
        const themeData = JSON.stringify(state.themeColors, null, 2);
        const blob = new Blob([themeData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `theme-${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    },

    // Import theme from JSON
    async importTheme(state, file) {
        try {
            const text = await file.text();
            const colors = JSON.parse(text);
            
            // Validate structure
            if (this.validateThemeStructure(colors)) {
                state.themeColors = colors;
                this.applyTheme(state.themeColors);
            } else {
                alert('Invalid theme file format');
            }
        } catch (error) {
            console.error('Error importing theme:', error);
            alert('Failed to import theme');
        }
    },

    // Validate theme structure
    validateThemeStructure(colors) {
        const requiredCategories = ['primary', 'backgrounds', 'text', 'borders', 'accents'];
        const requiredKeys = {
            primary: ['main', 'hover', 'light'],
            backgrounds: ['main', 'secondary', 'hover'],
            text: ['primary', 'secondary', 'muted'],
            borders: ['main', 'focus'],
            accents: ['success', 'warning', 'error', 'info']
        };
        
        for (const category of requiredCategories) {
            if (!colors[category]) return false;
            
            for (const key of requiredKeys[category]) {
                if (!colors[category][key]) return false;
            }
        }
        
        return true;
    },

    // Use eyedropper API if available
    async pickColor(state, category, key) {
        if ('EyeDropper' in window) {
            try {
                const eyeDropper = new EyeDropper();
                const result = await eyeDropper.open();
                this.updateColor(state, category, key, result.sRGBHex);
            } catch (error) {
                console.error('Error using eyedropper:', error);
            }
        } else {
            // Fallback to input color picker
            const input = document.createElement('input');
            input.type = 'color';
            input.value = state.themeColors[category][key];
            input.onchange = (e) => {
                this.updateColor(state, category, key, e.target.value);
            };
            input.click();
        }
    }
};