import { EOL } from 'node:os';
import { __test } from '../src/commands/generate/table';
import { TableSpecification } from '../src/types';

const {
  printTableSpecs
} = __test;

// Utility to make creating multiline strings in more precise way than is possible with template literal strings
const multiline = (...lines: string[]) => lines.join(EOL);


describe('printTableSpecs', () => {

    test('single spec', () => {
      const specs: TableSpecification[] = [
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'MyTable',
          'context': 'aaron.testing',
          'contextName': 'aaron.testing.MyTable',
          'type': 'table',
          'schema': {
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
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': []
        } as TableSpecification
      ];

      const result = printTableSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./default.d.ts" />',
          '/// <reference path="./aaron.d.ts" />',
          '/// <reference path="./aaron.testing.d.ts" />',
          '/// <reference path="./types.d.ts" />',
        )
      );
      expect(result['default.d.ts']).toEqual(
        multiline(
          'declare namespace tabi {',
          '  interface Tabi {',
          '    aaron: Aaron;',
          '  }',
          '}',
        )
      );

      expect(result['aaron.d.ts']).toEqual(
        multiline(
          'declare namespace tabi {',
          '  interface Aaron {',
          '    testing: Testing;',
          '  }',
          '}',
        )
      );
      expect(result['aaron.testing.d.ts']).toEqual(
        multiline(
          'declare namespace tabi {',
          '  namespace Aaron {',
          '    namespace Testing {',
          '      namespace MyTable {',
          '        type Row = {',
          '          object: \'organization.project.api_key.deleted\';',
          '          id: string;',
          '          deleted: boolean;',
          '        };',
          '',
          '        type SelectManyQuery = PolySelectManyQuery<Row>;',
          '        type SelectOneQuery = PolySelectOneQuery<Row>;',
          '        type InsertManyQuery = PolyInsertManyQuery<Row>;',
          '        type InsertOneQuery = PolyInsertOneQuery<Row>;',
          '        type UpdateManyQuery = PolyUpdateManyQuery<Row>;',
          '        type UpdateOneQuery = PolyUpdateOneQuery<Row>;',
          '        type DeleteQuery = PolyDeleteQuery<Row>;',
          '        type QueryResults = PolyQueryResults<Row>;',
          '        type QueryResult = PolyQueryResult<Row>;',
          '        type DeleteResults = PolyDeleteResults;',
          '        type DeleteResult = PolyDeleteResult;',
          '      }',
          '    }',
          '  }',
          '',
          '  interface Testing {',
          '    MyTable: {',
          '      selectMany(query: Aaron.Testing.MyTable.SelectManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      selectOne(query: Aaron.Testing.MyTable.SelectOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      insertMany(query: Aaron.Testing.MyTable.InsertManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      insertOne(query: Aaron.Testing.MyTable.InsertOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      upsertMany(query: Aaron.Testing.MyTable.InsertManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      upsertOne(query: Aaron.Testing.MyTable.InsertOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      updateMany(query: Aaron.Testing.MyTable.UpdateManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      updateOne(query: Aaron.Testing.MyTable.UpdateOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      deleteMany(query: Aaron.Testing.MyTable.DeleteQuery): Promise<Aaron.Testing.MyTable.DeleteResults>;',
          '      deleteOne(query: Aaron.Testing.MyTable.DeleteQuery): Promise<Aaron.Testing.MyTable.DeleteResult>;',
          '    }',
          '  }',
          '}',
        )
      );
    });

    test('multiple spec', () => {
      const specs: TableSpecification[] = [
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'MyTable',
          'context': 'aaron.testing',
          'contextName': 'aaron.testing.MyTable',
          'type': 'table',
          'schema': {
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
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': []
        } as TableSpecification,
        {
          'id': 'ad5edb98-9eeb-4bb5-8122-32f9a6f6b512',
          'name': 'OtherTable',
          'context': '',
          'contextName': 'OtherTable',
          'type': 'table',
          'schema': {
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
          },
          'visibilityMetadata': {
            'visibility': 'ENVIRONMENT'
          },
          'unresolvedPolySchemaRefs': []
        } as TableSpecification
      ];

      const result = printTableSpecs(specs);

      expect(result['index.d.ts']).toEqual(
        multiline(
          '/// <reference path="./default.d.ts" />',
          '/// <reference path="./aaron.d.ts" />',
          '/// <reference path="./aaron.testing.d.ts" />',
          '/// <reference path="./types.d.ts" />',
        )
      );
      expect(result['default.d.ts']).toEqual(
        multiline(
          'declare namespace tabi {',
          '  namespace OtherTable {',
          '    type Row = {',
          '      object: \'organization.project.api_key.deleted\';',
          '      id: string;',
          '      deleted: boolean;',
          '    };',
          '',
          '    type SelectManyQuery = PolySelectManyQuery<Row>;',
          '    type SelectOneQuery = PolySelectOneQuery<Row>;',
          '    type InsertManyQuery = PolyInsertManyQuery<Row>;',
          '    type InsertOneQuery = PolyInsertOneQuery<Row>;',
          '    type UpdateManyQuery = PolyUpdateManyQuery<Row>;',
          '    type UpdateOneQuery = PolyUpdateOneQuery<Row>;',
          '    type DeleteQuery = PolyDeleteQuery<Row>;',
          '    type QueryResults = PolyQueryResults<Row>;',
          '    type QueryResult = PolyQueryResult<Row>;',
          '    type DeleteResults = PolyDeleteResults;',
          '    type DeleteResult = PolyDeleteResult;',
          '  }',
          '',
          '  interface Tabi {',
          '    aaron: Aaron;',
          '    OtherTable: {',
          '      selectMany(query: OtherTable.SelectManyQuery): Promise<OtherTable.QueryResults>;',
          '      selectOne(query: OtherTable.SelectOneQuery): Promise<OtherTable.QueryResult>;',
          '      insertMany(query: OtherTable.InsertManyQuery): Promise<OtherTable.QueryResults>;',
          '      insertOne(query: OtherTable.InsertOneQuery): Promise<OtherTable.QueryResult>;',
          '      upsertMany(query: OtherTable.InsertManyQuery): Promise<OtherTable.QueryResults>;',
          '      upsertOne(query: OtherTable.InsertOneQuery): Promise<OtherTable.QueryResult>;',
          '      updateMany(query: OtherTable.UpdateManyQuery): Promise<OtherTable.QueryResults>;',
          '      updateOne(query: OtherTable.UpdateOneQuery): Promise<OtherTable.QueryResult>;',
          '      deleteMany(query: OtherTable.DeleteQuery): Promise<OtherTable.DeleteResults>;',
          '      deleteOne(query: OtherTable.DeleteQuery): Promise<OtherTable.DeleteResult>;',
          '    }',
          '  }',
          '}',
        )
      );

      expect(result['aaron.d.ts']).toEqual(
        multiline(
          'declare namespace tabi {',
          '  interface Aaron {',
          '    testing: Testing;',
          '  }',
          '}',
        )
      );
      expect(result['aaron.testing.d.ts']).toEqual(
        multiline(
          'declare namespace tabi {',
          '  namespace Aaron {',
          '    namespace Testing {',
          '      namespace MyTable {',
          '        type Row = {',
          '          object: \'organization.project.api_key.deleted\';',
          '          id: string;',
          '          deleted: boolean;',
          '        };',
          '',
          '        type SelectManyQuery = PolySelectManyQuery<Row>;',
          '        type SelectOneQuery = PolySelectOneQuery<Row>;',
          '        type InsertManyQuery = PolyInsertManyQuery<Row>;',
          '        type InsertOneQuery = PolyInsertOneQuery<Row>;',
          '        type UpdateManyQuery = PolyUpdateManyQuery<Row>;',
          '        type UpdateOneQuery = PolyUpdateOneQuery<Row>;',
          '        type DeleteQuery = PolyDeleteQuery<Row>;',
          '        type QueryResults = PolyQueryResults<Row>;',
          '        type QueryResult = PolyQueryResult<Row>;',
          '        type DeleteResults = PolyDeleteResults;',
          '        type DeleteResult = PolyDeleteResult;',
          '      }',
          '    }',
          '  }',
          '',
          '  interface Testing {',
          '    MyTable: {',
          '      selectMany(query: Aaron.Testing.MyTable.SelectManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      selectOne(query: Aaron.Testing.MyTable.SelectOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      insertMany(query: Aaron.Testing.MyTable.InsertManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      insertOne(query: Aaron.Testing.MyTable.InsertOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      upsertMany(query: Aaron.Testing.MyTable.InsertManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      upsertOne(query: Aaron.Testing.MyTable.InsertOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      updateMany(query: Aaron.Testing.MyTable.UpdateManyQuery): Promise<Aaron.Testing.MyTable.QueryResults>;',
          '      updateOne(query: Aaron.Testing.MyTable.UpdateOneQuery): Promise<Aaron.Testing.MyTable.QueryResult>;',
          '      deleteMany(query: Aaron.Testing.MyTable.DeleteQuery): Promise<Aaron.Testing.MyTable.DeleteResults>;',
          '      deleteOne(query: Aaron.Testing.MyTable.DeleteQuery): Promise<Aaron.Testing.MyTable.DeleteResult>;',
          '    }',
          '  }',
          '}',
        )
      );
    });
});