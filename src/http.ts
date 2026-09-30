import { existsSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { STATUS_CODES } from 'http';
import dotenv from 'dotenv';
import {
  Agent,
  EnvHttpProxyAgent,
  interceptors,
  request as undiciRequest,
  type Dispatcher,
} from 'undici';

dotenv.config();

const requireSibling = createRequire(__filename);

const MAX_REDIRECTIONS = 21;
const MAX_THROTTLE_RETRIES = 5;
const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRY_AFTER_MS = 60_000;
const SECRET_KEYS = [
  'x_api_key',
  'x-api-key',
  'access_token',
  'access-token',
  'authorization',
  'api_key',
  'api-key',
  'apikey',
  'accesstoken',
  'token',
  'password',
  'key',
];

export type HttpRequestConfig = {
  url: string;
  method?: string;
  headers?: Record<string, string | number | undefined>;
  body?: unknown;
  data?: unknown;
  params?: Record<string, unknown> | URLSearchParams;
  responseType?: 'json' | 'text' | 'arraybuffer';
  baseURL?: string;
  dispatcher?: Dispatcher;
  timeout?: number;
  throttleRetries?: number;
  didRetry?: boolean;
};

export type HttpResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
};

type GeneratedRuntime = {
  apiKey: string;
  apiBaseUrl: string;
  polyCustom: { executionApiKey?: string | null };
};

export class AxiosError extends Error {
  name = 'AxiosError';
  isAxiosError = true;
  code?: string;
  status?: number;
  cause?: unknown;
  config?: HttpRequestConfig;
  request?: { url: string; method: string; headers?: Record<string, string> };
  response?: {
    status: number;
    statusText: string;
    data: unknown;
    headers: Record<string, string>;
  };

  constructor(
    message: string,
    code?: string,
    config?: HttpRequestConfig,
    request?: AxiosError['request'],
    response?: AxiosError['response'],
  ) {
    super(message);
    this.name = 'AxiosError';
    this.isAxiosError = true;
    this.code = code;
    this.config = config;
    this.request = request;
    this.response = response;
    if (response) this.status = response.status;
    Object.defineProperty(this, 'message', {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
}

export const isAxiosError = (payload: unknown): payload is AxiosError =>
  Boolean(
    payload &&
      typeof payload === 'object' &&
      (payload as AxiosError).isAxiosError === true,
  );

const encodeParam = (value: string) =>
  encodeURIComponent(value)
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+');

const stringifyParam = (value: unknown): string => {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

export const serializeParams = (
  params: Record<string, unknown> | URLSearchParams,
): string => {
  if (params instanceof URLSearchParams) {
    return params.toString();
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        pairs.push(
          `${encodeParam(`${key}[]`)}=${encodeParam(stringifyParam(item))}`,
        );
      }
      continue;
    }
    pairs.push(`${encodeParam(key)}=${encodeParam(stringifyParam(value))}`);
  }
  return pairs.join('&');
};

const normalizeHeaders = (
  headers?: Record<string, string | number | undefined>,
): Record<string, string> => {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key] = String(value);
  }
  return normalized;
};

const getHeaderName = (
  headers: Record<string, string>,
  name: string,
): string | undefined =>
  Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());

const getHeader = (
  headers: Record<string, string>,
  name: string,
): string | undefined => {
  const key = getHeaderName(headers, name);
  return key ? headers[key] : undefined;
};

const setHeader = (
  headers: Record<string, string>,
  name: string,
  value: string,
) => {
  const existing = getHeaderName(headers, name);
  headers[existing || name] = value;
};

const isRawBody = (body: unknown): boolean => {
  if (body == null || typeof body !== 'object') return false;
  if (Buffer.isBuffer(body)) return true;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return true;
  }
  const ctorName = (body as { constructor?: { name?: string } }).constructor
    ?.name;
  if (
    ctorName === 'FormData' ||
    ctorName === 'Blob' ||
    ctorName === 'ReadableStream'
  ) {
    return true;
  }
  if (typeof (body as { pipe?: unknown }).pipe === 'function') return true;
  return false;
};

export const encodeBody = (
  body: unknown,
  headers: Record<string, string>,
): Dispatcher.DispatchOptions['body'] | undefined => {
  if (body === undefined || body === null) return undefined;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    if (!getHeader(headers, 'content-type')) {
      setHeader(
        headers,
        'Content-Type',
        'application/x-www-form-urlencoded;charset=utf-8',
      );
    }
    return body.toString();
  }
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body) && !Buffer.isBuffer(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof body === 'string' || isRawBody(body)) {
    return body as Dispatcher.DispatchOptions['body'];
  }
  if (!getHeader(headers, 'content-type')) {
    setHeader(headers, 'Content-Type', 'application/json');
  }
  return JSON.stringify(body);
};

const looksLikeJson = (text: string) => /^\s*(?:\{|\[)/.test(text);

const headersToObject = (
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
};

type UndiciBody = {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export const parseBody = async (
  body: UndiciBody,
  headers: Record<string, string>,
  responseType?: HttpRequestConfig['responseType'],
): Promise<unknown> => {
  if (responseType === 'arraybuffer') {
    return Buffer.from(await body.arrayBuffer());
  }

  const text = await body.text();
  if (text === '') return '';
  if (responseType === 'text') return text;

  const contentType = headers['content-type'] || '';
  const isJsonContentType =
    /application\/json/i.test(contentType) ||
    /application\/[a-z0-9.+-]*\+json/i.test(contentType);

  if (isJsonContentType || looksLikeJson(text)) {
    try {
      return JSON.parse(text);
    } catch (error) {
      if ((error as Error).name === 'SyntaxError') return text;
      throw error;
    }
  }

  return text;
};

const resolveUrl = (
  url: string,
  baseURL?: string,
  params?: HttpRequestConfig['params'],
): string => {
  let resolved = url;
  if (baseURL && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    const path = url.startsWith('/') ? url.slice(1) : url;
    resolved = `${base}${path}`;
  }

  const query =
    params == null
      ? ''
      : params instanceof URLSearchParams
        ? params.toString()
        : serializeParams(params);

  if (!query) return resolved;
  return `${resolved}${resolved.includes('?') ? '&' : '?'}${query}`;
};

const getNetworkCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as { code?: unknown; cause?: unknown; errors?: unknown[] };
  if (typeof err.code === 'string') return err.code;
  if (err.cause) return getNetworkCode(err.cause);
  if (Array.isArray(err.errors) && err.errors.length) {
    return getNetworkCode(err.errors[0]);
  }
  return undefined;
};

const loadGeneratedRuntime = (): GeneratedRuntime | undefined => {
  const constantsPath = join(__dirname, 'constants.js');
  const polyCustomPath = join(__dirname, 'poly-custom.js');
  if (!existsSync(constantsPath) || !existsSync(polyCustomPath)) {
    return undefined;
  }

  try {
    const constants = requireSibling(constantsPath) as {
      API_KEY?: string;
      API_BASE_URL?: string;
    };
    if (typeof constants.API_BASE_URL !== 'string') return undefined;
    const polyCustom = requireSibling(polyCustomPath) as GeneratedRuntime['polyCustom'];
    return {
      apiKey: constants.API_KEY || '',
      apiBaseUrl: constants.API_BASE_URL,
      polyCustom,
    };
  } catch {
    return undefined;
  }
};

const UNSET = Symbol('unset');
let cachedDispatcher: Dispatcher | typeof UNSET = UNSET;
let cachedGeneratedRuntime: GeneratedRuntime | null | undefined;

export const resetHttpDispatchers = () => {
  cachedDispatcher = UNSET;
  cachedGeneratedRuntime = undefined;
};

const getGeneratedRuntime = (): GeneratedRuntime | null => {
  if (cachedGeneratedRuntime !== undefined) return cachedGeneratedRuntime;
  cachedGeneratedRuntime = loadGeneratedRuntime() ?? null;
  return cachedGeneratedRuntime;
};

const readProxyEnv = () => {
  const httpProxy =
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.npm_config_proxy;
  const httpsProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.npm_config_https_proxy;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  return { httpProxy, httpsProxy, noProxy };
};

const withRedirects = (dispatcher: Dispatcher): Dispatcher => {
  const redirect = interceptors?.redirect;
  if (typeof dispatcher.compose !== 'function' || typeof redirect !== 'function') {
    return dispatcher;
  }
  try {
    return dispatcher.compose(redirect({ maxRedirections: MAX_REDIRECTIONS }));
  } catch {
    return dispatcher;
  }
};

export const createDispatcher = (
  options: {
    cert?: string | Buffer;
    key?: string | Buffer;
    ca?: string | Buffer;
    rejectUnauthorized?: boolean;
  } = {},
): Dispatcher => {
  const isDevEnv = process.env.NODE_ENV === 'development';
  const rejectUnauthorized = options.rejectUnauthorized ?? !isDevEnv;
  const { httpProxy, httpsProxy, noProxy } = readProxyEnv();
  const connect = {
    rejectUnauthorized,
    ...(options.cert ? { cert: options.cert } : {}),
    ...(options.key ? { key: options.key } : {}),
    ...(options.ca ? { ca: options.ca } : {}),
  };

  let dispatcher: Dispatcher;
  if (options.cert || options.key || options.ca) {
    dispatcher = new Agent({ connect });
  } else if (httpProxy || httpsProxy) {
    dispatcher = new EnvHttpProxyAgent({
      httpProxy,
      httpsProxy: httpsProxy || httpProxy,
      noProxy,
      connect,
    });
  } else {
    dispatcher = new Agent({ connect });
  }

  return withRedirects(dispatcher);
};

const getDefaultDispatcher = (): Dispatcher => {
  if (cachedDispatcher !== UNSET) return cachedDispatcher;
  cachedDispatcher = createDispatcher();
  return cachedDispatcher;
};

const createRequestInfo = (
  url: string,
  method: string,
  headers: Record<string, string>,
) => ({ url, method, headers: { ...headers } });

const getDefaultBaseURL = (): string | undefined => {
  const generated = getGeneratedRuntime();
  if (!generated) return undefined;
  if (process.env.NODE_ENV === 'development') return generated.apiBaseUrl;
  return generated.apiBaseUrl.replace(/^http:/, 'https:');
};

const applyGeneratedAuth = (headers: Record<string, string>) => {
  const generated = getGeneratedRuntime();
  if (!generated) return;
  setHeader(
    headers,
    'Authorization',
    `Bearer ${generated.polyCustom.executionApiKey || generated.apiKey}`,
  );
};

const parseRetryAfterMs = (value: unknown) => {
  if (value == null || value === '') return DEFAULT_RETRY_AFTER_MS;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(asSeconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const asDate = Date.parse(String(value));
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
};

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const send = async <T = unknown>(
  config: HttpRequestConfig,
): Promise<HttpResponse<T>> => {
  const method = (config.method || 'GET').toUpperCase();
  const headers = normalizeHeaders(config.headers);
  applyGeneratedAuth(headers);
  const payload = config.body !== undefined ? config.body : config.data;
  const body = ['GET', 'HEAD'].includes(method)
    ? undefined
    : encodeBody(payload, headers);
  const url = resolveUrl(
    config.url,
    config.baseURL || getDefaultBaseURL(),
    config.params,
  );
  const requestInfo = createRequestInfo(url, method, headers);
  const dispatcher = config.dispatcher ?? getDefaultDispatcher();
  const timeout = config.timeout && config.timeout > 0 ? config.timeout : 0;

  let response: Dispatcher.ResponseData;
  try {
    response = await undiciRequest(url, {
      method: method as Dispatcher.HttpMethod,
      headers,
      dispatcher,
      ...(body !== undefined ? { body } : {}),
      ...(timeout > 0
        ? { headersTimeout: timeout, bodyTimeout: timeout }
        : {}),
    });
  } catch (error) {
    const wrapped = new AxiosError(
      (error as Error)?.message || 'Network Error',
      getNetworkCode(error) || 'ERR_NETWORK',
      config,
      requestInfo,
    );
    Object.defineProperty(wrapped, 'cause', {
      value: error,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    throw wrapped;
  }

  const status = response.statusCode;
  const statusText = STATUS_CODES[status] || '';
  const responseHeaders = headersToObject(response.headers);
  const data = await parseBody(response.body, responseHeaders, config.responseType);

  const httpResponse: HttpResponse<T> = {
    data: data as T,
    status,
    statusText,
    headers: responseHeaders,
  };

  if (status < 200 || status >= 300) {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
      config,
      requestInfo,
      {
        status,
        statusText,
        data,
        headers: responseHeaders,
      },
    );
  }

  return httpResponse;
};

export const request = async <T = unknown>(
  config: HttpRequestConfig,
): Promise<HttpResponse<T>> => {
  const nextConfig: HttpRequestConfig = { ...config };
  try {
    return await send<T>(nextConfig);
  } catch (error) {
    if (!isAxiosError(error)) throw error;

    if (error.response && error.response.status === 429) {
      nextConfig.throttleRetries = (nextConfig.throttleRetries || 0) + 1;
      if (nextConfig.throttleRetries <= MAX_THROTTLE_RETRIES) {
        const header = error.response.headers && error.response.headers['retry-after'];
        await delay(parseRetryAfterMs(header));
        return request<T>(nextConfig);
      }
    }

    const code = error.code || getNetworkCode(error.cause);
    if ((code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') && !nextConfig.didRetry) {
      nextConfig.didRetry = true;
      await delay(50);
      return request<T>(nextConfig);
    }

    throw error;
  }
};

export const get = <T = unknown>(
  url: string,
  config: Omit<HttpRequestConfig, 'url' | 'method' | 'body' | 'data'> = {},
) => request<T>({ ...config, url, method: 'GET' });

export const post = <T = unknown>(
  url: string,
  data?: unknown,
  config: Omit<HttpRequestConfig, 'url' | 'method' | 'body' | 'data'> = {},
) => request<T>({ ...config, url, method: 'POST', data });

export const put = <T = unknown>(
  url: string,
  data?: unknown,
  config: Omit<HttpRequestConfig, 'url' | 'method' | 'body' | 'data'> = {},
) => request<T>({ ...config, url, method: 'PUT', data });

export const patch = <T = unknown>(
  url: string,
  data?: unknown,
  config: Omit<HttpRequestConfig, 'url' | 'method' | 'body' | 'data'> = {},
) => request<T>({ ...config, url, method: 'PATCH', data });

export const del = <T = unknown>(
  url: string,
  config: Omit<HttpRequestConfig, 'url' | 'method' | 'body' | 'data'> = {},
) => request<T>({ ...config, url, method: 'DELETE' });

export { del as delete };

export type HttpClient = {
  <T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
  <T = unknown>(
    url: string,
    config?: Omit<HttpRequestConfig, 'url'>,
  ): Promise<HttpResponse<T>>;
  get: typeof get;
  post: typeof post;
  put: typeof put;
  patch: typeof patch;
  delete: typeof del;
  isAxiosError: typeof isAxiosError;
  AxiosError: typeof AxiosError;
};

export const http: HttpClient = ((
  urlOrConfig: string | HttpRequestConfig,
  maybeConfig?: Omit<HttpRequestConfig, 'url'>,
) => {
  if (typeof urlOrConfig === 'string') {
    return request({ ...(maybeConfig || {}), url: urlOrConfig });
  }
  return request(urlOrConfig);
}) as HttpClient;

http.get = get;
http.post = post;
http.put = put;
http.patch = patch;
http.delete = del;
http.isAxiosError = isAxiosError;
http.AxiosError = AxiosError;

export const axios = http;

export const scrub = (data: unknown): unknown => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => scrub(item));
  }
  const temp: Record<string, unknown> = {};
  for (const key of Object.keys(data as Record<string, unknown>)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'object') {
      temp[key] = scrub(value);
    } else if (SECRET_KEYS.includes(key.toLowerCase())) {
      temp[key] = '********';
    } else {
      temp[key] = value;
    }
  }
  return temp;
};

export const scrubKeys = (err: AxiosError): never => {
  if (!err.request || typeof err.request.headers !== 'object') throw err;
  const temp = scrub(err.request.headers) as Record<string, string>;
  if (err.request.headers.Authorization) {
    const [type, ...rest] = err.request.headers.Authorization.split(' ');
    temp.Authorization = rest.length && type ? `${type} ********` : '********';
  }
  err.request.headers = temp;
  throw err;
};
