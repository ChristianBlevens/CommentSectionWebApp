# Comment Section Web Application

A **production-ready** comment system with Discord OAuth authentication, AI-powered content moderation, and built-in spam protection. Embed it on any website using a simple iframe.

## Key Features

- **🔐 Discord OAuth Authentication** - No passwords, secure login through Discord
- **🤖 AI-Powered Moderation** - Natural language processing detects spam, toxicity, and inappropriate content
- **💬 Rich Text Support** - Markdown formatting with image and video embeds
- **👍 Voting System** - Like/dislike comments
- **🛡️ Advanced Security** - HTTPS only, rate limiting, CSRF protection, SQL injection prevention
- **👮 Moderation Tools** - Report system, user banning, moderator dashboard
- **📱 Responsive Design** - Works on all devices
- **🚀 High Performance** - Redis caching, PostgreSQL with optimized indexes
- **📊 Analytics Dashboard** - Activity tracking with visual charts and data export
- **🎨 Theme Customization** - Customizable colors and presets
- **🤖 Discord Bot** - Mention notifications via Discord DMs
- **📊 Trust System** - User reputation scoring based on behavior

## Quick Integration

Add this single line wherever you want comments:

```html
<script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
        data-instance="https://mycomments.duckdns.org" 
        data-page-id="unique-page-id"></script>
```

Replace:
- `yourusername/comments` with your GitHub repo
- `data-instance` with your comment webapp URL (or use the default)
- `data-page-id` with a unique identifier for each page

### Embed Configuration

The embed script currently accepts the following data attributes:

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-instance` | Yes | The URL of your comment webapp instance (e.g., `https://mycomments.duckdns.org`) |
| `data-page-id` | Yes | A unique identifier for each page where comments appear. This separates comments between different pages. |

### Automatic Theme Detection

The embed script automatically detects and inherits your website's theme colors and styles without requiring any additional configuration. This includes:

- **Primary colors** from buttons and links
- **Background colors** from your site  
- **Text colors** for proper contrast
- **Dark mode** detection and support
- **WordPress theme** compatibility (especially Madara theme)

The theme detection works by:
1. Analyzing your site's CSS variables and computed styles
2. Detecting common WordPress theme patterns
3. Extracting colors from key UI elements
4. Monitoring for theme changes (like dark mode toggles)
5. Automatically updating the comment section to match

The comment section will blend seamlessly with your site's design - no manual theme configuration needed!

## WordPress Integration

### Method 1: Direct Theme Edit
Add to your theme where comments should appear:
```php
<?php
$page_id = get_the_ID() . '-' . ($_GET['chapter'] ?? '');
?>
<script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
        data-instance="https://mycomments.duckdns.org" 
        data-page-id="<?php echo esc_attr($page_id); ?>"></script>
```

### Method 2: Disqus Replacement (Madara Theme)
Add to `functions.php`:
```php
// Remove Disqus and add Open Comments
add_filter('disqus_embed_code', function($code) {
  $page_id = get_the_ID() . '-' . ($_GET['chapter'] ?? '');
  return '<script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
                  data-instance="https://mycomments.duckdns.org" 
                  data-page-id="' . esc_attr($page_id) . '"></script>';
});
```

### Method 3: WordPress Shortcode
Add to `functions.php`:
```php
function open_comments_shortcode($atts) {
  $atts = shortcode_atts(['id' => get_the_ID()], $atts);
  return '<script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
                  data-instance="https://mycomments.duckdns.org" 
                  data-page-id="' . esc_attr($atts['id']) . '"></script>';
}
add_shortcode('comments', 'open_comments_shortcode');
```

Usage: `[comments id="chapter-123"]`

## Embed Script Implementation

```javascript
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
```

## Self-Hosting Your Instance

Users can self-host the comment webapp and point to it:
```html
<script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
        data-instance="https://comments.yourdomain.com" 
        data-page-id="unique-page-id"></script>
```

## Examples

### Static HTML Site
```html
<!DOCTYPE html>
<html>
<body>
  <article>
    <h1>My Blog Post</h1>
    <p>Content here...</p>
    
    <!-- Comments -->
    <script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
            data-instance="https://mycomments.duckdns.org" 
            data-page-id="blog-post-1"></script>
  </article>
</body>
</html>
```

### Manga Reader Sites
```html
<!-- On chapter page -->
<div class="chapter-content">
  <!-- Chapter images -->
</div>

<!-- Comments for this chapter -->
<script src="https://cdn.jsdelivr.net/gh/ChristianBlevens/CommentSectionWebApp@main/embed.js" 
        data-instance="https://mycomments.duckdns.org" 
        data-page-id="manga-123-chapter-45"></script>
```

## Documentation

- **[Deployment Guide](DEPLOYMENT.md)** - Complete deployment instructions for home servers and VPS
- **[Detailed Guide](DETAILED_GUIDE.md)** - In-depth feature documentation, architecture details, and file reference

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions:
1. Check the documentation above
2. Submit an issue on GitHub

---

**Built with ❤️ for modern web applications**
