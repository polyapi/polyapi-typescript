export const CANOPY_V2_VERSION = 2 as const;

/** 1–32 chars. Server pattern for application.subdomain. */
export const APPLICATION_SUBDOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** DNS label: 1–63 chars, not starting or ending with a hyphen. */
export const JOINED_SUBDOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type CreateCanopyV2ApplicationDto = {
  name: string;
  version: typeof CANOPY_V2_VERSION;
  subdomain: string;
  rootComponent: string;
  authenticatedRoot?: string | null;
};

export type ApplicationDto = {
  id: string;
  name: string;
  description?: string;
  version?: number;
  subdomain?: string | null;
  rootComponent?: string | null;
  authenticatedRoot?: string | null;
  vendorHash?: string | null;
};
