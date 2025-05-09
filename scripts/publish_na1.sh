#!/bin/bash
VERSION=$(node -p "require('./package.json').version")
echo "Publishing version $VERSION as na1..."
npm publish --tag na1
echo "Setting latest tag to $VERSION..."
npm dist-tag add polyapi@$VERSION latest
