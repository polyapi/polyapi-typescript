import { EOL } from 'node:os';
import { JsonSchema, SchemaSpec, printSchemaAsType, __test } from '../src/commands/generate/schemaTypes';

const {
  formatName,
  printComment,
  buildSchemaTree,
  printSchemaSpecs
} = __test;

// Utility to make creating multiline strings in more precise way than is possible with template literal strings
const multiline = (...lines: string[]) => lines.join(EOL);

type Foo = {
  '123Abc': string;
}

describe('Generate types from specs', () => {

  describe('printComment', () => {

    test('single-line comment', () => {
      const expected = multiline(
        '/**',
        ' * This is a comment!',
        ` */${EOL}`
      );
      expect(printComment('This is a comment!')).toEqual(expected);
    });

    test('multi-line comment', () => {
      const expected = multiline(
        '/**',
        ' * This is a comment!',
        ' * ',
        ' *   And here are more details!',
        ' *   And a few more where that came from!',
        ` */${EOL}`
      );
      expect(printComment('This is a comment!\n\n  And here are more details!\n  And a few more where that came from!')).toEqual(expected);
    });

    test('deprecated comment', () => {
      const expected = multiline(
        '/**',
        ' * @deprecated',
        ` */${EOL}`
      );
      expect(printComment(undefined, 0, true)).toEqual(expected);
    });

    test('deprecated single-line comment', () => {
      const expected = multiline(
        '/**',
        ' * @deprecated',
        ' * This is a comment!',
        ` */${EOL}`
      );
      expect(printComment('This is a comment!', 0, true)).toEqual(expected);
    });

    test('deprecatedmulti-line comment', () => {
      const expected = multiline(
        '/**',
        ' * @deprecated',
        ' * This is a comment!',
        ' * ',
        ' *   And here are more details!',
        ' *   And a few more where that came from!',
        ` */${EOL}`
      );
      expect(printComment('This is a comment!\n\n  And here are more details!\n  And a few more where that came from!', 0, true)).toEqual(expected);
    });
  });

  test('formatName', () => {
    expect(formatName('Abc')).toBe('Abc');
    expect(formatName('Abc', true)).toBe('Abc');
    expect(formatName('AbcDef')).toBe('AbcDef');
    expect(formatName('AbcDef', true)).toBe('AbcDef');
    expect(formatName('abc')).toBe('Abc');
    expect(formatName('abc', true)).toBe('abc');
    expect(formatName('a b c')).toBe('ABC');
    expect(formatName('a b c', true)).toBe('\'a b c\'');
    expect(formatName('a-b-c')).toBe('ABC');
    expect(formatName('a-b-c', true)).toBe('\'a-b-c\'');
    expect(formatName('@abc')).toBe('Abc');
    expect(formatName('@abc', true)).toBe('\'@abc\'');
    expect(formatName('_abc')).toBe('Abc');
    expect(formatName('_abc', true)).toBe('_abc');
    expect(formatName('123abc')).toBe('\'123abc\'');
    expect(formatName('123abc', true)).toBe('\'123abc\'');
    expect(formatName('abc123')).toBe('Abc123');
    expect(formatName('abc123', true)).toBe('abc123');
  })

  describe('printSchemaAsType', () => {

    describe('poly schema', () => {
      test('reference', () => {
        const schema: JsonSchema = {
          'x-poly-ref': {
            path: 'polyapi.adyen.capital.Account-Balance'
          }
        };
        const expected = 'type Foo = Polyapi.Adyen.Capital.AccountBalance;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });
      test('reference with public namespace', () => {
        const schema: JsonSchema = {
          'x-poly-ref': {
            path: 'polyapi.adyen.capital.Account-Balance',
            publicNamespace: 'OOB'
          }
        };
        const expected = 'type Foo = Oob.Polyapi.Adyen.Capital.AccountBalance;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });
      test('unresolved poly schema', () => {
        const schema: JsonSchema = {
          type: 'unresolved',
          title: 'Foo',
          description: `Unresolved schema, please add schema \`bar.baz.Foo\` to complete it.`
        };
        const expected = multiline(
          '/**',
          ' * Unresolved schema, please add schema `bar.baz.Foo` to complete it.',
          ' */',
          'type Foo = unknown /* Unresolved type */;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });
    });

    describe('const value schema', () => {

      test('null value', () => {
        const schema: JsonSchema = {
          const: null,
        };
        const expected = 'type Foo = null;';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('boolean value', () => {
        const schema: JsonSchema = {
          const: true,
        };
        const expected = 'type Foo = true;';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('nullable boolean value', () => {
        const schema: JsonSchema = {
          const: true,
          nullable: true,
        };
        const expected = 'type Foo = null | true;';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('number value', () => {
        const schema: JsonSchema = {
          const: 123,
        };
        const expected = 'type Foo = 123;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested number value in object', () => {
        const schema: JsonSchema = {
          const: 123,
        };
        const expected = '  foo: 123;';
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('nested number value in array', () => {
        const schema: JsonSchema = {
          const: 123,
        };
        const expected = '  123';
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });

      test('nullable number value', () => {
        const schema: JsonSchema = {
          const: 123,
          nullable: true,
        };
        const expected = 'type Foo = null | 123;';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('string value', () => {
        const schema: JsonSchema = {
          const: 'animal',
        };
        const expected = 'type Foo = \'animal\';';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('nullable string value', () => {
        const schema: JsonSchema = {
          const: 'animal',
          nullable: true,
        };
        const expected = 'type Foo = null | \'animal\';';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });
    });

    describe('enum value schema', () => {

      test('single null value', () => {
        const schema: JsonSchema = {
          enum: [null],
          nullable: true,
        };
        const expected = 'type Foo = null;';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('single boolean value', () => {
        const schema: JsonSchema = {
          enum: [true],
        };
        const expected = 'type Foo = true;';
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('single number value', () => {
        const schema: JsonSchema = {
          enum: [123],
        };
        const expected = 'type Foo = 123;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('single string value', () => {
        const schema: JsonSchema = {
          enum: ['animal'],
        };
        const expected = 'type Foo = \'animal\';';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested single string value in object', () => {
        const schema: JsonSchema = {
          enum: ['animal'],
        };
        const expected = '  foo: \'animal\';';
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('nested single string value in array', () => {
        const schema: JsonSchema = {
          enum: ['animal'],
        };
        const expected = '  \'animal\'';
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });

      test('many values', () => {
        const schema: JsonSchema = {
          enum: ['random', 'other', 123, false],
        };
        const expected = multiline(
          'type Foo = ',
          '  | \'random\'',
          '  | \'other\'',
          '  | 123',
          '  | false;'
        );
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('nullable many values', () => {
        const schema: JsonSchema = {
          enum: ['random', 'other', 123, false],
          nullable: true
        };
        const expected = multiline(
          'type Foo = ',
          '  | null',
          '  | \'random\'',
          '  | \'other\'',
          '  | 123',
          '  | false;'
        );
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('many boolean values', () => {
        const schema: JsonSchema = {
          enum: [true, false],
        };
        const expected = multiline(
          'type Foo = ',
          '  | true',
          '  | false;'
        );
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

      test('many number values', () => {
        const schema: JsonSchema = {
          enum: [1, 2, 3, 56.7],
        };
        const expected = multiline(
          'type Foo = ',
          '  | 1',
          '  | 2',
          '  | 3',
          '  | 56.7;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('many string values', () => {
        const schema: JsonSchema = {
          enum: ['a', 'b', 'c', 'd', 'e'],
        };
        const expected = multiline(
          'type Foo = ',
          '  | \'a\'',
          '  | \'b\'',
          '  | \'c\'',
          '  | \'d\'',
          '  | \'e\';',
        );
        expect(printSchemaAsType(schema, 'Foo', 0)).toEqual(expected);
      });

    });

    describe('empty schema definition', () => {

      test('empty', () => {
        const schema: JsonSchema = {};
        const expected = 'type Foo = unknown;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('empty and optional', () => {
        // optional types only apply for nested properties
        const schema: JsonSchema = {};
        const expected = 'type Foo = unknown;';
        expect(printSchemaAsType(schema, 'foo', 0, undefined, true)).toEqual(expected);
      });

      test('with comment', () => {
        const schema: JsonSchema = {
          description: 'Hey hey hey!'
        };
        const expected = multiline(
          '/**',
          ' * Hey hey hey!',
          ' */',
          'type Foo = unknown;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('with title', () => {
        const schema: JsonSchema = {
          title: 'My-Schema'
        };
        const expected = 'type MySchema = unknown;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested in object', () => {
        const schema: JsonSchema = {};
        const expected = '    foo: unknown;';
        expect(printSchemaAsType(schema, 'foo', 2, 'object')).toEqual(expected);
      });

      test('nested in array', () => {
        const schema: JsonSchema = {};
        const expected = '    unknown';
        expect(printSchemaAsType(schema, 'foo', 2, 'array')).toEqual(expected);
      });

      test('nested in object with comment', () => {
        const schema: JsonSchema = { description: 'no comment' };
        const expected = multiline(
          '    /**',
          '     * no comment',
          '     */',
          '    foo: unknown;'
        );
        expect(printSchemaAsType(schema, 'foo', 2, 'object')).toEqual(expected);
      });

      test('nested and optional in object', () => {
        const schema: JsonSchema = {};
        const expected = '    foo?: unknown;';
        expect(printSchemaAsType(schema, 'foo', 2, 'object', true)).toEqual(expected);
      });

      test('nested with dash in name in object', () => {
        const schema: JsonSchema = {};
        const expected = '    \'foo-bar\': unknown;';
        expect(printSchemaAsType(schema, 'foo-bar', 2, 'object')).toEqual(expected);
      });
    });

    describe('boolean type schema', () => {

      test('simple', () => {
        const schema: JsonSchema = {
          type: 'boolean',
          title: 'UseThingy',
          description: 'If we should use the thingy. (default: false)'
        };
        const expected = multiline(
          '/**',
          ' * If we should use the thingy. (default: false)',
          ' */',
          'type UseThingy = boolean;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nullable', () => {
        const schema: JsonSchema = {
          type: 'boolean',
          title: 'UseThingy',
          nullable: true
        };
        const expected = 'type UseThingy = null | boolean;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested in object', () => {
        const schema: JsonSchema = {
          type: 'boolean',
          title: 'UseThingy',
        };
        const expected = '  useThingy: boolean;';
        expect(printSchemaAsType(schema, 'useThingy', 1, 'object')).toEqual(expected);
      });

      test('nested in array', () => {
        const schema: JsonSchema = {
          type: 'boolean',
          title: 'UseThingy',
        };
        const expected = '  boolean';
        expect(printSchemaAsType(schema, 'useThingy', 1, 'array')).toEqual(expected);
      });

      test('nested in object with comment', () => {
        const schema: JsonSchema = {
          type: 'boolean',
          title: 'UseThingy',
          description: 'If we should use the thingy. (default: false)'
        };
        const expected = multiline(
          '  /**',
          '   * If we should use the thingy. (default: false)',
          '   */',
          '  useThingy: boolean;'
        );
        expect(printSchemaAsType(schema, 'useThingy', 1, 'object')).toEqual(expected);
      });
    });

    describe('number type schema', () => {

      test('number', () => {
        const schema: JsonSchema = {
          type: 'number',
          title: 'Amount',
          description: 'This is a number'
        };
        const expected = multiline(
          '/**',
          ' * This is a number',
          ' */',
          'type Amount = number;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('integer', () => {
        const schema: JsonSchema = {
          type: 'integer',
          title: 'Amount',
          description: 'This is an integer'
        };
        const expected = multiline(
          '/**',
          ' * This is an integer',
          ' */',
          'type Amount = number;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nullable', () => {
        const schema: JsonSchema = {
          type: 'number',
          nullable: true,
        };
        const expected = 'type Foo = null | number;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested in object', () => {
        const schema: JsonSchema = {
          type: 'number',
          title: 'Amount'
        };
        const expected = '  foo: number;';
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('nested in object with comment', () => {
        const schema: JsonSchema = {
          type: 'number',
          title: 'Amount',
          description: 'This is a number'
        };
        const expected = multiline(
          '  /**',
          '   * This is a number',
          '   */',
          '  foo: number;'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('nested in array', () => {
        const schema: JsonSchema = {
          type: 'number',
          title: 'Amount'
        };
        const expected = '  number';
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });

      test('nested in array with comment', () => {
        const schema: JsonSchema = {
          type: 'number',
          title: 'Amount',
          description: 'This is a number'
        };
        const expected = multiline(
          '  /**',
          '   * This is a number',
          '   */',
          '  number'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });
    });

    describe('string type schema', () => {

      test('simple', () => {
        const schema: JsonSchema = {
          type: 'string',
          title: 'Reason',
          description: 'This is a string'
        };
        const expected = multiline(
          '/**',
          ' * This is a string',
          ' */',
          'type Reason = string;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nullable', () => {
        const schema: JsonSchema = {
          type: 'string',
          nullable: true,
        };
        const expected = 'type Foo = null | string;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested in object', () => {
        const schema: JsonSchema = {
          type: 'string',
          title: 'Reason'
        };
        const expected = '  foo: string;';
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('nested in object with comment', () => {
        const schema: JsonSchema = {
          type: 'string',
          title: 'Reason',
          description: 'This is a string'
        };
        const expected = multiline(
          '  /**',
          '   * This is a string',
          '   */',
          '  foo: string;'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('nested in array', () => {
        const schema: JsonSchema = {
          type: 'string',
          title: 'Reason'
        };
        const expected = '  string';
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });

      test('nested in array with comment', () => {
        const schema: JsonSchema = {
          type: 'string',
          title: 'Reason',
          description: 'This is a string'
        };
        const expected = multiline(
          '  /**',
          '   * This is a string',
          '   */',
          '  string'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });
    });

    describe('multi type schema', () => {

      test('simple', () => {
        const schema: JsonSchema = {
          type: ['string', 'number'],
        };
        const expected = 'type Foo = string | number;';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('simple nested in object', () => {
        const schema: JsonSchema = {
          type: ['string', 'number'],
        };
        const expected = '  foo: string | number;';
        expect(printSchemaAsType(schema, 'foo', 1, 'object')).toEqual(expected);
      });

      test('simple nested in array', () => {
        const schema: JsonSchema = {
          type: ['string', 'number'],
        };
        const expected = '  string | number';
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });
    });

    describe('object type schema', () => {
      test('empty', () => {
        const schema: JsonSchema = {
          type: 'object'
        };
        const expected = 'type Foo = {};';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('simple, none required', () => {
        const schema: JsonSchema = {
          type: 'object',
          properties: {
            foo: { type: 'string' },
            baz: { type: 'number' },
            bar: { type: 'boolean' },
          }
        };
        const expected = multiline(
          'type Foo = {',
          '  foo?: string;',
          '  baz?: number;',
          '  bar?: boolean;',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('simple, all required', () => {
        const schema: JsonSchema = {
          type: 'object',
          properties: {
            foo: { type: 'string' },
            baz: { type: 'number' },
            bar: { type: 'boolean' },
          },
          required: [
            'foo',
            'baz',
            'bar',
          ]
        };
        const expected = multiline(
          'type Foo = {',
          '  foo: string;',
          '  baz: number;',
          '  bar: boolean;',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('simple, with nested types', () => {
        const schema: JsonSchema = {
          type: 'object',
          properties: {
            foo: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                enabled: { type: 'boolean' }
              },
              required: ['name'],
              additionalProperties: true
            },
            baz: { type: 'array', items: { type: 'string' } },
            bar: { type: 'string', enum: ['apple', 'banana', 'plum', 'kiwi'] },
          }
        };
        const expected = multiline(
          'type Foo = {',
          '  foo?: {',
          '    name: string;',
          '    enabled?: boolean;',
          '    [k: string]: unknown;',
          '  };',
          '  baz?: string[];',
          '  bar?: ',
          '    | \'apple\'',
          '    | \'banana\'',
          '    | \'plum\'',
          '    | \'kiwi\';',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('additional properties boolean', () => {
        const schema: JsonSchema = {
          type: 'object',
          additionalProperties: true
        };
        const expected = multiline(
          'type Foo = {',
          '  [k: string]: unknown;',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('additional properties schema', () => {
        const schema: JsonSchema = {
          type: 'object',
          additionalProperties: {
            type: 'number'
          }
        };
        const expected = multiline(
          'type Foo = {',
          '  [k: string]: number;',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      describe('pattern properties', () => {

        test('simple', () => {
          const schema: JsonSchema = {
            type: 'object',
            patternProperties: {
              '^DEPT-[0-9]{3}$': { type: 'string' }
            }
          };
          const expected = multiline(
            'type Foo = {',
            '  [k: string]: string;',
            '};',
          );
          expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
        });

        test('multiple with same type', () => {
          const schema: JsonSchema = {
            type: 'object',
            patternProperties: {
              '^DEPT-[0-9]{3}$': { type: 'string' },
              '^PERSON-[0-9]{3}$': { type: 'string' },
            }
          };
          const expected = multiline(
            'type Foo = {',
            '  [k: string]: string;',
            '};',
          );
          expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
        });

        test('multiple types', () => {
          const schema: JsonSchema = {
            type: 'object',
            patternProperties: {
              '^DEPT-[0-9]{3}$': { type: 'string' },
              '^ID-[0-9]{3}$': { type: 'integer' },
            }
          };
          const expected = multiline(
            'type Foo = {',
            '  [k: string]: ',
            '    | string',
            '    | number;',
            '};',
          );
          expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
        });
      });
    });

    describe('array type schema', () => {
      test('items of string type', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: {
            type: 'string'
          }
        };
        const expected = 'type Foo = string[];';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('array of object types', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              foo: { type: 'string' },
              baz: { type: 'number' },
              bar: { type: 'boolean' },
            },
            required: [
              'foo',
              'baz',
              'bar',
            ]
          }
        };
        const expected = multiline(
          'type Foo = Array<',
          '  {',
          '    foo: string;',
          '    baz: number;',
          '    bar: boolean;',
          '  }',
          '>;'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('array of array types', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: {
            type: 'array',
            items: {
              type: 'string',
            }
          }
        };
        const expected = multiline(
          'type Foo = string[][];'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('unknown items', () => {
        const schema: JsonSchema = {
          type: 'array'
        };
        const expected = 'type Foo = unknown[];';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('empty items', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: []
        };
        const expected = 'type Foo = void[];';
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('tuple items', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: [
            { type: 'string' },
            { type: 'string' },
            { type: 'boolean' },
          ]
        };
        const expected = multiline(
          'type Foo = [',
          '  string,',
          '  string,',
          '  boolean',
          '];'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('additionalItems as boolean', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: [{
            type: 'string'
          }],
          additionalItems: true
        };
        const expected = multiline(
          'type Foo = [',
          '  string,',
          '  ...unknown[]',
          '];'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('additionalItems as schema', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: [{
            type: 'string'
          }],
          additionalItems: { type: 'integer' }
        };
        const expected = multiline(
          'type Foo = [',
          '  string,',
          '  ...number[]',
          '];'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('additionalItems as object schema', () => {
        const schema: JsonSchema = {
          type: 'array',
          items: [{
            type: 'string'
          }],
          additionalItems: {
            type: 'object',
            properties: {
              foo: { type: 'string' },
              bar: { type: 'string' },
            }
          }
        };
        const expected = multiline(
          'type Foo = [',
          '  string,',
          '  ...Array<{',
          '    foo?: string;',
          '    bar?: string;',
          '  }>',
          '];'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });
    });

    describe('intersection type', () => {
      test('single schema', () => {
        const schema: JsonSchema = {
          allOf: [
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                baz: { type: 'number' },
                bar: { type: 'boolean' },
              }
            },

          ]
        };
        const expected = multiline(
          'type Foo = {',
          '  foo?: string;',
          '  baz?: number;',
          '  bar?: boolean;',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('multiple schemas', () => {
        const schema: JsonSchema = {
          allOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          'type Foo = {',
          '  baz?: number;',
          '} & {',
          '  foo?: string;',
          '  bar?: boolean;',
          '};'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('simple with comment', () => {
        const schema: JsonSchema = {
          description: 'Some comments here',
          allOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          '/**',
          ' * Some comments here',
          ' */',
          'type Foo = {',
          '  baz?: number;',
          '} & {',
          '  foo?: string;',
          '  bar?: boolean;',
          '};'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nullable', () => {

        const schema: JsonSchema = {
          nullable: true,
          allOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          'type Foo = null | ({',
          '  baz?: number;',
          '} & {',
          '  foo?: string;',
          '  bar?: boolean;',
          '});'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested in object', () => {
        const schema: JsonSchema = {
          allOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          '  foo?: {',
          '    baz?: number;',
          '  } & {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  };'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'object', true)).toEqual(expected);
      });

      test('nested in array', () => {
        const schema: JsonSchema = {
          allOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          '  {',
          '    baz?: number;',
          '  } & {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  }'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });

      test('intersection of unions', () => {
        const schema: JsonSchema = {
          allOf: [
            {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    baz: { type: 'number' },
                  }
                },
                {
                  type: 'object',
                  properties: {
                    foo: { type: 'string' },
                    bar: { type: 'boolean' },
                  }
                }
              ]
            },
            {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    other: { type: 'number' },
                  }
                },
                {
                  type: 'object',
                  properties: {
                    tru: { type: 'string' },
                    dat: { type: 'string' },
                  }
                }
              ]
            }
          ]
        };
        const expected = multiline(
          'type Foo = ({',
          '    baz?: number;',
          '  }',
          '  | {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  }) & ({',
          '    other?: number;',
          '  }',
          '  | {',
          '    tru?: string;',
          '    dat?: string;',
          '  });',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });
    });

    describe('union type', () => {
      test('single schema', () => {
        const schema: JsonSchema = {
          anyOf: [
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                baz: { type: 'number' },
                bar: { type: 'boolean' },
              }
            },

          ]
        };
        const expected = multiline(
          'type Foo = {',
          '  foo?: string;',
          '  baz?: number;',
          '  bar?: boolean;',
          '};',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('multiple schemas', () => {
        const schema: JsonSchema = {
          anyOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          'type Foo = ',
          '  | {',
          '    baz?: number;',
          '  }',
          '  | {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  };'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('simple with comment', () => {
        const schema: JsonSchema = {
          description: 'Some comments here',
          anyOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          '/**',
          ' * Some comments here',
          ' */',
          'type Foo = ',
          '  | {',
          '    baz?: number;',
          '  }',
          '  | {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  };'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nullable', () => {

        const schema: JsonSchema = {
          nullable: true,
          anyOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          'type Foo = ',
          '  | null',
          '  | {',
          '    baz?: number;',
          '  }',
          '  | {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  };'
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });

      test('nested in object', () => {
        const schema: JsonSchema = {
          anyOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          '  foo?: ',
          '    | {',
          '      baz?: number;',
          '    }',
          '    | {',
          '      foo?: string;',
          '      bar?: boolean;',
          '    };'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'object', true)).toEqual(expected);
      });

      test('nested in array', () => {
        const schema: JsonSchema = {
          anyOf: [
            {
              type: 'object',
              properties: {
                baz: { type: 'number' },
              }
            },
            {
              type: 'object',
              properties: {
                foo: { type: 'string' },
                bar: { type: 'boolean' },
              }
            }
          ]
        };
        const expected = multiline(
          '  ',
          '    {',
          '      baz?: number;',
          '    }',
          '    | {',
          '      foo?: string;',
          '      bar?: boolean;',
          '    }'
        );
        expect(printSchemaAsType(schema, 'foo', 1, 'array')).toEqual(expected);
      });

      test('union of intersections', () => {
        const schema: JsonSchema = {
          anyOf: [
            {
              allOf: [
                {
                  type: 'object',
                  properties: {
                    baz: { type: 'number' },
                  }
                },
                {
                  type: 'object',
                  properties: {
                    foo: { type: 'string' },
                    bar: { type: 'boolean' },
                  }
                }
              ]
            },
            {
              allOf: [
                {
                  type: 'object',
                  properties: {
                    other: { type: 'number' },
                  }
                },
                {
                  type: 'object',
                  properties: {
                    tru: { type: 'string' },
                    dat: { type: 'string' },
                  }
                }
              ]
            }
          ]
        };
        const expected = multiline(
          'type Foo = ',
          '  | ({',
          '    baz?: number;',
          '  } & {',
          '    foo?: string;',
          '    bar?: boolean;',
          '  })',
          '  | ({',
          '    other?: number;',
          '  } & {',
          '    tru?: string;',
          '    dat?: string;',
          '  });',
        );
        expect(printSchemaAsType(schema, 'foo', 0)).toEqual(expected);
      });
    });
  });

  test('buildSchemaTree', () => {
    const specA = {
      "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
      "name": "ProjectApiKeyDeleteResponse",
      "context": "aaron.testing",
      "contextName": "aaron.testing.ProjectApiKeyDeleteResponse",
      "type": "schema",
      "definition": {
        "type": "object",
        "properties": {
          "object": {
            "type": "string",
            "enum": [
              "organization.project.api_key.deleted"
            ]
          },
          "id": {
            "type": "string"
          },
          "deleted": {
            "type": "boolean"
          }
        },
        "required": [
          "object",
          "id",
          "deleted"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-06/schema#",
        "title": "Schema"
      },
      "visibilityMetadata": {
        "visibility": "ENVIRONMENT"
      },
      "unresolvedPolySchemaRefs": []
    } as SchemaSpec;
    const specB = {
      "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
      "name": "SomethingElse",
      "context": "aaron.testing",
      "contextName": "aaron.testing.SomethingElse",
      "type": "schema",
      "definition": {
        "type": "string"
      },
      "visibilityMetadata": {
        "visibility": "ENVIRONMENT"
      },
      "unresolvedPolySchemaRefs": []
    } as SchemaSpec;
    const specC = {
      "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
      "name": "AnotherThing",
      "context": "aaron",
      "contextName": "aaron.AnotherThing",
      "type": "schema",
      "definition": {
        "type": "number"
      },
      "visibilityMetadata": {
        "visibility": "ENVIRONMENT"
      },
      "unresolvedPolySchemaRefs": []
    } as SchemaSpec;
    const specD = {
      "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
      "name": "Baz",
      "context": "foo.bar",
      "contextName": "foo.bar.Baz",
      "type": "schema",
      "definition": {
        "type": "number"
      },
      "visibilityMetadata": {
        "visibility": "ENVIRONMENT"
      },
      "unresolvedPolySchemaRefs": []
    } as SchemaSpec;
    const specE = {
      "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
      "name": "Goody",
      "context": "",
      "contextName": "Goody",
      "type": "schema",
      "definition": {
        "type": "number"
      },
      "visibilityMetadata": {
        "visibility": "ENVIRONMENT"
      },
      "unresolvedPolySchemaRefs": []
    } as SchemaSpec;

    const specs = [specA, specB, specC, specD, specE] as SchemaSpec[];
    const expected = [
      {
        path: 'aaron.testing',
        interfaceName: 'AaronTesting',
        namespaces: {
          aaron: {
            testing: {
              ProjectApiKeyDeleteResponse: specA,
              SomethingElse: specB,
            }
          }
        },
      },
      {
        path: 'aaron',
        interfaceName: 'Aaron',
        namespaces: {
          aaron: {
            AnotherThing: specC
          }
        },
      },
      {
        path: 'foo.bar',
        interfaceName: 'FooBar',
        namespaces: {
          foo: {
            bar: {
              Baz: specD
            }
          }
        },
      },
      {
        path: 'default',
        interfaceName: 'Schemas',
        namespaces: {
          Goody: specE
        },
      },
    ]
    // Stringify and using jest's `toEqual` to make sure that we match strictly
    // Otherwise properties exisint in the result that aren't specified in objects within the `expected` array will not get flagged
    expect(JSON.stringify(buildSchemaTree(specs), undefined, 2)).toEqual(JSON.stringify(expected, undefined, 2));
  });

  describe('printSpecs', () => {

    test('single spec', () => {
      const specs: SchemaSpec[] = [
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'ProjectApiKeyDeleteResponse',
          'context': 'aaron.testing',
          'contextName': 'aaron.testing.ProjectApiKeyDeleteResponse',
          'type': 'schema',
          'definition': {
            'type': 'object',
            'properties': {
              'object': {
                'type': 'string',
                'enum': [
                  'organization.project.api_key.deleted'
                ]
              },
              'id': {
                'type': 'string'
              },
              'deleted': {
                'type': 'boolean'
              }
            },
            'required': [
              'object',
              'id',
              'deleted'
            ],
            'additionalProperties': false,
            '$schema': 'http://json-schema.org/draft-06/schema#',
            'title': 'Schema'
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': []
        } as SchemaSpec
      ];

      const result = printSchemaSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./aaron.testing.d.ts" />',
        )
      );
      expect(result['aaron.testing.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Aaron {',
          '    namespace Testing {',
          '      type ProjectApiKeyDeleteResponse = {',
          '        object: \'organization.project.api_key.deleted\';',
          '        id: string;',
          '        deleted: boolean;',
          '      };',
          '    }',
          '  }',
          '}',
        )
      );
    });

    test('single spec with nested definitions', () => {
      const specs: SchemaSpec[] = [
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'ProjectApiKeyDeleteResponse',
          'context': 'aaron.testing',
          'contextName': 'aaron.testing.ProjectApiKeyDeleteResponse',
          'type': 'schema',
          'definition': {
            'type': 'object',
            'properties': {
              'object': {
                '$ref': '#/definitions/ProjectApiKeyDeleteResponse'
              },
              'id': {
                '$ref': '#/definitions/Id'
              },
              'deleted': {
                '$ref': '#/definitions/Deleted'
              }
            },
            'required': [
              'object',
              'id',
              'deleted'
            ],
            'additionalProperties': false,
            '$schema': 'http://json-schema.org/draft-06/schema#',
            'title': 'Schema',
            'definitions': {
              'ProjectApiKeyDeleteResponse': {
                'type': 'string',
                'enum': [
                  'organization.project.api_key.deleted'
                ]
              },
              'Id': {
                'type': 'string'
              },
              'Deleted': {
                'type': 'boolean'
              }
            }
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': []
        } as SchemaSpec
      ];

      const result = printSchemaSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./aaron.testing.d.ts" />',
        )
      );
      expect(result['aaron.testing.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Aaron {',
          '    namespace Testing {',
          '      type ProjectApiKeyDeleteResponse = {',
          '        object: Aaron.Testing.ProjectApiKeyDeleteResponse1;',
          '        id: Aaron.Testing.Id;',
          '        deleted: Aaron.Testing.Deleted;',
          '      };',
          '      type ProjectApiKeyDeleteResponse1 = \'organization.project.api_key.deleted\';',
          '      type Id = string;',
          '      type Deleted = boolean;',
          '    }',
          '  }',
          '}',
        )
      );
    });

    test('single spec with no context', () => {
      const specs: SchemaSpec[] = [
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'ProjectApiKeyDeleteResponse',
          'context': '',
          'contextName': 'ProjectApiKeyDeleteResponse',
          'type': 'schema',
          'definition': {
            'type': 'object',
            'properties': {
              'object': {
                'type': 'string',
                'enum': [
                  'organization.project.api_key.deleted'
                ]
              },
              'id': {
                'type': 'string'
              },
              'deleted': {
                'type': 'boolean'
              }
            },
            'required': [
              'object',
              'id',
              'deleted'
            ],
            'additionalProperties': false,
            '$schema': 'http://json-schema.org/draft-06/schema#',
            'title': 'Schema'
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': []
        } as SchemaSpec
      ];

      const result = printSchemaSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./default.d.ts" />',
        )
      );
      expect(result['default.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  type ProjectApiKeyDeleteResponse = {',
          '    object: \'organization.project.api_key.deleted\';',
          '    id: string;',
          '    deleted: boolean;',
          '  };',
          '}',
        )
      );
    });

    test('multiple specs', () => {
      const specA = {
        "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
        "name": "ProjectApiKeyDeleteResponse",
        "context": "aaron.testing",
        "contextName": "aaron.testing.ProjectApiKeyDeleteResponse",
        "type": "schema",
        "definition": {
          "type": "object",
          "properties": {
            "object": {
              "type": "string",
              "enum": [
                "organization.project.api_key.deleted"
              ]
            },
            "id": {
              "type": "string"
            },
            "deleted": {
              "type": "boolean"
            }
          },
          "required": [
            "object",
            "id",
            "deleted"
          ],
          "additionalProperties": false,
          "$schema": "http://json-schema.org/draft-06/schema#",
          "title": "Schema"
        },
        "visibilityMetadata": {
          "visibility": "ENVIRONMENT"
        },
        "unresolvedPolySchemaRefs": []
      } as SchemaSpec;
      const specB = {
        "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
        "name": "SomethingElse",
        "context": "aaron.testing",
        "contextName": "aaron.testing.SomethingElse",
        "type": "schema",
        "definition": {
          "type": "string"
        },
        "visibilityMetadata": {
          "visibility": "ENVIRONMENT"
        },
        "unresolvedPolySchemaRefs": []
      } as SchemaSpec;
      const specC = {
        "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
        "name": "AnotherThing",
        "context": "aaron",
        "contextName": "aaron.AnotherThing",
        "type": "schema",
        "definition": {
          "type": "number"
        },
        "visibilityMetadata": {
          "visibility": "ENVIRONMENT"
        },
        "unresolvedPolySchemaRefs": []
      } as SchemaSpec;
      const specD = {
        "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
        "name": "Baz",
        "context": "foo.bar",
        "contextName": "foo.bar.Baz",
        "type": "schema",
        "definition": {
          "type": "number"
        },
        "visibilityMetadata": {
          "visibility": "ENVIRONMENT"
        },
        "unresolvedPolySchemaRefs": []
      } as SchemaSpec;
      const specE = {
        "id": "ad5edb98-9eeb-4bb5-8122-32f9a6f6b512",
        "name": "Goody",
        "context": "",
        "contextName": "Goody",
        "type": "schema",
        "definition": {
          "type": "number"
        },
        "visibilityMetadata": {
          "visibility": "ENVIRONMENT"
        },
        "unresolvedPolySchemaRefs": []
      } as SchemaSpec;

      const specs = [specA, specB, specC, specD, specE] as SchemaSpec[];

      const result = printSchemaSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./aaron.testing.d.ts" />',
          '/// <reference path="./aaron.d.ts" />',
          '/// <reference path="./foo.bar.d.ts" />',
          '/// <reference path="./default.d.ts" />',
        )
      );
      expect(result['default.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  type Goody = number;',
          '}',
        )
      );
      expect(result['aaron.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Aaron {',
          '    type AnotherThing = number;',
          '  }',
          '}',
        )
      );
      expect(result['aaron.testing.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Aaron {',
          '    namespace Testing {',
          '      type ProjectApiKeyDeleteResponse = {',
          '        object: \'organization.project.api_key.deleted\';',
          '        id: string;',
          '        deleted: boolean;',
          '      };',
          '      type SomethingElse = string;',
          '    }',
          '  }',
          '}',
        )
      );

      expect(result['foo.bar.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Foo {',
          '    namespace Bar {',
          '      type Baz = number;',
          '    }',
          '  }',
          '}',
        )
      );
    });

    test('multiple specs with poly refs', () => {
      const specs: SchemaSpec[] = [
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'ProjectApiKeyDeleteResponse',
          'context': 'aaron.testing',
          'contextName': 'aaron.testing.ProjectApiKeyDeleteResponse',
          'type': 'schema',
          'definition': {
            'type': 'object',
            'properties': {
              'object': {
                'type': 'string',
                'enum': [
                  'organization.project.api_key.deleted'
                ]
              },
              'id': {
                'type': 'string'
              },
              'deleted': {
                'type': 'boolean'
              },
              'other': {
                'x-poly-ref': {
                  'path': 'polyapi.adyen.capital.OtherOptions'
                }
              },
              'headers': {
                'x-poly-ref': {
                  'path': 'other.foober.Headers'
                }
              }
            },
            'required': [
              'object',
              'id',
              'deleted',
              'other',
              'headers',
            ],
            'additionalProperties': false,
            '$schema': 'http://json-schema.org/draft-06/schema#',
            'title': 'Schema'
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': [{
            'path': 'other.foober.Headers'
          }]
        } as SchemaSpec
      ];

      const result = printSchemaSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./aaron.testing.d.ts" />',
          '/// <reference path="./other.foober.d.ts" />',
          '/// <reference path="./polyapi.adyen.capital.d.ts" />',
        )
      );
      expect(result['aaron.testing.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Aaron {',
          '    namespace Testing {',
          '      type ProjectApiKeyDeleteResponse = {',
          '        object: \'organization.project.api_key.deleted\';',
          '        id: string;',
          '        deleted: boolean;',
          '        other: Polyapi.Adyen.Capital.OtherOptions;',
          '        headers: Other.Foober.Headers;',
          '      };',
          '    }',
          '  }',
          '}',
        )
      );
      expect(result['polyapi.adyen.capital.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Polyapi {',
          '    namespace Adyen {',
          '      namespace Capital {',
          '        /**',
          '         * Missing schema, as context `polyapi.adyen.capital` was not generated.',
          '         */',
          '        type OtherOptions = unknown /* Unresolved type */;',
          '      }',
          '    }',
          '  }',
          '}',
        )
      );
      expect(result['other.foober.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Other {',
          '    namespace Foober {',
          '      /**',
          '       * Unresolved schema, please add schema `other.foober.Headers` to complete it.',
          '       */',
          '      type Headers = unknown /* Unresolved type */;',
          '    }',
          '  }',
          '}',
        )
      );
    });
    test('multiple specs with discriminator', () => {
      const specs: SchemaSpec[] = [
        {
          "id": "209020d2-a8b8-4ae8-8822-0ea511250652",
          "name": "BankAccountIdentification",
          "context": "adyen.capital",
          "contextName": "adyen.capital.BankAccountIdentification",
          "type": "schema",
          "definition": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "description": "The type of account, which depends on the country of the account and the currency of the transfer."
              }
            },
            "discriminator": {
              "propertyName": "type",
              "mapping": {
                "iban": "#/components/schemas/IbanAccountIdentification",
                "numberAndBic": "#/components/schemas/NumberAndBicAccountIdentification",
                "auLocal": "#/components/schemas/AULocalAccountIdentification"
              }
            },
            "additionalProperties": false,
            "$schema": "http://json-schema.org/draft-06/schema#"
          },
          "visibilityMetadata": {
            "visibility": "ENVIRONMENT"
          },
          "unresolvedPolySchemaRefs": []
        } as SchemaSpec,
        {
          "id": "5ee03fc7-e829-4f16-bff1-2079c0303046",
          "name": "IbanAccountIdentification",
          "context": "adyen.capital",
          "contextName": "adyen.capital.IbanAccountIdentification",
          "type": "schema",
          "definition": {
            "required": [
              "iban",
              "type"
            ],
            "type": "object",
            "allOf": [
              {
                "x-poly-ref": {
                  "path": "adyen.capital.BankAccountIdentification"
                }
              },
              {
                "type": "object",
                "properties": {
                  "iban": {
                    "type": "string",
                    "description": "The international bank account number as defined in the [ISO-13616](https://www.iso.org/standard/81090.html) standard."
                  },
                  "type": {
                    "type": "string",
                    "description": "**iban**",
                    "default": "iban"
                  }
                },
                "additionalProperties": false
              }
            ],
            "additionalProperties": false,
            "$schema": "http://json-schema.org/draft-06/schema#"
          },
          "visibilityMetadata": {
            "visibility": "ENVIRONMENT"
          },
          "unresolvedPolySchemaRefs": []
        } as SchemaSpec,
        {
          "id": "d53fa253-57b3-4eb3-9090-a1192a0e781e",
          "name": "NumberAndBicAccountIdentification",
          "context": "adyen.capital",
          "contextName": "adyen.capital.NumberAndBicAccountIdentification",
          "type": "schema",
          "definition": {
            "required": [
              "accountNumber",
              "bic",
              "type"
            ],
            "type": "object",
            "allOf": [
              {
                "x-poly-ref": {
                  "path": "adyen.capital.BankAccountIdentification"
                }
              },
              {
                "type": "object",
                "properties": {
                  "accountNumber": {
                    "maxLength": 34,
                    "type": "string",
                    "description": "The bank account number, without separators or whitespace. The length and format depends on the bank or country."
                  },
                  "additionalBankIdentification": {
                    "description": "Additional identification codes of the bank. Some banks may require these identifiers for cross-border transfers.",
                    "x-poly-ref": {
                      "path": "adyen.capital.AdditionalBankIdentification"
                    }
                  },
                  "bic": {
                    "maxLength": 11,
                    "minLength": 8,
                    "type": "string",
                    "description": "The bank's 8- or 11-character BIC or SWIFT code."
                  },
                  "type": {
                    "type": "string",
                    "description": "**numberAndBic**",
                    "default": "numberAndBic"
                  }
                },
                "additionalProperties": false
              }
            ],
            "additionalProperties": false,
            "$schema": "http://json-schema.org/draft-06/schema#"
          },
          "visibilityMetadata": {
            "visibility": "ENVIRONMENT"
          },
          "unresolvedPolySchemaRefs": []
        } as SchemaSpec,
        {
          "id": "b9c9289e-d922-41be-b09f-746e330cd49b",
          "name": "AULocalAccountIdentification",
          "context": "adyen.capital",
          "contextName": "adyen.capital.AULocalAccountIdentification",
          "type": "schema",
          "definition": {
            "required": [
              "accountNumber",
              "bsbCode",
              "type"
            ],
            "type": "object",
            "allOf": [
              {
                "x-poly-ref": {
                  "path": "adyen.capital.BankAccountIdentification"
                }
              },
              {
                "type": "object",
                "properties": {
                  "accountNumber": {
                    "maxLength": 9,
                    "minLength": 5,
                    "type": "string",
                    "description": "The bank account number, without separators or whitespace."
                  },
                  "bsbCode": {
                    "maxLength": 6,
                    "minLength": 6,
                    "type": "string",
                    "description": "The 6-digit [Bank State Branch (BSB) code](https://en.wikipedia.org/wiki/Bank_state_branch), without separators or whitespace."
                  },
                  "type": {
                    "type": "string",
                    "description": "**auLocal**",
                    "default": "auLocal"
                  }
                },
                "additionalProperties": false
              }
            ],
            "additionalProperties": false,
            "$schema": "http://json-schema.org/draft-06/schema#"
          },
          "visibilityMetadata": {
            "visibility": "ENVIRONMENT"
          },
          "unresolvedPolySchemaRefs": []
        } as SchemaSpec
      ];
      const result = printSchemaSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./adyen.capital.d.ts" />',
        )
      );
      expect(result['adyen.capital.d.ts']).toEqual(
        multiline(
          'declare namespace schemas {',
          '  namespace Adyen {',
          '    namespace Capital {',
          '      type BankAccountIdentification = {',
          '        /**',
          '         * The type of account, which depends on the country of the account and the currency of the transfer.',
          '         */',
          '        type?: ',
          '          | \'iban\'',
          '          | \'numberAndBic\'',
          '          | \'auLocal\';',
          '      };',
          '      type IbanAccountIdentification = Adyen.Capital.BankAccountIdentification & {',
          '        /**',
          '         * The international bank account number as defined in the [ISO-13616](https://www.iso.org/standard/81090.html) standard.',
          '         */',
          '        iban?: string;',
          '        /**',
          '         * **iban**',
          '         */',
          '        type?: string;',
          '      };',
          '      type NumberAndBicAccountIdentification = Adyen.Capital.BankAccountIdentification & {',
          '        /**',
          '         * The bank account number, without separators or whitespace. The length and format depends on the bank or country.',
          '         */',
          '        accountNumber?: string;',
          '        /**',
          '         * Additional identification codes of the bank. Some banks may require these identifiers for cross-border transfers.',
          '         */',
          '        additionalBankIdentification?: Adyen.Capital.AdditionalBankIdentification;',
          '        /**',
          '         * The bank\'s 8- or 11-character BIC or SWIFT code.',
          '         */',
          '        bic?: string;',
          '        /**',
          '         * **numberAndBic**',
          '         */',
          '        type?: string;',
          '      };',
          '      /**',
          '       * Missing schema, as context `adyen.capital` was not generated.',
          '       */',
          '      type AdditionalBankIdentification = unknown /* Unresolved type */;',
          '      type AuLocalAccountIdentification = Adyen.Capital.BankAccountIdentification & {',
          '        /**',
          '         * The bank account number, without separators or whitespace.',
          '         */',
          '        accountNumber?: string;',
          '        /**',
          '         * The 6-digit [Bank State Branch (BSB) code](https://en.wikipedia.org/wiki/Bank_state_branch), without separators or whitespace.',
          '         */',
          '        bsbCode?: string;',
          '        /**',
          '         * **auLocal**',
          '         */',
          '        type?: string;',
          '      };',
          '    }',
          '  }',
          '}',
        )
      );
    })
  });
});
