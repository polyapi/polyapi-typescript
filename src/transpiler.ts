import fs from 'fs';
import chalk from 'chalk';
import shell from 'shelljs';
import ts from 'typescript';
import path from 'path';
import { builtinModules } from 'node:module';
import { createGenerator } from 'ts-json-schema-generator';
import {
  DeployableRecord,
  DeployableTsTypeToName,
  DeployableTypeEntries,
  DeployableTypes,
  Deployment,
  getDeployableFileRevision,
  ParsedDeployableConfig,
} from './deployables';
import {
  getCachedSpecs,
  getPolyLibPath,
  writeCachedSpecs,
  toPascalCase,
} from './utils';
import { DEFAULT_POLY_PATH } from './constants';
import { Specification } from './types';
import { getSpecs } from './api';

// Packages the Poly function runtime already provides.
const EXCLUDED_REQUIREMENTS = ['polyapi'];

const builtinModuleNames = new Set(builtinModules);

/** Node built-ins, including `node:` prefixes and subpaths such as `fs/promises`. */
const isNodeBuiltin = (moduleName: string): boolean => {
  const bare = moduleName.startsWith('node:')
    ? moduleName.slice(5)
    : moduleName;
  if (builtinModuleNames.has(bare) || builtinModuleNames.has(moduleName)) {
    return true;
  }
  const slash = bare.indexOf('/');
  if (slash > 0 && builtinModuleNames.has(bare.slice(0, slash))) return true;
  return false;
};

export const getTSConfig = () => {
  const tsConfig = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
  if (tsConfig) {
    return ts.readConfigFile(tsConfig, ts.sys.readFile).config;
  }
  return {};
};

export const getTSBaseUrl = (config = getTSConfig()) =>
  config.compilerOptions?.baseUrl || undefined;

const loadTsSourceFile = (filePath: string): ts.SourceFile => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return sourceFile;
};

let fetchedSpecs = false;

type InternalDependencyReference = {
  /** Absent when the path is a segment wildcard such as `foo.*.config`. */
  id?: string;
  path: string;
  tenantName?: string;
  environmentName?: string;
};

export type PolySchemaReference = { 'x-poly-ref': { path: string } };

type PolyKind = 'poly' | 'vari' | 'tabi' | 'que' | 'loxi' | 'schemas' | 'ns';

type PolyBinding = {
  kind: PolyKind;
  /** Original export name for renamed namespace imports (`import { OOB as Box }`). */
  canonical?: string;
};

type CanonicalPath = {
  kind: PolyKind;
  path: string;
};

type TrackedReference = {
  kind: 'poly' | 'ns' | 'tabi' | 'que' | 'loxi' | 'vari' | 'schema';
  path: string;
  /** Set for vari references so a context-level `.get()` can fall back to a context. */
  method?: string;
};

const VARI_METHODS = new Set(['get', 'update', 'onUpdate', 'inject']);
const TABI_METHODS = new Set([
  'count',
  'selectMany',
  'selectOne',
  'insertMany',
  'insertOne',
  'upsertMany',
  'upsertOne',
  'updateMany',
  'updateOne',
  'deleteMany',
  'deleteOne',
]);
const LOXI_METHODS = new Set([
  'acquire',
  'isLocked',
  'getLockStatus',
  'renew',
  'release',
  'withLock',
]);
const QUE_METHODS = new Set([
  'publish',
  'list',
  'get',
  'delete',
  'deleteAll',
  'skip',
  'retry',
  'subscribe',
  'status',
]);

const POLY_VALUE_ROOTS = new Set(['vari', 'tabi', 'loxi', 'que', 'schemas']);

const dedupeContexts = (contexts: string[]): string[] => {
  if (contexts.includes('*')) return ['*'];
  const sorted = [...new Set(contexts)].sort();
  const kept: string[] = [];
  for (const context of sorted) {
    if (
      kept.some(
        (shorter) => context === shorter || context.startsWith(`${shorter}.`),
      )
    ) {
      continue;
    }
    kept.push(context);
  }
  return kept;
};

const loadDependencyCompilerOptions = (
  fileName: string,
  baseUrl: string | undefined,
): ts.CompilerOptions => {
  const fallback: ts.CompilerOptions = {
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    noImplicitUseStrict: true,
    baseUrl,
  };
  const configPath = ts.findConfigFile(
    path.dirname(path.resolve(fileName)),
    ts.sys.fileExists,
    'tsconfig.json',
  );
  if (!configPath) return fallback;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return fallback;
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
  );
  return {
    ...parsed.options,
    noImplicitUseStrict: true,
    ...(baseUrl ? { baseUrl } : {}),
  };
};

export const getDependencies = async (
  code: string,
  fileName: string,
  baseUrl: string | undefined,
  ignoreDependencies: boolean,
): Promise<
  [
    external: undefined | Record<string, string>,
    internal:
      undefined | Record<string, InternalDependencyReference[] | string[]>,
    schemaRefs: Record<string, PolySchemaReference>,
  ]
> => {
  const importedLibraries = new Set<string>();
  const importBindings = new Map<string, PolyBinding>();
  // Local names that refer to the poly `schemas` namespace (`schemas`, or an alias).
  const schemaPrefixes = new Set<string>(['schemas']);
  // Assignment aliases, stored already resolved (`const foo = vari.foo`).
  const aliasMap = new Map<string, CanonicalPath>();
  // Type aliases that are exactly one poly schema (`type Input = schemas.Foo.Bar`).
  const schemaAliases = new Map<string, string>();
  // Written type text → schema path after the schemas prefix, before spec matching.
  const writtenToSource = new Map<string, string>();
  const trackedKeys = new Set<string>();
  const tracked: TrackedReference[] = [];
  const pendingTypeAliases: Array<{ name: string; type: ts.TypeNode }> = [];
  let internalContexts: string[] = [];

  const compilerOptions = loadDependencyCompilerOptions(fileName, baseUrl);

  const unwrapExpression = (expr: ts.Expression): ts.Expression => {
    let current = expr;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  };

  const getPropertyPath = (expr: ts.Expression): string => {
    const parts: string[] = [];
    let current = unwrapExpression(expr);

    while (true) {
      current = unwrapExpression(current);
      if (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text);
        current = current.expression;
        continue;
      }
      if (ts.isElementAccessExpression(current)) {
        let arg = current.argumentExpression;
        if (arg) arg = unwrapExpression(arg);
        if (
          arg &&
          (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
        ) {
          parts.unshift(arg.text);
        } else if (arg && ts.isNumericLiteral(arg)) {
          parts.unshift(arg.text);
        } else {
          // Dynamic segment: vari.foo[clientId] → "vari.foo.*"
          parts.unshift('*');
        }
        current = current.expression;
        continue;
      }
      if (ts.isIdentifier(current)) {
        parts.unshift(current.text);
      }
      break;
    }

    return parts.join('.');
  };

  const flattenTypeName = (name: ts.EntityName): string => {
    const parts: string[] = [];
    const recurse = (n: ts.EntityName): void => {
      if (ts.isQualifiedName(n)) {
        recurse(n.left);
        parts.push(n.right.text);
      } else {
        parts.push(n.text);
      }
    };
    recurse(name);
    return parts.join('.');
  };

  const addContext = (context: string) => {
    if (internalContexts.includes('*')) return;
    if (!context || context === '*') {
      internalContexts = ['*'];
      return;
    }
    internalContexts.push(context);
  };

  const extendCanonical = (
    base: CanonicalPath,
    parts: string[],
  ): CanonicalPath => {
    let kind = base.kind;
    const pathParts = base.path ? base.path.split('.') : [];
    for (const part of parts) {
      // poly.vari / poly.tabi / poly.schemas are the named roots, not function paths.
      if (
        kind === 'poly' &&
        pathParts.length === 0 &&
        POLY_VALUE_ROOTS.has(part)
      ) {
        kind = part as PolyKind;
        continue;
      }
      pathParts.push(part);
    }
    return { kind, path: pathParts.join('.') };
  };

  const resolveToCanonical = (dotted: string): CanonicalPath | null => {
    if (!dotted) return null;
    const parts = dotted.split('.');
    const root = parts[0];
    let base: CanonicalPath | null = null;
    if (aliasMap.has(root)) {
      base = aliasMap.get(root)!;
    } else if (importBindings.has(root)) {
      const binding = importBindings.get(root)!;
      base = {
        kind: binding.kind,
        path:
          binding.kind === 'ns' && binding.canonical ? binding.canonical : '',
      };
    } else if (schemaPrefixes.has(root)) {
      base = { kind: 'schemas', path: '' };
    }
    if (!base) return null;
    return extendCanonical(base, parts.slice(1));
  };

  const bindingPropertyName = (element: ts.BindingElement): string | null => {
    if (!ts.isIdentifier(element.name)) return null;
    if (!element.propertyName) return element.name.text;
    if (ts.isIdentifier(element.propertyName)) return element.propertyName.text;
    if (
      ts.isStringLiteral(element.propertyName) ||
      ts.isNumericLiteral(element.propertyName) ||
      ts.isNoSubstitutionTemplateLiteral(element.propertyName)
    ) {
      return element.propertyName.text;
    }
    return null;
  };

  const registerNamedPolyImport = (imported: string, local: string) => {
    if (['vari', 'tabi', 'schemas', 'loxi', 'que'].includes(imported)) {
      importBindings.set(local, { kind: imported as PolyKind });
      if (imported === 'schemas') schemaPrefixes.add(local);
      return;
    }
    if (imported === 'polyCustom') return;
    importBindings.set(local, { kind: 'ns', canonical: imported });
  };

  const registerPolyClause = (clause: ts.ImportClause) => {
    if (clause.name) importBindings.set(clause.name.text, { kind: 'poly' });
    const bindings = clause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) {
      importBindings.set(bindings.name.text, { kind: 'poly' });
      return;
    }
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName
          ? element.propertyName.text
          : element.name.text;
        registerNamedPolyImport(imported, element.name.text);
      }
    }
  };

  const importHasRuntimeValue = (node: ts.ImportDeclaration): boolean => {
    if (!node.importClause) return true;
    if (node.importClause.isTypeOnly) return false;
    if (node.importClause.name) return true;
    const bindings = node.importClause.namedBindings;
    if (!bindings) return false;
    if (ts.isNamespaceImport(bindings)) return true;
    return bindings.elements.some((element) => !element.isTypeOnly);
  };

  const compilerHost = ts.createCompilerHost(compilerOptions);

  const considerModule = (moduleName: string, runtime: boolean) => {
    if (!runtime || !moduleName) return;
    const resolved = ts.resolveModuleName(
      moduleName,
      fileName,
      compilerOptions,
      compilerHost,
    );
    if (resolved.resolvedModule) {
      if (resolved.resolvedModule.isExternalLibraryImport) {
        importedLibraries.add(moduleName);
      }
      return;
    }
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
      importedLibraries.add(moduleName);
    }
  };

  const requireModuleName = (node: ts.CallExpression): string | null => {
    if (
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'require'
    ) {
      return null;
    }
    const arg = node.arguments[0];
    return arg && ts.isStringLiteral(arg) ? arg.text : null;
  };

  const importCallModuleName = (node: ts.CallExpression): string | null => {
    if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
    const arg = node.arguments[0];
    return arg && ts.isStringLiteral(arg) ? arg.text : null;
  };

  const noteWrittenSchema = (written: string, sourcePath: string) => {
    if (!written || !sourcePath) return;
    writtenToSource.set(written, sourcePath);
  };

  const sourcePathForTypeText = (written: string): string | null => {
    if (!written) return null;
    if (schemaAliases.has(written)) return schemaAliases.get(written)!;
    const dot = written.indexOf('.');
    const root = dot === -1 ? written : written.slice(0, dot);
    const rest = dot === -1 ? '' : written.slice(dot + 1);
    if (schemaPrefixes.has(root)) return rest || null;
    if (schemaAliases.has(root)) {
      const base = schemaAliases.get(root)!;
      return rest ? `${base}.${rest}` : base;
    }
    return null;
  };

  const flattenIndexedAccess = (typeNode: ts.TypeNode): string | null => {
    if (ts.isParenthesizedTypeNode(typeNode)) {
      return flattenIndexedAccess(typeNode.type);
    }
    if (ts.isTypeReferenceNode(typeNode)) {
      return flattenTypeName(typeNode.typeName);
    }
    if (!ts.isIndexedAccessTypeNode(typeNode)) return null;
    const base = flattenIndexedAccess(typeNode.objectType);
    if (!base) return null;
    if (!ts.isLiteralTypeNode(typeNode.indexType)) return null;
    const literal = typeNode.indexType.literal;
    if (
      ts.isStringLiteral(literal) ||
      ts.isNoSubstitutionTemplateLiteral(literal) ||
      ts.isNumericLiteral(literal)
    ) {
      return `${base}.${literal.text}`;
    }
    return null;
  };

  const noteSchemaTypeNode = (typeNode: ts.TypeNode) => {
    if (ts.isParenthesizedTypeNode(typeNode)) {
      noteSchemaTypeNode(typeNode.type);
      return;
    }
    if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
      for (const part of typeNode.types) noteSchemaTypeNode(part);
      return;
    }
    if (ts.isTypeReferenceNode(typeNode)) {
      const written = flattenTypeName(typeNode.typeName);
      const source = sourcePathForTypeText(written);
      if (source) noteWrittenSchema(written, source);
      if (typeNode.typeArguments) {
        for (const arg of typeNode.typeArguments) noteSchemaTypeNode(arg);
      }
      return;
    }
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      const flattened = flattenIndexedAccess(typeNode);
      const source = flattened ? sourcePathForTypeText(flattened) : null;
      if (flattened && source) {
        noteWrittenSchema(flattened, source);
        noteWrittenSchema(typeNode.getText(), source);
      }
      return;
    }
    if (ts.isImportTypeNode(typeNode) && nodeQualifierIsPolySchema(typeNode)) {
      const qualifier = flattenTypeName(typeNode.qualifier!);
      const source = qualifier.startsWith('schemas.')
        ? qualifier.slice('schemas.'.length)
        : '';
      if (source) {
        noteWrittenSchema(qualifier, source);
        noteWrittenSchema(typeNode.getText(), source);
      }
    }
  };

  const nodeQualifierIsPolySchema = (typeNode: ts.ImportTypeNode): boolean => {
    if (!typeNode.qualifier) return false;
    const arg = typeNode.argument;
    if (!ts.isLiteralTypeNode(arg) || !ts.isStringLiteral(arg.literal)) {
      return false;
    }
    if (arg.literal.text !== 'polyapi') return false;
    const qualifier = flattenTypeName(typeNode.qualifier);
    return qualifier === 'schemas' || qualifier.startsWith('schemas.');
  };

  const pureSchemaSource = (typeNode: ts.TypeNode): string | null => {
    if (ts.isParenthesizedTypeNode(typeNode))
      return pureSchemaSource(typeNode.type);
    if (ts.isTypeReferenceNode(typeNode)) {
      return sourcePathForTypeText(flattenTypeName(typeNode.typeName));
    }
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      const flattened = flattenIndexedAccess(typeNode);
      return flattened ? sourcePathForTypeText(flattened) : null;
    }
    if (ts.isImportTypeNode(typeNode) && nodeQualifierIsPolySchema(typeNode)) {
      const qualifier = flattenTypeName(typeNode.qualifier!);
      return qualifier.startsWith('schemas.')
        ? qualifier.slice('schemas.'.length)
        : null;
    }
    return null;
  };

  const recordRootOnUpdate = (callNode: ts.CallExpression) => {
    const arg = callNode.arguments[0];
    if (!arg) {
      addContext('*');
      return;
    }
    const expr = unwrapExpression(arg);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      addContext(expr.text || '*');
      return;
    }
    // The listener path is a runtime value, so every variable may be involved.
    addContext('*');
  };

  const recordUse = (
    canonical: CanonicalPath | null,
    callNode?: ts.CallExpression,
  ) => {
    if (!canonical || canonical.kind === 'schemas') return;

    if (canonical.kind === 'vari') {
      const parts = canonical.path ? canonical.path.split('.') : [];
      const last = parts[parts.length - 1];
      const method = VARI_METHODS.has(last) ? last : undefined;
      if (!method) return;
      const resource = parts.slice(0, -1).join('.');
      // vari.onUpdate(path) and vari.get() address a context, not one variable.
      if (!resource && (method === 'onUpdate' || method === 'get')) {
        if (method === 'onUpdate' && callNode) recordRootOnUpdate(callNode);
        else addContext('*');
        return;
      }
      const key = `vari:${resource}:${method}`;
      if (trackedKeys.has(key)) return;
      trackedKeys.add(key);
      tracked.push({ kind: 'vari', path: resource, method });
      return;
    }

    if (canonical.kind === 'tabi') {
      const parts = canonical.path ? canonical.path.split('.') : [];
      const last = parts[parts.length - 1];
      if (!TABI_METHODS.has(last)) return;
      const resource = parts.slice(0, -1).join('.');
      if (!resource) return;
      const key = `tabi:${resource}`;
      if (trackedKeys.has(key)) return;
      trackedKeys.add(key);
      tracked.push({ kind: 'tabi', path: resource });
      return;
    }

    if (canonical.kind === 'loxi') {
      const parts = canonical.path ? canonical.path.split('.') : [];
      const last = parts[parts.length - 1];
      if (!LOXI_METHODS.has(last)) return;
      const resource = parts.slice(0, -1).join('.');
      if (!resource) return;
      const key = `loxi:${resource}`;
      if (trackedKeys.has(key)) return;
      trackedKeys.add(key);
      tracked.push({ kind: 'loxi', path: resource });
      return;
    }

    if (canonical.kind === 'que') {
      const parts = canonical.path ? canonical.path.split('.') : [];
      const last = parts[parts.length - 1];
      if (!QUE_METHODS.has(last)) return;
      const resource = parts.slice(0, -1).join('.');
      if (!resource) return;
      const key = `que:${resource}`;
      if (trackedKeys.has(key)) return;
      trackedKeys.add(key);
      tracked.push({ kind: 'que', path: resource });
      return;
    }

    if (!canonical.path) return;
    const key = `${canonical.kind}:${canonical.path}`;
    if (trackedKeys.has(key)) return;
    trackedKeys.add(key);
    tracked.push({
      kind: canonical.kind === 'ns' ? 'ns' : 'poly',
      path: canonical.path,
    });
  };

  const isPathExpression = (expr: ts.Expression): boolean =>
    ts.isPropertyAccessExpression(expr) ||
    ts.isElementAccessExpression(expr) ||
    ts.isIdentifier(expr);
  ts.transpileModule(code, {
    compilerOptions,
    transformers: {
      before: [
        (context) => {
          return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node => {
              if (ts.isImportDeclaration(node)) {
                const moduleName = (node.moduleSpecifier as ts.StringLiteral)
                  .text;
                if (moduleName === 'polyapi' && node.importClause) {
                  registerPolyClause(node.importClause);
                }
                considerModule(moduleName, importHasRuntimeValue(node));
                return node;
              }

              if (
                ts.isImportEqualsDeclaration(node) &&
                ts.isExternalModuleReference(node.moduleReference)
              ) {
                const expr = node.moduleReference.expression;
                if (ts.isStringLiteral(expr)) {
                  if (expr.text === 'polyapi') {
                    importBindings.set(node.name.text, { kind: 'poly' });
                  }
                  considerModule(expr.text, true);
                }
                return node;
              }

              if (
                ts.isExportDeclaration(node) &&
                node.moduleSpecifier &&
                ts.isStringLiteral(node.moduleSpecifier)
              ) {
                considerModule(node.moduleSpecifier.text, !node.isTypeOnly);
                return node;
              }

              if (ts.isVariableDeclaration(node) && node.initializer) {
                const initializer = unwrapExpression(node.initializer);
                if (ts.isCallExpression(initializer)) {
                  const required =
                    requireModuleName(initializer) ||
                    importCallModuleName(initializer);
                  if (required && ts.isIdentifier(node.name)) {
                    if (required === 'polyapi') {
                      importBindings.set(node.name.text, { kind: 'poly' });
                    }
                    considerModule(required, true);
                    return node;
                  }
                }

                if (
                  ts.isIdentifier(node.name) &&
                  isPathExpression(initializer)
                ) {
                  const canonical = resolveToCanonical(
                    getPropertyPath(initializer),
                  );
                  if (canonical) {
                    aliasMap.set(node.name.text, canonical);
                    return node;
                  }
                } else if (ts.isObjectBindingPattern(node.name)) {
                  if (isPathExpression(initializer)) {
                    const base = resolveToCanonical(
                      getPropertyPath(initializer),
                    );
                    if (base) {
                      for (const element of node.name.elements) {
                        const propName = bindingPropertyName(element);
                        if (!propName || !ts.isIdentifier(element.name))
                          continue;
                        aliasMap.set(
                          element.name.text,
                          extendCanonical(base, [propName]),
                        );
                      }
                      return node;
                    }
                  }
                  // `const { id } = await poly.orders.create()` is not an alias.
                  // Fall through so the call itself is visited.
                }
              }

              if (
                ts.isTypeAliasDeclaration(node) &&
                ts.isIdentifier(node.name)
              ) {
                pendingTypeAliases.push({
                  name: node.name.text,
                  type: node.type,
                });
                const source = pureSchemaSource(node.type);
                if (source) {
                  schemaAliases.set(node.name.text, source);
                  noteWrittenSchema(node.name.text, source);
                }
              }

              if (
                ts.isTypeReferenceNode(node) ||
                ts.isIndexedAccessTypeNode(node) ||
                ts.isImportTypeNode(node) ||
                ts.isUnionTypeNode(node) ||
                ts.isIntersectionTypeNode(node)
              ) {
                noteSchemaTypeNode(node);
              }

              if (ts.isExpressionWithTypeArguments(node)) {
                const written = getPropertyPath(
                  unwrapExpression(node.expression),
                );
                const source = sourcePathForTypeText(written);
                if (source) {
                  noteWrittenSchema(written, source);
                  noteWrittenSchema(node.expression.getText(), source);
                }
              }

              if (ts.isCallExpression(node)) {
                const required = requireModuleName(node);
                const imported = importCallModuleName(node);
                if (required) considerModule(required, true);
                if (imported) considerModule(imported, true);

                const target = unwrapExpression(node.expression);
                if (ts.isIdentifier(target)) {
                  recordUse(aliasMap.get(target.text) ?? null, node);
                } else if (
                  ts.isPropertyAccessExpression(target) ||
                  ts.isElementAccessExpression(target)
                ) {
                  recordUse(resolveToCanonical(getPropertyPath(target)), node);
                }
              } else if (
                (ts.isPropertyAccessExpression(node) ||
                  ts.isElementAccessExpression(node)) &&
                !ts.isPropertyAccessExpression(node.parent) &&
                !ts.isElementAccessExpression(node.parent) &&
                !ts.isCallExpression(node.parent)
              ) {
                recordUse(resolveToCanonical(getPropertyPath(node)));
              }

              return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitEachChild(sourceFile, visitor, context);
          };
        },
      ],
    },
  });

  // Resolve `type B = Input` even when `Input`'s schema alias is declared later.
  let aliasProgress = true;
  while (aliasProgress) {
    aliasProgress = false;
    for (const alias of pendingTypeAliases) {
      if (schemaAliases.has(alias.name)) continue;
      const source = pureSchemaSource(alias.type);
      if (!source) continue;
      schemaAliases.set(alias.name, source);
      noteWrittenSchema(alias.name, source);
      aliasProgress = true;
    }
  }

  const dependencies = Array.from(importedLibraries).filter(
    (library) =>
      !EXCLUDED_REQUIREMENTS.includes(library) && !isNodeBuiltin(library),
  );
  const externalDependencies: Record<string, string> = {};
  const internalDependencies: Record<
    string,
    InternalDependencyReference[] | string[]
  > = {};
  const schemaRefs: Record<string, PolySchemaReference> = {};

  if (dependencies.length) {
    let packageJson: any = {};
    try {
      packageJson = fs.readFileSync(
        path.join(process.cwd(), 'package.json'),
        'utf-8',
      );
      packageJson = JSON.parse(packageJson);
    } catch (error) {
      shell.echo(
        chalk.yellow('\nWarning:'),
        'Failed to parse package.json file in order to read dependencies, there could be issues with some dependencies at the time of deploying the server function.',
      );
    }

    const packageJsonDependencies = packageJson.dependencies || {};
    const packageJsonDevDependencies = packageJson.devDependencies || {};

    for (const dependency of dependencies) {
      let dependencyName = dependency;
      let version =
        packageJsonDependencies[dependencyName] ||
        packageJsonDevDependencies[dependencyName];
      if (version) {
        externalDependencies[dependency] = version;
        continue;
      }

      const dependencyParts = dependency.split('/');

      while (dependencyParts.length > 0) {
        dependencyParts.pop();

        dependencyName = dependencyParts.join('/');
        version =
          packageJsonDependencies[dependencyName] ||
          packageJsonDevDependencies[dependencyName];

        if (version) {
          externalDependencies[dependencyName] = version;
          break;
        }
      }
      if (!dependencyName) {
        externalDependencies[dependency] = 'latest';
      }
    }
  }

  /** A `*` segment is one dynamic name, not a cut that drops the rest of the path. */
  const isSegmentWildcard = (resourcePath: string): boolean =>
    resourcePath.split('.').includes('*');

  /**
   * Function calls (`poly.orders[name]()`) have no single resource type.
   * Keep the static prefix as a context. Vari, tabi, lock, and queue wildcards
   * are stored as typed paths instead.
   */
  const untypedWildcardContext = (resourcePath: string): string => {
    const segments = resourcePath.split('.');
    const star = segments.indexOf('*');
    if (star === -1) return resourcePath;
    return segments.slice(0, star).join('.');
  };

  const dependencyTypeForKind = (
    kind: TrackedReference['kind'],
  ): string | null => {
    if (kind === 'vari') return 'serverVariable';
    if (kind === 'tabi') return 'table';
    if (kind === 'loxi') return 'lock';
    if (kind === 'que') return 'queue';
    return null;
  };

  const matchSpec = (
    specs: Specification[],
    kind: TrackedReference['kind'],
    resourcePath: string,
  ): Specification | undefined =>
    specs.find((spec) => {
      if (kind === 'vari') {
        return (
          spec.type === 'serverVariable' &&
          spec.contextName.toLowerCase() === resourcePath.toLowerCase()
        );
      }
      if (kind === 'tabi') {
        return (
          spec.type === 'table' &&
          spec.contextName.toLowerCase() === resourcePath.toLowerCase()
        );
      }
      if (kind === 'loxi') {
        return (
          spec.type === 'lock' &&
          spec.contextName.toLowerCase() === resourcePath.toLowerCase()
        );
      }
      if (kind === 'que') {
        return (
          spec.type === 'queue' &&
          spec.contextName.toLowerCase() === resourcePath.toLowerCase()
        );
      }
      if (kind === 'schema') {
        if (spec.type !== 'schema') return false;
        return (
          spec.contextName
            .split('.')
            .map((segment) => toPascalCase(segment))
            .join('.') === resourcePath
        );
      }
      if (['serverVariable', 'table', 'schema'].includes(spec.type))
        return false;
      return spec.contextName.toLowerCase() === resourcePath.toLowerCase();
    });

  const depKeys = new Set<string>();
  const addDep = (spec: Specification) => {
    let type: string = spec.type;
    const dep: InternalDependencyReference = {
      path: spec.contextName,
      id: spec.id,
    };
    if (
      spec.visibilityMetadata?.visibility === 'PUBLIC' &&
      ['apiFunction', 'customFunction', 'serverFunction'].includes(type)
    ) {
      type = `public${type.substring(0, 1).toUpperCase()}${type.substring(1)}`;
      dep.tenantName = spec.visibilityMetadata.foreignTenantName;
      dep.environmentName = spec.visibilityMetadata.foreignEnvironmentName;
    }
    const key = `${type}:${spec.id}`;
    if (depKeys.has(key)) return;
    depKeys.add(key);
    const bucket = (internalDependencies[type] ||
      []) as InternalDependencyReference[];
    bucket.push(dep);
    internalDependencies[type] = bucket;
  };

  const addWildcardDep = (type: string, resourcePath: string) => {
    const key = `${type}:*:${resourcePath}`;
    if (depKeys.has(key)) return;
    depKeys.add(key);
    const bucket = (internalDependencies[type] ||
      []) as InternalDependencyReference[];
    bucket.push({ path: resourcePath });
    internalDependencies[type] = bucket;
  };

  const schemaSources = () => new Set(writtenToSource.values());
  const isCoveredSchemaPrefix = (source: string): boolean => {
    for (const other of schemaSources()) {
      if (other !== source && other.startsWith(`${source}.`)) return true;
    }
    return false;
  };

  type PendingReference = TrackedReference;

  const resolveTracked = (
    specs: Specification[],
    refs: PendingReference[],
  ): { missing: string[]; pendingGets: PendingReference[] } => {
    const missing: string[] = [];
    const pendingGets: PendingReference[] = [];
    for (const ref of refs) {
      if (isSegmentWildcard(ref.path)) {
        // `vari.foo[clientId].config.inject()` → serverVariable `foo.*.config`.
        // `vari[clientId].inject()` → serverVariable `*`, one dynamic segment.
        const type = dependencyTypeForKind(ref.kind);
        if (type) {
          addWildcardDep(type, ref.path);
          continue;
        }
        addContext(untypedWildcardContext(ref.path));
        continue;
      }
      const spec = matchSpec(specs, ref.kind, ref.path);
      if (spec) {
        addDep(spec);
        continue;
      }
      if (ref.kind === 'vari' && ref.method === 'get') {
        pendingGets.push(ref);
        continue;
      }
      if (ref.kind === 'schema' && isCoveredSchemaPrefix(ref.path)) continue;
      missing.push(ref.path);
    }
    return { missing, pendingGets };
  };

  const hadInternalWork =
    tracked.length > 0 ||
    writtenToSource.size > 0 ||
    internalContexts.length > 0;

  if (hadInternalWork) {
    const libPath = getPolyLibPath(DEFAULT_POLY_PATH);
    let specs = getCachedSpecs(libPath);
    const schemaTracked: PendingReference[] = [];
    for (const source of schemaSources()) {
      schemaTracked.push({ kind: 'schema', path: source });
    }

    let { missing, pendingGets } = resolveTracked(specs, [
      ...tracked,
      ...schemaTracked,
    ]);

    if ((missing.length || pendingGets.length) && !fetchedSpecs) {
      specs = await getSpecs();
      writeCachedSpecs(libPath, specs);
      fetchedSpecs = true;
      const retry = resolveTracked(specs, [
        ...missing.map((path) => {
          const original = [...tracked, ...schemaTracked].find(
            (ref) => ref.path === path && !isSegmentWildcard(ref.path),
          );
          return original || { kind: 'poly' as const, path };
        }),
        ...pendingGets,
      ]);
      missing = retry.missing;
      pendingGets = retry.pendingGets;
    }

    // A vari `.get()` that names no variable is the context-level values fetch.
    for (const ref of pendingGets) {
      addContext(ref.path);
    }

    if (internalContexts.length) {
      internalDependencies.contexts = dedupeContexts(internalContexts);
    }

    for (const [written, source] of writtenToSource) {
      const spec = matchSpec(specs, 'schema', source);
      if (!spec) continue;
      const ref: PolySchemaReference = {
        'x-poly-ref': { path: spec.contextName },
      };
      schemaRefs[written] = ref;
      const pascal = spec.contextName
        .split('.')
        .map((segment) => toPascalCase(segment))
        .join('.');
      schemaRefs[`schemas.${pascal}`] = ref;
    }

    if (missing.length && !ignoreDependencies) {
      throw new Error(
        `Cannot resolve all poly resources referenced within function.\n\nMissing:\n${missing
          .map((name) => `  '${name}'`)
          .join(
            '\n',
          )}\n\nRerun command with '--ignore-dependencies' to skip resolving dependencies.`,
      );
    }
  }

  const hasInternal = Object.keys(internalDependencies).length > 0;
  return [
    dependencies.length ? externalDependencies : undefined,
    hasInternal ? internalDependencies : undefined,
    schemaRefs,
  ];
};

export const parseDeployComment = (comment: string): Deployment => {
  // Poly deployed @ 2024-08-29T22:46:46.791Z - test.weeklyReport - https://develop-k8s.polyapi.io/canopy/polyui/collections/server-functions/f0630f95-eac8-4c7d-9d23-639d39034bb6 - e3b0c44
  const match = comment.match(
    /^\s*(?:\/\/\s*)*Poly deployed @ (\S+) - (\S+)\.([^.]+) - (https?:\/\/[^/]+)\/\S+\/(\S+)s\/(\S+) - (\S+)$/,
  );
  if (!match) return null;
  const [, deployed, context, name, instance, type, id, fileRevision] = match;
  return {
    name,
    context,
    type: type as DeployableTypes,
    id,
    deployed,
    fileRevision,
    // Local development puts canopy on a different port than the poly-server
    instance: instance.endsWith('localhost:3000')
      ? instance.replace(':3000', ':8000')
      : instance,
  };
};

type Ranges = Array<[start: number, end: number]>;

// Function to extract leading comments from the source file
const getDeployComments = (
  sourceFile: ts.SourceFile,
): [Deployment[], Ranges] => {
  const text = sourceFile.getFullText();
  const matches: Deployment[] = [];
  const ranges = [] as Ranges;
  const leadingRanges = ts.getLeadingCommentRanges(text, 0);
  if (leadingRanges) {
    for (const range of leadingRanges) {
      const comment = text.substring(range.pos, range.end);
      const match = parseDeployComment(comment.trim());
      if (match) {
        matches.push(match);
        ranges.push([
          range.pos,
          range.end + (range.hasTrailingNewLine ? 1 : 0),
        ]);
      }
    }
  }
  return [matches, ranges];
};

// Function to extract the PolyServerFunction config
const getPolyConfig = (types: string[], sourceFile: ts.SourceFile): any => {
  let config: any = null;

  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      const name = declaration.name.getText(sourceFile);
      const type = declaration.type?.getText(sourceFile);
      if (name === 'polyConfig' && type && types.includes(type)) {
        const initializer = node.declarationList.declarations[0].initializer;
        if (initializer && ts.isObjectLiteralExpression(initializer)) {
          // eval() is generally considered harmful
          // but since we're running entirely client side on user-provided code
          // and since these configs are type-safe we're going to allow it
          // eslint-disable-next-line no-eval
          config = eval(`(${initializer.getText()})`);
          config.type = type;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const { name, context, type, description, ...other } = config;
  if (!name) throw new Error("polyConfig is missing 'name'.");
  if (!context) throw new Error("polyConfig is missing 'context'.");
  return { name, context, type, description, config: other };
};

// Helper function to parse JSDoc tags into an object
const parseJSDoc = (node: ts.FunctionDeclaration): any => {
  let jsDocTags: any = null;

  const jsDoc = node.getChildren().filter(ts.isJSDoc);
  if (jsDoc.length > 0) {
    jsDocTags = {
      description: '',
      params: [],
      returns: {
        type: 'void',
        description: '',
      },
    };
    const firstJsDoc = jsDoc[0];
    jsDocTags.description = firstJsDoc.comment
      ? ts.getTextOfJSDocComment(firstJsDoc.comment)
      : '';
    firstJsDoc.tags?.forEach((tag) => {
      const tagName = tag.tagName.text;
      const tagComment = ts.getTextOfJSDocComment(tag.comment) || '';
      if (tagName === 'param' && ts.isJSDocParameterTag(tag)) {
        const paramDetails = tagComment.split(/[\s-]+/);
        const paramName = tag.name.getText();
        const paramType =
          tag.typeExpression?.getText().replace(/^{|}$/g, '') || '';
        const paramDescription = paramDetails.join(' ').trim();

        jsDocTags.params.push({
          name: paramName,
          type: paramType,
          description: paramDescription,
        });
      } else if (tagName === 'returns' && ts.isJSDocReturnTag(tag)) {
        jsDocTags.returns = {
          type: tag.typeExpression?.getText().replace(/^{|}$/g, '') || '',
          description: tagComment.trim(),
        };
      } else {
        jsDocTags[tagName] = tagComment.trim();
      }
    });
  }

  return jsDocTags;
};

const parseTSTypes = (
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): any => {
  const params = node.parameters.map((param) => {
    const name = param.name.getText(sourceFile);
    const type = param.type?.getText(sourceFile);
    if (!type) {
      throw new Error(
        `Missing type for function argument '${name}' in file '${sourceFile.fileName}'.`,
      );
    }
    return {
      name,
      type,
      description: '',
    };
  });

  const type = node.type?.getText(sourceFile);
  if (!type) {
    throw new Error(
      `Missing return type for function in file '${sourceFile.fileName}'. Use 'void' if no return type.`,
    );
  }
  const returns = {
    type,
    description: '',
  };
  return {
    params,
    returns,
    description: '',
  };
};

// Function to extract function details including JSDoc, arguments, and return type
const getFunctionDetails = (
  sourceFile: ts.SourceFile,
  functionName: string,
) => {
  let functionDetails: null | Pick<
    DeployableRecord,
    'types' | 'docStartIndex' | 'docEndIndex' | 'dirty'
  > = null;
  let dirty = false; // Dirty means that something needs fixed in the file
  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.getText(sourceFile) === functionName
    ) {
      const jsDoc = parseJSDoc(node);
      const types = parseTSTypes(node, sourceFile);
      if (
        jsDoc &&
        types.params.length === jsDoc.params.length &&
        types.params.every(
          (p, i) =>
            p.type === jsDoc.params[i].type && p.name === jsDoc.params[i].name,
        ) &&
        types.returns.type === jsDoc.returns.type
      ) {
        // Try to preserve JSDoc descriptions if things haven't changed
        jsDoc.params.forEach((p, i) => {
          types.params[i].description = p.description;
        });
        types.returns.description = jsDoc.returns.description;
        types.description = jsDoc.description;
        dirty = types.params.some(
          (p, i) =>
            p.type !== jsDoc.params[i].type || p.name !== jsDoc.params[i].name,
        );
      } else {
        dirty = true;
      }

      const docStartIndex = node.getStart(sourceFile, true);
      const docEndIndex = node.getStart(sourceFile, false);

      functionDetails = {
        types,
        docStartIndex,
        docEndIndex,
        dirty,
      };
    } else {
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);
  if (!functionDetails) {
    throw new Error(
      `Failed to find a function named '${functionName}' within file '${sourceFile.fileName}'. Verify that your polyConfig name matches a valid function declared within the same file.`,
    );
  }
  return functionDetails;
};

const parseDeployableFunction = async (
  sourceFile: ts.SourceFile,
  polyConfig: ParsedDeployableConfig,
  baseUrl: string,
  fileRevision: string,
  gitRevision: string,
): Promise<DeployableRecord> => {
  const [deployments, deploymentCommentRanges] = getDeployComments(sourceFile);
  const functionDetails = getFunctionDetails(sourceFile, polyConfig.name);
  if (polyConfig.description) {
    if (polyConfig.description !== functionDetails.types.description) {
      functionDetails.types.description = polyConfig.description;
      functionDetails.dirty = true;
    }
  } else {
    polyConfig.description = functionDetails.types.description || '';
  }

  const [externalDependencies, internalDependencies, schemaRefs] =
    await getDependencies(
      sourceFile.getFullText(),
      sourceFile.fileName,
      baseUrl,
      false,
    );
  const referencedSchemas = Object.keys(schemaRefs).length ? schemaRefs : null;
  const typeSchemas = generateTypeSchemas(
    sourceFile.fileName,
    DeployableTypeEntries.map((d) => d[0]),
    polyConfig.name,
    referencedSchemas,
  );
  return {
    ...polyConfig,
    ...functionDetails,
    deployments,
    deploymentCommentRanges,
    externalDependencies,
    internalDependencies: internalDependencies ?? null,
    typeSchemas,
    fileRevision,
    gitRevision,
    file: sourceFile.fileName,
  };
};

const parseWebhook = (
  sourceFile: ts.SourceFile,
  polyConfig: ParsedDeployableConfig,
  baseUrl: string,
  fileRevision: string,
  gitRevision: string,
): DeployableRecord => {
  const [deployments] = getDeployComments(sourceFile);
  return {
    ...polyConfig,
    deployments,
    fileRevision,
    gitRevision,
    file: sourceFile.fileName,
  };
};

export const parseDeployable = async (
  filePath: string,
  baseUrl: string,
  gitRevision: string,
): Promise<[DeployableRecord, string]> => {
  const sourceFile = await loadTsSourceFile(filePath);

  const polyConfig = getPolyConfig(
    DeployableTypeEntries.map((e) => e[0]),
    sourceFile,
  );
  polyConfig.type = DeployableTsTypeToName[polyConfig.type];
  const fileContents = sourceFile.getFullText();
  const fileRevision = getDeployableFileRevision(fileContents);
  try {
    switch (polyConfig.type) {
      case 'server-function':
      case 'client-function':
        return [
          await parseDeployableFunction(
            sourceFile,
            polyConfig,
            baseUrl,
            fileRevision,
            gitRevision,
          ),
          fileContents,
        ];
      case 'webhook':
        return [
          parseWebhook(
            sourceFile,
            polyConfig,
            baseUrl,
            fileRevision,
            gitRevision,
          ),
          fileContents,
        ];
    }
    throw new Error('Invalid Poly deployment with unsupported type');
  } catch (e) {
    shell.echo(
      chalk.redBright(
        `Prepared ${polyConfig.type.replaceAll('-', ' ')} ${polyConfig.context
        }.${polyConfig.name}: ERROR`,
      ),
    );
    shell.echo(
      chalk.red(
        // @ts-expect-error - it's fine
        (e instanceof Error ? e.message : e.response?.data?.message) ||
        'Unexpected error.',
      ),
    );
  }
};

const dereferenceSchema = (
  obj: any,
  definitions: any,
  visited: Set<string> = new Set(),
): any => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => dereferenceSchema(item, definitions, visited));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string') {
      const match = value.match(/^#\/definitions\/(.+)$/);
      if (match) {
        const defName = decodeURIComponent(match[1]);

        // Prevent infinite recursion
        if (visited.has(defName)) {
          return { $ref: value };
        }

        const definition = definitions[defName];
        if (definition) {
          // Inspired by old flattenDefinitions logic: Check if this looks like a "real" type
          // vs a utility type by examining the definition structure
          const shouldInline = isInlineableDefinition(definition, defName);

          if (shouldInline) {
            // Inline the definition
            visited.add(defName);
            const { definitions: _, ...inlinedDef } = definition;
            const result = dereferenceSchema(inlinedDef, definitions, visited);
            visited.delete(defName);
            return result;
          } else {
            // Keep as reference (utility types, complex mapped types, etc.)
            return { $ref: value };
          }
        }
      }
      return { $ref: value };
    } else {
      result[key] = dereferenceSchema(value, definitions, visited);
    }
  }

  return result;
};

const isInlineableDefinition = (definition: any, defName: string): boolean => {
  const decodedDefName = decodeURIComponent(defName);

  // If it has "real" object properties, it's probably a real interface that should be inlined
  if (
    definition.type === 'object' &&
    definition.properties &&
    Object.keys(definition.properties).length > 0
  ) {
    return true;
  }

  // If it has array items with concrete structure, inline it
  if (
    definition.type === 'array' &&
    definition.items &&
    typeof definition.items === 'object' &&
    definition.items.type
  ) {
    return true;
  }

  // If it's a simple type (string, number, boolean), inline it
  if (['string', 'number', 'boolean', 'integer'].includes(definition.type)) {
    return true;
  }

  // If it has enum values, it's a real type, inline it
  if (definition.enum && definition.enum.length > 0) {
    return true;
  }

  // If it's a union/intersection of concrete types, inline it
  if ((definition.anyOf || definition.allOf) && !decodedDefName.includes('<')) {
    return true;
  }

  // Keep as reference if it looks like a utility type (contains < > or other TypeScript operators)
  if (
    decodedDefName.includes('<') ||
    decodedDefName.includes('>') ||
    decodedDefName.includes('|') ||
    decodedDefName.includes('&')
  ) {
    return false;
  }

  // If we can't determine, err on the side of inlining for "normal" looking names
  return !/[<>%|&]/.test(decodedDefName);
};

const dereferenceRoot = (schema: any): any => {
  if (!schema || !schema.definitions) return schema;

  // If schema has a root $ref, dereference it first
  let rootSchema = schema;
  if (schema.$ref) {
    const match = schema.$ref.match(/^#\/definitions\/(.+)$/);
    if (match) {
      const defName = decodeURIComponent(match[1]);
      const root = schema.definitions[defName];
      if (root) {
        const { definitions, $schema, $ref, ...rest } = schema;
        rootSchema = {
          ...root,
          definitions,
          $schema,
          ...rest,
        };
      }
    }
  }

  // Now recursively dereference based on intelligent heuristics
  const { definitions, $schema, ...rest } = rootSchema;
  const dereferencedRest = dereferenceSchema(rest, definitions);

  // Collect remaining references that weren't inlined
  const filteredDefinitions: any = {};
  const findReferences = (obj: any, visited: Set<string> = new Set()): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item) => findReferences(item, visited));
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        const match = value.match(/^#\/definitions\/(.+)$/);
        if (match) {
          const encodedDefName = match[1];
          const decodedDefName = decodeURIComponent(encodedDefName);

          // Try both encoded and decoded versions
          const actualDefName = definitions[encodedDefName]
            ? encodedDefName
            : definitions[decodedDefName]
              ? decodedDefName
              : null;

          if (actualDefName && !visited.has(actualDefName)) {
            visited.add(actualDefName);
            filteredDefinitions[actualDefName] = definitions[actualDefName];
            // Also recursively find references within this definition
            findReferences(definitions[actualDefName], visited);
          }
        }
      } else {
        findReferences(value, visited);
      }
    }
  };

  findReferences(dereferencedRest);

  return {
    ...dereferencedRest,
    ...(Object.keys(filteredDefinitions).length > 0 && {
      definitions: filteredDefinitions,
    }),
    $schema,
  };
};

const applyPolySchemaRefs = (
  schema: any,
  refs: Record<string, PolySchemaReference>,
): any => {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => applyPolySchemaRefs(item, refs));
  }
  if (typeof schema.$ref === 'string') {
    const match = schema.$ref.match(/^#\/definitions\/(.+)$/);
    if (match) {
      const encoded = match[1];
      const decoded = decodeURIComponent(encoded);
      if (refs[decoded]) return refs[decoded];
      if (refs[encoded]) return refs[encoded];
    }
  }
  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'definitions' && value && typeof value === 'object') {
      const definitions: any = {};
      for (const [defName, defValue] of Object.entries(value)) {
        const decoded = decodeURIComponent(defName);
        if (refs[decoded] || refs[defName]) continue;
        definitions[defName] = applyPolySchemaRefs(defValue, refs);
      }
      if (Object.keys(definitions).length) result.definitions = definitions;
      continue;
    }
    result[key] = applyPolySchemaRefs(value, refs);
  }
  return result;
};

export const extractTypesFromAST = (
  filePath: string,
  functionName: string,
): string[] => {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) throw new Error(`Could not load file: ${filePath}`);

  const extractedTypes: Set<string> = new Set();

  const extractFromTypeNode = (typeNode: ts.TypeNode) => {
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeName = typeNode.typeName.getText(sourceFile);

      // Skip primitive and built-in types
      const primitives = [
        'Promise',
        'Array',
        'Record',
        'string',
        'number',
        'boolean',
        'void',
        'any',
        'unknown',
        'object',
        'undefined',
        'null',
      ];
      if (!primitives.includes(typeName)) {
        extractedTypes.add(typeName);
      }

      // Extract type arguments from generics (like Promise<T> -> extract T)
      if (typeNode.typeArguments) {
        for (const typeArg of typeNode.typeArguments) {
          extractFromTypeNode(typeArg);
        }
      }
    } else if (ts.isIndexedAccessTypeNode(typeNode)) {
      extractedTypes.add(typeNode.getText(sourceFile));
    } else if (ts.isImportTypeNode(typeNode)) {
      extractedTypes.add(typeNode.getText(sourceFile));
      if (typeNode.typeArguments) {
        for (const typeArg of typeNode.typeArguments) {
          extractFromTypeNode(typeArg);
        }
      }
    } else if (ts.isParenthesizedTypeNode(typeNode)) {
      extractFromTypeNode(typeNode.type);
    } else if (ts.isArrayTypeNode(typeNode)) {
      extractFromTypeNode(typeNode.elementType);
    } else if (ts.isTypeOperatorNode(typeNode)) {
      extractFromTypeNode(typeNode.type);
    } else if (
      ts.isUnionTypeNode(typeNode) ||
      ts.isIntersectionTypeNode(typeNode)
    ) {
      // Handle union/intersection types
      for (const type of typeNode.types) {
        extractFromTypeNode(type);
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      // Extract types from parameters
      for (const param of node.parameters) {
        if (param.type) {
          extractFromTypeNode(param.type);
        }
      }

      // Extract types from return type
      if (node.type) {
        extractFromTypeNode(node.type);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return Array.from(extractedTypes);
};

export const generateTypeSchemas = (
  filePath: string,
  ignoredTypeNames: string[] = [],
  functionName?: string,
  referencedSchemas: Record<string, any> | null = null,
): Record<string, any> => {
  const tsconfigPath = path.resolve('tsconfig.json');
  // Use provided function name or default to filename
  const actualFunctionName = functionName || path.basename(filePath, '.ts');

  // FIXED: Use AST-based type extraction instead of string manipulation
  const extractedTypes = extractTypesFromAST(filePath, actualFunctionName);

  // Filter ignored types
  const typeNames = extractedTypes.filter(
    (typeName) => !ignoredTypeNames.includes(typeName),
  );

  const output: Record<string, any> = {};

  for (const typeName of typeNames) {
    if (ignoredTypeNames.includes(typeName)) continue;
    if (referencedSchemas?.[typeName]) {
      output[typeName] = referencedSchemas[typeName];
      continue;
    }

    try {
      const generator = createGenerator({
        path: filePath,
        tsconfig: tsconfigPath,
        type: typeName,
        expose: 'all',
        topRef: true,
        skipTypeCheck: true,
      });

      const schema = generator.createSchema(typeName);
      const withPolyRefs = referencedSchemas
        ? applyPolySchemaRefs(schema, referencedSchemas)
        : schema;
      output[typeName] = dereferenceRoot(withPolyRefs);
    } catch (err: any) {
      if (!/No root type.*found/.test(err.message)) {
        console.warn(
          `⚠️ Error generating schema for "${typeName}":`,
          err.message,
        );
      }
    }
  }

  return output;
};
