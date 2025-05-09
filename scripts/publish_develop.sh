#!/bin/bash
VERSION=$(node -p "require('./package.json').version")
echo "Publishing version $VERSION..."
npm publish --tag develop
