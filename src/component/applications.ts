import {
  getAuthData,
  createApplication,
  getApplication,
  listApplications,
  updateApplication,
} from '../api';
import {
  ApplicationDto,
  APPLICATION_SUBDOMAIN_PATTERN,
  CANOPY_V2_VERSION,
  CanopyV2ApplicationConfig,
  CanopyV2RootConfig,
  CreateCanopyV2ApplicationDto,
  JOINED_SUBDOMAIN_PATTERN,
} from '../types';

export const assertApplicationSubdomain = (subdomain: string) => {
  if (!APPLICATION_SUBDOMAIN_PATTERN.test(subdomain)) {
    throw new Error(
      `Application subdomain "${subdomain}" must be 1–32 characters: lowercase letters, digits, and interior hyphens.`,
    );
  }
};

export const assertJoinedOriginLabel = (
  applicationSubdomain: string,
  environmentSubdomain: string,
) => {
  const joined = `${applicationSubdomain}-${environmentSubdomain}`;
  if (!JOINED_SUBDOMAIN_PATTERN.test(joined)) {
    throw new Error(
      `'${joined}' is not a valid DNS label. Origin is {subdomain}-{environment.subdomain} and must be 1–63 characters, not starting or ending with a hyphen.`,
    );
  }
};

export const getCurrentEnvironmentSubdomain = async () => {
  const baseUrl = process.env.POLY_API_BASE_URL || '';
  const apiKey = process.env.POLY_API_KEY || '';
  if (!baseUrl || !apiKey) {
    throw new Error(
      'Poly is not configured. Run `poly setup` so the environment subdomain can be read from GET /auth.',
    );
  }
  const auth = await getAuthData(baseUrl, apiKey);
  const subdomain = auth?.environment?.subdomain?.trim();
  if (!subdomain) {
    throw new Error(
      'GET /auth did not include environment.subdomain. Cannot build the canopy-v2 origin.',
    );
  }
  return subdomain;
};

const ROOT_EXAMPLE = '--root /:myapp.App';

export const parseApplicationRoots = (
  values: string[],
): Record<string, CanopyV2RootConfig> => {
  const roots: Record<string, CanopyV2RootConfig> = {};
  for (const value of values) {
    const raw = value.trim();
    const colon = raw.indexOf(':');
    if (colon <= 0 || colon === raw.length - 1) {
      throw new Error(
        `Root "${value}" must be <path>:<context.name>, for example ${ROOT_EXAMPLE}.`,
      );
    }
    const path = raw.slice(0, colon).trim();
    const component = raw.slice(colon + 1).trim();
    if (!path.startsWith('/')) {
      throw new Error(`Root path "${path}" must start with "/".`);
    }
    if (!component) {
      throw new Error(
        `Root "${value}" must include a context.name after the colon.`,
      );
    }
    if (roots[path]) {
      throw new Error(`Root path "${path}" was given more than once.`);
    }
    roots[path] = { component };
  }
  if (!roots['/']) {
    throw new Error(`Roots must include "/". Example: ${ROOT_EXAMPLE}`);
  }
  return roots;
};

export const rootsFromApplicationConfig = (
  config: ApplicationDto['config'],
): Record<string, CanopyV2RootConfig> | undefined => {
  const stored = config?.roots;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return undefined;
  }
  const roots: Record<string, CanopyV2RootConfig> = {};
  for (const [path, entry] of Object.entries(stored)) {
    const component = entry?.component?.trim();
    if (!path || !component) continue;
    roots[path] = { component };
  }
  return Object.keys(roots).length ? roots : undefined;
};

export const resolveCanopyV2WriteConfig = (input: {
  creating: boolean;
  roots?: Record<string, CanopyV2RootConfig>;
  publicAccess?: boolean;
  existingConfig?: ApplicationDto['config'];
}): CanopyV2ApplicationConfig | undefined => {
  if (input.creating) {
    if (!input.roots?.['/']) {
      throw new Error(`A root at "/" is required. Example: ${ROOT_EXAMPLE}`);
    }
    return {
      roots: input.roots,
      publicAccess: input.publicAccess ?? false,
    };
  }
  if (!input.roots && input.publicAccess === undefined) {
    return undefined;
  }
  const roots = input.roots ?? rootsFromApplicationConfig(input.existingConfig);
  if (!roots?.['/']) {
    throw new Error(
      `The application has no "/" root to keep. Pass ${ROOT_EXAMPLE}.`,
    );
  }
  const publicAccess =
    input.publicAccess !== undefined
      ? input.publicAccess
      : input.existingConfig?.publicAccess ?? false;
  return { roots, publicAccess };
};

export const buildCanopyV2ApplicationBody = (input: {
  name: string;
  subdomain: string;
  environmentSubdomain: string;
  config?: CanopyV2ApplicationConfig;
}): CreateCanopyV2ApplicationDto => {
  const subdomain = input.subdomain.trim();
  assertApplicationSubdomain(subdomain);
  assertJoinedOriginLabel(subdomain, input.environmentSubdomain.trim());
  if (input.config && !input.config.roots['/']) {
    throw new Error('config.roots must include "/".');
  }
  const body: CreateCanopyV2ApplicationDto = {
    name: input.name,
    version: CANOPY_V2_VERSION,
    subdomain,
  };
  if (input.config) {
    body.config = {
      roots: input.config.roots,
      publicAccess: input.config.publicAccess,
    };
  }
  return body;
};

export type CanopyV2ApplicationInput = {
  name: string;
  subdomain?: string;
  roots?: Record<string, CanopyV2RootConfig>;
  publicAccess?: boolean;
};

export type CanopyV2WriteResult = {
  application: ApplicationDto;
  subdomain: string;
  environmentSubdomain: string;
  updating: boolean;
};

const findApplicationBySubdomain = (
  applications: ApplicationDto[],
  subdomain: string,
) => {
  const needle = subdomain.trim().toLowerCase();
  return applications.filter(
    (application) =>
      application.version === CANOPY_V2_VERSION &&
      application.subdomain?.toLowerCase() === needle,
  );
};

export const addCanopyV2Application = async (
  input: CanopyV2ApplicationInput,
  report?: (updating: boolean) => void,
): Promise<CanopyV2WriteResult> => {
  const subdomain = (input.subdomain ?? input.name).trim();
  assertApplicationSubdomain(subdomain);
  const environmentSubdomain = await getCurrentEnvironmentSubdomain();
  const matches = findApplicationBySubdomain(
    await listApplications(),
    subdomain,
  );
  if (matches.length > 1) {
    throw new Error(
      `More than one canopy-v2 application matches subdomain "${subdomain}".`,
    );
  }
  const existing = matches[0];
  const creating = !existing;
  const needsStoredConfig =
    !creating &&
    ((Boolean(input.roots) && input.publicAccess === undefined) ||
      (!input.roots && input.publicAccess !== undefined));
  const existingConfig = needsStoredConfig
    ? (await getApplication(existing.id)).config
    : undefined;
  const config = resolveCanopyV2WriteConfig({
    creating,
    roots: input.roots,
    publicAccess: input.publicAccess,
    existingConfig,
  });
  const body = buildCanopyV2ApplicationBody({
    name: input.name,
    subdomain,
    environmentSubdomain,
    config,
  });
  report?.(!creating);
  const application = existing
    ? await updateApplication(existing.id, body)
    : await createApplication(body);
  return {
    application,
    subdomain,
    environmentSubdomain,
    updating: !creating,
  };
};
