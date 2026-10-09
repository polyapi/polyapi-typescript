import fs from 'fs';
import path from 'path';
import { ComponentKind } from '../types';
import { compileComponentFile } from './compile';
import {
  cloneManifest,
  findPolyPathByFile,
  loadManifest,
  posixRel,
  resolveExistingPath,
} from './manifest';
import { ComponentManifest, toPolyPath } from './types';

export type CompiledComponentNode = {
  polyPath: string;
  context: string;
  name: string;
  kind: ComponentKind;
  absFile: string;
  relFile: string;
  sourceCode: string;
  code: string;
  imports: string[];
  npmSpecifiers: string[];
};

export type CompileComponentGraphOptions = {
  context: string;
  name: string;
  file: string;
  isRoot?: boolean;
  projectRoot?: string;
  npmResolveDir?: string;
};

export type CompiledComponentGraph = {
  projectRoot: string;
  npmResolveDir: string;
  startPolyPath: string;
  kind: ComponentKind;
  originalManifest: ComponentManifest;
  manifest: ComponentManifest;
  nodes: CompiledComponentNode[];
};

const resolveGraphPaths = (options: CompileComponentGraphOptions) => {
  const projectRoot = resolveExistingPath(options.projectRoot ?? process.cwd());
  const npmResolveDir = resolveExistingPath(
    options.npmResolveDir ?? projectRoot,
  );
  const absFile = resolveExistingPath(path.resolve(projectRoot, options.file));
  if (!fs.existsSync(absFile) || !fs.statSync(absFile).isFile()) {
    throw new Error(`Component file not found: ${options.file}`);
  }
  return { projectRoot, npmResolveDir, absFile };
};

export const compileComponentGraph = async (
  options: CompileComponentGraphOptions,
): Promise<CompiledComponentGraph> => {
  const { projectRoot, npmResolveDir, absFile } = resolveGraphPaths(options);
  const originalManifest = loadManifest(projectRoot);
  const manifest = cloneManifest(originalManifest);
  const startPolyPath = toPolyPath(options.context, options.name);
  const existing = manifest[startPolyPath];
  const kind: ComponentKind =
    options.isRoot || existing?.kind === 'root' ? 'root' : 'leaf';

  const nodes = await compileGraphs(
    [
      {
        absFile,
        context: options.context,
        name: options.name,
        kind,
      },
    ],
    {
      projectRoot,
      npmResolveDir,
      originalManifest,
      manifest,
      walkChildrenFromLeaves: kind === 'root',
    },
  );

  return {
    projectRoot,
    npmResolveDir,
    startPolyPath,
    kind,
    originalManifest,
    manifest,
    nodes: [...nodes.values()],
  };
};

export type GraphStart = {
  absFile: string;
  context: string;
  name: string;
  kind: ComponentKind;
};

export const compileGraphs = async (
  starts: GraphStart[],
  options: {
    projectRoot: string;
    npmResolveDir: string;
    originalManifest: ComponentManifest;
    manifest: ComponentManifest;
    walkChildrenFromLeaves: boolean;
  },
): Promise<Map<string, CompiledComponentNode>> => {
  const nodes = new Map<string, CompiledComponentNode>();
  const queue = [...starts];

  while (queue.length) {
    const item = queue.shift()!;
    const itemAbs = resolveExistingPath(item.absFile);
    if (nodes.has(itemAbs)) continue;

    const compiled = await compileComponentFile(itemAbs, {
      projectRoot: options.projectRoot,
      npmResolveDir: options.npmResolveDir,
      defaultContext: item.context,
      manifest: options.manifest,
    });

    const polyPath = toPolyPath(item.context, item.name);
    const relFile = posixRel(options.projectRoot, itemAbs);
    nodes.set(itemAbs, {
      polyPath,
      context: item.context,
      name: item.name,
      kind: item.kind,
      absFile: itemAbs,
      relFile,
      sourceCode: compiled.sourceCode,
      code: compiled.code,
      imports: compiled.imports,
      npmSpecifiers: compiled.npmSpecifiers,
    });

    options.manifest[polyPath] = {
      ...options.manifest[polyPath],
      file: relFile,
      kind: item.kind,
      imports: compiled.imports,
    };

    for (const child of compiled.localFiles) {
      const childAbs = resolveExistingPath(child.absFile);
      if (nodes.has(childAbs)) continue;
      const knownBefore = !!findPolyPathByFile(
        options.originalManifest,
        options.projectRoot,
        childAbs,
      );
      if (!options.walkChildrenFromLeaves && knownBefore) continue;
      queue.push({
        absFile: childAbs,
        context: child.context,
        name: child.name,
        kind: 'leaf',
      });
    }
  }

  return nodes;
};

export const topoLeavesFirst = (
  nodes: CompiledComponentNode[],
): CompiledComponentNode[] => {
  const byPath = new Map(nodes.map((node) => [node.polyPath, node]));
  const remaining = new Set(byPath.keys());
  const ordered: CompiledComponentNode[] = [];

  while (remaining.size) {
    const ready = [...remaining].filter((polyPath) => {
      const node = byPath.get(polyPath)!;
      return node.imports.every((child) => !remaining.has(child));
    });
    const batch = ready.length ? ready : [...remaining];
    for (const polyPath of batch) {
      remaining.delete(polyPath);
      ordered.push(byPath.get(polyPath)!);
    }
  }
  return ordered;
};
