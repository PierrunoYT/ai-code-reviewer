export class RateLimiter {
  constructor(config = {}) {
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = config.minRequestInterval || 1000; // 1 second between requests
    this.maxRequestsPerMinute = config.maxRequestsPerMinute || 60;
    this.requestHistory = [];
  }

  async applyRateLimit() {
    const now = Date.now();
    
    // Clean old requests from history (older than 1 minute)
    this.requestHistory = this.requestHistory.filter(
      timestamp => now - timestamp < 60000
    );
    
    // Check if we're exceeding rate limits
    if (this.requestHistory.length >= this.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...this.requestHistory);
      const waitTime = 60000 - (now - oldestRequest);
      
      if (waitTime > 0) {
        console.log(`Rate limit reached. Waiting ${Math.round(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
      }
    }
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.sleep(waitTime);
    }
    
    // Record this request
    this.lastRequestTime = Date.now();
    this.requestHistory.push(this.lastRequestTime);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRequestStats() {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(
      timestamp => now - timestamp < 60000
    );
    
    return {
      requestsLastMinute: recentRequests.length,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      lastRequestTime: this.lastRequestTime,
      nextRequestAllowedAt: this.lastRequestTime + this.minRequestInterval
    };
  }

  reset() {
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.requestHistory = [];
  }
}