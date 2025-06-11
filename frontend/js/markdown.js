// Markdown text formatter
const MarkdownProcessor = {
    // Create markdown parser
    createInstance() {
        const md = window.markdownit({
            html: true,
            breaks: true,
            linkify: false
        });

        // Make images clickable
        md.renderer.rules.image = (tokens, idx) => {
            const token = tokens[idx];
            const src = token.attrGet('src');
            const alt = token.attrGet('alt') || '';
            const title = token.attrGet('title') || '';
            
            return `<a href="${src}" target="_blank" rel="noopener noreferrer">
                      <img src="${src}" alt="${alt}" title="${title}" 
                           class="max-w-full h-auto rounded cursor-pointer hover:opacity-90 transition-opacity" />
                    </a>`;
        };

        return md;
    },

    // Add custom syntax support
    preprocessMarkdown(text) {
        // Convert ||text|| to spoilers
        text = text.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>');
        
        // Convert !video[] to embeds
        const videoRegex = /!video\[(.*?)\]\((.*?)\)/g;
        
        return text.replace(videoRegex, (match, alt, url) => {
            const youtubeId = Utils.getYoutubeId(url);
            const vimeoId = Utils.getVimeoId(url);
            
            if (youtubeId) {
                return `<div class="embed-responsive embed-responsive-16by9">
                          <iframe class="embed-responsive-item" 
                                  src="https://www.youtube.com/embed/${youtubeId}" 
                                  frameborder="0" allowfullscreen></iframe>
                        </div>`;
            } else if (vimeoId) {
                return `<div class="embed-responsive embed-responsive-16by9">
                          <iframe class="embed-responsive-item" 
                                  src="https://player.vimeo.com/video/${vimeoId}" 
                                  frameborder="0" allowfullscreen></iframe>
                        </div>`;
            }
            
            return match;
        });
    },

    // Add formatting to selected text
    insertMarkdown(textarea, before, after, updatePreviewFn) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);
        
        const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
        textarea.value = newText;
        
        // Place cursor after formatting
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + before.length + selectedText.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            if (updatePreviewFn) updatePreviewFn();
        }, 0);
        
        return newText;
    }
};