import fs from 'fs';
import semver from 'semver';
import { execSync } from 'child_process';
import { parse, stringify } from 'comment-json';

export const librariesToCheck = ['ts-node', 'typescript'];

type VersionT = `${string}.${string}.${string}`;

export const libraryMinVersionMap: Record<string, VersionT> = {
  'ts-node': '5.0.0',
  typescript: '4.0.2',
};
const MIN_NODE_VERSION: VersionT = '20.19.3';

const DEFAULT_TS_CONFIG = {
  compilerOptions: {
    esModuleInterop: true,
  },
};

export const MESSAGES = {
  TS_CONFIG_DO_NOT_EXIST:
    'tsconfig.json does not exist in this project. Do you want to create it?',
  TS_CONFIG_UPDATE:
    'tsconfig.json does not have esModuleInterop set to true in this project. Do you want to update it?',
};

type TsConfigSetupSteps = {
  getCurrentConfig(): Promise<string | undefined>;
  requestUserPermissionToCreateTsConfig(): Promise<boolean>;
  requestUserPermissionToUpdateTsConfig(): Promise<boolean>;
  saveTsConfig(tsConfig: string): Promise<void>;
};

type CheckLibraryVersionSteps = {
  requestUserPermissionToUpdateLib(
    library: string,
    version: string,
    minVersion: string,
  ): Promise<boolean>;
  createOrUpdateLib(library: string, create: boolean): Promise<void>;
};

type CheckNodeVersionOpts = {
  onOldVersion(message: string): any;
  onMissingNode?(message: string): void;
  onSuccess?(): void;
};

export const getUpdateLibraryVersionMessage = (
  version: string,
  minVersion: string,
  library: string,
) => {
  return version
    ? `${library} version is lower than ${minVersion} in this project. Do you want to update it to the latest version?`
    : `${library} is not installed in this project. Do you want to install it?`;
};

export const checkTsConfig = async (steps: TsConfigSetupSteps) => {
  const currentConfig = await steps.getCurrentConfig();

  if (typeof currentConfig === 'undefined') {
    const createTsConfig = await steps.requestUserPermissionToCreateTsConfig();

    if (createTsConfig) {
      steps.saveTsConfig(JSON.stringify(DEFAULT_TS_CONFIG, null, 2));
    }
  } else {
    let tsConfig: any;

    try {
      tsConfig = parse(currentConfig, undefined, false) as any;
    } catch (error) {
      throw new Error(
        'tsconfig.json has invalid JSON syntax, please fix and try again',
      );
    }

    if (!tsConfig.compilerOptions?.esModuleInterop) {
      const updateTsConfig =
        await steps.requestUserPermissionToUpdateTsConfig();
      if (!updateTsConfig) {
        return;
      }

      if (tsConfig.compilerOptions) {
        tsConfig.compilerOptions.esModuleInterop = true;
      } else {
        tsConfig.compilerOptions = {
          esModuleInterop: true,
        };
      }

      try {
        await steps.saveTsConfig(stringify(tsConfig, null, 2));
      } catch (error) {
        throw new Error('Failed to save tsconfig.json file.');
      }
    }
  }
};

const getSafeVersion = (
  version: string,
  defaultVersion: VersionT,
): VersionT => {
  // npm and yarn are more lax on version specification than the semver library is
  // We need to be able to handle wildcard versions like 'latest', '*', 'x', '1.x', or '3.0.x'
  // We also need to handle only partially specified versions like '5' or '5.1'
  // '*' and 'x' effectively mean the latest possible matching version. See: https://docs.npmjs.com/about-semantic-versioning
  if (version === 'latest' || version === '*') {
    return defaultVersion;
  }
  const [expectedMajor, expectedMinor, expectedPatch] =
    defaultVersion.split('.');
  const [major, minor, patch] = version.replace(/[^0-9.x]/g, '').split('.');
  return `${major === 'x' ? expectedMajor : major || '0'}.${
    minor === 'x' ? expectedMinor : minor || '0'
  }.${patch === 'x' ? expectedPatch : patch || '0'}`;
};

const checkLibraryVersion = async (
  packageJson: Record<string, any>,
  library: string,
  minVersion: VersionT,
  steps: CheckLibraryVersionSteps,
) => {
  const version: string =
    packageJson.devDependencies?.[library] ||
    packageJson.dependencies?.[library] ||
    '';

  if (!version || semver.lt(getSafeVersion(version, minVersion), minVersion)) {
    const updateVersion = await steps.requestUserPermissionToUpdateLib(
      library,
      version,
      minVersion,
    );

    if (updateVersion) {
      await steps.createOrUpdateLib(library, !version);
    }
  }
};

export const checkLibraryVersions = async (
  packageJson: Record<string, any>,
  steps: CheckLibraryVersionSteps,
) => {
  for (const library of librariesToCheck) {
    await checkLibraryVersion(
      packageJson,
      library,
      libraryMinVersionMap[library],
      steps,
    );
  }
};

export const getPackageManager = (): 'npm' | 'yarn' => {
  return fs.existsSync(`${process.cwd()}/yarn.lock`) ? 'yarn' : 'npm';
};

export const checkNodeVersion = (opts: CheckNodeVersionOpts) => {
  let currentVersion = '';
  try {
    currentVersion = execSync('node --version', {
      encoding: 'utf-8',
    });
  } catch (err) {
    if (err.stderr?.toString()?.includes('command not found')) {
      const errMessage = `Node.js is not installed. Download and install Node.js version ${MIN_NODE_VERSION} or later from https://nodejs.org/en/download before trying to setup again.`;
      if (opts.onMissingNode) {
        return opts.onMissingNode(errMessage);
      } else {
        throw new Error(errMessage);
      }
    }
    throw err;
  }

  if (semver.lt(currentVersion, MIN_NODE_VERSION)) {
    opts.onOldVersion(
      `Node.js version is too old. The minimum required version is ${MIN_NODE_VERSION}. Please update Node.js to a newer version.`,
    );
  } else {
    opts.onSuccess?.();
  }
};
