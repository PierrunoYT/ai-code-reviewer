import { AIProviders } from './ai-providers.js';
import { RateLimiter } from './rate-limiter.js';
import { PromptBuilder } from './prompt-builder.js';
import { ResponseParser } from './response-parser.js';

export class AIReviewer {
  constructor(config) {
    this.config = config;
    this.validateConfig(config);
    
    // Initialize modules
    this.aiProviders = new AIProviders(config);
    this.rateLimiter = new RateLimiter({
      minRequestInterval: 1000,
      maxRequestsPerMinute: 60,
      ...config.rateLimiting
    });
    this.promptBuilder = new PromptBuilder(config);
    this.responseParser = new ResponseParser(config);
    
    // Store config properties for easy access
    this.apiKey = config.apiKey;
    this.provider = config.aiProvider || 'openai';
  }

  validateConfig(config) {
    if (!config) {
      throw new Error('Configuration is required');
    }

    // Validate API key based on provider
    const provider = config.aiProvider || 'openai';
    let apiKey = config.apiKey;

    if (!apiKey) {
      // Try to get API key from environment variables
      switch (provider) {
        case 'anthropic':
          apiKey = process.env.ANTHROPIC_API_KEY;
          break;
        case 'openai':
          apiKey = process.env.OPENAI_API_KEY;
          break;
        case 'google':
          apiKey = process.env.GOOGLE_API_KEY;
          break;
        default:
          apiKey = process.env.AI_API_KEY; // Fallback
      }
    }

    if (!apiKey) {
      throw new Error(`API key not found for provider '${provider}'. Set the appropriate environment variable.`);
    }

    // Store the API key back to config
    config.apiKey = apiKey;

    // Validate other config options
    if (config.maxTokens && (config.maxTokens < 100 || config.maxTokens > 64000)) {
      throw new Error('maxTokens must be between 100 and 64000');
    }

    if (config.retryAttempts && (config.retryAttempts < 1 || config.retryAttempts > 10)) {
      throw new Error('retryAttempts must be between 1 and 10');
    }
  }

  async reviewCode(diff, commit) {
    // Validate inputs
    this.validateInputs(diff, commit);
    
    if (!this.apiKey) {
      throw new Error('AI API key not found. Set AI_API_KEY environment variable.');
    }

    // Handle large diffs by chunking
    const maxDiffSize = 100000; // 100KB
    if (diff.length > maxDiffSize) {
      console.log(`📦 Diff is large (${Math.round(diff.length / 1024)}KB), using chunked review approach...`);
      return await this.reviewLargeDiff(diff, commit);
    }

    // Apply rate limiting
    await this.rateLimiter.applyRateLimit();

    const prompt = this.promptBuilder.buildPrompt(diff, commit);
    
    try {
      let response;
      
      switch (this.provider) {
        case 'openai':
          response = await this.aiProviders.callOpenAI(prompt);
          break;
        case 'anthropic':
          response = await this.aiProviders.callAnthropic(prompt);
          break;
        case 'google':
          response = await this.aiProviders.callGoogle(prompt);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${this.provider}`);
      }

      return this.responseParser.parseResponse(response);
    } catch (error) {
      console.error('AI API Error:', error.message);
      return this.responseParser.getFallbackReview();
    }
  }

  async reviewCodeWithRetry(diff, commit, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.reviewCode(diff, commit);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          console.log(`📦 Review attempt ${attempt} failed: ${error.message}`);
          console.log(`⏳ Retrying in ${delay / 1000}s...`);
          await this.sleep(delay);
        }
      }
    }
    
    console.log(`📦 All retry attempts failed, using fallback review`);
    console.error('Final error:', lastError.message);
    return this.responseParser.getFallbackReview();
  }

  async reviewLargeDiff(diff, commit) {
    try {
      const chunks = this.chunkDiff(diff);
      console.log(`📦 Reviewing ${chunks.length} chunks...`);
      
      const chunkReviews = [];
      
      for (let i = 0; i < chunks.length; i++) {
        console.log(`📦 Reviewing chunk ${i + 1}/${chunks.length}...`);
        
        await this.rateLimiter.applyRateLimit();
        
        const chunkPrompt = this.promptBuilder.buildLargeDiffPrompt(i, chunks.length, chunks[i], commit);
        
        try {
          let response;
          switch (this.provider) {
            case 'openai':
              response = await this.aiProviders.callOpenAI(chunkPrompt);
              break;
            case 'anthropic':
              response = await this.aiProviders.callAnthropic(chunkPrompt);
              break;
            case 'google':
              response = await this.aiProviders.callGoogle(chunkPrompt);
              break;
          }
          
          const chunkReview = this.responseParser.parseResponse(response);
          chunkReviews.push(chunkReview);
        } catch (error) {
          console.warn(`Failed to review chunk ${i + 1}:`, error.message);
          chunkReviews.push(this.responseParser.getFallbackReview());
        }
      }
      
      // Store diff size for summary
      commit.diffSize = diff.length;
      
      return this.responseParser.combineChunkReviews(chunkReviews, commit);
    } catch (error) {
      console.error('Large diff review failed:', error.message);
      return this.responseParser.getFallbackReview();
    }
  }

  chunkDiff(diff) {
    const maxChunkSize = 80000; // 80KB chunks with buffer for prompt
    const chunks = [];
    
    // Try to split by file boundaries first
    const filePattern = /^diff --git a\/.+ b\/.+$/gm;
    const fileMatches = [...diff.matchAll(filePattern)];
    
    if (fileMatches.length > 1) {
      // Split by files
      let currentChunk = '';
      let currentFile = '';
      
      for (let i = 0; i < fileMatches.length; i++) {
        const match = fileMatches[i];
        const nextMatch = fileMatches[i + 1];
        
        const fileStart = match.index;
        const fileEnd = nextMatch ? nextMatch.index : diff.length;
        const fileContent = diff.substring(fileStart, fileEnd);
        
        if (currentChunk.length + fileContent.length > maxChunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = fileContent;
        } else {
          currentChunk += fileContent;
        }
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
    } else {
      // Split by lines if single file or no file boundaries found
      const lines = diff.split('\n');
      let currentChunk = '';
      
      for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = line + '\n';
        } else {
          currentChunk += line + '\n';
        }
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
    }
    
    return chunks.length > 0 ? chunks : [diff]; // Fallback to original diff if chunking fails
  }

  async reviewMultipleCommits(commits, diffs) {
    return this.aiProviders.reviewMultipleCommits(commits, diffs);
  }

  // Delegate methods to appropriate modules
  async applyRateLimit() {
    return this.rateLimiter.applyRateLimit();
  }

  parseResponse(response) {
    return this.responseParser.parseResponse(response);
  }

  async callOpenAI(prompt) {
    return this.aiProviders.callOpenAI(prompt);
  }

  async callAnthropic(prompt) {
    return this.aiProviders.callAnthropic(prompt);
  }

  async callGoogle(prompt) {
    return this.aiProviders.callGoogle(prompt);
  }

  // Utility methods
  validateInputs(diff, commit) {
    if (!diff || typeof diff !== 'string') {
      throw new Error('Diff must be a non-empty string');
    }
    
    if (!commit || typeof commit !== 'object') {
      throw new Error('Commit must be an object');
    }
    
    if (!commit.hash || !commit.message || !commit.author) {
      throw new Error('Commit must have hash, message, and author properties');
    }
    
    // Security: Limit input sizes to prevent abuse
    if (diff.length > 10 * 1024 * 1024) { // 10MB limit
      throw new Error('Diff too large (max 10MB)');
    }
    
    if (commit.message.length > 10000) {
      throw new Error('Commit message too long (max 10,000 characters)');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRequestStats() {
    return this.rateLimiter.getRequestStats();
  }
}