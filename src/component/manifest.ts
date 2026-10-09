import fs from 'fs';
import path from 'path';
import {
  COMPONENTS_MANIFEST_RELATIVE,
  ComponentManifest,
  splitPolyPath,
  toPolyPath,
} from './types';

export const getManifestPath = (projectRoot: string) =>
  path.join(projectRoot, COMPONENTS_MANIFEST_RELATIVE);

export const loadManifest = (projectRoot: string): ComponentManifest => {
  const manifestPath = getManifestPath(projectRoot);
  if (!fs.existsSync(manifestPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ComponentManifest;
  } catch {
    throw new Error(`Failed to parse component manifest at ${manifestPath}`);
  }
};

export const saveManifest = (
  projectRoot: string,
  manifest: ComponentManifest,
) => {
  const manifestPath = getManifestPath(projectRoot);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
};

export const cloneManifest = (manifest: ComponentManifest): ComponentManifest =>
  JSON.parse(JSON.stringify(manifest)) as ComponentManifest;

export const resolveExistingPath = (filePath: string) =>
  fs.realpathSync(path.resolve(filePath));

export const posixRel = (from: string, to: string) => {
  const fromReal = fs.existsSync(from)
    ? fs.realpathSync(from)
    : path.resolve(from);
  const toReal = fs.existsSync(to) ? fs.realpathSync(to) : path.resolve(to);
  return path.relative(fromReal, toReal).split(path.sep).join('/');
};

export const resolveManifestFile = (projectRoot: string, file: string) =>
  path.resolve(projectRoot, file);

export const findPolyPathByFile = (
  manifest: ComponentManifest,
  projectRoot: string,
  absFile: string,
): string | undefined => {
  const normalized = fs.existsSync(absFile)
    ? resolveExistingPath(absFile)
    : path.normalize(path.resolve(absFile));
  for (const [polyPath, entry] of Object.entries(manifest)) {
    const entryAbs = resolveManifestFile(projectRoot, entry.file);
    const entryNorm = fs.existsSync(entryAbs)
      ? resolveExistingPath(entryAbs)
      : path.normalize(entryAbs);
    if (entryNorm === normalized) {
      return polyPath;
    }
  }
  return undefined;
};

export const assignPolyPath = (
  absFile: string,
  projectRoot: string,
  defaultContext: string,
  manifest: ComponentManifest,
) => {
  const existing = findPolyPathByFile(manifest, projectRoot, absFile);
  if (existing) {
    return { ...splitPolyPath(existing), polyPath: existing };
  }

  const baseName = path
    .basename(absFile)
    .replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/i, '');
  let context = defaultContext;
  let name = baseName;
  let polyPath = toPolyPath(context, name);

  if (manifest[polyPath]) {
    const parentDir = path.basename(path.dirname(absFile));
    context = defaultContext ? `${defaultContext}.${parentDir}` : parentDir;
    name = baseName;
    polyPath = toPolyPath(context, name);
  }

  return { context, name, polyPath };
};

export const findAncestorRoots = (
  polyPath: string,
  manifest: ComponentManifest,
): string[] => {
  const reverse = new Map<string, string[]>();
  for (const [parent, entry] of Object.entries(manifest)) {
    for (const child of entry.imports || []) {
      const list = reverse.get(child) || [];
      list.push(parent);
      reverse.set(child, list);
    }
  }

  const roots: string[] = [];
  const seen = new Set<string>();
  const queue = [...(reverse.get(polyPath) || [])];
  while (queue.length) {
    const parent = queue.shift()!;
    if (seen.has(parent)) continue;
    seen.add(parent);
    const entry = manifest[parent];
    if (!entry) continue;
    if (entry.kind === 'root') roots.push(parent);
    queue.push(...(reverse.get(parent) || []));
  }
  return roots;
};

export const findRootsInContext = (
  context: string,
  manifest: ComponentManifest,
  excludePolyPath?: string,
): string[] =>
  Object.entries(manifest)
    .filter(([polyPath, entry]) => {
      if (entry.kind !== 'root') return false;
      if (excludePolyPath && polyPath === excludePolyPath) return false;
      if (!context) return true;
      return polyPath === context || polyPath.startsWith(`${context}.`);
    })
    .map(([polyPath]) => polyPath);
