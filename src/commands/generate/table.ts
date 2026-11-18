import fs from 'fs';
import { EOL } from 'node:os';
import { templateUrl, toPascalCase } from '../../utils';
import { TableSpecification } from '../../types';
import { printSchemaAsType } from './schemaTypes';
import { ws, printResourceSpecs } from './shared';


const printTableInterface = (table: TableSpecification, depth: number): string => {
  const _ws = ws(depth);
  const formattedName = table.contextName
    .split('.')
    .map((v) => toPascalCase(v))
    .join('.');
  return [
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
  ].join(`${EOL}${ws(depth + 1)}`);
};

const printTableNamespace = (table: TableSpecification, depth: number): string => {
  return `${printSchemaAsType(table.schema, 'Row', depth)}${EOL}${EOL}${ws(
    depth,
  )}${[
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
  ].join(`${EOL}${ws(depth)}`)}`;
};

export const generateTableTSDeclarationFiles = async (
  libPath: string,
  specs: TableSpecification[],
) => {
  const files = printResourceSpecs(specs, {
    namespace: 'tabi',
    interfaceName: 'Tabi',
    type: 'table',
    printResourceInterface: printTableInterface,
    printResourceNamespace: printTableNamespace,
  });
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
  printTableInterface,
  printTableNamespace,
}