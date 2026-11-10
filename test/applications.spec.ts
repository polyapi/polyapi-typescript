/// <reference types="jest" />
import * as api from '../src/api';
import {
  addCanopyV2Application,
  assertApplicationSubdomain,
  assertJoinedOriginLabel,
  buildCanopyV2ApplicationBody,
  parseApplicationRoots,
  resolveCanopyV2WriteConfig,
} from '../src/component/applications';

describe('canopy-v2 application body', () => {
  test('sends roots and publicAccess inside config', () => {
    expect(
      buildCanopyV2ApplicationBody({
        name: 'demo',
        subdomain: 'demo',
        environmentSubdomain: 'dev',
        config: {
          roots: {
            '/': { component: 'myapp.App' },
            '/settings': { component: 'myapp.Settings' },
          },
          publicAccess: true,
        },
      }),
    ).toEqual({
      name: 'demo',
      version: 2,
      subdomain: 'demo',
      config: {
        roots: {
          '/': { component: 'myapp.App' },
          '/settings': { component: 'myapp.Settings' },
        },
        publicAccess: true,
      },
    });
  });

  test('omits config when an update changes neither roots nor publicAccess', () => {
    expect(
      buildCanopyV2ApplicationBody({
        name: 'Welcome App',
        subdomain: 'welcome',
        environmentSubdomain: 'develop',
      }),
    ).toEqual({
      name: 'Welcome App',
      version: 2,
      subdomain: 'welcome',
    });
  });

  test('parses repeatable path:component roots and requires "/"', () => {
    expect(
      parseApplicationRoots(['/:myapp.App', '/settings:myapp.Settings']),
    ).toEqual({
      '/': { component: 'myapp.App' },
      '/settings': { component: 'myapp.Settings' },
    });
    expect(() => parseApplicationRoots(['/settings:myapp.Settings'])).toThrow(
      /\//,
    );
    expect(() => parseApplicationRoots(['myapp.App'])).toThrow(/path/);
    expect(() =>
      parseApplicationRoots(['/:myapp.App', '/:myapp.Other']),
    ).toThrow(/more than once/);
  });

  test('replaces the roots map and keeps the stored publicAccess flag', () => {
    expect(
      resolveCanopyV2WriteConfig({
        creating: false,
        roots: { '/': { component: 'myapp.App' } },
        existingConfig: {
          publicAccess: true,
          roots: {
            '/': { component: 'myapp.Old', id: 'old-id' },
            '/settings': { component: 'myapp.Settings', id: 'settings-id' },
          },
        },
      }),
    ).toEqual({
      roots: { '/': { component: 'myapp.App' } },
      publicAccess: true,
    });
  });

  test('clears publicAccess and resends stored components without ids', () => {
    expect(
      resolveCanopyV2WriteConfig({
        creating: false,
        publicAccess: false,
        existingConfig: {
          publicAccess: true,
          roots: {
            '/': { component: 'myapp.App', id: 'root-id' },
          },
        },
      }),
    ).toEqual({
      roots: { '/': { component: 'myapp.App' } },
      publicAccess: false,
    });
  });

  test('defaults publicAccess to false when creating', () => {
    expect(
      resolveCanopyV2WriteConfig({
        creating: true,
        roots: { '/': { component: 'myapp.App' } },
      }),
    ).toEqual({
      roots: { '/': { component: 'myapp.App' } },
      publicAccess: false,
    });
    expect(() => resolveCanopyV2WriteConfig({ creating: true })).toThrow(
      /root at "\/"/,
    );
  });

  test('rejects a subdomain that does not match the server pattern', () => {
    expect(() => assertApplicationSubdomain('My App')).toThrow(/subdomain/);
    expect(() =>
      buildCanopyV2ApplicationBody({
        name: 'My App',
        subdomain: 'My App',
        environmentSubdomain: 'dev',
      }),
    ).toThrow(/subdomain/);
  });

  test('rejects an origin label that is not a DNS label', () => {
    expect(() =>
      assertJoinedOriginLabel('b'.repeat(30), 'a'.repeat(40)),
    ).toThrow(/DNS label/);
  });
});

describe('addCanopyV2Application', () => {
  const previousEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...previousEnv,
      POLY_API_BASE_URL: 'http://localhost:8000',
      POLY_API_KEY: 'test-key',
    };
    jest.spyOn(api, 'getAuthData').mockResolvedValue({
      environment: { subdomain: 'dev' },
    } as Awaited<ReturnType<typeof api.getAuthData>>);
  });

  afterEach(() => {
    process.env = previousEnv;
    jest.restoreAllMocks();
  });

  test('patches the same subdomain and does not merge roots with the server', async () => {
    jest.spyOn(api, 'listApplications').mockResolvedValue([
      { id: 'app-1', name: 'demo', version: 2, subdomain: 'demo' },
    ]);
    jest.spyOn(api, 'getApplication').mockResolvedValue({
      id: 'app-1',
      name: 'demo',
      version: 2,
      subdomain: 'demo',
      config: {
        publicAccess: true,
        roots: {
          '/': { component: 'myapp.Old', id: 'old-id' },
          '/settings': { component: 'myapp.Settings', id: 'settings-id' },
        },
      },
    });
    const update = jest.spyOn(api, 'updateApplication').mockResolvedValue({
      id: 'app-1',
      name: 'demo',
    });
    const create = jest.spyOn(api, 'createApplication');

    const saved = await addCanopyV2Application({
      name: 'demo',
      roots: { '/': { component: 'myapp.App' } },
    });

    expect(saved.updating).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('app-1', {
      name: 'demo',
      version: 2,
      subdomain: 'demo',
      config: {
        roots: { '/': { component: 'myapp.App' } },
        publicAccess: true,
      },
    });
  });

  test('leaves roots and publicAccess unchanged when the update omits both', async () => {
    jest.spyOn(api, 'listApplications').mockResolvedValue([
      { id: 'app-1', name: 'demo', version: 2, subdomain: 'demo' },
    ]);
    const get = jest.spyOn(api, 'getApplication');
    const update = jest.spyOn(api, 'updateApplication').mockResolvedValue({
      id: 'app-1',
      name: 'Renamed',
    });

    await addCanopyV2Application({ name: 'Renamed', subdomain: 'demo' });

    expect(get).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('app-1', {
      name: 'Renamed',
      version: 2,
      subdomain: 'demo',
    });
  });
});
