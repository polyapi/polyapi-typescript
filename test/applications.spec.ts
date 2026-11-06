/// <reference types="jest" />
import {
  assertApplicationSubdomain,
  assertJoinedOriginLabel,
  buildCanopyV2ApplicationBody,
} from '../src/component/applications';

describe('canopy-v2 application body', () => {
  test('builds version 2 and includes an authenticated root when one is set', () => {
    expect(
      buildCanopyV2ApplicationBody({
        name: 'demo',
        subdomain: 'demo',
        rootComponent: 'myapp.App2',
        authenticatedRoot: 'myapp.AuthenticatedApp',
        environmentSubdomain: 'dev',
      }),
    ).toEqual({
      name: 'demo',
      version: 2,
      subdomain: 'demo',
      rootComponent: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
    });
  });

  test('keeps the display name and omits an unset authenticated root', () => {
    expect(
      buildCanopyV2ApplicationBody({
        name: 'Welcome App',
        subdomain: 'welcome',
        rootComponent: 'myapp.App2',
        environmentSubdomain: 'develop',
      }),
    ).toEqual({
      name: 'Welcome App',
      version: 2,
      subdomain: 'welcome',
      rootComponent: 'myapp.App2',
    });
  });

  test('clears an authenticated root when it is null', () => {
    expect(
      buildCanopyV2ApplicationBody({
        name: 'demo',
        subdomain: 'demo',
        rootComponent: 'myapp.App2',
        authenticatedRoot: null,
        environmentSubdomain: 'dev',
      }).authenticatedRoot,
    ).toBeNull();
  });

  test('rejects a subdomain that does not match the server pattern', () => {
    expect(() => assertApplicationSubdomain('My App')).toThrow(/subdomain/);
    expect(() =>
      buildCanopyV2ApplicationBody({
        name: 'My App',
        subdomain: 'My App',
        rootComponent: 'myapp.App2',
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
