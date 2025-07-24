import fs from 'fs';
import { memoize, set } from 'lodash';
import { toPascalCase } from '@guanghechen/helper-string';
import { EOL } from 'node:os';
import { SchemaRef, SchemaSpecification } from '../../types';
import { echoGenerationError } from '../../utils';
import { setGenerationErrors } from './types';
import shell from 'shelljs'
import chalk from 'chalk';

const unsafeCharacters = /(?:^\d)|[^0-9a-zA-Z_]/gi;
const unescapedSingleQuote = /\b'\b/gi;

const wrapUnsafeNames = (name: string) => {
  if (!name.match(unsafeCharacters)) return name;
  if (name.includes("'")) name = name.replaceAll(unescapedSingleQuote, "'");
  return `'${name}'`;
};

const formatName = (name: string, nested = false) =>
  name === '[k: string]'
    ? name
    : wrapUnsafeNames(nested ? name : toPascalCase(name));

type JsonSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'object'
  | 'array'
  | 'boolean'
  | 'null';

type JsonSchemaTypeDeclaration = JsonSchemaType | JsonSchemaType[];

type ConstValueT = null | string | number | boolean;

export type JsonSchema = {
  // JSON Schema Draft 4
  type?: JsonSchemaTypeDeclaration | 'unresolved';
  title?: string;
  description?: string;
  items?: JsonSchema | JsonSchema[];
  additionalItems?: boolean | JsonSchema;
  schemas?: Record<string, JsonSchema>;
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[]; // converted to anyOf
  discriminator?: {
    // technically this is part of OpenAPI--not JSON Schema
    propertyName: string;
    mapping: Record<string, string>;
  };
  $id?: string;
  $ref?: string;
  $schema?: string;
  deprecated?: boolean;
  nullable?: boolean;
  enum?: ConstValueT[];
  const?: ConstValueT;
  definitions?: Record<string, JsonSchema>;
  'x-poly-ref'?: SchemaRef;
  [k: string]: unknown;
};

export type SchemaSpec = Omit<SchemaSpecification, 'definition'> & {
  definition: JsonSchema;
};

type SchemaTree = Record<string, SchemaSpec | Record<string, SchemaSpec>>;

export const ws = memoize((depth = 1) =>
  depth < 0 ? '' : new Array(depth).fill('  ').join(''),
);
const end = memoize((nested?: NestedT) =>
  !nested || nested === 'object' ? ';' : '',
);

const wrapParens = (v: string): string =>
  v.includes('| ') || v.includes('& ') ? `(${v})` : v;

const printComment = (comment = '', depth = 0, deprecated = false) => {
  if (!comment && !deprecated) return '';

  if (!comment && deprecated) {
    return `${ws(depth)}/**${EOL}${ws(depth)} * @deprecated${EOL}${ws(
      depth,
    )} */${EOL}`;
  }

  const nl = comment.includes(EOL) ? EOL : '\n';
  return [
    `${ws(depth)}/**${deprecated ? `${EOL}${ws(depth)} * @deprecated` : ''}`,
    ...comment.split(nl).map((line) => `${ws(depth)} * ${line}`),
    `${ws(depth)} */${EOL}`,
  ].join(EOL);
};

type NestedT = undefined | null | 'object' | 'array' | 'union' | 'intersection';
type PrintSchemaFn = (
  schema: JsonSchema,
  key: string,
  depth: number,
  nested?: NestedT,
  optional?: boolean,
) => string;

const printTypeName = (
  title: string | undefined,
  key: string,
  nested: NestedT,
  optional = false,
) => {
  if (!nested) {
    return `type ${formatName(title || key)} = `;
  }
  if (nested === 'object') {
    return `${formatName(key, true)}${optional ? '?' : ''}: `;
  }
  // Don't print the name when nested within arrays or enums
  return '';
};

const printEnumSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  const values = schema.enum || [];
  if (values.length === 1) {
    return printConstSchema(
      { ...schema, const: values[0] },
      key,
      depth,
      nested,
      optional,
    );
  }
  if (schema.nullable && !values.includes(null)) values.unshift(null);
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${values
    .map(
      (v) => `${EOL}${ws(depth + 1)}| ${typeof v === 'string' ? `'${v}'` : v}`,
    )
    .join('')}${end(nested)}`;
};

const printStringSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${
    schema.nullable ? 'null | ' : ''
  }string${end(nested)}`;
};

const printNumberSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${
    schema.nullable ? 'null | ' : ''
  }number${end(nested)}`;
};

const printBooleanSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${
    schema.nullable ? 'null | ' : ''
  }boolean${end(nested)}`;
};

const printNullSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}null${end(nested)}`;
};

const printObjectSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  let result = `${printComment(
    schema.description,
    depth,
    schema.deprecated,
  )}${ws(depth)}${printTypeName(schema.title, key, nested, optional)}`;
  if (
    schema.properties ||
    schema.patternProperties ||
    schema.additionalProperties
  ) {
    result = `${result}{`;
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([k, v]) => {
        result = `${result}${EOL}${printSchemaAsType(
          v,
          k,
          depth + 1,
          'object',
          !schema.required?.includes(k),
        )}`;
      });
    }
    if (schema.patternProperties) {
      // If single pattern property or many with same type then printSchemaAsType with key: `[k: string]`
      // If multiple types then printSchemaAsType with key: `[k: string]` and union type for value
      const subschemas = Array.from(Object.values(schema.patternProperties));
      const types = new Set<string>(subschemas.map((s) => JSON.stringify(s)));
      let subschema;
      if (typeof schema.additionalProperties === 'object') {
        subschema = { anyOf: subschemas.concat(schema.additionalProperties) };
      } else if (types.size === 1) {
        subschema = JSON.parse(Array.from(types.values())[0]);
      } else {
        subschema = { anyOf: subschemas };
      }
      result = `${result}${EOL}${printSchemaAsType(
        subschema,
        '[k: string]',
        depth + 1,
        'object',
      )}`;
    } else if (schema.additionalProperties) {
      if (typeof schema.additionalProperties === 'object') {
        result = `${result}${EOL}${printSchemaAsType(
          schema.additionalProperties,
          '[k: string]',
          depth + 1,
          'object',
        )}`;
      } else {
        result = `${result}${EOL}${ws(depth + 1)}[k: string]: unknown;`;
      }
    }
    result = `${result}${EOL}${ws(depth)}}${end(nested)}`;
  } else if (nested) {
    // Nested object type with no properties falls back to record type
    result = `${result}Record<string, unknown>${end(nested)}`;
  } else {
    // Non-nested object type uses empty interface {}
    result = `${result}{}${end(nested)}`;
  }
  return result;
};

const printTupleSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  if (!Array.isArray(schema.items)) { throw new Error('schema.items should be an array to use this function'); }
  let result = `${printComment(
    schema.description,
    depth,
    schema.deprecated,
  )}${ws(depth)}${printTypeName(schema.title, key, nested, optional)}`;

  if (!schema.items.length) {
    result = `${result}void[]${end(nested)}`;
  } else {
    // tuple type
    result = `${result}[${EOL}${schema.items
      .map((item) => printSchemaAsType(item, '', depth + 1, 'array'))
      .join(`,${EOL}`)}`;
    if (schema.additionalItems) {
      if (typeof schema.additionalItems === 'object') {
        const child = printSchemaAsType(
          schema.additionalItems,
          '',
          depth + 1,
          'array',
        ).trim();
        if (child.includes(EOL)) {
          result = `${result},${EOL}${ws(depth + 1)}...Array<${child}>`;
        } else {
          result = `${result},${EOL}${ws(depth + 1)}...${child}[]`;
        }
      } else {
        result = `${result},${EOL}${ws(depth + 1)}...unknown[]`;
      }
    }
    result = `${result}${EOL}${ws(depth)}]${end(nested)}`;
  }
  return result;
};

const printArraySchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  if (Array.isArray(schema.items)) { return printTupleSchema(schema, key, depth, nested, optional); }

  let result = `${printComment(
    schema.description,
    depth,
    schema.deprecated,
  )}${ws(depth)}${printTypeName(schema.title, key, nested, optional)}`;

  if (schema.items) {
    const child = printSchemaAsType(schema.items, '', depth + 1, 'array');
    if (child.includes(EOL)) {
      result = `${result}Array<${EOL}${child}${EOL}${ws(depth)}>${end(nested)}`;
    } else {
      result = `${result}${child.trim()}[]${end(nested)}`;
    }
  } else {
    result = `${result}unknown[]${end(nested)}`;
  }

  return result;
};

const printMultiTypeSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  if (!Array.isArray(schema.type) || !schema.type.length) {
    throw new Error(
      'schema.type should be a non-empty array to use this function',
    );
  }
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${schema.type.join(
    ' | ',
  )}${end(nested)}`;
};

const printIntersectionSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  if (!Array.isArray(schema.allOf) || !schema.allOf.length) {
    throw new Error(
      'schema.allOf should be a non-empty array to use this function',
    );
  }
  if (schema.allOf.length === 1) {
    // no need to print as an intersection type since only one value
    return printSchemaAsType(
      { ...schema, ...schema.allOf[0], allOf: undefined },
      key,
      depth,
      nested,
      optional,
    );
  }
  let subtypes = schema.allOf
    .map((s) => printSchemaAsType(s, '', depth, 'intersection'))
    // wrap subschemas in parens if needed
    .map((v) => wrapParens(v.trim()))
    .join(' & ');
  if (schema.nullable) {
    subtypes = `null | (${subtypes})`;
  }
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${subtypes}${end(
    nested,
  )}`;
};

const printUnionSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  if (!Array.isArray(schema.anyOf) || !schema.anyOf.length) {
    throw new Error(
      'schema.anyOf should be a non-empty array to use this function',
    );
  }
  if (schema.anyOf.length === 1) {
    // no need to print as a union type since only one value
    return printSchemaAsType(
      { ...schema, ...schema.anyOf[0], anyOf: undefined },
      key,
      depth,
      nested,
      optional,
    );
  }
  const subtypes = schema.anyOf
    .map((s) => printSchemaAsType(s, '', depth + 1, 'union'))
    .map(
      (v, i) =>
        `${EOL}${ws(depth + 1)}${
          i || !nested || nested === 'object' ? '| ' : ''
        }${wrapParens(v.trim())}`,
    )
    .join('');
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${
    schema.nullable ? `${EOL}${ws(depth + 1)}| null` : ''
  }${subtypes}${end(nested)}`;
};

const printPolyRefSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  const ref = schema['x-poly-ref'];
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${
    ref.publicNamespace ? `${formatName(ref.publicNamespace)}.` : ''
  }${ref.path
    .split('.')
    .map((v) => formatName(v))
    .join('.')}${end(nested)}`;
};

const printAnySchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}unknown${end(nested)}`;
};

const printUnresolvedSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(
    schema.title,
    key,
    nested,
    optional,
  )}unknown /* Unresolved type */${end(nested)}`;
};

const printConstSchema: PrintSchemaFn = (
  schema,
  key,
  depth,
  nested,
  optional = false,
) => {
  return `${printComment(schema.description, depth, schema.deprecated)}${ws(
    depth,
  )}${printTypeName(schema.title, key, nested, optional)}${
    schema.nullable && schema.const !== null ? 'null | ' : ''
  }${
    typeof schema.const === 'string' ? `'${schema.const}'` : schema.const!
  }${end(nested)}`;
};

export const printSchemaAsType: PrintSchemaFn = (
  schema: JsonSchema,
  key,
  depth = 0,
  nested,
  optional = false,
): string => {
  if (schema['x-poly-ref']) { return printPolyRefSchema(schema, key, depth, nested, optional); }
  if (schema.const !== undefined) { return printConstSchema(schema, key, depth, nested, optional); }
  if (Array.isArray(schema.enum) && schema.enum.length) { return printEnumSchema(schema, key, depth, nested, optional); }
  if (Array.isArray(schema.type) && schema.type.length) { return printMultiTypeSchema(schema, key, depth, nested, optional); }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) { return printUnionSchema(schema, key, depth, nested, optional); }
  if (Array.isArray(schema.allOf) && schema.allOf.length) { return printIntersectionSchema(schema, key, depth, nested, optional); }
  switch (schema.type) {
    case 'object':
      return printObjectSchema(schema, key, depth, nested, optional);
    case 'array':
      return printArraySchema(schema, key, depth, nested, optional);
    case 'string':
      return printStringSchema(schema, key, depth, nested, optional);
    case 'integer':
    case 'number':
      return printNumberSchema(schema, key, depth, nested, optional);
    case 'boolean':
      return printBooleanSchema(schema, key, depth, nested, optional);
    case 'null':
      return printNullSchema(schema, key, depth, nested, optional);
    case 'unresolved':
      return printUnresolvedSchema(schema, key, depth, nested, optional);
  }
  return printAnySchema(schema, key, depth, nested, optional);
};

const printSchemaTreeAsTypes = (
  schema: SchemaTree,
  name: string,
  depth = 0,
): string => {
  let result = `${ws(depth)}namespace ${formatName(name, false)} {`;
  for (const [key, child] of Object.entries(schema)) {
    // null/undefined child is placeholder type so that we can generate namespaces with nothing inside them
    if (!child) continue;

    let generated = '';
    if ('type' in child && child.type === 'schema') {
      try {
        generated = printSchemaAsType(
          child.definition as JsonSchema,
          (child.name || key) as string,
          depth + 1,
        );
      } catch (err) {
        console.error(err);
        echoGenerationError(child as SchemaSpec);
        setGenerationErrors(true);
      }
    } else {
      generated = printSchemaTreeAsTypes(child as SchemaTree, key, depth + 1);
    }
    result = `${result}${EOL}${generated}`;
  }
  result = `${result}${EOL}${ws(depth)}}`;
  return result;
};

const normalizeSchema = <S extends SchemaSpec | JsonSchema>(schema: S): S => {
  if (schema.type === 'schema') {
    schema.definition.title = schema.name;
    schema.definition.description =
      schema.definition.description || schema.description;
    schema.definition = normalizeSchema(schema.definition);
    return schema;
  }
  if (Array.isArray(schema.oneOf)) {
    // Treat oneOf as equivalent to anyOf
    schema.anyOf = schema.oneOf;
    schema.oneOf = undefined;
  }
  if (schema.discriminator) {
    // TODO: Need to fix backend code to handle discriminators more effectively
    const { propertyName, mapping } = schema.discriminator;
    const property = schema.properties?.[propertyName];
    if (property && !property.enum) {
      property.enum = Object.keys(mapping);
    }
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf = schema.anyOf!.map((s) => normalizeSchema(s));
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf = schema.allOf!.map((s) => normalizeSchema(s));
  }
  if (
    schema.type === 'object' ||
    (Array.isArray(schema.type) && schema.type.includes('object'))
  ) {
    if (schema.additionalProperties == null) {
      schema.additionalProperties = false;
    }
    if (!Array.isArray(schema.required)) {
      schema.required = [];
    }
  } else if (
    schema.type === 'array' ||
    (Array.isArray(schema.type) && schema.type.includes('array'))
  ) {
    if (
      schema.items &&
      !Array.isArray(schema.items) &&
      schema.additionalItems
    ) {
      // Convert schema.items to tuple type
      schema.items = [schema.items];
    }
    if (!schema.items) {
      schema.items = {};
    }
    if (schema.additionalItems === true) {
      schema.additionalItems = {};
    }
  }
  if (Array.isArray(schema.enum) && schema.enum.length === 1) {
    schema.const = schema.enum[0];
    schema.enum = undefined;
  }
  return schema;
};

const getPolySchemaRefs = (schema: JsonSchema): string[] => {
  if (schema['x-poly-ref']) return [schema['x-poly-ref'].path];
  let toSearch = [];
  if (schema.schemas) toSearch = toSearch.concat(Object.values(schema.schemas));
  if (schema.properties) { toSearch = toSearch.concat(Object.values(schema.properties)); }
  if (schema.patternProperties) { toSearch = toSearch.concat(Object.values(schema.patternProperties)); }
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      toSearch = toSearch.concat(schema.items);
    } else {
      toSearch.push(schema.items);
    }
  }
  if (typeof schema.additionalItems === 'object') toSearch.push(schema.items);
  if (typeof schema.additionalProperties === 'object') { toSearch.push(schema.additionalProperties); }
  if (Array.isArray(schema.allOf)) toSearch = toSearch.concat(schema.allOf);
  if (Array.isArray(schema.anyOf)) toSearch = toSearch.concat(schema.anyOf);
  return toSearch.flatMap((s) => getPolySchemaRefs(s));
};

const fillInUnresolvedSchemas = (specs: SchemaSpec[]): SchemaSpec[] => {
  const schemas = new Map<string, SchemaSpec>();
  for (const spec of specs) {
    schemas.set(spec.contextName, spec);
    // If schema is unresolved then it doesn't exist in the database so we add a placeholder type
    if (spec.unresolvedPolySchemaRefs?.length) {
      for (const unresolved of spec.unresolvedPolySchemaRefs) {
        if (schemas.has(unresolved.path)) continue;
        const parts = unresolved.path.split('.');
        const name = parts.pop();
        const fillerSpec: SchemaSpec = {
          id: '',
          type: 'schema',
          name,
          context: parts.join('.'),
          contextName: unresolved.path,
          definition: {
            type: 'unresolved',
            title: name,
            description: `Unresolved schema, please add schema \`${unresolved.path}\` to complete it.`,
          },
          visibilityMetadata: {
            // @ts-expect-error - it's fine
            visibility: 'ENVIRONMENT',
          },
        };
        shell.echo(
          chalk.yellow(`WARNING: Schema '${unresolved.path}' referenced from '${spec.contextName}' is unresolved. Falling back to 'unknown' type fro '${unresolved.path}'.`)
        );
        schemas.set(unresolved.path, fillerSpec);
      }
    }
    // Look for any schema references which are missing (exist in the DB but some part of context was excluded in generation command)
    const refs = getPolySchemaRefs(spec.definition);
    for (const contextName of refs) {
      if (schemas.has(contextName)) continue;
      const parts = contextName.split('.');
      const name = parts.pop();
      const context = parts.join('.');
      const fillerSpec: SchemaSpec = {
        id: '',
        type: 'schema',
        name,
        context,
        contextName,
        definition: {
          type: 'unresolved',
          title: name,
          description: `Missing schema, as context \`${context}\` was not generated.`,
        },
        visibilityMetadata: {
          // @ts-expect-error - it's fine
          visibility: 'ENVIRONMENT',
        },
      };
      shell.echo(
        chalk.yellow(`WARNING: Schema '${contextName}' referenced from '${spec.contextName}' is unresolved. Falling back to 'unknown' type for '${contextName}'.`)
      );
      schemas.set(contextName, fillerSpec);
    }
  }
  return Array.from(schemas.values());
};

const replaceJsonSchemasWithPolyAPISchemas = (
  schema: JsonSchema,
  mapping: Map<string, string>,
): void => {
  if (schema['$ref'] && mapping.has(schema['$ref'])) {
    schema['x-poly-ref'] = {
      path: mapping.get(schema['$ref']),
    };
    delete schema['$ref'];
  }
  let toSearch = [];
  if (schema.schemas) toSearch = toSearch.concat(Object.values(schema.schemas));
  if (schema.properties) { toSearch = toSearch.concat(Object.values(schema.properties)); }
  if (schema.patternProperties) { toSearch = toSearch.concat(Object.values(schema.patternProperties)); }
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      toSearch = toSearch.concat(schema.items);
    } else {
      toSearch.push(schema.items);
    }
  }
  if (typeof schema.additionalItems === 'object') toSearch.push(schema.items);
  if (typeof schema.additionalProperties === 'object') { toSearch.push(schema.additionalProperties); }
  if (Array.isArray(schema.allOf)) toSearch = toSearch.concat(schema.allOf);
  if (Array.isArray(schema.anyOf)) toSearch = toSearch.concat(schema.anyOf);
  for (const s of toSearch) replaceJsonSchemasWithPolyAPISchemas(s, mapping);
};

const flattenDefinitions = (specs: SchemaSpec[]): SchemaSpec[] => {
  // Schemas can $refs defined with their definition being inline within the body of the schema itself
  // This function will convert them into PolyAPI Schemas and `x-poly-ref`s
  const flattened: SchemaSpec[] = [];
  const names = new Set();
  for (const spec of specs) {
    flattened.push(spec);
    names.add(spec.contextName);
    if (!spec.definition.definitions) continue;
    // Pull out all the definitions as PolyAPI Schemas
    const mapping = new Map<string, string>();
    for (const [name, definition] of Object.entries(
      spec.definition.definitions,
    )) {
      // Make sure contextName is unique
      let contextName = '';
      let i = -1;
      do {
        i++;
        contextName = `${spec.context}${spec.context ? '.' : ''}${name}${
          i || ''
        }`;
      } while (names.has(contextName));
      mapping.set(`#/definitions/${name}`, contextName);
      flattened.push({
        id: '',
        type: 'schema',
        name: `${name}${i || ''}`,
        context: spec.context,
        contextName,
        definition,
        visibilityMetadata: {
          // @ts-expect-error - it's fine
          visibility: 'ENVIRONMENT',
        },
      });
    }
    delete spec.definition.definitions;
    replaceJsonSchemasWithPolyAPISchemas(spec.definition, mapping);
  }
  return flattened;
};

type SchemaRoot = {
  path: string;
  interfaceName: string;
  namespaces: SchemaTree;
};

const printSchemaRoot = (root: SchemaRoot): string => {
  // print the interfaces
  let result = 'declare namespace schemas {';
  // print the namespaces
  for (const [key, tree] of Object.entries(root.namespaces)) {
    const types =
      'type' in tree && tree.type === 'schema'
        ? printSchemaAsType(tree.definition as JsonSchema, key, 1)
        : printSchemaTreeAsTypes(tree as SchemaTree, toPascalCase(key), 1);
    result = `${result}${EOL}${types}`;
  }
  // close the module
  result = `${result}${EOL}}`;
  return result;
};

const buildSchemaTree = (specs: SchemaSpec[]): SchemaRoot[] => {
  const schemas: Record<string, SchemaRoot> = {};
  for (const spec of specs) {
    const context = spec.context || 'default';
    const interfaceName = spec.context ? toPascalCase(spec.context) : 'Schemas';
    schemas[context] = schemas[context] || {
      path: context,
      interfaceName,
      namespaces: {},
    };
    set(schemas[context].namespaces, spec.contextName, spec);
  }
  return Array.from(Object.values(schemas));
};

const printSchemaSpecs = (specs: SchemaSpec[]): Record<string, string> => {
  // first normalize the schemas, flatten inline schema definitions and fill in unresolved ones
  const normalized = fillInUnresolvedSchemas(
    flattenDefinitions(specs.map((schema) => normalizeSchema(schema))),
  );
  // then build schema trees
  const trees = buildSchemaTree(normalized);
  // then print all the schema types as strings ready to be saved to disk
  const fileMap = Object.fromEntries(
    trees.map((tree) => [`${tree.path}.d.ts`, printSchemaRoot(tree)]),
  );
  fileMap['index.d.ts'] = Object.keys(fileMap)
    .map((file) => `/// <reference path="./${file}" />`)
    .join(EOL);
  return fileMap;
};

export const generateSchemaTSDeclarationFiles = async (
  libPath: string,
  specs: SchemaSpec[],
): Promise<void> => {
  const files = printSchemaSpecs(specs);
  await Promise.all(
    Object.entries(files).map(
      ([file, contents]) =>
        new Promise<void>((resolve, reject) =>
          fs.writeFile(`${libPath}/schemas/${file}`, contents, (err) =>
            err ? reject(err) : resolve(),
          ),
        ),
    ),
  );
};

export const __test = {
  formatName,
  printComment,
  printSchemaAsType,
  buildSchemaTree,
  printSchemaSpecs,
};
