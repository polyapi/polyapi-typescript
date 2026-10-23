/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import { syncedFunctionUpdate } from '../src/commands/sync';

const writeFunction = (source: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-sync-'));
  const file = path.join(dir, 'fn.ts');
  fs.writeFileSync(file, source);
  return file;
};

describe('syncedFunctionUpdate', () => {
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
