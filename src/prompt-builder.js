export class PromptBuilder {
    constructor(config) {
        this.config = config;
    }

    // Core analysis framework used across all prompt types
    getAnalysisFramework() {
        return `Please analyze focusing on:
1. Code quality and maintainability
2. Security vulnerabilities and potential threats
3. Performance implications and optimizations
4. Best practices adherence
5. Testing considerations
6. Documentation needs
7. Accessibility considerations
8. Dependency security and updates`;
    }

    // Standard JSON format requirements
    getJsonFormatRequirements() {
        return `CRITICAL REQUIREMENTS:
- MUST return ONLY valid JSON in the exact format shown above
- DO NOT wrap the JSON in markdown code blocks or backticks
- NO additional text, explanations, or markdown formatting outside the JSON
- Start your response directly with { and end with }
- Score from 1-10 (10 being excellent)
- Confidence level from 1-10 (10 being very confident)
- All string values must be properly escaped and quoted
- Arrays must contain only strings
- Do not truncate the JSON response - ensure it is complete
- End the JSON with proper closing braces and brackets`;
    }

    // Standard JSON output schema
    getOutputSchema() {
        return `{
  "score": <1-10 integer>,
  "confidence": <1-10 integer>,
  "summary": "<brief summary of changes and overall assessment>",
  "issues": [
    {
      "severity": "<critical|high|medium|low>",
      "description": "<description of the issue>",
      "suggestion": "<how to fix it>",
      "category": "<security|performance|quality|style|testing|documentation|accessibility|dependencies>",
      "citation": "<source or reference if applicable>",
      "autoFixable": <true|false>
    }
  ],
  "suggestions": ["<general improvement suggestions>"],
  "security": ["<security-specific notes>"],
  "performance": ["<performance-specific notes>"],
  "dependencies": ["<dependency-related notes>"],
  "accessibility": ["<accessibility-specific notes>"],
  "sources": ["<sources consulted for recommendations>"]
}`;
    }

    buildPrompt(diff, commit, useWebSearch = false) {
        // Check if this is a repository review (not a commit diff)
        if (commit.author === 'Repository Review <repo@ai-reviewer.com>' || commit.message.startsWith('Repository review')) {
            return this.buildRepositoryPrompt(diff, commit, useWebSearch);
        }

        // Sanitize inputs to prevent prompt injection
        const sanitizedMessage = this.sanitizeText(commit.message);
        const sanitizedAuthor = this.sanitizeText(commit.author);
        const sanitizedDiff = this.sanitizeDiff(diff);

        let basePrompt = `You are an expert code reviewer with deep expertise in security analysis, performance optimization, and software engineering best practices. Please review the following git commit and provide comprehensive feedback.

Commit Message: ${sanitizedMessage}
Author: ${sanitizedAuthor}
Date: ${commit.date}

Code Changes:
\`\`\`diff
${sanitizedDiff}
\`\`\`

${this.getAnalysisFramework()}

Please provide your analysis in the following JSON format:
${this.getOutputSchema()}

${this.getJsonFormatRequirements()}`;

        // Add web search context if enabled
        if (useWebSearch) {
            basePrompt += `\n\nNote: Use your knowledge of current security vulnerabilities and best practices. Reference authoritative sources like OWASP, NIST, framework documentation, and security advisories when applicable.`;
        }

        // Add extended thinking instruction for Anthropic
        if (this.config.enableExtendedThinking && this.config.aiProvider === 'anthropic') {
            basePrompt += `\n\nPlease use extended thinking to thoroughly analyze this code change step by step before providing your final assessment.`;
        }

        // Add citations instruction if enabled
        if (this.config.enableCitations) {
            basePrompt += `\n\nImportant: Include citations and sources for your recommendations in the 'citation' field and 'sources' array.`;
        }

        return basePrompt;
    }

    buildRepositoryPrompt(fileContent, reviewInfo, useWebSearch = false) {
        // Extract file names from the review info
        const sanitizedMessage = this.sanitizeText(reviewInfo.message);
        const sanitizedContent = this.sanitizeText(fileContent);

        // Parse file names from the message (e.g., "Repository review - Group 1: file1.js, file2.js")
        const fileNamesMatch = sanitizedMessage.match(/Group \d+: (.+)/);
        const fileNames = fileNamesMatch ? fileNamesMatch[1] : 'files';
        const groupInfo = sanitizedMessage.includes('Chunk') ? 'code chunk' : 'file group';

        let basePrompt = `You are an expert code reviewer with deep expertise in security analysis, performance optimization, and software engineering best practices. Please review the following ${groupInfo} containing ${fileNames} and provide comprehensive feedback with special attention to cross-file patterns and architectural concerns.

Review Type: Repository Code Analysis
Files: ${fileNames}
Analysis Date: ${reviewInfo.date}

File Contents:
${sanitizedContent}

${this.getAnalysisFramework()}

For multi-file analysis, also consider:
- Cross-file dependencies and coupling
- Architectural patterns and consistency
- Code organization and module boundaries
- Shared utilities and potential refactoring opportunities

Please provide your analysis in the following JSON format:
${this.getOutputSchema()}

${this.getJsonFormatRequirements()}`;

        // Add enhanced features if enabled
        if (useWebSearch) {
            basePrompt += '\n\nPlease use web search to verify current best practices and security guidelines for the frameworks and libraries detected in the code.';
        }

        if (this.config.enableCitations) {
            basePrompt += '\n\nPlease include citations and references to official documentation, security guidelines (like OWASP), and best practice resources in your analysis.';
        }

        if (this.config.enableExtendedThinking) {
            basePrompt += '\n\nPlease use extended thinking to provide deep analysis and reasoning for your assessments.';
        }

        return basePrompt;
    }

    sanitizeText(text) {
        if (!text) return '';

        // Remove potential prompt injection patterns
        return text
            .replace(/```/g, '\\`\\`\\`')
            .replace(/\n\n\s*system:/gi, '\n\n user:')
            .replace(/\n\n\s*assistant:/gi, '\n\n user:')
            .replace(/\n\n\s*human:/gi, '\n\n user:')
            .replace(/<\|.*?\|>/g, '')
            .substring(0, 50000); // Increased limit for repository reviews with complete file content
    }

    sanitizeDiff(diff) {
        if (!diff) return '';

        // Remove potential prompt injection while preserving diff structure
        let sanitized = diff
            .replace(/```/g, '\\`\\`\\`')
            .replace(/\n\n\s*system:/gi, '\n\n# system:')
            .replace(/\n\n\s*assistant:/gi, '\n\n# assistant:')
            .replace(/\n\n\s*human:/gi, '\n\n# human:')
            .replace(/<\|.*?\|>/g, '');

        // Truncate very large diffs but preserve structure
        if (sanitized.length > 50000) {
            const lines = sanitized.split('\n');
            const truncatedLines = lines.slice(0, 1000);
            truncatedLines.push('... (diff truncated due to size) ...');
            sanitized = truncatedLines.join('\n');
        }

        return sanitized;
    }

    buildLargeDiffPrompt(chunkIndex, totalChunks, chunk, commit, useWebSearch = false) {
        const sanitizedMessage = this.sanitizeText(commit.message);
        const sanitizedAuthor = this.sanitizeText(commit.author);
        const sanitizedChunk = this.sanitizeDiff(chunk);

        let prompt = `You are an expert code reviewer with deep expertise in security analysis, performance optimization, and software engineering best practices. Please review this chunk (${chunkIndex + 1}/${totalChunks}) of a larger git commit.

Commit Message: ${sanitizedMessage}
Author: ${sanitizedAuthor}
Date: ${commit.date}
Chunk: ${chunkIndex + 1} of ${totalChunks}

Code Changes (Chunk ${chunkIndex + 1}):
\`\`\`diff
${sanitizedChunk}
\`\`\`

IMPORTANT CONTEXT: This is chunk ${chunkIndex + 1} of ${totalChunks} total chunks from a larger commit. Focus on this specific chunk while considering:
- How this chunk might relate to other parts of the larger change
- Potential dependencies or interactions with code not visible in this chunk
- Issues that might only be apparent when combined with other chunks
- Flag any concerns that require reviewing the complete change for full context

${this.getAnalysisFramework()}

Please provide your analysis in the following JSON format:
${this.getOutputSchema()}

${this.getJsonFormatRequirements()}`;

        // Add web search context if enabled
        if (useWebSearch) {
            prompt += `\n\nNote: Use your knowledge of current security vulnerabilities and best practices. Reference authoritative sources like OWASP, NIST, framework documentation, and security advisories when applicable.`;
        }

        return prompt;
    }
}