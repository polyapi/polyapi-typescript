import fs from 'fs';
import chalk from 'chalk';
import shell from 'shelljs';
import { EOL } from 'node:os';
import { echoGenerationError, templateUrl } from '../../utils';
import { TableSpecification } from '../../types';
import { toPascalCase } from '@guanghechen/helper-string';
import { set } from 'lodash';
import { JsonSchema, printSchemaAsType, ws } from './schemaTypes';
import { setGenerationErrors } from './types';

type TableTree = Record<string, TableSpecification | Record<string, TableSpecification>>;

type TableRoot = {
  path: string;
  interfaceName: string;
  namespaces: TableTree;
  interfaces: Record<string, string | TableSpecification>;
  hasTypes: boolean;
};

const buildTableTree = (specs: TableSpecification[]): TableRoot[] => {
  const schemas: Record<string, TableRoot> = {
    default: {
      path: 'default',
      interfaceName: 'Tabi',
      interfaces: {},
      namespaces: {},
      hasTypes: false,
    },
  };
  for (const spec of specs) {
    if (!spec.context) {
      schemas.default.interfaces[spec.name] = spec;
      schemas.default.namespaces[spec.name] = spec;
      schemas.default.hasTypes = true;
      continue;
    }
    const contextParts = spec.context.split('.');
    const last = contextParts.length - 1;
    for (let i = 0; i <= last; i++) {
      const name = contextParts[i];
      const interfaceName = toPascalCase(i === last ? name : contextParts[i]);
      const path = contextParts.slice(0, i + 1).join('.');
      const parent = i ? contextParts.slice(0, i).join('.') : 'default';
      if (schemas[path]) continue;
      schemas[path] = {
        path,
        interfaceName,
        interfaces: {},
        namespaces: {},
        hasTypes: false,
      };
      schemas[parent].interfaces[name] = interfaceName;
      set(schemas[parent].namespaces, path, {});
    }
    set(schemas[spec.context].namespaces, spec.contextName.split('.').map(v => toPascalCase(v)).join('.'), spec);
    schemas[spec.context].interfaces[spec.name] = spec;
    schemas[spec.context].hasTypes = true;
  }
  return Array.from(Object.values(schemas));
};

const printTableInterface = (table: TableSpecification | string): string => {
  if (typeof table === 'string') return `${table};`;
  const _ws = ws(1);
  const formattedName = table.contextName.split('.').map(v => toPascalCase(v)).join('.');
  return [
    '{',
    `${_ws}count(query: ${formattedName}.CountQuery): Promise<${formattedName}.CountResult>;`,
    `${_ws}selectMany(query: ${formattedName}.SelectManyQuery): Promise<${formattedName}.QueryResults>;`,
    `${_ws}selectOne(query: ${formattedName}.SelectOneQuery): Promise<${formattedName}.QueryResult>;`,
    `${_ws}insertMany(query: ${formattedName}.InsertManyQuery): Promise<${formattedName}.QueryResults>;`,
    `${_ws}insertOne(query: ${formattedName}.InsertOneQuery): Promise<${formattedName}.QueryResult>;`,
    `${_ws}upsertMany(query: ${formattedName}.InsertManyQuery): Promise<${formattedName}.QueryResults>;`,
    `${_ws}upsertOne(query: ${formattedName}.InsertOneQuery): Promise<${formattedName}.QueryResult>;`,
    `${_ws}updateMany(query: ${formattedName}.UpdateQuery): Promise<${formattedName}.QueryResults>;`,
    `${_ws}updateOne(id: string, query: ${formattedName}.UpdateQuery): Promise<${formattedName}.QueryResult>;`,
    `${_ws}deleteMany(query: ${formattedName}.DeleteQuery): Promise<${formattedName}.DeleteResults>;`,
    `${_ws}deleteOne(id: string, query?: ${formattedName}.DeleteQuery): Promise<${formattedName}.DeleteResult>;`,
    '}',
  ].join(`${EOL}${ws(2)}`);
};

const printTableNamespace = (schema: JsonSchema, name: string, depth = 1): string => {
  return `${ws(depth)}namespace ${toPascalCase(name)} {${EOL}${
    printSchemaAsType(schema, 'Row', depth + 1)
  }${EOL}${EOL}${ws(depth + 1)}${
    [
      'type CountQuery = PolyCountQuery<Row>;',
      'type SelectManyQuery = PolySelectManyQuery<Row>;',
      'type SelectOneQuery = PolySelectOneQuery<Row>;',
      'type InsertManyQuery = PolyInsertManyQuery<Row>;',
      'type InsertOneQuery = PolyInsertOneQuery<Row>;',
      'type UpdateQuery = PolyUpdateQuery<Row>;',
      'type DeleteQuery = PolyDeleteQuery<Row>;',
      'type QueryResults = PolyQueryResults<Row>;',
      'type QueryResult = PolyQueryResult<Row>;',
      'type DeleteResults = PolyDeleteResults;',
      'type DeleteResult = PolyDeleteResult;',
      'type CountResult = PolyCountResult;',
    ].join(`${EOL}${ws(depth + 1)}`)
  }${EOL}${ws(depth)}}`;
};

const printTableTreeAsTypes = (
  table: TableTree,
  name: string,
  depth = 0,
): string => {
  let result = `${ws(depth)}namespace ${name} {`;
  for (const [key, child] of Object.entries(table)) {
    if (!Object.keys(child).length) continue;

    let generated = '';
    if ('type' in child && child.type === 'table') {
      try {
        generated = printTableNamespace(
          child.schema as JsonSchema,
          (child.name || key) as string,
          depth + 1,
        );
      } catch (err) {
        shell.echo(chalk.red(err));
        echoGenerationError(child as TableSpecification);
        setGenerationErrors(true);
      }
    } else {
      generated = printTableTreeAsTypes(child as TableTree, key, depth + 1);
    }
    result = `${result}${EOL}${generated}`;
  }
  result = `${result}${EOL}${ws(depth)}}`;
  return result;
};

const printTableRoot = (root: TableRoot): string => {
  // print the interfaces
  let result = 'declare namespace tabi {';
  // print the namespaces
  if (root.hasTypes) {
    for (const [key, table] of Object.entries(root.namespaces)) {
      if (!Object.keys(table).length) continue;
      const types =
        'type' in table && table.type === 'table'
          ? printTableNamespace(table.schema as JsonSchema, key, 1)
          : printTableTreeAsTypes(table as TableTree, key, 1);
      result = `${result}${EOL}${types}`;
    }
    result = `${result}${EOL}`;
  }
  // print the interfaces
  result = `${result}${EOL}${ws(1)}interface ${root.interfaceName} {${
    Object.entries(root.interfaces).map(([k, v]) => `${EOL}${ws(2)}${k}: ${printTableInterface(v)}`).join('')
  }${EOL}${ws(1)}}`;

  // close the module
  result = `${result}${EOL}}`;
  return result;
};

const printTableSpecs = (specs: TableSpecification[]): Record<string, string> => {
  const tables = buildTableTree(specs);
  // then print all the schema types as strings ready to be saved to disk
  const fileMap = Object.fromEntries(
    tables.map((table) => [`${table.path}.d.ts`, printTableRoot(table)]),
  );
  fileMap['index.d.ts'] = Object.keys(fileMap)
    .map((file) => `/// <reference path="./${file}" />`)
    .concat(['/// <reference path="./types.d.ts" />'])
    .join(EOL);
  return fileMap;
};

export const generateTableTSDeclarationFiles = async (
  libPath: string,
  specs: TableSpecification[],
) => {
  const files = printTableSpecs(specs);
  await Promise.all(
    Object.entries(files).map(
      ([file, contents]) =>
        new Promise<void>((resolve, reject) =>
          fs.writeFile(`${libPath}/tabi/${file}`, contents, (err) =>
            err ? reject(err) : resolve(),
          ),
        ),
    ),
  );
  fs.copyFileSync(templateUrl('tabi/types.d.ts'), `${libPath}/tabi/types.d.ts`);
};

export const __test = {
  printTableSpecs,
};
