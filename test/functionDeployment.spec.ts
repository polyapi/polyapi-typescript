/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { addOrUpdateCustomFunction } from '../src/commands/function';
import {
  createOrUpdateClientFunction,
  createOrUpdateServerFunction,
  getSpecs,
} from '../src/api';
import { generateSingleCustomFunction } from '../src/commands/generate';
import { AxiosError } from '../src/http';
import {
  CreateServerCustomFunctionResponseDto,
  LifecycleState,
  Visibility,
} from '../src/types';

jest.mock('../src/config', () => ({ loadConfig: jest.fn() }));
jest.mock('../src/api', () => ({
  createOrUpdateClientFunction: jest.fn(),
  createOrUpdateServerFunction: jest.fn(),
  getSpecs: jest.fn(),
}));
jest.mock('../src/commands/generate', () => ({
  generateSingleCustomFunction: jest.fn(),
}));
jest.mock('../src/transpiler', () => ({
  getDependencies: jest.fn(async () => [null, null]),
  getTSBaseUrl: jest.fn(),
  generateTypeSchemas: jest.fn(() => ({})),
}));
jest.mock('shelljs', () => ({ echo: jest.fn() }));

const server = jest.mocked(createOrUpdateServerFunction);
const client = jest.mocked(createOrUpdateClientFunction);
const generate = jest.mocked(generateSingleCustomFunction);
const id = '00000000-0000-4000-8000-000000000001';
const functionBody: CreateServerCustomFunctionResponseDto = {
  id,
  context: 'example',
  name: 'canary',
  contextName: 'example',
  description: '',
  visibility: Visibility.Environment,
  state: LifecycleState.Stable,
  arguments: [],
  returnType: 'number',
  code: 'return 1',
  language: 'javascript',
  hash: 'synthetic',
};

describe('typed source deployment receipt', () => {
  let directory: string;
  let source: string;
  let receipt: string;
  const deploy = (serverFunction = true, skipGenerate = false) =>
    addOrUpdateCustomFunction(
      directory,
      'example',
      'canary',
      null,
      source,
      !serverFunction,
      serverFunction,
      false,
      undefined,
      undefined,
      false,
      undefined,
      'ENVIRONMENT',
      false,
      skipGenerate,
      receipt,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-deploy-receipt-'));
    source = path.join(directory, 'canary.ts');
    receipt = path.join(directory, 'result.json');
    fs.writeFileSync(source, 'export function canary(): number { return 1; }');
    jest.mocked(getSpecs).mockResolvedValue([]);
    // Resetting mocks clears their implementations as well.
    const transpiler = jest.requireMock('../src/transpiler');
    transpiler.getDependencies.mockResolvedValue([null, null]);
    transpiler.generateTypeSchemas.mockReturnValue({});
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it.each([true, false])(
    'preserves accepted upload facts without claiming runtime health (server=%s)',
    async (serverFunction) => {
      const response = {
        status: 201,
        statusText: 'Created',
        headers: { 'x-request-id': 'request-1' },
        data: {
          ...functionBody,
          traceId: 'trace-1',
          warnings: ['private warning'],
          token: 'must-not-persist',
        },
      };
      (serverFunction ? server : client).mockResolvedValue(response);
      const result = await deploy(serverFunction, true);
      expect(result).toMatchObject({
        upload: 'accepted',
        http_status: 201,
        function_id: id,
        request_id: 'request-1',
        trace_id: 'trace-1',
        generation: 'skipped',
        verification: 'not_checked',
        warnings: {
          present: true,
          codes: ['description_generation_failed'],
          details_omitted: true,
        },
        response: { body_omitted: true, body_sha256: null },
      });
      expect(result.operation.source_sha256).toBe(
        createHash('sha256')
          .update(fs.readFileSync(source, 'utf8'))
          .digest('hex'),
      );
      expect(JSON.parse(fs.readFileSync(receipt, 'utf8'))).toEqual(result);
      expect(fs.statSync(receipt).mode & 0o777).toBe(0o600);
      expect(fs.readFileSync(receipt, 'utf8')).not.toMatch(
        /must-not-persist|private warning/,
      );
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('retains a 204 acknowledgement without inventing a function ID or retrying', async () => {
    server.mockResolvedValue({
      status: 204,
      statusText: 'No Content',
      headers: {},
      data: undefined,
    });
    expect(await deploy()).toMatchObject({
      upload: 'accepted',
      http_status: 204,
      function_id: null,
      generation: 'blocked',
      failure: { stage: 'upload', code: 'response_identity_missing' },
    });
    expect(server).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it('preserves upload acknowledgement when generation fails afterward', async () => {
    server.mockResolvedValue({
      status: 201,
      statusText: 'Created',
      headers: { 'x-request-id': 'upload-request' },
      data: functionBody,
    });
    generate.mockRejectedValue(
      new AxiosError(
        'synthetic generation failure',
        undefined,
        undefined,
        undefined,
        {
          status: 503,
          statusText: 'Unavailable',
          data: {},
          headers: { 'x-request-id': 'generate-request' },
        },
      ),
    );
    expect(await deploy()).toMatchObject({
      upload: 'accepted',
      http_status: 201,
      request_id: 'upload-request',
      function_id: id,
      generation: 'failed',
      failure: {
        stage: 'generate',
        code: 'generate_failed',
        http_status: 503,
        request_id: 'generate-request',
      },
    });
    expect(server).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, id])(
    'retains accepted asynchronous job identity and waits before generation (id=%s)',
    async (functionId) => {
      server.mockResolvedValue({
        status: 202,
        statusText: 'Accepted',
        headers: {},
        data: { ...functionBody, id: functionId, executionId: id },
      });
      expect(await deploy()).toMatchObject({
        upload: 'accepted',
        http_status: 202,
        function_id: functionId ?? null,
        deployment_execution_id: id,
        generation: 'blocked',
        verification: 'not_checked',
        failure: { stage: 'upload', code: 'deployment_pending' },
      });
      expect(generate).not.toHaveBeenCalled();
      expect(server).toHaveBeenCalledTimes(1);
    },
  );

  it.each([422, 429, 503])(
    'preserves upstream %s as uncertain without a second upload',
    async (status) => {
      server.mockRejectedValue(
        new AxiosError(
          'private provider message',
          undefined,
          undefined,
          undefined,
          {
            status,
            statusText: 'Error',
            data: { token: 'must-not-persist' },
            headers: { 'x-request-id': 'request-2' },
          },
        ),
      );
      const result = await deploy();
      expect(result).toMatchObject({
        upload: 'unknown',
        http_status: status,
        request_id: 'request-2',
        failure: { stage: 'upload', code: 'upload_failed' },
      });
      expect(server).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(receipt, 'utf8')).not.toMatch(
        /private provider|must-not-persist/,
      );
    },
  );

  it('rejects an existing receipt before contacting the provider', async () => {
    fs.writeFileSync(receipt, 'existing history');
    expect(await deploy()).toMatchObject({
      upload: 'not_sent',
      failure: { stage: 'receipt', code: 'receipt_failed' },
    });
    expect(fs.readFileSync(receipt, 'utf8')).toBe('existing history');
    expect(getSpecs).not.toHaveBeenCalled();
    expect(server).not.toHaveBeenCalled();
  });

  it('records missing source as not sent', async () => {
    fs.unlinkSync(source);
    expect(await deploy()).toMatchObject({
      upload: 'not_sent',
      failure: { stage: 'source', code: 'source_failed' },
    });
    expect(getSpecs).not.toHaveBeenCalled();
  });
});
