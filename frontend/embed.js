(function() {
  // Get configuration from script tag
  const script = document.currentScript;
  const instanceUrl = script.getAttribute('data-instance');
  const pageId = script.getAttribute('data-page-id');

  if (!instanceUrl || !pageId) {
    console.error('Open Comments: data-instance and data-page-id are required');
    return;
  }

  // Normalize instance URL (remove trailing slash if present)
  const normalizedInstanceUrl = instanceUrl.replace(/\/$/, '');

  // Color manipulation helper functions
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function darkenColor(color, amount = 0.2) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;

    const factor = 1 - amount;
    const r = Math.round(rgb.r * factor);
    const g = Math.round(rgb.g * factor);
    const b = Math.round(rgb.b * factor);

    return rgbToHex(r, g, b);
  }

  function lightenColor(color, amount = 0.2) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;

    const r = Math.round(rgb.r + (255 - rgb.r) * amount);
    const g = Math.round(rgb.g + (255 - rgb.g) * amount);
    const b = Math.round(rgb.b + (255 - rgb.b) * amount);

    return rgbToHex(r, g, b);
  }

  function getContrastColor(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return '#000000';

    // Calculate luminance
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  // Convert rgb(r,g,b) string to hex
  function rgbStringToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    if (rgb.startsWith('#')) return rgb;

    const values = rgb.match(/\d+/g);
    if (!values || values.length < 3) return null;

    return rgbToHex(parseInt(values[0]), parseInt(values[1]), parseInt(values[2]));
  }

  // Theme detection functions
  function detectMadaraTheme() {
    const madaraIndicators = [
      document.querySelector('.wp-manga'),
      document.querySelector('.manga-page'),
      document.querySelector('.c-blog__heading'),
      document.querySelector('.c-breadcrumb'),
      document.querySelector('.manga_content'),
      document.body.classList.contains('manga'),
      document.querySelector('meta[name="generator"]')?.content?.includes('Madara')
    ];

    return madaraIndicators.some(indicator => !!indicator);
  }

  function detectMadaraColors() {
    const computedStyle = window.getComputedStyle(document.documentElement);
    const bodyStyle = window.getComputedStyle(document.body);

    // Madara theme commonly uses these selectors
    const primaryButton = document.querySelector('.btn-primary, .c-btn, .btn-read-manga');
    const header = document.querySelector('.c-header, .site-header, .manga-header');
    const bodyBg = document.querySelector('.site-content, .c-page-content, .body-wrap');

    // Extract colors from Madara elements
    let primaryColor = null;
    if (primaryButton) {
      primaryColor = rgbStringToHex(window.getComputedStyle(primaryButton).backgroundColor);
    }
    if (!primaryColor) {
      primaryColor = computedStyle.getPropertyValue('--primary-color')?.trim() || '#5f25a6';
    }

    let headerBg = null;
    if (header) {
      headerBg = rgbStringToHex(window.getComputedStyle(header).backgroundColor);
    }
    if (!headerBg) {
      headerBg = '#222222';
    }

    let contentBg = null;
    if (bodyBg) {
      contentBg = rgbStringToHex(window.getComputedStyle(bodyBg).backgroundColor);
    }
    if (!contentBg) {
      contentBg = rgbStringToHex(bodyStyle.backgroundColor) || '#ffffff';
    }

    const textColor = rgbStringToHex(bodyStyle.color) || '#333333';

    // Check for dark mode in Madara
    const isDarkMode = document.body.classList.contains('dark-mode') ||
                       document.documentElement.classList.contains('dark');

    return {
      primary: {
        main: primaryColor,
        hover: darkenColor(primaryColor, 0.1),
        light: lightenColor(primaryColor, 0.4)
      },
      backgrounds: {
        main: contentBg || (isDarkMode ? '#1a1a1a' : '#ffffff'),
        secondary: isDarkMode ? '#2a2a2a' : '#f7f8f9',
        hover: isDarkMode ? '#333333' : '#f0f0f0'
      },
      text: {
        primary: textColor || (isDarkMode ? '#e0e0e0' : '#333333'),
        secondary: isDarkMode ? '#b0b0b0' : '#666666',
        muted: isDarkMode ? '#808080' : '#999999',
        inverse: getContrastColor(textColor || '#333333')
      },
      borders: {
        light: isDarkMode ? '#404040' : '#e0e0e0',
        medium: isDarkMode ? '#555555' : '#cccccc'
      },
      metadata: {
        theme: 'madara',
        darkMode: isDarkMode
      }
    };
  }

  function detectGenericTheme() {
    const computedStyle = window.getComputedStyle(document.documentElement);
    const bodyStyle = window.getComputedStyle(document.body);

    // Try common WordPress theme CSS variables
    const cssVarTheme = {
      primaryMain: computedStyle.getPropertyValue('--wp--preset--color--primary')?.trim() ||
                   computedStyle.getPropertyValue('--color-primary')?.trim() ||
                   computedStyle.getPropertyValue('--primary-color')?.trim(),
      backgroundColor: computedStyle.getPropertyValue('--wp--preset--color--background')?.trim() ||
                       computedStyle.getPropertyValue('--background-color')?.trim(),
      textColor: computedStyle.getPropertyValue('--wp--preset--color--foreground')?.trim() ||
                 computedStyle.getPropertyValue('--text-color')?.trim()
    };

    const bgColor = rgbStringToHex(bodyStyle.backgroundColor) || '#ffffff';
    const textColor = rgbStringToHex(bodyStyle.color) || '#111827';

    return {
      primary: {
        main: cssVarTheme.primaryMain || '#3b82f6',
        hover: darkenColor(cssVarTheme.primaryMain || '#3b82f6'),
        light: lightenColor(cssVarTheme.primaryMain || '#3b82f6', 0.4)
      },
      backgrounds: {
        main: cssVarTheme.backgroundColor || bgColor,
        secondary: lightenColor(bgColor, 0.05),
        hover: lightenColor(bgColor, 0.02)
      },
      text: {
        primary: cssVarTheme.textColor || textColor,
        secondary: lightenColor(textColor, 0.3),
        muted: lightenColor(textColor, 0.5),
        inverse: getContrastColor(textColor)
      },
      borders: {
        light: lightenColor(textColor, 0.8),
        medium: lightenColor(textColor, 0.7)
      },
      metadata: {
        theme: 'generic',
        darkMode: false
      }
    };
  }

  function detectParentTheme() {
    const isMadaraTheme = detectMadaraTheme();

    if (isMadaraTheme) {
      return detectMadaraColors();
    }

    return detectGenericTheme();
  }

  // Create container
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.minHeight = '400px';

  // Create iframe - use normalized URL with pageId as query parameter
  const iframe = document.createElement('iframe');
  iframe.src = `${normalizedInstanceUrl}/?pageId=${encodeURIComponent(pageId)}`;
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.style.minHeight = '400px';
  iframe.style.display = 'block';

  // Extract origin from instance URL for message validation
  const instanceOrigin = new URL(normalizedInstanceUrl).origin;

  // Handle messages
  window.addEventListener('message', (e) => {
    // Validate origin - accept both the instance URL origin and messages from the iframe
    if (e.origin === instanceOrigin || e.source === iframe.contentWindow) {
      if (e.data.type === 'resize' && e.data.pageId === pageId) {
        iframe.style.height = e.data.height + 'px';
      } else if (e.data.type === 'requestTheme') {
        // Send theme data when requested
        const parentTheme = detectParentTheme();
        iframe.contentWindow.postMessage({
          type: 'setTheme',
          pageId: pageId,
          theme: parentTheme
        }, normalizedInstanceUrl);
      }
    }
  });

  // Send initial theme after iframe loads
  iframe.addEventListener('load', () => {
    // Send initial theme
    const parentTheme = detectParentTheme();
    iframe.contentWindow.postMessage({
      type: 'setTheme',
      pageId: pageId,
      theme: parentTheme
    }, normalizedInstanceUrl);

    // Watch for theme changes (e.g., dark mode toggle)
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', () => {
        const updatedTheme = detectParentTheme();
        iframe.contentWindow.postMessage({
          type: 'setTheme',
          pageId: pageId,
          theme: updatedTheme
        }, normalizedInstanceUrl);
      });
    }

    // Observe attribute changes for theme switches
    const observer = new MutationObserver(() => {
      const updatedTheme = detectParentTheme();
      iframe.contentWindow.postMessage({
        type: 'setTheme',
        pageId: pageId,
        theme: updatedTheme
      }, normalizedInstanceUrl);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-mode']
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  // Insert after script tag
  container.appendChild(iframe);
  script.parentNode.insertBefore(container, script.nextSibling);
})();
