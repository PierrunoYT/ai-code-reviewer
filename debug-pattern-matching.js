import { RepositoryReviewer } from './src/repository-reviewer.js';
import fs from 'fs';
import path from 'path';

const reviewer = new RepositoryReviewer({}, {});

// Test the pattern matching logic with some sample files
const testFiles = [
  'index.js',
  'src/bot.js', 
  'src/commands/help.js',
  'node_modules/discord.js/index.js',
  'dist/bundle.js',
  'package.json',
  'README.md',
  'test.spec.js'
];

const patterns = reviewer.loadFilePatterns({});
console.log('Include patterns:', patterns.includePatterns);
console.log('Exclude patterns:', patterns.excludePatterns);

console.log('\n--- Testing Include Patterns ---');
testFiles.forEach(file => {
  const matches = reviewer.matchesPatterns(file, patterns.includePatterns);
  console.log(`${matches ? '✅' : '❌'} ${file} - includes: ${matches}`);
});

console.log('\n--- Testing Exclude Patterns ---');
testFiles.forEach(file => {
  const matches = reviewer.matchesPatterns(file, patterns.excludePatterns);
  console.log(`${matches ? '🚫' : '✅'} ${file} - excludes: ${matches}`);
});

console.log('\n--- Final Result (Include && !Exclude) ---');
testFiles.forEach(file => {
  const includes = reviewer.matchesPatterns(file, patterns.includePatterns);
  const excludes = reviewer.matchesPatterns(file, patterns.excludePatterns);
  const result = includes && !excludes;
  console.log(`${result ? '✅' : '❌'} ${file} - final: ${result} (includes: ${includes}, excludes: ${excludes})`);
});

// Test specific patterns that might be problematic
console.log('\n--- Testing Specific Patterns ---');
const specificTests = [
  { file: 'index.js', pattern: '**/*.js' },
  { file: 'src/bot.js', pattern: '**/*.js' },
  { file: 'index.js', pattern: '**/*.{js,ts,jsx,tsx,vue,svelte}' },
  { file: 'node_modules/test.js', pattern: 'node_modules/**' },
];

specificTests.forEach(test => {
  const result = reviewer.isGlobMatch(test.file, test.pattern);
  console.log(`${result ? '✅' : '❌'} ${test.file} vs ${test.pattern} = ${result}`);
});