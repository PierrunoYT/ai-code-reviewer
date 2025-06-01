export class ResponseParser {
  constructor(config) {
    this.config = config;
  }

  parseResponse(response) {
    try {
      // Handle different response formats from different providers
      let jsonStr = response;
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else if (jsonStr.startsWith('```json')) {
        // Handle case where JSON starts with ```json but may be incomplete
        const startIndex = jsonStr.indexOf('{');
        if (startIndex > -1) {
          jsonStr = jsonStr.substring(startIndex);
          // Remove any trailing ``` if present
          jsonStr = jsonStr.replace(/```\s*$/, '');
        }
      }
      
      // Clean up common JSON formatting issues
      jsonStr = this.cleanJsonString(jsonStr);
      
      // Try to repair truncated JSON if it fails to parse
      if (!this.isValidJson(jsonStr)) {
        jsonStr = this.repairTruncatedJson(jsonStr);
      }
      
      const parsed = JSON.parse(jsonStr);
      
      // Validate and sanitize the parsed response
      return this.validateAndSanitizeResponse(parsed);
    } catch (error) {
      console.error('❌ Failed to parse AI response as JSON:', error.message);
      console.error('Raw response length:', response?.length);
      console.error('Raw response preview:', response?.substring(0, 500));
      
      // Return fallback response immediately without complex repair
      return this.extractFallbackResponse(response);
    }
  }

  isValidJson(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  repairTruncatedJson(jsonStr) {
    console.warn('🔧 Attempting to repair truncated JSON...');
    
    let repaired = jsonStr.trim();
    
    // Remove any incomplete string at the end (common truncation pattern)
    // Look for: "key": "incomplete value without closing quote
    repaired = repaired.replace(/,?\s*"[^"]*":\s*"[^"]*$/, '');
    
    // Remove any incomplete object or array at the end
    repaired = repaired.replace(/,?\s*"[^"]*":\s*[\[{][^}\]]*$/, '');
    
    // Remove any incomplete key at the end
    repaired = repaired.replace(/,?\s*"[^"]*$/, '');
    
    // Remove trailing comma if present
    repaired = repaired.replace(/,\s*$/, '');
    
    // Count and balance braces and brackets
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    
    // Add missing closing characters
    repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
    
    console.warn(`🔧 Repaired JSON from ${jsonStr.length} to ${repaired.length} characters`);
    
    return repaired;
  }

  cleanJsonString(jsonStr) {
    return jsonStr
      .trim()
      // Remove any leading/trailing non-JSON content
      .replace(/^[^{]*/, '')
      .replace(/[^}]*$/, '')
      // Fix common JSON issues
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
      .replace(/:\s*'([^']*)'/g, ': "$1"') // Convert single quotes to double quotes
      .replace(/\\n/g, '\\\\n') // Escape newlines properly
      .replace(/\n/g, '\\n'); // Convert actual newlines to escaped newlines
  }

  validateAndSanitizeResponse(parsed) {
    const response = {
      score: this.validateScore(parsed.score),
      confidence: this.validateConfidence(parsed.confidence),
      summary: this.sanitizeString(parsed.summary) || 'No summary provided',
      issues: this.validateIssues(parsed.issues || []),
      suggestions: this.validateStringArray(parsed.suggestions || []),
      security: this.validateStringArray(parsed.security || []),
      performance: this.validateStringArray(parsed.performance || []),
      dependencies: this.validateStringArray(parsed.dependencies || []),
      accessibility: this.validateStringArray(parsed.accessibility || []),
      sources: this.validateStringArray(parsed.sources || [])
    };

    return response;
  }

  validateScore(score) {
    const num = parseInt(score);
    if (isNaN(num) || num < 1 || num > 10) {
      return 5; // Default to middle score
    }
    return num;
  }

  validateConfidence(confidence) {
    const num = parseInt(confidence);
    if (isNaN(num) || num < 1 || num > 10) {
      return 5; // Default to middle confidence
    }
    return num;
  }

  validateIssues(issues) {
    if (!Array.isArray(issues)) return [];
    
    return issues
      .filter(issue => issue && typeof issue === 'object')
      .map(issue => ({
        severity: this.validateSeverity(issue.severity),
        description: this.sanitizeString(issue.description) || 'No description provided',
        suggestion: this.sanitizeString(issue.suggestion) || '',
        category: this.validateCategory(issue.category),
        citation: this.sanitizeString(issue.citation) || '',
        autoFixable: Boolean(issue.autoFixable)
      }))
      .slice(0, 20); // Limit to prevent excessive output
  }

  validateSeverity(severity) {
    const validSeverities = ['critical', 'high', 'medium', 'low'];
    if (typeof severity === 'string' && validSeverities.includes(severity.toLowerCase())) {
      return severity.toLowerCase();
    }
    return 'medium'; // Default severity
  }

  validateCategory(category) {
    const validCategories = [
      'security', 'performance', 'quality', 'style', 
      'testing', 'documentation', 'accessibility', 'dependencies'
    ];
    if (typeof category === 'string' && validCategories.includes(category.toLowerCase())) {
      return category.toLowerCase();
    }
    return 'quality'; // Default category
  }

  validateStringArray(arr) {
    if (!Array.isArray(arr)) return [];
    
    return arr
      .filter(item => typeof item === 'string' && item.trim().length > 0)
      .map(item => this.sanitizeString(item))
      .slice(0, 15); // Limit array size
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    
    return str
      .trim()
      .substring(0, 1000) // Limit length
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  extractFallbackResponse(response) {
    // Try to extract useful information from a non-JSON response
    const text = String(response || '').substring(0, 2000);
    
    // Look for score patterns
    const scoreMatch = text.match(/score[:\s]*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
    
    // Look for confidence patterns
    const confidenceMatch = text.match(/confidence[:\s]*(\d+)/i);
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 5;
    
    // Extract summary from first meaningful paragraph
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const summary = sentences[0]?.trim().substring(0, 200) || 'AI review completed with limited parsing';
    
    // Look for issues or problems mentioned
    const issues = [];
    const issueKeywords = ['error', 'problem', 'issue', 'vulnerability', 'security', 'bug'];
    const lowercaseText = text.toLowerCase();
    
    issueKeywords.forEach(keyword => {
      if (lowercaseText.includes(keyword)) {
        issues.push({
          severity: 'medium',
          description: `Potential ${keyword} detected in code review`,
          suggestion: 'Manual review recommended',
          category: 'quality',
          citation: '',
          autoFixable: false
        });
      }
    });
    
    return {
      score: Math.max(1, Math.min(10, score)),
      confidence: Math.max(1, Math.min(10, confidence)),
      summary,
      issues: issues.slice(0, 5),
      suggestions: ['Manual review recommended due to parsing issues'],
      security: [],
      performance: [],
      dependencies: [],
      accessibility: [],
      sources: []
    };
  }

  combineChunkReviews(chunkReviews, commit) {
    if (chunkReviews.length === 0) {
      return this.getFallbackReview();
    }

    if (chunkReviews.length === 1) {
      return chunkReviews[0];
    }

    // Combine multiple chunk reviews into a single comprehensive review
    const validReviews = chunkReviews.filter(review => review && review.score);
    
    if (validReviews.length === 0) {
      return this.getFallbackReview();
    }

    // Calculate average scores
    const avgScore = Math.round(
      validReviews.reduce((sum, review) => sum + review.score, 0) / validReviews.length
    );
    
    const avgConfidence = Math.round(
      validReviews.reduce((sum, review) => sum + review.confidence, 0) / validReviews.length
    );

    // Combine and deduplicate issues
    const allIssues = validReviews.flatMap(review => review.issues || []);
    const uniqueIssues = this.deduplicateIssues(allIssues);

    // Combine suggestions, removing duplicates
    const allSuggestions = validReviews.flatMap(review => review.suggestions || []);
    const uniqueSuggestions = [...new Set(allSuggestions)];

    // Combine other arrays
    const security = [...new Set(validReviews.flatMap(review => review.security || []))];
    const performance = [...new Set(validReviews.flatMap(review => review.performance || []))];
    const dependencies = [...new Set(validReviews.flatMap(review => review.dependencies || []))];
    const accessibility = [...new Set(validReviews.flatMap(review => review.accessibility || []))];
    const sources = [...new Set(validReviews.flatMap(review => review.sources || []))];

    // Create combined summary
    const summaries = validReviews.map(review => review.summary).filter(s => s);
    const combinedSummary = `Large diff review (${Math.round((commit.diffSize || 0) / 1024)}KB): ${summaries.join('; ')}`;

    return {
      score: avgScore,
      confidence: avgConfidence,
      summary: combinedSummary,
      issues: uniqueIssues.slice(0, 20),
      suggestions: [
        'This review was performed on a large diff using chunked analysis',
        'Consider breaking large commits into smaller, focused changes',
        ...uniqueSuggestions
      ].slice(0, 15),
      security,
      performance,
      dependencies,
      accessibility,
      sources
    };
  }

  deduplicateIssues(issues) {
    const seen = new Set();
    return issues.filter(issue => {
      const key = `${issue.severity}-${issue.description}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  getFallbackReview() {
    return {
      score: 5,
      confidence: 3,
      summary: 'Unable to perform comprehensive AI review. Manual review recommended.',
      issues: [
        {
          severity: 'medium',
          description: 'AI review service encountered issues',
          suggestion: 'Please perform manual code review',
          category: 'system',
          citation: '',
          autoFixable: false
        }
      ],
      suggestions: ['Manual review recommended due to AI service issues'],
      security: [],
      performance: [],
      dependencies: [],
      accessibility: [],
      sources: []
    };
  }
}