import { LifecycleState, Visibility } from "./shared";
import { SchemaRef } from "./specifications";

export interface FunctionBasicDto {
  id: string;
  context: string;
  name: string;
  contextName: string;
  description: string;
  visibility: Visibility;
  state: LifecycleState;
}

export interface ReturnTypeDto {
  type: string;
  schema: Record<string, unknown>;
  statusCode: number;
}

export type ArgumentType = string;

export interface ArgumentSerializationDto {
  style?: string;
  explode?: boolean;
}

export interface FunctionArgument {
  key: string;
  name: string;
  description?: string;
  required?: boolean;
  secure?: boolean;
  type: ArgumentType;
  typeSchema?: Record<string, unknown>;
  typeObject?: object;
  payload?: boolean;
  variable?: string;
  location?: 'url' | 'body' | 'headers' | 'auth';
  removeIfNotPresentOnExecute?: boolean;
  serialization?: ArgumentSerializationDto;
  /**
   * If there are some missing poly schemas in argument `typeSchema`, they will be listed here.
   */
  unresolvedPolySchemaRefs?: SchemaRef[];
}

export interface FunctionArgumentDto extends Omit<FunctionArgument, 'location' | 'typeObject'> {};

export interface FunctionDetailsDto extends FunctionBasicDto {
  ownerUserId?: string | null;
  arguments: FunctionArgumentDto[];
  returnType: string | null;
  returnTypeSchema?: Record<string, any>;
  otherReturnTypes?: ReturnTypeDto[];
  /**
   * If there are some missing poly schemas in `returnTypeSchema`, they will be listed here.
   */
  unresolvedReturnTypePolySchemaRefs?: SchemaRef[];
}


export interface EntrySource {
  key: string;
  value: string;
}

export interface FormDataEntrySource extends EntrySource {
  type: 'text' | 'file';
}

export interface BodySource {
  mode: 'urlencoded' | 'formdata' | 'raw' | 'empty' | 'file';
}

export interface EmptyBodySource extends BodySource {
mode: 'empty';
}

export interface FileBodySource extends BodySource {
mode: 'file';
}

export interface RawBodySource extends BodySource {
mode: 'raw';
raw: string;
language: 'html' | 'xml' | 'text' | 'json' | 'javascript';
}

export interface FormDataBodySource extends BodySource {
mode: 'formdata';
formdata: FormDataEntrySource[];
}

export interface UrlEncodedBodySource extends BodySource {
mode: 'urlencoded';
urlencoded: EntrySource[];
}

export interface UpdateAuthSource {
  type: 'basic' | 'bearer' | 'apikey' | 'noauth';
}

export interface BasicAuthSourceEntries {
  key: 'username' | 'password';
  value: string;
}

export interface BasicAuthSource extends UpdateAuthSource {
  type: 'basic';
  basic: BasicAuthSourceEntries[];
}

export interface ApiKeyAuthSource extends UpdateAuthSource {
  type: 'apikey';
  apikey: { key: string, value: string }[];
}

export interface BearerAuthSourceEntry {
  key: 'token';
  value: string;
}

export interface BearerAuthSource extends UpdateAuthSource {
  type: 'bearer';
  bearer: BearerAuthSourceEntry[];
}

export interface NoAuthSource extends UpdateAuthSource {
type: 'noauth';
}

export interface SourceDto {
  url: string;
  headers: EntrySource[];
  method: string;
  body: EmptyBodySource | RawBodySource | UrlEncodedBodySource | FormDataBodySource | FileBodySource;
  auth: NoAuthSource | BasicAuthSource | BearerAuthSource | ApiKeyAuthSource;
}

export interface CreateSourceDto {
  url: string;
  method: string;
  headers?: EntrySource[];
  auth: BasicAuthSource | BearerAuthSource | ApiKeyAuthSource | NoAuthSource;
  body: UrlEncodedBodySource | FormDataBodySource | RawBodySource | EmptyBodySource | FileBodySource;
}

export interface ApiFunctionDetailsDto extends FunctionDetailsDto {
  source?: SourceDto;
  enabledRedirect: boolean;
}

export interface ArgumentSerializationDto {
  style?: string;
  explode?: boolean;
}

export interface ArgumentsMetadataDto {
    name: string;
    description?: string;
    required?: boolean;
    secure?: boolean;
    type?: string;
    typeSchema?: Record<string, unknown>;
    typeObject?: object;
    payload?: boolean;
    variable?: string | null;
    removeIfNotPresentOnExecute?: boolean;
    serialization?: ArgumentSerializationDto;
}

export interface CreateApiFunctionDto {
  name: string;
  context: string;
  description: string;
  arguments?: ArgumentsMetadataDto[];
  visibility?: Visibility;
  state?: LifecycleState;
  source: CreateSourceDto;
  enabledRedirect?: boolean;
  returnType?: string;
  returnTypeSchema?: Record<string, unknown>;
  otherReturnTypes?: ReturnTypeDto[];
  destinationEnvironmentId?: string;
  ownerUserId?: string;
}


export interface ApiFunctionDescriptionGenerationDto {
  name: string;
  context: string;
  description: string;
  arguments: ArgumentsMetadataDto[];
  traceId?: string;
}

export interface CustomFunctionDescriptionGenerationDto {
  description: string;
  arguments: FunctionArgumentDto[];
  traceId?: string;
}

export interface ExecuteApiFunctionDescriptionGenerationDto {
  name: string;
  context: string;
  description: string;
  arguments: ArgumentsMetadataDto[];
  source: CreateSourceDto;
}


export interface CreateServerCustomFunctionResponseDto extends FunctionDetailsDto {
  traceId?: string;
}

export interface ExecuteCustomFunctionDescriptionGenerationDto {
  description: string;
  arguments?: FunctionArgumentDto[];
  code: string;
}
