import { LifecycleState, Visibility } from "./shared";

export interface WebhookSecurityFunction {
  id: string;
  message?: string;
}

/**
 * Xml parser options.
 */
export interface WebhookHandleXmlParserOptions {
  /**
   * If is enabled, it will send webhook xml request body as a json object to server functions and webhook listeners, otherwise it will send it as string.
   * Default: `true`.
  */
  enabled?: boolean;
  /**
   * Always put child nodes in an array if true; otherwise an array is created only if there is more than one.
   * Default: `false`.
  */
  explicitArray?: boolean;
  /**
   * Trim the whitespace at the beginning and end of text nodes.
   * Default: `false`.
   */
  trim?: boolean;
  /**
   * Normalize all tag names to lowercase.
   * Default: `false`.
   */
  normalizeTags?: boolean;
}

export interface CreateWebhookHandleDto {
  name: string;
  context?: string;
  /**
   * It is required if there is not `eventPayloadTypeSchema` defined.
   */
  eventPayload?: any;
  /**
   * It is required if there is not `eventPayload` defined.
   */
  eventPayloadTypeSchema?: Record<string, any>;
  description: string;
  visibility?: Visibility;
  state?: LifecycleState;
  responsePayload?: any;
  /**
   * A plain object
   */
  responseHeaders?: Record<string, unknown>;
  responseStatus?: number;
  /**
   * Alphanumeric characters as well as "-", "_"
   * @example foo
   */
  slug?: string | null;
  subpath?: string | null;
  method?: string | null;
  requirePolyApiKey?: boolean;
  securityFunctions?: WebhookSecurityFunction[];
  xmlParserOptions?: WebhookHandleXmlParserOptions;
  ownerUserId?: string | null;
}

export interface ExecuteWebhookHandleDescriptionGenerationDto {
  description: string;
  name: string;
  context: string;
  eventPayload: any;
}

export interface WebhookHandleDto {
  id: string;
  context: string;
  name: string;
  contextName: string;
  description: string;
  url: string;
  uri: string;
  visibility: Visibility;
  ownerUserId?: string | null;
  eventPayloadType: string;
  eventPayloadTypeSchema?: Record<string, any>;
  responsePayload?: any;
  responseHeaders?: any;
  responseStatus: number | null;
  slug: string | null;
  subpath: string | null;
  method: string | null;
  requirePolyApiKey: boolean;
  securityFunctions: WebhookSecurityFunction[];
  enabled: boolean;
  xmlParserOptions: WebhookHandleXmlParserOptions;
}

export interface WebhookHandleBasicDto {
  id: string;
  name: string;
  context: string;
  contextName: string;
  description: string;
  visibility: Visibility;
  subpath: string | null;
  state: LifecycleState;
  enabled: boolean;
  ownerUserId?: string | null;
}

export interface WebhookHandleDescriptionGenerationDto {
  name: string;
  context: string;
  description: string;
  traceId?: string;
}
