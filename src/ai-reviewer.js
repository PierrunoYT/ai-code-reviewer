import axios from 'axios';

export class AIReviewer {
  constructor(config) {
    this.config = config;
    this.validateConfig(config);
    this.apiKey = config.apiKey;
    this.provider = config.aiProvider || 'openai';
    this.model = config.model || this.getDefaultModel();
    this.enableWebSearch = config.enableWebSearch || false;
    this.enableExtendedThinking = config.enableExtendedThinking || false;
    this.enableCitations = config.enableCitations || false;
    
    // Rate limiting
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 second between requests
    this.maxRequestsPerMinute = 60;
    this.requestHistory = [];
  }

  getDefaultModel() {
    switch (this.provider) {
      case 'openai':
        return 'gpt-4.1'; // Latest GPT-4.1 model
      case 'anthropic':
        return 'claude-sonnet-4-20250514';
      case 'google':
        return 'gemini-2.5-flash-preview-05-20'; // Latest Gemini 2.5 Flash model
      default:
        return 'gpt-4.1';
    }
  }

  async reviewCode(diff, commit) {
    // Validate inputs
    this.validateInputs(diff, commit);
    
    if (!this.apiKey) {
      throw new Error('AI API key not found. Set AI_API_KEY environment variable.');
    }

    // Apply rate limiting
    await this.applyRateLimit();

    const prompt = this.buildPrompt(diff, commit);
    
    try {
      let response;
      
      switch (this.provider) {
        case 'openai':
          response = await this.callOpenAI(prompt);
          break;
        case 'anthropic':
          response = await this.callAnthropic(prompt);
          break;
        case 'google':
          response = await this.callGoogle(prompt);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${this.provider}`);
      }

      return this.parseResponse(response);
    } catch (error) {
      console.error('AI API Error:', error.message);
      return this.getFallbackReview();
    }
  }

  buildPrompt(diff, commit) {
    // Sanitize inputs to prevent prompt injection
    const sanitizedMessage = this.sanitizeText(commit.message);
    const sanitizedAuthor = this.sanitizeText(commit.author);
    const sanitizedDiff = this.sanitizeDiff(diff);
    
    const basePrompt = `You are an expert code reviewer. Please review the following git commit and provide feedback.

Commit Message: ${sanitizedMessage}
Author: ${sanitizedAuthor}
Date: ${commit.date}

Code Changes:
\`\`\`diff
${sanitizedDiff}
\`\`\`

Please analyze this commit and provide a structured review focusing on:
1. Code quality and maintainability
2. Security vulnerabilities (check against latest OWASP guidelines)
3. Performance implications
4. Best practices adherence (use current industry standards)
5. Testing considerations
6. Documentation needs
7. Accessibility considerations
8. Dependency security

${this.enableWebSearch ? 'Use web search to verify best practices and check for known security vulnerabilities in any dependencies mentioned.' : ''}

${this.enableCitations ? 'Provide citations for any security recommendations or best practices you mention.' : ''}

Format your response as JSON with this structure:
{
  "score": <number 1-10>,
  "summary": "<brief summary>",
  "issues": [
    {
      "severity": "low|medium|high|critical",
      "description": "<issue description>",
      "suggestion": "<how to fix>",
      "category": "security|performance|quality|style|testing|documentation",
      ${this.enableCitations ? '"citation": "<source URL or reference if applicable>",' : ''}
      "autoFixable": <boolean>
    }
  ],
  "suggestions": ["<general improvement suggestions>"],
  "security": ["<security-related notes>"],
  "performance": ["<performance-related notes>"],
  "dependencies": ["<dependency-related observations>"],
  "accessibility": ["<accessibility considerations>"],
  ${this.enableCitations ? '"sources": ["<list of sources consulted>"],' : ''}
  "confidence": <number 1-10 indicating confidence in the review>
}

Be constructive, specific, and provide actionable feedback. Focus on the most impactful improvements.`;

    return basePrompt;
  }

  async callOpenAI(prompt) {
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are a senior software engineer providing code reviews. Always respond with valid JSON. Be thorough and constructive in your analysis.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: this.config.maxTokens || 32768,
      temperature: 0.1,
      top_p: 0.99 // Updated default as per latest OpenAI recommendations
    };

    // Add web search tools if enabled
    if (this.enableWebSearch) {
      requestBody.tools = [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current best practices, security vulnerabilities, or documentation",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query"
                }
              },
              required: ["query"]
            }
          }
        }
      ];
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  async callAnthropic(prompt) {
    const requestBody = {
      model: this.model,
      max_tokens: this.config.maxTokens || 64000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      top_p: 0.99 // Updated default as per latest Anthropic recommendations
    };

    // Add extended thinking if enabled (Claude 4 models)
    if (this.enableExtendedThinking) {
      const maxTokens = this.config.maxTokens || 64000;
      // Budget must be less than max_tokens, so we use 75% of max_tokens or 48000, whichever is smaller
      const budgetTokens = Math.min(48000, Math.floor(maxTokens * 0.75));
      requestBody.thinking = {
        type: "enabled",
        budget_tokens: budgetTokens
      };
    }

    // Add web search tool if enabled (Claude 4 models support this)
    if (this.enableWebSearch) {
      requestBody.tools = [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5
        }
      ];
    }

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      requestBody,
      { headers }
    );

    // Handle response - extract text content from various block types
    if (response.data.content && Array.isArray(response.data.content)) {
      // Combine all text blocks, skipping thinking, tool use, and tool result blocks
      const textBlocks = response.data.content
        .filter(block => block.type === 'text')
        .map(block => block.text);

      return textBlocks.join(' ');
    }

    return response.data.content[0].text;
  }

  async callGoogle(prompt) {
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: this.config.maxTokens || 64000,
        temperature: 0.1,
        topP: 0.99
      }
    };

    // Add thinking configuration if enabled (Gemini 2.5 models)
    if (this.enableExtendedThinking) {
      requestBody.generationConfig.thinkingConfig = {
        includeThoughts: true
      };

      // Add thinking budget for Flash models
      if (this.model.includes('flash')) {
        const maxTokens = this.config.maxTokens || 64000;
        const budgetTokens = Math.min(48000, Math.floor(maxTokens * 0.75));
        requestBody.generationConfig.thinkingConfig.thinkingBudget = budgetTokens;
      }
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Handle response - extract text content, skipping thinking parts
    if (response.data.candidates && response.data.candidates[0].content.parts) {
      const textParts = response.data.candidates[0].content.parts
        .filter(part => part.text && !part.thought)
        .map(part => part.text);

      return textParts.join(' ');
    }

    return response.data.candidates[0].content.parts[0].text;
  }

  parseResponse(response) {
    try {
      // Remove markdown code block wrappers if present
      let cleanedResponse = response;

      // Handle ```json ... ``` blocks
      const markdownJsonMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (markdownJsonMatch) {
        cleanedResponse = markdownJsonMatch[1];
      }

      // Handle ``` ... ``` blocks (without language specifier)
      const markdownMatch = cleanedResponse.match(/```\s*([\s\S]*?)\s*```/);
      if (markdownMatch) {
        cleanedResponse = markdownMatch[1];
      }

      // Extract JSON object from the cleaned response
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Try parsing the cleaned response directly
      return JSON.parse(cleanedResponse.trim());
    } catch (error) {
      console.warn('Failed to parse AI response as JSON, using fallback');
      console.warn('Response was:', response.substring(0, 200) + '...');
      return this.getFallbackReview();
    }
  }

  getFallbackReview() {
    return {
      score: 7,
      summary: 'Review completed with basic analysis',
      issues: [],
      suggestions: ['Consider adding more tests', 'Ensure proper error handling'],
      security: [],
      performance: [],
      dependencies: [],
      accessibility: [],
      confidence: 5
    };
  }

  // Batch processing for multiple commits
  async reviewMultipleCommits(commits, diffs) {
    // Check if batch processing is enabled and we have multiple commits
    if (this.config.enableBatchProcessing && this.provider === 'anthropic' && commits.length > 1) {
      try {
        console.log(`Starting batch review for ${commits.length} commits...`);
        return await this.batchReviewAnthropic(commits, diffs);
      } catch (error) {
        console.warn('Batch processing failed, falling back to sequential:', error.message);
      }
    }

    // Fallback to sequential processing
    console.log(`Processing ${commits.length} commits sequentially...`);
    const reviews = [];
    for (let i = 0; i < commits.length; i++) {
      console.log(`Reviewing commit ${i + 1}/${commits.length}: ${commits[i].hash}`);
      const review = await this.reviewCode(diffs[i], commits[i]);
      reviews.push(review);
    }
    return reviews;
  }

  async batchReviewAnthropic(commits, diffs) {
    // Validate inputs
    if (!commits || !diffs || commits.length !== diffs.length) {
      throw new Error('Invalid commits or diffs provided for batch processing');
    }

    if (commits.length > 10000) {
      throw new Error('Batch size exceeds Anthropic API limit of 10,000 requests');
    }

    // Use Anthropic's batch processing API for efficiency
    const batchRequests = commits.map((commit, index) => ({
      custom_id: `review_${index}`,
      params: {
        model: this.model,
        max_tokens: this.config.maxTokens || 64000,
        messages: [
          {
            role: 'user',
            content: this.buildPrompt(diffs[index], commit)
          }
        ],
        // Add extended thinking if enabled
        ...(this.enableExtendedThinking && {
          thinking: {
            type: "enabled",
            budget_tokens: Math.min(48000, Math.floor((this.config.maxTokens || 64000) * 0.75))
          }
        }),
        // Add web search tool if enabled
        ...(this.enableWebSearch && {
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5
            }
          ]
        })
      }
    }));

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages/batches',
        {
          requests: batchRequests
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          }
        }
      );

      // Poll for completion and return results
      return this.pollBatchResults(response.data.id);
    } catch (error) {
      console.warn('Batch processing failed, falling back to sequential:', error.message);
      // Fallback to sequential processing
      const reviews = [];
      for (let i = 0; i < commits.length; i++) {
        const review = await this.reviewCode(diffs[i], commits[i]);
        reviews.push(review);
      }
      return reviews;
    }
  }

  async pollBatchResults(batchId) {
    const maxAttempts = 60; // Increased for longer processing times
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `https://api.anthropic.com/v1/messages/batches/${batchId}`,
          {
            headers: {
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01'
            }
          }
        );

        const batch = response.data;
        console.log(`Batch status: ${batch.processing_status}, requests: ${JSON.stringify(batch.request_counts)}`);

        if (batch.processing_status === 'ended') {
          // Fetch the results from the results URL
          return await this.fetchBatchResults(batch.results_url);
        }

        if (batch.processing_status === 'canceling' || batch.processing_status === 'canceled') {
          throw new Error('Batch processing was canceled');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.warn(`Batch polling attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt === maxAttempts - 1) {
          throw error;
        }
      }
    }

    throw new Error('Batch processing timed out after 5 minutes');
  }

  async fetchBatchResults(resultsUrl) {
    try {
      const response = await axios.get(resultsUrl, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      // Parse JSONL format (each line is a separate JSON object)
      const lines = response.data.trim().split('\n');
      const results = [];
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const result = JSON.parse(line);
            if (result.result && result.result.type === 'succeeded') {
              // Extract text content from the message
              const content = result.result.message.content;
              let textContent = '';
              
              if (Array.isArray(content)) {
                // Filter out thinking blocks and extract text
                const textBlocks = content.filter(block => block.type === 'text');
                textContent = textBlocks.map(block => block.text).join(' ');
              } else if (content.text) {
                textContent = content.text;
              }
              
              const parsedReview = this.parseResponse(textContent);
              results.push({
                custom_id: result.custom_id,
                review: parsedReview
              });
            } else {
              console.warn(`Request ${result.custom_id} failed:`, result.result);
              results.push({
                custom_id: result.custom_id,
                review: this.getFallbackReview()
              });
            }
          } catch (parseError) {
            console.warn('Failed to parse result line:', line, parseError.message);
          }
        }
      }
      
      // Sort results by custom_id to maintain order
      results.sort((a, b) => {
        const aIndex = parseInt(a.custom_id.replace('review_', '')) || 0;
        const bIndex = parseInt(b.custom_id.replace('review_', '')) || 0;
        return aIndex - bIndex;
      });
      
      return results.map(r => r.review);
    } catch (error) {
      console.error('Failed to fetch batch results:', error.message);
      throw error;
    }
  }

  // Enhanced error handling with retry logic
  async reviewCodeWithRetry(diff, commit, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.reviewCode(diff, commit);
      } catch (error) {
        console.warn(`Review attempt ${attempt} failed:`, error.message);

        if (attempt === maxRetries) {
          console.error('All retry attempts failed, using fallback review');
          return this.getFallbackReview();
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Validation methods
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration object');
    }
    
    if (config.aiProvider && !['openai', 'anthropic', 'google'].includes(config.aiProvider)) {
      throw new Error('Invalid AI provider. Must be one of: openai, anthropic, google');
    }
    
    if (config.maxTokens && (typeof config.maxTokens !== 'number' || config.maxTokens < 1 || config.maxTokens > 100000)) {
      throw new Error('Invalid maxTokens. Must be a number between 1 and 100000');
    }
  }

  validateInputs(diff, commit) {
    if (!diff || typeof diff !== 'string') {
      throw new Error('Invalid diff content');
    }
    
    if (!commit || typeof commit !== 'object') {
      throw new Error('Invalid commit object');
    }
    
    if (!commit.message || typeof commit.message !== 'string') {
      throw new Error('Invalid commit message');
    }
    
    if (!commit.author || typeof commit.author !== 'string') {
      throw new Error('Invalid commit author');
    }
    
    // Prevent extremely large diffs
    if (diff.length > 100000) {
      throw new Error('Diff too large. Maximum 100KB allowed');
    }
  }

  sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Remove potential prompt injection attempts
    return text
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/```/g, '\\`\\`\\`') // Escape code blocks
      .replace(/\${/g, '\\${') // Escape template literals
      .slice(0, 1000); // Limit length
  }

  sanitizeDiff(diff) {
    if (!diff || typeof diff !== 'string') return '';
    
    // Basic sanitization for diff content
    return diff
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .slice(0, 50000); // Limit diff size
  }

  // Rate limiting
  async applyRateLimit() {
    const now = Date.now();
    
    // Clean old requests from history
    this.requestHistory = this.requestHistory.filter(time => now - time < 60000);
    
    // Check rate limit
    if (this.requestHistory.length >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.requestHistory[0]);
      console.warn(`Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestHistory.push(this.lastRequestTime);
  }

  validateApiKey() {
    if (!this.apiKey || typeof this.apiKey !== 'string') {
      throw new Error('Invalid API key');
    }
    
    // Basic API key format validation
    switch (this.provider) {
      case 'openai':
        if (!this.apiKey.startsWith('sk-')) {
          throw new Error('Invalid OpenAI API key format');
        }
        break;
      case 'anthropic':
        if (!this.apiKey.startsWith('sk-ant-')) {
          throw new Error('Invalid Anthropic API key format');
        }
        break;
      case 'google':
        if (this.apiKey.length < 20) {
          throw new Error('Invalid Google API key format');
        }
        break;
    }
  }
}
