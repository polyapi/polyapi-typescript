import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { readPackageVersion } from './compile';
import { isPolyApiSpecifier, isReactFamilySpecifier } from './types';

export const extraVendorSpecifiers = (specifiers: string[]): string[] =>
  specifiers.filter(
    (spec) => !isReactFamilySpecifier(spec) && !isPolyApiSpecifier(spec),
  );

export const readDeclaredDependencyVersions = (
  projectDir: string,
): Record<string, string> => {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  try {
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return {
      ...(json.dependencies || {}),
      ...(json.devDependencies || {}),
      ...(json.peerDependencies || {}),
    };
  } catch {
    return {};
  }
};

const normalizeVersion = (version?: string) => {
  if (!version) return undefined;
  return semver.valid(version) ?? semver.coerce(version)?.version;
};

const sameVersion = (left?: string, right?: string) => {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  if (a && b) return a === b;
  if (!left || !right) return false;
  return left === right;
};

const describeProjectVersion = (resolved?: string, declared?: string) => {
  if (resolved && declared) {
    return `resolves ${resolved} (package.json ${declared})`;
  }
  if (resolved) return `resolves ${resolved}`;
  if (declared) return `declares ${declared} in package.json`;
  return 'does not declare or resolve it';
};

const reactFamilyCompareKeys = (packages: Record<string, string>) => {
  const checks: Array<{ label: string; instance: string; pkg: string }> = [];
  if (packages.react) {
    checks.push({
      label: 'react',
      instance: packages.react,
      pkg: 'react',
    });
  }
  if (packages['react-dom']) {
    checks.push({
      label: 'react-dom',
      instance: packages['react-dom'],
      pkg: 'react-dom',
    });
  }
  const jsxKey = ['react/jsx-runtime', 'jsx-runtime'].find(
    (key) => packages[key],
  );
  if (jsxKey) {
    checks.push({
      label: jsxKey,
      instance: packages[jsxKey],
      pkg: 'react',
    });
  }
  return checks;
};

export const reactFamilyMismatchWarnings = (
  instancePackages: Record<string, string>,
  npmResolveDir: string,
): string[] => {
  const declared = readDeclaredDependencyVersions(npmResolveDir);
  const warnings: string[] = [];

  for (const check of reactFamilyCompareKeys(instancePackages)) {
    let resolved: string | undefined;
    try {
      resolved = readPackageVersion(check.pkg, npmResolveDir);
    } catch {
      resolved = undefined;
    }
    const declaredVersion = declared[check.pkg];
    const projectVersion = resolved || declaredVersion;
    if (sameVersion(check.instance, projectVersion)) continue;
    warnings.push(
      `Instance polyVendor ${check.label} is ${
        check.instance
      } but this project ${describeProjectVersion(resolved, declaredVersion)}.`,
    );
  }

  return warnings;
};
