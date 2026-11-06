import ts from 'typescript';
import { getSpecs } from '../api';
import { DEFAULT_POLY_PATH } from '../constants';
import { getDependencies, getTSBaseUrl } from '../transpiler';
import { Specification } from '../types';
import { getCachedSpecs, getPolyLibPath, writeCachedSpecs } from '../utils';

const POLY_PACKAGE = 'polyapi';
const NAMED_POLY_ROOTS = new Set([
  'vari',
  'tabi',
  'schemas',
  'loxi',
  'que',
  'polyCustom',
]);
const NON_FUNCTION_SPEC_TYPES = new Set(['serverVariable', 'table', 'schema']);

type PolyBinding = {
  local: string;
  prefix: string;
};

type ComponentMatch = {
  polyPath: string;
  member: string;
};

const scriptKindForFile = (filePath: string) => {
  switch (filePath.replace(/.*\./, '').toLowerCase()) {
    case 'tsx':
      return ts.ScriptKind.TSX;
    case 'jsx':
      return ts.ScriptKind.JSX;
    case 'js':
    case 'mjs':
    case 'cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
};

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

const chainParts = (expr: ts.Expression): string[] | null => {
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
      const arg = current.argumentExpression
        ? unwrapExpression(current.argumentExpression)
        : undefined;
      if (
        arg &&
        (ts.isStringLiteral(arg) ||
          ts.isNoSubstitutionTemplateLiteral(arg) ||
          ts.isNumericLiteral(arg))
      ) {
        parts.unshift(arg.text);
        current = current.expression;
        continue;
      }
      return null;
    }
    if (ts.isIdentifier(current)) {
      parts.unshift(current.text);
      break;
    }
    return null;
  }
  return parts;
};

const isOuterChain = (node: ts.Node) => {
  const parent = node.parent;
  return (
    !parent ||
    (!ts.isPropertyAccessExpression(parent) &&
      !ts.isElementAccessExpression(parent))
  );
};

const bindingPrefix = (imported: string): string | null => {
  if (NAMED_POLY_ROOTS.has(imported)) return null;
  return imported;
};

const collectBindings = (sourceFile: ts.SourceFile): Map<string, string> => {
  const bindings = new Map<string, string>();
  const add = (local: string, prefix: string) => {
    bindings.set(local, prefix);
  };

  for (const stmt of sourceFile.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text === POLY_PACKAGE &&
      stmt.importClause &&
      !stmt.importClause.isTypeOnly
    ) {
      const clause = stmt.importClause;
      if (clause.name) add(clause.name.text, '');
      const named = clause.namedBindings;
      if (named && ts.isNamespaceImport(named)) add(named.name.text, '');
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          if (element.isTypeOnly) continue;
          const imported = element.propertyName
            ? element.propertyName.text
            : element.name.text;
          const prefix = bindingPrefix(imported);
          if (prefix !== null) add(element.name.text, prefix);
        }
      }
    }

    if (
      ts.isImportEqualsDeclaration(stmt) &&
      ts.isExternalModuleReference(stmt.moduleReference) &&
      ts.isStringLiteral(stmt.moduleReference.expression) &&
      stmt.moduleReference.expression.text === POLY_PACKAGE
    ) {
      add(stmt.name.text, '');
    }

    if (
      ts.isVariableStatement(stmt) &&
      stmt.declarationList.declarations.length === 1
    ) {
      const decl = stmt.declarationList.declarations[0];
      if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
      const init = unwrapExpression(decl.initializer);
      if (
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === 'require' &&
        init.arguments[0] &&
        ts.isStringLiteral(init.arguments[0]) &&
        init.arguments[0].text === POLY_PACKAGE
      ) {
        add(decl.name.text, '');
      }
    }
  }

  return bindings;
};

const resourcePathFor = (
  parts: string[],
  bindings: Map<string, string>,
): string | null => {
  const prefix = bindings.get(parts[0]);
  if (prefix === undefined) return null;
  return [prefix, ...parts.slice(1)].filter(Boolean).join('.');
};

const collectResourcePaths = (
  sourceFile: ts.SourceFile,
  bindings: Map<string, string>,
): string[] => {
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      isOuterChain(node)
    ) {
      const parts = chainParts(node);
      const resource = parts ? resourcePathFor(parts, bindings) : null;
      if (resource && !resource.includes('*')) found.add(resource);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found];
};

const exactSpec = (
  specs: Specification[],
  resourcePath: string,
): Specification | undefined =>
  specs.find(
    (spec) =>
      !NON_FUNCTION_SPEC_TYPES.has(spec.type) &&
      spec.contextName.toLowerCase() === resourcePath.toLowerCase(),
  );

const matchComponent = (
  specs: Specification[],
  resourcePath: string,
): ComponentMatch | null => {
  const exact = exactSpec(specs, resourcePath);
  if (exact) {
    if (exact.type !== 'componentFunction') return null;
    return { polyPath: exact.contextName, member: '' };
  }

  const lower = resourcePath.toLowerCase();
  let best: Specification | undefined;
  for (const spec of specs) {
    if (spec.type !== 'componentFunction') continue;
    const prefix = `${spec.contextName.toLowerCase()}.`;
    if (
      lower.startsWith(prefix) &&
      (!best || spec.contextName.length > best.contextName.length)
    ) {
      best = spec;
    }
  }
  if (!best) return null;
  return {
    polyPath: best.contextName,
    member: resourcePath.slice(best.contextName.length + 1),
  };
};

const pathIsResolved = (specs: Specification[], resourcePath: string) =>
  !!matchComponent(specs, resourcePath) || !!exactSpec(specs, resourcePath);

type ClientCall = {
  local: string;
  relativePath: string;
  url: string;
  argNames: string[];
};

const argumentNames = (spec: Specification): string[] => {
  if (!('function' in spec) || !spec.function?.arguments) return [];
  return spec.function.arguments.map((arg) => arg.name);
};

const BROWSER_EXECUTE_KIND: Partial<Record<Specification['type'], string>> = {
  serverFunction: 'server',
  apiFunction: 'api',
};

const browserExecuteUrl = (spec: Specification): string | null => {
  const kind = BROWSER_EXECUTE_KIND[spec.type];
  if (!kind || !spec.id) return null;
  return `/api/functions/${kind}/${encodeURIComponent(spec.id)}/execute`;
};

const loadSpecs = async (paths: string[]): Promise<Specification[]> => {
  const libPath = getPolyLibPath(DEFAULT_POLY_PATH);
  let specs = getCachedSpecs(libPath);
  if (paths.some((resourcePath) => !pathIsResolved(specs, resourcePath))) {
    specs = await getSpecs();
    writeCachedSpecs(libPath, specs);
  }
  return specs;
};

const localAlias = (polyPath: string, kind: 'value' | 'namespace') => {
  const safe = polyPath.replace(/[^A-Za-z0-9_]/g, '_');
  const base = kind === 'namespace' ? `__polyNs_${safe}` : `__poly_${safe}`;
  return /^[A-Za-z_]/.test(base) ? base : `_${base}`;
};

const preferNamespace = (node: ts.Node) => {
  let current = node;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isAwaitExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent))
  ) {
    current = current.parent;
  }
  const parent = current.parent;
  return (
    !!parent &&
    ts.isVariableDeclaration(parent) &&
    ts.isObjectBindingPattern(parent.name)
  );
};

const memberExpression = (namespace: string, member: string): ts.Expression => {
  let expr: ts.Expression = ts.factory.createIdentifier(namespace);
  for (const part of member.split('.').filter(Boolean)) {
    expr = ts.factory.createPropertyAccessExpression(
      expr,
      ts.factory.createIdentifier(part),
    );
  }
  return expr;
};

const identifierIsImportBinding = (node: ts.Identifier) => {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportClause(parent) && parent.name === node) return true;
  if (ts.isNamespaceImport(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && parent.name === node) return true;
  return false;
};

const dropUnusedPolyImports = (
  sourceFile: ts.SourceFile,
  locals: Set<string>,
): ts.SourceFile => {
  const used = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      locals.has(node.text) &&
      !identifierIsImportBinding(node)
    ) {
      used.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const statements = sourceFile.statements.flatMap((stmt) => {
    if (
      !ts.isImportDeclaration(stmt) ||
      !ts.isStringLiteral(stmt.moduleSpecifier) ||
      stmt.moduleSpecifier.text !== POLY_PACKAGE ||
      !stmt.importClause
    ) {
      return [stmt];
    }
    const clause = stmt.importClause;
    const defaultName =
      clause.name && !used.has(clause.name.text) ? undefined : clause.name;
    let named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named) && !used.has(named.name.text)) {
      named = undefined;
    }
    if (named && ts.isNamedImports(named)) {
      const elements = named.elements.filter(
        (element) => element.isTypeOnly || used.has(element.name.text),
      );
      named = elements.length
        ? ts.factory.updateNamedImports(named, elements)
        : undefined;
    }
    if (!defaultName && !named) return [];
    return [
      ts.factory.updateImportDeclaration(
        stmt,
        stmt.modifiers,
        ts.factory.updateImportClause(
          clause,
          clause.isTypeOnly,
          defaultName,
          named,
        ),
        stmt.moduleSpecifier,
        stmt.assertClause,
      ),
    ];
  });

  return ts.factory.updateSourceFile(sourceFile, statements);
};

const rewriteComponents = (
  sourceFile: ts.SourceFile,
  bindings: Map<string, string>,
  specs: Specification[],
): { sourceFile: ts.SourceFile; imports: string[]; clientCalls: ClientCall[] } => {
  const ensured = new Map<string, { value?: string; namespace?: string }>();
  const importPaths = new Set<string>();
  const clientCalls: ClientCall[] = [];
  const seenClientCalls = new Set<string>();

  const noteClientCall = (node: ts.Expression) => {
    if (!isOuterChain(node)) return;
    const parts = chainParts(node);
    if (!parts || parts.length < 2) return;
    const local = parts[0];
    const prefix = bindings.get(local);
    if (prefix === undefined) return;
    const resource = resourcePathFor(parts, bindings);
    if (!resource || resource.includes('*') || matchComponent(specs, resource)) {
      return;
    }
    const spec = exactSpec(specs, resource);
    const url = spec ? browserExecuteUrl(spec) : null;
    if (!spec || !url) return;
    const relativePath = prefix ? resource.slice(prefix.length + 1) : resource;
    if (!relativePath) return;
    const key = `${local}\0${relativePath}`;
    if (seenClientCalls.has(key)) return;
    seenClientCalls.add(key);
    clientCalls.push({
      local,
      relativePath,
      url,
      argNames: argumentNames(spec),
    });
  };

  const ensure = (polyPath: string, kind: 'value' | 'namespace') => {
    importPaths.add(polyPath);
    let slot = ensured.get(polyPath);
    if (!slot) {
      slot = {};
      ensured.set(polyPath, slot);
    }
    if (kind === 'value') {
      if (!slot.value) slot.value = localAlias(polyPath, 'value');
      return slot.value;
    }
    if (!slot.namespace) slot.namespace = localAlias(polyPath, 'namespace');
    return slot.namespace;
  };

  const replacementFor = (node: ts.Expression): ts.Expression | undefined => {
    if (!isOuterChain(node)) return undefined;
    const parts = chainParts(node);
    if (!parts) return undefined;
    const resource = resourcePathFor(parts, bindings);
    if (!resource || resource.includes('*')) return undefined;
    const match = matchComponent(specs, resource);
    if (!match) return undefined;
    if (match.member || preferNamespace(node)) {
      return memberExpression(
        ensure(match.polyPath, 'namespace'),
        match.member,
      );
    }
    return ts.factory.createIdentifier(ensure(match.polyPath, 'value'));
  };

  const result = ts.transform(sourceFile, [
    (context) => (file) => {
      const visitor = (node: ts.Node): ts.Node => {
        if (
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)
        ) {
          const replaced = replacementFor(node);
          if (replaced) return replaced;
          noteClientCall(node);
        }
        return ts.visitEachChild(node, visitor, context);
      };
      return ts.visitEachChild(file, visitor, context);
    },
  ]);
  const transformed = result.transformed[0] as ts.SourceFile;
  result.dispose();

  const imports = [...ensured.entries()].flatMap(([polyPath, slot]) => {
    const lines: ts.Statement[] = [];
    const specifier = ts.factory.createStringLiteral(`poly:${polyPath}`);
    if (slot.value) {
      const exportName = polyPath.split('.').pop() || polyPath;
      lines.push(
        ts.factory.createImportDeclaration(
          undefined,
          ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamedImports([
              ts.factory.createImportSpecifier(
                false,
                ts.factory.createIdentifier(exportName),
                ts.factory.createIdentifier(slot.value),
              ),
            ]),
          ),
          specifier,
        ),
      );
    }
    if (slot.namespace) {
      lines.push(
        ts.factory.createImportDeclaration(
          undefined,
          ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamespaceImport(
              ts.factory.createIdentifier(slot.namespace),
            ),
          ),
          specifier,
        ),
      );
    }
    return lines;
  });

  const cleaned = dropUnusedPolyImports(transformed, new Set(bindings.keys()));
  const withImports = ts.factory.updateSourceFile(cleaned, [
    ...imports,
    ...cleaned.statements,
  ]);
  return {
    sourceFile: withImports,
    imports: [...importPaths],
    clientCalls,
  };
};

type ClientNode = { call?: ClientCall; children: Map<string, ClientNode> };

const clientTree = (calls: ClientCall[]): Map<string, ClientNode> => {
  const root = new Map<string, ClientNode>();
  for (const call of calls) {
    const parts = call.relativePath.split('.').filter(Boolean);
    let level = root;
    parts.forEach((part, index) => {
      let node = level.get(part);
      if (!node) {
        node = { children: new Map() };
        level.set(part, node);
      }
      if (index === parts.length - 1) node.call = call;
      level = node.children;
    });
  }
  return root;
};

const emitClientTree = (tree: Map<string, ClientNode>): string => {
  const fields = [...tree.entries()].map(([key, node]) => {
    const child = node.children.size ? emitClientTree(node.children) : '';
    const invoke = node.call
      ? `(...args) => __polyBrowserExecute(${JSON.stringify(node.call.url)}, ${JSON.stringify(node.call.argNames)}, args)`
      : '';
    const value =
      invoke && child
        ? `Object.assign(${invoke}, ${child})`
        : invoke || child || '{}';
    return `${JSON.stringify(key)}: ${value}`;
  });
  return `{ ${fields.join(', ')} }`;
};

const BROWSER_EXECUTE_HELPER = `const __polyBrowserExecute = (url, keys, args) => {
  const body = {};
  for (let index = 0; index < keys.length; index++) body[keys[index]] = args[index];
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-poly-session": "1" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const message = data && data.message ? data.message : text;
      throw new Error(Array.isArray(message) ? message.join(", ") : String(message || res.status));
    }
    return data;
  });
};`;

const isPropertyName = (node: ts.Identifier) =>
  !!node.parent &&
  ts.isPropertyAccessExpression(node.parent) &&
  node.parent.name === node;

const chainRoot = (node: ts.Node): ts.Node => {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      ts.isSatisfiesExpression(parent)
    ) {
      current = parent;
      continue;
    }
    break;
  }
  return current;
};

const bindingIsOnlyClientCalls = (
  sourceFile: ts.SourceFile,
  local: string,
  calls: ClientCall[],
): boolean => {
  const relatives = new Set(calls.map((call) => call.relativePath));
  let seen = false;
  let ok = true;
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      node.text === local &&
      !identifierIsImportBinding(node) &&
      !isPropertyName(node)
    ) {
      seen = true;
      const parts = chainParts(chainRoot(node) as ts.Expression);
      const relative = parts && parts[0] === local ? parts.slice(1).join('.') : '';
      if (!relative || !relatives.has(relative)) ok = false;
    }
    if (ok) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return seen && ok;
};

const keptPolyImport = (
  stmt: ts.ImportDeclaration,
  replaceable: Set<string>,
): string | null => {
  if (
    !ts.isStringLiteral(stmt.moduleSpecifier) ||
    stmt.moduleSpecifier.text !== POLY_PACKAGE ||
    !stmt.importClause
  ) {
    return null;
  }
  const clause = stmt.importClause;
  const pieces: string[] = [];
  if (clause.name && !replaceable.has(clause.name.text)) {
    pieces.push(clause.name.text);
  }
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named) && !replaceable.has(named.name.text)) {
    pieces.push(`* as ${named.name.text}`);
  }
  if (named && ts.isNamedImports(named)) {
    const elements = named.elements.filter(
      (element) => !replaceable.has(element.name.text),
    );
    if (elements.length) {
      pieces.push(
        `{ ${elements
          .map((element) =>
            element.propertyName
              ? `${element.propertyName.text} as ${element.name.text}`
              : element.name.text,
          )
          .join(', ')} }`,
      );
    }
  }
  if (!pieces.length) return '';
  return `import ${pieces.join(', ')} from ${JSON.stringify(POLY_PACKAGE)};`;
};

const injectBrowserPolyClient = (
  source: string,
  fileName: string,
  clientCalls: ClientCall[],
): string => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(fileName),
  );
  const byLocal = new Map<string, ClientCall[]>();
  for (const call of clientCalls) {
    const list = byLocal.get(call.local) || [];
    list.push(call);
    byLocal.set(call.local, list);
  }
  const replaceable = new Set(
    [...byLocal.entries()]
      .filter(([local, calls]) =>
        bindingIsOnlyClientCalls(sourceFile, local, calls),
      )
      .map(([local]) => local),
  );
  if (!replaceable.size) return source;

  const clientSource = [
    BROWSER_EXECUTE_HELPER,
    ...[...replaceable].map(
      (local) =>
        `const ${local} = ${emitClientTree(clientTree(byLocal.get(local) || []))};`,
    ),
  ].join('\n');

  const pieces: string[] = [];
  let inserted = false;
  const pushClient = () => {
    if (inserted) return;
    pieces.push(clientSource);
    inserted = true;
  };

  for (const stmt of sourceFile.statements) {
    const isImport =
      ts.isImportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt);
    if (!isImport) pushClient();
    if (ts.isImportDeclaration(stmt)) {
      const kept = keptPolyImport(stmt, replaceable);
      if (kept === '') continue;
      if (kept) {
        pieces.push(kept);
        continue;
      }
    }
    pieces.push(stmt.getText(sourceFile));
  }
  pushClient();
  return pieces.join('\n');
};

export const resolvePolyComponentImports = async (
  source: string,
  fileName: string,
): Promise<{ source: string; imports: string[] }> => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(fileName),
  );
  const bindings = collectBindings(sourceFile);
  if (!bindings.size) return { source, imports: [] };

  const paths = collectResourcePaths(sourceFile, bindings);
  const specs = paths.length ? await loadSpecs(paths) : [];
  const rewritten = rewriteComponents(sourceFile, bindings, specs);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const unresolved = printer.printFile(rewritten.sourceFile);
  await getDependencies(unresolved, fileName, getTSBaseUrl(), false);
  if (!rewritten.clientCalls.length) {
    return { source: unresolved, imports: rewritten.imports };
  }
  return {
    source: injectBrowserPolyClient(
      unresolved,
      fileName,
      rewritten.clientCalls,
    ),
    imports: rewritten.imports,
  };
};
