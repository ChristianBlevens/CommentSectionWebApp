# Comment Section Iframe Integration Guide

This guide explains how to integrate a comment section iframe into your website with automatic height resizing that adjusts to the content.

## Overview

The integration consists of two parts:
1. **Parent website** - Contains the iframe and handles resize messages
2. **Comment section app** - Runs inside the iframe and reports its height

## Parent Website Implementation

### HTML - Adding the Iframe

```html
<div class="comment-section-container">
  <iframe 
    id="commentIframe"
    src="https://mycomments.duckdns.org/?pageId=YOUR_PAGE_ID"
    class="comment-iframe"
    frameborder="0"
    scrolling="no"
    style="width: 100%; min-height: 400px;">
  </iframe>
</div>
```

### CSS - Basic Styling

```css
.comment-section-container {
  width: 100%;
  margin: 20px 0;
}

.comment-iframe {
  width: 100%;
  border: none;
  transition: height 0.3s ease;
}
```

### JavaScript - Height Management

```javascript
function setupCommentIframeResize() {
  const iframe = document.getElementById('commentIframe');
  if (!iframe) return;
  
  // Listen for height updates from the iframe
  window.addEventListener('message', (event) => {
    // Verify the origin for security
    if (event.origin !== 'https://mycomments.duckdns.org') return;
    
    // Apply the new height
    if (event.data && event.data.type === 'resize' && event.data.height) {
      iframe.style.height = `${Math.max(400, event.data.height + 20)}px`;
    }
  });
  
  // Request height updates periodically
  const requestHeight = () => {
    try {
      iframe.contentWindow.postMessage({ type: 'getHeight' }, 'https://mycomments.duckdns.org');
    } catch (e) {
      console.log('Cannot communicate with comment iframe');
    }
  };
  
  // Start requesting height after iframe loads
  iframe.addEventListener('load', () => {
    // Initial request
    setTimeout(requestHeight, 500);
    
    // Request height every 250ms
    setInterval(requestHeight, 250);
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', setupCommentIframeResize);
```

## Comment Section App Implementation

Add this script to your comment section web application that runs inside the iframe:

```javascript
// Function to calculate and send height to parent
function sendHeightToParent() {
  // Calculate the actual content height
  const height = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );
  
  // Send height to parent window
  window.parent.postMessage({
    type: 'resize',
    height: height,
    frameId: new URLSearchParams(window.location.search).get('pageId')
  }, '*');
}

// Send height when page loads
window.addEventListener('load', sendHeightToParent);

// Send height when DOM changes (new comments, etc.)
const observer = new MutationObserver(sendHeightToParent);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true
});

// Send height when window resizes
window.addEventListener('resize', sendHeightToParent);

// Listen for height requests from parent
window.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'getHeight' || event.data.action === 'requestHeight')) {
    sendHeightToParent();
  }
});
```

## Security Considerations

1. **Origin Verification**: Always verify the origin of messages in both directions
2. **HTTPS**: Use HTTPS for both the parent site and iframe content
3. **Content Security Policy**: Configure CSP headers appropriately

Example of secure message handling:

```javascript
// In parent website
window.addEventListener('message', (event) => {
  // Only accept messages from trusted origin
  if (event.origin !== 'https://mycomments.duckdns.org') return;
  // Process message...
});

// In iframe
window.parent.postMessage(data, 'https://yourwebsite.com'); // Specify target origin
```

## Advanced Features

### Multiple Iframes on Same Page

If you have multiple comment iframes, use the `frameId` to distinguish them:

```javascript
// Parent website
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://mycomments.duckdns.org') return;
  
  if (event.data && event.data.type === 'resize') {
    // Find the specific iframe by frameId
    const iframe = document.querySelector(`iframe[src*="pageId=${event.data.frameId}"]`);
    if (iframe) {
      iframe.style.height = `${event.data.height + 20}px`;
    }
  }
});
```

### Smooth Animations

Add CSS transitions for smooth height changes:

```css
.comment-iframe {
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Loading States

Show a loading indicator while the iframe loads:

```html
<div class="comment-section-container">
  <div class="comment-loading" id="commentLoading">
    <div class="spinner"></div>
    <p>Loading comments...</p>
  </div>
  <iframe 
    id="commentIframe"
    src="https://mycomments.duckdns.org/?pageId=YOUR_PAGE_ID"
    class="comment-iframe"
    onload="document.getElementById('commentLoading').style.display='none'"
    style="width: 100%; min-height: 400px; display: none;"
    frameborder="0"
    scrolling="no">
  </iframe>
</div>
```

```javascript
// Show iframe when loaded
iframe.addEventListener('load', () => {
  iframe.style.display = 'block';
  document.getElementById('commentLoading').style.display = 'none';
});
```

## Troubleshooting

### Common Issues

1. **Iframe not resizing**: Check browser console for errors and verify origins match
2. **Cross-origin errors**: Ensure both sites use HTTPS and origins are correctly specified
3. **Height calculation incorrect**: The iframe content might have margins or absolute positioning affecting height calculation

### Debug Mode

Add debug logging to troubleshoot issues:

```javascript
// In parent website
window.addEventListener('message', (event) => {
  console.log('Received message:', event.data, 'from:', event.origin);
  // ... rest of code
});

// In iframe
function sendHeightToParent() {
  const height = Math.max(/* ... */);
  console.log('Sending height:', height);
  // ... rest of code
}
```

## Best Practices

1. **Fallback Height**: Always set a minimum height (e.g., 400px) so content is visible even if resizing fails
2. **Debouncing**: Consider debouncing resize events if content changes frequently
3. **Performance**: Use `requestAnimationFrame` for smooth animations when height changes
4. **Accessibility**: Ensure iframe has proper title attribute for screen readers

```html
<iframe 
  title="Comments section"
  aria-label="User comments for this page"
  ...>
</iframe>
```

## Complete Example

Here's a complete, production-ready implementation:

### Parent Website

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .comment-section {
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    
    .comment-iframe {
      width: 100%;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      transition: height 0.3s ease;
      background: #fff;
    }
  </style>
</head>
<body>
  <div class="comment-section">
    <h2>Comments</h2>
    <iframe 
      id="commentIframe"
      title="Comments"
      src="https://mycomments.duckdns.org/?pageId=example-page"
      class="comment-iframe"
      frameborder="0"
      scrolling="no"
      style="min-height: 400px;">
    </iframe>
  </div>

  <script>
    (function() {
      const iframe = document.getElementById('commentIframe');
      if (!iframe) return;
      
      // Message handler
      window.addEventListener('message', (event) => {
        if (event.origin !== 'https://mycomments.duckdns.org') return;
        
        if (event.data?.type === 'resize' && event.data.height) {
          iframe.style.height = `${Math.max(400, event.data.height + 20)}px`;
        }
      });
      
      // Height requester
      const requestHeight = () => {
        iframe.contentWindow?.postMessage({ type: 'getHeight' }, 'https://mycomments.duckdns.org');
      };
      
      // Initialize
      iframe.addEventListener('load', () => {
        setTimeout(requestHeight, 500);
        setInterval(requestHeight, 250);
      });
    })();
  </script>
</body>
</html>
```

This setup provides a robust, secure, and performant way to integrate comment iframes with automatic height adjustment.