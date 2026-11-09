import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import shell from 'shelljs';
import {
  createOrUpdateComponentFunction,
  getPolyVendor,
  getSpecs,
  updateComponentFunction,
} from '../api';
import { DEFAULT_POLY_PATH } from '../constants';
import { getCachedSpecs, getPolyLibPath, writeCachedSpecs } from '../utils';
import { assertComponentIdentifiers } from './identifiers';
import {
  ComponentFunctionDetailsDto,
  CreateComponentFunctionDto,
  Specification,
  Visibility,
} from '../types';
import { uniquePreserve } from './compile';
import {
  extraVendorSpecifiers,
  reactFamilyMismatchWarnings,
} from './instanceVendor';
import { compileComponentGraph } from './graph';
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

export const componentIdFromSpecs = (
  specs: Specification[],
  polyPath: string,
): string | null => {
  const found = specs.find(
    (spec) =>
      spec.type === 'componentFunction' &&
      spec.contextName.toLowerCase() === polyPath.toLowerCase() &&
      Boolean(spec.id),
  );
  return found?.id || null;
};

const findComponentId = async (polyPath: string): Promise<string | null> => {
  const libPath = getPolyLibPath(DEFAULT_POLY_PATH);
  const cached = componentIdFromSpecs(getCachedSpecs(libPath), polyPath);
  if (cached) return cached;
  const specs = await getSpecs();
  writeCachedSpecs(libPath, specs);
  return componentIdFromSpecs(specs, polyPath);
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
  const { nodes: compiledNodes } = graph;
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
  const results: ComponentFunctionDetailsDto[] = [];

  for (const node of compiledNodes) {
    const componentId = await findComponentId(node.polyPath);
    const body: CreateComponentFunctionDto = {
      name: node.name,
      context: node.context,
      sourceCode: node.sourceCode,
      code: node.code,
      imports: node.imports,
      kind: node.kind,
    };
    if (commandVisibility) body.visibility = commandVisibility;
    if (node.kind === 'root') {
      body.vendorCode = null;
    }

    const saved = componentId
      ? await updateComponentFunction(componentId, {
          ...body,
          kind: node.kind === 'root' ? node.kind : undefined,
        })
      : await createOrUpdateComponentFunction(body);
    results.push({ ...saved, kind: saved.kind ?? node.kind });
  }

  return { components: results };
};
