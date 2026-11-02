import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import shell from 'shelljs';
import {
  createOrUpdateComponentFunction,
  getPolyVendor,
} from '../api';
import { refreshCanopyV2Applications } from './applications';
import {
  ApplicationDto,
  ComponentFunctionDetailsDto,
  ComponentKind,
  CreateComponentFunctionDto,
  Visibility,
} from '../types';
import { uniquePreserve } from './compile';
import {
  extraVendorSpecifiers,
  reactFamilyMismatchWarnings,
} from './instanceVendor';
import {
  compileComponentGraph,
  topoLeavesFirst,
} from './graph';
import { saveManifest } from './manifest';
import { packageRoot } from './types';

export type PublishComponentOptions = {
  context: string;
  name: string;
  file: string;
  isRoot?: boolean;
  visibility?: Visibility | string;
  projectRoot?: string;
  npmResolveDir?: string;
};

export const unsupportedPackageError = (specifiers: string[]) => {
  const packages = uniquePreserve(specifiers.map(packageRoot)).sort();
  const label = packages.length === 1 ? 'package' : 'packages';
  return `Unsupported ${label} ${packages.join(', ')}. Only poly vendor libraries can be imported.`;
};

const VISIBILITIES = new Set<string>(Object.values(Visibility));

export const normalizeVisibility = (
  value?: Visibility | string,
): Visibility | undefined => {
  if (!value) return undefined;
  const normalized = String(value).toUpperCase();
  if (!VISIBILITIES.has(normalized)) {
    throw new Error(
      'Option `visibility` must be either PUBLIC, TENANT, or ENVIRONMENT. Case insensitive.',
    );
  }
  return normalized as Visibility;
};

export const resolveComponentVisibility = (options: {
  nodePolyPath: string;
  startPolyPath: string;
  publishKind: ComponentKind;
  commandVisibility?: Visibility;
  manifestVisibility?: Visibility;
}): Visibility => {
  const explicit = options.commandVisibility;
  if (explicit && options.publishKind === 'root') {
    return explicit;
  }
  if (
    explicit &&
    options.publishKind === 'leaf' &&
    options.nodePolyPath === options.startPolyPath
  ) {
    return explicit;
  }
  if (options.manifestVisibility) return options.manifestVisibility;
  return Visibility.Environment;
};

export const publishComponents = async (
  options: PublishComponentOptions,
): Promise<{
  components: ComponentFunctionDetailsDto[];
  applications: ApplicationDto[];
}> => {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const npmResolveDir = path.resolve(options.npmResolveDir ?? projectRoot);

  if (
    !fs.existsSync(path.resolve(projectRoot, options.file)) ||
    !fs.statSync(path.resolve(projectRoot, options.file)).isFile()
  ) {
    throw new Error(`Component file not found: ${options.file}`);
  }

  const instanceVendor = await getPolyVendor();
  for (const warning of reactFamilyMismatchWarnings(
    instanceVendor.packages || {},
    npmResolveDir,
  )) {
    shell.echo(chalk.yellow('WARNING:'), warning);
  }

  const graph = await compileComponentGraph({
    context: options.context,
    name: options.name,
    file: options.file,
    isRoot: options.isRoot,
    projectRoot,
    npmResolveDir,
  });
  const {
    startPolyPath,
    kind,
    originalManifest,
    manifest,
    nodes: compiledNodes,
  } = graph;
  const commandVisibility = normalizeVisibility(options.visibility);
  const extraNpm = uniquePreserve(extraVendorSpecifiers(
    uniquePreserve(compiledNodes.flatMap((node) => node.npmSpecifiers)),
  ));
  if (extraNpm.length) {
    throw new Error(unsupportedPackageError(extraNpm));
  }

  const ordered = topoLeavesFirst(compiledNodes);
  const results: ComponentFunctionDetailsDto[] = [];

  for (const node of ordered) {
    const visibility = resolveComponentVisibility({
      nodePolyPath: node.polyPath,
      startPolyPath,
      publishKind: kind,
      commandVisibility,
      manifestVisibility: originalManifest[node.polyPath]?.visibility,
    });
    const body: CreateComponentFunctionDto = {
      name: node.name,
      context: node.context,
      kind: node.kind,
      sourceCode: node.sourceCode,
      code: node.code,
      imports: node.imports,
      visibility,
    };
    if (node.kind === 'root') {
      body.vendorCode = null;
    }

    const saved = await createOrUpdateComponentFunction(body);
    results.push({ ...saved, kind: node.kind });

    manifest[node.polyPath] = {
      file: node.relFile,
      kind: node.kind,
      imports: node.imports,
      visibility,
    };
    saveManifest(graph.projectRoot, manifest);
  }

  const applications = await refreshCanopyV2Applications(
    ordered.map((node) => node.polyPath),
    manifest,
  );

  return { components: results, applications };
};
