import { ComponentKind } from '../types';

export type { ComponentKind };

export type CompileResult = {
  sourceCode: string;
  code: string;
  imports: string[];
  npmSpecifiers: string[];
};

export const toPolyPath = (context: string, name: string) =>
  context ? `${context}.${name}` : name;

export const packageRoot = (specifier: string): string => {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    if (!name) return specifier;
    return `${scope}/${name}`;
  }
  return specifier.split('/')[0];
};

export const isReactFamilyPackage = (pkg: string) =>
  pkg === 'react' || pkg === 'react-dom';

export const isReactFamilySpecifier = (specifier: string) =>
  isReactFamilyPackage(packageRoot(specifier));

export const POLY_INSTANCE_VENDOR = 'poly:vendor';

export const isRelativeSpecifier = (specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../');

export const isPolySpecifier = (specifier: string) =>
  specifier.startsWith('poly:');

export const isPolyApiSpecifier = (specifier: string) =>
  packageRoot(specifier) === 'polyapi';

export const isBareNpmSpecifier = (specifier: string) => {
  if (!specifier) return false;
  if (isPolySpecifier(specifier)) return false;
  if (isRelativeSpecifier(specifier)) return false;
  if (specifier.startsWith('/')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(specifier)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) return false;
  return true;
};
