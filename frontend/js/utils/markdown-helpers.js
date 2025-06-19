// Markdown helper functions
function renderMarkdown(text) {
    if (!window.md) {
        window.md = window.markdownit({
            html: false,
            breaks: true,
            linkify: true
        });
    }
    const processed = window.MarkdownProcessor?.preprocessMarkdown(text) || text;
    return window.md.render(processed);
}

function insertMarkdown(textarea, before, after) {
    return MarkdownProcessor.insertMarkdown(textarea, before, after);
}

// Setup markdown parser
function initializeMarkdown() {
    if (!window.md) {
        window.md = window.markdownit({
            html: false,
            breaks: true,
            linkify: true
        });
    }
}

window.MarkdownHelpers = {
    renderMarkdown,
    insertMarkdown,
    initializeMarkdown
};