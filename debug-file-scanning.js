import { RepositoryReviewer } from './src/repository-reviewer.js';
import fs from 'fs';
import path from 'path';

const reviewer = new RepositoryReviewer({}, {});

// Create a minimal test directory structure
const testDir = './test-project';
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true });
}

fs.mkdirSync(testDir, { recursive: true });
fs.mkdirSync(`${testDir}/src`, { recursive: true });
fs.mkdirSync(`${testDir}/node_modules`, { recursive: true });

// Create test files
fs.writeFileSync(`${testDir}/index.js`, 'console.log("hello");');
fs.writeFileSync(`${testDir}/src/app.js`, 'const app = {};');
fs.writeFileSync(`${testDir}/src/utils.ts`, 'export const utils = {};');
fs.writeFileSync(`${testDir}/package.json`, '{"name": "test"}');
fs.writeFileSync(`${testDir}/node_modules/dep.js`, 'module.exports = {};');

console.log('Created test project structure:');
const listFiles = (dir, prefix = '') => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      console.log(`${prefix}📁 ${entry.name}/`);
      listFiles(fullPath, prefix + '  ');
    } else {
      console.log(`${prefix}📄 ${entry.name}`);
    }
  });
};
listFiles(testDir);

// Test the findCodeFiles method
const originalCwd = process.cwd();
process.chdir(testDir);

const patterns = reviewer.loadFilePatterns({});
console.log('\n--- Testing findCodeFiles ---');
console.log('Current directory:', process.cwd());

const files = await reviewer.findCodeFiles(patterns.includePatterns, patterns.excludePatterns, 50);
console.log('Found files:', files);

// Test the scanDirectory logic manually
console.log('\n--- Manual directory scan ---');
const manualScan = (dir, depth = 0) => {
  if (depth > 10) return [];
  const files = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    console.log(`Scanning ${dir}:`, entries.map(e => e.name));
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);
      console.log(`  Processing: ${relativePath}`);
      
      const excludes = reviewer.matchesPatterns(relativePath, patterns.excludePatterns);
      console.log(`    Excludes: ${excludes}`);
      
      if (excludes) continue;
      
      if (entry.isDirectory()) {
        files.push(...manualScan(fullPath, depth + 1));
      } else if (entry.isFile()) {
        const includes = reviewer.matchesPatterns(relativePath, patterns.includePatterns);
        console.log(`    Includes: ${includes}`);
        if (includes) {
          files.push(relativePath);
        }
      }
    }
  } catch (error) {
    console.log(`Error scanning ${dir}:`, error.message);
  }
  
  return files;
};

const manualFiles = manualScan(process.cwd());
console.log('Manual scan result:', manualFiles);

// Restore original directory
process.chdir(originalCwd);

// Clean up
fs.rmSync(testDir, { recursive: true });