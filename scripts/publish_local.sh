#!/bin/bash
VERSION=$(node -p "require('./package.json').version")
echo "Unpublishing version $VERSION..."
npm unpublish --registry http://localhost:4873/ polyapi@$VERSION --force
echo "Publishing version $VERSION..."
npm publish --registry http://localhost:4873/
