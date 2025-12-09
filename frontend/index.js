(() => {
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
        textSpan.textContent = content;
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

        // Priority 1: Check for explicit <think></think> tags (as per chat template)
        // This is the PRIMARY format the model should use based on chat_template.jinja2.template
        // Note: The chat template adds the opening <think> tag, so the model's response
        // may only contain the closing </think> tag followed by the actual response
        let thinkMatch = text.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/);
        if (thinkMatch) {
            thinkContent = thinkMatch[1].trim();
            content = thinkMatch[2].trim();
            console.log("Priority 1 matched - <think></think> tags found");
            console.log("Thinking content:", thinkContent.substring(0, 100));
            console.log("Response content:", content.substring(0, 100));
            return { thinkContent, content };
        }
        
        // Priority 1.5: Check for closing </think> tag only (chat template adds opening tag)
        thinkMatch = text.match(/([\s\S]*?)<\/think>([\s\S]*)/);
        if (thinkMatch) {
            thinkContent = thinkMatch[1].trim();
            content = thinkMatch[2].trim();
            console.log("Priority 1.5 matched - </think> tag found (template adds opening)");
            console.log("Thinking content:", thinkContent.substring(0, 100));
            console.log("Response content:", content.substring(0, 100));
            return { thinkContent, content };
        }

        console.log("No <think> tags found - checking for implicit patterns");

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
            // Ensure proper prefixing if needed, or rely on the avatar
            contentDiv.innerHTML = content.replace(/\n/g, '<br>');
            bubble.appendChild(contentDiv);
        }

        msg.appendChild(avatar);
        msg.appendChild(bubble);
        messagesEl.appendChild(msg);
        messagesEl.scrollTop = messagesEl.scrollHeight;
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
            contentDiv.innerHTML = content.replace(/\n/g, '<br>');
            bubble.appendChild(contentDiv);
            
            messagesEl.scrollTop = messagesEl.scrollHeight;
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
})();


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
