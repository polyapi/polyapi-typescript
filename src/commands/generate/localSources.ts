import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'path';
import shell from 'shelljs';
import ts from 'typescript';

import { parseDeployComment } from '../../transpiler';
import { Specification } from '../../types';

export type LocalSourceKind = 'server-function' | 'client-function';

export type LocalSymbolSpan = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type LocalSourceEntry = {
  key: string;
  context: string;
  name: string;
  kind: LocalSourceKind;
  /** Repo-relative path with forward slashes. */
  relativePath: string;
  absolutePath: string;
  /**
   * Ids from polyConfig and deploy receipts.
   * Empty means a name-only link is allowed.
   */
  ids: string[];
  symbol: LocalSymbolSpan;
};

export type LocalSourceIndex = Map<string, LocalSourceEntry[]>;

export type LocalSourceDiscovery = {
  index: LocalSourceIndex;
  repoRoot: string;
};

export type LocalLinkStats = {
  linked: number;
  total: number;
  indexError?: string;
};

export type LinkableSpec = Pick<Specification, 'id' | 'type' | 'context' | 'name'>;

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'output',
  'coverage',
  '.git',
  '.vscode',
  '.poly',
  '.github',
  '.husky',
  '.yarn',
]);

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const EMPTY_SPAN: LocalSymbolSpan = {
  startLine: 0,
  startColumn: 0,
  endLine: 0,
  endColumn: 0,
};

type PolyConfigHit = {
  context: string;
  name: string;
  kind: LocalSourceKind;
  id?: string;
};

type ReceiptHit = {
  key: string;
  context: string;
  name: string;
  kind: LocalSourceKind;
  id: string;
};

type MappingPoint = {
  generatedLine: number;
  generatedColumn: number;
  sourceIndex?: number;
  sourceLine?: number;
  sourceColumn?: number;
};

type NavigableMember = {
  name: string;
  isMethod: boolean;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export const localSourceKey = (context: string, name: string): string =>
  [context.trim(), name.trim()].filter(Boolean).join('.');

export const countLinkableFunctions = (specs: Specification[]): number =>
  specs.filter(
    (spec) => spec.type === 'serverFunction' || spec.type === 'customFunction',
  ).length;

export const resolveRepoRoot = (startDir = process.cwd()): string => {
  try {
    const result = shell.exec('git rev-parse --show-toplevel', {
      silent: true,
      cwd: startDir,
    });
    if (result.code === 0) {
      const root = result.toString().trim();
      if (root) return path.resolve(root);
    }
  } catch {
    // Generate still works outside a git checkout.
  }
  return path.resolve(startDir);
};

export const toRepoRelativePath = (
  filePath: string,
  repoRoot: string,
): string | undefined => {
  const absolute = path.resolve(filePath);
  const root = path.resolve(repoRoot);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join('/');
};

const kindForTypeText = (typeText: string): LocalSourceKind | undefined => {
  if (typeText.includes('PolyServerFunction')) return 'server-function';
  if (typeText.includes('PolyClientFunction')) return 'client-function';
  return undefined;
};

const scriptKindFor = (filePath: string): ts.ScriptKind => {
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

const readStringProperty = (
  initializer: ts.Expression,
): string | undefined => {
  if (
    ts.isStringLiteral(initializer)
    || ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    return initializer.text;
  }
  return undefined;
};

const unwrapExpression = (expression: ts.Expression): {
  expression: ts.Expression;
  typeNode?: ts.TypeNode;
} => {
  let current = expression;
  let typeNode: ts.TypeNode | undefined;
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (
      ts.isSatisfiesExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
    ) {
      typeNode = typeNode || current.type;
      current = current.expression;
      continue;
    }
    return { expression: current, typeNode };
  }
};

const jsDocKind = (
  statement: ts.Node,
): LocalSourceKind | undefined => {
  const tags = ts.getJSDocTags(statement);
  for (const tag of tags) {
    if (tag.tagName.text !== 'type') continue;
    const kind = kindForTypeText(tag.getText());
    if (kind) return kind;
  }
  return undefined;
};

const readPolyConfigs = (sourceFile: ts.SourceFile): PolyConfigHit[] => {
  const configs: PolyConfigHit[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name)
          || declaration.name.text !== 'polyConfig'
          || !declaration.initializer
        ) {
          continue;
        }
        const unwrapped = unwrapExpression(declaration.initializer);
        const kind = kindForTypeText(declaration.type?.getText(sourceFile) || '')
          || (unwrapped.typeNode
            ? kindForTypeText(unwrapped.typeNode.getText(sourceFile))
            : undefined)
          || jsDocKind(node);
        if (!kind || !ts.isObjectLiteralExpression(unwrapped.expression)) {
          continue;
        }
        const fields: { name?: string; context?: string; id?: string } = {};
        for (const property of unwrapped.expression.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const propertyName = property.name
            && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            ? property.name.text
            : undefined;
          if (propertyName !== 'name' && propertyName !== 'context' && propertyName !== 'id') {
            continue;
          }
          const value = readStringProperty(property.initializer);
          if (value !== undefined) fields[propertyName] = value.trim();
        }
        if (!fields.name || !fields.context) continue;
        configs.push({
          name: fields.name,
          context: fields.context,
          kind,
          id: fields.id || undefined,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return configs;
};

const FUNCTION_ADD_VALUE_FLAGS = new Set([
  'context',
  'description',
  'logs',
  'generateContexts',
  'generate-contexts',
  'execution-api-key',
  'image',
  'visibility',
]);

const tokenizeCommand = (command: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let quote = '';
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
};

// `poly function add` comments are how local files are registered with the SDK.
// An import from 'polyapi' does not record context or name.
const readFunctionAddComment = (line: string): Omit<ReceiptHit, 'id'> | undefined => {
  const stripped = line.trim().replace(/^(?:\/\/|\*)\s*/, '');
  if (!stripped.includes('function add')) return undefined;
  const tokens = tokenizeCommand(stripped);
  const addIndex = tokens.findIndex(
    (token, index) => token === 'add' && tokens[index - 1] === 'function',
  );
  if (addIndex < 0) return undefined;

  let context = '';
  let server = false;
  let client = false;
  const positionals: string[] = [];
  const rest = tokens.slice(addIndex + 1);
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      if (!token.startsWith('-')) positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const equalsAt = body.indexOf('=');
    const flag = equalsAt >= 0 ? body.slice(0, equalsAt) : body;
    const inline = equalsAt >= 0 ? body.slice(equalsAt + 1) : undefined;
    if (flag === 'server') {
      server = inline !== 'false';
      continue;
    }
    if (flag === 'client') {
      client = inline !== 'false';
      continue;
    }
    if (!FUNCTION_ADD_VALUE_FLAGS.has(flag)) continue;
    const value = inline ?? (rest[index + 1]?.startsWith('-') ? undefined : rest[index + 1]);
    if (inline === undefined && value !== undefined) index += 1;
    if (flag === 'context' && value) context = value;
  }

  const name = positionals[0];
  if (!name || !context || server === client) return undefined;
  return {
    key: localSourceKey(context, name),
    context,
    name,
    kind: server ? 'server-function' : 'client-function',
  };
};

const readFunctionAddComments = (contents: string): Array<Omit<ReceiptHit, 'id'>> =>
  contents.split(/\r?\n/).flatMap((line) => {
    const parsed = readFunctionAddComment(line);
    return parsed ? [parsed] : [];
  });

const readReceipts = (contents: string): ReceiptHit[] => {
  const receipts: ReceiptHit[] = [];
  for (const line of contents.split(/\r?\n/)) {
    const deployment = parseDeployComment(line.trim());
    if (!deployment?.id) continue;
    if (
      deployment.type !== 'server-function'
      && deployment.type !== 'client-function'
    ) {
      continue;
    }
    receipts.push({
      key: localSourceKey(deployment.context, deployment.name),
      context: deployment.context,
      name: deployment.name,
      kind: deployment.type,
      id: deployment.id,
    });
  }
  return receipts;
};

const spanOfNode = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
): LocalSymbolSpan => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line,
    startColumn: start.character,
    endLine: end.line,
    endColumn: end.character,
  };
};

const findLocalSymbolSpan = (
  sourceFile: ts.SourceFile,
  functionName: string,
): LocalSymbolSpan => {
  let best: { priority: number; nameNode: ts.Node } | undefined;
  const consider = (priority: number, nameNode: ts.Node | undefined) => {
    if (!nameNode || !ts.isIdentifier(nameNode) || nameNode.text !== functionName) {
      return;
    }
    if (!best || priority < best.priority) best = { priority, nameNode };
  };
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)) consider(1, node.name);
    else if (ts.isVariableDeclaration(node)) consider(2, node.name);
    else if (ts.isMethodDeclaration(node)) consider(3, ts.isIdentifier(node.name) ? node.name : undefined);
    else if (ts.isFunctionExpression(node)) consider(4, node.name);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return best ? spanOfNode(sourceFile, best.nameNode) : EMPTY_SPAN;
};

const addIds = (ids: Set<string>, id: string | undefined) => {
  const trimmed = id?.trim();
  if (trimmed) ids.add(trimmed);
};

export const parseLocalSourceFile = (
  filePath: string,
  contents: string,
  repoRoot: string,
): LocalSourceEntry[] => {
  const relativePath = toRepoRelativePath(filePath, repoRoot);
  if (!relativePath) return [];
  if (
    !contents.includes('polyConfig')
    && !contents.includes('Poly deployed @')
    && !contents.includes('function add')
  ) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const receipts = readReceipts(contents);
  const configs = readPolyConfigs(sourceFile);
  const functionAdds = readFunctionAddComments(contents);
  const absolutePath = path.resolve(filePath);
  const idsFor = (key: string, kind: LocalSourceKind, configId?: string): string[] => {
    const ids = new Set<string>();
    addIds(ids, configId);
    for (const receipt of receipts) {
      if (receipt.key === key && receipt.kind === kind) addIds(ids, receipt.id);
    }
    return [...ids];
  };
  const entries: LocalSourceEntry[] = configs.map((config) => {
    const key = localSourceKey(config.context, config.name);
    return {
      key,
      context: config.context,
      name: config.name,
      kind: config.kind,
      relativePath,
      absolutePath,
      ids: idsFor(key, config.kind, config.id),
      symbol: findLocalSymbolSpan(sourceFile, config.name),
    };
  });

  for (const added of functionAdds) {
    if (entries.some((entry) => entry.key === added.key && entry.kind === added.kind)) {
      continue;
    }
    entries.push({
      ...added,
      relativePath,
      absolutePath,
      ids: idsFor(added.key, added.kind),
      symbol: findLocalSymbolSpan(sourceFile, added.name),
    });
  }

  if (entries.length) return entries;

  const grouped = new Map<string, LocalSourceEntry>();
  for (const receipt of receipts) {
    const groupKey = `${receipt.kind}\0${receipt.key}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      if (!existing.ids.includes(receipt.id)) existing.ids.push(receipt.id);
      continue;
    }
    grouped.set(groupKey, {
      key: receipt.key,
      context: receipt.context,
      name: receipt.name,
      kind: receipt.kind,
      relativePath,
      absolutePath,
      ids: [receipt.id],
      symbol: findLocalSymbolSpan(sourceFile, receipt.name),
    });
  }
  return [...grouped.values()];
};

const listSourceFiles = async (repoRoot: string): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      let isFile = entry.isFile();
      if (!isFile && entry.isSymbolicLink()) {
        try {
          isFile = (await stat(fullPath)).isFile();
        } catch {
          isFile = false;
        }
      }
      if (
        !isFile
        || entry.name.endsWith('.d.ts')
        || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        continue;
      }
      files.push(fullPath);
    }
  };
  await walk(repoRoot);
  return files;
};

export const discoverLocalSources = async (
  repoRoot = resolveRepoRoot(),
): Promise<LocalSourceDiscovery> => {
  const root = path.resolve(repoRoot);
  const index: LocalSourceIndex = new Map();
  if (!existsSync(root)) return { index, repoRoot: root };

  let files: string[] = [];
  try {
    files = await listSourceFiles(root);
  } catch {
    return { index, repoRoot: root };
  }

  for (const file of files) {
    try {
      const fileStat = await stat(file);
      // Skip bundled output. Real function sources are far smaller than this.
      if (fileStat.size > 1_500_000) continue;
      const contents = await readFile(file, 'utf8');
      for (const entry of parseLocalSourceFile(file, contents, root)) {
        const existing = index.get(entry.key);
        if (existing) existing.push(entry);
        else index.set(entry.key, [entry]);
      }
    } catch {
      // One bad file must not fail generate.
    }
  }

  return { index, repoRoot: root };
};

const kindForSpec = (type: string): LocalSourceKind | undefined => {
  if (type === 'serverFunction') return 'server-function';
  if (type === 'customFunction') return 'client-function';
  return undefined;
};

export const selectLocalSource = (
  entries: readonly LocalSourceEntry[] | undefined,
  spec: { id?: string; type: string },
): LocalSourceEntry | undefined => {
  if (!entries?.length) return undefined;
  const kind = kindForSpec(spec.type);
  if (!kind) return undefined;
  const typed = entries.filter((entry) => entry.kind === kind);
  if (!typed.length) return undefined;

  const specId = spec.id?.trim();
  if (specId) {
    const idMatches = typed.filter((entry) => entry.ids.includes(specId));
    if (idMatches.length === 1) return idMatches[0];
    if (idMatches.length > 1) return undefined;
    if (typed.some((entry) => entry.ids.length > 0)) return undefined;
    return typed.length === 1 ? typed[0] : undefined;
  }

  if (typed.length === 1 && typed[0].ids.length === 0) return typed[0];
  return undefined;
};

const encodeVlq = (value: number): string => {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
  let encoded = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
};

const encodeMappings = (points: MappingPoint[]): string => {
  const sorted = [...points].sort(
    (left, right) => left.generatedLine - right.generatedLine
      || left.generatedColumn - right.generatedColumn,
  );
  const deduped: MappingPoint[] = [];
  for (const point of sorted) {
    const previous = deduped[deduped.length - 1];
    if (
      previous
      && previous.generatedLine === point.generatedLine
      && previous.generatedColumn === point.generatedColumn
    ) {
      if (point.sourceIndex !== undefined) deduped[deduped.length - 1] = point;
      continue;
    }
    deduped.push(point);
  }

  let encoded = '';
  let previousGeneratedLine = 0;
  let previousGeneratedColumn = 0;
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;
  for (const point of deduped) {
    while (previousGeneratedLine < point.generatedLine) {
      encoded += ';';
      previousGeneratedLine += 1;
      previousGeneratedColumn = 0;
    }
    if (encoded.length && !encoded.endsWith(';')) encoded += ',';
    encoded += encodeVlq(point.generatedColumn - previousGeneratedColumn);
    if (
      point.sourceIndex !== undefined
      && point.sourceLine !== undefined
      && point.sourceColumn !== undefined
    ) {
      encoded += encodeVlq(point.sourceIndex - previousSourceIndex);
      encoded += encodeVlq(point.sourceLine - previousSourceLine);
      encoded += encodeVlq(point.sourceColumn - previousSourceColumn);
      previousSourceIndex = point.sourceIndex;
      previousSourceLine = point.sourceLine;
      previousSourceColumn = point.sourceColumn;
    }
    previousGeneratedColumn = point.generatedColumn;
  }
  return encoded;
};

const memberName = (
  name: ts.PropertyName | ts.Identifier | ts.StringLiteral | ts.ModuleName,
): { text: string; node: ts.Node } | undefined => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return { text: name.text, node: name };
  }
  return undefined;
};

const collectNavigableMembers = (sourceFile: ts.SourceFile): NavigableMember[] => {
  const members: NavigableMember[] = [];
  const pushName = (name: ts.Node, text: string, isMethod: boolean) => {
    const start = sourceFile.getLineAndCharacterOfPosition(name.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(name.getEnd());
    members.push({
      name: text,
      isMethod,
      startLine: start.line,
      startColumn: start.character,
      endLine: end.line,
      endColumn: end.character,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isMethodSignature(node)) {
      const name = memberName(node.name);
      if (name) pushName(name.node, name.text, true);
    } else if (
      ts.isPropertySignature(node)
      || ts.isInterfaceDeclaration(node)
      || ts.isTypeAliasDeclaration(node)
      || ts.isFunctionDeclaration(node)
      || ts.isEnumDeclaration(node)
    ) {
      if (node.name) {
        const name = memberName(node.name);
        if (name) pushName(name.node, name.text, false);
      }
    } else if (ts.isModuleDeclaration(node) && node.name) {
      const name = memberName(node.name);
      if (name) pushName(name.node, name.text, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return members;
};

const shortSpecName = (name: string): string => name.split('.').pop() || name;

export const planLocalSourceNavigation = (options: {
  dtsText: string;
  dtsPath: string;
  specifications: readonly LinkableSpec[];
  index: LocalSourceIndex;
  repoRoot: string;
}): { dtsText: string; linked: number; map?: { path: string; text: string } } => {
  const normalizedDtsPath = path.normalize(options.dtsPath);
  const sourceFile = ts.createSourceFile(
    normalizedDtsPath,
    options.dtsText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const linkByName = new Map<string, LocalSourceEntry>();
  for (const spec of options.specifications) {
    const shortName = shortSpecName(spec.name);
    if (linkByName.has(shortName)) continue;
    const entry = selectLocalSource(
      options.index.get(localSourceKey(spec.context || '', spec.name)),
      spec,
    );
    if (entry) linkByName.set(shortName, entry);
  }
  if (!linkByName.size) return { dtsText: options.dtsText, linked: 0 };

  const sources: string[] = [];
  const sourceIndexes = new Map<string, number>();
  const sourceIndexFor = (relativePath: string): number => {
    const existing = sourceIndexes.get(relativePath);
    if (existing !== undefined) return existing;
    const next = sources.length;
    sources.push(relativePath);
    sourceIndexes.set(relativePath, next);
    return next;
  };

  const points: MappingPoint[] = [];
  const linkedNames = new Set<string>();
  for (const member of collectNavigableMembers(sourceFile)) {
    const entry = member.isMethod ? linkByName.get(member.name) : undefined;
    if (!entry) {
      // TypeScript's declaration-map consumer uses the next mapping when a
      // position is not exact. Guard every other name so F12 stays on the .d.ts.
      points.push({
        generatedLine: member.startLine,
        generatedColumn: member.startColumn,
      });
      continue;
    }
    const sourceIndex = sourceIndexFor(entry.relativePath);
    points.push({
      generatedLine: member.startLine,
      generatedColumn: member.startColumn,
      sourceIndex,
      sourceLine: entry.symbol.startLine,
      sourceColumn: entry.symbol.startColumn,
    });
    points.push({
      generatedLine: member.endLine,
      generatedColumn: member.endColumn,
      sourceIndex,
      sourceLine: entry.symbol.endLine,
      sourceColumn: entry.symbol.endColumn,
    });
    linkedNames.add(member.name);
  }

  if (!linkedNames.size) return { dtsText: options.dtsText, linked: 0 };

  const mapDirectory = path.dirname(normalizedDtsPath);
  const relativeToRepo = path.relative(mapDirectory, path.resolve(options.repoRoot));
  // `<poly>/temp` and `<poly>/lib` are the same depth, so this root still
  // resolves after generate renames the temp directory into place.
  const sourceRoot = relativeToRepo && relativeToRepo !== '.'
    ? `${relativeToRepo.split(path.sep).join('/')}/`
    : '';
  const fileName = path.basename(normalizedDtsPath);
  const map = {
    version: 3,
    file: fileName,
    sourceRoot,
    sources,
    names: [] as string[],
    mappings: encodeMappings(points),
  };
  const base = options.dtsText.endsWith('\n') ? options.dtsText : `${options.dtsText}\n`;
  return {
    dtsText: `${base}//# sourceMappingURL=${fileName}.map\n`,
    linked: linkedNames.size,
    map: {
      path: `${normalizedDtsPath}.map`,
      text: `${JSON.stringify(map)}\n`,
    },
  };
};
