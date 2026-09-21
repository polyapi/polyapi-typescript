import dotenv from 'dotenv';
import * as http from './http';
import {
  ApiFunctionDescriptionGenerationDto,
  ApiFunctionDetailsDto,
  CreateApiFunctionDto,
  CreateSchemaDto,
  CreateServerCustomFunctionResponseDto,
  CreateSnippetDto,
  CreateWebhookHandleDto,
  CustomFunctionDescriptionGenerationDto,
  ExecuteApiFunctionDescriptionGenerationDto,
  ExecuteCustomFunctionDescriptionGenerationDto,
  ExecuteWebhookHandleDescriptionGenerationDto,
  FunctionBasicDto,
  FunctionDetailsDto,
  ProjectTemplatesConfig,
  SchemaDto,
  SignUpDto,
  SignUpVerificationResultDto,
  SnippetDetailsDto,
  Specification,
  SpecificationInputDto,
  TosDto,
  Visibility,
  WebhookHandleBasicDto,
  WebhookHandleDescriptionGenerationDto,
  WebhookHandleDto,
} from './types';
import { getInstanceUrl } from './utils';
import { AuthData, ProjectTemplatesConfigVariable } from './types';
import { POLY_API_VERSION_HEADER } from './constants';

dotenv.config();

const nodeEnv = process.env.NODE_ENV;
const isDevEnv = nodeEnv === 'development';

const getApiBaseURL = () => {
  if (!isDevEnv && process.env.POLY_API_BASE_URL?.startsWith('http:')) {
    console.warn(
      `Using POLY_API_BASE_URL with http in production environment is not recommended. If you are using a custom base URL, please make sure it is using https.`,
    );
  }
  return process.env.POLY_API_BASE_URL;
};

const getApiHeaders = () => ({
  Authorization: `Bearer ${process.env.POLY_API_KEY || ''}`,
  [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
});

export const getSpecs = async (
  contexts?: string[],
  names?: string[],
  ids?: string[],
  noTypes?: boolean,
) => {
  return (
    await http.get<Specification[]>(`${getApiBaseURL()}/specs`, {
      headers: getApiHeaders(),
      params: {
        contexts,
        names,
        ids,
        noTypes,
      },
    })
  ).data;
};

export const createOrUpdateServerFunction = async (
  context: string | null,
  name: string,
  description: string | null,
  code: string,
  visibility: string,
  typeSchemas: Record<string, any>,
  externalDependencies: Record<string, string> | null,
  internalDependencies: Record<
    string,
    Array<{ path: string; id: string }> | string[]
  > | null,
  other?: Record<string, any>,
  executionApiKey?: string,
) => {
  return (
    await http.post<CreateServerCustomFunctionResponseDto>(
      `${getApiBaseURL()}/functions/server`,
      {
        context,
        name,
        description,
        code,
        visibility,
        typeSchemas,
        // Keeping backwards compatability on requirements
        requirements: externalDependencies
          ? Object.keys(externalDependencies)
          : null,
        externalDependencies,
        internalDependencies,
        executionApiKey,
        ...other,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data;
};

export const getServerFunctionById = async (id: string) => {
  return (
    await http.get<FunctionDetailsDto>(
      `${getApiBaseURL()}/functions/server/${id}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data;
};

export const getServerFunctionByName = async (
  context: string,
  name: string,
  detail = false,
) => {
  const basic = (
    await http.get<{ results: FunctionBasicDto[] }>(
      `${getApiBaseURL()}/functions/server?search=${encodeURIComponent(
        `${context}${context && name ? '.' : ''}${name}`,
      )}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
          'x-poly-api-version': '2',
        },
      },
    )
  ).data.results.find((fn) => fn.name === name && fn.context === context);
  if (!detail || !basic) return basic;
  return getServerFunctionById(basic.id);
};

export const deleteServerFunction = async (id: string) => {
  return await http.delete(`${getApiBaseURL()}/functions/server/${id}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getApiHeaders(),
    },
  });
};

export const createOrUpdateClientFunction = async (
  context: string | null,
  name: string,
  description: string | null,
  code: string,
  visibility: string,
  typeSchemas: Record<string, any>,
  externalDependencies: Record<string, string> | null,
  internalDependencies: Record<
    string,
    Array<{ path: string; id: string }> | string[]
  > | null,
  other?: Record<string, any>,
) => {
  return (
    await http.post<FunctionDetailsDto>(
      `${getApiBaseURL()}/functions/client`,
      {
        context,
        name,
        description,
        code,
        visibility,
        typeSchemas,
        externalDependencies,
        internalDependencies,
        ...other,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data;
};

export const getClientFunctionById = async (id: string) => {
  return (
    await http.get<FunctionDetailsDto>(
      `${getApiBaseURL()}/functions/client/${id}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data;
};

export const getClientFunctionByName = async (
  context: string,
  name: string,
  detail = false,
) => {
  const basic = (
    await http.get<{ results: FunctionBasicDto[] }>(
      `${getApiBaseURL()}/functions/client?search=${encodeURIComponent(
        `${context}${context && name ? '.' : ''}${name}`,
      )}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
          'x-poly-api-version': '2',
        },
      },
    )
  ).data.results.find((fn) => fn.name === name && fn.context === context);
  if (!detail || !basic) return basic;
  return getClientFunctionById(basic.id);
};

export const deleteClientFunction = async (id: string) => {
  return await http.delete(`${getApiBaseURL()}/functions/client/${id}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getApiHeaders(),
    },
  });
};

export const createTenantSignUp = async (
  instance: string,
  email: string,
  tenantName: string | null = null,
) => {
  return (
    await http.post<SignUpDto>(
      `${getInstanceUrl(instance)}/tenants/sign-up`,
      {
        email,
        tenantName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
        },
      },
    )
  ).data;
};

export const verifyTenantSignUp = async (
  instance: string,
  email: string,
  code: string,
) => {
  return (
    await http.post<SignUpVerificationResultDto>(
      `${getInstanceUrl(instance)}/tenants/sign-up/verify`,
      {
        code,
        email,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
        },
      },
    )
  ).data;
};

export const resendVerificationCode = (instance: string, email: string) => {
  return http.post<SignUpDto>(
    `${getInstanceUrl(instance)}/tenants/sign-up/resend-verification-code`,
    {
      email,
    },
    {
      headers: {
        [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
      },
    },
  );
};

export const getLastTos = async (instance: string) => {
  return (
    await http.get<TosDto>(
      `${getInstanceUrl(instance)}/tos`,
      {
        headers: {
          [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
        },
      },
    )
  ).data;
};

export const upsertApiFunction = async (data: CreateApiFunctionDto) => {
  return (
    await http.put<ApiFunctionDetailsDto>(
      `${getApiBaseURL()}/functions/api`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const upsertWebhookHandle = async (data: CreateWebhookHandleDto) => {
  return (
    await http.put<WebhookHandleDto>(
      `${getApiBaseURL()}/webhooks`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const upsertSchema = async (data: CreateSchemaDto) => {
  return (
    await http.put<SchemaDto>(
      `${getApiBaseURL()}/schemas`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const translateSpecification = async (
  contents: string,
  context?: string,
  hostUrl?: string,
  hostUrlAsArgument?: string,
) => {
  const params = new URLSearchParams();
  if (context) params.append('context', context);
  if (hostUrl) params.append('hostUrl', hostUrl);
  if (hostUrlAsArgument) params.append('hostUrlAsArgument', hostUrlAsArgument);

  const url = `${getApiBaseURL()}/specification-input/oas?${params.toString()}`;

  return (
    await http.post<SpecificationInputDto>(url, contents, {
      headers: {
        'Content-Type': 'text/plain',
        ...getApiHeaders(),
      },
    })
  ).data;
};

export const validateApiFunctionDto = async (data: CreateApiFunctionDto) => {
  return (
    await http.post<void>(
      `${getApiBaseURL()}/specification-input/validation/api-function`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const validateWebhookHandleDto = async (
  data: CreateWebhookHandleDto,
) => {
  return (
    await http.post<void>(
      `${getApiBaseURL()}/specification-input/validation/webhook-handle`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const getServerFunctionDescription = async (
  data: ExecuteCustomFunctionDescriptionGenerationDto,
) => {
  return (
    await http.post<CustomFunctionDescriptionGenerationDto>(
      `${getApiBaseURL()}/functions/server/description-generation`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const getClientFunctionDescription = async (
  data: ExecuteCustomFunctionDescriptionGenerationDto,
) => {
  return (
    await http.post<CustomFunctionDescriptionGenerationDto>(
      `${getApiBaseURL()}/functions/client/description-generation`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const getApiFunctionDescription = async (
  data: ExecuteApiFunctionDescriptionGenerationDto,
) => {
  return (
    await http.post<ApiFunctionDescriptionGenerationDto>(
      `${getApiBaseURL()}/functions/api/description-generation`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const upsertSnippet = async (data: CreateSnippetDto) => {
  return (
    await http.put<SnippetDetailsDto>(`${getApiBaseURL()}/snippets`, data, {
      headers: getApiHeaders(),
    })
  ).data;
};

export const getWebhookHandleDescription = async (
  data: ExecuteWebhookHandleDescriptionGenerationDto,
) => {
  return (
    await http.post<WebhookHandleDescriptionGenerationDto>(
      `${getApiBaseURL()}/webhooks/description-generation`,
      data,
      {
        headers: getApiHeaders(),
      },
    )
  ).data;
};

export const getAuthData = async (
  baseUrl: string,
  apiKey: string,
): Promise<AuthData> => {
  return (
    await http.get<AuthData>(`${baseUrl}/auth`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
      },
    })
  ).data;
};

export const getProjectTemplatesConfig = async (
  baseUrl: string,
  apiKey: string,
  tenantId: string,
  environmentId: string,
): Promise<ProjectTemplatesConfig> => {
  return (
    await http.get<ProjectTemplatesConfigVariable>(
      `${baseUrl}/tenants/${tenantId}/environments/${environmentId}/config-variables/ProjectTemplates`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          [POLY_API_VERSION_HEADER]: process.env.POLY_API_VERSION || '',
        },
      },
    )
  ).data.value;
};

export const createOrUpdateWebhook = async (
  context: string | null,
  name: string,
  description: string | null,
  config?: Record<string, any>,
) => {
  return (
    await http.put<CreateServerCustomFunctionResponseDto>(
      `${getApiBaseURL()}/webhooks`,
      {
        context,
        name,
        description,
        ...config,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data;
};

export const getWebhookById = async (id: string) => {
  return (
    await http.get<WebhookHandleDto>(
      `${getApiBaseURL()}/webhooks/${id}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data;
};

export const getWebhookByName = async (
  context: string,
  name: string,
  detail = false,
) => {
  const basic = (
    await http.get<WebhookHandleBasicDto[]>(
      `${getApiBaseURL()}/webhooks`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
      },
    )
  ).data.find(
    (webhook) => webhook.name === name && webhook.context === context,
  );
  if (!detail || !basic) return basic;
  return getWebhookById(basic.id);
};

export const deleteWebhook = async (webhookId: string) => {
  return await http.delete(
    `${getApiBaseURL()}/webhooks/${webhookId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...getApiHeaders(),
      },
    },
  );
};
