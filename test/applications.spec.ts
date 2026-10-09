/// <reference types="jest" />
import { request as undiciRequest } from 'undici';
import { resetHttpDispatchers } from '../src/http';
import {
  createCanopyV2Application,
  updateCanopyV2Application,
} from '../src/component/applications';

jest.mock('undici', () => {
  const actual = jest.requireActual('undici');
  return {
    ...actual,
    request: jest.fn(),
  };
});

const undiciRequestMock = undiciRequest as jest.MockedFunction<
  typeof undiciRequest
>;

const jsonResponse = (
  body: unknown,
  init: { statusCode?: number; headers?: Record<string, string> } = {},
) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const bytes = new TextEncoder().encode(text);
  return {
    statusCode: init.statusCode ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: {
      text: async () => text,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    },
  };
};

const parseBody = (init?: { body?: unknown }) => {
  if (init?.body == null || init.body === '') return {};
  try {
    return JSON.parse(String(init.body));
  } catch {
    return {};
  }
};

describe('canopy-v2 applications', () => {
  const prevBaseUrl = process.env.POLY_API_BASE_URL;
  const prevApiKey = process.env.POLY_API_KEY;

  beforeEach(() => {
    process.env.POLY_API_BASE_URL = 'https://poly.example.test';
    process.env.POLY_API_KEY = 'test-token';
    undiciRequestMock.mockReset();
    resetHttpDispatchers();
  });

  afterEach(() => {
    resetHttpDispatchers();
    if (prevBaseUrl === undefined) delete process.env.POLY_API_BASE_URL;
    else process.env.POLY_API_BASE_URL = prevBaseUrl;
    if (prevApiKey === undefined) delete process.env.POLY_API_KEY;
    else process.env.POLY_API_KEY = prevApiKey;
  });

  test('create posts the canopy-v2 payload', async () => {
    undiciRequestMock.mockImplementation(async () => {
      return jsonResponse(
        { id: 'app-1', name: 'demo', config: { subpath: 'welcome' } },
        { statusCode: 201 },
      ) as any;
    });

    await createCanopyV2Application({
      name: 'demo',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
      subpath: 'welcome',
    });

    expect(undiciRequestMock).toHaveBeenCalledTimes(1);
    const [url, init] = undiciRequestMock.mock.calls[0];
    expect(String(url)).toBe('https://poly.example.test/applications');
    expect(String(init?.method)).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    );
    expect(parseBody(init)).toEqual({
      name: 'demo',
      runtime: 'canopy-v2',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
      config: { subpath: 'welcome' },
    });
    expect(parseBody(init).vendorHash).toBeUndefined();
  });

  test('rejects an application name that is not hostname-safe', async () => {
    await expect(
      createCanopyV2Application({
        name: 'My App',
        rootComponent: 'myapp.App2',
        subpath: 'welcome',
      }),
    ).rejects.toThrow(/hostname label/);
    expect(undiciRequestMock).not.toHaveBeenCalled();
  });

  test('update patches the matched application', async () => {
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.endsWith('/applications') && method === 'GET') {
        return jsonResponse([
          {
            id: 'app-1',
            name: 'demo',
            runtime: 'canopy-v2',
            rootComponent: 'myapp.App2',
            authenticatedRoot: 'myapp.AuthenticatedApp',
            config: { subpath: 'welcome' },
          },
        ]) as any;
      }
      return jsonResponse({
        id: 'app-1',
        name: 'demo',
        config: { subpath: 'welcome' },
      }) as any;
    });

    await updateCanopyV2Application({
      nameOrId: 'demo',
      rootComponent: 'myapp.App2',
      subpath: 'welcome',
    });

    const patch = undiciRequestMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/applications/app-1') &&
        String(init?.method) === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(parseBody(patch?.[1])).toEqual({
      name: 'demo',
      runtime: 'canopy-v2',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
      config: { subpath: 'welcome' },
    });
  });
});
