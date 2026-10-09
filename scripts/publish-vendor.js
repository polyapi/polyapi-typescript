#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const vendorPath = path.join(__dirname, '..', 'build', 'commands', 'vendor.js');
if (!fs.existsSync(vendorPath)) {
  console.error('Build this repo first: npm run build');
  process.exit(1);
}

const { publishInstanceVendor } = require(vendorPath);
const { DEFAULT_POLY_PATH } = require('../build/constants');
const { loadConfig } = require('../build/config');

loadConfig(DEFAULT_POLY_PATH);
if (!process.env.POLY_API_KEY) {
  console.error('Poly is not configured. Please run `poly setup` to configure it.');
  process.exit(1);
}

publishInstanceVendor(DEFAULT_POLY_PATH).catch(() => {
  process.exit(1);
});
