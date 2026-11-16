/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import { functionDeployFields, transpileFunction } from '../src/transpiler';

const writeFunction = (source: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-transpile-'));
  const file = path.join(dir, 'fn.ts');
  fs.writeFileSync(file, source);
  return file;
};

const callCompiled = (code: string, name: string) => {
  const load = new Function('exports', 'require', `${code}\nreturn ${name};`);
  return load({}, require);
};

describe('transpileFunction', () => {
  test('compiles an exported function and sends its arguments', () => {
    const source = `export default function greet(name: string): string { return name; }\n`;
    const file = writeFunction(source);
    const result = transpileFunction(file, 'greet');

    expect(result.transpiled).toBe(true);
    expect(result.synchronous).toBe(true);
    expect(result.context).toBe('');
    expect(result.sourceCode).toBe(source);
    expect(result.code).toBe(
      'Object.defineProperty(exports, "__esModule", { value: true });\nfunction greet(name) { return name; }\n',
    );
    expect(result.returnType).toBe('string');
    expect(result.returnTypeSchema).toMatchObject({ type: 'string' });
    expect(result.arguments).toEqual([
      expect.objectContaining({
        key: 'name',
        name: 'name',
        type: 'string',
        required: true,
      }),
    ]);
    expect(result.arguments[0].typeSchema).toMatchObject({ type: 'string' });
    expect(callCompiled(result.code, 'greet')('hi')).toBe('hi');
  });

  test('keeps an exported arrow as a local binding', () => {
    const source = `export const arrow = (name: string): string => name;\n`;
    const file = writeFunction(source);
    const result = transpileFunction(file, 'arrow');

    expect(result.code).toBe(
      'Object.defineProperty(exports, "__esModule", { value: true });\nconst arrow = (name) => name;\n',
    );
    expect(result.code).not.toContain('exports.arrow');
    expect(callCompiled(result.code, 'arrow')('hi')).toBe('hi');
  });

  test('removes a bare export default assignment', () => {
    const source = `const greet = (name: string): string => name;\nexport default greet;\n`;
    const file = writeFunction(source);
    const result = transpileFunction(file, 'greet');

    expect(result.code).not.toContain('exports.default');
    expect(callCompiled(result.code, 'greet')('hi')).toBe('hi');
  });

  test('parses argument names, required flags, and schemas', () => {
    const file = writeFunction(`
      interface MyInterface {
        prop1: string;
        prop2: number;
      }
      export function testFunc(
        arg1: string,
        arg2?: number,
        color: 'blue' | 'green' | 'red' = 'blue',
        items: string[],
        obj: MyInterface,
        { a, b }: { a: string; b: number },
        { prop1, prop2 },
        [el1, el2, ...restEls],
        callback: (foo: string) => string,
      ): string {
        return arg1;
      }
    `);

    const result = transpileFunction(file, 'testFunc');
    const byName = Object.fromEntries(
      result.arguments.map((argument) => [argument.name, argument]),
    );

    expect(result.transpiled).toBe(true);
    expect(result.synchronous).toBe(true);
    expect(byName.arg1).toMatchObject({
      type: 'string',
      required: true,
      typeSchema: { type: 'string' },
    });
    expect(byName.arg2).toMatchObject({ type: 'number', required: false });
    expect(byName.color).toMatchObject({
      type: "'blue' | 'green' | 'red'",
      required: false,
      typeSchema: { type: 'string', enum: ['blue', 'green', 'red'] },
    });
    expect(byName.items.typeSchema).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    });
    expect(byName.obj).toMatchObject({
      type: 'MyInterface',
      typeSchema: {
        type: 'object',
        properties: {
          prop1: { type: 'string' },
          prop2: { type: 'number' },
        },
        required: ['prop1', 'prop2'],
      },
    });
    expect(byName.arg5).toMatchObject({
      type: '{ a: string; b: number }',
      required: true,
      typeSchema: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    });
    expect(byName.arg6).toMatchObject({
      name: 'arg6',
      type: 'object',
      required: true,
      typeSchema: {
        type: 'object',
        properties: {
          prop1: { title: 'prop1' },
          prop2: { title: 'prop2' },
        },
        required: ['prop1', 'prop2'],
      },
    });
    expect(byName.arg7).toMatchObject({
      type: 'array',
      required: true,
      typeSchema: {
        type: 'array',
        items: [{ title: 'el1' }, { title: 'el2' }],
        additionalItems: { title: 'restEls' },
      },
    });
    expect(byName.callback.type).toBe('(foo: string) => string');
    expect(byName.callback.typeSchema).toBeUndefined();
  });

  test('infers types from default values', () => {
    const file = writeFunction(`
      export function testFunc(num = 1, str = 'test', flag = true): number {
        return num;
      }
    `);

    const result = transpileFunction(file, 'testFunc');
    expect(result.arguments.map((argument) => argument.name)).toEqual([
      'num',
      'str',
      'flag',
    ]);
    expect(result.arguments[0]).toMatchObject({
      type: 'number',
      required: false,
      typeSchema: { type: 'number' },
    });
    expect(result.arguments[1]).toMatchObject({
      type: 'string',
      required: false,
      typeSchema: { type: 'string' },
    });
    expect(result.arguments[2]).toMatchObject({
      type: 'boolean',
      required: false,
      typeSchema: { type: 'boolean' },
    });
  });

  test('keeps Promise in the return type and marks the function asynchronous', () => {
    const file = writeFunction(`
      export async function foo(value: string): Promise<string | number> {
        return value;
      }
    `);

    const result = transpileFunction(file, 'foo');
    expect(result.synchronous).toBe(false);
    expect(result.returnType).toBe('Promise<string | number>');
    expect(result.returnTypeSchema).toMatchObject({
      type: ['string', 'number'],
    });
    expect(result.code).toContain('async function foo(value)');
  });

  test('marks an unannotated async function as asynchronous', () => {
    const file = writeFunction(`
      export async function foo(value: string) {
        return value;
      }
    `);

    const result = transpileFunction(file, 'foo');
    expect(result.synchronous).toBe(false);
    expect(result.transpiled).toBe(true);
    expect(result.returnType).toContain('string');
  });

  test('uses a poly schema ref for an argument type', () => {
    const file = writeFunction(`
      export function foo(input: schemas.Aaron.Testing.ProjectApiKeyDeleteResponse): string {
        return 'ok';
      }
    `);
    const schemaRef = {
      'schemas.Aaron.Testing.ProjectApiKeyDeleteResponse': {
        'x-poly-ref': { path: 'aaron.testing.ProjectApiKeyDeleteResponse' },
      },
    };

    const result = transpileFunction(file, 'foo', schemaRef);
    expect(result.arguments[0].type).toBe(
      'schemas.Aaron.Testing.ProjectApiKeyDeleteResponse',
    );
    expect(result.arguments[0].typeSchema).toEqual(
      schemaRef['schemas.Aaron.Testing.ProjectApiKeyDeleteResponse'],
    );
  });

  test('uses the property path as context for a nested function', () => {
    const file = writeFunction(`
      const api = {
        users: {
          greet: function greet(name: string): string {
            return name;
          },
        },
      };
    `);

    const result = transpileFunction(file, 'greet');
    expect(result.context).toBe('users.greet');
    expect(result.arguments[0].name).toBe('name');
  });

  test('builds the deploy payload from a compiled function', () => {
    const source = `export function greet(name: string): string { return name; }\n`;
    const file = writeFunction(source);
    const fields = functionDeployFields(
      transpileFunction(file, 'greet'),
      'app',
    );

    expect(fields.context).toBe('app');
    expect(fields.code).toContain('function greet(name)');
    expect(fields.code).not.toContain(': string');
    expect(fields.payload).toMatchObject({
      sourceCode: source,
      synchronous: true,
      returnType: 'string',
      arguments: [
        expect.objectContaining({
          name: 'name',
          type: 'string',
          required: true,
        }),
      ],
    });
  });

  test('uses the nested path when the deploy context is empty', () => {
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
    const fields = functionDeployFields(transpileFunction(file, 'greet'), '');

    expect(fields.context).toBe('users.greet');
  });

  test('does not claim the file was transpiled when the function is missing', () => {
    const source = `export function other(): string { return 'a'; }\n`;
    const file = writeFunction(source);

    expect(transpileFunction(file, 'missing')).toMatchObject({
      transpiled: false,
      code: source,
      sourceCode: source,
      arguments: [],
      returnType: null,
      failure: `Could not find function "missing" in "${file}".`,
    });
  });

  test('refuses to build a deploy payload when the function is missing', () => {
    const source = `export function other(): string { return 'a'; }\n`;
    const file = writeFunction(source);

    expect(() =>
      functionDeployFields(transpileFunction(file, 'missing'), 'app'),
    ).toThrow(`Could not find function "missing" in "${file}".`);
  });
});
