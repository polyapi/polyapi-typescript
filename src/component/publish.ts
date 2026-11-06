import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import shell from 'shelljs';
import {
  createOrUpdateComponentFunction,
  getComponentFunction,
  getPolyVendor,
} from '../api';
import { assertComponentIdentifiers } from './identifiers';
import {
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
import { compileComponentGraph } from './graph';
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
}): Visibility | undefined => {
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
  return options.manifestVisibility;
};

export const visibilityForPublish = (
  chosen: Visibility | undefined,
  existing: Visibility | undefined,
): Visibility => chosen ?? existing ?? Visibility.Environment;

const readFailure = (error: unknown) => {
  const err = error as {
    message?: string;
    response?: { status?: number; data?: { message?: string } };
  };
  const status = err.response?.status;
  const serverMessage = err.response?.data?.message;
  if (status && serverMessage) {
    return `Request failed with status code ${status}: ${serverMessage}`;
  }
  if (status) return `Request failed with status code ${status}.`;
  return err.message || 'Unexpected error.';
};

export const publishComponents = async (
  options: PublishComponentOptions,
): Promise<{
  components: ComponentFunctionDetailsDto[];
}> => {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const npmResolveDir = path.resolve(options.npmResolveDir ?? projectRoot);

  if (
    !fs.existsSync(path.resolve(projectRoot, options.file)) ||
    !fs.statSync(path.resolve(projectRoot, options.file)).isFile()
  ) {
    throw new Error(`Component file not found: ${options.file}`);
  }

  assertComponentIdentifiers([
    { name: options.name, context: options.context, file: options.file },
  ]);

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
  const extraNpm = uniquePreserve(
    extraVendorSpecifiers(
      uniquePreserve(compiledNodes.flatMap((node) => node.npmSpecifiers)),
    ),
  );
  if (extraNpm.length) {
    throw new Error(unsupportedPackageError(extraNpm));
  }

  assertComponentIdentifiers(
    compiledNodes.map((node) => ({
      name: node.name,
      context: node.context,
      file: node.relFile,
    })),
  );
  const visibilities = new Map<string, Visibility>();
  for (const node of compiledNodes) {
    const chosen = resolveComponentVisibility({
      nodePolyPath: node.polyPath,
      startPolyPath,
      publishKind: kind,
      commandVisibility,
      manifestVisibility: originalManifest[node.polyPath]?.visibility,
    });
    if (chosen) {
      visibilities.set(node.polyPath, chosen);
      continue;
    }
    let existing;
    try {
      existing = await getComponentFunction(node.polyPath);
    } catch (error) {
      throw new Error(
        `Could not read the existing visibility for ${node.polyPath}, so it was not published. ${readFailure(error)}`,
      );
    }
    const visibility = visibilityForPublish(undefined, existing?.visibility);
    if (
      existing?.visibility &&
      existing.visibility !== Visibility.Environment
    ) {
      shell.echo(
        `Keeping ${existing.visibility} visibility for ${node.polyPath}.`,
      );
    }
    visibilities.set(node.polyPath, visibility);
  }

  const results: ComponentFunctionDetailsDto[] = [];

  for (const node of compiledNodes) {
    const visibility =
      visibilities.get(node.polyPath) ?? Visibility.Environment;
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

  return { components: results };
};
