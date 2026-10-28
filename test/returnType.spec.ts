/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseFunctionReturnType } from '../src/transpiler';

const writeFunction = (source: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-return-'));
  const file = path.join(dir, 'fn.ts');
  fs.writeFileSync(file, source);
  return file;
};

describe('parseFunctionReturnType', () => {
  test('uses the return annotation text and a primitive union schema', () => {
    const file = writeFunction(`
      export function foo(): string | number {
        return 'a';
      }
    `);

    expect(parseFunctionReturnType(file, 'foo')).toEqual({
      returnType: 'string | number',
      returnTypeSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: ['string', 'number'],
      },
    });
  });

  test('keeps a named return type and inlines its schema', () => {
    const file = writeFunction(`
      interface MyInterface {
        prop1: string;
        prop2: number;
      }
      export function foo(): MyInterface {
        return { prop1: 'a', prop2: 1 };
      }
    `);

    const parsed = parseFunctionReturnType(file, 'foo');
    expect(parsed.returnType).toBe('MyInterface');
    expect(parsed.returnTypeSchema).toMatchObject({
      type: 'object',
      properties: {
        prop1: { type: 'string' },
        prop2: { type: 'number' },
      },
      required: ['prop1', 'prop2'],
      additionalProperties: false,
    });
  });

  test('reads an arrow function and a parenthesized union', () => {
    const file = writeFunction(`
      export const arrow = (value: string): string | null => value;
      export function paren(value: string): (string | number) {
        return value;
      }
    `);

    expect(parseFunctionReturnType(file, 'arrow').returnType).toBe(
      'string | null',
    );
    expect(
      parseFunctionReturnType(file, 'arrow').returnTypeSchema,
    ).toMatchObject({ type: ['string', 'null'] });
    expect(parseFunctionReturnType(file, 'paren')).toMatchObject({
      returnType: '(string | number)',
      returnTypeSchema: { type: ['string', 'number'] },
    });
  });

  test('keeps Promise in the type string and unwraps it in the schema', () => {
    const file = writeFunction(`
      export async function foo(): Promise<string | number> {
        return 'a';
      }
    `);

    expect(parseFunctionReturnType(file, 'foo')).toMatchObject({
      returnType: 'Promise<string | number>',
      returnTypeSchema: { type: ['string', 'number'] },
    });
  });

  test('infers the return type when the function has no annotation', () => {
    const file = writeFunction(`
      export function foo(value: string) {
        return value;
      }
    `);

    expect(parseFunctionReturnType(file, 'foo')).toMatchObject({
      returnType: 'string',
      returnTypeSchema: { type: 'string' },
    });
  });

  test('prefers the exported function over a nested helper with the same name', () => {
    const file = writeFunction(`
      function wrapper() {
        function foo(): boolean {
          return true;
        }
        return foo();
      }
      export function foo(): string | number {
        return wrapper() ? 'a' : 1;
      }
    `);

    expect(parseFunctionReturnType(file, 'foo').returnType).toBe(
      'string | number',
    );
  });

  test('uses a poly schema ref instead of generating the ambient type', () => {
    const file = writeFunction(`
      export function foo(): schemas.Aaron.Testing.ProjectApiKeyDeleteResponse {
        return { id: 'a' };
      }
    `);
    const schemaRef = {
      'schemas.Aaron.Testing.ProjectApiKeyDeleteResponse': {
        'x-poly-ref': { path: 'aaron.testing.ProjectApiKeyDeleteResponse' },
      },
    };

    expect(parseFunctionReturnType(file, 'foo', schemaRef)).toEqual({
      returnType: 'schemas.Aaron.Testing.ProjectApiKeyDeleteResponse',
      returnTypeSchema:
        schemaRef['schemas.Aaron.Testing.ProjectApiKeyDeleteResponse'],
    });
  });

  test('returns null when the function is not in the file', () => {
    const file = writeFunction(`
      export function other(): string {
        return 'a';
      }
    `);

    expect(parseFunctionReturnType(file, 'foo')).toEqual({ returnType: null });
  });
});
