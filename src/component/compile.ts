import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import ts from 'typescript';
import * as esbuild from 'esbuild';
import { assignPolyPath, resolveExistingPath } from './manifest';
import { resolvePolyComponentImports } from './polyImports';
import {
  CompileResult,
  ComponentManifest,
  isBareNpmSpecifier,
  isPolyApiSpecifier,
  packageRoot,
  POLY_APP_VENDOR,
  POLY_INSTANCE_VENDOR,
  vendorModuleForNpmSpecifier,
} from './types';

const nodeRequire = createRequire(__filename);

const JS_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

export const vendorExportName = (specifier: string): string => {
  const trimmed = specifier.replace(/^@/, '').replace(/\.(js|mjs|cjs)$/i, '');
  const parts = trimmed.split(/[/\\-]+/).filter(Boolean);
  const name = parts
    .map((part, index) => {
      const cleaned = part.replace(/[^a-zA-Z0-9_$]/g, '');
      if (!cleaned) return '';
      if (index === 0) {
        return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
      }
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    })
    .join('');
  if (!name) return '_vendor';
  if (/^[0-9]/.test(name)) return `_${name}`;
  return name;
};

export const resolveLocalModule = (
  fromDir: string,
  specifier: string,
): string | undefined => {
  const base = path.resolve(fromDir, specifier);
  const candidates = [base];
  const ext = path.extname(base);
  if (!ext || !JS_EXTENSIONS.includes(ext)) {
    for (const jsExt of JS_EXTENSIONS) {
      candidates.push(`${base}${jsExt}`);
    }
    for (const jsExt of JS_EXTENSIONS) {
      candidates.push(path.join(base, `index${jsExt}`));
    }
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return resolveExistingPath(candidate);
    }
  }
  return undefined;
};

const isJsModuleFile = (filePath: string) =>
  JS_EXTENSIONS.includes(path.extname(filePath).toLowerCase());

export const uniquePreserve = <T>(items: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
};

const scriptKindForFile = (filePath: string) => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
};

export const collectNpmSpecifiersFromSource = (
  sourceCode: string,
  filePath: string,
): string[] => {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!node.importClause?.isTypeOnly) {
        const spec = node.moduleSpecifier.text;
        if (isBareNpmSpecifier(spec) && !isPolyApiSpecifier(spec))
          found.push(spec);
      }
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const spec = node.moduleSpecifier.text;
      if (isBareNpmSpecifier(spec) && !isPolyApiSpecifier(spec))
        found.push(spec);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (
        arg &&
        ts.isStringLiteral(arg) &&
        isBareNpmSpecifier(arg.text) &&
        !isPolyApiSpecifier(arg.text)
      ) {
        found.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uniquePreserve(found);
};

type NpmBinding = {
  specifier: string;
  kind: 'default' | 'namespace' | 'named' | 'sideEffect';
  local: string;
  imported?: string;
};

const collectImportBindings = (
  stmt: ts.ImportDeclaration,
  specifier: string,
): NpmBinding[] => {
  const clause = stmt.importClause;
  if (!clause) {
    return [{ specifier, kind: 'sideEffect', local: '' }];
  }
  const bindings: NpmBinding[] = [];
  if (clause.name) {
    bindings.push({ specifier, kind: 'default', local: clause.name.text });
  }
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named)) {
    bindings.push({ specifier, kind: 'namespace', local: named.name.text });
  }
  if (named && ts.isNamedImports(named)) {
    for (const el of named.elements) {
      if (el.isTypeOnly) continue;
      bindings.push({
        specifier,
        kind: 'named',
        local: el.name.text,
        imported: el.propertyName?.text ?? el.name.text,
      });
    }
  }
  return bindings;
};

const rewriteDynamicNpmImports = (code: string): string =>
  code.replace(
    /import\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    (match, quote: string, spec: string) => {
      if (!isBareNpmSpecifier(spec) || isPolyApiSpecifier(spec)) return match;
      const modulePath = vendorModuleForNpmSpecifier(spec);
      return `import(${quote}${modulePath}${quote}).then(m => m.${vendorExportName(
        spec,
      )})`;
    },
  );

const vendorImportLine = (modulePath: string, specifiers: string[]) =>
  `import { ${specifiers
    .sort()
    .map(
      (spec) => `${vendorExportName(spec)} as __poly_${vendorExportName(spec)}`,
    )
    .join(', ')} } from ${JSON.stringify(modulePath)};`;

export const rewriteNpmImportsToVendor = (code: string): string => {
  const sourceFile = ts.createSourceFile(
    'component.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  const npmBindings: NpmBinding[] = [];
  const npmSpecifiers = new Set<string>();
  const importish: string[] = [];
  const others: string[] = [];
  const extraAfter: string[] = [];
  const leading =
    sourceFile.statements.length > 0
      ? code.slice(0, sourceFile.statements[0].getStart(sourceFile))
      : '';

  for (const stmt of sourceFile.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      const spec = stmt.moduleSpecifier.text;
      if (isBareNpmSpecifier(spec) && !isPolyApiSpecifier(spec)) {
        npmSpecifiers.add(spec);
        npmBindings.push(...collectImportBindings(stmt, spec));
        continue;
      }
      importish.push(stmt.getText(sourceFile));
      continue;
    }

    if (
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      const spec = stmt.moduleSpecifier.text;
      if (isBareNpmSpecifier(spec) && !isPolyApiSpecifier(spec)) {
        npmSpecifiers.add(spec);
        extraAfter.push(
          ...convertNpmReexport(
            stmt,
            vendorExportName(spec),
            vendorModuleForNpmSpecifier(spec),
          ),
        );
        continue;
      }
      importish.push(stmt.getText(sourceFile));
      continue;
    }

    others.push(stmt.getText(sourceFile));
  }

  if (npmSpecifiers.size === 0) {
    return rewriteDynamicNpmImports(code);
  }

  const instanceSpecs = [...npmSpecifiers]
    .filter(
      (spec) => vendorModuleForNpmSpecifier(spec) === POLY_INSTANCE_VENDOR,
    )
    .sort();
  const appSpecs = [...npmSpecifiers]
    .filter((spec) => vendorModuleForNpmSpecifier(spec) === POLY_APP_VENDOR)
    .sort();
  const vendorImports = [
    ...(instanceSpecs.length
      ? [vendorImportLine(POLY_INSTANCE_VENDOR, instanceSpecs)]
      : []),
    ...(appSpecs.length ? [vendorImportLine(POLY_APP_VENDOR, appSpecs)] : []),
  ];

  const consts = npmBindings.flatMap((binding) => {
    if (binding.kind === 'sideEffect' || !binding.local) return [];
    const alias = `__poly_${vendorExportName(binding.specifier)}`;
    if (binding.kind === 'default') {
      return [`const ${binding.local} = ${alias}.default ?? ${alias};`];
    }
    if (binding.kind === 'namespace') {
      return [`const ${binding.local} = ${alias};`];
    }
    return [`const ${binding.local} = ${alias}.${binding.imported};`];
  });

  const rewritten = [
    leading.trimEnd(),
    ...vendorImports,
    ...importish,
    ...consts,
    ...extraAfter,
    ...others,
  ]
    .filter((part) => part !== '')
    .join('\n');

  return rewriteDynamicNpmImports(
    rewritten.endsWith('\n') ? rewritten : `${rewritten}\n`,
  );
};

const convertNpmReexport = (
  stmt: ts.ExportDeclaration,
  ns: string,
  modulePath: string,
): string[] => {
  if (stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
    return [
      `export { ${ns} as ${stmt.exportClause.name.text} } from ${JSON.stringify(
        modulePath,
      )};`,
    ];
  }
  if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
    return stmt.exportClause.elements.map((el) => {
      const imported = el.propertyName?.text ?? el.name.text;
      const local = el.name.text;
      return `export const ${local} = __poly_${ns}.${imported};`;
    });
  }
  if (!stmt.exportClause) {
    return [`export { ${ns} } from ${JSON.stringify(modulePath)};`];
  }
  return [];
};

export const findBareNpmSpecifiersInCode = (code: string): string[] => {
  const sourceFile = ts.createSourceFile(
    'component.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isBareNpmSpecifier(node.moduleSpecifier.text) &&
      !isPolyApiSpecifier(node.moduleSpecifier.text)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isBareNpmSpecifier(node.moduleSpecifier.text) &&
      !isPolyApiSpecifier(node.moduleSpecifier.text)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (
        arg &&
        ts.isStringLiteral(arg) &&
        isBareNpmSpecifier(arg.text) &&
        !isPolyApiSpecifier(arg.text)
      ) {
        found.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uniquePreserve(found);
};

export type CompileComponentOptions = {
  projectRoot: string;
  defaultContext: string;
  manifest: ComponentManifest;
  npmResolveDir?: string;
};

const toLibFileName = (lib: string) => {
  const trimmed = lib.trim();
  if (/\.d\.ts$/i.test(trimmed)) return trimmed;
  return `lib.${trimmed.toLowerCase()}.d.ts`;
};

const BROWSER_COMPONENT_LIBS = ['es2020', 'dom', 'dom.iterable'].map(
  toLibFileName,
);

const mergeComponentLibs = (userLib: unknown): string[] => {
  const libs = new Set<string>(BROWSER_COMPONENT_LIBS);
  if (Array.isArray(userLib)) {
    for (const item of userLib) {
      if (typeof item === 'string') libs.add(toLibFileName(item));
    }
  }
  return [...libs];
};

const getComponentCompilerOptions = (
  projectRoot: string,
): ts.CompilerOptions => {
  const forced: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    noEmit: true,
    strict: false,
    noImplicitAny: false,
    noUnusedLocals: false,
    noUnusedParameters: false,
    incremental: false,
    composite: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    isolatedModules: false,
    lib: BROWSER_COMPONENT_LIBS,
  };

  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    'tsconfig.json',
  );
  if (!configPath) return forced;

  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error || !read.config) return forced;

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
  );
  return {
    ...parsed.options,
    ...forced,
    lib: mergeComponentLibs(read.config?.compilerOptions?.lib),
    jsxImportSource: parsed.options.jsxImportSource || 'react',
    rootDir: undefined,
    rootDirs: undefined,
    outDir: undefined,
    outFile: undefined,
    tsBuildInfoFile: undefined,
  };
};

const isNodeModulesFile = (fileName: string) =>
  fileName.includes(`${path.sep}node_modules${path.sep}`);

export const typecheckComponentFile = (
  filePath: string,
  options: { projectRoot: string; npmResolveDir?: string },
) => {
  const npmResolveDir = options.npmResolveDir || options.projectRoot;
  const compilerOptions = getComponentCompilerOptions(options.projectRoot);
  const host = ts.createCompilerHost(compilerOptions, true);
  const fallbackContaining = path.join(npmResolveDir, '__poly_resolve.ts');

  const resolveOne = (
    spec: string,
    containingFile: string,
    redirectedReference?: ts.ResolvedProjectReference,
  ) => {
    const first = ts.resolveModuleName(
      spec,
      containingFile,
      compilerOptions,
      host,
      undefined,
      redirectedReference,
    );
    if (first.resolvedModule) return first;
    return ts.resolveModuleName(
      spec,
      fallbackContaining,
      compilerOptions,
      host,
      undefined,
      redirectedReference,
    );
  };

  host.resolveModuleNameLiterals = (
    moduleLiterals,
    containingFile,
    redirectedReference,
  ) =>
    moduleLiterals.map((literal) =>
      resolveOne(literal.text, containingFile, redirectedReference),
    );

  const program = ts.createProgram({
    rootNames: [filePath],
    options: compilerOptions,
    host,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) return false;
    if (diagnostic.file && isNodeModulesFile(diagnostic.file.fileName)) {
      return false;
    }
    return true;
  });

  if (!diagnostics.length) return;

  const formatted = ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => options.projectRoot,
    getNewLine: () => ts.sys.newLine,
  });
  throw new Error(`TypeScript compile failed:\n${formatted.trim()}`);
};

export const compileComponentFile = async (
  filePath: string,
  options: CompileComponentOptions,
): Promise<CompileResult> => {
  const absFile = resolveExistingPath(filePath);
  typecheckComponentFile(absFile, {
    projectRoot: options.projectRoot,
    npmResolveDir: options.npmResolveDir,
  });
  const sourceCode = fs.readFileSync(absFile, 'utf8');
  const resolvedPoly = await resolvePolyComponentImports(sourceCode, absFile);
  const npmSpecifiers = new Set<string>(
    collectNpmSpecifiersFromSource(sourceCode, absFile),
  );

  const result = await esbuild.build({
    absWorkingDir: options.projectRoot,
    stdin: {
      contents: resolvedPoly.source,
      sourcefile: absFile,
      loader: esbuildLoaderForFile(absFile),
      resolveDir: path.dirname(absFile),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    sourcemap: false,
    logLevel: 'silent',
    outfile: 'component.js',
    plugins: [
      {
        name: 'poly-component-externals',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'entry-point') return undefined;
            if (args.path.startsWith('poly:')) {
              return { path: args.path, external: true };
            }
            if (isPolyApiSpecifier(args.path)) {
              return { path: args.path, external: true };
            }

            const isRelative =
              args.path.startsWith('./') ||
              args.path.startsWith('../') ||
              path.isAbsolute(args.path);

            if (isRelative) {
              const resolved = resolveLocalModule(args.resolveDir, args.path);
              if (!resolved) {
                return {
                  errors: [
                    {
                      text: `Cannot resolve local import '${args.path}' from ${args.importer}`,
                    },
                  ],
                };
              }
              if (
                isJsModuleFile(resolved) &&
                path.normalize(resolved) !== path.normalize(absFile)
              ) {
                const assigned = assignPolyPath(
                  resolved,
                  options.projectRoot,
                  options.defaultContext,
                  options.manifest,
                );
                return {
                  errors: [
                    {
                      text: `Import ${assigned.polyPath} via polyapi, not from another file.`,
                    },
                  ],
                };
              }
              return { path: args.path, external: true };
            }

            npmSpecifiers.add(args.path);
            return { path: args.path, external: true };
          });
        },
      },
    ],
  });

  if (result.errors.length) {
    throw new Error(result.errors.map((err) => err.text).join('\n'));
  }

  const output = result.outputFiles?.[0]?.text;
  if (!output) {
    throw new Error(`esbuild produced no output for ${absFile}`);
  }

  const code = rewriteNpmImportsToVendor(output);
  const leftover = findBareNpmSpecifiersInCode(code);
  if (leftover.length) {
    throw new Error(
      `Compiled component still contains npm specifiers: ${leftover.join(', ')}`,
    );
  }

  return {
    sourceCode,
    code,
    imports: uniquePreserve(resolvedPoly.imports),
    npmSpecifiers: uniquePreserve([...npmSpecifiers]),
  };
};

const esbuildLoaderForFile = (filePath: string): esbuild.Loader => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return 'tsx';
    case '.jsx':
      return 'jsx';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'js';
    default:
      return 'ts';
  }
};

export type BundleVendorOptions = {
  minify?: boolean;
  production?: boolean;
};

export const bundleVendor = async (
  specifiers: string[],
  npmResolveDir: string,
  options: BundleVendorOptions = {},
): Promise<string> => {
  const unique = uniquePreserve(specifiers).sort();
  if (!unique.length) {
    return 'export {};\n';
  }

  const usedNames = new Map<string, string>();
  const lines = unique.map((spec) => {
    let name = vendorExportName(spec);
    if ([...usedNames.values()].includes(name)) {
      name = `${name}$${usedNames.size}`;
    }
    usedNames.set(spec, name);
    return `export * as ${name} from ${JSON.stringify(spec)};`;
  });

  const production = options.production === true;
  const minify = options.minify === true;
  const result = await esbuild.build({
    stdin: {
      contents: `${lines.join('\n')}\n`,
      resolveDir: npmResolveDir,
      sourcefile: 'poly-vendor.js',
      loader: 'js',
    },
    absWorkingDir: npmResolveDir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    sourcemap: false,
    logLevel: 'silent',
    minify,
    keepNames: !minify,
    mainFields: ['module', 'browser', 'main'],
    conditions: ['import', 'module', 'browser', 'default'],
    nodePaths: [path.join(npmResolveDir, 'node_modules')],
    ...(production
      ? { define: { 'process.env.NODE_ENV': '"production"' } }
      : {}),
  });

  if (result.errors.length) {
    throw new Error(result.errors.map((err) => err.text).join('\n'));
  }

  const output = result.outputFiles?.[0]?.text;
  if (!output) {
    throw new Error('esbuild produced no vendor output');
  }
  return output;
};

const readVersionFromPackageJson = (
  pkgJsonPath: string,
): string | undefined => {
  try {
    const json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
      version?: string;
    };
    return json.version;
  } catch {
    return undefined;
  }
};

const findInstalledPackageJson = (
  pkg: string,
  resolveDir: string,
): string | undefined => {
  let dir = path.resolve(resolveDir);
  while (true) {
    const candidate = path.join(
      dir,
      'node_modules',
      ...pkg.split('/'),
      'package.json',
    );
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  try {
    return nodeRequire.resolve(`${pkg}/package.json`, { paths: [resolveDir] });
  } catch {
    // Many packages omit "./package.json" from "exports".
  }

  try {
    const entry = nodeRequire.resolve(pkg, { paths: [resolveDir] });
    let current = path.dirname(entry);
    while (true) {
      const candidate = path.join(current, 'package.json');
      if (fs.existsSync(candidate)) {
        try {
          const json = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
            name?: string;
          };
          if (!json.name || json.name === pkg) return candidate;
        } catch {
          // keep walking
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // ignore
  }

  return undefined;
};

export const readPackageVersion = (pkg: string, resolveDir: string): string => {
  const pkgJsonPath = findInstalledPackageJson(pkg, resolveDir);
  const version = pkgJsonPath
    ? readVersionFromPackageJson(pkgJsonPath)
    : undefined;
  if (version) return version;
  throw new Error(
    `Unable to resolve version for npm package '${pkg}' from ${resolveDir}`,
  );
};

export const resolveExternalDependencies = (
  specifiers: string[],
  npmResolveDir: string,
): Record<string, string> => {
  const deps: Record<string, string> = {};
  for (const spec of uniquePreserve(specifiers).sort()) {
    const root = packageRoot(spec);
    if (deps[root]) continue;
    deps[root] = readPackageVersion(root, npmResolveDir);
  }
  return deps;
};
