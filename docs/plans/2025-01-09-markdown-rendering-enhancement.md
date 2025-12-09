# Markdown Rendering Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive markdown rendering, code syntax highlighting, math equations, HTML sanitization, RTL/BiDi support, and inline citations to the DictaLLM chat frontend without breaking existing functionality.

**Architecture:** Plugin-based rendering pipeline using markdown-it as the central parser with specialized plugins for each feature. DOMPurify acts as a security layer before DOM injection. The existing parseResponse() function remains unchanged - we only modify the final HTML rendering step.

**Tech Stack:** markdown-it v14.x, highlight.js v11.x, KaTeX v0.16.x, DOMPurify v3.x, mermaid.js v10.x, markdown-it-texmath, markdown-it-footnote, markdown-it-attrs, markdown-it-task-lists, markdown-it-container, markdown-it-emoji (all via CDN)

---

## Task 1: Add Library Dependencies via CDN

**Files:**
- Modify: `frontend/index.html:107` (before existing script tag)

**Step 1: Add CDN script tags for core libraries**

Add before line 107 (`<script src="index.js?v=8"></script>`):

```html
    <!-- Markdown Rendering Libraries -->
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-footnote@4.0.0/dist/markdown-it-footnote.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-attrs@4.1.6/dist/markdown-it-attrs.browser.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-task-lists@2.1.1/dist/markdown-it-task-lists.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-container@4.0.0/dist/markdown-it-container.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-emoji@3.0.0/dist/markdown-it-emoji.min.js"></script>

    <!-- Code Syntax Highlighting (Core only - others lazy loaded) -->
    <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/core.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css" id="hljs-theme">

    <!-- Mermaid Diagrams -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>

    <!-- Math Rendering -->
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-texmath@1.0.0/texmath.js"></script>

    <!-- HTML Sanitization -->
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js"></script>

    <script src="index.js?v=9"></script>
```

**Step 2: Verify libraries load in browser**

Action: Open browser dev console and check for errors
Expected: No 404 errors, libraries available in global scope

**Step 3: Commit library dependencies**

```bash
git add frontend/index.html
git commit -m "feat: add markdown rendering library dependencies via CDN"
```

---

## Task 2: Add CSS Styling for Enhanced Rendering

**Files:**
- Modify: `frontend/style.css:525` (append at end)

**Step 1: Add markdown content styling**

Append to end of `style.css` (after line 525):

```css

/* ====================================
   Markdown Rendering Enhancements
   ==================================== */

/* Markdown Typography */
.response-message h1,
.thinking-content-inner h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1rem 0 0.5rem 0;
    color: #f0f6ff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.3rem;
}

.response-message h2,
.thinking-content-inner h2 {
    font-size: 1.3rem;
    font-weight: 600;
    margin: 0.8rem 0 0.4rem 0;
    color: #e6eef8;
}

.response-message h3,
.thinking-content-inner h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0.6rem 0 0.3rem 0;
    color: #dfe9ff;
}

/* Lists */
.response-message ul,
.thinking-content-inner ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    list-style-type: disc;
}

.response-message ol,
.thinking-content-inner ol {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    list-style-type: decimal;
}

.response-message li,
.thinking-content-inner li {
    margin: 0.3rem 0;
    line-height: 1.6;
}

/* Inline Code */
.response-message code:not(.hljs),
.thinking-content-inner code:not(.hljs) {
    background: rgba(255, 255, 255, 0.08);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    color: #fbbf24;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Code Blocks */
.response-message pre,
.thinking-content-inner pre {
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 1rem;
    margin: 0.8rem 0;
    overflow-x: auto;
    position: relative;
}

.response-message pre code,
.thinking-content-inner pre code {
    background: transparent;
    padding: 0;
    border: none;
    color: inherit;
    font-size: 0.85rem;
    line-height: 1.5;
    display: block;
}

/* Blockquotes */
.response-message blockquote,
.thinking-content-inner blockquote {
    border-left: 3px solid var(--accent);
    padding-left: 1rem;
    margin: 0.8rem 0;
    color: var(--muted);
    font-style: italic;
    background: rgba(59, 130, 246, 0.05);
    border-radius: 0 8px 8px 0;
    padding: 0.5rem 1rem;
}

/* Links */
.response-message a,
.thinking-content-inner a {
    color: var(--accent);
    text-decoration: underline;
    transition: color 0.2s;
}

.response-message a:hover,
.thinking-content-inner a:hover {
    color: #60a5fa;
}

/* Tables */
.response-message table,
.thinking-content-inner table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.8rem 0;
    font-size: 0.9rem;
}

.response-message th,
.thinking-content-inner th {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.6rem;
    text-align: left;
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-weight: 600;
}

.response-message td,
.thinking-content-inner td {
    padding: 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.response-message tr:nth-child(even),
.thinking-content-inner tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
}

/* Horizontal Rules */
.response-message hr:not(.message-separator),
.thinking-content-inner hr:not(.message-separator) {
    border: 0;
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
    margin: 1rem 0;
}

/* Math Equations */
.katex-display {
    margin: 1rem 0;
    overflow-x: auto;
    overflow-y: hidden;
}

.katex {
    font-size: 1.1em;
    color: #e6eef8;
}

/* Footnotes */
.footnotes {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.85rem;
    color: var(--muted);
}

.footnotes ol {
    padding-left: 1.2rem;
}

.footnote-ref {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
}

.footnote-ref:hover {
    text-decoration: underline;
}

.footnote-backref {
    margin-left: 0.3rem;
    text-decoration: none;
    color: var(--muted);
}

/* RTL/BiDi Support */
.response-message[dir="rtl"],
.thinking-content-inner[dir="rtl"] {
    direction: rtl;
    text-align: right;
}

.response-message[dir="ltr"],
.thinking-content-inner[dir="ltr"] {
    direction: ltr;
    text-align: left;
}

/* Auto-detect mode */
.response-message,
.thinking-content-inner {
    unicode-bidi: plaintext;
}

/* Ensure code blocks stay LTR even in RTL content */
.response-message pre,
.thinking-content-inner pre,
.response-message code,
.thinking-content-inner code {
    direction: ltr;
    text-align: left;
    unicode-bidi: embed;
}

/* Task Lists */
.contains-task-list {
    list-style-type: none;
    padding-left: 0.5rem;
}

.task-list-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0.3rem 0;
}

.task-list-item-checkbox {
    margin-top: 0.35rem;
    accent-color: var(--accent);
}

/* Collapsible Sections (Details/Summary) */
details {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    margin: 1rem 0;
    overflow: hidden;
}

summary {
    padding: 0.8rem 1rem;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    font-weight: 600;
    color: #e6eef8;
    user-select: none;
    transition: background 0.2s;
    list-style: none; /* Hide default arrow */
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

summary::-webkit-details-marker {
    display: none;
}

summary::before {
    content: '▶';
    font-size: 0.8rem;
    transition: transform 0.2s;
    display: inline-block;
    color: var(--muted);
}

details[open] summary::before {
    transform: rotate(90deg);
}

details[open] summary {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

details .details-content {
    padding: 1rem;
}

/* Mermaid Diagrams */
.mermaid {
    background: rgba(255, 255, 255, 0.02);
    padding: 1rem;
    border-radius: 8px;
    margin: 1rem 0;
    overflow-x: auto;
    text-align: center;
}

/* Theme Selector Styles */
.theme-selector {
    position: absolute;
    top: 1rem;
    right: 5rem;
    z-index: 100;
}

.theme-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: var(--muted);
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
}

.theme-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.4);
}

/* Formatting Toolbar */
.formatting-toolbar {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px 8px 0 0;
}

.format-btn {
    background: transparent;
    border: none;
    color: var(--muted);
    padding: 0.3rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
}

.format-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

/* Markdown Preview Toggle */
.preview-toggle {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    z-index: 10;
}
```

**Step 2: Verify CSS has no syntax errors**

Action: Check browser dev console for CSS parsing errors
Expected: No errors, styles apply correctly

**Step 3: Commit CSS enhancements**

```bash
git add frontend/style.css
git commit -m "style: add markdown rendering CSS enhancements"
```

---

## Task 3: Create Markdown Rendering Engine

**Files:**
- Modify: `frontend/index.js:1` (add immediately after IIFE opening)

**Step 1: Initialize markdown-it with configuration and helper functions**

Add after line 1 (`(() => {`), before the line with `const messagesEl`:

```javascript
    // ========================================
    // Markdown Rendering Configuration
    // ========================================

        // Initialize markdown-it parser
    const md = window.markdownit({
        html: false,        // Disable raw HTML for security
        xhtmlOut: false,    // Use > instead of /> for void elements
        breaks: true,       // Convert \n to <br>
        linkify: true,      // Auto-convert URLs to links
        typographer: true,  // Enable smartquotes and other typographic replacements
        quotes: '""''',     // Quote replacement characters

        // Syntax highlighting for code blocks (Lazy Loading)
        highlight: function (str, lang) {
            // Lazy load language if not available
            if (lang && window.hljs && !window.hljs.getLanguage(lang)) {
                try {
                    // Check if we have a CDN URL for this language
                    // Note: In a real implementation, we would need a mapping or dynamic import
                    // For now, we'll try to load it dynamically if possible or fall back to auto
                    loadLanguage(lang);
                } catch (e) {
                    console.warn(`Failed to load language: ${lang}`, e);
                }
            }

            if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                try {
                    return window.hljs.highlight(str, {
                        language: lang,
                        ignoreIllegals: true
                    }).value;
                } catch (err) {
                    console.error('Highlight.js error:', err);
                }
            }
            // Auto-detect language if not specified
            if (window.hljs) {
                try {
                    return window.hljs.highlightAuto(str).value;
                } catch (err) {
                    console.error('Highlight.js auto-detect error:', err);
                }
            }
            return ''; // Return empty string to use default escaping
        }
    });

    // Add task lists support
    if (window.markdownitTaskLists) {
        md.use(window.markdownitTaskLists, {
            enabled: true,
            label: true,
            labelAfter: true
        });
    }

    // Add container support (for collapsible sections/admonitions)
    if (window.markdownitContainer) {
        md.use(window.markdownitContainer, 'details', {
            validate: function(params) {
                return params.trim().match(/^details\s+(.*)$/);
            },
            render: function (tokens, idx) {
                var m = tokens[idx].info.trim().match(/^details\s+(.*)$/);
                if (tokens[idx].nesting === 1) {
                    // opening tag
                    return '<details><summary>' + md.utils.escapeHtml(m[1]) + '</summary>\n<div class="details-content">';
                } else {
                    // closing tag
                    return '</div></details>\n';
                }
            }
        });
    }

    // Add emoji support
    if (window.markdownitEmoji) {
        md.use(window.markdownitEmoji);
    }

    // Add footnote support for citations
    if (window.markdownitFootnote) {
        md.use(window.markdownitFootnote);
    }

    // Add attributes support for RTL/BiDi
    if (window.markdownitAttrs) {
        md.use(window.markdownitAttrs, {
            leftDelimiter: '{',
            rightDelimiter: '}',
            allowedAttributes: ['dir', 'class', 'id']
        });
    }

    // Add math support via KaTeX
    if (window.texmath && window.katex) {
        md.use(window.texmath, {
            engine: window.katex,
            delimiters: 'dollars',  // Use $ and $$ delimiters
            katexOptions: {
                throwOnError: false,  // Don't break on math errors
                displayMode: false,
                output: 'html'
            }
        });
    }

    /**
     * Lazy load highlight.js languages
     * @param {string} lang - Language name
     */
    function loadLanguage(lang) {
        // Implementation for lazy loading
        const script = document.createElement('script');
        script.src = `https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/${lang}.min.js`;
        script.onerror = () => console.warn(`Could not load language: ${lang}`);
        document.head.appendChild(script);
    }

    /**
     * Render Mermaid diagrams
     * @param {string} code - Mermaid code
     * @returns {string} - Rendered SVG or placeholder
     */
    function renderMermaid(code) {
        try {
            // Generate unique ID
            const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
            // Return container div - actual rendering happens after DOM insertion
            setTimeout(() => {
                mermaid.render(id, code).then(result => {
                    const element = document.getElementById(id + '-container');
                    if (element) element.innerHTML = result.svg;
                });
            }, 0);
            return `<div class="mermaid" id="${id}-container">${code}</div>`;
        } catch (e) {
            return `<pre class="mermaid-error">${e.message}</pre>`;
        }
    }

    // Initialize Mermaid
    if (window.mermaid) {
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    }

    // ========================================
    // RTL/BiDi Detection
    // ========================================

    /**
     * Detect if text contains significant RTL characters
     * @param {string} text - Text to analyze
     * @returns {boolean} - True if text is primarily RTL
     */
    function detectRTL(text) {
        const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
        const rtlMatches = (text.match(rtlChars) || []).length;
        const totalChars = text.replace(/\s/g, '').length;

        // If more than 30% of non-whitespace chars are RTL, treat as RTL
        return totalChars > 0 && (rtlMatches / totalChars) > 0.3;
    }

    // ========================================
    // Markdown Rendering Pipeline
    // ========================================

    /**
     * Escape HTML for safe attribute insertion
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Render markdown text to sanitized HTML
     * @param {string} text - Raw markdown text
     * @returns {string} - Sanitized HTML
     */
    function renderMarkdown(text) {
        if (!text || text.trim().length === 0) {
            return '';
        }

        // Step 1: Parse markdown to HTML
        let html = md.render(text);

        // Step 2: Sanitize HTML with DOMPurify
        if (window.DOMPurify) {
            html = window.DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'p', 'br', 'hr', 'div', 'span',
                    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
                    'code', 'pre', 'kbd', 'samp', 'var',
                    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
                    'a', 'blockquote', 'cite', 'q',
                    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
                    'sup', 'sub', 'abbr', 'mark', 'small',
                    'section', 'article', 'aside', 'details', 'summary',
                    // KaTeX math elements
                    'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
                    'annotation', 'annotation-xml',
                    // Footnote elements
                    'sup', 'section'
                ],
                ALLOWED_ATTR: [
                    'class', 'id', 'dir', 'lang',
                    'href', 'title', 'target', 'rel',
                    'data-footnote-ref', 'data-footnote-backref',
                    'aria-label', 'role',
                    // KaTeX attributes
                    'style', 'xmlns', 'aria-hidden'
                ],
                ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                KEEP_CONTENT: true,
                RETURN_TRUSTED_TYPE: false
            });
        }

        // Step 3: Wrap code blocks for copy functionality
        html = html.replace(
            /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
            (match, lang, code) => {
                // Special handling for mermaid diagrams
                if (lang === 'mermaid') {
                    // Decode HTML entities in code
                    const textarea = document.createElement('textarea');
                    textarea.innerHTML = code;
                    return renderMermaid(textarea.value);
                }
                
                return `<div class="code-block-wrapper">
                    <button class="copy-code-btn" data-code="${escapeHtml(code)}" title="Copy code">Copy</button>
                    <pre><code class="language-${lang}">${code}</code></pre>
                </div>`;
            }
        );

        // Also wrap plain code blocks
        html = html.replace(
            /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
            (match, code) => {
                // Skip if already wrapped
                if (match.includes('code-block-wrapper')) {
                    return match;
                }
                return `<div class="code-block-wrapper">
                    <button class="copy-code-btn" data-code="${escapeHtml(code)}" title="Copy code">Copy</button>
                    <pre><code>${code}</code></pre>
                </div>`;
            }
        );

        return html;
    }

    /**
     * Handle copy button clicks for code blocks
     */
    function setupCopyButtons() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-code-btn')) {
                const code = e.target.getAttribute('data-code');
                if (code) {
                    // Decode HTML entities
                    const textarea = document.createElement('textarea');
                    textarea.innerHTML = code;
                    const decodedCode = textarea.value;

                    // Copy to clipboard
                    navigator.clipboard.writeText(decodedCode).then(() => {
                        const btn = e.target;
                        const originalText = btn.textContent;
                        btn.textContent = 'Copied!';
                        btn.classList.add('copied');

                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.classList.remove('copied');
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy:', err);
                    });
                }
            }
        });
    }

    // Initialize copy buttons on load
    setupCopyButtons();

```

**Step 2: Verify no syntax errors**

Action: Check browser console for JavaScript errors
Expected: No errors, functions defined correctly

**Step 3: Commit markdown rendering engine**

```bash
git add frontend/index.js
git commit -m "feat: add markdown rendering engine with sanitization"
```

---

## Task 4: Integrate Markdown into Message Display

**Files:**
- Modify: `frontend/index.js:335` (appendMessage function)
- Modify: `frontend/index.js:376` (simulateReply function)

**Step 1: Modify appendMessage function at line 335**

Locate this code at line 335:
```javascript
contentDiv.innerHTML = content.replace(/\n/g, '<br>');
```

Replace with:
```javascript
// Render markdown with all enhancements
const renderedHtml = renderMarkdown(content);
contentDiv.innerHTML = renderedHtml;

// Detect and apply RTL direction if needed
if (detectRTL(content)) {
    contentDiv.setAttribute('dir', 'rtl');
} else {
    contentDiv.setAttribute('dir', 'ltr');
}
```

**Step 2: Modify simulateReply function at line 376**

Locate this code at line 376:
```javascript
contentDiv.innerHTML = content.replace(/\n/g, '<br>');
```

Replace with:
```javascript
// Render markdown with all enhancements
const renderedHtml = renderMarkdown(content);
contentDiv.innerHTML = renderedHtml;

// Detect and apply RTL direction if needed
if (detectRTL(content)) {
    contentDiv.setAttribute('dir', 'rtl');
} else {
    contentDiv.setAttribute('dir', 'ltr');
}
```

**Step 3: Commit integration**

```bash
git add frontend/index.js
git commit -m "feat: integrate markdown rendering into message display"
```

---

## Task 5: Add UI Controls for Preview and Theme

**Files:**
- Modify: `frontend/index.html:98` (add toolbar before form closing tag)
- Modify: `frontend/index.js` (end of file, add control functions)

**Step 1: Add HTML elements for preview container and toolbar**

Add after line 101 in `frontend/index.html` (after the textarea, before the send button):

```html
                <div id="message-preview" class="message-preview" style="display: none;"></div>
```

Then add toolbar buttons after line 99 (inside the form, before the attach button):

```html
                <div class="formatting-toolbar">
                    <button type="button" class="format-btn" id="previewBtn" title="Toggle Preview">👁️</button>
                    <button type="button" class="format-btn" id="themeBtn" title="Toggle Theme">🌓</button>
                </div>
```

**Step 2: Add JavaScript control functions**

Add at the end of `frontend/index.js` (before the closing `})();`):

```javascript
    // ========================================
    // UI Controls for Preview and Theme
    // ========================================

    // Toggle Preview Mode
    let isPreviewMode = false;
    const previewBtn = document.getElementById('previewBtn');
    const messagePreview = document.getElementById('message-preview');

    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            isPreviewMode = !isPreviewMode;

            if (isPreviewMode) {
                messagePreview.innerHTML = renderMarkdown(input.value);
                messagePreview.style.display = 'block';
                input.style.display = 'none';
                previewBtn.textContent = '✏️'; // Edit icon
            } else {
                messagePreview.style.display = 'none';
                input.style.display = 'block';
                previewBtn.textContent = '👁️'; // Preview icon
            }
        });
    }

    // Auto-update preview when typing (if preview mode is active)
    input.addEventListener('input', () => {
        if (isPreviewMode && messagePreview) {
            messagePreview.innerHTML = renderMarkdown(input.value);
        }
    });

    // Theme Selector
    const themes = ['github-dark', 'monokai', 'dracula', 'atom-one-dark', 'vs2015'];
    let currentThemeIndex = 0;
    const themeBtn = document.getElementById('themeBtn');

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            currentThemeIndex = (currentThemeIndex + 1) % themes.length;
            const themeLink = document.getElementById('hljs-theme');
            if (themeLink) {
                themeLink.href = `https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/${themes[currentThemeIndex]}.min.css`;
            }
        });
    }
```

**Step 3: Commit UI controls**

```bash
git add frontend/index.html frontend/index.js
git commit -m "feat: add preview and theme toggle controls"
```

---

## Task 6: Add Markdown to Thinking Blocks

**Files:**
- Modify: `frontend/index.js:42` (createThinkingBlock function)

**Step 1: Find and modify line 42**

Locate this code around line 42:
```javascript
textSpan.textContent = content;
```

Replace with:
```javascript
// Render markdown in thinking blocks too
const renderedHtml = renderMarkdown(content);
textSpan.innerHTML = renderedHtml;

// Detect and apply RTL direction if needed
if (detectRTL(content)) {
    innerContent.setAttribute('dir', 'rtl');
} else {
    innerContent.setAttribute('dir', 'ltr');
}
```

**Step 2: Test thinking block markdown**

Send message that triggers thinking:
- "Explain quicksort with code examples"

Verify:
- Thinking block collapses/expands
- Markdown renders in thinking content

**Step 3: Commit thinking block enhancement**

```bash
git add frontend/index.js
git commit -m "feat: add markdown rendering to thinking blocks"
```


## Task 7: Update Documentation

**Files:**
- Modify: `README.md` or `CLAUDE.md` (Frontend section)
- Create: `frontend/README.md` (optional detailed docs)

**Step 1: Update project documentation with new features**

Add to the Frontend Documentation section:

```markdown
### Markdown Rendering Features

The frontend now supports comprehensive markdown rendering with the following features:

- **Full Markdown Support**: Headers, lists, tables, blockquotes, code blocks
- **Syntax Highlighting**: Automatic code syntax highlighting with lazy-loaded languages
- **Math Equations**: KaTeX rendering for inline ($...$) and block ($$...$$) math
- **Mermaid Diagrams**: Support for mermaid code blocks for flowcharts and diagrams
- **Task Lists**: Interactive checkboxes for task items
- **Collapsible Sections**: Details/summary containers for organizing content
- **Emoji Support**: Native emoji rendering via markdown-it-emoji
- **RTL/BiDi Support**: Automatic detection and formatting for right-to-left languages
- **Footnotes**: Academic-style citations and footnotes
- **HTML Sanitization**: DOMPurify protection against XSS attacks
- **Theme Switcher**: Toggle between multiple highlight.js themes
- **Markdown Preview**: Live preview of markdown while typing
- **Copy Code**: One-click copy buttons for code blocks

**Libraries Used (CDN):**
- markdown-it v14.x (core parser)
- highlight.js v11.x (syntax highlighting)
- KaTeX v0.16.x (math rendering)
- DOMPurify v3.x (HTML sanitization)
- mermaid.js v10.x (diagrams)
- Various markdown-it plugins
```

**Step 2: Commit documentation**

```bash
git add README.md
git commit -m "docs: update documentation for markdown rendering features"
```

---

## Verification Checklist

- [ ] All CDN libraries load
- [ ] Markdown renders (headings, bold, italic)
- [ ] Code syntax highlighting works
- [ ] Math equations render
- [ ] Footnotes clickable
- [ ] RTL text auto-detects
- [ ] HTML sanitization blocks XSS
- [ ] Copy code button works
- [ ] Thinking blocks functional
- [ ] Conversation history preserved
- [ ] No console errors
- [ ] Hot reload works
- [ ] All tests pass

## Rollback Plan

If issues occur:

```bash
git log --oneline
git revert <commit-hash>
# OR
git reset --hard <commit-hash>
./stop.sh && ./start.sh
```

## Performance Targets

- Initial load: <2s
- Markdown render: <10ms/message
- Code highlight: <5ms/block
- Math render: <10ms/equation
- Memory: <50MB additional

## Known Limitations

1. Only 10 code languages pre-loaded
2. Complex math may be slow
3. RTL uses 30% threshold
4. Basic footnote styling
5. basic table styling

## Future Enhancements

1. Lazy-load highlight.js languages
2. Add mermaid.js diagrams
3. Add emoji support
4. Add task list checkboxes
5. Add collapsible sections
6. Add theme selector
7. Add markdown preview
8. Add formatting shortcuts
