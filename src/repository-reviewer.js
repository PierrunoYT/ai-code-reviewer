import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';
import { MarkdownGenerator } from './markdown-generator.js';

export class RepositoryReviewer {
  constructor(config, aiReviewer) {
    this.config = config;
    this.aiReviewer = aiReviewer;
    this.markdownGenerator = new MarkdownGenerator(config);
  }

  loadFilePatterns(options) {
    // Check for command-line overrides first
    if (options.include || options.exclude) {
      return {
        includePatterns: options.include ? this.smartSplitPatterns(options.include) : this.getDefaultIncludePatterns(),
        excludePatterns: options.exclude ? this.smartSplitPatterns(options.exclude) : this.getDefaultExcludePatterns()
      };
    }

    // Try to load from config file
    const configPaths = [
      path.join(process.cwd(), 'file-patterns.json'),
      path.join(process.cwd(), '.file-patterns.json'),
      path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'file-patterns.json')
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          console.log(chalk.gray(`📋 Loaded file patterns from: ${path.relative(process.cwd(), configPath)}`));
          return {
            includePatterns: config.include || this.getDefaultIncludePatterns(),
            excludePatterns: config.exclude || this.getDefaultExcludePatterns()
          };
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to load config from ${configPath}: ${error.message}`));
      }
    }

    // Fallback to defaults
    console.log(chalk.gray('📋 Using default file patterns'));
    return {
      includePatterns: this.getDefaultIncludePatterns(),
      excludePatterns: this.getDefaultExcludePatterns()
    };
  }

  smartSplitPatterns(patternsString) {
    // Split patterns while respecting braces
    const patterns = [];
    let current = '';
    let braceDepth = 0;
    
    for (let i = 0; i < patternsString.length; i++) {
      const char = patternsString[i];
      
      if (char === '{') {
        braceDepth++;
        current += char;
      } else if (char === '}') {
        braceDepth--;
        current += char;
      } else if (char === ',' && braceDepth === 0) {
        // Only split on commas outside of braces
        if (current.trim()) {
          patterns.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last pattern
    if (current.trim()) {
      patterns.push(current.trim());
    }
    
    return patterns;
  }

  getDefaultIncludePatterns() {
    return [
      '**/*.{js,ts,jsx,tsx,vue,svelte}',
      '**/*.{py,pyw,pyi}',
      '**/*.{java,kt,scala}',
      '**/*.{cpp,c,cc,cxx,h,hpp,hxx}',
      '**/*.{cs,fs,vb}',
      '**/*.{go,rs,swift,rb,php}',
      '**/*.{html,htm,css,scss,sass,less}',
      '**/*.{xml,json,yaml,yml,toml}',
      '**/*.{sql,sh,bash,ps1,cmd,bat}',
      '**/*.{dart,r,m,mm,pl,lua}',
      '**/*.{dockerfile,Dockerfile}',
      '**/Makefile',
      '**/makefile',
      '**/*.{md,rst,txt}'
    ];
  }

  getDefaultExcludePatterns() {
    return [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '*.test.*',
      '*.spec.*',
      'coverage/**',
      '*.log',
      '*.min.js',
      '*.min.css',
      '.env',
      '.env.*',
      'package-lock.json',
      'yarn.lock'
    ];
  }

  async reviewRepository(options = {}) {
    try {
      console.log(chalk.blue('🔍 Scanning repository for code files...'));

      const { includePatterns, excludePatterns } = this.loadFilePatterns(options);
      const maxFiles = parseInt(options.maxFiles || '50');

      const files = await this.findCodeFiles(includePatterns, excludePatterns, maxFiles);
      
      if (files.length === 0) {
        console.log(chalk.yellow('No code files found to review.'));
        console.log(chalk.gray('Include patterns:'));
        includePatterns.slice(0, 3).forEach(pattern => {
          console.log(chalk.gray(`  - ${pattern}`));
        });
        console.log(chalk.gray('Exclude patterns:'));
        excludePatterns.slice(0, 3).forEach(pattern => {
          console.log(chalk.gray(`  - ${pattern}`));
        });
        return;
      }

      console.log(chalk.blue(`Found ${files.length} file(s) to review`));
      
      // Display list of files found for review
      console.log(chalk.cyan('\n📁 Files found for review:'));
      files.forEach((file, index) => {
        console.log(chalk.gray(`  ${index + 1}. ${file}`));
      });
      console.log(''); // Add spacing

      // Ask for user confirmation
      const shouldContinue = await this.askForConfirmation(files.length);
      if (!shouldContinue) {
        console.log(chalk.yellow('Review cancelled by user.'));
        return;
      }

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
        
        review.filesReviewed = group;
        review.groupIndex = groupIndex + 1;
        review.totalGroups = fileGroups.length;

        this.displayRepositoryReview(review, group);
        
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
    let totalFilesChecked = 0;
    let totalDirsChecked = 0;

    const scanDirectory = (dir, depth = 0) => {
      if (depth > 10 || files.length >= maxFiles) return;
      if (processedDirs.has(dir)) return;
      processedDirs.add(dir);
      totalDirsChecked++;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (files.length >= maxFiles) break;
          
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(process.cwd(), fullPath);

          if (this.matchesPatterns(relativePath, excludePatterns)) {
            continue;
          }

          if (entry.isDirectory()) {
            scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            totalFilesChecked++;
            if (this.matchesPatterns(relativePath, includePatterns)) {
              const stats = fs.statSync(fullPath);
              if (stats.size < 1024 * 1024) { // Skip files larger than 1MB
                files.push(relativePath);
              }
            }
          }
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Skipping directory: ${dir} (${error.message})`));
      }
    };

    scanDirectory(process.cwd());
    
    if (files.length === 0) {
      console.log(chalk.yellow(`🔍 Debug info: Checked ${totalFilesChecked} files in ${totalDirsChecked} directories`));
      console.log(chalk.gray(`Working directory: ${process.cwd()}`));
      
      // Show a few sample files that were found but didn't match
      const sampleFiles = [];
      const quickScan = (dir, depth = 0) => {
        if (depth > 2 || sampleFiles.length >= 5) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 10);
          for (const entry of entries) {
            if (sampleFiles.length >= 5) break;
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(process.cwd(), fullPath);
            if (entry.isFile()) {
              sampleFiles.push(relativePath);
            } else if (entry.isDirectory() && !this.matchesPatterns(relativePath, excludePatterns)) {
              quickScan(fullPath, depth + 1);
            }
          }
        } catch (error) {}
      };
      quickScan(process.cwd());
      
      if (sampleFiles.length > 0) {
        console.log(chalk.gray('Sample files found:'), sampleFiles);
        console.log(chalk.gray('Testing first sample against include patterns:'));
        const testFile = sampleFiles[0];
        includePatterns.slice(0, 3).forEach(pattern => {
          const matches = this.isGlobMatch(testFile, pattern);
          console.log(chalk.gray(`  "${testFile}" vs "${pattern}" = ${matches}`));
        });
      }
    }
    
    return files.slice(0, maxFiles);
  }

  matchesPatterns(filePath, patterns) {
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    return patterns.some(pattern => {
      return this.isGlobMatch(normalizedFilePath, pattern);
    });
  }

  isGlobMatch(filePath, pattern) {
    // Simple glob matching without complex regex
    const patternParts = pattern.split('/');
    const pathParts = filePath.split('/');
    
    return this.matchGlobParts(pathParts, 0, patternParts, 0);
  }

  matchGlobParts(pathParts, pathIndex, patternParts, patternIndex) {
    // Base cases
    if (patternIndex === patternParts.length) {
      return pathIndex === pathParts.length;
    }
    
    if (pathIndex === pathParts.length) {
      // Check if remaining pattern parts are all ** (globstar)
      for (let i = patternIndex; i < patternParts.length; i++) {
        if (patternParts[i] !== '**') return false;
      }
      return true;
    }

    const patternPart = patternParts[patternIndex];
    
    // Handle globstar (**)
    if (patternPart === '**') {
      // Try matching 0 or more path segments
      for (let i = pathIndex; i <= pathParts.length; i++) {
        if (this.matchGlobParts(pathParts, i, patternParts, patternIndex + 1)) {
          return true;
        }
      }
      return false;
    }
    
    // Handle current path segment
    if (this.matchSegment(pathParts[pathIndex], patternPart)) {
      return this.matchGlobParts(pathParts, pathIndex + 1, patternParts, patternIndex + 1);
    }
    
    return false;
  }

  matchSegment(pathSegment, patternSegment) {
    // Handle brace expansion {js,ts,jsx}
    if (patternSegment.includes('{') && patternSegment.includes('}')) {
      const braceStart = patternSegment.indexOf('{');
      const braceEnd = patternSegment.indexOf('}');
      const prefix = patternSegment.substring(0, braceStart);
      const suffix = patternSegment.substring(braceEnd + 1);
      const options = patternSegment.substring(braceStart + 1, braceEnd).split(',');
      
      return options.some(option => {
        const expandedPattern = prefix + option.trim() + suffix;
        return this.matchSegment(pathSegment, expandedPattern);
      });
    }
    
    // Handle wildcards
    if (patternSegment === '*') {
      return true;
    }
    
    // Handle patterns with wildcards
    if (patternSegment.includes('*')) {
      const parts = patternSegment.split('*');
      let pathIndex = 0;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (part === '') {
          // Empty part means consecutive asterisks or asterisk at start/end
          continue;
        }
        
        const foundIndex = pathSegment.indexOf(part, pathIndex);
        if (foundIndex === -1) return false;
        
        // For first non-empty part, it must start at the beginning if pattern starts with non-wildcard
        if (i === 0 && patternSegment[0] !== '*' && foundIndex !== 0) {
          return false;
        }
        
        pathIndex = foundIndex + part.length;
      }
      
      // Check if pattern ends with non-wildcard - last part must be at the end
      const lastPart = parts[parts.length - 1];
      if (lastPart !== '' && patternSegment[patternSegment.length - 1] !== '*') {
        return pathSegment.endsWith(lastPart);
      }
      
      return true;
    }
    
    // Exact match
    return pathSegment === patternSegment;
  }

  groupFilesForReview(files) {
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

  async askForConfirmation(fileCount) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.yellow(`\n❓ Do you want to proceed with reviewing ${fileCount} file(s)? (y/N): `), (answer) => {
        rl.close();
        const shouldContinue = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
        resolve(shouldContinue);
      });
    });
  }

  async saveRepositoryReviewToMarkdown(review, files, combinedContent) {
    try {
      const markdownContent = this.markdownGenerator.generateRepositoryMarkdownContent(review, files, combinedContent);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${timestamp}-repository-review-group-${review.groupIndex || 1}.md`;
      const outputDir = this.config.markdownOutputDir || './code-reviews';
      
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
}