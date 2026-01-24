// Service Worker registration with automatic silent updates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Get base path from global config
      const basePath = window.BASE_PATH || '';
      const swPath = basePath + '/sw.js';
      const swScope = basePath + '/';

      const registration = await navigator.serviceWorker.register(swPath, {
        scope: swScope
      });

      // Send base path to service worker
      if (registration.active) {
        registration.active.postMessage({ action: 'setBasePath', basePath: basePath });
      }

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      // Handle updates silently
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Automatically activate new version
            newWorker.postMessage({ action: 'skipWaiting' });
          }
          if (newWorker.state === 'activated') {
            // Send base path to new worker
            newWorker.postMessage({ action: 'setBasePath', basePath: basePath });
          }
        });
      });

      // Auto-reload when new service worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      console.log('[SW] Service Worker registered at:', swPath, 'with scope:', swScope);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}
