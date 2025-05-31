# AI PR Reviewer

An intelligent code review system that analyzes your commits before creating pull requests. Uses AI to provide detailed feedback on code quality, security, performance, and best practices.

> [!WARNING]
> **Untested Features & Security Notice**
> 
> The following features have not been fully tested yet and should be used with caution:
> - **Git hooks** (pre-commit, pre-push) - May execute arbitrary code
> - **Automated dependency scanning** 
> - **CI/CD integrations**
> 
> **🔒 Security Warning**: Git hooks can execute arbitrary code and pose security risks. Recent vulnerabilities (CVE-2024-32002, CVE-2024-32004) have shown that malicious repositories can exploit git hooks for remote code execution. Always review git hooks before enabling them in production environments.
> 
> **Recommendation**: Test thoroughly in development environments and review all git hook code before production use.

## Features

- 🤖 **Latest AI Models**: Uses GPT-4.1, Claude 4 Sonnet, Claude 3.7 Sonnet, and Gemini 2.5 Pro/Flash for intelligent code analysis
- 🔍 **Enhanced Analysis**: Reviews code quality, security, performance, accessibility, and dependency security
- 🌐 **Web Search Integration**: Real-time lookup of best practices and security vulnerabilities
- 🧠 **Extended Thinking**: Deep analysis with step-by-step reasoning (Anthropic)
- 📚 **Citations**: Source attribution for recommendations and best practices
- ⚡ **Batch Processing**: Efficient review of multiple commits simultaneously
- 🔄 **Retry Logic**: Robust error handling with exponential backoff
- 📦 **Large Diff Support**: Intelligent chunking for diffs >100KB with comprehensive analysis
- 🪝 **Git Integration**: Automatic git hooks for pre-commit and pre-push reviews
- 📊 **Advanced Scoring**: Quality scores with confidence levels
- 🎯 **Highly Customizable**: Multiple provider configs and feature toggles
- 📄 **Markdown Reports**: Automatic saving of detailed review reports in markdown format
- 📁 **Repository-Wide Review**: Analyze entire codebase with smart file filtering
- 📈 **Commit History Analysis**: Review all commits with statistical insights and trends
- 🚀 **Easy Setup**: Simple CLI installation and configuration

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your environment variables:**
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your API keys
   # For Anthropic/Claude (recommended):
   export ANTHROPIC_API_KEY="your-anthropic-api-key"

   # For OpenAI:
   export OPENAI_API_KEY="your-openai-api-key"

   # For Google/Gemini:
   export GOOGLE_API_KEY="your-google-api-key"
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

# Save reviews to custom markdown directory
npx ai-reviewer review --markdown-dir ./my-reviews

# Disable markdown saving
npx ai-reviewer review --no-save-markdown

# Test the reviewer
npx ai-reviewer test

# Generate enhanced config file
npm run config

# Or use CLI directly for custom output
npx ai-reviewer config --enhanced -o .ai-reviewer-config.json

# Install git hooks
npm run install-hook

# Run demo to see new features
npm run demo
```

**Review entire repository:**
```bash
# Review all code files in repository
npx ai-reviewer review-repo

# Review with custom file patterns
npx ai-reviewer review-repo --include "**/*.{js,py}" --exclude "test/**,*.min.js"

# Limit number of files and save to custom directory
npx ai-reviewer review-repo --max-files 20 --markdown-dir ./repo-reviews

# Use advanced AI features for repository review
npx ai-reviewer review-repo --web-search --extended-thinking --citations
```

**Review all commits:**
```bash
# Review all commits (max 100)
npx ai-reviewer review-all-commits

# Review commits with date range filter
npx ai-reviewer review-all-commits --since 2024-01-01 --until 2024-12-31

# Review commits by specific author
npx ai-reviewer review-all-commits --author "John Doe" --max-commits 50

# Review commits from specific branch with batch processing
npx ai-reviewer review-all-commits --branch feature/new-feature --batch

# Use advanced AI features for commit history review
npx ai-reviewer review-all-commits --web-search --extended-thinking --citations
```

### Git Hooks

> [!CAUTION]
> **Security & Testing Notice**
> 
> **🚨 Git hooks execute arbitrary code** and pose security risks. Recent vulnerabilities (CVE-2024-32002, CVE-2024-32004) have shown that malicious repositories can exploit git hooks for remote code execution.
> 
> **Before enabling hooks:**
> - Review all hook code in `.git/hooks/` directory
> - Test thoroughly in isolated development environments
> - Ensure your repository is from a trusted source
> - Consider running in sandboxed environments
> 
> **Note**: This functionality has not been fully tested yet. Use with extreme caution in production.

Once installed, the hooks will automatically:

- **Pre-commit**: Review staged changes before each commit
- **Pre-push**: Review all commits being pushed to remote

**Security best practices:**
```bash
# Always review hooks before enabling
ls -la .git/hooks/
cat .git/hooks/pre-commit
cat .git/hooks/pre-push

# Test in isolated environment first
git clone <repo> /tmp/test-repo
cd /tmp/test-repo && npm run install-hook
```

**Bypass hooks when needed:**
```bash
git commit --no-verify  # Skip pre-commit hook
git push --no-verify    # Skip pre-push hook
```

**Emergency hook removal:**
```bash
# Remove all hooks if needed
rm .git/hooks/pre-commit .git/hooks/pre-push
```

### Configuration

Create a `.ai-reviewer-config.json` file to customize settings:

> **Note**: Use `npm run config` to generate this file automatically.

```json
{
  "aiProvider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 4000,
  "enableWebSearch": true,
  "enableExtendedThinking": true,
  "enableCitations": true,
  "enableBatchProcessing": true,
  "retryAttempts": 3,
  "batchSize": 5,
  "saveToMarkdown": true,
  "markdownOutputDir": "./code-reviews",
  "includeDiffInMarkdown": true,
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
      "model": "claude-opus-4-20250514",
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
- `saveToMarkdown`: Save detailed review reports in markdown format
- `markdownOutputDir`: Directory to save markdown review files
- `includeDiffInMarkdown`: Include code diffs in markdown reports

## Supported AI Providers

### Anthropic Claude (Recommended)
```bash
export ANTHROPIC_API_KEY="sk-ant-..."  # Your Anthropic API key
```

**Latest Models:**
- `claude-sonnet-4-20250514` - Latest Claude 4 Sonnet with enhanced capabilities (Default)
- `claude-opus-4-20250514` - Most powerful model with extended thinking
- `claude-3-7-sonnet-20250219` - Latest Claude 3.7 Sonnet with hybrid reasoning

**Exclusive Features:**
- Extended thinking for deeper analysis
- Citations with source attribution
- Computer use capabilities
- Batch processing API

### OpenAI
```bash
export OPENAI_API_KEY="sk-..."  # Your OpenAI API key
```

**Latest Models:**
- `gpt-4.1` - Latest GPT-4.1 with improved performance (Default)

**Features:**
- Web search integration
- Function calling
- Enhanced moderation

### Google AI (Gemini)
```bash
export GOOGLE_API_KEY="your-google-ai-api-key"  # Your Google AI API key
```

**Latest Models:**
- `gemini-2.5-pro-preview-05-06` - State-of-the-art thinking model with maximum accuracy
- `gemini-2.5-flash-preview-05-20` - Best price-performance with adaptive thinking

**Features:**
- Adaptive thinking with configurable budgets
- Multimodal understanding (text, images, video, audio)
- Long context windows (up to 1M tokens)
- Native tool use and function calling

## 📊 How Code Analysis Works

The AI reviewer performs comprehensive code analysis through a sophisticated multi-stage process:

### 1. **Git Data Extraction**
```javascript
// Extracts detailed commit information
- Commit hash, author, date, message, and body
- Full unified diff with 3 lines of context around changes
- Complete list of changed files
- File modification types (added, modified, deleted)
```

### 2. **Diff Analysis Structure**
The system uses `git show --unified=3` to capture:
- **Full diff content**: Including additions (+), deletions (-), and context lines
- **File paths**: What files were modified, added, or deleted
- **Line numbers**: Exact locations of changes
- **Change context**: Surrounding code for better understanding
- **Large diff handling**: Automatically chunks diffs >100KB for comprehensive analysis

### 3. **AI Prompt Construction**
Each commit receives a structured analysis prompt containing:

```
You are an expert code reviewer. Review this git commit:

Commit Message: [message]
Author: [author]  
Date: [date]

Code Changes:
```diff
[complete unified diff]
```

Analyze focusing on 8 key dimensions:
1. Code quality and maintainability
2. Security vulnerabilities (OWASP guidelines)
3. Performance implications  
4. Best practices adherence (current industry standards)
5. Testing considerations
6. Documentation needs
7. Accessibility considerations
8. Dependency security
```

### 4. **Enhanced Analysis Features**

**🌐 Web Search Integration** (optional):
- Real-time lookup of security vulnerabilities in dependencies
- Current best practices verification from authoritative sources
- Framework-specific recommendations and updates
- OWASP, NIST, and other security guideline references

**🧠 Extended Thinking** (Claude models):
- Step-by-step reasoning process visible to users
- Deeper analysis with logical thought progression
- Budget-controlled thinking tokens for thorough review

**📚 Citations & Sources**:
- Source attribution for all recommendations
- Links to security guidelines (OWASP, NIST, CWE)
- Best practice documentation references
- Framework and library documentation

### 5. **Multi-Dimensional Analysis Framework**

The AI analyzes **8 critical dimensions** simultaneously:

| Dimension | Analysis Focus | Examples |
|-----------|---------------|----------|
| **🔒 Security** | Vulnerabilities & threats | SQL injection, XSS, secrets in code, input validation |
| **⚡ Performance** | Efficiency & optimization | Inefficient algorithms, memory leaks, database queries |
| **🏗️ Quality** | Code structure & maintainability | Complexity, readability, design patterns, SOLID principles |
| **🎨 Style** | Conventions & consistency | Naming conventions, formatting, code organization |
| **🧪 Testing** | Test coverage & quality | Missing tests, test effectiveness, mocking strategies |
| **📚 Documentation** | Code clarity & docs | Comments, README updates, API documentation |
| **♿ Accessibility** | Inclusive design | ARIA labels, keyboard navigation, screen reader support |
| **📦 Dependencies** | Package security & updates | Vulnerable packages, outdated versions, license issues |

### 6. **Context-Aware Intelligence**

The AI understands and adapts to:

**Language-Specific Patterns:**
- JavaScript/TypeScript: Async/await, promises, ES6+ features
- Python: Pythonic idioms, PEP standards, virtual environments
- Java: Spring patterns, Maven/Gradle, enterprise patterns
- And 50+ other programming languages

**Framework Recognition:**
- **Web**: React, Vue, Angular, Express, Django, Flask
- **Mobile**: React Native, Flutter, Swift, Kotlin
- **Cloud**: AWS, Azure, GCP services and patterns
- **Databases**: SQL patterns, NoSQL usage, ORM practices

**Security Context Analysis:**
- Web application security (OWASP Top 10)
- API security best practices
- Database security patterns
- Authentication and authorization flows

### 7. **Structured Analysis Output**

Returns comprehensive JSON structure:
```json
{
  "score": 7,                    // 1-10 quality rating
  "confidence": 9,               // AI confidence level
  "summary": "Added authentication with security concerns",
  "issues": [
    {
      "severity": "critical",    // critical|high|medium|low
      "description": "SQL injection vulnerability",
      "suggestion": "Use parameterized queries",
      "category": "security",    // security|performance|quality|style|testing|documentation
      "citation": "OWASP SQL Injection Prevention",
      "autoFixable": true
    }
  ],
  "suggestions": ["Add input validation", "Implement rate limiting"],
  "security": ["Use HTTPS", "Hash passwords with bcrypt"],
  "performance": ["Add database indexing", "Implement caching"],
  "dependencies": ["Update vulnerable packages"],
  "accessibility": ["Add ARIA labels", "Improve keyboard navigation"],
  "sources": ["OWASP Top 10", "Node.js Security Checklist"]
}
```

### 8. **Real-World Analysis Examples**

**Example 1: Authentication Code**
```javascript
// Input: User login function with SQL concatenation
function login(username, password) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  return database.query(query);
}

// AI Analysis Output:
// 🚨 CRITICAL: SQL injection vulnerability
// 💡 Suggestion: Use parameterized queries
// 📚 Source: OWASP SQL Injection Prevention Guide
// 🔧 Auto-fixable: Yes
```

**Example 2: React Component**
```jsx
// Input: Component without accessibility
<button onClick={handleClick}>Submit</button>

// AI Analysis Output:
// ⚠️ MEDIUM: Missing accessibility attributes
// 💡 Suggestion: Add aria-label and keyboard support
// 📚 Source: WAI-ARIA Authoring Practices
// ♿ Accessibility: Consider screen reader users
```

### 9. **Intelligent Scoring System**

**Quality Score (1-10):**
- **8-10**: Excellent code with minor suggestions
- **6-7**: Good code with some improvements needed
- **4-5**: Acceptable but requires attention
- **1-3**: Significant issues requiring immediate fixes

**Confidence Level (1-10):**
- **8-10**: High confidence in analysis accuracy
- **6-7**: Good confidence with some uncertainty
- **4-5**: Moderate confidence, manual review suggested
- **1-3**: Low confidence, human expert review required

The analysis is **comprehensive, context-aware, and actionable** - providing expert-level code review insights with the latest security knowledge and best practices, far beyond simple syntax checking.

## 🆕 Advanced Review Commands

### Repository-Wide Code Review (`review-repo`)

Analyze your entire codebase with AI-powered insights, perfect for code audits, onboarding new team members, or comprehensive security assessments.

**Key Features:**
- 🔍 **Smart File Discovery**: Automatically finds code files using configurable patterns
- 📁 **Pattern Filtering**: Include/exclude files with glob-like patterns  
- 📦 **Intelligent Grouping**: Groups files to optimize AI analysis quality
- 🛡️ **Security Focus**: Comprehensive security analysis across entire codebase
- 📊 **Detailed Reports**: Individual file group reviews plus summary analytics

**Usage Examples:**
```bash
# Basic repository review
npx ai-reviewer review-repo

# Custom file patterns (Python and JavaScript only)
npx ai-reviewer review-repo --include "**/*.{py,js}" --exclude "venv/**,node_modules/**"

# Focused security audit with limited files
npx ai-reviewer review-repo --max-files 25 --web-search --citations

# Full enterprise audit with all advanced features
npx ai-reviewer review-repo --extended-thinking --web-search --citations --markdown-dir ./audit-reports
```

**Command Options:**
- `--include <patterns>`: File patterns to include (default: common code files)
- `--exclude <patterns>`: File patterns to exclude (default: build dirs, tests, node_modules)
- `--max-files <number>`: Maximum files to review (default: 50)
- All standard AI options (provider, model, web-search, etc.)

**Generated Reports:**
- Detailed analysis for each file group (5 files per group)
- Security vulnerability assessments
- Code quality and maintainability insights
- Performance optimization opportunities
- Architecture and design pattern recommendations

### Commit History Analysis (`review-all-commits`)

Analyze your project's entire commit history to understand code evolution, identify patterns, and get comprehensive development insights.

**Key Features:**
- 📈 **Historical Analysis**: Review all commits with trends and patterns
- 🔍 **Advanced Filtering**: Filter by date range, author, branch, and commit count
- 📊 **Statistical Insights**: Contributor analysis, activity patterns, commit type analysis
- ⚡ **Batch Processing**: Efficient processing of large commit histories
- 📋 **Summary Reports**: Comprehensive analytics plus individual commit reviews

**Usage Examples:**
```bash
# Review all recent commits (default: last 100)
npx ai-reviewer review-all-commits

# Date range analysis for quarterly review
npx ai-reviewer review-all-commits --since 2024-01-01 --until 2024-03-31

# Author-specific contribution analysis
npx ai-reviewer review-all-commits --author "Jane Developer" --max-commits 50

# Branch-specific development review
npx ai-reviewer review-all-commits --branch feature/new-architecture --batch

# Comprehensive audit with all AI features
npx ai-reviewer review-all-commits --web-search --extended-thinking --citations --max-commits 200
```

**Command Options:**
- `--max-commits <number>`: Maximum commits to review (default: 100)
- `--since <date>`: Only review commits since date (YYYY-MM-DD)
- `--until <date>`: Only review commits until date (YYYY-MM-DD)  
- `--author <name>`: Only review commits by specific author
- `--branch <name>`: Review commits from specific branch (default: HEAD)
- `--batch/--no-batch`: Enable/disable batch processing
- All standard AI options (provider, model, web-search, etc.)

**Generated Analytics:**
1. **Individual Commit Reviews**: Detailed AI analysis of each commit
2. **Contributor Statistics**: Top contributors and their commit distribution
3. **Activity Patterns**: Monthly/quarterly development activity trends
4. **Commit Type Analysis**: Conventional commit pattern analysis (feat, fix, docs, etc.)
5. **Quality Trends**: Code quality evolution over time
6. **Security Timeline**: Security-related changes and improvements

**Example Summary Output:**
```
📋 Commit History Summary:
────────────────────────────────────────────────────────────
Total commits reviewed: 150

👥 Top Contributors:
  1. Alice Johnson: 65 commits (43.3%)
  2. Bob Smith: 45 commits (30.0%)
  3. Carol Davis: 25 commits (16.7%)

📅 Monthly Activity:
  2024-01: 42 commits
  2024-02: 38 commits  
  2024-03: 35 commits

🏷️ Common Commit Types:
  1. "feat": 68 commits (45.3%)
  2. "fix": 32 commits (21.3%)
  3. "docs": 28 commits (18.7%)
```

### Use Cases for Advanced Commands

**Repository Review (`review-repo`):**
- 🔒 **Security Audits**: Comprehensive security assessment of entire codebase
- 👋 **Onboarding**: Help new team members understand codebase architecture
- 📋 **Code Quality Assessment**: Enterprise-grade code quality evaluation
- 🎯 **Technical Debt Analysis**: Identify areas needing refactoring or improvement
- 📊 **Compliance Reporting**: Generate compliance reports for security standards

**Commit History Review (`review-all-commits`):**
- 📈 **Development Analytics**: Understand team productivity and code evolution
- 🎯 **Quality Trends**: Track code quality improvements over time
- 👥 **Team Performance**: Analyze individual and team contribution patterns
- 🔍 **Change Impact Analysis**: Understand the impact of major changes
- 📋 **Project Retrospectives**: Data-driven insights for sprint/project reviews
- 🚀 **Release Planning**: Identify high-risk changes before releases

Both commands integrate seamlessly with all AI providers and advanced features like web search, extended thinking, and citations, providing the same expert-level analysis across your entire development workflow.

## ⚡ Batch Processing

The AI reviewer includes advanced **batch processing** capabilities that dramatically improve efficiency and reduce costs when reviewing multiple commits.

### What is Batch Processing?

Instead of analyzing commits one-by-one sequentially, batch processing sends multiple commits to the AI provider simultaneously for parallel analysis. This is especially beneficial for:

- `review-all-commits` with many commits
- `review HEAD~10..HEAD` with multiple commits  
- Large commit ranges and repository reviews

### 🚀 Benefits

| Benefit | Description | Impact |
|---------|-------------|---------|
| **💰 Cost Savings** | Up to 50% reduction in API costs (Anthropic) | Significant savings for large reviews |
| **⚡ Speed** | Parallel processing vs sequential | 3-5x faster for multiple commits |
| **🎯 Efficiency** | Optimized API usage and rate limiting | Better resource utilization |
| **🔄 Reliability** | Built-in retry and error handling | More robust for large operations |

### 📊 How It Works

```bash
# When you run this command with multiple commits:
npx ai-reviewer review-all-commits --max-commits 10 --batch

# You'll see status updates like:
🚀 Using batch processing for faster reviews...
📦 Processing batch 1/2
Batch status: in_progress, requests: {"processing":5,"succeeded":0,"errored":0,"canceled":0,"expired":0}
Batch status: ended, requests: {"processing":0,"succeeded":5,"errored":0,"canceled":0,"expired":0}
```

### 🔍 Understanding Batch Status Messages

**Status Indicators:**
- `in_progress` - Batch is being processed by AI
- `ended` - Batch completed successfully
- `canceling/canceled` - Batch was canceled
- `failed` - Batch encountered errors

**Request Counters:**
- `processing: X` - Number of commits currently being analyzed
- `succeeded: X` - Number of commits completed successfully
- `errored: X` - Number of commits that failed analysis
- `canceled: X` - Number of commits that were canceled
- `expired: X` - Number of commits that timed out

### ⏱️ Typical Processing Times

| Batch Size | Expected Time | Use Case |
|------------|---------------|----------|
| 2-5 commits | 30-60 seconds | Feature branch review |
| 6-15 commits | 1-3 minutes | Sprint retrospective |
| 16-50 commits | 3-5 minutes | Release preparation |
| 51+ commits | 5-10 minutes | Major version analysis |

### 🎛️ Configuration Options

**Enable/Disable Batch Processing:**
```bash
# Enable batch processing (default for multiple commits)
npx ai-reviewer review-all-commits --batch

# Disable batch processing (sequential mode)
npx ai-reviewer review-all-commits --no-batch
```

**Configuration File:**
```json
{
  "enableBatchProcessing": true,  // Enable batch processing
  "batchSize": 5,                 // Commits per batch group
  "retryAttempts": 3              // Retry failed batch requests
}
```

### 🔧 Provider Support

| Provider | Batch Support | Benefits |
|----------|---------------|----------|
| **Anthropic** | ✅ Full Support | 50% cost reduction, parallel processing |
| **OpenAI** | ⚠️ Limited | Some efficiency gains |
| **Google** | ❌ Not Available | Falls back to sequential processing |

### 🛠️ Troubleshooting Batch Processing

**If batch processing seems stuck:**
1. **Check internet connection** - Batch processing requires stable connectivity
2. **Wait patiently** - Large batches can take 5-10 minutes
3. **Check API limits** - Ensure you haven't exceeded rate limits
4. **Monitor status** - Processing status updates every 5 seconds

**If batch processing fails:**
```bash
# Automatic fallback to sequential processing
Batch processing failed, falling back to sequential: [error message]
Processing 10 commits sequentially...
```

**Force sequential processing:**
```bash
# If you want to avoid batch processing entirely
npx ai-reviewer review-all-commits --no-batch
```

### 💡 Best Practices

**When to use batch processing:**
- ✅ Multiple commits (3+ commits)
- ✅ Historical analysis (`review-all-commits`)
- ✅ Release preparation and audits
- ✅ Team retrospectives

**When to use sequential processing:**
- ✅ Single commit reviews
- ✅ Real-time development feedback
- ✅ Unstable network connections
- ✅ Debugging specific commit issues

**Optimize batch performance:**
```bash
# Configure optimal batch size for your use case
{
  "batchSize": 10,           // Larger batches for better efficiency
  "enableBatchProcessing": true,
  "retryAttempts": 5         // More retries for reliability
}
```

Batch processing makes the AI reviewer incredibly efficient for large-scale code analysis, turning what could be hours of sequential processing into minutes of parallel analysis! 🚀

## 📦 Large Diff Handling

The AI reviewer automatically handles large diffs (>100KB) through intelligent chunking, ensuring comprehensive analysis of even the largest code changes.

### 🤔 Why Large Diff Handling?

Large diffs can occur in several scenarios:
- Major refactoring commits
- Library updates with extensive changes
- Generated code commits (build outputs, migrations)
- Merging long-running feature branches
- Initial repository setup commits

### 🔧 How It Works

When a diff exceeds 100KB, the system automatically:

1. **🔍 Detects large diff**: `Diff is large (350KB), using chunked review approach...`
2. **📦 Smart chunking**: Splits diff by file boundaries first, then by lines if needed
3. **⚡ Parallel analysis**: Reviews each chunk with full AI capabilities
4. **🔄 Intelligent combining**: Merges chunk reviews into comprehensive analysis
5. **📋 Clear reporting**: Indicates chunked analysis in summary and suggestions

### 📊 Chunking Strategy

**File-Based Splitting (Preferred):**
```diff
# Chunk 1: Complete files A and B
diff --git a/fileA.js b/fileA.js
[complete file changes]

diff --git a/fileB.js b/fileB.js  
[complete file changes]

# Chunk 2: Complete files C and D
diff --git a/fileC.js b/fileC.js
[complete file changes]
```

**Line-Based Splitting (Fallback):**
```diff
# If individual files are too large, split by lines
# Chunk 1: Lines 1-1000 of large file
# Chunk 2: Lines 1001-2000 of large file
# etc.
```

### 🎯 Benefits

| Benefit | Description |
|---------|-------------|
| **📈 No Size Limits** | Review commits of any size |
| **🔍 Complete Analysis** | Every line gets AI attention |
| **🧠 Context Preservation** | File boundaries maintained when possible |
| **⚡ Efficient Processing** | Parallel chunk analysis |
| **📊 Comprehensive Results** | Combined insights from all chunks |

### 📋 Example Output

```bash
📦 Diff is large (245KB), using chunked review approach...
📦 Review attempt 1 failed: Diff too large. Maximum 100KB allowed
📦 Review attempt 2 failed: Diff too large. Maximum 100KB allowed  
📦 Review attempt 3 failed: Diff too large. Maximum 100KB allowed
📦 All retry attempts failed, using fallback review
📦 Reviewing file group 4/4
📦 Reviewing chunk 1/4...
📦 Reviewing chunk 2/4...
📦 Reviewing chunk 3/4...
📦 Reviewing chunk 4/4...

✅ AI Review Results:
────────────────────────────────────────────────────────────────────────────────
📊 Code Quality Score: 7/10
🎯 Confidence Level: 8/10

📋 Summary: Large diff review (245KB): Comprehensive refactoring with security improvements; Updated authentication system; Performance optimizations implemented

💡 Suggestions:
  1. This review was performed on a large diff (245KB) using chunked analysis
  2. Consider breaking large commits into smaller, focused changes
  3. Add comprehensive tests for refactored components
```

### ⚙️ Configuration

Large diff handling is automatic and doesn't require configuration, but you can influence the process:

```json
{
  "maxTokens": 64000,           // Larger token limits = bigger chunks
  "retryAttempts": 3,           // Retries before falling back to chunking
  "aiProvider": "anthropic"     // Provider affects chunk processing efficiency
}
```

### 💡 Best Practices

**For Developers:**
- ✅ **Commit Often**: Smaller, focused commits are easier to review
- ✅ **Logical Grouping**: Group related changes together
- ✅ **Separate Concerns**: Keep refactoring separate from feature additions
- ✅ **Generated Code**: Consider reviewing generated code separately

**For Large Diffs:**
- ✅ **Trust the Process**: Chunking provides comprehensive analysis
- ✅ **Review Summary**: Pay attention to the combined summary
- ✅ **Check All Issues**: Issues are deduplicated across chunks
- ✅ **Consider Breaking Up**: For extremely large changes, consider multiple PRs

### 🔍 Understanding Chunk Analysis

**What happens during chunking:**
1. **File Boundary Respect**: Related changes stay together when possible
2. **Context Preservation**: Each chunk includes enough context for AI understanding
3. **Issue Deduplication**: Similar issues across chunks are merged
4. **Score Averaging**: Overall score reflects average quality across all chunks
5. **Comprehensive Suggestions**: All improvement suggestions are collected and presented

The chunking system ensures that **no part of your code goes unreviewed**, while maintaining the same high-quality analysis standards as smaller diffs!

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

## 📄 Markdown Review Reports

All reviews are automatically saved as detailed markdown files in the `./code-reviews` directory (configurable). Each report includes:

- **Complete review details** with all scores, issues, and suggestions
- **Formatted markdown** with proper headings, emojis, and structure
- **Code diffs** (optional, enabled by default)
- **Timestamped filenames** for easy organization
- **Provider and model information** in footer

**Example filename format:**
```
2025-05-30T14-30-15-abc12345-fix-authentication-bug.md
```

**Report structure:**
- 📊 Review Scores (Quality & Confidence)
- 📋 Summary
- ⚠️ Issues Found (categorized by severity)
- 💡 General Suggestions
- 🔒 Security Notes
- ⚡ Performance Notes
- 📦 Dependency Notes
- ♿ Accessibility Notes
- 📚 Sources Consulted
- 📝 Code Changes (diff)

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
├── index.js              # Main application entry point
├── ai-reviewer.js        # AI integration and API calls
├── git-analyzer.js       # Git operations and diff analysis
├── cli.js               # Command line interface
├── config-loader.js      # Configuration management
├── demo.js              # Demo script showcasing features
└── git-hook-installer.js # Git hooks management

Configuration Files:
├── .ai-reviewer-config.json  # Main configuration file
├── .env.example             # Environment variables template
├── package.json             # Node.js dependencies and scripts
└── .gitignore              # Git ignore patterns
```

**Scripts:**
```bash
npm start          # Run the reviewer
npm run review     # Review commits
npm run install-hook # Install git hooks
npm test          # Run tests with sample code
npm run demo      # Run demo showcasing enhanced features
npm run config    # Generate enhanced configuration file (outputs to .ai-reviewer-config.json)
```

**Available CLI Commands:**
```bash
npx ai-reviewer review [range]           # Review specific commits or commit ranges
npx ai-reviewer review-repo              # Review entire repository codebase
npx ai-reviewer review-all-commits       # Review all commits in repository history
npx ai-reviewer install-hooks            # Install git hooks for automated reviews
npx ai-reviewer config                   # Generate configuration file
npx ai-reviewer test                     # Test the AI reviewer with sample code
npx ai-reviewer --help                   # Show all available commands and options
```

## Environment Variables

### Required API Keys (choose one or more providers)
- `ANTHROPIC_API_KEY` - Your Anthropic/Claude API key
- `OPENAI_API_KEY` - Your OpenAI API key
- `GOOGLE_API_KEY` - Your Google/Gemini API key
- `AI_API_KEY` - Legacy fallback API key (for backward compatibility)

### Optional Configuration
- `AI_PROVIDER` - AI provider ('anthropic', 'openai', or 'google') - defaults to 'anthropic'
- `AI_MODEL` - AI model to use - defaults to provider-specific latest model
- `DEBUG` - Enable debug logging (true/false) - defaults to false
- `AI_REVIEWER_CONFIG_PATH` - Custom config file path - defaults to '.ai-reviewer-config.json'
- `JWT_SECRET` - JWT secret for demo authentication scenarios

## Troubleshooting

**Common Issues:**

1. **"AI API key not found"**
   - Set the appropriate API key environment variable:
     - `ANTHROPIC_API_KEY` for Claude models
     - `OPENAI_API_KEY` for GPT models
     - `GOOGLE_API_KEY` for Gemini models
   - Or specify `--api-key` in CLI command
   - Or use the CLI `--api-key` parameter

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

## Security Considerations

- **API Keys**: Never commit your `.env` file or expose API keys in code
- **Environment Variables**: Use `.env.example` as a template and create your own `.env` file
- **Git Hooks**: The pre-commit and pre-push hooks help catch security issues before they're committed
- **Configuration**: Review the `.ai-reviewer-config.json` file to ensure it meets your security requirements
- **Backup**: Git hooks create backup files (`.backup` extension) when installing over existing hooks

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

The AI reviewer will automatically review your PR! 🎉
