/// <reference types="jest" />
import { request as undiciRequest } from 'undici';
import { createOrUpdateClientFunction, createOrUpdateServerFunction, createOrUpdateClientFunctionWithResponse, createOrUpdateServerFunctionWithResponse } from '../src/api';
import {
  AxiosError,
  get,
  http,
  isAxiosError,
  post,
  request,
  resetHttpDispatchers,
  scrub,
  serializeParams,
} from '../src/http';

jest.mock('undici', () => {
  const actual = jest.requireActual('undici');
  return {
    ...actual,
    request: jest.fn(),
  };
});

const undiciRequestMock = undiciRequest as jest.MockedFunction<typeof undiciRequest>;

const jsonResponse = (
  body: unknown,
  init: { statusCode?: number; headers?: Record<string, string> } = {},
) => {
  const text =
    typeof body === 'string' ? body : JSON.stringify(body);
  const bytes = new TextEncoder().encode(text);
  return {
    statusCode: init.statusCode ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: {
      text: async () => text,
      arrayBuffer: async () => bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    },
  };
};

describe('http client', () => {
  beforeEach(() => {
    undiciRequestMock.mockReset();
    resetHttpDispatchers();
  });

  afterEach(() => {
    resetHttpDispatchers();
  });

  describe('serializeParams', () => {
    test('encodes arrays as repeated bracket keys', () => {
      expect(
        serializeParams({ contexts: ['foo', 'bar'], noTypes: true }),
      ).toBe('contexts%5B%5D=foo&contexts%5B%5D=bar&noTypes=true');
    });

    test('omits null and undefined params', () => {
      expect(serializeParams({ a: '1', b: null, c: undefined })).toBe('a=1');
    });

    test('encodes spaces as plus', () => {
      expect(serializeParams({ q: 'hello world' })).toBe('q=hello+world');
    });
  });

  describe('request encoding', () => {
    test('JSON-stringifies object bodies and sets content-type', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse({ ok: true }) as any);

      await post('https://example.com/x', { hello: 'world' });

      expect(undiciRequestMock).toHaveBeenCalledTimes(1);
      const [url, init] = undiciRequestMock.mock.calls[0];
      expect(url).toBe('https://example.com/x');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ hello: 'world' }));
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init).not.toHaveProperty('maxRedirections');
      expect(init.dispatcher).toBeDefined();
    });

    test('does not clone bodies so Proxy toJSON is preserved', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse({ ok: true }) as any);
      const inject = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'toJSON') {
              return () => ({
                type: 'PolyVariable',
                id: 'abc',
                path: '$.foo',
              });
            }
            return undefined;
          },
        },
      );

      await post('https://example.com/x', { arg: inject });

      const [, init] = undiciRequestMock.mock.calls[0];
      expect(JSON.parse(init.body as string)).toEqual({
        arg: { type: 'PolyVariable', id: 'abc', path: '$.foo' },
      });
    });

    test('sends string bodies as-is and preserves content-type', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse({ ok: true }) as any);

      await post('https://example.com/x', 'openapi: 3.0.0', {
        headers: { 'Content-Type': 'text/plain' },
      });

      const [, init] = undiciRequestMock.mock.calls[0];
      expect(init.body).toBe('openapi: 3.0.0');
      expect(init.headers['Content-Type']).toBe('text/plain');
    });

    test('appends array query params on GET', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse([]) as any);

      await get('https://example.com/specs', {
        params: { contexts: ['a', 'b'], noTypes: false },
      });

      expect(undiciRequestMock.mock.calls[0][0]).toBe(
        'https://example.com/specs?contexts%5B%5D=a&contexts%5B%5D=b&noTypes=false',
      );
    });
  });

  describe('response parsing', () => {
    test('parses JSON responses', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse({ id: '1' }) as any);
      const response = await get('https://example.com/x');
      expect(response.data).toEqual({ id: '1' });
      expect(response.status).toBe(200);
    });

    test('keeps invalid JSON as text', async () => {
      undiciRequestMock.mockResolvedValue(
        jsonResponse('{not json', {
          headers: { 'content-type': 'application/json' },
        }) as any,
      );
      const response = await get('https://example.com/x');
      expect(response.data).toBe('{not json');
    });

    test('returns empty string for empty bodies', async () => {
      undiciRequestMock.mockResolvedValue({
        statusCode: 204,
        headers: {},
        body: {
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
        },
      } as any);
      const response = await request({
        url: 'https://example.com/x',
        method: 'DELETE',
      });
      expect(response.data).toBe('');
      expect(response.status).toBe(204);
    });

    test('returns a Buffer for arraybuffer responseType', async () => {
      const bytes = new TextEncoder().encode('zip');
      undiciRequestMock.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body: {
          text: async () => 'zip',
          arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        },
      } as any);
      const response = await get('https://example.com/file.zip', {
        responseType: 'arraybuffer',
      });
      expect(Buffer.isBuffer(response.data)).toBe(true);
      expect(response.data.toString()).toBe('zip');
    });

    test('lowercases response header names', async () => {
      undiciRequestMock.mockResolvedValue(
        jsonResponse(
          {},
          { headers: { 'X-Poly-Execution-Duration': '12' } },
        ) as any,
      );
      const response = await get('https://example.com/x');
      expect(response.headers['x-poly-execution-duration']).toBe('12');
    });
  });

  describe('errors', () => {
    test.each([createOrUpdateClientFunctionWithResponse, createOrUpdateServerFunctionWithResponse])('source API retains the full HTTP response and does not retry uploads', async (upload) => {
      const previousBase = process.env.POLY_API_BASE_URL;
      process.env.POLY_API_BASE_URL = 'https://example.com';
      try {
        const body = { id: 'synthetic-id', warnings: ['synthetic warning'], traceId: 'trace-1' };
        undiciRequestMock.mockResolvedValue(jsonResponse(body, { statusCode: 201,
          headers: { 'x-request-id': 'request-1' } }) as unknown as Awaited<ReturnType<typeof undiciRequest>>);
        const call = () => upload('example', 'canary', null, 'return 1', 'ENVIRONMENT', {}, null, null);
        expect(await call()).toMatchObject({ status: 201, data: body, headers: { 'x-request-id': 'request-1' } });
        undiciRequestMock.mockClear();
        undiciRequestMock.mockResolvedValue(jsonResponse({ message: 'throttled' }, { statusCode: 429,
          headers: { 'retry-after': '0' } }) as unknown as Awaited<ReturnType<typeof undiciRequest>>);
        await expect(call()).rejects.toMatchObject({ response: { status: 429, data: { message: 'throttled' } } });
        expect(undiciRequestMock).toHaveBeenCalledTimes(1);
      } finally {
        if (previousBase === undefined) delete process.env.POLY_API_BASE_URL;
        else process.env.POLY_API_BASE_URL = previousBase;
      }
    });

    test.each([createOrUpdateClientFunction, createOrUpdateServerFunction])('existing source API callers still receive the DTO without upload retries', async (upload) => {
      const previousBase = process.env.POLY_API_BASE_URL;
      process.env.POLY_API_BASE_URL = 'https://example.com';
      try {
        const body = { id: 'synthetic-id', warnings: ['synthetic warning'], traceId: 'trace-1' };
        undiciRequestMock.mockResolvedValue(jsonResponse(body, { statusCode: 201 }) as unknown as Awaited<ReturnType<typeof undiciRequest>>);
        const call = () => upload('example', 'canary', null, 'return 1', 'ENVIRONMENT', {}, null, null);
        const result = await call();
        expect(result.id).toBe(body.id);
        expect(result).toEqual(body);
        undiciRequestMock.mockClear();
        undiciRequestMock.mockResolvedValue(jsonResponse({ message: 'throttled' }, { statusCode: 429,
          headers: { 'retry-after': '0' } }) as unknown as Awaited<ReturnType<typeof undiciRequest>>);
        await expect(call()).rejects.toMatchObject({ response: { status: 429 } });
        expect(undiciRequestMock).toHaveBeenCalledTimes(1);
      } finally {
        if (previousBase === undefined) delete process.env.POLY_API_BASE_URL;
        else process.env.POLY_API_BASE_URL = previousBase;
      }
    });

    test('does not resend an explicitly bounded write after throttling', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse({ warning: 'unchanged' }, {
        statusCode: 429, headers: { 'retry-after': '0' },
      }) as unknown as Awaited<ReturnType<typeof undiciRequest>>);
      await expect(post('https://example.com/deploy', { code: 'return 1' }, { retry: false }))
        .rejects.toMatchObject({ response: { status: 429, data: { warning: 'unchanged' } } });
      expect(undiciRequestMock).toHaveBeenCalledTimes(1);
    });

    test('does not resend an explicitly bounded write after an uncertain socket reset', async () => {
      undiciRequestMock.mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
      await expect(post('https://example.com/deploy', { code: 'return 1' }, { retry: false }))
        .rejects.toMatchObject({ code: 'ECONNRESET' });
      expect(undiciRequestMock).toHaveBeenCalledTimes(1);
    });

    test('throws AxiosError on 4xx with response data', async () => {
      undiciRequestMock.mockResolvedValue(
        jsonResponse(
          { message: 'nope', code: 'BAD' },
          { statusCode: 400 },
        ) as any,
      );

      expect.assertions(8);
      try {
        await get('https://example.com/x');
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        expect((error as AxiosError).constructor.name).toBe('AxiosError');
        expect((error as AxiosError).name).toBe('AxiosError');
        expect((error as AxiosError).isAxiosError).toBe(true);
        expect(isAxiosError(error)).toBe(true);
        expect((error as AxiosError).response?.status).toBe(400);
        expect((error as AxiosError).response?.data).toEqual({
          message: 'nope',
          code: 'BAD',
        });
        expect((error as AxiosError).status).toBe(400);
      }
    });

    test('network errors have no response and keep the cause code', async () => {
      const networkError = new Error('connect ECONNREFUSED');
      Object.assign(networkError, { code: 'ECONNREFUSED' });
      undiciRequestMock.mockRejectedValue(networkError);

      expect.assertions(5);
      try {
        await get('https://example.com/x');
      } catch (error) {
        expect(isAxiosError(error)).toBe(true);
        expect((error as AxiosError).response).toBeUndefined();
        expect((error as AxiosError).code).toBe('ECONNREFUSED');
        expect((error as AxiosError).message).toBe('connect ECONNREFUSED');
        expect((error as AxiosError).cause).toBe(networkError);
      }
    });

    test('retries 429 responses using Retry-After', async () => {
      undiciRequestMock
        .mockResolvedValueOnce(
          jsonResponse(
            { error: 'slow down' },
            { statusCode: 429, headers: { 'retry-after': '0' } },
          ) as any,
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true }) as any);

      const response = await get('https://example.com/x');
      expect(response.data).toEqual({ ok: true });
      expect(undiciRequestMock).toHaveBeenCalledTimes(2);
    });

    test('retries ECONNRESET once', async () => {
      const reset = new Error('socket hang up');
      Object.assign(reset, { code: 'ECONNRESET' });
      undiciRequestMock
        .mockRejectedValueOnce(reset)
        .mockResolvedValueOnce(jsonResponse({ ok: true }) as any);

      const response = await get('https://example.com/x');
      expect(response.data).toEqual({ ok: true });
      expect(undiciRequestMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('callable client', () => {
    test('http(url) and http.post match the named helpers', async () => {
      undiciRequestMock.mockResolvedValue(jsonResponse({ ok: true }) as any);

      await http('https://example.com/x', { method: 'GET' });
      await http.post('https://example.com/x', { a: 1 });

      expect(undiciRequestMock).toHaveBeenCalledTimes(2);
      expect(undiciRequestMock.mock.calls[0][1].method).toBe('GET');
      expect(undiciRequestMock.mock.calls[1][1].method).toBe('POST');
    });
  });

  describe('scrub', () => {
    test('redacts secret keys', () => {
      expect(
        scrub({
          token: 'secret',
          nested: { password: 'p', ok: 1 },
        }),
      ).toEqual({
        token: '********',
        nested: { password: '********', ok: 1 },
      });
    });
  });
});
