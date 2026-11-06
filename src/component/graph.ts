import fs from 'fs';
import path from 'path';
import { ComponentKind } from '../types';
import { compileComponentFile } from './compile';
import {
  cloneManifest,
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

  const compiled = await compileComponentFile(absFile, {
    projectRoot,
    npmResolveDir,
    defaultContext: options.context,
    manifest,
  });
  const relFile = posixRel(projectRoot, absFile);
  manifest[startPolyPath] = {
    ...manifest[startPolyPath],
    file: relFile,
    kind,
    imports: compiled.imports,
  };

  return {
    projectRoot,
    npmResolveDir,
    startPolyPath,
    kind,
    originalManifest,
    manifest,
    nodes: [
      {
        polyPath: startPolyPath,
        context: options.context,
        name: options.name,
        kind,
        absFile,
        relFile,
        sourceCode: compiled.sourceCode,
        code: compiled.code,
        imports: compiled.imports,
        npmSpecifiers: compiled.npmSpecifiers,
      },
    ],
  };
};
