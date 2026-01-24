// =============================================================================
// base-path.js - Base Path Configuration
// =============================================================================
// This file MUST be loaded before all other scripts.
// It provides the BASE_PATH constant used for all API calls and routing.
//
// For embedded usage, the path is auto-detected from the script location.
// For direct access, it defaults to '/comments' or can be overridden.
// =============================================================================

(function() {
    'use strict';

    // Detect if we're being loaded in an iframe (embedded mode)
    const isEmbedded = window.self !== window.top;

    // Try to detect base path from current URL
    function detectBasePath() {
        const path = window.location.pathname;

        // Check if we're at /comments or /comments/...
        if (path.startsWith('/comments')) {
            return '/comments';
        }

        // If we're at root or root with query params (like ?pageId=xxx),
        // this means we're either:
        // 1. In development running at root
        // 2. An old embed that hasn't been redirected yet
        // In either case, return empty string for root-relative paths
        if (path === '/' || path === '/index.html' || path.startsWith('/oauth-callback')) {
            return '';
        }

        // Default to /comments for any other path (production)
        return '/comments';
    }

    // Allow override via data attribute on script tag
    function getConfiguredBasePath() {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('base-path.js')) {
                const configuredPath = script.getAttribute('data-base-path');
                if (configuredPath !== null) {
                    return configuredPath;
                }
            }
        }
        return null;
    }

    // Determine final base path
    const configuredPath = getConfiguredBasePath();
    const BASE_PATH = configuredPath !== null ? configuredPath : detectBasePath();

    // Export globally
    window.BASE_PATH = BASE_PATH;

    // Also create a helper for building API URLs
    window.buildApiUrl = function(endpoint) {
        // Ensure endpoint starts with /
        if (!endpoint.startsWith('/')) {
            endpoint = '/' + endpoint;
        }
        // Ensure endpoint starts with /api if it doesn't
        if (!endpoint.startsWith('/api')) {
            endpoint = '/api' + endpoint;
        }
        return BASE_PATH + endpoint;
    };

    // Helper for building asset URLs
    window.buildAssetUrl = function(path) {
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        return BASE_PATH + path;
    };

    console.log('[base-path] Configured BASE_PATH:', BASE_PATH);
    console.log('[base-path] Embedded mode:', isEmbedded);
})();
