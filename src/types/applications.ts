export const CANOPY_V2_RUNTIME = 'canopy-v2' as const;

export type CanopyV2ApplicationConfig = {
  subpath: string;
};

export type CreateCanopyV2ApplicationDto = {
  name: string;
  runtime: typeof CANOPY_V2_RUNTIME;
  rootComponent: string;
  authenticatedRoot?: string | null;
  config: CanopyV2ApplicationConfig;
};

export type ApplicationDto = {
  id: string;
  name: string;
  description?: string;
  subpath?: string;
  runtime?: string;
  rootComponent?: string | null;
  authenticatedRoot?: string | null;
  vendorHash?: string | null;
  config?: { subpath?: string; name?: string } | string | null;
};

export type CanopyV2UploadRequest = {
  hash: string;
  contentType: 'application/javascript';
};

export type CanopyV2UploadDto = {
  url: string;
  key: string;
  method: 'PUT';
  headers?: Record<string, string>;
  expiresAt?: string;
};
