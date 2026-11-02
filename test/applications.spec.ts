/// <reference types="jest" />
import { request as undiciRequest } from 'undici';
import { resetHttpDispatchers } from '../src/http';
import { addCanopyV2Application } from '../src/component/applications';

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

const authResponse = (environmentSubdomain = 'dev') =>
  jsonResponse({
    tenant: { id: 'tenant-1' },
    environment: { id: 'env-1', subdomain: environmentSubdomain },
  });

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

  test('create posts version 2 and defaults subdomain from the name', async () => {
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.endsWith('/auth') && method === 'GET') {
        return authResponse() as any;
      }
      return jsonResponse(
        {
          id: 'app-1',
          name: 'demo',
          version: 2,
          subdomain: 'demo',
        },
        { statusCode: 201 },
      ) as any;
    });

    const saved = await addCanopyV2Application({
      name: 'demo',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
    });
    expect(saved.updating).toBe(false);

    const post = undiciRequestMock.mock.calls.find(
      ([url, init]) =>
        String(url) === 'https://poly.example.test/applications' &&
        String(init?.method) === 'POST',
    );
    expect(post).toBeDefined();
    expect((post?.[1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    );
    expect((post?.[1]?.headers as Record<string, string>)['x-poly-api-version']).toBe(
      '',
    );
    expect(parseBody(post?.[1])).toEqual({
      name: 'demo',
      version: 2,
      subdomain: 'demo',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
    });
    expect(parseBody(post?.[1]).runtime).toBeUndefined();
    expect(parseBody(post?.[1]).vendorHash).toBeUndefined();
  });

  test('create sends an explicit subdomain and leaves the display name alone', async () => {
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.endsWith('/auth') && method === 'GET') {
        return authResponse('develop') as any;
      }
      return jsonResponse({ id: 'app-1', name: 'Welcome App' }) as any;
    });

    await addCanopyV2Application({
      name: 'Welcome App',
      subdomain: 'welcome',
      rootComponent: 'myapp.App2',
    });

    const post = undiciRequestMock.mock.calls.find(
      ([, init]) => String(init?.method) === 'POST',
    );
    expect(parseBody(post?.[1])).toEqual({
      name: 'Welcome App',
      version: 2,
      subdomain: 'welcome',
      rootComponent: 'myapp.App2',
    });
    expect(parseBody(post?.[1]).runtime).toBeUndefined();
  });

  test('rejects a subdomain that does not match the server pattern', async () => {
    await expect(
      addCanopyV2Application({
        name: 'My App',
        rootComponent: 'myapp.App2',
      }),
    ).rejects.toThrow(/subdomain/);
    expect(undiciRequestMock).not.toHaveBeenCalled();
  });

  test('rejects an origin label that is not a DNS label', async () => {
    undiciRequestMock.mockImplementation(async () => authResponse('a'.repeat(40)) as any);

    await expect(
      addCanopyV2Application({
        name: 'b'.repeat(30),
        rootComponent: 'myapp.App2',
      }),
    ).rejects.toThrow(/DNS label/);
    expect(
      undiciRequestMock.mock.calls.some(([, init]) => String(init?.method) === 'POST'),
    ).toBe(false);
  });

  test('add patches the application matched by subdomain and sets the display name', async () => {
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.endsWith('/auth') && method === 'GET') {
        return authResponse() as any;
      }
      if (href.endsWith('/applications') && method === 'GET') {
        return jsonResponse([
          {
            id: 'by-name',
            name: 'demo',
            version: 2,
            subdomain: 'other',
            rootComponent: 'other.App',
          },
          {
            id: 'app-1',
            name: 'Welcome display',
            version: 2,
            subdomain: 'demo',
            rootComponent: 'myapp.App2',
            authenticatedRoot: 'myapp.AuthenticatedApp',
          },
        ]) as any;
      }
      return jsonResponse({
        id: 'app-1',
        name: 'Welcome display',
        version: 2,
        subdomain: 'demo',
      }) as any;
    });

    const saved = await addCanopyV2Application({
      name: 'Welcome display',
      subdomain: 'demo',
      rootComponent: 'myapp.App2',
    });
    expect(saved.updating).toBe(true);

    const patch = undiciRequestMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/applications/app-1') &&
        String(init?.method) === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(parseBody(patch?.[1])).toEqual({
      name: 'Welcome display',
      version: 2,
      subdomain: 'demo',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
    });
    expect(parseBody(patch?.[1]).runtime).toBeUndefined();
    expect(
      undiciRequestMock.mock.calls.some(([url]) =>
        String(url).includes('/applications/by-name'),
      ),
    ).toBe(false);
  });
});
