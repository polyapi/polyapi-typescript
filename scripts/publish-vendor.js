#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const vendorPath = path.join(__dirname, '..', 'build', 'commands', 'vendor.js');
if (!fs.existsSync(vendorPath)) {
  console.error('Build this repo first: npm run build');
  process.exit(1);
}

const { buildInstanceVendor } = require(vendorPath);

const manualRoot = path.join(__dirname, '..', 'manual');
const reactPackage = path.join(manualRoot, 'node_modules', 'react', 'package.json');
if (!fs.existsSync(reactPackage)) {
  console.error('Install the manual app first: npm install --prefix manual');
  process.exit(1);
}

buildInstanceVendor({
  npmResolveDir: manualRoot,
  outFile: path.join(manualRoot, 'poly-vendor.js'),
}).catch(() => {
  process.exit(1);
});
