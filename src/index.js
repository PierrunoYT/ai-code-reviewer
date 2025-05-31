#!/usr/bin/env node

import dotenv from 'dotenv';
import { AIReviewer } from './ai-reviewer.js';
import { GitAnalyzer } from './git-analyzer.js';
import { loadConfiguration, validateConfiguration } from './config-loader.js';
import { ReviewSummarizer } from './review-summarizer.js';
import { RepositoryReviewer } from './repository-reviewer.js';
import { CommitHistoryReviewer } from './commit-history-reviewer.js';
import { MarkdownGenerator } from './markdown-generator.js';
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
    
    // Initialize core components
    this.aiReviewer = new AIReviewer(this.config);
    this.gitAnalyzer = new GitAnalyzer();
    this.markdownGenerator = new MarkdownGenerator(this.config);
    
    // Initialize specialized reviewers
    this.reviewSummarizer = new ReviewSummarizer(this.config, this.aiReviewer);
    this.repositoryReviewer = new RepositoryReviewer(this.config, this.aiReviewer);
    this.commitHistoryReviewer = new CommitHistoryReviewer(this.config, this.aiReviewer, this.gitAnalyzer);
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
      const markdownContent = this.markdownGenerator.generateMarkdownContent(review, commit, diff);
      const filename = this.markdownGenerator.generateMarkdownFilename(commit);
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

  // Delegate specialized review methods to their respective classes
  async reviewRepository(options = {}) {
    return this.repositoryReviewer.reviewRepository(options);
  }

  async reviewAllCommits(options = {}) {
    return this.commitHistoryReviewer.reviewAllCommits(options);
  }

  async summarizeReviews(options = {}) {
    return this.reviewSummarizer.summarizeReviews(options);
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