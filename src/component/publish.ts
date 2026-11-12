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
import { compileComponentFile, uniquePreserve } from './compile';
import {
  extraVendorSpecifiers,
  reactFamilyMismatchWarnings,
} from './instanceVendor';
import { posixRel, resolveExistingPath } from './manifest';
import { packageRoot, toPolyPath } from './types';

export type PublishComponentOptions = {
  context: string;
  name: string;
  file: string;
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
  const projectRoot = resolveExistingPath(options.projectRoot ?? process.cwd());
  const npmResolveDir = resolveExistingPath(
    options.npmResolveDir ?? projectRoot,
  );
  const absFile = resolveExistingPath(path.resolve(projectRoot, options.file));
  if (!fs.existsSync(absFile) || !fs.statSync(absFile).isFile()) {
    throw new Error(`Component file not found: ${options.file}`);
  }

  const relFile = posixRel(projectRoot, absFile);
  assertComponentIdentifiers([
    { name: options.name, context: options.context, file: relFile },
  ]);

  const instanceVendor = await getPolyVendor();
  for (const warning of reactFamilyMismatchWarnings(
    instanceVendor.packages || {},
    npmResolveDir,
  )) {
    shell.echo(chalk.yellow('WARNING:'), warning);
  }

  const compiled = await compileComponentFile(absFile, {
    projectRoot,
    npmResolveDir,
  });
  const commandVisibility = normalizeVisibility(options.visibility);
  const extraNpm = uniquePreserve(
    extraVendorSpecifiers(uniquePreserve(compiled.npmSpecifiers)),
  );
  if (extraNpm.length) {
    throw new Error(unsupportedPackageError(extraNpm));
  }

  const polyPath = toPolyPath(options.context, options.name);
  const componentId = await findComponentId(polyPath);
  const body: CreateComponentFunctionDto = {
    name: options.name,
    context: options.context,
    sourceCode: compiled.sourceCode,
    code: compiled.code,
    imports: compiled.imports,
  };
  if (commandVisibility) body.visibility = commandVisibility;

  const saved = componentId
    ? await updateComponentFunction(componentId, body)
    : await createOrUpdateComponentFunction(body);

  return { components: [saved] };
};
