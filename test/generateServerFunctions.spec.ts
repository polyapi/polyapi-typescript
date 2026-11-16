/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import { interceptors, MockAgent, request as undiciRequest } from 'undici';
import set from 'lodash/set';
import { generateServerFunctionJSFiles } from '../src/commands/generate';
import { generateFunctionsTSDeclarationFile } from '../src/commands/generate/types';
import { http, resetHttpDispatchers, scrubKeys } from '../src/http';
import { ServerFunctionSpecification, Visibility } from '../src/types';
import * as utils from '../src/utils';

jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  request: jest.fn(),
}));

const requestMock = undiciRequest as jest.MockedFunction<typeof undiciRequest>;

const specification = (
  name: string,
  options: Pick<ServerFunctionSpecification, 'executionMode' | 'continuousInvocation'> = {},
): ServerFunctionSpecification => ({
  id: name,
  name,
  context: 'fixtures',
  contextName: `fixtures.${name}`,
  type: 'serverFunction',
  requirements: [],
  serverSideAsync: false,
  visibilityMetadata: { visibility: Visibility.Environment },
  function: {
    arguments: [{ name: 'marker', required: true, type: { kind: 'primitive', type: 'string' } }],
    returnType: { kind: 'primitive', type: 'string' },
  },
  ...options,
});

const loadGenerated = <T>(file: string, dependencies: Record<string, unknown> = {}): T => {
  const module = { exports: {} };
  new Function('module', 'require', fs.readFileSync(file, 'utf8'))(
    module,
    (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  );
  return module.exports as T;
};

describe('generated server function retries', () => {
  let root: string;
  let invoke: (marker: string) => Promise<string>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-server-generation-'));
    fs.mkdirSync(path.join(root, 'server'));
    jest.spyOn(utils, 'templateUrl').mockImplementation(
      (file) => path.join(__dirname, '..', 'templates', file),
    );
    requestMock.mockReset();
    resetHttpDispatchers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetHttpDispatchers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const generate = async (spec: ServerFunctionSpecification) => {
    await generateServerFunctionJSFiles(root, [spec]);
    const factory = loadGenerated<
      (clientId: string, custom: { executionId: string }) => {
        fixtures: Record<string, (marker: string) => Promise<string>>;
      }
    >(path.join(root, 'server', 'index.js'), {
      '../http': { http, scrubKeys },
      'lodash/set': set,
      './functions': loadGenerated(path.join(root, 'server', 'functions.js')),
    });
    invoke = factory('test-client', { executionId: 'test-execution' }).fixtures[spec.name];
  };

  test.each(['ECONNRESET', 'UND_ERR_SOCKET'])(
    'callable continuous wrapper sends one POST after accepted effect and %s response loss',
    async (code) => {
      await generate(specification('producer', {
        executionMode: 'continuous', continuousInvocation: true,
      }));
      let effects = 0;
      requestMock.mockImplementation(async () => {
        effects++;
        throw Object.assign(new Error('response lost after accepted effect'), { code });
      });

      await expect(invoke('once')).rejects.toMatchObject({ code });
      expect(effects).toBe(1);
      expect(requestMock).toHaveBeenCalledTimes(1);
      const [url, init] = requestMock.mock.calls[0];
      expect(url).toBe('/functions/server/producer/execute?clientId=test-client');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ marker: 'once' }));
      expect(init.headers).toMatchObject({ 'x-poly-execution-id': 'test-execution' });
    },
  );

  test('callable continuous wrapper returns the first 429 without replaying', async () => {
    await generate(specification('producer', {
      executionMode: 'continuous', continuousInvocation: true,
    }));
    requestMock.mockResolvedValue({
      statusCode: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '0' },
      body: { text: async () => '{"error":"busy"}' },
    } as unknown as Awaited<ReturnType<typeof undiciRequest>>);

    await expect(invoke('once')).rejects.toMatchObject({ status: 429 });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  test.each([
    { status: 307, continuous: true },
    { status: 308, continuous: true },
    { status: 307, continuous: false },
    { status: 308, continuous: false },
  ])('redirect machinery preserves no replay for %j', async ({ status, continuous }) => {
    await generate(specification('producer', continuous ? {
      executionMode: 'continuous', continuousInvocation: true,
    } : {}));
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    const pool = mockAgent.get('http://sdk-fixture.invalid');
    let effects = 0;
    pool.intercept({
      path: '/functions/server/producer/execute?clientId=test-client', method: 'POST',
    }).reply(status, () => {
      effects++;
      return '{}';
    }, { headers: { location: '/redirected' } });
    pool.intercept({ path: '/redirected', method: 'POST' }).reply(200, () => {
      effects++;
      return '"accepted"';
    }, { headers: { 'content-type': 'application/json' } });
    const actualRequest = jest.requireActual<typeof import('undici')>('undici').request;
    const dispatcher = mockAgent.compose(interceptors.redirect({ maxRedirections: 21 }));
    requestMock.mockImplementation((url, init) => actualRequest(
      new URL(String(url), 'http://sdk-fixture.invalid'), { ...init, dispatcher },
    ));

    try {
      if (continuous) {
        await expect(invoke('once')).rejects.toMatchObject({ status });
        expect(effects).toBe(1);
      } else {
        await expect(invoke('ordinary')).resolves.toBe('accepted');
        expect(effects).toBe(2);
      }
      expect(requestMock).toHaveBeenCalledTimes(1);
    } finally {
      await mockAgent.close();
    }
  });

  test.each([
    {},
    { executionMode: 'request' as const, continuousInvocation: false },
    { executionMode: 'continuous' as const, continuousInvocation: false },
    { executionMode: 'continuous' as const },
    { executionMode: 'request' as const, continuousInvocation: true },
  ])('ordinary retry defaults are preserved for %j', async (options) => {
    await generate(specification('ordinary', options));
    requestMock.mockRejectedValue(
      Object.assign(new Error('response lost'), { code: 'ECONNRESET' }),
    );

    await expect(invoke('ordinary')).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test('callable metadata keeps the generated argument and return signature', async () => {
    const request = specification('producer');
    await generateFunctionsTSDeclarationFile(root, [request]);
    const before = fs.readFileSync(path.join(root, 'fixtures.d.ts'), 'utf8');
    await generateFunctionsTSDeclarationFile(root, [{
      ...request, executionMode: 'continuous', continuousInvocation: true,
    }]);
    const after = fs.readFileSync(path.join(root, 'fixtures.d.ts'), 'utf8');

    expect(after).toBe(before);
    expect(after).toContain('producer(marker: string): Promise<string>');
  });
});
