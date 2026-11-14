/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import * as api from '../src/api';
import * as http from '../src/http';
import { syncedFunctionUpdate } from '../src/commands/sync';
import { parseDeployable } from '../src/transpiler';

const writeFunction = (source: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-sync-'));
  const file = path.join(dir, 'fn.ts');
  fs.writeFileSync(file, source);
  return file;
};

describe('syncedFunctionUpdate', () => {
  test('prepares typed callable continuous config and deploys compiled hooks with its original signature', async () => {
    const source = `
      import type { PolyServerFunction } from 'polyapi';
      const polyConfig: PolyServerFunction = {
        name: 'producer', context: 'fixtures', visibility: 'ENVIRONMENT',
        executionMode: 'continuous', continuousInvocation: true,
      };
      async function producer(marker: string): Promise<string> { return marker; }
      Object.assign(producer, { continuous: {
        start: async (): Promise<void> => {},
        stop: async (): Promise<{ outcome: 'drained' }> => ({ outcome: 'drained' }),
      }});
      export default producer;
    `;
    const file = writeFunction(source);
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2021,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      paths: { polyapi: [path.join(__dirname, '..', 'index.d.ts')] },
    });
    expect(ts.getPreEmitDiagnostics(program).map(
      (diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )).toEqual([]);

    const specs = jest.spyOn(api, 'getSpecs').mockResolvedValue([]);
    const post = jest.spyOn(http, 'post').mockResolvedValue({
      data: { id: 'fixture' }, status: 200, statusText: 'OK', headers: {},
    });
    try {
      const [deployable] = await parseDeployable(file, undefined, 'fixture');
      const synced = await syncedFunctionUpdate(deployable, source);
      await api.createOrUpdateServerFunction(
        synced.context, deployable.name, '', synced.code,
        deployable.config.visibility, null, null, synced.other,
      );
      expect(post).toHaveBeenCalledTimes(1);
      const payload = post.mock.calls[0][1] as {
        code: string; sourceCode: string; executionMode: string;
        continuousInvocation: boolean; returnType: string;
        arguments: Array<{ name: string; type: string; required: boolean }>;
      };
      expect(payload).toMatchObject({
        executionMode: 'continuous', continuousInvocation: true,
        sourceCode: source, returnType: 'Promise<string>',
        arguments: [expect.objectContaining({ name: 'marker', type: 'string', required: true })],
      });
      expect(payload.code).not.toContain('Promise<');
      expect(payload.code).not.toContain('import ');
      const handler = new Function('exports', `${payload.code}\nreturn producer;`)({}) as
        ((marker: string) => Promise<string>) & {
          continuous: { start(): Promise<void>; stop(): Promise<{ outcome: 'drained' }> };
        };
      await expect(handler.continuous.start()).resolves.toBeUndefined();
      await expect(handler('marker')).resolves.toBe('marker');
      await expect(handler.continuous.stop()).resolves.toEqual({ outcome: 'drained' });
    } finally {
      specs.mockRestore();
      post.mockRestore();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('sends compiled code and keeps poly config fields', async () => {
    const source = `export async function greet(name: string): Promise<string> { return name; }\n`;
    const file = writeFunction(source);

    const synced = await syncedFunctionUpdate(
      {
        file,
        name: 'greet',
        context: 'app.users',
        config: { visibility: 'ENVIRONMENT', logsEnabled: true },
      },
      source,
    );

    expect(synced.context).toBe('app.users');
    expect(synced.code).toContain('async function greet(name)');
    expect(synced.code).not.toContain('Promise<string>');
    expect(synced.other).toMatchObject({
      visibility: 'ENVIRONMENT',
      logsEnabled: true,
      sourceCode: source,
      synchronous: false,
      returnType: 'Promise<string>',
      arguments: [
        expect.objectContaining({
          name: 'name',
          type: 'string',
          required: true,
        }),
      ],
    });
    expect(synced.other.returnTypeSchema).toMatchObject({ type: 'string' });
  });

  test('fills an empty context from the function path', async () => {
    const source = `
      const api = {
        users: {
          greet: function greet(name: string): string {
            return name;
          },
        },
      };
    `;
    const file = writeFunction(source);

    const synced = await syncedFunctionUpdate(
      {
        file,
        name: 'greet',
        context: '',
        config: { visibility: 'ENVIRONMENT' },
      },
      source,
    );

    expect(synced.context).toBe('users.greet');
    expect(synced.code).toContain('function greet(name)');
    expect(synced.other.visibility).toBe('ENVIRONMENT');
  });

  test('rejects a missing function before a deploy body is built', async () => {
    const source = `export function other(): string { return 'ok'; }\n`;
    const file = writeFunction(source);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      syncedFunctionUpdate(
        {
          file,
          name: 'missing',
          context: 'app',
          config: { visibility: 'ENVIRONMENT' },
        },
        source,
      ),
    ).rejects.toThrow(`Could not find function "missing" in "${file}".`);

    warn.mockRestore();
  });
});
