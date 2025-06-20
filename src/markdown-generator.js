import path from 'path';

export class MarkdownGenerator {
  constructor(config) {
    this.config = config;
  }

  generateMarkdownFilename(commit) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const shortHash = commit.hash.substring(0, 8);
    const sanitizedMessage = commit.message
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 50);
    
    return `${timestamp}-${shortHash}-${sanitizedMessage}.md`;
  }

  generateMarkdownContent(review, commit, diff) {
    const timestamp = new Date().toISOString();
    
    let markdown = `# Code Review Report\n\n`;
    markdown += `**Generated:** ${timestamp}\n`;
    markdown += `**Commit:** ${commit.hash}\n`;
    markdown += `**Author:** ${commit.author}\n`;
    markdown += `**Date:** ${commit.date}\n`;
    markdown += `**Message:** ${commit.message}\n\n`;
    
    markdown += `---\n\n`;
    
    // Scores
    if (review.score !== undefined || review.confidence !== undefined) {
      markdown += `## 📊 Review Scores\n\n`;
      if (review.score !== undefined) {
        const scoreEmoji = review.score >= 8 ? '🟢' : review.score >= 6 ? '🟡' : '🔴';
        markdown += `- **Code Quality Score:** ${scoreEmoji} ${review.score}/10\n`;
      }
      if (review.confidence !== undefined) {
        const confidenceEmoji = review.confidence >= 8 ? '🟢' : review.confidence >= 6 ? '🟡' : '🔴';
        markdown += `- **AI Confidence Level:** ${confidenceEmoji} ${review.confidence}/10\n`;
      }
      markdown += `\n`;
    }
    
    // Summary
    if (review.summary) {
      markdown += `## 📋 Summary\n\n${review.summary}\n\n`;
    }
    
    // Issues
    if (review.issues && review.issues.length > 0) {
      markdown += `## ⚠️ Issues Found\n\n`;
      review.issues.forEach((issue, i) => {
        const severityEmoji = {
          'critical': '🚨',
          'high': '⚠️',
          'medium': '⚡',
          'low': 'ℹ️'
        }[issue.severity] || '⚠️';
        
        markdown += `### ${i + 1}. ${severityEmoji} ${issue.severity.toUpperCase()}: ${issue.description}\n\n`;
        
        if (issue.suggestion) {
          markdown += `**💡 Suggestion:** ${issue.suggestion}\n\n`;
        }
        if (issue.category) {
          markdown += `**🏷️ Category:** ${issue.category}\n\n`;
        }
        if (issue.citation) {
          markdown += `**📚 Source:** ${issue.citation}\n\n`;
        }
        if (issue.autoFixable) {
          markdown += `**🔧 Auto-fixable:** Yes\n\n`;
        }
        markdown += `---\n\n`;
      });
    }
    
    // Suggestions
    if (review.suggestions && review.suggestions.length > 0) {
      markdown += `## 💡 General Suggestions\n\n`;
      review.suggestions.forEach((suggestion, i) => {
        markdown += `${i + 1}. ${suggestion}\n`;
      });
      markdown += `\n`;
    }
    
    // Security Notes
    if (review.security && review.security.length > 0) {
      markdown += `## 🔒 Security Notes\n\n`;
      review.security.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Performance Notes
    if (review.performance && review.performance.length > 0) {
      markdown += `## ⚡ Performance Notes\n\n`;
      review.performance.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Dependency Notes
    if (review.dependencies && review.dependencies.length > 0) {
      markdown += `## 📦 Dependency Notes\n\n`;
      review.dependencies.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Accessibility Notes
    if (review.accessibility && review.accessibility.length > 0) {
      markdown += `## ♿ Accessibility Notes\n\n`;
      review.accessibility.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Sources Consulted
    if (review.sources && review.sources.length > 0) {
      markdown += `## 📚 Sources Consulted\n\n`;
      review.sources.forEach((source, i) => {
        markdown += `${i + 1}. ${source}\n`;
      });
      markdown += `\n`;
    }
    
    // Code Diff
    if (diff && this.config.includeDiffInMarkdown !== false) {
      markdown += `## 📝 Code Changes\n\n`;
      markdown += `\`\`\`diff\n${diff}\n\`\`\`\n\n`;
    }
    
    // Footer
    markdown += `---\n\n`;
    markdown += `*Generated by AI PR Reviewer using ${this.config.aiProvider} (${this.config.model})*\n`;
    
    return markdown;
  }

  generateRepositoryMarkdownContent(review, files, combinedContent) {
    const timestamp = new Date().toISOString();
    
    let markdown = `# Repository Code Review Report\n\n`;
    markdown += `**Generated:** ${timestamp}\n`;
    markdown += `**Review Type:** Repository Review\n`;
    if (review.groupIndex && review.totalGroups) {
      markdown += `**Group:** ${review.groupIndex} of ${review.totalGroups}\n`;
    }
    markdown += `**Files Reviewed:** ${files.length}\n\n`;
    
    // List files
    markdown += `## 📁 Files in This Review\n\n`;
    files.forEach((file, i) => {
      markdown += `${i + 1}. \`${file}\`\n`;
    });
    markdown += `\n---\n\n`;
    
    // Scores
    if (review.score !== undefined || review.confidence !== undefined) {
      markdown += `## 📊 Review Scores\n\n`;
      if (review.score !== undefined) {
        const scoreEmoji = review.score >= 8 ? '🟢' : review.score >= 6 ? '🟡' : '🔴';
        markdown += `- **Code Quality Score:** ${scoreEmoji} ${review.score}/10\n`;
      }
      if (review.confidence !== undefined) {
        const confidenceEmoji = review.confidence >= 8 ? '🟢' : review.confidence >= 6 ? '🟡' : '🔴';
        markdown += `- **AI Confidence Level:** ${confidenceEmoji} ${review.confidence}/10\n`;
      }
      markdown += `\n`;
    }
    
    // Executive Summary (AI-generated insight)
    const executiveSummary = this.generateIndividualReviewSummary(review, files);
    if (executiveSummary) {
      markdown += `## 🎯 Executive Summary\n\n${executiveSummary}\n\n`;
    }
    
    // Detailed Summary
    if (review.summary) {
      markdown += `## 📋 Detailed Analysis\n\n${review.summary}\n\n`;
    }
    
    // Issues
    if (review.issues && review.issues.length > 0) {
      markdown += `## ⚠️ Issues Found\n\n`;
      review.issues.forEach((issue, i) => {
        const severityEmoji = {
          'critical': '🚨',
          'high': '⚠️',
          'medium': '⚡',
          'low': 'ℹ️'
        }[issue.severity] || '⚠️';
        
        markdown += `### ${i + 1}. ${severityEmoji} ${issue.severity.toUpperCase()}: ${issue.description}\n\n`;
        
        if (issue.suggestion) {
          markdown += `**💡 Suggestion:** ${issue.suggestion}\n\n`;
        }
        if (issue.category) {
          markdown += `**🏷️ Category:** ${issue.category}\n\n`;
        }
        if (issue.citation) {
          markdown += `**📚 Source:** ${issue.citation}\n\n`;
        }
        if (issue.autoFixable) {
          markdown += `**🔧 Auto-fixable:** Yes\n\n`;
        }
        markdown += `---\n\n`;
      });
    }
    
    // Add other sections (suggestions, security, performance, etc.)
    markdown = this.addCommonSections(markdown, review);
    
    // Code Content (if not too large)
    if (combinedContent && this.config.includeDiffInMarkdown !== false && combinedContent.length < 50000) {
      markdown += `## 📝 Reviewed Code\n\n`;
      markdown += `${combinedContent}\n\n`;
    } else if (combinedContent && combinedContent.length >= 50000) {
      markdown += `## 📝 Reviewed Code\n\n`;
      markdown += `*Content too large to include in markdown (${combinedContent.length} characters)*\n\n`;
    }
    
    // Footer
    markdown += `---\n\n`;
    markdown += `*Generated by AI PR Reviewer using ${this.config.aiProvider} (${this.config.model})*\n`;
    
    return markdown;
  }

  generateCommitSummaryMarkdown(summaryData, options) {
    const timestamp = new Date().toISOString();
    
    let markdown = `# Commit History Review Summary\n\n`;
    markdown += `**Generated:** ${timestamp}\n`;
    markdown += `**Review Type:** All Commits Review\n`;
    markdown += `**Total Commits Analyzed:** ${summaryData.totalCommitsReviewed}\n\n`;
    
    // Add applied filters
    if (options.since || options.until || options.author || options.branch !== 'HEAD') {
      markdown += `## 🔍 Applied Filters\n\n`;
      if (options.since) markdown += `- **Since:** ${options.since}\n`;
      if (options.until) markdown += `- **Until:** ${options.until}\n`;
      if (options.author) markdown += `- **Author:** ${options.author}\n`;
      if (options.branch && options.branch !== 'HEAD') markdown += `- **Branch:** ${options.branch}\n`;
      markdown += `\n`;
    }
    
    // Contributors
    markdown += `## 👥 Contributors\n\n`;
    markdown += `| Rank | Author | Commits | Percentage |\n`;
    markdown += `|------|--------|---------|------------|\n`;
    summaryData.authors.forEach(([author, count], i) => {
      const percentage = ((count / summaryData.totalCommitsReviewed) * 100).toFixed(1);
      markdown += `| ${i + 1} | ${author} | ${count} | ${percentage}% |\n`;
    });
    markdown += `\n`;
    
    // Monthly Activity
    if (summaryData.monthlyActivity.length > 0) {
      markdown += `## 📅 Monthly Activity\n\n`;
      markdown += `| Month | Commits |\n`;
      markdown += `|-------|---------|\n`;
      summaryData.monthlyActivity.forEach(([month, count]) => {
        markdown += `| ${month} | ${count} |\n`;
      });
      markdown += `\n`;
    }
    
    // Commit Types
    if (summaryData.commitTypes.length > 0) {
      markdown += `## 🏷️ Commit Type Analysis\n\n`;
      markdown += `| Rank | Type | Count | Percentage |\n`;
      markdown += `|------|------|-------|-----------|\n`;
      summaryData.commitTypes.forEach(([type, count], i) => {
        const percentage = ((count / summaryData.totalCommitsReviewed) * 100).toFixed(1);
        markdown += `| ${i + 1} | \`${type}\` | ${count} | ${percentage}% |\n`;
      });
      markdown += `\n`;
    }
    
    // Footer
    markdown += `---\n\n`;
    markdown += `*Generated by AI PR Reviewer using ${this.config.aiProvider} (${this.config.model})*\n`;
    markdown += `*Individual commit reviews are saved in separate files in the same directory*\n`;
    
    return markdown;
  }

  addCommonSections(markdown, review) {
    // Suggestions
    if (review.suggestions && review.suggestions.length > 0) {
      markdown += `## 💡 General Suggestions\n\n`;
      review.suggestions.forEach((suggestion, i) => {
        markdown += `${i + 1}. ${suggestion}\n`;
      });
      markdown += `\n`;
    }
    
    // Security Notes
    if (review.security && review.security.length > 0) {
      markdown += `## 🔒 Security Notes\n\n`;
      review.security.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Performance Notes
    if (review.performance && review.performance.length > 0) {
      markdown += `## ⚡ Performance Notes\n\n`;
      review.performance.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Dependency Notes
    if (review.dependencies && review.dependencies.length > 0) {
      markdown += `## 📦 Dependency Notes\n\n`;
      review.dependencies.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Accessibility Notes
    if (review.accessibility && review.accessibility.length > 0) {
      markdown += `## ♿ Accessibility Notes\n\n`;
      review.accessibility.forEach((note, i) => {
        markdown += `${i + 1}. ${note}\n`;
      });
      markdown += `\n`;
    }
    
    // Sources Consulted
    if (review.sources && review.sources.length > 0) {
      markdown += `## 📚 Sources Consulted\n\n`;
      review.sources.forEach((source, i) => {
        markdown += `${i + 1}. ${source}\n`;
      });
      markdown += `\n`;
    }
    
    return markdown;
  }

  generateIndividualReviewSummary(review, files) {
    try {
      // Generate a concise executive summary for this specific review
      const stats = this.calculateReviewStats(review);
      const keyFindings = this.extractKeyFindings(review);
      const actionItems = this.extractActionItems(review);
      
      let summary = '';
      
      // Quick overview
      summary += `**Files Analyzed:** ${files.length} | `;
      summary += `**Quality Score:** ${review.score}/10 | `;
      summary += `**Issues Found:** ${review.issues?.length || 0}\n\n`;
      
      // Key findings
      if (keyFindings.length > 0) {
        summary += `**🔍 Key Findings:**\n`;
        keyFindings.slice(0, 3).forEach((finding, i) => {
          summary += `• ${finding}\n`;
        });
        summary += `\n`;
      }
      
      // Priority actions
      if (actionItems.length > 0) {
        summary += `**⚡ Priority Actions:**\n`;
        actionItems.slice(0, 3).forEach((action, i) => {
          summary += `${i + 1}. ${action}\n`;
        });
        summary += `\n`;
      }
      
      // Risk assessment
      const riskLevel = this.assessReviewRisk(review);
      summary += `**🎯 Risk Level:** ${riskLevel.level} - ${riskLevel.description}\n\n`;
      
      // Overall recommendation
      const recommendation = this.generateReviewRecommendation(review, stats);
      summary += `**💡 Recommendation:** ${recommendation}`;
      
      return summary;
    } catch (error) {
      console.warn('Failed to generate individual review summary:', error.message);
      return null;
    }
  }
  
  calculateReviewStats(review) {
    const stats = {
      totalIssues: review.issues?.length || 0,
      criticalIssues: review.issues?.filter(i => i.severity === 'critical').length || 0,
      highIssues: review.issues?.filter(i => i.severity === 'high').length || 0,
      mediumIssues: review.issues?.filter(i => i.severity === 'medium').length || 0,
      lowIssues: review.issues?.filter(i => i.severity === 'low').length || 0,
      categories: {}
    };
    
    // Count issues by category
    review.issues?.forEach(issue => {
      stats.categories[issue.category] = (stats.categories[issue.category] || 0) + 1;
    });
    
    return stats;
  }
  
  extractKeyFindings(review) {
    const findings = [];
    
    // Get most severe issues
    const criticalIssues = review.issues?.filter(i => i.severity === 'critical') || [];
    const highIssues = review.issues?.filter(i => i.severity === 'high') || [];
    
    if (criticalIssues.length > 0) {
      findings.push(`${criticalIssues.length} critical security/quality issues requiring immediate attention`);
    }
    
    if (highIssues.length > 0) {
      findings.push(`${highIssues.length} high-priority issues affecting code reliability`);
    }
    
    // Category-specific findings
    const categories = {};
    review.issues?.forEach(issue => {
      categories[issue.category] = (categories[issue.category] || 0) + 1;
    });
    
    const topCategory = Object.entries(categories).sort(([,a], [,b]) => b - a)[0];
    if (topCategory && topCategory[1] > 2) {
      findings.push(`${topCategory[1]} ${topCategory[0]} issues indicate systemic ${topCategory[0]} concerns`);
    }
    
    // Performance/Security specific
    const securityIssues = review.issues?.filter(i => i.category === 'security').length || 0;
    const performanceIssues = review.issues?.filter(i => i.category === 'performance').length || 0;
    
    if (securityIssues > 0) {
      findings.push(`Security vulnerabilities detected - ${securityIssues} security-related issues`);
    }
    
    if (performanceIssues > 2) {
      findings.push(`Performance optimization opportunities identified - ${performanceIssues} performance issues`);
    }
    
    return findings;
  }
  
  extractActionItems(review) {
    const actions = [];
    const stats = this.calculateReviewStats(review);
    
    // Critical actions first
    if (stats.criticalIssues > 0) {
      actions.push(`Fix ${stats.criticalIssues} critical issues immediately (security/functionality risks)`);
    }
    
    // Category-specific actions
    const securityIssues = stats.categories.security || 0;
    const performanceIssues = stats.categories.performance || 0;
    const qualityIssues = stats.categories.quality || 0;
    const testingIssues = stats.categories.testing || 0;
    
    if (securityIssues > 0) {
      actions.push(`Address ${securityIssues} security vulnerabilities before deployment`);
    }
    
    if (testingIssues > 0) {
      actions.push(`Implement ${testingIssues} testing improvements to prevent regressions`);
    }
    
    if (performanceIssues > 1) {
      actions.push(`Optimize ${performanceIssues} performance bottlenecks for better user experience`);
    }
    
    if (qualityIssues > 3) {
      actions.push(`Refactor ${qualityIssues} code quality issues to improve maintainability`);
    }
    
    return actions;
  }
  
  assessReviewRisk(review) {
    const stats = this.calculateReviewStats(review);
    
    if (stats.criticalIssues > 0) {
      return {
        level: '🔴 HIGH RISK',
        description: 'Critical issues present - immediate action required'
      };
    }
    
    if (stats.highIssues > 2 || (stats.categories.security || 0) > 0) {
      return {
        level: '🟡 MEDIUM RISK',
        description: 'Significant issues requiring attention before production'
      };
    }
    
    if (stats.totalIssues > 5) {
      return {
        level: '🟠 MODERATE RISK',
        description: 'Multiple issues affecting code quality and maintainability'
      };
    }
    
    return {
      level: '🟢 LOW RISK',
      description: 'Minor issues that can be addressed in normal development cycle'
    };
  }
  
  generateReviewRecommendation(review, stats) {
    if (stats.criticalIssues > 0) {
      return 'Do not deploy until critical issues are resolved. Schedule immediate remediation.';
    }
    
    if (stats.highIssues > 2) {
      return 'Address high-priority issues before next release. Consider additional testing.';
    }
    
    if (stats.totalIssues > 8) {
      return 'Significant refactoring recommended. Plan technical debt reduction sprint.';
    }
    
    if ((stats.categories.security || 0) > 0) {
      return 'Security review required before deployment. Address all security concerns.';
    }
    
    if (review.score >= 8) {
      return 'Good code quality. Address remaining issues during regular development cycle.';
    }
    
    if (review.score >= 6) {
      return 'Acceptable quality with room for improvement. Plan incremental enhancements.';
    }
    
    return 'Significant improvements needed. Consider comprehensive refactoring approach.';
  }
}