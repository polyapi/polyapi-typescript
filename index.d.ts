export { default } from '.poly/lib';
export * from '.poly/lib';

type Visibility = 'PUBLIC' | 'TENANT' | 'ENVIRONMENT';

type PolyDeployable<CustomConfig extends Record<string, any> = {}> = {
  context: string;
  name: string;
  disableAi?: boolean; // Disable use of AI for filling in missing descriptions
} & CustomConfig;

type PolyFunction = PolyDeployable<{ logsEnabled?: boolean; visibility?: Visibility }>;

export type PolyServerFunction = PolyFunction & { alwaysOn?: boolean };

export type PolyClientFunction = PolyFunction;

export type PolyWebhook = PolyDeployable<
  {
    environmentId?: string;
    visibility?: Visibility;
    eventPayload?: {};
    eventPayloadTypeSchema?: Record<string, any>;
    description?: string;
    responseHeaders: Record<string, string | string[]>;
    responsePayload?: {};
    responseStatus?: number;
    slug?: string | null;
    subpath?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    securityFunctions?: Array<{ path: string; message?: string } | { id: string; message?: string }>;
    requirePolyApiKey?: boolean;
    enabled?: boolean;
    xmlParserOptions: {
      enabled: boolean;
      explicitArray: boolean;
      trim: boolean;
      normalizeTags: boolean;
    };
  } & (
    | { eventPayload: {}; eventPayloadTypeSchema?: never } // If eventPayload is defined, eventPayloadTypeSchema is not allowed
    | { eventPayload?: never; eventPayloadTypeSchema: Record<string, any> }
  ) // If eventPayload is not defined, eventPayloadTypeSchema is required
>;

// export type PolyApiFunction = PolyDeployable<{}>;
// export type PolyVariable = PolyDeployable<{}>;
// export type PolyTrigger = PolyDeployable<{}>;
