import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { train } from '../src/commands/model/train';
import { upsertApiFunction, upsertSchema, upsertWebhookHandle } from '../src/api';

jest.mock('../src/api', () => ({
  upsertApiFunction: jest.fn(),
  upsertSchema: jest.fn(),
  upsertWebhookHandle: jest.fn(),
}));

jest.mock('child_process', () => ({
  exec: (
    _command: string,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(null, '', '');
    return {};
  },
}));

jest.mock('shelljs', () => ({
  echo: jest.fn(),
}));

describe('train schema ordering', () => {
  const mockedUpsertSchema = upsertSchema as jest.Mock;
  const mockedUpsertApiFunction = upsertApiFunction as jest.Mock;
  const mockedUpsertWebhookHandle = upsertWebhookHandle as jest.Mock;

  beforeEach(() => {
    mockedUpsertSchema.mockImplementation(async (resource: any) => ({
      id: `schema-${resource.name}`,
      name: resource.name,
      context: resource.context,
    }));
    mockedUpsertApiFunction.mockResolvedValue({
      id: 'api-1',
      name: 'ApiFn',
      context: 'test',
    });
    mockedUpsertWebhookHandle.mockResolvedValue({
      id: 'webhook-1',
      name: 'Webhook',
      context: 'test',
    });
  });

  test('orders schemas so dependencies are trained first', async () => {
    const specInput = {
      title: 'mock-openapi',
      functions: [],
      webhooks: [],
      schemas: [
        {
          name: 'C',
          context: 'mews',
          definition: {
            type: 'object',
            allOf: [
              {
                'x-poly-ref': {
                  path: 'mews.B',
                },
              },
            ],
          },
        },
        {
          name: 'B',
          context: 'mews',
          definition: {
            type: 'object',
            properties: {
              a: {
                'x-poly-ref': {
                  path: 'mews.A',
                },
              },
            },
          },
        },
        {
          name: 'A',
          context: 'mews',
          definition: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    };

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'polyapi-'));
    const specPath = path.join(tempDir, 'spec.json');
    await fs.writeFile(specPath, JSON.stringify(specInput));

    await train('/tmp/poly', specPath);

    const orderedSchemaNames = mockedUpsertSchema.mock.calls.map(
      (call) => call[0].name,
    );

    expect(orderedSchemaNames).toEqual(['A', 'B', 'C']);
  });
});