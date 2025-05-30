#!/usr/bin/env node

import { Command } from 'commander';
import { ReviewerApp } from './index.js';
import { GitHookInstaller } from './git-hook-installer.js';
import { loadConfiguration } from './config-loader.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('ai-reviewer')
  .description('AI-powered code reviewer for commits and PRs')
  .version('1.0.0');

program
  .command('review')
  .description('Review commits in specified range')
  .argument('[range]', 'Commit range to review', 'HEAD~1..HEAD')
  .option('-c, --config <path>', 'Path to config file')
  .option('--api-key <key>', 'AI API key')
  .option('--provider <provider>', 'AI provider (openai, anthropic, google)', 'anthropic')
  .option('--model <model>', 'AI model to use')
  .option('--web-search', 'Enable web search for best practices')
  .option('--extended-thinking', 'Enable extended thinking (Anthropic only)')
  .option('--citations', 'Enable citations for recommendations')
  .option('--batch', 'Enable batch processing for multiple commits')
  .option('--no-batch', 'Disable batch processing')
  .option('--save-markdown', 'Save reviews to markdown files')
  .option('--no-save-markdown', 'Disable saving to markdown files')
  .option('--markdown-dir <dir>', 'Directory to save markdown files')
  .option('--include-diff', 'Include code diff in markdown files')
  .option('--no-include-diff', 'Exclude code diff from markdown files')
  .action(async (range, options) => {
    try {
      const config = loadConfig(options);
      const app = new ReviewerApp(config);
      await app.reviewCommits(range);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('install-hooks')
  .description('Install git hooks for automated review')
  .option('--pre-commit', 'Install pre-commit hook')
  .option('--pre-push', 'Install pre-push hook')
  .action(async (options) => {
    try {
      const installer = new GitHookInstaller();
      
      if (options.preCommit) {
        await installer.installPreCommitHook();
        console.log(chalk.green('✅ Pre-commit hook installed'));
      }
      
      if (options.prePush) {
        await installer.installPrePushHook();
        console.log(chalk.green('✅ Pre-push hook installed'));
      }
      
      if (!options.preCommit && !options.prePush) {
        await installer.installPreCommitHook();
        console.log(chalk.green('✅ Pre-commit hook installed by default'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Generate configuration file')
  .option('-o, --output <path>', 'Output path for config file', '.ai-reviewer-config.json')
  .option('--enhanced', 'Generate enhanced configuration with latest features')
  .action((options) => {
    const baseConfig = {
      aiProvider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 64000,
      reviewCriteria: [
        'code quality',
        'security vulnerabilities',
        'performance issues',
        'naming conventions',
        'code complexity',
        'test coverage',
        'documentation'
      ],
      blockingIssues: ['critical', 'high'],
      minimumScore: 6,
      saveToMarkdown: true,
      markdownOutputDir: './code-reviews',
      includeDiffInMarkdown: true
    };

    const enhancedConfig = {
      ...baseConfig,
      enableWebSearch: true,
      enableExtendedThinking: true,
      enableCitations: true,
      enableBatchProcessing: true,
      retryAttempts: 3,
      batchSize: 5,
      saveToMarkdown: true,
      markdownOutputDir: './code-reviews',
      includeDiffInMarkdown: true,
      reviewCriteria: [
        ...baseConfig.reviewCriteria,
        'accessibility',
        'dependency security'
      ],
      alternativeConfigs: {
        openai: {
          aiProvider: 'openai',
          model: 'gpt-4.1',
          maxTokens: 32768,
          enableWebSearch: true
        },
        claude4opus: {
          aiProvider: 'anthropic',
          model: 'claude-opus-4-20250514',
          maxTokens: 32000,
          enableExtendedThinking: true,
          enableCitations: true
        },
        claude37sonnet: {
          aiProvider: 'anthropic',
          model: 'claude-3-7-sonnet-20250219',
          maxTokens: 128000,
          enableWebSearch: true,
          enableCitations: true,
          enableExtendedThinking: true
        },
        gemini25pro: {
          aiProvider: 'google',
          model: 'gemini-2.5-pro-preview-05-06',
          maxTokens: 64000,
          enableWebSearch: true,
          enableCitations: true,
          enableExtendedThinking: true
        },
        gemini25flash: {
          aiProvider: 'google',
          model: 'gemini-2.5-flash-preview-05-20',
          maxTokens: 64000,
          enableWebSearch: true,
          enableCitations: true,
          enableExtendedThinking: true
        }
      }
    };

    const config = options.enhanced ? enhancedConfig : baseConfig;
    fs.writeFileSync(options.output, JSON.stringify(config, null, 2));
    console.log(chalk.green(`✅ Configuration file created: ${options.output}`));
    console.log(chalk.yellow('💡 Don\'t forget to set your provider-specific API key (e.g., ANTHROPIC_API_KEY)'));

    if (options.enhanced) {
      console.log(chalk.blue('🚀 Enhanced configuration includes:'));
      console.log(chalk.blue('  • Web search for real-time best practices'));
      console.log(chalk.blue('  • Extended thinking for deeper analysis'));
      console.log(chalk.blue('  • Citations for recommendations'));
      console.log(chalk.blue('  • Batch processing for efficiency'));
      console.log(chalk.blue('  • Alternative provider configurations'));
    }
  });

program
  .command('review-repo')
  .description('Review the entire repository codebase')
  .option('-c, --config <path>', 'Path to config file')
  .option('--api-key <key>', 'AI API key')
  .option('--provider <provider>', 'AI provider (openai, anthropic, google)', 'anthropic')
  .option('--model <model>', 'AI model to use')
  .option('--web-search', 'Enable web search for best practices')
  .option('--extended-thinking', 'Enable extended thinking (Anthropic only)')
  .option('--citations', 'Enable citations for recommendations')
  .option('--save-markdown', 'Save reviews to markdown files')
  .option('--no-save-markdown', 'Disable saving to markdown files')
  .option('--markdown-dir <dir>', 'Directory to save markdown files')
  .option('--include <patterns>', 'File patterns to include (comma-separated)', '**/*.{js,ts,jsx,tsx,py,java,cpp,c,go,rs,php,rb,cs,kt,swift}')
  .option('--exclude <patterns>', 'File patterns to exclude (comma-separated)', 'node_modules/**,dist/**,build/**,*.min.js,*.test.*,*.spec.*')
  .option('--max-files <number>', 'Maximum number of files to review', '50')
  .action(async (options) => {
    try {
      const config = loadConfig(options);
      const app = new ReviewerApp(config);
      await app.reviewRepository(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test the AI reviewer with sample code')
  .action(async () => {
    console.log(chalk.blue('🧪 Testing AI reviewer...'));
    
    const testDiff = `
diff --git a/test.js b/test.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/test.js
@@ -0,0 +1,10 @@
+function getUserData(id) {
+  // TODO: Add input validation
+  const query = "SELECT * FROM users WHERE id = " + id;
+  return database.query(query);
+}
+
+const password = "admin123";
+
+app.get('/api/user/:id', (req, res) => {
+  res.json(getUserData(req.params.id));
+});
    `;

    const testCommit = {
      hash: 'abc1234',
      message: 'Add user data endpoint',
      author: 'Test User <test@example.com>',
      date: new Date().toISOString()
    };

    const config = loadConfig({});
    const app = new ReviewerApp(config);
    
    try {
      console.log(chalk.cyan('Reviewing test code...'));
      const review = await app.aiReviewer.reviewCode(testDiff, testCommit);
      app.displayReview(review, testCommit);
    } catch (error) {
      console.error(chalk.red('Test failed:'), error.message);
      console.log(chalk.yellow('💡 Make sure to set your provider-specific API key (e.g., ANTHROPIC_API_KEY)'));
    }
  });

// This function is now replaced by the shared configuration loader
// but kept for backward compatibility if needed
function loadConfig(options) {
  return loadConfiguration(options);
}

program.parse();
