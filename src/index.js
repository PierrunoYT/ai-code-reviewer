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

  async reviewAllCommits(options = {}) {
    try {
      console.log(chalk.blue('🔍 Analyzing repository commit history...'));

      // Get repository stats first
      const stats = await this.gitAnalyzer.getCommitStats();
      console.log(chalk.gray(`📊 Repository contains ${stats.totalCommits} total commits by ${stats.authors.length} authors`));
      
      if (stats.dateRange.oldest && stats.dateRange.newest) {
        console.log(chalk.gray(`📅 Date range: ${stats.dateRange.oldest.split('T')[0]} to ${stats.dateRange.newest.split('T')[0]}`));
      }

      const commits = await this.gitAnalyzer.getAllCommits(options);
      if (commits.length === 0) {
        console.log(chalk.yellow('No commits found to review with the specified filters.'));
        return;
      }

      const maxCommits = parseInt(options.maxCommits || '100');
      if (commits.length > maxCommits) {
        console.log(chalk.yellow(`⚠️ Found ${commits.length} commits, limiting to ${maxCommits} most recent commits`));
      }

      console.log(chalk.blue(`Found ${commits.length} commit(s) to review`));

      // Display filter summary if any filters were applied
      if (options.since || options.until || options.author || options.branch !== 'HEAD') {
        console.log(chalk.gray('Applied filters:'));
        if (options.since) console.log(chalk.gray(`  • Since: ${options.since}`));
        if (options.until) console.log(chalk.gray(`  • Until: ${options.until}`));
        if (options.author) console.log(chalk.gray(`  • Author: ${options.author}`));
        if (options.branch && options.branch !== 'HEAD') console.log(chalk.gray(`  • Branch: ${options.branch}`));
      }

      // Use batch processing if enabled and multiple commits
      if (this.config.enableBatchProcessing && commits.length > 1) {
        await this.reviewCommitsBatch(commits);
      } else {
        await this.reviewCommitsSequential(commits);
      }

      // Generate summary report
      await this.generateCommitSummaryReport(commits, options);

    } catch (error) {
      console.error(chalk.red('❌ Error during commit history review:'), error.message);
      process.exit(1);
    }
  }

  async generateCommitSummaryReport(commits, options) {
    console.log(chalk.green('\n📊 Generating commit history summary...'));
    
    // Analyze commit patterns
    const authorCounts = {};
    const dateCounts = {};
    const messagePrefixes = {};
    
    commits.forEach(commit => {
      // Author analysis
      const author = commit.author.split(' <')[0];
      authorCounts[author] = (authorCounts[author] || 0) + 1;
      
      // Date analysis (by month)
      const monthKey = commit.date.substring(0, 7); // YYYY-MM
      dateCounts[monthKey] = (dateCounts[monthKey] || 0) + 1;
      
      // Message prefix analysis (conventional commits)
      const messagePrefix = commit.message.split(':')[0].toLowerCase();
      if (messagePrefix.length < 20) { // Reasonable prefix length
        messagePrefixes[messagePrefix] = (messagePrefixes[messagePrefix] || 0) + 1;
      }
    });

    const summaryData = {
      totalCommitsReviewed: commits.length,
      authors: Object.entries(authorCounts).sort((a, b) => b[1] - a[1]),
      monthlyActivity: Object.entries(dateCounts).sort(),
      commitTypes: Object.entries(messagePrefixes).sort((a, b) => b[1] - a[1]).slice(0, 10)
    };

    // Display summary
    console.log(chalk.blue('\n📋 Commit History Summary:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(`Total commits reviewed: ${summaryData.totalCommitsReviewed}`));
    
    console.log(chalk.cyan('\n👥 Top Contributors:'));
    summaryData.authors.slice(0, 5).forEach(([author, count], i) => {
      console.log(chalk.cyan(`  ${i + 1}. ${author}: ${count} commits`));
    });

    console.log(chalk.magenta('\n📅 Monthly Activity:'));
    summaryData.monthlyActivity.slice(-6).forEach(([month, count]) => {
      console.log(chalk.magenta(`  ${month}: ${count} commits`));
    });

    console.log(chalk.yellow('\n🏷️ Common Commit Types:'));
    summaryData.commitTypes.slice(0, 5).forEach(([type, count], i) => {
      console.log(chalk.yellow(`  ${i + 1}. "${type}": ${count} commits`));
    });

    // Save summary to markdown if enabled
    if (this.config.saveToMarkdown !== false) {
      await this.saveCommitSummaryToMarkdown(summaryData, options);
    }

    console.log(chalk.green(`\n✅ All commits review completed! Analyzed ${commits.length} commits.`));
  }

  async saveCommitSummaryToMarkdown(summaryData, options) {
    try {
      const markdownContent = this.generateCommitSummaryMarkdown(summaryData, options);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${timestamp}-commit-history-summary.md`;
      const outputDir = this.config.markdownOutputDir || './code-reviews';
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, markdownContent, 'utf8');
      
      console.log(chalk.green(`💾 Commit summary saved to: ${filepath}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to save commit summary markdown file:'), error.message);
    }
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
      markdown += `|-------|----------|\n`;
      summaryData.monthlyActivity.forEach(([month, count]) => {
        markdown += `| ${month} | ${count} |\n`;
      });
      markdown += `\n`;
    }
    
    // Commit Types
    if (summaryData.commitTypes.length > 0) {
      markdown += `## 🏷️ Commit Type Analysis\n\n`;
      markdown += `| Rank | Type | Count | Percentage |\n`;
      markdown += `|------|------|-------|------------|\n`;
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

  async summarizeReviews(options = {}) {
    try {
      console.log(chalk.blue('📊 Analyzing existing reviews for summary...'));
      
      const reviewsDir = options.reviewsDir || './code-reviews';
      const outputFile = options.output || path.join(reviewsDir, 'SUMMARY.md');
      
      // Check if reviews directory exists
      if (!fs.existsSync(reviewsDir)) {
        console.log(chalk.yellow(`⚠️ Reviews directory not found: ${reviewsDir}`));
        console.log(chalk.blue('💡 Run some reviews first to generate data for summarization'));
        return;
      }
      
      // Find all review markdown files
      const reviewFiles = this.findReviewFiles(reviewsDir);
      
      if (reviewFiles.length === 0) {
        console.log(chalk.yellow('⚠️ No review files found in the specified directory'));
        console.log(chalk.blue('💡 Run some reviews first to generate data for summarization'));
        return;
      }
      
      console.log(chalk.blue(`📋 Found ${reviewFiles.length} review files to analyze`));
      
      // Parse and aggregate review data
      const reviewData = await this.parseReviewFiles(reviewFiles, options);
      
      if (reviewData.length === 0) {
        console.log(chalk.yellow('⚠️ No reviews match the specified filters'));
        return;
      }
      
      console.log(chalk.blue(`📊 Analyzing ${reviewData.length} reviews after filtering...`));
      
      // Generate comprehensive summary
      const summary = this.generateReviewSummary(reviewData, options);
      
      // Create output directory if needed
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write summary to file
      fs.writeFileSync(outputFile, summary, 'utf8');
      
      console.log(chalk.green(`✅ Review summary generated successfully!`));
      console.log(chalk.green(`📄 Summary saved to: ${outputFile}`));
      
      // Display key metrics
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
            // Look for review files (exclude summary and readme files)
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Skipping directory: ${dir} (${error.message})`));
      }
    };
    
    scanDirectory(reviewsDir);
    return files.sort(); // Sort chronologically
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
      
      // Extract metadata from filename (timestamp-hash-message format)
      const fileNameMatch = review.fileName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([a-f0-9]{8})-(.+)\.md$/);
      if (fileNameMatch) {
        // Convert filename timestamp format to proper ISO format
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
    // Date filters
    if (options.since) {
      const sinceDate = new Date(options.since);
      if (review.timestamp && review.timestamp < sinceDate) return false;
    }
    
    if (options.until) {
      const untilDate = new Date(options.until);
      if (review.timestamp && review.timestamp > untilDate) return false;
    }
    
    // Score filters
    if (options.minScore !== undefined) {
      const minScore = parseInt(options.minScore);
      if (review.score === null || review.score < minScore) return false;
    }
    
    if (options.maxScore !== undefined) {
      const maxScore = parseInt(options.maxScore);
      if (review.score === null || review.score > maxScore) return false;
    }
    
    // Severity filter
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

  generateReviewSummary(reviewData, options) {
    const timestamp = new Date().toISOString();
    
    // Calculate overall statistics
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
    
    // Score Distribution
    markdown += `## 📈 Score Distribution\n\n`;
    markdown += `| Score Range | Count | Percentage | Bar |\n`;
    markdown += `|-------------|-------|------------|-----|\n`;
    Object.entries(stats.scoreDistribution).forEach(([range, data]) => {
      const bar = '█'.repeat(Math.round(data.percentage / 5)) || '▌';
      markdown += `| ${range} | ${data.count} | ${data.percentage.toFixed(1)}% | ${bar} |\n`;
    });
    markdown += `\n`;
    
    // Issue Analysis
    if (stats.totalIssues > 0) {
      markdown += `## ⚠️ Issue Analysis\n\n`;
      
      // Severity breakdown
      markdown += `### Severity Breakdown\n\n`;
      markdown += `| Severity | Count | Percentage |\n`;
      markdown += `|----------|-------|------------|\n`;
      Object.entries(stats.issueSeverity).forEach(([severity, count]) => {
        const percentage = ((count / stats.totalIssues) * 100).toFixed(1);
        const emoji = { critical: '🚨', high: '⚠️', medium: '⚡', low: 'ℹ️' }[severity] || '•';
        markdown += `| ${emoji} ${severity.toUpperCase()} | ${count} | ${percentage}% |\n`;
      });
      markdown += `\n`;
      
      // Category breakdown
      markdown += `### Issue Categories\n\n`;
      markdown += `| Category | Count | Percentage |\n`;
      markdown += `|----------|-------|------------|\n`;
      Object.entries(stats.issueCategories).forEach(([category, count]) => {
        const percentage = ((count / stats.totalIssues) * 100).toFixed(1);
        const emoji = { security: '🔒', performance: '⚡', quality: '🏗️', style: '🎨', testing: '🧪', documentation: '📚' }[category] || '🏷️';
        markdown += `| ${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)} | ${count} | ${percentage}% |\n`;
      });
      markdown += `\n`;
      
      // Top issues
      if (stats.commonIssues.length > 0) {
        markdown += `### Most Common Issues\n\n`;
        stats.commonIssues.slice(0, 10).forEach((issue, i) => {
          markdown += `${i + 1}. **${issue.description}** (${issue.count} occurrences)\n`;
        });
        markdown += `\n`;
      }
    }
    
    // Review Types
    if (stats.reviewTypes && Object.keys(stats.reviewTypes).length > 1) {
      markdown += `## 📋 Review Types\n\n`;
      markdown += `| Type | Count | Percentage |\n`;
      markdown += `|------|-------|------------|\n`;
      Object.entries(stats.reviewTypes).forEach(([type, count]) => {
        const percentage = ((count / reviewData.length) * 100).toFixed(1);
        const emoji = { commit: '📝', repository: '📁', history: '📈' }[type] || '📄';
        markdown += `| ${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)} | ${count} | ${percentage}% |\n`;
      });
      markdown += `\n`;
    }
    
    // Time-based analysis
    if (stats.timeAnalysis && Object.keys(stats.timeAnalysis).length > 1) {
      markdown += `## 📅 Review Activity Timeline\n\n`;
      markdown += `| Period | Reviews | Avg Score | Issues |\n`;
      markdown += `|--------|---------|-----------|--------|\n`;
      Object.entries(stats.timeAnalysis).forEach(([period, data]) => {
        markdown += `| ${period} | ${data.count} | ${data.avgScore.toFixed(1)} | ${data.issues} |\n`;
      });
      markdown += `\n`;
    }
    
    // Top committers (if available)
    if (stats.topCommitters && stats.topCommitters.length > 0) {
      markdown += `## 👥 Top Contributors\n\n`;
      markdown += `| Author | Reviews | Avg Score | Total Issues |\n`;
      markdown += `|--------|---------|-----------|-------------|\n`;
      stats.topCommitters.slice(0, 10).forEach(committer => {
        markdown += `| ${committer.author} | ${committer.count} | ${committer.avgScore.toFixed(1)} | ${committer.totalIssues} |\n`;
      });
      markdown += `\n`;
    }
    
    // Recommendations
    markdown += `## 💡 Recommendations\n\n`;
    const recommendations = this.generateRecommendations(stats);
    recommendations.forEach((rec, i) => {
      markdown += `${i + 1}. **${rec.title}**: ${rec.description}\n`;
    });
    markdown += `\n`;
    
    // Recent Reviews
    if (reviewData.length > 0) {
      markdown += `## 📋 Recent Reviews Summary\n\n`;
      const recentReviews = reviewData
        .filter(r => r.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);
      
      markdown += `| Date | Score | Issues | Summary |\n`;
      markdown += `|------|-------|--------|---------|\n`;
      recentReviews.forEach(review => {
        const date = review.timestamp ? review.timestamp.toISOString().split('T')[0] : 'N/A';
        const summary = review.summary.length > 60 ? review.summary.substring(0, 60) + '...' : review.summary;
        markdown += `| ${date} | ${review.score || 'N/A'} | ${review.issues.length} | ${summary} |\n`;
      });
      markdown += `\n`;
    }
    
    // Footer
    markdown += `---\n\n`;
    markdown += `*Generated by AI PR Reviewer Summary Tool*\n`;
    markdown += `*Report includes ${reviewData.length} reviews from ${stats.dateRange.start} to ${stats.dateRange.end}*\n`;
    
    return markdown;
  }

  calculateReviewStatistics(reviewData) {
    const stats = {
      totalReviews: reviewData.length,
      averageScore: 0,
      averageConfidence: 0,
      highQualityCount: 0,
      highQualityPercentage: 0,
      totalIssues: 0,
      criticalIssues: 0,
      scoreDistribution: {
        '9-10 (Excellent)': { count: 0, percentage: 0 },
        '7-8 (Good)': { count: 0, percentage: 0 },
        '5-6 (Fair)': { count: 0, percentage: 0 },
        '1-4 (Poor)': { count: 0, percentage: 0 }
      },
      issueSeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      issueCategories: {},
      commonIssues: [],
      reviewTypes: {},
      timeAnalysis: {},
      topCommitters: [],
      dateRange: { start: 'N/A', end: 'N/A' }
    };
    
    if (reviewData.length === 0) return stats;
    
    // Calculate basic metrics
    let totalScore = 0, totalConfidence = 0, validScores = 0, validConfidence = 0;
    const issueDescriptions = {};
    const committers = {};
    const timestamps = [];
    
    reviewData.forEach(review => {
      // Scores
      if (review.score !== null) {
        totalScore += review.score;
        validScores++;
        
        if (review.score >= 8) stats.highQualityCount++;
        
        // Score distribution
        if (review.score >= 9) stats.scoreDistribution['9-10 (Excellent)'].count++;
        else if (review.score >= 7) stats.scoreDistribution['7-8 (Good)'].count++;
        else if (review.score >= 5) stats.scoreDistribution['5-6 (Fair)'].count++;
        else stats.scoreDistribution['1-4 (Poor)'].count++;
      }
      
      if (review.confidence !== null) {
        totalConfidence += review.confidence;
        validConfidence++;
      }
      
      // Issues
      review.issues.forEach(issue => {
        stats.totalIssues++;
        stats.issueSeverity[issue.severity] = (stats.issueSeverity[issue.severity] || 0) + 1;
        
        if (issue.severity === 'critical') stats.criticalIssues++;
        
        if (issue.category) {
          stats.issueCategories[issue.category] = (stats.issueCategories[issue.category] || 0) + 1;
        }
        
        // Track common issues
        if (issue.description) {
          issueDescriptions[issue.description] = (issueDescriptions[issue.description] || 0) + 1;
        }
      });
      
      // Review types
      stats.reviewTypes[review.reviewType] = (stats.reviewTypes[review.reviewType] || 0) + 1;
      
      // Committers
      if (review.commit && review.commit.author) {
        const author = review.commit.author.split(' <')[0]; // Extract name only
        if (!committers[author]) {
          committers[author] = { count: 0, totalScore: 0, totalIssues: 0, validScores: 0 };
        }
        committers[author].count++;
        committers[author].totalIssues += review.issues.length;
        if (review.score !== null) {
          committers[author].totalScore += review.score;
          committers[author].validScores++;
        }
      }
      
      // Timestamps
      if (review.timestamp) {
        timestamps.push(review.timestamp);
      }
    });
    
    // Calculate averages
    stats.averageScore = validScores > 0 ? totalScore / validScores : 0;
    stats.averageConfidence = validConfidence > 0 ? totalConfidence / validConfidence : 0;
    stats.highQualityPercentage = (stats.highQualityCount / reviewData.length) * 100;
    
    // Calculate percentages for score distribution
    Object.keys(stats.scoreDistribution).forEach(range => {
      stats.scoreDistribution[range].percentage = (stats.scoreDistribution[range].count / reviewData.length) * 100;
    });
    
    // Common issues
    stats.commonIssues = Object.entries(issueDescriptions)
      .map(([description, count]) => ({ description, count }))
      .sort((a, b) => b.count - a.count);
    
    // Top committers
    stats.topCommitters = Object.entries(committers)
      .map(([author, data]) => ({
        author,
        count: data.count,
        avgScore: data.validScores > 0 ? data.totalScore / data.validScores : 0,
        totalIssues: data.totalIssues
      }))
      .sort((a, b) => b.count - a.count);
    
    // Date range and time analysis
    if (timestamps.length > 0) {
      timestamps.sort((a, b) => a - b);
      stats.dateRange.start = timestamps[0].toISOString().split('T')[0];
      stats.dateRange.end = timestamps[timestamps.length - 1].toISOString().split('T')[0];
      
      // Group by month for time analysis
      const monthlyData = {};
      reviewData.forEach(review => {
        if (review.timestamp) {
          const monthKey = review.timestamp.toISOString().substring(0, 7); // YYYY-MM
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { count: 0, totalScore: 0, validScores: 0, issues: 0 };
          }
          monthlyData[monthKey].count++;
          monthlyData[monthKey].issues += review.issues.length;
          if (review.score !== null) {
            monthlyData[monthKey].totalScore += review.score;
            monthlyData[monthKey].validScores++;
          }
        }
      });
      
      // Calculate average scores for each month
      Object.keys(monthlyData).forEach(month => {
        const data = monthlyData[month];
        data.avgScore = data.validScores > 0 ? data.totalScore / data.validScores : 0;
      });
      
      stats.timeAnalysis = monthlyData;
    }
    
    return stats;
  }

  generateRecommendations(stats) {
    const recommendations = [];
    
    if (stats.averageScore < 6) {
      recommendations.push({
        title: 'Focus on Code Quality',
        description: `Average score is ${stats.averageScore.toFixed(1)}/10. Consider implementing stricter code review processes and coding standards.`
      });
    }
    
    if (stats.criticalIssues > 0) {
      recommendations.push({
        title: 'Address Critical Issues',
        description: `${stats.criticalIssues} critical issues found. These should be prioritized for immediate resolution.`
      });
    }
    
    if (stats.issueSeverity.high > stats.totalIssues * 0.3) {
      recommendations.push({
        title: 'Security and High-Priority Issues',
        description: 'High proportion of high-severity issues detected. Consider security training and more thorough pre-commit reviews.'
      });
    }
    
    if (stats.highQualityPercentage < 50) {
      recommendations.push({
        title: 'Improve Review Standards',
        description: 'Less than 50% of reviews meet high-quality standards (8+ score). Consider pair programming and mentoring.'
      });
    }
    
    // Category-specific recommendations
    const topCategory = Object.entries(stats.issueCategories).sort((a, b) => b[1] - a[1])[0];
    if (topCategory && topCategory[1] > stats.totalIssues * 0.3) {
      const categoryAdvice = {
        security: 'security training and OWASP guidelines implementation',
        performance: 'performance optimization workshops and profiling tools',
        quality: 'code quality standards and automated linting',
        testing: 'test-driven development and coverage improvements'
      };
      
      recommendations.push({
        title: `Focus on ${topCategory[0].charAt(0).toUpperCase() + topCategory[0].slice(1)}`,
        description: `${topCategory[0]} issues represent ${((topCategory[1] / stats.totalIssues) * 100).toFixed(1)}% of all issues. Consider ${categoryAdvice[topCategory[0]] || 'targeted improvement in this area'}.`
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Maintain Excellence',
        description: 'Code quality metrics look good! Continue following current practices and consider sharing best practices with other teams.'
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

  displaySummaryMetrics(reviewData) {
    const stats = this.calculateReviewStatistics(reviewData);
    
    console.log(chalk.blue('\n📊 Summary Metrics:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(`📋 Total Reviews: ${stats.totalReviews}`));
    console.log(chalk.white(`📈 Average Score: ${stats.averageScore.toFixed(1)}/10`));
    console.log(chalk.white(`🎯 Average Confidence: ${stats.averageConfidence.toFixed(1)}/10`));
    console.log(chalk.white(`⚠️ Total Issues: ${stats.totalIssues}`));
    console.log(chalk.white(`🚨 Critical Issues: ${stats.criticalIssues}`));
    console.log(chalk.white(`🟢 High Quality Reviews: ${stats.highQualityCount} (${stats.highQualityPercentage.toFixed(1)}%)`));
    
    if (stats.dateRange.start !== 'N/A') {
      console.log(chalk.white(`📅 Date Range: ${stats.dateRange.start} to ${stats.dateRange.end}`));
    }
    
    console.log(chalk.gray('─'.repeat(60)));
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
