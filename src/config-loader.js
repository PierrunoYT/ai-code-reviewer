import fs from 'fs';
import chalk from 'chalk';

/**
 * Load and merge configuration from multiple sources
 * Priority: CLI options > JSON config file > Environment variables > Defaults
 */
export function loadConfiguration(options = {}) {
  let config = {};
  
  // 1. Load from config file
  const configPath = options.config || process.env.AI_REVIEWER_CONFIG_PATH || '.ai-reviewer-config.json';
  
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Warning: Could not parse config file ${configPath}:`, error.message));
    }
  } else if (fs.existsSync('.ai-reviewer-enhanced.json')) {
    // Fallback to enhanced config
    try {
      config = JSON.parse(fs.readFileSync('.ai-reviewer-enhanced.json', 'utf8'));
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Warning: Could not parse enhanced config file:', error.message));
    }
  } else if (fs.existsSync('.ai-reviewer.json')) {
    // Fallback to legacy config
    try {
      config = JSON.parse(fs.readFileSync('.ai-reviewer.json', 'utf8'));
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Warning: Could not parse legacy config file:', error.message));
    }
  }
  
  // 2. Override with command line options (if provided)
  if (options.apiKey) config.apiKey = options.apiKey;
  if (options.provider) config.aiProvider = options.provider;
  if (options.model) config.model = options.model;
  
  // Feature flags from CLI
  if (options.webSearch) config.enableWebSearch = true;
  if (options.extendedThinking) config.enableExtendedThinking = true;
  if (options.citations) config.enableCitations = true;
  if (options.batch) config.enableBatchProcessing = true;
  if (options.batch === false) config.enableBatchProcessing = false;
  if (options.saveMarkdown) config.saveToMarkdown = true;
  if (options.noSaveMarkdown) config.saveToMarkdown = false;
  if (options.markdownDir) config.markdownOutputDir = options.markdownDir;
  if (options.includeDiff) config.includeDiffInMarkdown = true;
  if (options.noIncludeDiff) config.includeDiffInMarkdown = false;
  
  // 3. Set provider-specific API key if not already set
  if (!config.apiKey) {
    const provider = config.aiProvider || 'anthropic';
    switch (provider) {
      case 'anthropic':
        config.apiKey = process.env.ANTHROPIC_API_KEY;
        break;
      case 'openai':
        config.apiKey = process.env.OPENAI_API_KEY;
        break;
      case 'google':
        config.apiKey = process.env.GOOGLE_API_KEY;
        break;
      default:
        config.apiKey = process.env.AI_API_KEY; // fallback
    }
  }
  
  // 4. Apply defaults for any missing values
  const defaults = {
    aiProvider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 16000,
    enableWebSearch: false,
    enableExtendedThinking: false,
    enableCitations: false,
    enableBatchProcessing: true,
    retryAttempts: 3,
    batchSize: 5,
    saveToMarkdown: true,
    markdownOutputDir: './code-reviews',
    includeDiffInMarkdown: true,
    reviewCriteria: [
      'code quality',
      'security vulnerabilities',
      'performance issues',
      'naming conventions',
      'code complexity',
      'test coverage',
      'documentation',
      'accessibility',
      'dependency security'
    ],
    blockingIssues: ['critical', 'high'],
    minimumScore: 6
  };
  
  // Merge defaults with loaded config (config takes precedence)
  return { ...defaults, ...config };
}

/**
 * Validate that the configuration has required values
 */
export function validateConfiguration(config) {
  if (!config.apiKey) {
    const provider = config.aiProvider || 'anthropic';
    throw new Error(
      `No API key found for provider "${provider}". ` +
      `Please set ${provider.toUpperCase()}_API_KEY in your .env file or AI_API_KEY as fallback.`
    );
  }
  
  const validProviders = ['anthropic', 'openai', 'google'];
  if (!validProviders.includes(config.aiProvider)) {
    throw new Error(
      `Invalid AI provider "${config.aiProvider}". ` +
      `Valid providers are: ${validProviders.join(', ')}`
    );
  }
  
  return true;
}
