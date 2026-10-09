import {
  createApplication,
  listApplications,
  updateApplication,
} from '../api';
import {
  ApplicationDto,
  CANOPY_V2_RUNTIME,
  CreateCanopyV2ApplicationDto,
} from '../types';
import { ComponentManifest } from './types';

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const assertHostnameSafeApplicationName = (name: string) => {
  if (!HOSTNAME_LABEL.test(name)) {
    throw new Error(
      `Application name "${name}" must be a hostname label (lowercase letters, digits, and interior hyphens). Origin is {name}-{environment.subdomain}.`,
    );
  }
};

export const normalizeApplicationSubpath = (subpath: string) =>
  subpath.trim().replace(/^\/+|\/+$/g, '');

const readSubpath = (application: ApplicationDto) => {
  const config = application.config;
  if (config && typeof config === 'object' && typeof config.subpath === 'string') {
    return config.subpath;
  }
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config) as { subpath?: string };
      if (typeof parsed?.subpath === 'string') return parsed.subpath;
    } catch {
      // config is stored as JSON on the server and returned parsed
    }
  }
  return application.subpath || '';
};

export const buildCanopyV2ApplicationBody = (
  input: {
    name: string;
    rootComponent: string;
    authenticatedRoot?: string | null;
    subpath: string;
  },
  options: { validateName?: boolean } = {},
): CreateCanopyV2ApplicationDto => {
  if (options.validateName !== false) {
    assertHostnameSafeApplicationName(input.name);
  }
  const subpath = normalizeApplicationSubpath(input.subpath);
  if (!subpath || subpath.includes('/')) {
    throw new Error(
      'config.subpath is required and must be a single path segment.',
    );
  }
  if (!input.rootComponent) {
    throw new Error('rootComponent is required when runtime is canopy-v2.');
  }
  const body: CreateCanopyV2ApplicationDto = {
    name: input.name,
    runtime: CANOPY_V2_RUNTIME,
    rootComponent: input.rootComponent,
    config: { subpath },
  };
  if (input.authenticatedRoot) {
    body.authenticatedRoot = input.authenticatedRoot;
  } else if (input.authenticatedRoot === null) {
    body.authenticatedRoot = null;
  }
  return body;
};

export type CanopyV2ApplicationInput = {
  name: string;
  rootComponent: string;
  authenticatedRoot?: string;
  subpath: string;
};

export const createCanopyV2Application = async (
  input: CanopyV2ApplicationInput,
) => createApplication(buildCanopyV2ApplicationBody(input));

const findApplication = (applications: ApplicationDto[], nameOrId: string) => {
  const needle = nameOrId.trim();
  const needleLower = needle.toLowerCase();
  return applications.filter((application) => {
    if (application.runtime && application.runtime !== CANOPY_V2_RUNTIME) {
      return false;
    }
    return (
      application.id === needle ||
      application.name?.toLowerCase() === needleLower
    );
  });
};

export type UpdateCanopyV2ApplicationInput = {
  nameOrId: string;
  name?: string;
  rootComponent?: string;
  authenticatedRoot?: string | null;
  subpath?: string;
};

export const updateCanopyV2Application = async (
  input: UpdateCanopyV2ApplicationInput,
) => {
  const applications = await listApplications();
  const matches = findApplication(applications, input.nameOrId);
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `More than one canopy-v2 application matches "${input.nameOrId}".`
        : `No canopy-v2 application named "${input.nameOrId}".`,
    );
  }
  const existing = matches[0];
  const authenticatedRoot =
    input.authenticatedRoot === undefined
      ? existing.authenticatedRoot
      : input.authenticatedRoot;
  return updateApplication(
    existing.id,
    buildCanopyV2ApplicationBody({
      name: input.name ?? existing.name,
      rootComponent: input.rootComponent ?? existing.rootComponent ?? '',
      authenticatedRoot,
      subpath: input.subpath ?? readSubpath(existing),
    }),
  );
};

const graphIncludesPublished = (
  root: string,
  published: Set<string>,
  manifest: ComponentManifest,
) => {
  const stack = [root];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (published.has(current)) return true;
    for (const child of manifest[current]?.imports || []) {
      stack.push(child);
    }
  }
  return false;
};

export const refreshCanopyV2Applications = async (
  publishedPaths: string[],
  manifest: ComponentManifest,
) => {
  const published = new Set(publishedPaths.filter(Boolean));
  if (!published.size) return [];
  let applications;
  try {
    applications = await listApplications();
  } catch (error) {
    const err = error as { message?: string };
    throw new Error(
      `Components were published, but listing applications failed: ${err?.message || error}`,
    );
  }
  const refreshed = [];
  for (const application of applications) {
    if (application.runtime !== CANOPY_V2_RUNTIME) continue;
    const roots = [application.rootComponent, application.authenticatedRoot].filter(
      (path): path is string => Boolean(path),
    );
    if (!roots.some((root) => graphIncludesPublished(root, published, manifest))) {
      continue;
    }
    const subpath = readSubpath(application);
    if (!application.rootComponent || !subpath) continue;
    let saved;
    try {
      saved = await updateApplication(
        application.id,
        buildCanopyV2ApplicationBody(
          {
            name: application.name,
            rootComponent: application.rootComponent,
            authenticatedRoot: application.authenticatedRoot || undefined,
            subpath,
          },
          { validateName: false },
        ),
      );
    } catch (error) {
      const err = error as { message?: string };
      throw new Error(
        `Components were published, but re-uploading application ${application.name} failed: ${err?.message || error}`,
      );
    }
    refreshed.push(saved);
  }
  return refreshed;
};
