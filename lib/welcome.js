#!/usr/bin/env node
const { execSync } = require('child_process');
const chalk = require('chalk');

try {
  // Get the version from the CLI
  const version = execSync('node build/cli.js --version', { encoding: 'utf-8' }).trim();
  
  console.log('');
  console.log(chalk.green('✓ PolyAPI SDK installed successfully!'));
  console.log(chalk.blue(`📦 Version: ${version}`));
  console.log('');
  console.log(chalk.yellow('Getting started:'));
  console.log('  • Run ' + chalk.cyan('npx poly --help') + ' to see all available commands');
  console.log('  • Run ' + chalk.cyan('npx poly setup') + ' to configure your Poly connection');
  console.log('');
} catch (error) {
  // Silently fail if there's an issue - don't break the installation
  console.log(chalk.green('✓ PolyAPI SDK installed successfully!'));
} 