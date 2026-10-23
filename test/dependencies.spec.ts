/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as api from '../src/api';
import { generateTypeSchemas, getDependencies } from '../src/transpiler';
import * as utils from '../src/utils';

jest.spyOn(utils, 'getPolyLibPath').mockReturnValue('/tmp/poly-lib');
jest.spyOn(utils, 'writeCachedSpecs').mockImplementation(() => undefined);

const spec = (type: string, contextName: string, id = contextName) => ({
  id,
  type,
  name: contextName.split('.').pop(),
  context: contextName.split('.').slice(0, -1).join('.'),
  contextName,
  visibilityMetadata: { visibility: 'ENVIRONMENT' },
});

const SPECS = [
  spec('serverFunction', 'orders.create'),
  spec('serverVariable', 'foo.shopId', 'var-shop'),
  spec('serverVariable', 'foo.acme.config', 'var-acme'),
  spec('table', 'orders.lines', 'table-lines'),
  spec('schema', 'aaron.testing.ProjectApiKeyDeleteResponse', 'schema-1'),
  spec('schema', 'foo.bar.Baz', 'schema-baz'),
  spec('apiFunction', 'OOB.foo.bar', 'oob-1'),
];

beforeEach(() => {
  (utils.getCachedSpecs as jest.Mock).mockReturnValue(SPECS);
  (api.getSpecs as jest.Mock).mockResolvedValue(SPECS);
});

jest.spyOn(utils, 'getCachedSpecs');
jest.spyOn(api, 'getSpecs');

async function deps(code: string, ignore = false): Promise<[any, any, any]> {
  return getDependencies(code, '/tmp/fn.ts', undefined, ignore);
}

describe('function dependency tracking', () => {
  test('records a static vari inject', async () => {
    const [, internal] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.foo.shopId.inject();
      }
    `);
    expect(internal).toEqual({
      serverVariable: [{ path: 'foo.shopId', id: 'var-shop' }],
    });
  });

  test('records each dynamic vari segment as a wildcard', async () => {
    const [, direct] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        return vari.foo[clientId].inject();
      }
    `);
    const [, nested] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        return vari.foo[clientId].config.inject();
      }
    `);
    const [, customer] = await deps(`
      import { vari } from 'polyapi';
      export async function f(customerCode: string) {
        return vari.foo.bar[customerCode].get();
      }
    `);
    const [, both] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string, shopId: string) {
        return vari.foo[clientId].bar[shopId].inject();
      }
    `);
    expect(direct).toEqual({ serverVariable: [{ path: 'foo.*' }] });
    expect(nested).toEqual({ serverVariable: [{ path: 'foo.*.config' }] });
    expect(customer).toEqual({ serverVariable: [{ path: 'foo.bar.*' }] });
    expect(both).toEqual({ serverVariable: [{ path: 'foo.*.bar.*' }] });
  });

  test('keeps a leading dynamic segment in the path', async () => {
    const [, nested] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        return vari[clientId].config.get();
      }
    `);
    const [, root] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        return vari[clientId].inject();
      }
    `);
    expect(nested).toEqual({ serverVariable: [{ path: '*.config' }] });
    expect(root).toEqual({ serverVariable: [{ path: '*' }] });
  });

  test('reads static brackets, template literals, and optional chains', async () => {
    const [, optional] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        return vari.foo?.[clientId]?.inject();
      }
    `);
    const [, literal] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.foo['shopId'].inject();
      }
    `);
    const [, template] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.foo[\`shopId\`].inject();
      }
    `);
    expect(optional).toEqual({ serverVariable: [{ path: 'foo.*' }] });
    expect(literal?.serverVariable?.[0].path).toBe('foo.shopId');
    expect(template?.serverVariable?.[0].path).toBe('foo.shopId');
  });

  test('follows aliases through dynamic segments and calls', async () => {
    const [, aliased] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        const foo = vari.foo;
        return foo[clientId].inject();
      }
    `);
    const [, element] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        const client = vari.foo[clientId];
        return client.inject();
      }
    `);
    const [, chained] = await deps(`
      import { vari } from 'polyapi';
      export async function f(clientId: string) {
        const foo = vari.foo;
        const bar = foo.bar;
        return bar[clientId].inject();
      }
    `);
    const [, called] = await deps(`
      import poly from 'polyapi';
      export async function f() {
        const create = poly.orders.create;
        return create();
      }
    `);
    expect(aliased).toEqual({ serverVariable: [{ path: 'foo.*' }] });
    expect(element).toEqual({ serverVariable: [{ path: 'foo.*' }] });
    expect(chained).toEqual({ serverVariable: [{ path: 'foo.bar.*' }] });
    expect(called?.serverFunction?.[0].path).toBe('orders.create');
  });

  test('keeps calls that are destructured', async () => {
    const [, internal] = await deps(`
      import poly from 'polyapi';
      export async function f() {
        const { id } = await poly.orders.create();
        return id;
      }
    `);
    expect(internal?.serverFunction?.[0].path).toBe('orders.create');
  });

  test('tracks namespace imports, require imports, and default vari paths', async () => {
    const [, namespace] = await deps(`
      import * as poly from 'polyapi';
      export async function f() {
        return poly.orders.create();
      }
    `);
    const [, required] = await deps(`
      import poly = require('polyapi');
      export async function f() {
        return poly.orders.create();
      }
    `);
    const [, throughDefault] = await deps(`
      import poly from 'polyapi';
      export async function f() {
        return poly.vari.foo.shopId.inject();
      }
    `);
    expect(namespace?.serverFunction?.[0].path).toBe('orders.create');
    expect(required?.serverFunction?.[0].path).toBe('orders.create');
    expect(throughDefault?.serverVariable?.[0].path).toBe('foo.shopId');
  });

  test('unwraps parentheses, assertions, and non-null', async () => {
    const [, wrapped] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return (vari.foo.shopId).inject();
      }
    `);
    const [, asserted] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return (vari.foo.shopId as any).inject();
      }
    `);
    const [, nonNull] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.foo.shopId!.inject();
      }
    `);
    expect(wrapped?.serverVariable?.[0].path).toBe('foo.shopId');
    expect(asserted?.serverVariable?.[0].path).toBe('foo.shopId');
    expect(nonNull?.serverVariable?.[0].path).toBe('foo.shopId');
  });

  test('records context gets and vari.onUpdate paths', async () => {
    const [, contextGet] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.foo.get();
      }
    `);
    const [, variableGet] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.foo.shopId.get();
      }
    `);
    const [, listen] = await deps(`
      import { vari } from 'polyapi';
      export async function f() {
        return vari.onUpdate('foo.shopId', () => undefined);
      }
    `);
    const [, listenAll] = await deps(`
      import { vari } from 'polyapi';
      export async function f(path: string) {
        return vari.onUpdate(path, () => undefined);
      }
    `);
    expect(contextGet).toEqual({ contexts: ['foo'] });
    expect(variableGet?.serverVariable?.[0].path).toBe('foo.shopId');
    expect(listen).toEqual({ contexts: ['foo.shopId'] });
    expect(listenAll).toEqual({ contexts: ['*'] });
  });

  test('tracks tabi calls and renamed namespace imports', async () => {
    const [, table] = await deps(`
      import { tabi } from 'polyapi';
      export async function f() {
        return tabi.orders.lines.selectOne({});
      }
    `);
    const [, dynamicTable] = await deps(`
      import { tabi } from 'polyapi';
      export async function f(name: string) {
        return tabi.orders[name].selectOne({});
      }
    `);
    const [, renamed] = await deps(`
      import { OOB as Box } from 'polyapi';
      export async function f() {
        return Box.foo.bar();
      }
    `);
    expect(table?.table?.[0].path).toBe('orders.lines');
    expect(dynamicTable).toEqual({ table: [{ path: 'orders.*' }] });
    expect(renamed?.apiFunction?.[0].path).toBe('OOB.foo.bar');
  });

  test('keeps distinct wildcard segments that share a string prefix', async () => {
    const [, internal] = await deps(`
      import { vari } from 'polyapi';
      export async function f(a: string, b: string) {
        vari.foo[a].inject();
        vari.foobar[b].inject();
        vari.foo.shop[a].inject();
        vari.foo[a].inject();
      }
    `);
    expect(internal).toEqual({
      serverVariable: [
        { path: 'foo.*' },
        { path: 'foobar.*' },
        { path: 'foo.shop.*' },
      ],
    });
  });

  test('records lock and queue wildcards on their own types', async () => {
    const [, internal] = await deps(`
      import { loxi, que } from 'polyapi';
      export async function f(room: string, name: string) {
        loxi.rooms[room].acquire();
        que.events[name].publish({});
      }
    `);
    expect(internal).toEqual({
      lock: [{ path: 'rooms.*' }],
      queue: [{ path: 'events.*' }],
    });
  });

  test('resolves schema references, aliases, indexed access, and heritage', async () => {
    const [, direct, directRefs] = await deps(`
      export async function f(
        input: schemas.Aaron.Testing.ProjectApiKeyDeleteResponse,
      ): Promise<schemas.Foo.Bar.Baz> {
        return input as any;
      }
    `);
    const [, aliased, aliasedRefs] = await deps(`
      import { schemas as PolySchemas } from 'polyapi';
      export async function f(
        input: PolySchemas.Aaron.Testing.ProjectApiKeyDeleteResponse,
      ): Promise<void> {
        return;
      }
    `);
    const [, indexed, indexedRefs] = await deps(`
      export async function f(
        input: schemas.Aaron['Testing']['ProjectApiKeyDeleteResponse'],
      ): Promise<void> {
        return;
      }
    `);
    const [, inherited] = await deps(`
      interface Input extends schemas.Aaron.Testing.ProjectApiKeyDeleteResponse {}
      export async function f(input: Input): Promise<void> {
        return;
      }
    `);
    const [, forwarded, forwardedRefs] = await deps(`
      type Second = First;
      type First = schemas.Foo.Bar.Baz;
      export async function f(input: Second): Promise<void> {
        return;
      }
    `);

    expect(direct?.schema?.map((item) => item.path).sort()).toEqual([
      'aaron.testing.ProjectApiKeyDeleteResponse',
      'foo.bar.Baz',
    ]);
    expect(
      aliasedRefs['PolySchemas.Aaron.Testing.ProjectApiKeyDeleteResponse'],
    ).toEqual({
      'x-poly-ref': { path: 'aaron.testing.ProjectApiKeyDeleteResponse' },
    });
    expect(aliased?.schema?.[0].id).toBe('schema-1');
    expect(
      indexedRefs["schemas.Aaron['Testing']['ProjectApiKeyDeleteResponse']"],
    ).toEqual({
      'x-poly-ref': { path: 'aaron.testing.ProjectApiKeyDeleteResponse' },
    });
    expect(indexed?.schema?.[0].path).toBe(
      'aaron.testing.ProjectApiKeyDeleteResponse',
    );
    expect(inherited?.schema?.[0].path).toBe(
      'aaron.testing.ProjectApiKeyDeleteResponse',
    );
    expect(forwardedRefs.Second).toEqual({
      'x-poly-ref': { path: 'foo.bar.Baz' },
    });
    expect(forwarded?.schema?.[0].path).toBe('foo.bar.Baz');
  });

  test('reports an unresolved poly path unless dependencies are ignored', async () => {
    const code = `
      import poly from 'polyapi';
      export async function f() {
        return poly.missing.thing();
      }
    `;
    await expect(deps(code, false)).rejects.toThrow(/missing\.thing/);
    const [, internal] = await deps(code, true);
    expect(internal?.serverFunction).toBeUndefined();
  });

  test('collects runtime packages and skips types, polyapi, and node built-ins', async () => {
    const [external] = await deps(`
      import lodash from 'lodash';
      import get from 'lodash/get';
      import type { Z } from 'zod';
      import axios from 'axios';
      import fs from 'fs';
      import fsp from 'fs/promises';
      import { vari } from 'polyapi';
      export { format } from 'prettier';
      export async function f() {
        const dyn = await import('chalk');
        const req = require('yargs');
        return lodash && get && dyn && req && fs && fsp && vari && axios;
      }
    `);
    expect(external).toEqual({
      lodash: '4.18.1',
      chalk: '4.1.2',
      yargs: '17.7.1',
      prettier: '3.9.6',
    });
  });

  test('resolves tsconfig path aliases as local modules', async () => {
    const file = path.join(__dirname, 'fixtures/dep-paths/fn.ts');
    const [external] = await getDependencies(
      fs.readFileSync(file, 'utf8'),
      file,
      undefined,
      false,
    );
    expect(external).toBeUndefined();
  });
});

describe('poly schema refs in generated type schemas', () => {
  const schemaRef = {
    'schemas.Aaron.Testing.ProjectApiKeyDeleteResponse': {
      'x-poly-ref': { path: 'aaron.testing.ProjectApiKeyDeleteResponse' },
    },
    Input: {
      'x-poly-ref': { path: 'aaron.testing.ProjectApiKeyDeleteResponse' },
    },
  };

  test('substitutes a direct schema annotation and a type alias', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-schema-'));
    const direct = path.join(dir, 'direct.ts');
    fs.writeFileSync(
      direct,
      `
      declare namespace schemas {
        namespace Aaron {
          namespace Testing {
            type ProjectApiKeyDeleteResponse = { id: string };
          }
        }
      }
      export async function f(input: schemas.Aaron.Testing.ProjectApiKeyDeleteResponse): Promise<void> {
        return;
      }
      `,
    );
    const alias = path.join(dir, 'alias.ts');
    fs.writeFileSync(
      alias,
      `
      declare namespace schemas {
        namespace Aaron {
          namespace Testing {
            type ProjectApiKeyDeleteResponse = { id: string };
          }
        }
      }
      type Input = schemas.Aaron.Testing.ProjectApiKeyDeleteResponse;
      export async function f(input: Input): Promise<void> {
        return;
      }
      `,
    );
    expect(
      generateTypeSchemas(direct, [], 'f', schemaRef)[
        'schemas.Aaron.Testing.ProjectApiKeyDeleteResponse'
      ],
    ).toEqual(schemaRef['schemas.Aaron.Testing.ProjectApiKeyDeleteResponse']);
    expect(generateTypeSchemas(alias, [], 'f', schemaRef).Input).toEqual(
      schemaRef.Input,
    );
  });

  test('keeps a nested schema reference instead of inlining it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-schema-'));
    const file = path.join(dir, 'nested.ts');
    fs.writeFileSync(
      file,
      `
      declare namespace schemas {
        namespace Aaron {
          namespace Testing {
            type ProjectApiKeyDeleteResponse = { id: string };
          }
        }
      }
      interface Payload {
        user: schemas.Aaron.Testing.ProjectApiKeyDeleteResponse;
      }
      export async function f(input: Payload): Promise<void> {
        return;
      }
      `,
    );
    const output = generateTypeSchemas(file, [], 'f', schemaRef);
    expect(JSON.stringify(output)).toContain(
      '"x-poly-ref":{"path":"aaron.testing.ProjectApiKeyDeleteResponse"}',
    );
  });
});
