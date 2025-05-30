import { simpleGit } from 'simple-git';

export class GitAnalyzer {
  constructor(repoPath = '.') {
    // Validate repo path to prevent path traversal
    this.validateRepoPath(repoPath);
    this.git = simpleGit(repoPath);
  }

  validateRepoPath(repoPath) {
    if (!repoPath || typeof repoPath !== 'string') {
      throw new Error('Invalid repository path');
    }
    
    // Prevent path traversal attacks
    const normalizedPath = repoPath.replace(/\\/g, '/');
    if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
      throw new Error('Path traversal attempts are not allowed');
    }
    
    // Only allow relative paths or current directory
    if (repoPath !== '.' && !repoPath.match(/^[a-zA-Z0-9_\-\/\.]+$/)) {
      throw new Error('Invalid characters in repository path');
    }
  }

  async getCommits(range = 'HEAD~1..HEAD') {
    try {
      // Validate commit range to prevent injection
      this.validateCommitRange(range);
      
      const rangeParts = range.split('..');
      const log = await this.git.log({
        from: rangeParts[0],
        to: rangeParts[1] || 'HEAD',
        format: {
          hash: '%H',
          date: '%ai',
          message: '%s',
          author: '%an <%ae>',
          body: '%b'
        }
      });

      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author,
        date: commit.date,
        body: commit.body
      }));
    } catch (error) {
      throw new Error(`Failed to get commits: ${error.message}`);
    }
  }

  async getCommitDiff(commitHash) {
    try {
      // Validate commit hash
      this.validateCommitHash(commitHash);
      
      const diff = await this.git.show([
        commitHash,
        '--pretty=format:',
        '--name-status'
      ]);

      const fullDiff = await this.git.show([
        commitHash,
        '--pretty=format:',
        '--unified=3'
      ]);

      return fullDiff;
    } catch (error) {
      throw new Error(`Failed to get diff for commit ${commitHash}: ${error.message}`);
    }
  }

  async getChangedFiles(commitHash) {
    try {
      // Validate commit hash
      this.validateCommitHash(commitHash);
      
      const result = await this.git.show([
        '--name-only',
        '--pretty=format:',
        commitHash
      ]);

      return result.trim().split('\n').filter(file => file.length > 0);
    } catch (error) {
      throw new Error(`Failed to get changed files: ${error.message}`);
    }
  }

  async getStagedChanges() {
    try {
      const diff = await this.git.diff(['--cached']);
      return diff;
    } catch (error) {
      throw new Error(`Failed to get staged changes: ${error.message}`);
    }
  }

  async getCurrentBranch() {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (error) {
      throw new Error(`Failed to get current branch: ${error.message}`);
    }
  }

  async isWorkingDirectoryClean() {
    try {
      const status = await this.git.status();
      return status.files.length === 0;
    } catch (error) {
      throw new Error(`Failed to check working directory status: ${error.message}`);
    }
  }

  async getFileContent(filePath, commitHash = 'HEAD') {
    try {
      // Validate inputs
      this.validateFilePath(filePath);
      this.validateCommitHash(commitHash);
      
      return await this.git.show([`${commitHash}:${filePath}`]);
    } catch (error) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  async getAllCommits(options = {}) {
    try {
      const logOptions = {
        format: {
          hash: '%H',
          date: '%ai',
          message: '%s',
          author: '%an <%ae>',
          body: '%b'
        }
      };

      // Add branch/ref specification
      if (options.branch && options.branch !== 'HEAD') {
        logOptions.from = options.branch;
      }

      // Add date filters
      if (options.since) {
        logOptions['--since'] = options.since;
      }
      if (options.until) {
        logOptions['--until'] = options.until;
      }

      // Add author filter
      if (options.author) {
        logOptions.author = options.author;
      }

      // Set maximum number of commits
      const maxCommits = parseInt(options.maxCommits || '100');
      logOptions.maxCount = maxCommits;

      const log = await this.git.log(logOptions);

      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author,
        date: commit.date,
        body: commit.body
      }));
    } catch (error) {
      throw new Error(`Failed to get all commits: ${error.message}`);
    }
  }

  async getCommitStats() {
    try {
      const log = await this.git.log({
        format: {
          hash: '%H',
          date: '%ai',
          author: '%an'
        }
      });

      const stats = {
        totalCommits: log.all.length,
        authors: [...new Set(log.all.map(c => c.author))],
        dateRange: {
          oldest: log.all.length > 0 ? log.all[log.all.length - 1].date : null,
          newest: log.all.length > 0 ? log.all[0].date : null
        }
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get commit stats: ${error.message}`);
    }
  }

  validateCommitHash(hash) {
    if (!hash || typeof hash !== 'string') {
      throw new Error('Invalid commit hash');
    }
    
    // Allow HEAD, branch names, and SHA hashes
    if (hash === 'HEAD' || hash.match(/^[a-zA-Z0-9_\-\/]+$/) || hash.match(/^[a-f0-9]{7,40}$/)) {
      return;
    }
    
    throw new Error('Invalid commit hash format');
  }

  validateCommitRange(range) {
    if (!range || typeof range !== 'string') {
      throw new Error('Invalid commit range');
    }
    
    // Allow standard git range formats
    if (!range.match(/^[a-zA-Z0-9_\-\/\.~\^]+(\.\.[a-zA-Z0-9_\-\/\.~\^]+)?$/)) {
      throw new Error('Invalid commit range format');
    }
  }

  validateFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    
    // Prevent path traversal
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
      throw new Error('Path traversal attempts are not allowed');
    }
    
    // Allow reasonable file paths
    if (!filePath.match(/^[a-zA-Z0-9_\-\/\.]+$/)) {
      throw new Error('Invalid characters in file path');
    }
  }
}
