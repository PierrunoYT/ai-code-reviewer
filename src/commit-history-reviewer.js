import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { MarkdownGenerator } from './markdown-generator.js';

export class CommitHistoryReviewer {
  constructor(config, aiReviewer, gitAnalyzer) {
    this.config = config;
    this.aiReviewer = aiReviewer;
    this.gitAnalyzer = gitAnalyzer;
    this.markdownGenerator = new MarkdownGenerator(config);
  }

  async reviewAllCommits(options = {}) {
    try {
      console.log(chalk.blue('🔍 Analyzing repository commit history...'));

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

      this.displayFilterSummary(options);

      // Use batch processing if enabled and multiple commits
      if (this.config.enableBatchProcessing && commits.length > 1) {
        await this.reviewCommitsBatch(commits);
      } else {
        await this.reviewCommitsSequential(commits);
      }

      await this.generateCommitSummaryReport(commits, options);

    } catch (error) {
      console.error(chalk.red('❌ Error during commit history review:'), error.message);
      process.exit(1);
    }
  }

  displayFilterSummary(options) {
    if (options.since || options.until || options.author || options.branch !== 'HEAD') {
      console.log(chalk.gray('Applied filters:'));
      if (options.since) console.log(chalk.gray(`  • Since: ${options.since}`));
      if (options.until) console.log(chalk.gray(`  • Until: ${options.until}`));
      if (options.author) console.log(chalk.gray(`  • Author: ${options.author}`));
      if (options.branch && options.branch !== 'HEAD') console.log(chalk.gray(`  • Branch: ${options.branch}`));
    }
  }

  async reviewCommitsSequential(commits) {
    for (const commit of commits) {
      console.log(chalk.cyan(`\n📝 Reviewing commit: ${commit.hash.substring(0, 8)} - ${commit.message}`));

      const diff = await this.gitAnalyzer.getCommitDiff(commit.hash);
      const review = await this.aiReviewer.reviewCodeWithRetry(diff, commit, this.config.retryAttempts);

      this.displayReview(review, commit);
      
      if (this.config.saveToMarkdown !== false) {
        await this.saveReviewToMarkdown(review, commit, diff);
      }
    }
  }

  async reviewCommitsBatch(commits) {
    console.log(chalk.blue('🚀 Using batch processing for faster reviews...'));

    const batchSize = this.config.batchSize || 5;

    for (let i = 0; i < commits.length; i += batchSize) {
      const batch = commits.slice(i, i + batchSize);
      console.log(chalk.cyan(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(commits.length / batchSize)}`));

      const diffs = await Promise.all(
        batch.map(commit => this.gitAnalyzer.getCommitDiff(commit.hash))
      );

      const reviews = await this.aiReviewer.reviewMultipleCommits(batch, diffs);

      for (let j = 0; j < batch.length; j++) {
        console.log(chalk.cyan(`\n📝 Commit: ${batch[j].hash.substring(0, 8)} - ${batch[j].message}`));
        this.displayReview(reviews[j], batch[j]);
        
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

    console.log(chalk.gray('─'.repeat(80)));
  }

  async saveReviewToMarkdown(review, commit, diff) {
    try {
      const markdownContent = this.markdownGenerator.generateMarkdownContent(review, commit, diff);
      const filename = this.markdownGenerator.generateMarkdownFilename(commit);
      const outputDir = this.config.markdownOutputDir || './code-reviews';
      
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

  async generateCommitSummaryReport(commits, options) {
    console.log(chalk.green('\n📊 Generating commit history summary...'));
    
    const summaryData = this.analyzeCommitPatterns(commits);

    this.displaySummary(summaryData);

    if (this.config.saveToMarkdown !== false) {
      await this.saveCommitSummaryToMarkdown(summaryData, options);
    }

    console.log(chalk.green(`\n✅ All commits review completed! Analyzed ${commits.length} commits.`));
  }

  analyzeCommitPatterns(commits) {
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

    return {
      totalCommitsReviewed: commits.length,
      authors: Object.entries(authorCounts).sort((a, b) => b[1] - a[1]),
      monthlyActivity: Object.entries(dateCounts).sort(),
      commitTypes: Object.entries(messagePrefixes).sort((a, b) => b[1] - a[1]).slice(0, 10)
    };
  }

  displaySummary(summaryData) {
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
  }

  async saveCommitSummaryToMarkdown(summaryData, options) {
    try {
      const markdownContent = this.markdownGenerator.generateCommitSummaryMarkdown(summaryData, options);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${timestamp}-commit-history-summary.md`;
      const outputDir = this.config.markdownOutputDir || './code-reviews';
      
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
}