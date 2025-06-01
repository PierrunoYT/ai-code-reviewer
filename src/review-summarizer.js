import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export class ReviewSummarizer {
  constructor(config, aiReviewer) {
    this.config = config;
    this.aiReviewer = aiReviewer;
  }

  async summarizeReviews(options = {}) {
    try {
      console.log(chalk.blue('📊 Analyzing existing reviews for summary...'));
      
      const reviewsDir = options.reviewsDir || './code-reviews';
      const outputFile = options.output || path.join(reviewsDir, 'SUMMARY.md');
      
      if (!fs.existsSync(reviewsDir)) {
        console.log(chalk.yellow(`⚠️ Reviews directory not found: ${reviewsDir}`));
        console.log(chalk.blue('💡 Run some reviews first to generate data for summarization'));
        return;
      }
      
      const reviewFiles = this.findReviewFiles(reviewsDir);
      
      if (reviewFiles.length === 0) {
        console.log(chalk.yellow('⚠️ No review files found in the specified directory'));
        console.log(chalk.blue('💡 Run some reviews first to generate data for summarization'));
        return;
      }
      
      console.log(chalk.blue(`📋 Found ${reviewFiles.length} review files to analyze`));
      
      const reviewData = await this.parseReviewFiles(reviewFiles, options);
      
      if (reviewData.length === 0) {
        console.log(chalk.yellow('⚠️ No reviews match the specified filters'));
        return;
      }
      
      console.log(chalk.blue(`📊 Analyzing ${reviewData.length} reviews after filtering...`));
      
      console.log(chalk.blue(`🤖 Generating AI insights from review data...`));
      const aiInsights = await this.generateAIInsights(reviewData, options);
      
      const summary = this.generateReviewSummary(reviewData, options, aiInsights);
      
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(outputFile, summary, 'utf8');
      
      console.log(chalk.green(`✅ Review summary generated successfully!`));
      console.log(chalk.green(`📄 Summary saved to: ${outputFile}`));
      
      this.displaySummaryMetrics(reviewData);
      
    } catch (error) {
      console.error(chalk.red('❌ Error generating review summary:'), error.message);
      process.exit(1);
    }
  }

  findReviewFiles(reviewsDir) {
    const files = [];
    
    const scanDirectory = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md') && 
                     !entry.name.startsWith('SUMMARY') && 
                     !entry.name.startsWith('README')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Skipping directory: ${dir} (${error.message})`));
      }
    };
    
    scanDirectory(reviewsDir);
    return files.sort();
  }

  async parseReviewFiles(reviewFiles, options) {
    const reviewData = [];
    
    for (const filePath of reviewFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const review = this.parseMarkdownReview(content, filePath);
        
        if (review && this.matchesFilters(review, options)) {
          reviewData.push(review);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to parse review file: ${path.basename(filePath)}`));
      }
    }
    
    return reviewData;
  }

  parseMarkdownReview(content, filePath) {
    try {
      const review = {
        filePath,
        fileName: path.basename(filePath),
        score: null,
        confidence: null,
        summary: '',
        issues: [],
        suggestions: [],
        security: [],
        performance: [],
        dependencies: [],
        accessibility: [],
        commit: {},
        reviewType: 'commit',
        timestamp: null
      };
      
      // Extract metadata from filename
      const fileNameMatch = review.fileName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([a-f0-9]{8})-(.+)\.md$/);
      if (fileNameMatch) {
        const timeStr = fileNameMatch[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
        review.timestamp = new Date(timeStr);
        review.commit.hash = fileNameMatch[2];
        review.commit.message = fileNameMatch[3].replace(/-/g, ' ');
      }
      
      // Determine review type
      if (content.includes('Repository Code Review Report')) {
        review.reviewType = 'repository';
      } else if (content.includes('Commit History Review Summary')) {
        review.reviewType = 'history';
      }
      
      // Extract scores
      const scoreMatch = content.match(/Code Quality Score.*?(\d+)\/10/);
      if (scoreMatch) review.score = parseInt(scoreMatch[1]);
      
      const confidenceMatch = content.match(/Confidence Level.*?(\d+)\/10/);
      if (confidenceMatch) review.confidence = parseInt(confidenceMatch[1]);
      
      // Extract summary
      const summaryMatch = content.match(/## 📋 Summary\s*\n\n(.+?)(?:\n\n|$)/s);
      if (summaryMatch) review.summary = summaryMatch[1].trim();
      
      // Extract commit info from content
      const commitMatch = content.match(/\*\*Commit:\*\* ([a-f0-9]+)/);
      if (commitMatch) review.commit.hash = commitMatch[1];
      
      const authorMatch = content.match(/\*\*Author:\*\* (.+)/);
      if (authorMatch) review.commit.author = authorMatch[1];
      
      const messageMatch = content.match(/\*\*Message:\*\* (.+)/);
      if (messageMatch) review.commit.message = messageMatch[1];
      
      // Extract issues
      const issuesSection = content.match(/## ⚠️ Issues Found\s*\n\n(.*?)(?=\n## |$)/s);
      if (issuesSection) {
        const issueMatches = issuesSection[1].matchAll(/### \d+\. ([🚨⚠️⚡ℹ️]+) (\w+): (.+?)\n\n(?:\*\*💡 Suggestion:\*\* (.+?)\n\n)?(?:\*\*🏷️ Category:\*\* (.+?)\n\n)?/gs);
        for (const match of issueMatches) {
          review.issues.push({
            severity: match[2].toLowerCase(),
            description: match[3],
            suggestion: match[4] || '',
            category: match[5] || ''
          });
        }
      }
      
      // Extract suggestions
      const suggestionsSection = content.match(/## 💡 General Suggestions\s*\n\n(.*?)(?=\n## |$)/s);
      if (suggestionsSection) {
        const suggestionMatches = suggestionsSection[1].matchAll(/^\d+\. (.+)$/gm);
        for (const match of suggestionMatches) {
          review.suggestions.push(match[1]);
        }
      }
      
      // Extract security notes
      const securitySection = content.match(/## 🔒 Security Notes\s*\n\n(.*?)(?=\n## |$)/s);
      if (securitySection) {
        const securityMatches = securitySection[1].matchAll(/^\d+\. (.+)$/gm);
        for (const match of securityMatches) {
          review.security.push(match[1]);
        }
      }
      
      // Extract performance notes
      const performanceSection = content.match(/## ⚡ Performance Notes\s*\n\n(.*?)(?=\n## |$)/s);
      if (performanceSection) {
        const performanceMatches = performanceSection[1].matchAll(/^\d+\. (.+)$/gm);
        for (const match of performanceMatches) {
          review.performance.push(match[1]);
        }
      }
      
      return review;
    } catch (error) {
      console.warn(chalk.yellow(`Failed to parse review content: ${error.message}`));
      return null;
    }
  }

  matchesFilters(review, options) {
    if (options.since) {
      const sinceDate = new Date(options.since);
      if (review.timestamp && review.timestamp < sinceDate) return false;
    }
    
    if (options.until) {
      const untilDate = new Date(options.until);
      if (review.timestamp && review.timestamp > untilDate) return false;
    }
    
    if (options.minScore !== undefined) {
      const minScore = parseInt(options.minScore);
      if (review.score === null || review.score < minScore) return false;
    }
    
    if (options.maxScore !== undefined) {
      const maxScore = parseInt(options.maxScore);
      if (review.score === null || review.score > maxScore) return false;
    }
    
    if (options.severity) {
      const severityLevels = ['low', 'medium', 'high', 'critical'];
      const minSeverityIndex = severityLevels.indexOf(options.severity.toLowerCase());
      
      const hasMatchingSeverity = review.issues.some(issue => {
        const issueIndex = severityLevels.indexOf(issue.severity);
        return issueIndex >= minSeverityIndex;
      });
      
      if (!hasMatchingSeverity) return false;
    }
    
    return true;
  }

  generateReviewSummary(reviewData, options, aiInsights = null) {
    const timestamp = new Date().toISOString();
    const stats = this.calculateReviewStatistics(reviewData);
    
    let markdown = `# 📊 Code Review Summary Report\n\n`;
    markdown += `**Generated:** ${timestamp}\n`;
    markdown += `**Total Reviews Analyzed:** ${reviewData.length}\n`;
    markdown += `**Date Range:** ${stats.dateRange.start} to ${stats.dateRange.end}\n`;
    
    if (Object.keys(options).length > 0) {
      markdown += `\n## 🔍 Applied Filters\n\n`;
      if (options.since) markdown += `- **Since:** ${options.since}\n`;
      if (options.until) markdown += `- **Until:** ${options.until}\n`;
      if (options.minScore) markdown += `- **Minimum Score:** ${options.minScore}\n`;
      if (options.maxScore) markdown += `- **Maximum Score:** ${options.maxScore}\n`;
      if (options.severity) markdown += `- **Minimum Severity:** ${options.severity}\n`;
    }
    
    markdown += `\n---\n\n`;
    
    // AI Executive Summary
    if (aiInsights && aiInsights.executiveSummary) {
      markdown += `## 🤖 AI Executive Summary\n\n`;
      markdown += `${aiInsights.executiveSummary}\n\n`;
      markdown += `**AI Confidence Level:** ${aiInsights.confidence || 'N/A'}/10\n\n`;
    }
    
    // Overall Quality Metrics
    markdown += `## 🎯 Quality Overview\n\n`;
    markdown += `| Metric | Value | Trend |\n`;
    markdown += `|--------|-------|-------|\n`;
    markdown += `| **Average Score** | ${stats.averageScore.toFixed(1)}/10 | ${this.getScoreEmoji(stats.averageScore)} |\n`;
    markdown += `| **Average Confidence** | ${stats.averageConfidence.toFixed(1)}/10 | ${this.getConfidenceEmoji(stats.averageConfidence)} |\n`;
    markdown += `| **High Quality Reviews** | ${stats.highQualityCount} (${stats.highQualityPercentage.toFixed(1)}%) | ${stats.highQualityPercentage >= 70 ? '🟢' : stats.highQualityPercentage >= 50 ? '🟡' : '🔴'} |\n`;
    markdown += `| **Total Issues Found** | ${stats.totalIssues} | ${stats.totalIssues === 0 ? '🟢' : stats.totalIssues < 10 ? '🟡' : '🔴'} |\n`;
    markdown += `| **Critical Issues** | ${stats.criticalIssues} | ${stats.criticalIssues === 0 ? '🟢' : '🚨'} |\n`;
    markdown += `\n`;
    
    return this.addAIInsights(markdown, aiInsights, stats, reviewData);
  }

  addAIInsights(markdown, aiInsights, stats, reviewData) {
    if (aiInsights) {
      // Critical Action Items - What needs immediate attention
      if (aiInsights.criticalActionItems && aiInsights.criticalActionItems.length > 0) {
        markdown += `## 🚨 Critical Action Items\n\n`;
        markdown += `> **These issues require immediate attention from the development team**\n\n`;
        aiInsights.criticalActionItems.forEach((item, i) => {
          markdown += `${i + 1}. **${item}**\n`;
        });
        markdown += `\n---\n\n`;
      }
      
      // Recurring Patterns - Systemic issues
      if (aiInsights.recurringPatterns && aiInsights.recurringPatterns.length > 0) {
        markdown += `## 🔄 Recurring Patterns\n\n`;
        markdown += `*These issues appear repeatedly across reviews and indicate systemic problems:*\n\n`;
        aiInsights.recurringPatterns.forEach((pattern, i) => {
          markdown += `- **${pattern}**\n`;
        });
        markdown += `\n`;
      }
      
      // Team Strengths - What's working well
      if (aiInsights.teamStrengths && aiInsights.teamStrengths.length > 0) {
        markdown += `## ✅ Team Strengths\n\n`;
        markdown += `*Areas where the team excels:*\n\n`;
        aiInsights.teamStrengths.forEach((strength, i) => {
          markdown += `- ${strength}\n`;
        });
        markdown += `\n`;
      }
      
      // Improvement Roadmap - Prioritized action plan
      if (aiInsights.improvementRoadmap && aiInsights.improvementRoadmap.length > 0) {
        markdown += `## 🗺️ Improvement Roadmap\n\n`;
        markdown += `| Priority | Focus Area | Expected Impact | Implementation Effort |\n`;
        markdown += `|----------|------------|-----------------|----------------------|\n`;
        aiInsights.improvementRoadmap.forEach(item => {
          const priorityEmoji = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
          markdown += `| ${priorityEmoji} ${item.priority.toUpperCase()} | ${item.area} | ${item.impact} | ${item.effort} |\n`;
        });
        markdown += `\n`;
      }
      
      // Risk Assessment
      if (aiInsights.riskAssessment) {
        markdown += `## ⚠️ Risk Assessment\n\n`;
        
        if (aiInsights.riskAssessment.high && aiInsights.riskAssessment.high.length > 0) {
          markdown += `### 🔴 High Risk Issues\n`;
          aiInsights.riskAssessment.high.forEach(risk => markdown += `- **${risk}**\n`);
          markdown += `\n`;
        }
        
        if (aiInsights.riskAssessment.medium && aiInsights.riskAssessment.medium.length > 0) {
          markdown += `### 🟡 Medium Risk Issues\n`;
          aiInsights.riskAssessment.medium.forEach(risk => markdown += `- ${risk}\n`);
          markdown += `\n`;
        }
        
        if (aiInsights.riskAssessment.low && aiInsights.riskAssessment.low.length > 0) {
          markdown += `### 🟢 Low Risk Issues\n`;
          aiInsights.riskAssessment.low.forEach(risk => markdown += `- ${risk}\n`);
          markdown += `\n`;
        }
      }
      
      // Specific Recommendations with timeline
      if (aiInsights.specificRecommendations && aiInsights.specificRecommendations.length > 0) {
        markdown += `## 💡 Specific Recommendations\n\n`;
        markdown += `| Category | Action Required | Timeline |\n`;
        markdown += `|----------|-----------------|----------|\n`;
        aiInsights.specificRecommendations.forEach(rec => {
          markdown += `| ${rec.category} | ${rec.action} | ${rec.timeline} |\n`;
        });
        markdown += `\n`;
      }
      
      // Key Metrics and Next Steps
      if (aiInsights.keyMetrics) {
        markdown += `## 📊 Key Focus Areas & Next Steps\n\n`;
        
        if (aiInsights.keyMetrics.focusAreas) {
          markdown += `**Top 3 Focus Areas:**\n`;
          aiInsights.keyMetrics.focusAreas.forEach((area, i) => {
            markdown += `${i + 1}. ${area}\n`;
          });
          markdown += `\n`;
        }
        
        if (aiInsights.keyMetrics.trendDirection) {
          const trendEmoji = aiInsights.keyMetrics.trendDirection === 'improving' ? '📈' : 
                           aiInsights.keyMetrics.trendDirection === 'declining' ? '📉' : '➡️';
          markdown += `**Quality Trend:** ${trendEmoji} ${aiInsights.keyMetrics.trendDirection}\n\n`;
        }
        
        if (aiInsights.keyMetrics.nextMilestone) {
          markdown += `**Next Quality Milestone:** ${aiInsights.keyMetrics.nextMilestone}\n\n`;
        }
      }
      
    } else {
      markdown += `## 💡 Basic Recommendations\n\n`;
      const recommendations = this.generateRecommendations(stats);
      recommendations.forEach((rec, i) => {
        markdown += `${i + 1}. **${rec.title}**: ${rec.description}\n`;
      });
      markdown += `\n`;
    }
    
    // Footer
    markdown += `---\n\n`;
    if (aiInsights) {
      markdown += `*Generated by AI PR Reviewer with ${this.config.aiProvider} (${this.config.model}) Analysis*\n`;
    } else {
      markdown += `*Generated by AI PR Reviewer Summary Tool (Statistical Analysis)*\n`;
    }
    
    return markdown;
  }

  // Helper methods
  calculateReviewStatistics(reviewData) {
    // Implementation moved from main file...
    const stats = {
      totalReviews: reviewData.length,
      averageScore: 0,
      averageConfidence: 0,
      highQualityCount: 0,
      highQualityPercentage: 0,
      totalIssues: 0,
      criticalIssues: 0,
      dateRange: { start: 'N/A', end: 'N/A' }
    };
    
    if (reviewData.length === 0) return stats;
    
    let totalScore = 0, totalConfidence = 0, validScores = 0, validConfidence = 0;
    const timestamps = [];
    
    reviewData.forEach(review => {
      if (review.score !== null) {
        totalScore += review.score;
        validScores++;
        if (review.score >= 8) stats.highQualityCount++;
      }
      
      if (review.confidence !== null) {
        totalConfidence += review.confidence;
        validConfidence++;
      }
      
      review.issues.forEach(issue => {
        stats.totalIssues++;
        if (issue.severity === 'critical') stats.criticalIssues++;
      });
      
      if (review.timestamp) {
        timestamps.push(review.timestamp);
      }
    });
    
    stats.averageScore = validScores > 0 ? totalScore / validScores : 0;
    stats.averageConfidence = validConfidence > 0 ? totalConfidence / validConfidence : 0;
    stats.highQualityPercentage = (stats.highQualityCount / reviewData.length) * 100;
    
    if (timestamps.length > 0) {
      timestamps.sort((a, b) => a - b);
      stats.dateRange.start = timestamps[0].toISOString().split('T')[0];
      stats.dateRange.end = timestamps[timestamps.length - 1].toISOString().split('T')[0];
    }
    
    return stats;
  }

  generateRecommendations(stats) {
    const recommendations = [];
    
    if (stats.averageScore < 6) {
      recommendations.push({
        title: 'Focus on Code Quality',
        description: `Average score is ${stats.averageScore.toFixed(1)}/10. Consider implementing stricter code review processes.`
      });
    }
    
    if (stats.criticalIssues > 0) {
      recommendations.push({
        title: 'Address Critical Issues',
        description: `${stats.criticalIssues} critical issues found. These should be prioritized for immediate resolution.`
      });
    }
    
    return recommendations;
  }

  getScoreEmoji(score) {
    if (score >= 8) return '🟢 Excellent';
    if (score >= 6) return '🟡 Good';
    if (score >= 4) return '🟠 Fair';
    return '🔴 Needs Improvement';
  }

  getConfidenceEmoji(confidence) {
    if (confidence >= 8) return '🎯 High';
    if (confidence >= 6) return '📊 Medium';
    return '❓ Low';
  }

  async generateAIInsights(reviewData, options) {
    try {
      const stats = this.calculateReviewStatistics(reviewData);
      const patterns = this.analyzePatterns(reviewData);
      
      const prompt = this.buildSummaryPrompt(stats, patterns, reviewData, options);
      
      await this.aiReviewer.applyRateLimit();
      
      let response;
      switch (this.config.aiProvider) {
        case 'openai':
          response = await this.aiReviewer.callOpenAI(prompt);
          break;
        case 'anthropic':
          response = await this.aiReviewer.callAnthropic(prompt);
          break;
        case 'google':
          response = await this.aiReviewer.callGoogle(prompt);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${this.config.aiProvider}`);
      }
      
      return this.parseSummaryResponse(response);
    } catch (error) {
      console.warn(chalk.yellow('⚠️ AI analysis failed, using statistical analysis only:', error.message));
      return this.getFallbackInsights();
    }
  }

  analyzePatterns(reviewData) {
    // Analyze common patterns across reviews
    const issueFrequency = {};
    const categoryBreakdown = {};
    const fileTypePatterns = {};
    const securityPatterns = [];
    const performancePatterns = [];
    const commonSuggestions = {};
    
    reviewData.forEach(review => {
      // Count issue types
      review.issues.forEach(issue => {
        issueFrequency[issue.description] = (issueFrequency[issue.description] || 0) + 1;
        categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
      });
      
      // Analyze file patterns from commit message or files reviewed
      if (review.commitMessage) {
        const fileExtensions = (review.commitMessage.match(/\.\w+/g) || []);
        fileExtensions.forEach(ext => {
          fileTypePatterns[ext] = (fileTypePatterns[ext] || 0) + 1;
        });
      }
      
      // Collect security and performance patterns
      review.security.forEach(item => securityPatterns.push(item));
      review.performance.forEach(item => performancePatterns.push(item));
      
      // Track common suggestions
      review.suggestions.forEach(suggestion => {
        const key = suggestion.substring(0, 50); // First 50 chars as key
        commonSuggestions[key] = (commonSuggestions[key] || 0) + 1;
      });
    });
    
    return {
      mostCommonIssues: Object.entries(issueFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([issue, count]) => ({ issue, count, percentage: (count/reviewData.length*100).toFixed(1) })),
      
      categoryBreakdown: Object.entries(categoryBreakdown)
        .sort(([,a], [,b]) => b - a)
        .map(([category, count]) => ({ category, count, percentage: (count/reviewData.reduce((sum, r) => sum + r.issues.length, 0)*100).toFixed(1) })),
      
      fileTypePatterns: Object.entries(fileTypePatterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      
      securityTrends: this.findCommonPatterns(securityPatterns),
      performanceTrends: this.findCommonPatterns(performancePatterns),
      
      topSuggestions: Object.entries(commonSuggestions)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([suggestion, count]) => ({ suggestion, count }))
    };
  }
  
  findCommonPatterns(items) {
    const patterns = {};
    items.forEach(item => {
      // Extract key terms and phrases
      const words = item.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach(word => {
        patterns[word] = (patterns[word] || 0) + 1;
      });
    });
    
    return Object.entries(patterns)
      .filter(([word, count]) => count > 1)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ pattern: word, frequency: count }));
  }

  buildSummaryPrompt(stats, patterns, reviewData, options) {
    const recentReviews = reviewData.slice(-5); // Last 5 reviews for context
    
    return `You are an expert software engineering manager analyzing code review data. Provide actionable insights that help teams improve their code quality and development practices.

## REVIEW ANALYSIS DATA

### Basic Statistics
- Total Reviews: ${stats.totalReviews}
- Average Quality Score: ${stats.averageScore.toFixed(1)}/10
- Total Issues Found: ${stats.totalIssues}
- Critical Issues: ${stats.criticalIssues}
- High Quality Reviews (8+): ${stats.highQualityCount}/${stats.totalReviews} (${stats.highQualityPercentage.toFixed(1)}%)

### MOST COMMON ISSUES (Actionable Focus Areas)
${patterns.mostCommonIssues.map(item => `- ${item.issue} (${item.count} occurrences, ${item.percentage}% of reviews)`).join('\n')}

### ISSUE CATEGORY BREAKDOWN
${patterns.categoryBreakdown.map(item => `- ${item.category}: ${item.count} issues (${item.percentage}% of total)`).join('\n')}

### SECURITY TRENDS
${patterns.securityTrends.map(item => `- "${item.pattern}" mentioned ${item.frequency} times`).join('\n')}

### PERFORMANCE TRENDS  
${patterns.performanceTrends.map(item => `- "${item.pattern}" mentioned ${item.frequency} times`).join('\n')}

### RECENT REVIEW SAMPLES
${recentReviews.map(review => `- Score: ${review.score}/10, Issues: ${review.issues.length}, Summary: ${review.summary?.substring(0, 100)}...`).join('\n')}

## INSTRUCTIONS

Analyze this data to provide a strategic summary that focuses on:

1. **CRITICAL ACTION ITEMS**: What should the team fix immediately?
2. **RECURRING PATTERNS**: What issues keep appearing across reviews?
3. **TEAM STRENGTHS**: What is the team doing well?
4. **IMPROVEMENT ROADMAP**: Prioritized list of areas to focus on
5. **RISK ASSESSMENT**: What could cause major problems if not addressed?
6. **SPECIFIC RECOMMENDATIONS**: Concrete steps to improve code quality

Respond in JSON format:
{
  "executiveSummary": "<2-3 sentence strategic overview focusing on actionable insights>",
  "criticalActionItems": ["<immediate fixes needed>"],
  "recurringPatterns": ["<patterns that indicate systemic issues>"],
  "teamStrengths": ["<what the team does well>"],
  "improvementRoadmap": [
    {"priority": "high|medium|low", "area": "<focus area>", "impact": "<expected benefit>", "effort": "<implementation difficulty>"}
  ],
  "riskAssessment": {
    "high": ["<high risk issues>"],
    "medium": ["<medium risk issues>"],
    "low": ["<low risk issues>"]
  },
  "specificRecommendations": [
    {"category": "<category>", "action": "<specific action>", "timeline": "<when to implement>"}
  ],
  "keyMetrics": {
    "focusAreas": ["<top 3 areas needing attention>"],
    "trendDirection": "<improving|stable|declining>",
    "nextMilestone": "<next quality goal>"
  },
  "confidence": <1-10 integer>
}

Focus on providing insights that development teams can actually act on to improve their code quality and security.`;
  }

  parseSummaryResponse(response) {
    try {
      // Strip thinking tags if present  
      let cleaned = response.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        cleaned = jsonMatch[1];
      }
      
      // Find the start of JSON
      const jsonStart = cleaned.indexOf('{');
      if (jsonStart > -1) {
        cleaned = cleaned.substring(jsonStart);
      }
      
      const parsed = JSON.parse(cleaned);
      
      // Validate that we have the expected summary structure
      if (parsed.executiveSummary || parsed.criticalActionItems || parsed.keyMetrics) {
        return parsed;
      } else {
        console.warn(chalk.yellow('⚠️ AI response missing expected summary fields, using fallback'));
        return this.getFallbackInsights();
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Failed to parse AI summary response:', error.message));
      console.log(chalk.gray('Raw response preview:', response?.substring(0, 200)));
      return this.getFallbackInsights();
    }
  }

  getFallbackInsights() {
    return {
      executiveSummary: "Code review analysis completed with statistical metrics. AI insights unavailable.",
      keyInsights: ["Statistical analysis completed successfully"],
      confidence: 3
    };
  }

  displaySummaryMetrics(reviewData) {
    const stats = this.calculateReviewStatistics(reviewData);
    
    console.log(chalk.blue('\n📊 Summary Metrics:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(`📋 Total Reviews: ${stats.totalReviews}`));
    console.log(chalk.white(`📈 Average Score: ${stats.averageScore.toFixed(1)}/10`));
    console.log(chalk.white(`⚠️ Total Issues: ${stats.totalIssues}`));
    console.log(chalk.white(`🚨 Critical Issues: ${stats.criticalIssues}`));
    console.log(chalk.gray('─'.repeat(60)));
  }
}