import { simpleGit } from 'simple-git';

export class GitAnalyzer {
  constructor(repoPath = '.') {
    this.git = simpleGit(repoPath);
  }

  async getCommits(range = 'HEAD~1..HEAD') {
    try {
      const log = await this.git.log({
        from: range.split('..')[0],
        to: range.split('..')[1] || 'HEAD',
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
}
