import { CreateApiFunctionDto } from "./functions";
import { CreateSchemaDto } from "./schemas";
import { LifecycleState, Visibility } from "./shared";
import { CreateWebhookHandleDto } from "./webhooks";

export type ValueType = string | number | boolean | object | null | any[];

export type SpecificationType =
  'apiFunction'
  | 'customFunction'
  | 'authFunction'
  | 'webhookHandle'
  | 'serverFunction'
  | 'serverVariable'
  | 'snippet'
  | 'schema';

export interface ISpecification {
  id: string;
  context: string;
  name: string;
  contextName: string;
  description?: string;
  type: SpecificationType;
  state?: LifecycleState;
  visibilityMetadata: VisibilityMetadata;
}

export interface VisibilityMetadata {
  visibility: Visibility;
  foreignTenantName?: string | null;
  foreignEnvironmentName?: string | null;
}

export interface FunctionSpecification {
  arguments: PropertySpecification[];
  returnType: PropertyType;
  otherReturnTypes?: Record<number, PropertyType>;
  synchronous?: boolean;
}

export interface PropertySpecification {
  name: string;
  description?: string;
  type: PropertyType;
  required: boolean;
  nullable?: boolean;
}

interface IPropertyType {
  kind: 'void' | 'primitive' | 'array' | 'object' | 'function' | 'plain';
}

export type PropertyType =
  VoidPropertyType
  | PrimitivePropertyType
  | ArrayPropertyType
  | ObjectPropertyType
  | FunctionPropertyType
  | PlainPropertyType;

interface VoidPropertyType extends IPropertyType {
  kind: 'void';
}

interface PrimitivePropertyType extends IPropertyType {
  kind: 'primitive';
  type: 'string' | 'number' | 'boolean';
}

export interface ArrayPropertyType extends IPropertyType {
  kind: 'array';
  items: PropertyType;
}

export interface ObjectPropertyType extends IPropertyType {
  kind: 'object';
  schema?: Record<string, any>;
  properties?: PropertySpecification[];
  typeName?: string;
  unresolvedPolySchemaRefs?: SchemaRef[];
}

export interface FunctionPropertyType extends IPropertyType {
  kind: 'function';
  name?: string;
  spec: FunctionSpecification;
}

export interface PlainPropertyType extends IPropertyType {
  kind: 'plain';
  value: string;
}

export interface ApiFunctionSpecification extends ISpecification {
  type: 'apiFunction';
  function: FunctionSpecification;
  apiType: 'graphql' | 'rest'
}

export interface CustomFunctionSpecification extends ISpecification {
  type: 'customFunction';
  function: FunctionSpecification;
  requirements: string[];
  code: string;
  sourceCode: string;
  language: string;
}

export interface ServerFunctionSpecification extends ISpecification {
  type: 'serverFunction';
  function: FunctionSpecification;
  requirements: string[];
  serverSideAsync: boolean;
}

export interface AuthFunctionSpecification extends ISpecification {
  type: 'authFunction';
  function: FunctionSpecification;
  subResource?: string;
}

export interface WebhookHandleSpecification extends ISpecification {
  type: 'webhookHandle';
  function: FunctionSpecification;
}

export interface ServerVariableSpecification extends ISpecification {
  type: 'serverVariable';
  variable: VariableSpecification;
}

export interface VariableSpecification {
  environmentId: string;
  secret: boolean;
  valueType: PropertyType;
  value?: ValueType;
}

export interface SnippetSpecification extends ISpecification{
  type: 'snippet'
  language: string
  description: string;
}


export interface SchemaRef {
  publicNamespace?: string;
  path: string;
}

export interface SchemaSpecification extends ISpecification {
  type: 'schema';
  definition: Record<string, unknown>
  unresolvedPolySchemaRefs?: SchemaRef[]
}

export type Specification =
  ApiFunctionSpecification
  | CustomFunctionSpecification
  | ServerFunctionSpecification
  | AuthFunctionSpecification
  | WebhookHandleSpecification
  | ServerVariableSpecification
  | SnippetSpecification
  | SchemaSpecification;


interface CreateWebhookHandleDtoForSpecificationInput extends CreateWebhookHandleDto {
  context: string;
}

interface CreateSchemaDtoForSpecificationInput extends CreateSchemaDto {
  context: string;
}

export interface SpecificationInputDto {
  title: string;
  functions: CreateApiFunctionDto[];
  webhooks: CreateWebhookHandleDtoForSpecificationInput[];
  schemas: CreateSchemaDtoForSpecificationInput[];
}

export type SpecificationWithFunction = Specification & { function: FunctionSpecification };

export type SpecificationWithVariable = Specification & { variable: VariableSpecification };
