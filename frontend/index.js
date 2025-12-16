// Initialize the app with retry mechanism for highlight.js
let hljsRetryCount = 0;
const MAX_HLJS_RETRIES = 30; // 3 seconds max

function checkLibraries() {
    console.log('🔍 Checking libraries... (attempt', hljsRetryCount + 1, ')');
    console.log('  📚 markdown-it:', !!window.markdownit);
    console.log('  🎨 highlight.js (window.hljs):', !!window.hljs);
    console.log('  🧹 DOMPurify:', !!window.DOMPurify);
    console.log('  📊 mermaid:', !!window.mermaid);

    // Check all window properties for hljs
    const hljsKeys = Object.keys(window).filter(k => k.toLowerCase().includes('hljs') || k.toLowerCase().includes('highlight'));
    console.log('  🔎 Window keys with "hljs/highlight":', hljsKeys);
}

function initializeApp() {
    console.log('🚀 Initializing frontend...');
    checkLibraries();

    if (!window.markdownit) {
        console.error('❌ markdown-it not loaded!');
        alert('Error: markdown-it library failed to load. Please refresh the page.');
        return;
    }

    if (!window.hljs) {
        if (hljsRetryCount < MAX_HLJS_RETRIES) {
            hljsRetryCount++;
            console.warn('⚠️ highlight.js not loaded yet, retrying in 100ms...');
            setTimeout(initializeApp, 100);
            return;
        } else {
            console.error('❌ highlight.js failed to load after', MAX_HLJS_RETRIES, 'retries');
            console.error('   Proceeding WITHOUT syntax highlighting');
            // Continue anyway
        }
    } else {
        console.log('✅ highlight.js loaded!');
        console.log('  📦 hljs languages:', window.hljs.listLanguages().slice(0, 20).join(', '), '...');
    }

    console.log('✅ Starting app initialization...');

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
        quotes: '“”‘’',     // Quote replacement characters

        // Syntax highlighting for code blocks
        highlight: function (str, lang) {
            console.log('🎨 Highlight function called:', { lang, hasHljs: !!window.hljs, codeLength: str?.length });

            // Check if highlight.js is loaded
            if (!window.hljs) {
                console.warn('⚠️ Highlight.js not loaded - returning unescaped');
                // Return unescaped so markdown-it will escape it properly
                return md.utils.escapeHtml(str);
            }

            // If language is specified, try to highlight with that language
            if (lang) {
                const hasLanguage = window.hljs.getLanguage(lang);
                console.log(`  Language '${lang}' available:`, !!hasLanguage);

                if (hasLanguage) {
                    try {
                        const result = window.hljs.highlight(str, {
                            language: lang,
                            ignoreIllegals: true
                        });
                        console.log('  ✅ Highlighted successfully, output length:', result.value.length);
                        console.log('  Output preview:', result.value.substring(0, 100));
                        return result.value;
                    } catch (err) {
                        console.error(`  ❌ Highlight.js error for ${lang}:`, err);
                        // On error, return escaped version
                        return md.utils.escapeHtml(str);
                    }
                } else {
                    console.warn(`  ⚠️ Language '${lang}' not available, trying auto-detect`);
                }
            }

            // Auto-detect language if not specified or language not found
            try {
                const result = window.hljs.highlightAuto(str);
                console.log('  ✅ Auto-detected as:', result.language, 'output length:', result.value.length);
                return result.value;
            } catch (err) {
                console.error('  ❌ Highlight.js auto-detect error:', err);
                // On error, return escaped version
                return md.utils.escapeHtml(str);
            }
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
            // Return container div with the code - DON'T escape HTML as mermaid needs the raw code
            // But DO trim whitespace which can cause syntax errors
            const cleanCode = code.trim();
            return `<pre class="mermaid" id="${id}">${cleanCode}</pre>`;
        } catch (e) {
            console.error('Mermaid error:', e);
            return `<pre class="mermaid-error">${escapeHtml(e.message)}</pre>`;
        }
    }

    // Initialize Mermaid
    if (window.mermaid) {
        window.mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true }
        });
    }

    /**
     * Process mermaid diagrams in the DOM after content is added
     */
    async function processMermaidDiagrams() {
        if (window.mermaid) {
            try {
                // Run mermaid on all unprocessed diagrams
                await window.mermaid.run({
                    querySelector: '.mermaid:not([data-processed="true"])'
                });
                // Mark processed diagrams
                document.querySelectorAll('.mermaid').forEach(el => {
                    el.setAttribute('data-processed', 'true');
                });
            } catch (error) {
                console.error('Failed to render Mermaid diagrams:', error);
            }
        }
    }

    /**
     * Process code blocks for syntax highlighting after content is added to DOM
     * This is a fallback for any blocks that weren't highlighted during markdown parsing
     */
    function processCodeHighlighting() {
        if (window.hljs) {
            // Find all code blocks (both with and without hljs class) and check if they need highlighting
            document.querySelectorAll('pre code').forEach((block) => {
                // Check if highlighting was already applied by looking for hljs-* span elements
                const hasHighlighting = block.querySelector('span[class*="hljs-"]') !== null;

                if (!hasHighlighting && block.textContent && block.textContent.trim().length > 0) {
                    // Extract language from class if available
                    const langMatch = block.className.match(/language-(\w+)/);

                    if (langMatch && langMatch[1]) {
                        // Try to highlight with specific language
                        try {
                            const result = window.hljs.highlight(block.textContent, {
                                language: langMatch[1],
                                ignoreIllegals: true
                            });
                            block.innerHTML = result.value;
                            block.classList.add('hljs');
                        } catch (e) {
                            console.warn(`Failed to highlight ${langMatch[1]} code block:`, e);
                            // Fall back to auto-detection
                            try {
                                const result = window.hljs.highlightAuto(block.textContent);
                                block.innerHTML = result.value;
                                block.classList.add('hljs');
                            } catch (e2) {
                                console.error('Failed to auto-highlight code block:', e2);
                            }
                        }
                    } else {
                        // No language specified, use auto-detection
                        try {
                            const result = window.hljs.highlightAuto(block.textContent);
                            block.innerHTML = result.value;
                            block.classList.add('hljs');
                        } catch (e) {
                            console.error('Failed to auto-highlight code block:', e);
                        }
                    }
                }
            });
        }
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
        console.log('📝 After markdown rendering:', html.substring(0, 500));

        // Step 2: Sanitize HTML with DOMPurify
        if (window.DOMPurify) {
            const beforeSanitize = html;
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
                    'sup', 'section',
                    // Task list elements
                    'input', 'label'
                ],
                ALLOWED_ATTR: [
                    'class', 'id', 'dir', 'lang',
                    'href', 'title', 'target', 'rel',
                    'data-footnote-ref', 'data-footnote-backref',
                    'aria-label', 'role',
                    // KaTeX attributes
                    'style', 'xmlns', 'aria-hidden',
                    // Task list attributes
                    'type', 'checked', 'disabled', 'for'
                ],
                ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                KEEP_CONTENT: true,
                RETURN_TRUSTED_TYPE: false
            });

            console.log('🧹 After DOMPurify sanitization:', html.substring(0, 500));

            // Check if highlighting was preserved
            if (beforeSanitize.includes('<span') && !html.includes('<span')) {
                console.error('⚠️ DOMPurify stripped highlighting spans!');
            } else if (html.includes('<span')) {
                console.log('  ✅ Highlighting spans preserved');
            }
        }

        // Step 3: Wrap code blocks for copy functionality and language labels
        html = html.replace(
            /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
            (match, lang, code) => {
                console.log('📦 Wrapping code block:', {
                    lang,
                    codeLength: code.length,
                    hasSpans: code.includes('<span'),
                    preview: code.substring(0, 200)
                });

                // Special handling for mermaid diagrams
                if (lang === 'mermaid') {
                    // Decode HTML entities in code
                    const textarea = document.createElement('textarea');
                    textarea.innerHTML = code;
                    return renderMermaid(textarea.value);
                }

                // Extract plain text from highlighted code (strips HTML tags)
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = code;
                const plainCode = tempDiv.textContent || tempDiv.innerText || '';

                console.log('  Plain code for copy:', plainCode.substring(0, 100));
                console.log('  Code has highlighting spans:', code.includes('<span'));

                return `<div class="code-block-wrapper">
                    <div class="code-block-header">
                        <span class="code-language">${lang}</span>
                        <button class="copy-code-btn" data-code="${escapeHtml(plainCode)}" title="Copy code">Copy</button>
                    </div>
                    <pre><code class="language-${lang} hljs">${code}</code></pre>
                </div>`;
            }
        );

        // Also wrap plain code blocks (no language specified)
        html = html.replace(
            /<pre><code(?![\s>]*class="language-)>([\s\S]*?)<\/code><\/pre>/g,
            (match, code) => {
                // Skip if already wrapped
                if (match.includes('code-block-wrapper')) {
                    return match;
                }

                // Extract plain text from highlighted code (strips HTML tags)
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = code;
                const plainCode = tempDiv.textContent || tempDiv.innerText || '';

                return `<div class="code-block-wrapper">
                    <div class="code-block-header">
                        <span class="code-language">text</span>
                        <button class="copy-code-btn" data-code="${escapeHtml(plainCode)}" title="Copy code">Copy</button>
                    </div>
                    <pre><code class="hljs">${code}</code></pre>
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

    // ========================================
    // Original Application Code
    // ========================================

    const messagesEl = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');

    // Create the thinking block structure based on the reference
    function createThinkingBlock(content) {
        const container = document.createElement('div');
        container.className = 'thinking-block-container';
        
        // Count words for the label
        const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
        
        // Header
        const header = document.createElement('div');
        header.className = 'thinking-block-header complete';
        
        const headerContent = document.createElement('div');
        headerContent.className = 'thinking-header-content';
        headerContent.innerHTML = `<span class="thinking-label">Thought for ${wordCount} words</span>`;
        
        // Toggle icon (chevron)
        // Using an SVG similar to the reference
        const iconSvg = `
            <svg class="thinking-icon" viewBox="0 0 24 24">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path>
            </svg>
        `;
        
        header.innerHTML = headerContent.outerHTML + iconSvg;
        
        // Content area (initially hidden/collapsed)
        const contentArea = document.createElement('div');
        contentArea.className = 'thinking-block-content';
        
        const innerContent = document.createElement('div');
        innerContent.className = 'thinking-content-inner';
        
        // Use a span with pre-wrap style for text content
        const textSpan = document.createElement('span');
        // Render markdown in thinking blocks too
        const renderedHtml = renderMarkdown(content);
        textSpan.innerHTML = renderedHtml;

        // Detect and apply RTL direction if needed
        if (detectRTL(content)) {
            innerContent.setAttribute('dir', 'rtl');
        } else {
            innerContent.setAttribute('dir', 'ltr');
        }
        innerContent.appendChild(textSpan);
        
        contentArea.appendChild(innerContent);
        
        container.appendChild(header);
        container.appendChild(contentArea);
        
        // Add click handler to toggle expansion
        header.addEventListener('click', () => {
            container.classList.toggle('expanded');
        });
        
        return container;
    }

    function parseResponse(text) {
        console.log("=== parseResponse called ===");
        console.log("Input text:", text);
        console.log("Text length:", text.length);

        let thinkContent = null;
        let content = text;

        // Priority 1: Check for <think></think> tags (most reliable)
        let thinkMatch = text.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/);
        if (thinkMatch) {
            thinkContent = thinkMatch[1].trim();
            content = thinkMatch[2].trim();
            console.log("✓ Found <think> tags");
            console.log("  Reasoning:", thinkContent.substring(0, 100) + "...");
            console.log("  Answer:", content.substring(0, 100) + "...");
            return { thinkContent, content };
        }

        // Priority 2: Check for <reasoning></reasoning> tags
        thinkMatch = text.match(/<reasoning>([\s\S]*?)<\/reasoning>([\s\S]*)/);
        if (thinkMatch) {
            thinkContent = thinkMatch[1].trim();
            content = thinkMatch[2].trim();
            console.log("✓ Found <reasoning> tags");
            console.log("  Reasoning:", thinkContent.substring(0, 100) + "...");
            console.log("  Answer:", content.substring(0, 100) + "...");
            return { thinkContent, content };
        }

        // Priority 3: Check for closing </think> only (template might add opening)
        thinkMatch = text.match(/^([\s\S]*?)<\/think>\s*([\s\S]+)$/);
        if (thinkMatch) {
            thinkContent = thinkMatch[1].trim();
            content = thinkMatch[2].trim();
            // Only accept if there's substantial content after the tag
            if (content.length > 10) {
                console.log("✓ Found </think> closing tag");
                console.log("  Reasoning:", thinkContent.substring(0, 100) + "...");
                console.log("  Answer:", content.substring(0, 100) + "...");
                return { thinkContent, content };
            }
        }

        // Priority 4: Check for closing </reasoning> only
        thinkMatch = text.match(/^([\s\S]*?)<\/reasoning>\s*([\s\S]+)$/);
        if (thinkMatch) {
            thinkContent = thinkMatch[1].trim();
            content = thinkMatch[2].trim();
            // Only accept if there's substantial content after the tag
            if (content.length > 10) {
                console.log("✓ Found </reasoning> closing tag");
                console.log("  Reasoning:", thinkContent.substring(0, 100) + "...");
                console.log("  Answer:", content.substring(0, 100) + "...");
                return { thinkContent, content };
            }
        }

        console.log("✗ No reasoning tags found - returning full text as answer");

        // Return full text if no tags found
        return { thinkContent: null, content: text };
    }

    // Legacy fallback logic (currently disabled - only tags are used)
    function parseResponseLegacy(text) {
        let thinkContent = null;
        let content = text;

        // Priority 2: Detect thinking patterns intelligently
        // Look for reasoning that ends with a clear conclusion followed by the actual response
        // Pattern: "The user says X. [reasoning]. So/Therefore [conclusion]." followed by actual response
        
        // Try to find sentences that end with reasoning conclusions
        const reasoningWithConclusion = text.match(/^(.*?(?:So|Therefore|Thus|Hence|As a result|In summary|To conclude).*?[.!?])\s+([\s\S]+)$/i);
        if (reasoningWithConclusion) {
            const potentialThinking = reasoningWithConclusion[1].trim();
            const potentialResponse = reasoningWithConclusion[2].trim();
            
            // Check if the first part has thinking indicators
            const hasThinkingIndicators = /(?:user says|user asks|user wants|appropriate response|reasoning|according to|based on|need to|should|must)/i.test(potentialThinking);
            
            // Check if the second part is a direct response (starts with greeting, statement, etc.)
            const isDirectResponse = /^(?:Hello|Hi|Sure|Yes|No|I'?(?:ll|m|ve)|Let'?s|Here|The |This |That |It |You |We )/i.test(potentialResponse);
            
            if (hasThinkingIndicators && isDirectResponse && potentialResponse.length > 10) {
                thinkContent = potentialThinking;
                content = potentialResponse;
                return { thinkContent, content };
            }
        }
        
        // Priority 2.5: Detect meta-reasoning about what to say
        // Pattern: "The system instruction says... We should... [reasoning about response]" followed by actual response
        // Key indicator: reasoning talks ABOUT what to say, then says it
        
        console.log("Checking Priority 2.5 - meta-reasoning");
        
        // Split into sentences to find the boundary between reasoning and actual content
        if (/(?:system instruction|we should|we need to|we can|appropriate|tone|friendly|concise|we must|provide|reasoning|inside tags)/i.test(text)) {
            console.log("Meta-reasoning keywords detected");
            
            // Split by sentence endings (. ! ?)
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
            
            console.log("Total sentences:", sentences.length);
            if (sentences.length >= 2) {
                // Find the last sentence that contains meta-reasoning keywords
                let lastReasoningIndex = -1;
                const reasoningKeywords = /(?:system instruction|we should|we need to|we can mention|we must|appropriate|tone|friendly|concise|brief|intro|let's|provide|reasoning|inside tags|outside tags|optimized|designed|trained|deeplearning|meta)/i;
                
                for (let i = 0; i < sentences.length; i++) {
                    if (reasoningKeywords.test(sentences[i])) {
                        lastReasoningIndex = i;
                        console.log(`Reasoning sentence ${i}:`, sentences[i].substring(0, 50));
                    }
                }
                
                console.log("Last reasoning index:", lastReasoningIndex);
                
                // If we found reasoning sentences, split there
                if (lastReasoningIndex >= 0 && lastReasoningIndex < sentences.length - 1) {
                    const thinkingPart = sentences.slice(0, lastReasoningIndex + 1).join(' ').trim();
                    const responsePart = sentences.slice(lastReasoningIndex + 1).join(' ').trim();
                    
                    console.log("Thinking part length:", thinkingPart.length);
                    console.log("Response part length:", responsePart.length);
                    console.log("Response part preview:", responsePart.substring(0, 100));
                    
                    // Validate that response part is substantial and looks like actual content
                    const hasSubstantialResponse = responsePart.length > 20;
                    // Check if response starts with a proper statement (not meta-reasoning)
                    const startsWithProperResponse = /^[A-Z][a-z]+(?:\s+is|\s+was|\s+uses|\s+can|\s+has|\s+provides)/i.test(responsePart);
                    
                    if (hasSubstantialResponse && startsWithProperResponse) {
                        console.log("Priority 2.5 matched - splitting meta-reasoning");
                        thinkContent = thinkingPart;
                        content = responsePart;
                        return { thinkContent, content };
                    }
                }
            }
        }
        
        // Alternative: Look for "The user says..." pattern followed by reasoning, then response
        // This handles cases like: 'The user says "hi". The appropriate response is a friendly greeting. Hello!'
        // We need to find where the reasoning ends and the actual response begins
        
        if (text.match(/^The user (?:says|asks|wants|requests|is asking|mentions|states|provides)/i)) {
            // Split by sentences (periods followed by space and capital letter or newlines)
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
            
            if (sentences.length >= 2) {
                // Try different split points to find the boundary
                for (let i = 1; i < sentences.length; i++) {
                    const thinkingPart = sentences.slice(0, i).join('').trim();
                    const responsePart = sentences.slice(i).join('').trim();
                    
                    // Check if thinking part has reasoning indicators
                    const hasReasoningIndicators = /(?:user says|user asks|appropriate|reasoning|should|need to|according to|based on|system|context|instructions)/i.test(thinkingPart);
                    
                    // Check if response part looks like a direct user-facing response
                    const responseStarts = /^(?:Hello|Hi|Sure|Yes|No|I'?(?:ll|m|ve|d)|Let'?s|Here'?s?|Thank|Welcome|Of course|Certainly|Absolutely|Great|Perfect|The |This |That |It'?s?|You |We )/i.test(responsePart);
                    
                    if (hasReasoningIndicators && responseStarts && responsePart.length > 10) {
                        thinkContent = thinkingPart;
                        content = responsePart;
                        return { thinkContent, content };
                    }
                }
            }
        }
        
        // Generic thinking indicators for other patterns
        const thinkingIndicators = [
            /^(Let me (think|analyze|consider|examine|look|check|review).*?[.!?])\s+([\s\S]+)$/i,
            /^(I (?:need to|should|must|will|can|have to).*?[.!?])\s+([\s\S]+)$/i,
            /^((?:According to|Based on|Given that|Considering).*?[.!?])\s+([\s\S]+)$/i,
            /^((?:First,|To start,|Initially,).*?[.!?])\s+([\s\S]+)$/i,
            /^((?:My reasoning|The reasoning|The approach).*?[.!?])\s+([\s\S]+)$/i
        ];

        // Check each pattern
        for (const pattern of thinkingIndicators) {
            const match = text.match(pattern);
            if (match && match[1] && match[2]) {
                const thinkingPart = match[1].trim();
                const remainingText = match[2].trim();
                
                // Only treat as thinking if there's substantial response content after
                if (remainingText.length > 20) {
                    thinkContent = thinkingPart;
                    content = remainingText;
                    return { thinkContent, content };
                }
            }
        }

        // Priority 3: Detect multi-part responses with reasoning structure
        // Pattern: "reasoning sentences... \n\n actual response"
        // or "reasoning... Let's/Now/So [action verb]"
        const structuralSplit = text.split(/\n\n+/);
        if (structuralSplit.length >= 2) {
            const firstPart = structuralSplit[0].trim();
            const remainingParts = structuralSplit.slice(1).join('\n\n').trim();
            
            // Check if first part contains thinking keywords
            const thinkingKeywords = [
                'user says', 'user asks', 'user wants', 'user is',
                'i need to', 'i should', 'i must', 'i will',
                'let me', 'according to', 'based on', 'given',
                'first', 'to start', 'initially',
                'my reasoning', 'the reasoning', 'the approach',
                'considering', 'analyzing', 'examining'
            ];
            
            const hasThinkingKeyword = thinkingKeywords.some(keyword => 
                firstPart.toLowerCase().includes(keyword)
            );
            
            // Check if remaining parts look like direct response
            const responseIndicators = [
                /^(Hello|Hi|Sure|Yes|No|Of course|Certainly|Here|Okay|Let's|Now|So,|I'll help)/i,
                /^[A-Z][^.!?]*\s+(is|are|was|were|will|can|should|has|have|does)/,
                /^[A-Z][^.!?]*\.(?: [A-Z]|$)/
            ];
            
            const hasResponseIndicator = responseIndicators.some(pattern => 
                pattern.test(remainingParts)
            );
            
            if (hasThinkingKeyword && hasResponseIndicator && remainingParts.length > 20) {
                thinkContent = firstPart;
                content = remainingParts;
                return { thinkContent, content };
            }
        }

        // Priority 4: Detect sentences before action/response markers
        // Look for transitions like "Let's", "Now", "So", "Therefore"
        const transitionMatch = text.match(/([\s\S]*?)\s+(?:Let's|Now|So,|Therefore|Thus|Hence|As a result|In summary)\s+([\s\S]+)/i);
        if (transitionMatch) {
            const beforeTransition = transitionMatch[1].trim();
            const afterTransition = transitionMatch[2].trim();
            
            // Check if before transition has thinking characteristics
            const hasThinkingChar = /(?:user|need|should|according|based on|considering|analyzing)/i.test(beforeTransition);
            
            if (hasThinkingChar && beforeTransition.length > 30 && afterTransition.length > 30) {
                thinkContent = beforeTransition;
                content = afterTransition;
                return { thinkContent, content };
            }
        }

        // No thinking pattern detected - return as-is
        console.log("No pattern matched - returning original text");
        
        // Final safety check: ensure content is never empty
        if (!content || content.trim().length === 0) {
            console.warn("WARNING: Content is empty! Returning original text.");
            content = text;
            thinkContent = null;
        }
        
        console.log("=== parseResponse result ===");
        console.log("Has thinking:", !!thinkContent);
        console.log("Content length:", content.length);
        
        return { thinkContent, content };
    }

    function appendMessage({ role = 'assistant', text = '', typing = false }) {
        const msg = document.createElement('div');
        msg.className = 'msg' + (role === 'user' ? ' user' : '');
        msg.setAttribute('role', 'article');

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        // Display "User:" for user messages, "Dicta:" for assistant messages
        avatar.textContent = role === 'user' ? 'User:' : 'Dicta:';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        if (typing) {
            const t = document.createElement('div');
            t.className = 'typing';
            t.innerHTML = '<span></span><span></span><span></span>';
            bubble.appendChild(t);
        } else {
            const parsed = parseResponse(text);
            const thinkContent = parsed.thinkContent;
            const content = parsed.content;

            if (thinkContent) {
                // If thinking content exists, we treat it as a separate message component in the UI logic
                // First message component: Thinking
                const thinkBlock = createThinkingBlock(thinkContent);
                
                // Add separation
                const separator = document.createElement('hr');
                separator.className = 'message-separator';

                bubble.appendChild(thinkBlock);
                bubble.appendChild(separator);
            }
            
            // Second message component: Final response
            const contentDiv = document.createElement('div');
            contentDiv.className = 'response-message';
            // Render markdown with all enhancements
            const renderedHtml = renderMarkdown(content);
            contentDiv.innerHTML = renderedHtml;

            // Detect and apply RTL direction if needed
            if (detectRTL(content)) {
                contentDiv.setAttribute('dir', 'rtl');
            } else {
                contentDiv.setAttribute('dir', 'ltr');
            }
            bubble.appendChild(contentDiv);
        }

        msg.appendChild(avatar);
        msg.appendChild(bubble);
        messagesEl.appendChild(msg);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // Process any mermaid diagrams and syntax highlighting in the new content (if not typing)
        if (!typing) {
            processMermaidDiagrams();
            processCodeHighlighting();
        }

        return { msg, bubble };
    }
    function simulateReply(userText) {
        const { msg, bubble } = appendMessage({ role: 'assistant', typing: true });

        setTimeout(async () => {
            const reply = await generateReply(userText);
            console.log("Raw API Reply:", reply); // Debug logging

            // Clear the typing indicator
            bubble.innerHTML = '';
            
            const parsed = parseResponse(reply);
            console.log("Parsed Response:", parsed); // Debug logging

            const thinkContent = parsed.thinkContent;
            const content = parsed.content;
            
            if (thinkContent) {
                // First message component: Thinking
                const thinkBlock = createThinkingBlock(thinkContent);
                
                // Add separation
                const separator = document.createElement('hr');
                separator.className = 'message-separator';

                bubble.appendChild(thinkBlock);
                bubble.appendChild(separator);
            }

            // Second message component: Final response
            const contentDiv = document.createElement('div');
            contentDiv.className = 'response-message';
            // Render markdown with all enhancements
            const renderedHtml = renderMarkdown(content);
            contentDiv.innerHTML = renderedHtml;

            // Detect and apply RTL direction if needed
            if (detectRTL(content)) {
                contentDiv.setAttribute('dir', 'rtl');
            } else {
                contentDiv.setAttribute('dir', 'ltr');
            }
            bubble.appendChild(contentDiv);

            messagesEl.scrollTop = messagesEl.scrollHeight;

            // Process any mermaid diagrams and syntax highlighting in the new content
            processMermaidDiagrams();
            processCodeHighlighting();
        }, 900 + Math.min(2000, userText.length * 30));
    }

    // State for conversation history
    let conversationHistory = [
        {
            content: "You are DictaLM, a helpful AI assistant. When answering, you MUST first provide your internal reasoning or thought process wrapped in <think> tags, followed by your final response to the user outside the tags. Example: <think>Reasoning here...</think> Final answer here.",
            role: "system"
        }
    ];

    async function generateReply(input) {
        try {
            // Add user message to history
            conversationHistory.push({
                content: input,
                role: "user"
            });

            // Use local BricksLLM proxy endpoint with custom provider path
            // The path must match what BricksLLM exposes for custom providers:
            // /api/custom/providers/:provider_name/*path
            const response = await fetch("http://localhost:8002/api/custom/providers/llama-cpp-root/chat/completions", {
                method: "POST",
                headers: {
                    // Use the key configured for the custom provider
                    "Authorization": "Bearer sk-bricksllm-frontend-llama-key-explicit", 
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    // Use the model configured in Llama.cpp/BricksLLM
                    model: "dictalm-3.0-24b-thinking-fp8-q4_k_m.gguf", 
                    messages: conversationHistory
                }),
            });

            if (!response.ok) {
                 throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const body = await response.json();
            const content = body?.choices?.[0]?.message?.content;
            const replyContent = content ?? "No content returned from API.";
            
            // Parse the response to separate thinking from final answer
            const parsed = parseResponse(replyContent);
            
            // Add ONLY the final answer to conversation history (not the reasoning)
            // This prevents reasoning from appearing in follow-up message contexts
            conversationHistory.push({
                content: parsed.content,
                role: "assistant"
            });

            return replyContent;
        } catch (err) {
            console.error(err);
            return `Error: ${err.message || err}. Ensure BricksLLM is running on port 8002.`;
        }
    }
    // Initial message
    sendBtn.addEventListener('click', () => {
        const value = input.value.trim();
        if (!value) return;
        appendMessage({ role: 'user', text: value });
        input.value = '';
        simulateReply(value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    clearBtn.addEventListener('click', () => {
        // Clear messages and keep a starter message
        messagesEl.innerHTML = '';
        // Reset conversation history
        conversationHistory = [
            {
                content: "You are DictaLM, a helpful AI assistant. When answering, you MUST first provide your internal reasoning or thought process wrapped in <think> tags, followed by your final response to the user outside the tags. Example: <think>Reasoning here...</think> Final answer here.",
                role: "system"
            }
        ];
        appendMessage({ role: 'assistant', text: "Conversation cleared. How can I help you today?" });
    });

    // initial focus
    input.focus();

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
                // Apply syntax highlighting to preview
                processCodeHighlighting();
                processMermaidDiagrams();
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
            // Apply syntax highlighting to updated preview
            processCodeHighlighting();
            processMermaidDiagrams();
        }
    });

    // Theme Selector with Cloudflare CDN and integrity hashes
    const themes = [
        {
            name: 'atom-one-dark',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
            integrity: 'sha512-Jk4AqjWsdSzSWCSuQTfYRIF84Rq/eV0G2+tu07byYwHcbTGfdmLrHjUSwvzp5HvbiqK4ibmNwdcG49Y5RGYPTg=='
        },
        {
            name: 'github-dark',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
            integrity: 'sha512-rqDYGMkLw4i0TNfFUS+vBlo2hduyiLx6PYwFKwY3e4VPeVIHtWgFBUZIs5vLS/xJiDLAzb8vZbG9TBPjZ3zaSA=='
        },
        {
            name: 'monokai',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai.min.css',
            integrity: 'sha512-xIFS2s5U8ToE8f5hAFxf2L1P+rmVqo5xfPG7b5FWKZ3Mc8iVFqAfI4mLjRbfAYQS3AxCL9BFJsS0FxlrOmMLxA=='
        },
        {
            name: 'dracula',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/dracula.min.css',
            integrity: 'sha512-x6zKi8mSkCt+TOlSnqSAST1LqMxPFLIzxzhvqiJ3k8rDEgZhcwb9ckLPD0ckJqS6hG1H6eBLB75VpIJPdAMmwQ=='
        },
        {
            name: 'vs2015',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css',
            integrity: 'sha512-w8aclkBlN3Ha08SMwFKXFJqhSUx2qlvTBFLLelF8sm4xQnlg64qmGB/A6pBIKy0W8Bo51yDMDtQiPLNRq1WMcQ=='
        }
    ];

    let currentThemeIndex = 0;
    const themeBtn = document.getElementById('themeBtn');

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            currentThemeIndex = (currentThemeIndex + 1) % themes.length;
            const themeLink = document.getElementById('hljs-theme');
            if (themeLink) {
                const theme = themes[currentThemeIndex];
                // Remove old attributes that might cause issues
                themeLink.removeAttribute('integrity');
                themeLink.removeAttribute('crossorigin');
                // Set new URL (HTTPS provides transport security)
                themeLink.href = theme.url;
                console.log('🎨 Switched to theme:', theme.name);
            }
        });
    }

    console.log('✅ App initialization complete!');
    console.log('  Send button:', sendBtn);
    console.log('  Input field:', input);
    console.log('  Messages container:', messagesEl);
}

// Initialize the app after all scripts are loaded
// Use window.onload to ensure ALL external scripts (including CDN) are loaded
window.addEventListener('load', function() {
    console.log('🔄 Window loaded, starting initialization...');
    initializeApp();
});


// // Chat completion (POST /chat/completions)
// const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
//   method: "POST",
//   headers: {
//     "Authorization": "Bearer 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",
//     "Content-Type": "application/json"
//   },
//   body: JSON.stringify({
//     "model": "deepseek/deepseek-chat-v3.1:free",
//     "messages": [
//       {
//         "content": "what is open source project ",
//         "role": "user"
//       }
//     ]
//   }),
// });

// const body = await response.json();
// // console.log(body);
// console.log(body.choices[0].message.content);
