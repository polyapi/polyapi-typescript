import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import shell from 'shelljs';
import {
  createCanopyV2Upload,
  createOrUpdateComponentFunction,
  getPolyVendor,
  putCanopyV2Upload,
} from '../api';
import { refreshCanopyV2Applications } from './applications';
import {
  ApplicationDto,
  ComponentFunctionDetailsDto,
  ComponentKind,
  CreateComponentFunctionDto,
  Visibility,
} from '../types';
import {
  bundleVendor,
  resolveExternalDependencies,
  uniquePreserve,
} from './compile';
import {
  extraVendorSpecifiers,
  instanceVendorPackageRoots,
  reactFamilyMismatchWarnings,
} from './instanceVendor';
import {
  compileComponentGraph,
  topoLeavesFirst,
} from './graph';
import {
  findAncestorRoots,
  findRootsInContext,
  saveManifest,
} from './manifest';
import { ComponentManifest, packageRoot } from './types';

export type PublishComponentOptions = {
  context: string;
  name: string;
  file: string;
  isRoot?: boolean;
  visibility?: Visibility | string;
  projectRoot?: string;
  npmResolveDir?: string;
};

const allowedVendorPackages = (
  ancestorRoots: string[],
  manifest: ComponentManifest,
  instancePackages: Record<string, string>,
): Set<string> => {
  const allowed = instanceVendorPackageRoots(instancePackages);
  for (const rootPath of ancestorRoots) {
    const deps = manifest[rootPath]?.externalDependencies || {};
    for (const pkg of Object.keys(deps)) {
      allowed.add(pkg);
    }
  }
  return allowed;
};

export const newVendorImportError = (pkg: string, rootPath?: string) => {
  if (rootPath) {
    return `new vendor import ${pkg}; re-publish the root \`${rootPath}\`.`;
  }
  return `new vendor import ${pkg}; re-publish the root.`;
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

  let vendorHash: string | undefined;
  let externalDependencies: Record<string, string> | undefined;

  if (kind === 'root') {
    if (extraNpm.length) {
      const bundled = await bundleVendor(extraNpm, npmResolveDir);
      vendorHash = createHash('sha256').update(bundled, 'utf8').digest('hex');
      const upload = await createCanopyV2Upload({
        hash: vendorHash,
        contentType: 'application/javascript',
      });
      await putCanopyV2Upload(upload, bundled);
      externalDependencies = resolveExternalDependencies(
        extraNpm,
        npmResolveDir,
      );
    }
  } else {
    const ancestors = uniquePreserve([
      ...findAncestorRoots(startPolyPath, originalManifest),
      ...findRootsInContext(options.context, originalManifest, startPolyPath),
    ]);
    const allowed = allowedVendorPackages(
      ancestors,
      originalManifest,
      instanceVendor.packages || {},
    );
    for (const spec of extraNpm) {
      const rootPkg = packageRoot(spec);
      if (!allowed.has(rootPkg)) {
        throw new Error(newVendorImportError(rootPkg, ancestors[0]));
      }
    }
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
      if (vendorHash) {
        body.vendorHash = vendorHash;
      } else {
        body.vendorCode = null;
      }
      if (externalDependencies && Object.keys(externalDependencies).length) {
        body.externalDependencies = externalDependencies;
      }
    }

    const saved = await createOrUpdateComponentFunction(body);
    results.push({ ...saved, kind: node.kind });

    manifest[node.polyPath] = {
      file: node.relFile,
      kind: node.kind,
      imports: node.imports,
      visibility,
      ...(node.kind === 'root' && externalDependencies
        ? { externalDependencies }
        : {}),
    };
    saveManifest(graph.projectRoot, manifest);
  }

  const applications = await refreshCanopyV2Applications(
    ordered.map((node) => node.polyPath),
    manifest,
  );

  return { components: results, applications };
};
