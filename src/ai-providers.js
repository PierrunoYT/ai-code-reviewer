import axios from 'axios';

export class AIProviders {
  constructor(config) {
    this.config = config;
    this.provider = config.aiProvider || 'openai';
    this.apiKey = config.apiKey;
    this.model = config.model || this.getDefaultModel();
    
    // API endpoints allowlist for SSRF protection
    this.allowedEndpoints = {
      'openai': ['https://api.openai.com/v1/chat/completions'],
      'anthropic': [
        'https://api.anthropic.com/v1/messages',
        'https://api.anthropic.com/v1/messages/batches'
      ],
      'google': ['https://generativelanguage.googleapis.com/v1beta/models/']
    };
  }

  getDefaultModel() {
    switch (this.provider) {
      case 'openai':
        return 'gpt-4.1';
      case 'anthropic':
        return 'claude-sonnet-4-20250514';
      case 'google':
        return 'gemini-2.5-flash-preview-05-20';
      default:
        return 'gpt-4.1';
    }
  }

  async callOpenAI(prompt) {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    this.validateEndpoint(endpoint, 'openai');

    const payload = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert code reviewer. You MUST return ONLY valid, complete JSON in your response. Do not wrap the JSON in markdown code blocks or backticks. Do not include any text outside the JSON object. Start your response directly with { and end with }. Ensure the JSON is properly formatted and not truncated.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: parseInt(this.config.maxTokens) || 16000,
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(endpoint, payload, { headers, timeout: 60000 });
    return response.data.choices[0].message.content;
  }

  async callAnthropic(prompt) {
    const endpoint = 'https://api.anthropic.com/v1/messages';
    this.validateEndpoint(endpoint, 'anthropic');

    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];

    // Add extended thinking if enabled
    if (this.config.enableExtendedThinking) {
      messages[0].content += '\n\nPlease use extended thinking to provide deeper analysis.';
    }

    // Use a balanced token limit for output
    const configuredTokens = parseInt(this.config.maxTokens) || 16000;
    const maxOutputTokens = Math.min(configuredTokens, 16000); // Balanced limit for comprehensive responses
    
    console.log(`🔧 Using balanced max_tokens: ${maxOutputTokens} (config: ${this.config.maxTokens}, model: ${this.model})`);
    
    const payload = {
      model: this.model,
      max_tokens: maxOutputTokens,
      messages: messages,
      system: "You are an expert code reviewer. Return valid JSON only. Be concise but thorough.",
      temperature: 0.1
    };

    const headers = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };

    const response = await axios.post(endpoint, payload, { headers, timeout: 60000 });
    const responseText = response.data.content[0].text;
    
    // Remove verbose debug output that might interfere with display
    // console.log(`📊 Response stats: ${responseText.length} chars, ends with: "${responseText.slice(-50)}"`);
    
    return responseText;
  }

  async callGoogle(prompt) {
    const modelEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    this.validateEndpoint(modelEndpoint, 'google');

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert code reviewer. You MUST return ONLY valid, complete JSON in your response. Do not wrap the JSON in markdown code blocks or backticks. Do not include any text outside the JSON object. Start your response directly with { and end with }. Ensure the JSON is properly formatted and not truncated.\n\n${prompt}`
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: parseInt(this.config.maxTokens) || 16000,
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const response = await axios.post(
      `${modelEndpoint}?key=${this.apiKey}`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    return response.data.candidates[0].content.parts[0].text;
  }

  async reviewMultipleCommits(commits, diffs) {
    if (this.provider !== 'anthropic') {
      // Fallback to sequential processing for non-Anthropic providers
      console.log('Batch processing failed, falling back to sequential processing');
      const reviews = [];
      for (let i = 0; i < commits.length; i++) {
        const review = await this.reviewCode(diffs[i], commits[i]);
        reviews.push(review);
      }
      return reviews;
    }

    // Anthropic batch processing
    try {
      const batchRequests = commits.map((commit, index) => ({
        custom_id: `review-${commit.hash}`,
        params: {
          model: this.model,
          max_tokens: parseInt(this.config.maxTokens) || 16000,
          messages: [
            {
              role: 'user',
              content: this.buildPrompt(diffs[index], commit)
            }
          ],
          system: "You are an expert code reviewer. You MUST return ONLY valid, complete JSON in your response. Do not wrap the JSON in markdown code blocks or backticks. Do not include any text outside the JSON object. Start your response directly with { and end with }. Ensure the JSON is properly formatted and not truncated."
        }
      }));

      const batchPayload = {
        requests: batchRequests
      };

      const headers = {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      };

      // Create batch
      const batchResponse = await axios.post(
        'https://api.anthropic.com/v1/messages/batches',
        batchPayload,
        { headers, timeout: 60000 }
      );

      const batchId = batchResponse.data.id;

      // Poll for completion
      let batchStatus = 'processing';
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max

      while (batchStatus === 'processing' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusResponse = await axios.get(
          `https://api.anthropic.com/v1/messages/batches/${batchId}`,
          { headers }
        );

        batchStatus = statusResponse.data.processing_status;
        const requestCounts = statusResponse.data.request_counts;
        
        console.log(`Batch status: ${batchStatus}, requests: ${JSON.stringify(requestCounts)}`);
        attempts++;
      }

      if (batchStatus !== 'ended') {
        throw new Error(`Batch processing timeout or failed. Status: ${batchStatus}`);
      }

      // Retrieve results
      const resultsResponse = await axios.get(
        `https://api.anthropic.com/v1/messages/batches/${batchId}/results`,
        { headers }
      );

      // Parse and sort results to match original order
      const results = resultsResponse.data;
      const reviews = new Array(commits.length);

      for (const result of results) {
        if (result.result && result.result.type === 'succeeded') {
          const commitIndex = commits.findIndex(c => result.custom_id === `review-${c.hash}`);
          if (commitIndex !== -1) {
            const responseText = result.result.message.content[0].text;
            reviews[commitIndex] = this.parseResponse(responseText);
          }
        }
      }

      // Fill any missing reviews with fallback
      for (let i = 0; i < reviews.length; i++) {
        if (!reviews[i]) {
          reviews[i] = this.getFallbackReview();
        }
      }

      return reviews;
    } catch (error) {
      console.error('Batch processing error:', error.message);
      console.log('Falling back to sequential processing...');
      
      // Fallback to sequential processing
      const reviews = [];
      for (let i = 0; i < commits.length; i++) {
        const review = await this.reviewCode(diffs[i], commits[i]);
        reviews.push(review);
      }
      return reviews;
    }
  }

  validateEndpoint(endpoint, provider) {
    const allowed = this.allowedEndpoints[provider] || [];
    const isAllowed = allowed.some(allowedEndpoint => 
      endpoint.startsWith(allowedEndpoint)
    );

    if (!isAllowed) {
      throw new Error(`Endpoint not allowed: ${endpoint}`);
    }
  }

  getFallbackReview() {
    return {
      score: 5,
      confidence: 3,
      summary: 'Unable to perform AI review due to API issues. Manual review recommended.',
      issues: [
        {
          severity: 'medium',
          description: 'AI review service unavailable',
          suggestion: 'Please perform manual code review',
          category: 'system'
        }
      ],
      suggestions: ['Manual review recommended due to AI service unavailability'],
      security: [],
      performance: [],
      dependencies: [],
      accessibility: [],
      sources: []
    };
  }
}