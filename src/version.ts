import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import semver from 'semver';
import chalk from 'chalk';
import shell from 'shelljs';
import { confirm } from '@inquirer/prompts';
import { loadConfig } from './config';
import { getPackageManager } from './dependencies';

type DistTags = Record<string, string>;

const getClientVersion = (): string | undefined => {
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  try {
    const contents = fs.readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(contents) as { version?: string };
    return packageJson.version;
  } catch {
    return undefined;
  }
};

const normalizeVersion = (version?: string) => {
  if (!version) return undefined;
  return semver.valid(version) ?? semver.coerce(version)?.version;
};

const getDistTags = (): DistTags | undefined => {
  try {
    const stdout = execSync('npm view polyapi dist-tags --json', {
      encoding: 'utf-8',
    });
    return JSON.parse(stdout) as DistTags;
  } catch {
    return undefined;
  }
};

const getTenantTagFromBaseUrl = (baseUrl?: string): string | undefined => {
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    const hostPrefix = host.split('.')[0];

    if (hostPrefix === 'dev') return 'develop';
    if (hostPrefix === 'develop') return 'develop';
    if (hostPrefix === 'staging') return 'staging';
    if (hostPrefix === 'test') return 'test';
    if (hostPrefix === 'na1') return 'na1';
    if (hostPrefix === 'na2') return 'na2';
    if (hostPrefix === 'eu1') return 'eu1';
  } catch {
    return undefined;
  }

  return undefined;
};

const updateClient = async (tag: string) => {
  const packageManager = getPackageManager();
  const command =
    packageManager === 'yarn'
      ? `yarn global add polyapi@${tag}`
      : `npm install -g polyapi@${tag}`;

  shell.echo(`Updating polyapi via: ${command}`);
  const result = shell.exec(command);
  if (result.code !== 0) {
    shell.echo(chalk.red('Update failed. Please update manually.'));
  }
};

export const checkForClientVersionUpdate = async (polyPath: string) => {
  const config = loadConfig(polyPath) ?? {};
  const baseUrl =
    config.POLY_API_BASE_URL || process.env.POLY_API_BASE_URL || '';
  const tenantTag =
    process.env.POLY_TENANT_TAG || getTenantTagFromBaseUrl(baseUrl);

  if (!tenantTag) return;

  const currentVersion = getClientVersion();
  const normalizedCurrent = normalizeVersion(currentVersion);
  if (!normalizedCurrent) return;

  const distTags = getDistTags();
  if (!distTags) return;

  const availableVersion = distTags[tenantTag];
  const normalizedAvailable = normalizeVersion(availableVersion);
  if (!normalizedAvailable) return;

  if (!semver.gt(normalizedAvailable, normalizedCurrent)) return;

  const shouldUpdate = await confirm({
    message: `A newer Poly client version is available for tenant "${tenantTag}". Current: ${currentVersion}, available: ${availableVersion}. Update now?`,
    default: true,
  });

  if (shouldUpdate) {
    await updateClient(tenantTag);
  } else {
    shell.echo(
      chalk.yellow(
        `Continuing with older Poly client version ${currentVersion}.`,
      ),
    );
  }
};