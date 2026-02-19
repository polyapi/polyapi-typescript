import axios from 'axios';
import chalk from 'chalk';
import shell from 'shelljs';

import { getAuthData } from './api';
import { validateBaseUrl } from './utils';

export type PolyPermission =
  | 'libraryGenerate'
  | 'customDev'
  | 'manageApiFunctions'
  | 'manageSchemas'
  | 'manageWebhooks'
  | (string & {});

export type PermissionRequirement = {
  permission: PolyPermission;
  action: string;
};

let cachedPermissions: Set<string>;

const extractPermissions = (authData: any): Set<string> => {
  const source = authData?.permissions;

  if (!source) return new Set();

  const enabled = Object.keys(source as Record<string, unknown>).filter(
    (k) => Boolean((source as any)[k]),
  );

  return new Set(enabled);
};

export const getCurrentPermissions = async (): Promise<Set<string>> => {
  const baseUrl = process.env.POLY_API_BASE_URL || '';
  const apiKey = process.env.POLY_API_KEY || '';

  if (!baseUrl) {
    throw new Error('Missing Poly API Base URL. Please run `poly setup` first.');
  }

  if (!apiKey) {
    throw new Error('Missing Poly API Key. Please run `poly setup` first.');
  }

  const authData = await getAuthData(baseUrl, apiKey);
  cachedPermissions = extractPermissions(authData)
  return cachedPermissions;
};

export const loadCurrentPermissions = async (): Promise<Set<string>> => {
  if (cachedPermissions) return cachedPermissions;
  cachedPermissions = await getCurrentPermissions();
  return cachedPermissions;
};

export const hasPermissionsSync = (requirements: PermissionRequirement[]): boolean => {
  if (!cachedPermissions) return false;
  return requirements.every((r) => cachedPermissions!.has(r.permission));
};

export const clearPermissionsCache = (): void => {
  cachedPermissions = null;
};

// Centralized mapping from permission -> user-facing action
export const PERMISSION_ACTIONS: Record<string, string> = {
  libraryGenerate: 'generate Poly library',
  customDev: 'add Client or Server functions',
  manageApiFunctions: 'add API functions',
  manageSchemas: 'add schemas',
  manageWebhooks: 'add webhooks',
};

export const makeRequirement = (permission: PolyPermission): PermissionRequirement => ({
  permission,
  action: PERMISSION_ACTIONS[String(permission)] ?? String(permission),
});

export const buildModelTrainingRequirements = (spec: any): PermissionRequirement[] => {
  const reqs: PermissionRequirement[] = [];
  if (spec?.functions?.length) reqs.push(makeRequirement('manageApiFunctions'));
  if (spec?.schemas?.length) reqs.push(makeRequirement('manageSchemas'));
  if (spec?.webhooks?.length) reqs.push(makeRequirement('manageWebhooks'));
  return reqs;
};

export const ensurePermissions = async (
  requirements: PermissionRequirement[],
): Promise<boolean> => {
  if (!requirements.length) return true;

  try {
    const permissions = cachedPermissions ?? (await getCurrentPermissions());
    cachedPermissions = permissions;

    const missing = requirements.filter(
      ({ permission }) => !permissions.has(permission),
    );

    if (!missing.length) return true;

    const actions = Array.from(new Set(missing.map((m) => m.action))).join(
      ' | ',
    );
    const permsList = Array.from(new Set(missing.map((m) => m.permission)));
    const perms = permsList.join(', ');
    const youDontHave =
      permsList.length === 1
        ? `You don't have permission to ${actions}.`
        : `You don't have permissions to ${actions}.`;
    const missingText =
      permsList.length === 1
        ? `Missing permission: ${perms}.`
        : `Missing permissions: ${perms}.`;

    shell.echo(chalk.redBright('ERROR:'), `${youDontHave} ${missingText}`);
    return false;
  } catch (error: any) {
    const status = error?.response?.status;
    const message =
      error?.response?.data?.message ||
      error?.message ||
      'Unknown error while validating permissions.';

    shell.echo(
      chalk.redBright('ERROR:'),
      `Unable to validate API key permissions via /auth${status ? ` (HTTP ${status})` : ''}. ${message}`,
    );
    if (axios.isAxiosError?.(error) && !error.response) {
      shell.echo(chalk.red('Network error:'), error.message);
    }
    return false;
  }
};
