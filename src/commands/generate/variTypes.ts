import { ObjectPropertyType } from '../../types';
import { getStringPaths, isPlainObjectPredicate } from '../../utils';
import { JsonSchema, normalizeSchema, printSchemaAsType } from './schemaTypes'

// Combine all definitions into a single, simple JSONSchema
const combineDefinitions = (schema: Record<string, unknown>, mapping: Map<string, JsonSchema>): JsonSchema => {
  for (const key of Object.keys(schema)) {
    if (key === "$ref" && typeof schema['$ref'] === 'string') {
      const ref = decodeURI(schema['$ref']);
      if (ref && mapping.has(ref)) {
        return combineDefinitions(mapping.get(ref), mapping);
      }
    } else if (Array.isArray(schema[key])) {
      for (let i = 0; i < (schema[key] as Array<unknown>).length; i++) {
        schema[key][i] = combineDefinitions(schema[key][i], mapping);
      }
    } else if (schema[key] && typeof schema[key] === 'object') {
      schema[key] = combineDefinitions(schema[key] as Record<string, unknown>, mapping);
    }
  }
  return schema;
}

const normalizeVariSchema = (schema: JsonSchema): JsonSchema => {
  let normalized = normalizeSchema(schema);
  // remove nested definitions in favor of embedding the schemas directly in place
  if (normalized.definitions) {
    const mapping = new Map(
      Object.entries(normalized.definitions)
        .map(([name, definition]) => [`#/definitions/${name}`, definition])
    );
    delete normalized.definitions;
    normalized = combineDefinitions(schema, mapping);
  }
  return normalized;
};

export const getVariableValueTypeDeclarations = (
  namespacePath: string,
  namespace: string,
  objectProperty: ObjectPropertyType,
  value: Record<string, unknown> | Array<unknown>
): string => {
  const normalized = normalizeVariSchema(objectProperty.schema);
  let pathValue = "''";
  if (Array.isArray(value) || isPlainObjectPredicate(value)) {
    const unionPath = getStringPaths(value).map((value) => `'${value}'`);
    if (unionPath.length) pathValue = unionPath.join(' | ');
  }
  objectProperty.typeName = `${namespacePath ? `${namespacePath}.` : ''}${namespace}.ValueType`;
  const valueTypeDeclaration = printSchemaAsType(normalized, 'ValueType', 1, null, false).trim(); // trim to remove leading/trailing whitespace
  const declarations = `namespace ${namespace} {\n  export ${valueTypeDeclaration}\n  export type PathValue = ${pathValue};\n}`;
  return declarations;
};