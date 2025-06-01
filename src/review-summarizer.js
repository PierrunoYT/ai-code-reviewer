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
      
      // Add comprehensive issue catalog
      markdown += this.generateCompleteIssueCatalog(reviewData);
      
      // Add review-by-review breakdown  
      markdown += this.generateReviewBreakdown(reviewData);
      
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
    // Comprehensive analysis combining all review content
    const analysis = {
      // Basic frequency analysis
      issueFrequency: {},
      categoryBreakdown: {},
      severityDistribution: {},
      
      // Rich content analysis
      allIssuesDetails: [],
      securityAnalysis: this.analyzeSecurityContent(reviewData),
      performanceAnalysis: this.analyzePerformanceContent(reviewData),
      codeQualityPatterns: this.analyzeCodeQualityPatterns(reviewData),
      
      // Cross-review relationships
      issueRelationships: this.findIssueRelationships(reviewData),
      technologyStack: this.analyzeTechnologyStack(reviewData),
      authorPatterns: this.analyzeAuthorPatterns(reviewData),
      
      // Temporal analysis
      qualityTrends: this.analyzeQualityTrends(reviewData),
      
      // Synthesis data
      thematicClusters: this.clusterIssuesByTheme(reviewData),
      riskProfile: this.buildRiskProfile(reviewData),
      improvementOpportunities: this.identifyImprovementOpportunities(reviewData)
    };
    
    // Build detailed issue catalog
    reviewData.forEach((review, reviewIndex) => {
      review.issues.forEach(issue => {
        analysis.allIssuesDetails.push({
          ...issue,
          reviewIndex,
          reviewScore: review.score,
          reviewDate: review.timestamp,
          relatedSuggestions: review.suggestions.filter(s => 
            this.isRelated(issue.description, s)
          ),
          context: {
            summary: review.summary?.substring(0, 100),
            totalIssues: review.issues.length,
            criticalIssues: review.issues.filter(i => i.severity === 'critical').length
          }
        });
        
        // Track frequencies
        const issueKey = this.normalizeIssueText(issue.description);
        analysis.issueFrequency[issueKey] = (analysis.issueFrequency[issueKey] || 0) + 1;
        analysis.categoryBreakdown[issue.category] = (analysis.categoryBreakdown[issue.category] || 0) + 1;
        analysis.severityDistribution[issue.severity] = (analysis.severityDistribution[issue.severity] || 0) + 1;
      });
    });
    
    return this.enrichAnalysisData(analysis, reviewData);
  }
  
  // Enhanced analysis methods for comprehensive synthesis
  
  analyzeSecurityContent(reviewData) {
    const securityIssues = [];
    const securityPatterns = {};
    const vulnerabilityTypes = {};
    
    reviewData.forEach(review => {
      // Collect security issues with full context
      review.issues.filter(issue => issue.category === 'security').forEach(issue => {
        securityIssues.push({
          ...issue,
          reviewScore: review.score,
          relatedNotes: review.security
        });
        
        // Classify vulnerability types
        const vulnType = this.classifyVulnerability(issue.description);
        vulnerabilityTypes[vulnType] = (vulnerabilityTypes[vulnType] || 0) + 1;
      });
      
      // Analyze security notes patterns
      review.security.forEach(note => {
        const pattern = this.extractSecurityPattern(note);
        securityPatterns[pattern] = (securityPatterns[pattern] || 0) + 1;
      });
    });
    
    return {
      totalSecurityIssues: securityIssues.length,
      criticalSecurityIssues: securityIssues.filter(i => i.severity === 'critical').length,
      vulnerabilityTypes: Object.entries(vulnerabilityTypes).sort(([,a], [,b]) => b - a),
      securityPatterns: Object.entries(securityPatterns).sort(([,a], [,b]) => b - a).slice(0, 10),
      securityAdvice: this.synthesizeSecurityAdvice(securityIssues),
      riskLevel: this.calculateSecurityRisk(securityIssues)
    };
  }
  
  analyzePerformanceContent(reviewData) {
    const performanceIssues = [];
    const performanceBottlenecks = {};
    const optimizationOpportunities = [];
    
    reviewData.forEach(review => {
      review.issues.filter(issue => issue.category === 'performance').forEach(issue => {
        performanceIssues.push({
          ...issue,
          reviewScore: review.score,
          suggestions: review.performance
        });
        
        const bottleneck = this.identifyBottleneck(issue.description);
        performanceBottlenecks[bottleneck] = (performanceBottlenecks[bottleneck] || 0) + 1;
      });
      
      review.performance.forEach(note => {
        const opportunity = this.extractOptimizationOpportunity(note);
        if (opportunity) optimizationOpportunities.push(opportunity);
      });
    });
    
    return {
      performanceIssues: performanceIssues.length,
      commonBottlenecks: Object.entries(performanceBottlenecks).sort(([,a], [,b]) => b - a),
      optimizationPriorities: this.prioritizeOptimizations(optimizationOpportunities),
      performanceGoals: this.suggestPerformanceGoals(performanceIssues)
    };
  }
  
  analyzeCodeQualityPatterns(reviewData) {
    const qualityMetrics = {
      maintainability: [],
      readability: [],
      testability: [],
      complexity: []
    };
    
    reviewData.forEach(review => {
      const qualityScore = this.assessCodeQualityFromReview(review);
      qualityMetrics.maintainability.push(qualityScore.maintainability);
      qualityMetrics.readability.push(qualityScore.readability);
      qualityMetrics.testability.push(qualityScore.testability);
      qualityMetrics.complexity.push(qualityScore.complexity);
    });
    
    return {
      averageMaintainability: this.average(qualityMetrics.maintainability),
      averageReadability: this.average(qualityMetrics.readability),
      averageTestability: this.average(qualityMetrics.testability),
      averageComplexity: this.average(qualityMetrics.complexity),
      qualityTrend: this.calculateQualityTrend(qualityMetrics),
      improvementAreas: this.identifyQualityImprovementAreas(qualityMetrics)
    };
  }
  
  clusterIssuesByTheme(reviewData) {
    const themes = {
      'Security & Authentication': [],
      'Performance & Scalability': [],
      'Code Quality & Maintainability': [],
      'Testing & Reliability': [],
      'Documentation & Standards': [],
      'Dependencies & Infrastructure': []
    };
    
    reviewData.forEach(review => {
      review.issues.forEach(issue => {
        const theme = this.categorizeIssueTheme(issue);
        if (themes[theme]) {
          themes[theme].push({
            ...issue,
            reviewContext: {
              score: review.score,
              summary: review.summary?.substring(0, 50)
            }
          });
        }
      });
    });
    
    // Calculate theme priorities based on severity and frequency
    const themePriorities = Object.entries(themes).map(([theme, issues]) => ({
      theme,
      issueCount: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      averageSeverityScore: this.calculateAverageSeverityScore(issues),
      priority: this.calculateThemePriority(issues)
    })).sort((a, b) => b.priority - a.priority);
    
    return { themes, themePriorities };
  }
  
  buildRiskProfile(reviewData) {
    const risks = {
      immediate: [],
      shortTerm: [],
      longTerm: [],
      strategic: []
    };
    
    reviewData.forEach(review => {
      review.issues.forEach(issue => {
        const riskTimeframe = this.assessRiskTimeframe(issue);
        const riskImpact = this.assessRiskImpact(issue, review);
        
        risks[riskTimeframe].push({
          issue: issue.description,
          severity: issue.severity,
          impact: riskImpact,
          category: issue.category,
          mitigation: issue.suggestion,
          businessImpact: this.assessBusinessImpact(issue)
        });
      });
    });
    
    return {
      ...risks,
      overallRiskScore: this.calculateOverallRisk(risks),
      riskDistribution: this.calculateRiskDistribution(risks),
      mitigationStrategy: this.developMitigationStrategy(risks)
    };
  }
  
  // Helper methods for analysis
  normalizeIssueText(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }
  
  isRelated(issueText, suggestion) {
    const issueWords = issueText.toLowerCase().split(/\s+/);
    const suggestionWords = suggestion.toLowerCase().split(/\s+/);
    const commonWords = issueWords.filter(word => 
      suggestionWords.includes(word) && word.length > 3
    );
    return commonWords.length >= 2;
  }
  
  classifyVulnerability(description) {
    const desc = description.toLowerCase();
    if (desc.includes('injection') || desc.includes('sql')) return 'Injection Attacks';
    if (desc.includes('auth') || desc.includes('token')) return 'Authentication Issues';
    if (desc.includes('input') || desc.includes('validation')) return 'Input Validation';
    if (desc.includes('xss') || desc.includes('script')) return 'Cross-Site Scripting';
    if (desc.includes('csrf') || desc.includes('forgery')) return 'CSRF';
    return 'Other Security Issues';
  }
  
  extractSecurityPattern(note) {
    // Extract key security concepts from notes
    const patterns = ['api key', 'authentication', 'authorization', 'validation', 'sanitization', 'encryption'];
    for (const pattern of patterns) {
      if (note.toLowerCase().includes(pattern)) return pattern;
    }
    return 'general security';
  }
  
  // Additional helper methods and stubs for complete analysis
  enrichAnalysisData(analysis, reviewData) {
    return {
      ...analysis,
      mostCommonIssues: Object.entries(analysis.issueFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 15)
        .map(([issue, count]) => ({ issue, count, percentage: (count/reviewData.length*100).toFixed(1) })),
      
      categoryBreakdown: Object.entries(analysis.categoryBreakdown)
        .sort(([,a], [,b]) => b - a)
        .map(([category, count]) => ({ category, count, percentage: (count/analysis.allIssuesDetails.length*100).toFixed(1) })),
        
      severityBreakdown: Object.entries(analysis.severityDistribution)
        .sort((a, b) => this.severityWeight(b[0]) - this.severityWeight(a[0]))
        .map(([severity, count]) => ({ severity, count, percentage: (count/analysis.allIssuesDetails.length*100).toFixed(1) }))
    };
  }
  
  severityWeight(severity) {
    const weights = { critical: 4, high: 3, medium: 2, low: 1 };
    return weights[severity] || 0;
  }
  
  // Stub implementations for comprehensive analysis (would be fully implemented in production)
  analyzeTechnologyStack(reviewData) { return { languages: ['Python'], frameworks: ['Discord.py'], databases: [] }; }
  analyzeAuthorPatterns(reviewData) { return { authorCount: 1, avgReviewsPerAuthor: reviewData.length }; }
  analyzeQualityTrends(reviewData) { return { trend: 'stable', variance: 0.5 }; }
  findIssueRelationships(reviewData) { return { strongRelationships: [], clusters: [] }; }
  identifyImprovementOpportunities(reviewData) { return { highImpact: [], quickWins: [] }; }
  
  synthesizeSecurityAdvice(issues) { return issues.slice(0, 3).map(i => i.suggestion); }
  calculateSecurityRisk(issues) { return issues.filter(i => i.severity === 'critical').length > 0 ? 'HIGH' : 'MEDIUM'; }
  identifyBottleneck(desc) { 
    if (desc.includes('database') || desc.includes('query')) return 'Database Operations';
    if (desc.includes('api') || desc.includes('request')) return 'API Calls';
    return 'General Performance';
  }
  extractOptimizationOpportunity(note) { return note.includes('cache') ? 'caching' : null; }
  prioritizeOptimizations(opportunities) { return opportunities.slice(0, 5); }
  suggestPerformanceGoals(issues) { return ['Reduce API response time by 20%', 'Implement caching layer']; }
  
  assessCodeQualityFromReview(review) {
    const baseScore = review.score || 5;
    return {
      maintainability: baseScore + (review.issues.filter(i => i.category === 'quality').length * -0.5),
      readability: baseScore + (review.issues.filter(i => i.description.includes('readable')).length * -1),
      testability: baseScore + (review.issues.filter(i => i.category === 'testing').length * -0.8),
      complexity: baseScore + (review.issues.filter(i => i.description.includes('complex')).length * -0.7)
    };
  }
  
  average(numbers) { return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0; }
  calculateQualityTrend(metrics) { return 'stable'; }
  identifyQualityImprovementAreas(metrics) { return ['Testing Coverage', 'Code Documentation']; }
  
  categorizeIssueTheme(issue) {
    if (issue.category === 'security') return 'Security & Authentication';
    if (issue.category === 'performance') return 'Performance & Scalability';
    if (issue.category === 'testing') return 'Testing & Reliability';
    if (issue.category === 'documentation') return 'Documentation & Standards';
    if (issue.category === 'dependencies') return 'Dependencies & Infrastructure';
    return 'Code Quality & Maintainability';
  }
  
  calculateAverageSeverityScore(issues) {
    const scores = issues.map(i => this.severityWeight(i.severity));
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }
  
  calculateThemePriority(issues) {
    const criticalWeight = issues.filter(i => i.severity === 'critical').length * 10;
    const highWeight = issues.filter(i => i.severity === 'high').length * 5;
    const frequencyWeight = issues.length * 2;
    return criticalWeight + highWeight + frequencyWeight;
  }
  
  assessRiskTimeframe(issue) {
    if (issue.severity === 'critical') return 'immediate';
    if (issue.severity === 'high') return 'shortTerm';
    if (issue.category === 'security') return 'shortTerm';
    return 'longTerm';
  }
  
  assessRiskImpact(issue, review) {
    const severityImpact = this.severityWeight(issue.severity);
    const reviewScoreImpact = (10 - (review.score || 5)) / 2;
    return Math.min(10, severityImpact + reviewScoreImpact);
  }
  
  assessBusinessImpact(issue) {
    if (issue.category === 'security') return 'High - Security breach risk';
    if (issue.category === 'performance') return 'Medium - User experience impact';
    return 'Low - Technical debt';
  }
  
  calculateOverallRisk(risks) {
    const immediateCount = risks.immediate.length * 4;
    const shortTermCount = risks.shortTerm.length * 2;
    const longTermCount = risks.longTerm.length * 1;
    return Math.min(10, (immediateCount + shortTermCount + longTermCount) / 5);
  }
  
  calculateRiskDistribution(risks) {
    const total = Object.values(risks).flat().length;
    return {
      immediate: ((risks.immediate.length / total) * 100).toFixed(1),
      shortTerm: ((risks.shortTerm.length / total) * 100).toFixed(1),
      longTerm: ((risks.longTerm.length / total) * 100).toFixed(1)
    };
  }
  
  developMitigationStrategy(risks) {
    return {
      immediate: 'Address critical security vulnerabilities first',
      shortTerm: 'Implement comprehensive testing and validation',
      longTerm: 'Establish code quality standards and automated checks'
    };
  }

  generateCompleteIssueCatalog(reviewData) {
    let markdown = `\n---\n\n## 📋 Complete Issue Catalog\n\n`;
    markdown += `*Comprehensive listing of all ${reviewData.reduce((sum, review) => sum + review.issues.length, 0)} issues found across all reviews*\n\n`;
    
    // Group all issues by category
    const issuesByCategory = {};
    const issuesBySeverity = { critical: [], high: [], medium: [], low: [] };
    let totalIssues = 0;
    
    reviewData.forEach((review, reviewIndex) => {
      review.issues.forEach((issue, issueIndex) => {
        totalIssues++;
        const enrichedIssue = {
          ...issue,
          reviewIndex: reviewIndex + 1,
          reviewScore: review.score,
          reviewDate: review.timestamp,
          issueId: `R${reviewIndex + 1}-I${issueIndex + 1}`,
          context: review.summary?.substring(0, 60) + '...'
        };
        
        // Group by category
        if (!issuesByCategory[issue.category]) {
          issuesByCategory[issue.category] = [];
        }
        issuesByCategory[issue.category].push(enrichedIssue);
        
        // Group by severity
        if (issuesBySeverity[issue.severity]) {
          issuesBySeverity[issue.severity].push(enrichedIssue);
        }
      });
    });
    
    // Issues by Severity (most critical first)
    markdown += `### 🚨 Issues by Severity\n\n`;
    
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    severityOrder.forEach(severity => {
      const issues = issuesBySeverity[severity];
      if (issues.length > 0) {
        const severityIcon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🟢';
        markdown += `#### ${severityIcon} ${severity.toUpperCase()} Issues (${issues.length})\n\n`;
        
        issues.forEach((issue, index) => {
          markdown += `**${index + 1}. ${issue.issueId}** - ${issue.description}\n`;
          markdown += `   - **Category**: ${issue.category}\n`;
          markdown += `   - **Fix**: ${issue.suggestion}\n`;
          markdown += `   - **Source**: Review ${issue.reviewIndex} (Score: ${issue.reviewScore}/10)\n`;
          if (issue.autoFixable) {
            markdown += `   - **Auto-fixable**: ✅ Yes\n`;
          }
          markdown += `\n`;
        });
      }
    });
    
    // Issues by Category
    markdown += `### 📂 Issues by Category\n\n`;
    
    Object.entries(issuesByCategory)
      .sort(([,a], [,b]) => b.length - a.length) // Sort by frequency
      .forEach(([category, issues]) => {
        const categoryIcon = this.getCategoryIcon(category);
        markdown += `#### ${categoryIcon} ${category.toUpperCase()} (${issues.length} issues)\n\n`;
        
        // Show critical and high severity first within each category
        const sortedIssues = issues.sort((a, b) => {
          const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
          return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
        });
        
        sortedIssues.forEach((issue, index) => {
          const severityBadge = this.getSeverityBadge(issue.severity);
          markdown += `${index + 1}. ${severityBadge} **${issue.issueId}** - ${issue.description}\n`;
          markdown += `   💡 **Solution**: ${issue.suggestion}\n`;
          markdown += `   📍 **Source**: Review ${issue.reviewIndex} | Score: ${issue.reviewScore}/10\n`;
          markdown += `\n`;
        });
      });
    
    // Quick Stats
    markdown += `### 📊 Issue Statistics\n\n`;
    markdown += `| Category | Count | Percentage |\n`;
    markdown += `|----------|-------|------------|\n`;
    Object.entries(issuesByCategory)
      .sort(([,a], [,b]) => b.length - a.length)
      .forEach(([category, issues]) => {
        const percentage = ((issues.length / totalIssues) * 100).toFixed(1);
        markdown += `| ${category} | ${issues.length} | ${percentage}% |\n`;
      });
    
    markdown += `\n| Severity | Count | Percentage |\n`;
    markdown += `|----------|-------|------------|\n`;
    severityOrder.forEach(severity => {
      const count = issuesBySeverity[severity].length;
      if (count > 0) {
        const percentage = ((count / totalIssues) * 100).toFixed(1);
        markdown += `| ${severity} | ${count} | ${percentage}% |\n`;
      }
    });
    
    return markdown;
  }
  
  generateReviewBreakdown(reviewData) {
    let markdown = `\n---\n\n## 📝 Review-by-Review Breakdown\n\n`;
    markdown += `*Detailed view of each individual review for complete transparency*\n\n`;
    
    reviewData.forEach((review, index) => {
      const reviewNumber = index + 1;
      const scoreColor = review.score >= 8 ? '🟢' : review.score >= 6 ? '🟡' : '🔴';
      const dateStr = review.timestamp ? new Date(review.timestamp).toLocaleDateString() : 'Unknown date';
      
      markdown += `### Review ${reviewNumber} ${scoreColor}\n\n`;
      markdown += `**Score**: ${review.score}/10 | **Confidence**: ${review.confidence}/10 | **Date**: ${dateStr}\n\n`;
      
      if (review.summary) {
        markdown += `**Summary**: ${review.summary}\n\n`;
      }
      
      // Issues found in this review
      if (review.issues.length > 0) {
        markdown += `**Issues Found (${review.issues.length})**:\n`;
        review.issues.forEach((issue, issueIndex) => {
          const severityBadge = this.getSeverityBadge(issue.severity);
          markdown += `${issueIndex + 1}. ${severityBadge} **[${issue.category}]** ${issue.description}\n`;
          markdown += `   💡 ${issue.suggestion}\n`;
        });
        markdown += `\n`;
      } else {
        markdown += `**No issues found** ✅\n\n`;
      }
      
      // Additional notes
      if (review.suggestions.length > 0) {
        markdown += `**General Suggestions**:\n`;
        review.suggestions.slice(0, 3).forEach((suggestion, i) => {
          markdown += `- ${suggestion}\n`;
        });
        markdown += `\n`;
      }
      
      if (review.security.length > 0) {
        markdown += `**Security Notes**:\n`;
        review.security.slice(0, 2).forEach((note, i) => {
          markdown += `- ${note}\n`;
        });
        markdown += `\n`;
      }
      
      if (review.performance.length > 0) {
        markdown += `**Performance Notes**:\n`;
        review.performance.slice(0, 2).forEach((note, i) => {
          markdown += `- ${note}\n`;
        });
        markdown += `\n`;
      }
      
      markdown += `---\n\n`;
    });
    
    return markdown;
  }
  
  getCategoryIcon(category) {
    const icons = {
      security: '🔒',
      performance: '⚡',
      quality: '📝',
      testing: '🧪',
      documentation: '📚',
      style: '🎨',
      dependencies: '📦',
      accessibility: '♿'
    };
    return icons[category] || '📋';
  }
  
  getSeverityBadge(severity) {
    const badges = {
      critical: '🔴 CRITICAL',
      high: '🟠 HIGH',
      medium: '🟡 MEDIUM',
      low: '🟢 LOW'
    };
    return badges[severity] || '⚪ UNKNOWN';
  }

  buildSummaryPrompt(stats, patterns, reviewData, options) {
    return `You are an expert software engineering manager analyzing comprehensive code review data. Synthesize ALL the detailed content from individual reviews into strategic, actionable insights.

## COMPREHENSIVE REVIEW ANALYSIS

### STATISTICAL OVERVIEW
- Total Reviews Analyzed: ${stats.totalReviews}
- Average Quality Score: ${stats.averageScore.toFixed(1)}/10 (Quality Trend: ${patterns.qualityTrends?.trend || 'stable'})
- Total Issues Found: ${stats.totalIssues} across ${patterns.allIssuesDetails?.length || 0} detailed issue instances
- Critical Issues: ${stats.criticalIssues} (${((stats.criticalIssues/stats.totalIssues)*100).toFixed(1)}% of all issues)
- High Quality Reviews (8+): ${stats.highQualityCount}/${stats.totalReviews} (${stats.highQualityPercentage.toFixed(1)}%)

### DETAILED ISSUE ANALYSIS
**Most Frequent Issues (with context):**
${patterns.mostCommonIssues?.slice(0, 10).map(item => 
  `- ${item.issue} | Frequency: ${item.count}/${stats.totalReviews} reviews (${item.percentage}%)`
).join('\n') || 'No patterns identified'}

**Issue Categories by Severity:**
${patterns.categoryBreakdown?.map(item => 
  `- ${item.category}: ${item.count} issues (${item.percentage}% of total issues)`
).join('\n') || 'No category data'}

**Severity Distribution:**
${patterns.severityBreakdown?.map(item => 
  `- ${item.severity.toUpperCase()}: ${item.count} issues (${item.percentage}%)`
).join('\n') || 'No severity data'}

### DEEP SECURITY ANALYSIS
**Security Risk Level:** ${patterns.securityAnalysis?.riskLevel || 'UNKNOWN'}
- Total Security Issues: ${patterns.securityAnalysis?.totalSecurityIssues || 0}
- Critical Security Issues: ${patterns.securityAnalysis?.criticalSecurityIssues || 0}
- Vulnerability Types: ${patterns.securityAnalysis?.vulnerabilityTypes?.map(([type, count]) => `${type}(${count})`).join(', ') || 'None identified'}
- Security Patterns: ${patterns.securityAnalysis?.securityPatterns?.slice(0, 5).map(([pattern, count]) => `${pattern}(${count}x)`).join(', ') || 'None'}

### PERFORMANCE ANALYSIS
- Performance Issues Found: ${patterns.performanceAnalysis?.performanceIssues || 0}
- Common Bottlenecks: ${patterns.performanceAnalysis?.commonBottlenecks?.slice(0, 3).map(([type, count]) => `${type}(${count})`).join(', ') || 'None identified'}
- Performance Goals: ${patterns.performanceAnalysis?.performanceGoals?.slice(0, 2).join('; ') || 'None set'}

### CODE QUALITY METRICS
- Maintainability Score: ${patterns.codeQualityPatterns?.averageMaintainability?.toFixed(1) || 'N/A'}/10
- Readability Score: ${patterns.codeQualityPatterns?.averageReadability?.toFixed(1) || 'N/A'}/10  
- Testability Score: ${patterns.codeQualityPatterns?.averageTestability?.toFixed(1) || 'N/A'}/10
- Complexity Score: ${patterns.codeQualityPatterns?.averageComplexity?.toFixed(1) || 'N/A'}/10

### THEMATIC ANALYSIS
**Priority Themes by Impact:**
${patterns.thematicClusters?.themePriorities?.slice(0, 6).map(theme => 
  `- ${theme.theme}: ${theme.issueCount} issues (${theme.criticalCount} critical, Priority: ${theme.priority.toFixed(1)})`
).join('\n') || 'No thematic analysis available'}

### RISK PROFILE ASSESSMENT
**Overall Risk Score:** ${patterns.riskProfile?.overallRiskScore?.toFixed(1) || 'N/A'}/10
- Immediate Risks: ${patterns.riskProfile?.immediate?.length || 0} issues requiring immediate attention
- Short-term Risks: ${patterns.riskProfile?.shortTerm?.length || 0} issues (1-4 weeks)
- Long-term Risks: ${patterns.riskProfile?.longTerm?.length || 0} issues (1+ months)

**Risk Distribution:**
${patterns.riskProfile?.riskDistribution ? 
  `- Immediate: ${patterns.riskProfile.riskDistribution.immediate}%
- Short-term: ${patterns.riskProfile.riskDistribution.shortTerm}%  
- Long-term: ${patterns.riskProfile.riskDistribution.longTerm}%` : 'No risk distribution data'}

### TECHNOLOGY STACK CONTEXT
- Languages: ${patterns.technologyStack?.languages?.join(', ') || 'Not identified'}
- Frameworks: ${patterns.technologyStack?.frameworks?.join(', ') || 'Not identified'}  
- Team Size: ${patterns.authorPatterns?.authorCount || 1} developer(s)

### ACTUAL ISSUE SAMPLES (for context)
${patterns.allIssuesDetails?.slice(0, 8).map((issue, i) => 
  `${i+1}. [${issue.severity.toUpperCase()}] ${issue.description.substring(0, 80)}... 
   → Context: Review score ${issue.reviewScore}/10, Related suggestions: ${issue.relatedSuggestions?.length || 0}`
).join('\n') || 'No detailed issues available'}

## SYNTHESIS INSTRUCTIONS

You have access to the complete content from all ${reviewData.length} individual code reviews. Create a comprehensive strategic analysis that:

1. **SYNTHESIZES** patterns across ALL reviews rather than just statistical summaries
2. **COMBINES** security, performance, and quality insights into cohesive themes  
3. **PRIORITIZES** actions based on business impact and implementation effort
4. **PROVIDES** specific, actionable recommendations with realistic timelines
5. **IDENTIFIES** systemic issues that require architectural or process changes
6. **LEVERAGES** the full context from individual review summaries and suggestions

Generate a strategic executive summary that development teams can use to make informed decisions about code quality investments.

Respond in JSON format:
{
  "executiveSummary": "<3-4 sentence strategic overview that synthesizes the most critical insights from all reviews>",
  "criticalActionItems": ["<specific immediate actions based on the worst/most frequent issues found>"],
  "recurringPatterns": ["<patterns that indicate systemic problems across multiple reviews>"],
  "teamStrengths": ["<areas where the team consistently performs well across reviews>"],
  "improvementRoadmap": [
    {"priority": "high|medium|low", "area": "<specific focus area>", "impact": "<measurable expected benefit>", "effort": "<realistic implementation difficulty>"}
  ],
  "riskAssessment": {
    "high": ["<business-critical risks that could cause major problems>"],
    "medium": ["<moderate risks that impact productivity/quality>"],
    "low": ["<minor issues that create technical debt>"]
  },
  "specificRecommendations": [
    {"category": "<category>", "action": "<concrete specific action>", "timeline": "<realistic implementation timeline>"}
  ],
  "keyMetrics": {
    "focusAreas": ["<top 3 specific areas needing immediate attention>"],
    "trendDirection": "<improving|stable|declining based on review patterns>",
    "nextMilestone": "<specific, measurable quality goal>"
  },
  "confidence": <1-10 integer based on data completeness and pattern clarity>
}

Ensure your analysis reflects the depth and richness of the individual review content, not just high-level statistics.`;
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