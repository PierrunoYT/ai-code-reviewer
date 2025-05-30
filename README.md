# AI PR Reviewer

An intelligent code review system that analyzes your commits before creating pull requests. Uses AI to provide detailed feedback on code quality, security, performance, and best practices.

## Features

- 🤖 **Latest AI Models**: Uses GPT-4.1, Claude 4 Sonnet, Claude 3.7 Sonnet, and Gemini 2.5 Pro/Flash for intelligent code analysis
- 🔍 **Enhanced Analysis**: Reviews code quality, security, performance, accessibility, and dependency security
- 🌐 **Web Search Integration**: Real-time lookup of best practices and security vulnerabilities
- 🧠 **Extended Thinking**: Deep analysis with step-by-step reasoning (Anthropic)
- 📚 **Citations**: Source attribution for recommendations and best practices
- ⚡ **Batch Processing**: Efficient review of multiple commits simultaneously
- 🔄 **Retry Logic**: Robust error handling with exponential backoff
- 🪝 **Git Integration**: Automatic git hooks for pre-commit and pre-push reviews
- 📊 **Advanced Scoring**: Quality scores with confidence levels
- 🎯 **Highly Customizable**: Multiple provider configs and feature toggles
- 🚀 **Easy Setup**: Simple CLI installation and configuration

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your AI API key:**
   ```bash
   export AI_API_KEY="your-openai-or-anthropic-api-key"
   ```

3. **Install git hooks (optional but recommended):**
   ```bash
   npm run install-hook
   ```

## Usage

### Command Line Interface

**Review recent commits:**
```bash
# Review last commit
npm run review

# Review multiple commits
npm run review HEAD~3..HEAD

# Review specific commit range
npm run review abc1234..def5678
```

**Using the CLI directly:**
```bash
# Review with enhanced features
npx ai-reviewer review --provider anthropic --web-search --citations

# Review with batch processing
npx ai-reviewer review HEAD~5..HEAD --batch

# Review with extended thinking (Anthropic only)
npx ai-reviewer review --extended-thinking

# Test the reviewer
npx ai-reviewer test

# Generate enhanced config file
npx ai-reviewer config --enhanced

# Generate basic config file
npx ai-reviewer config

# Install git hooks
npx ai-reviewer install-hooks --pre-commit --pre-push

# Run demo to see new features
npm run demo
```

### Git Hooks

Once installed, the hooks will automatically:

- **Pre-commit**: Review staged changes before each commit
- **Pre-push**: Review all commits being pushed to remote

**Bypass hooks when needed:**
```bash
git commit --no-verify  # Skip pre-commit hook
git push --no-verify    # Skip pre-push hook
```

### Configuration

Create a `.ai-reviewer-config.json` file to customize settings:

```json
{
  "aiProvider": "anthropic",
  "model": "claude-4-sonnet",
  "maxTokens": 4000,
  "enableWebSearch": true,
  "enableExtendedThinking": true,
  "enableCitations": true,
  "enableBatchProcessing": true,
  "retryAttempts": 3,
  "batchSize": 5,
  "reviewCriteria": [
    "code quality",
    "security vulnerabilities",
    "performance issues",
    "naming conventions",
    "code complexity",
    "test coverage",
    "documentation",
    "accessibility",
    "dependency security"
  ],
  "blockingIssues": ["critical", "high"],
  "minimumScore": 6,
  "alternativeConfigs": {
    "openai": {
      "aiProvider": "openai",
      "model": "gpt-4.1",
      "maxTokens": 4000,
      "enableWebSearch": true
    },
    "claude4opus": {
      "aiProvider": "anthropic",
      "model": "claude-4-opus",
      "maxTokens": 8000,
      "enableExtendedThinking": true,
      "enableCitations": true
    },
    "claude37sonnet": {
      "aiProvider": "anthropic",
      "model": "claude-3-7-sonnet-20250219",
      "maxTokens": 4000,
      "enableWebSearch": true,
      "enableCitations": true,
      "enableExtendedThinking": true
    },
    "gemini25pro": {
      "aiProvider": "google",
      "model": "gemini-2.5-pro-preview-05-06",
      "maxTokens": 4000,
      "enableWebSearch": true,
      "enableCitations": true,
      "enableExtendedThinking": true
    },
    "gemini25flash": {
      "aiProvider": "google",
      "model": "gemini-2.5-flash-preview-05-20",
      "maxTokens": 4000,
      "enableWebSearch": true,
      "enableCitations": true,
      "enableExtendedThinking": true
    }
  }
}
```

**Configuration Options:**
- `enableWebSearch`: Real-time web search for best practices
- `enableExtendedThinking`: Deep analysis with reasoning steps (Anthropic)
- `enableCitations`: Include source attribution in recommendations
- `enableBatchProcessing`: Process multiple commits efficiently
- `retryAttempts`: Number of retry attempts on API failures
- `batchSize`: Number of commits to process in each batch

## Supported AI Providers

### Anthropic Claude (Recommended)
```bash
export AI_API_KEY="sk-ant-..."  # Your Anthropic API key
```

**Latest Models:**
- `claude-4-sonnet` - Latest Claude 4 Sonnet with enhanced capabilities (Default)
- `claude-4-opus` - Most powerful model with extended thinking
- `claude-3-7-sonnet-20250219` - Latest Claude 3.7 Sonnet with hybrid reasoning
- `claude-3-5-haiku` - Fast and efficient for quick reviews

**Exclusive Features:**
- Extended thinking for deeper analysis
- Citations with source attribution
- Computer use capabilities
- Batch processing API

### OpenAI
```bash
export AI_API_KEY="sk-..."  # Your OpenAI API key
```

**Latest Models:**
- `gpt-4.1` - Latest GPT-4.1 with improved performance (Default)
- `gpt-4-turbo` - Fast and capable
- `o3` and `o4-mini` - Reasoning models for complex analysis

**Features:**
- Web search integration
- Function calling
- Enhanced moderation

### Google AI (Gemini)
```bash
export AI_API_KEY="your-google-ai-api-key"  # Your Google AI API key
```

**Latest Models:**
- `gemini-2.5-pro-preview-05-06` - State-of-the-art thinking model with maximum accuracy
- `gemini-2.5-flash-preview-05-20` - Best price-performance with adaptive thinking
- `gemini-2.0-flash` - Next generation features with enhanced capabilities

**Features:**
- Adaptive thinking with configurable budgets
- Multimodal understanding (text, images, video, audio)
- Long context windows (up to 1M tokens)
- Native tool use and function calling

## Enhanced Review Output

The AI reviewer provides comprehensive analysis:

- **Quality Score**: 1-10 rating of code quality
- **Confidence Level**: AI's confidence in the review (1-10)
- **Summary**: Brief overview of the changes
- **Categorized Issues**: Problems with severity, category, and auto-fix indicators
- **Suggestions**: Improvement recommendations
- **Security Notes**: Security-related observations
- **Performance Notes**: Performance implications
- **Dependency Notes**: Package and library security
- **Accessibility Notes**: Accessibility considerations
- **Citations**: Source attribution for recommendations

Example enhanced output:
```
📊 Code Quality Score: 7/10
🎯 Confidence Level: 9/10

📋 Summary: Added user authentication endpoint with password validation

⚠️  Issues Found:
  1. 🚨 CRITICAL: SQL injection vulnerability in getUserData function
     💡 Suggestion: Use parameterized queries instead of string concatenation
     🏷️  Category: security
     📚 Source: OWASP SQL Injection Prevention Cheat Sheet
     🔧 Auto-fixable: Yes

  2. ⚠️ HIGH: Hardcoded JWT secret key
     💡 Suggestion: Use environment variables for secrets
     🏷️  Category: security
     📚 Source: NIST Cybersecurity Framework

💡 Suggestions:
  1. Add input validation for user parameters
  2. Implement rate limiting for authentication attempts
  3. Add comprehensive unit tests

🔒 Security Notes:
  1. Missing authentication middleware on sensitive endpoints
  2. Password complexity requirements not enforced

⚡ Performance Notes:
  1. Consider implementing connection pooling for database queries

📦 Dependency Notes:
  1. bcrypt version should be updated to latest for security patches

♿ Accessibility Notes:
  1. Authentication forms should include proper ARIA labels

📚 Sources Consulted:
  1. OWASP Authentication Cheat Sheet
  2. Node.js Security Best Practices
  3. JWT Security Best Practices
```

## Development

**Project Structure:**
```
src/
├── index.js              # Main application
├── ai-reviewer.js        # AI integration
├── git-analyzer.js       # Git operations
├── cli.js               # Command line interface
└── git-hook-installer.js # Git hooks management
```

**Scripts:**
```bash
npm start          # Run the reviewer
npm run review     # Review commits
npm run install-hook # Install git hooks
npm test          # Run tests
```

## Environment Variables

- `AI_API_KEY` - Your AI provider API key (required)
- `AI_PROVIDER` - AI provider ('openai', 'anthropic', or 'google')
- `AI_MODEL` - AI model to use
- `DEBUG` - Enable debug logging

## Troubleshooting

**Common Issues:**

1. **"AI API key not found"**
   - Set the `AI_API_KEY` environment variable
   - Or specify `--api-key` in CLI command

2. **Git hooks not working**
   - Ensure you're in a git repository
   - Run `npm run install-hook` to reinstall hooks
   - Check hook permissions on Unix systems

3. **Reviews taking too long**
   - Reduce `maxTokens` in configuration
   - Use a faster AI model
   - Review smaller commit ranges

4. **False positives in reviews**
   - Customize `reviewCriteria` in configuration
   - Adjust `minimumScore` threshold
   - Use `--no-verify` to bypass when needed

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

The AI reviewer will automatically review your PR! 🎉
