import { getAuthData, createApplication, listApplications, updateApplication } from '../api';
import {
  ApplicationDto,
  APPLICATION_SUBDOMAIN_PATTERN,
  CANOPY_V2_VERSION,
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

export const buildCanopyV2ApplicationBody = (input: {
  name: string;
  subdomain: string;
  rootComponent: string;
  authenticatedRoot?: string | null;
  environmentSubdomain: string;
}): CreateCanopyV2ApplicationDto => {
  const subdomain = input.subdomain.trim();
  assertApplicationSubdomain(subdomain);
  assertJoinedOriginLabel(subdomain, input.environmentSubdomain.trim());
  if (!input.rootComponent) {
    throw new Error('rootComponent is required when version is 2.');
  }
  const body: CreateCanopyV2ApplicationDto = {
    name: input.name,
    version: CANOPY_V2_VERSION,
    subdomain,
    rootComponent: input.rootComponent,
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
  subdomain?: string;
  rootComponent: string;
  authenticatedRoot?: string | null;
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
  const matches = findApplicationBySubdomain(await listApplications(), subdomain);
  if (matches.length > 1) {
    throw new Error(
      `More than one canopy-v2 application matches subdomain "${subdomain}".`,
    );
  }
  const existing = matches[0];
  const authenticatedRoot =
    input.authenticatedRoot === undefined
      ? existing?.authenticatedRoot
      : input.authenticatedRoot;
  const body = buildCanopyV2ApplicationBody({
    name: input.name,
    subdomain,
    rootComponent: input.rootComponent,
    authenticatedRoot,
    environmentSubdomain,
  });
  const updating = Boolean(existing);
  report?.(updating);
  const application = existing
    ? await updateApplication(existing.id, body)
    : await createApplication(body);
  return {
    application,
    subdomain,
    environmentSubdomain,
    updating,
  };
};
