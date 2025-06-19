(function() {
  // Get configuration from script tag
  const script = document.currentScript;
  const instanceUrl = script.getAttribute('data-instance');
  const pageId = script.getAttribute('data-page-id');
  
  if (!instanceUrl || !pageId) {
    console.error('Open Comments: data-instance and data-page-id are required');
    return;
  }
  
  // Create container
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.minHeight = '400px';
  
  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.src = `${instanceUrl}/?pageId=${encodeURIComponent(pageId)}`;
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.style.minHeight = '400px';
  iframe.style.display = 'block';
  
  // Handle resize messages from iframe
  window.addEventListener('message', (e) => {
    if (e.origin === new URL(instanceUrl).origin && 
        e.data.type === 'resize' && 
        e.data.pageId === pageId) {
      iframe.style.height = e.data.height + 'px';
    }
  });
  
  // Insert after script tag
  container.appendChild(iframe);
  script.parentNode.insertBefore(container, script.nextSibling);
})();