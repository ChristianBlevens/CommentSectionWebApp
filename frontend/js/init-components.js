// Initialize components before Alpine.js
// This ensures all components are available when Alpine initializes

(function() {
    'use strict';
    
    // Wait for DOM and all scripts to load
    function initializeComponents() {
        // Initialize ReportCard if not already initialized
        if (!window.reportCard && window.ReportCard) {
            window.reportCard = new ReportCard();
            console.log('Initialized ReportCard component');
        }
        
        // Initialize CommentRenderer if not already initialized
        if (!window.commentRenderer && window.CommentRenderer) {
            window.commentRenderer = new CommentRenderer();
            console.log('Initialized CommentRenderer component');
        }
        
        // Initialize MarkdownProcessor if needed
        if (!window.MarkdownProcessor || !window.MarkdownProcessor.instance) {
            if (window.MarkdownProcessor && window.MarkdownProcessor.createInstance) {
                window.MarkdownProcessor.instance = window.MarkdownProcessor.createInstance();
                console.log('Initialized MarkdownProcessor');
            }
        }
    }
    
    // Check if components need initialization
    function checkAndInitialize() {
        if (document.readyState === 'loading') {
            return false;
        }
        
        // Check if required libraries are loaded
        if (typeof window.markdownit === 'undefined') {
            console.warn('markdown-it not loaded yet');
            return false;
        }
        
        // Initialize components
        initializeComponents();
        return true;
    }
    
    // Try to initialize immediately
    if (!checkAndInitialize()) {
        // If not ready, wait for DOM
        document.addEventListener('DOMContentLoaded', function() {
            checkAndInitialize();
        });
        
        // Also listen for window load as fallback
        window.addEventListener('load', function() {
            checkAndInitialize();
        });
    }
    
    // Ensure components are initialized before Alpine starts
    document.addEventListener('alpine:init', function() {
        console.log('Alpine.js is initializing, ensuring components are ready...');
        checkAndInitialize();
    });
})();