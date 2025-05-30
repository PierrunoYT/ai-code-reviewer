#!/usr/bin/env node

import dotenv from 'dotenv';
import { AIReviewer } from './ai-reviewer.js';
import { GitAnalyzer } from './git-analyzer.js';
import { loadConfiguration, validateConfiguration } from './config-loader.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

export class ReviewerApp {
  constructor(configOverrides = {}, configPath = null) {
    // Load configuration from file first, then apply any overrides
    const options = configPath ? { config: configPath } : {};
    const loadedConfig = loadConfiguration(options);
    this.config = { ...loadedConfig, ...configOverrides };
    
    // Validate configuration
    validateConfiguration(this.config);
    
    this.aiReviewer = new AIReviewer(this.config);
    this.gitAnalyzer = new GitAnalyzer();
  }

  async reviewCommits(commitRange = 'HEAD~1..HEAD') {
    try {
      console.log(chalk.blue('🔍 Analyzing commits...'));

      const commits = await this.gitAnalyzer.getCommits(commitRange);
      if (commits.length === 0) {
        console.log(chalk.yellow('No commits found to review.'));
        return;
      }

      console.log(chalk.blue(`Found ${commits.length} commit(s) to review`));

      // Use batch processing if enabled and multiple commits
      if (this.config.enableBatchProcessing && commits.length > 1) {
        await this.reviewCommitsBatch(commits);
      } else {
        await this.reviewCommitsSequential(commits);
      }

    } catch (error) {
      console.error(chalk.red('❌ Error during review:'), error.message);
      process.exit(1);
    }
  }

  async reviewCommitsSequential(commits) {
    for (const commit of commits) {
      console.log(chalk.cyan(`\n📝 Reviewing commit: ${commit.hash.substring(0, 8)} - ${commit.message}`));

      const diff = await this.gitAnalyzer.getCommitDiff(commit.hash);
      const review = await this.aiReviewer.reviewCodeWithRetry(diff, commit, this.config.retryAttempts);

      this.displayReview(review, commit);
      
      // Save review to markdown file if enabled
      if (this.config.saveToMarkdown !== false) {
        await this.saveReviewToMarkdown(review, commit, diff);
      }
    }
  }

  async reviewCommitsBatch(commits) {
    console.log(chalk.blue('🚀 Using batch processing for faster reviews...'));

    // Process in batches to avoid overwhelming the API
    const batchSize = this.config.batchSize || 5;

    for (let i = 0; i < commits.length; i += batchSize) {
      const batch = commits.slice(i, i + batchSize);
      console.log(chalk.cyan(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(commits.length / batchSize)}`));

      // Get diffs for all commits in batch
      const diffs = await Promise.all(
        batch.map(commit => this.gitAnalyzer.getCommitDiff(commit.hash))
      );

      // Review batch
      const reviews = await this.aiReviewer.reviewMultipleCommits(batch, diffs);

      // Display results
      for (let j = 0; j < batch.length; j++) {
        console.log(chalk.cyan(`\n📝 Commit: ${batch[j].hash.substring(0, 8)} - ${batch[j].message}`));
        this.displayReview(reviews[j], batch[j]);
        
        // Save review to markdown file if enabled
        if (this.config.saveToMarkdown !== false) {
          await this.saveReviewToMarkdown(reviews[j], batch[j], diffs[j]);
        }
      }
    }
  }

  displayReview(review, commit) {
    console.log(chalk.green('\n✅ AI Review Results:'));
    console.log(chalk.gray('─'.repeat(80)));

    if (review.score !== undefined) {
      const scoreColor = review.score >= 8 ? 'green' : review.score >= 6 ? 'yellow' : 'red';
      console.log(chalk[scoreColor](`📊 Code Quality Score: ${review.score}/10`));
    }

    if (review.confidence !== undefined) {
      const confidenceColor = review.confidence >= 8 ? 'green' : review.confidence >= 6 ? 'yellow' : 'red';
      console.log(chalk[confidenceColor](`🎯 Confidence Level: ${review.confidence}/10`));
    }

    if (review.summary) {
      console.log(chalk.white(`\n📋 Summary: ${review.summary}`));
    }

    if (review.issues && review.issues.length > 0) {
      console.log(chalk.red('\n⚠️  Issues Found:'));
      review.issues.forEach((issue, i) => {
        const severityEmoji = {
          'critical': '🚨',
          'high': '⚠️',
          'medium': '⚡',
          'low': 'ℹ️'
        }[issue.severity] || '⚠️';

        console.log(chalk.red(`  ${i + 1}. ${severityEmoji} ${issue.severity.toUpperCase()}: ${issue.description}`));
        if (issue.suggestion) {
          console.log(chalk.gray(`     💡 Suggestion: ${issue.suggestion}`));
        }
        if (issue.category) {
          console.log(chalk.gray(`     🏷️  Category: ${issue.category}`));
        }
        if (issue.citation) {
          console.log(chalk.gray(`     📚 Source: ${issue.citation}`));
        }
        if (issue.autoFixable) {
          console.log(chalk.green(`     🔧 Auto-fixable: Yes`));
        }
      });
    }

    if (review.suggestions && review.suggestions.length > 0) {
      console.log(chalk.blue('\n💡 Suggestions:'));
      review.suggestions.forEach((suggestion, i) => {
        console.log(chalk.blue(`  ${i + 1}. ${suggestion}`));
      });
    }

    if (review.security && review.security.length > 0) {
      console.log(chalk.magenta('\n🔒 Security Notes:'));
      review.security.forEach((note, i) => {
        console.log(chalk.magenta(`  ${i + 1}. ${note}`));
      });
    }

    if (review.performance && review.performance.length > 0) {
      console.log(chalk.cyan('\n⚡ Performance Notes:'));
      review.performance.forEach((note, i) => {
        console.log(chalk.cyan(`  ${i + 1}. ${note}`));
      });
    }

    if (review.dependencies && review.dependencies.length > 0) {
      console.log(chalk.yellow('\n📦 Dependency Notes:'));
      review.dependencies.forEach((note, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${note}`));
      });
    }

    if (review.accessibility && review.accessibility.length > 0) {
      console.log(chalk.green('\n♿ Accessibility Notes:'));
      review.accessibility.forEach((note, i) => {
        console.log(chalk.green(`  ${i + 1}. ${note}`));
      });
    }

    if (review.sources && review.sources.length > 0) {
      console.log(chalk.gray('\n📚 Sources Consulted:'));
      review.sources.forEach((source, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${source}`));
      });
    }

    console.log(chalk.gray('─'.repeat(80)));
  }

  async saveReviewToMarkdown(review, commit, diff) {
    try {
      const markdownContent = this.generateMarkdownContent(review, commit, diff);
      const filename = this.generateMarkdownFilename(commit);
      const outputDir = this.config.markdownOutputDir || './code-reviews';
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, markdownContent, 'utf8');
      
      console.log(chalk.green(`💾 Review saved to: ${filepath}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to save markdown file:'), error.message);
    }
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

  async shouldAllowCommit(review) {
    if (!review.score) return true;
    
    // Block commits with severe issues based on configuration
    const blockingIssues = this.config.blockingIssues || ['critical', 'high'];
    const hasBlockingIssues = review.issues?.some(issue => 
      blockingIssues.includes(issue.severity)
    );
    
    const minimumScore = this.config.minimumScore || 6;
    return !hasBlockingIssues && review.score >= minimumScore;
  }

  async reviewRepository(options = {}) {
    try {
      console.log(chalk.blue('🔍 Scanning repository for code files...'));

      const includePatterns = options.include ? options.include.split(',') : ['**/*.{js,ts,jsx,tsx,py,java,cpp,c,go,rs,php,rb,cs,kt,swift}'];
      const excludePatterns = options.exclude ? options.exclude.split(',') : ['node_modules/**', 'dist/**', 'build/**', '*.min.js', '*.test.*', '*.spec.*'];
      const maxFiles = parseInt(options.maxFiles || '50');

      const files = await this.findCodeFiles(includePatterns, excludePatterns, maxFiles);
      
      if (files.length === 0) {
        console.log(chalk.yellow('No code files found to review.'));
        return;
      }

      console.log(chalk.blue(`Found ${files.length} file(s) to review`));

      // Group files for batch processing
      const fileGroups = this.groupFilesForReview(files);

      for (let groupIndex = 0; groupIndex < fileGroups.length; groupIndex++) {
        const group = fileGroups[groupIndex];
        console.log(chalk.cyan(`\n📦 Reviewing file group ${groupIndex + 1}/${fileGroups.length}`));

        const combinedContent = await this.combineFileContents(group);
        const mockCommit = {
          hash: `repo-review-${Date.now()}`,
          message: `Repository review - Group ${groupIndex + 1}: ${group.map(f => path.basename(f)).join(', ')}`,
          author: 'Repository Review <repo@ai-reviewer.com>',
          date: new Date().toISOString()
        };

        const review = await this.aiReviewer.reviewCodeWithRetry(combinedContent, mockCommit, this.config.retryAttempts);
        
        // Enhance review with file context
        review.filesReviewed = group;
        review.groupIndex = groupIndex + 1;
        review.totalGroups = fileGroups.length;

        this.displayRepositoryReview(review, group);
        
        // Save review to markdown file if enabled
        if (this.config.saveToMarkdown !== false) {
          await this.saveRepositoryReviewToMarkdown(review, group, combinedContent);
        }
      }

      console.log(chalk.green(`\n✅ Repository review completed! Reviewed ${files.length} files in ${fileGroups.length} groups.`));

    } catch (error) {
      console.error(chalk.red('❌ Error during repository review:'), error.message);
      process.exit(1);
    }
  }

  async findCodeFiles(includePatterns, excludePatterns, maxFiles) {
    const files = [];
    const processedDirs = new Set();

    const scanDirectory = (dir, depth = 0) => {
      if (depth > 10 || files.length >= maxFiles) return; // Prevent infinite recursion and limit files
      if (processedDirs.has(dir)) return;
      processedDirs.add(dir);

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (files.length >= maxFiles) break;
          
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(process.cwd(), fullPath);

          // Skip excluded patterns
          if (this.matchesPatterns(relativePath, excludePatterns)) {
            continue;
          }

          if (entry.isDirectory()) {
            scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Check if file matches include patterns
            if (this.matchesPatterns(relativePath, includePatterns)) {
              // Additional size check (skip very large files)
              const stats = fs.statSync(fullPath);
              if (stats.size < 1024 * 1024) { // Skip files larger than 1MB
                files.push(relativePath);
              }
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
        console.warn(chalk.yellow(`⚠️ Skipping directory: ${dir} (${error.message})`));
      }
    };

    scanDirectory(process.cwd());
    return files.slice(0, maxFiles);
  }

  matchesPatterns(filePath, patterns) {
    return patterns.some(pattern => {
      // Simple glob-like pattern matching
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\./g, '\\.')
        .replace(/\{([^}]+)\}/g, '($1)')
        .replace(/,/g, '|');
      
      const regex = new RegExp(regexPattern);
      return regex.test(filePath);
    });
  }

  groupFilesForReview(files) {
    // Group files to avoid overwhelming the AI with too much content
    const maxFilesPerGroup = 5;
    const groups = [];
    
    for (let i = 0; i < files.length; i += maxFilesPerGroup) {
      groups.push(files.slice(i, i + maxFilesPerGroup));
    }
    
    return groups;
  }

  async combineFileContents(files) {
    let combinedContent = '';
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const stats = fs.statSync(file);
        
        combinedContent += `
--- FILE: ${file} ---
Size: ${stats.size} bytes
Modified: ${stats.mtime.toISOString()}

\`\`\`${path.extname(file).slice(1)}
${content}
\`\`\`

`;
      } catch (error) {
        combinedContent += `
--- FILE: ${file} ---
ERROR: Could not read file - ${error.message}

`;
      }
    }
    
    return combinedContent;
  }

  displayRepositoryReview(review, files) {
    console.log(chalk.green('\n✅ Repository Review Results:'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.blue(`📁 Files in this group: ${files.join(', ')}`));
    
    if (review.groupIndex && review.totalGroups) {
      console.log(chalk.gray(`📊 Group ${review.groupIndex} of ${review.totalGroups}`));
    }

    if (review.score !== undefined) {
      const scoreColor = review.score >= 8 ? 'green' : review.score >= 6 ? 'yellow' : 'red';
      console.log(chalk[scoreColor](`📊 Code Quality Score: ${review.score}/10`));
    }

    if (review.confidence !== undefined) {
      const confidenceColor = review.confidence >= 8 ? 'green' : review.confidence >= 6 ? 'yellow' : 'red';
      console.log(chalk[confidenceColor](`🎯 Confidence Level: ${review.confidence}/10`));
    }

    if (review.summary) {
      console.log(chalk.white(`\n📋 Summary: ${review.summary}`));
    }

    if (review.issues && review.issues.length > 0) {
      console.log(chalk.red('\n⚠️  Issues Found:'));
      review.issues.forEach((issue, i) => {
        const severityEmoji = {
          'critical': '🚨',
          'high': '⚠️',
          'medium': '⚡',
          'low': 'ℹ️'
        }[issue.severity] || '⚠️';

        console.log(chalk.red(`  ${i + 1}. ${severityEmoji} ${issue.severity.toUpperCase()}: ${issue.description}`));
        if (issue.suggestion) {
          console.log(chalk.gray(`     💡 Suggestion: ${issue.suggestion}`));
        }
        if (issue.category) {
          console.log(chalk.gray(`     🏷️  Category: ${issue.category}`));
        }
        if (issue.citation) {
          console.log(chalk.gray(`     📚 Source: ${issue.citation}`));
        }
        if (issue.autoFixable) {
          console.log(chalk.green(`     🔧 Auto-fixable: Yes`));
        }
      });
    }

    if (review.suggestions && review.suggestions.length > 0) {
      console.log(chalk.blue('\n💡 Suggestions:'));
      review.suggestions.forEach((suggestion, i) => {
        console.log(chalk.blue(`  ${i + 1}. ${suggestion}`));
      });
    }

    if (review.security && review.security.length > 0) {
      console.log(chalk.magenta('\n🔒 Security Notes:'));
      review.security.forEach((note, i) => {
        console.log(chalk.magenta(`  ${i + 1}. ${note}`));
      });
    }

    if (review.performance && review.performance.length > 0) {
      console.log(chalk.cyan('\n⚡ Performance Notes:'));
      review.performance.forEach((note, i) => {
        console.log(chalk.cyan(`  ${i + 1}. ${note}`));
      });
    }

    if (review.dependencies && review.dependencies.length > 0) {
      console.log(chalk.yellow('\n📦 Dependency Notes:'));
      review.dependencies.forEach((note, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${note}`));
      });
    }

    if (review.accessibility && review.accessibility.length > 0) {
      console.log(chalk.green('\n♿ Accessibility Notes:'));
      review.accessibility.forEach((note, i) => {
        console.log(chalk.green(`  ${i + 1}. ${note}`));
      });
    }

    if (review.sources && review.sources.length > 0) {
      console.log(chalk.gray('\n📚 Sources Consulted:'));
      review.sources.forEach((source, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${source}`));
      });
    }

    console.log(chalk.gray('─'.repeat(80)));
  }

  async saveRepositoryReviewToMarkdown(review, files, combinedContent) {
    try {
      const markdownContent = this.generateRepositoryMarkdownContent(review, files, combinedContent);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${timestamp}-repository-review-group-${review.groupIndex || 1}.md`;
      const outputDir = this.config.markdownOutputDir || './code-reviews';
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, markdownContent, 'utf8');
      
      console.log(chalk.green(`💾 Repository review saved to: ${filepath}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to save repository review markdown file:'), error.message);
    }
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
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new ReviewerApp();
  const commitRange = process.argv[2] || 'HEAD~1..HEAD';
  
  app.reviewCommits(commitRange).catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}
