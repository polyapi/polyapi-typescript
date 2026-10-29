import fs from 'fs';
import { createHash } from 'crypto';
import chalk from 'chalk';
import shell from 'shelljs';
import { toPascalCase } from '../utils';
import {
  CreateServerCustomFunctionResponseDto,
  FunctionDeploymentResult,
} from '../types';
import {
  createOrUpdateClientFunctionWithResponse,
  createOrUpdateServerFunctionWithResponse,
  getSpecs,
} from '../api';
import { loadConfig } from '../config';
import { generateSingleCustomFunction } from './generate';
import {
  generateTypeSchemas,
  getDependencies,
  getTSBaseUrl,
} from '../transpiler';
import { DeployableTypeEntries } from '../deployables';
import { isAxiosError, type HttpResponse } from '../http';

const receiptIdentifier = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value)
    ? value
    : null;

export const addOrUpdateCustomFunction = async (
  polyPath: string,
  context: string | null,
  name: string,
  description: string | null,
  file: string,
  client: boolean | undefined,
  server: boolean | undefined,
  logsEnabled: boolean | undefined,
  generateContexts: string | undefined,
  executionApiKey: string | null | undefined,
  cachePolyLibrary: boolean | undefined,
  image: string | undefined,
  visibility: string | undefined,
  ignoreDependencies: boolean | undefined,
  skipGenerate: boolean | undefined,
  resultFile?: string,
): Promise<FunctionDeploymentResult> => {
  const result: FunctionDeploymentResult = {
    schema_version: 'poly.function-deployment.v1',
    operation: {
      kind: server ? 'server' : 'client',
      context,
      name,
      source_sha256: null,
    },
    upload: 'not_sent',
    function_id: null,
    http_status: null,
    request_id: null,
    trace_id: null,
    deployment_execution_id: null,
    warnings: { present: false, codes: [], details_omitted: false },
    response: { body_omitted: true, body_sha256: null },
    generation: 'not_started',
    verification: 'not_checked',
  };
  let stage: NonNullable<FunctionDeploymentResult['failure']>['stage'] =
    'receipt';
  let receiptFd: number | undefined;
  try {
    // Reserve the caller's unique receipt before any provider request. A crash
    // can leave an empty receipt, which is unknown rather than safe to retry.
    if (resultFile) receiptFd = fs.openSync(resultFile, 'wx', 0o600);
    stage = 'source';
    const code = fs.readFileSync(file, 'utf8');
    result.operation.source_sha256 = createHash('sha256')
      .update(code)
      .digest('hex');
    stage = 'prepare';
    loadConfig(polyPath);
    const tsConfigBaseUrl = getTSBaseUrl();
    if (Boolean(client) === Boolean(server))
      throw new Error('function_kind_required');

    const specs = await getSpecs([context], [name]);
    const functionSpec = specs.find(
      (spec) => spec.name === name && spec.context === context,
    );
    const updating = !!functionSpec;
    if (updating) {
      const isConflictingType =
        (client === true && functionSpec.type === 'serverFunction') ||
        (server === true && functionSpec.type === 'customFunction');

      if (isConflictingType) {
        const existingType =
          functionSpec.type === 'serverFunction' ? 'server' : 'client';
        const targetType = existingType === 'server' ? 'client' : 'server';

        shell.echo(
          chalk.redBright(
            `ERROR: Function already exists as a ${existingType} function.`,
          ) +
            '\n' +
            chalk.red(
              `Please delete it before deploying as a ${targetType} function.`,
            ),
        );
        result.failure = { stage, code: 'function_type_conflict' };
        return result;
      }
    }

    const [externalDependencies, internalDependencies] = await getDependencies(
      code,
      file,
      tsConfigBaseUrl,
      ignoreDependencies,
    );
    const referencedSchemas =
      internalDependencies && 'schema' in internalDependencies
        ? Object.fromEntries(
            internalDependencies.schema.map((schema) => [
              `schemas.${schema.path
                .split('.')
                .map((s) => toPascalCase(s))
                .join('.')}`,
              { 'x-poly-ref': { path: schema.path } },
            ]),
          )
        : null;
    const typeSchemas = generateTypeSchemas(
      file,
      DeployableTypeEntries.map((d) => d[0]),
      name,
      referencedSchemas,
    );

    let response:
      HttpResponse<CreateServerCustomFunctionResponseDto> | undefined;
    stage = 'upload';
    if (server) {
      shell.echo(
        '-n',
        `${updating ? 'Updating' : 'Adding'} custom server side function...`,
      );

      if (externalDependencies) {
        shell.echo(
          chalk.yellow(
            'Please note that deploying your functions will take a few minutes because it makes use of libraries other than polyapi.',
          ),
        );
      }

      const other: Record<string, any> = {};
      if (generateContexts) {
        other.generateContexts = generateContexts.split(',');
      }
      if (logsEnabled !== undefined) other.logsEnabled = logsEnabled;
      if (cachePolyLibrary !== undefined)
        other.cachePolyLibrary = cachePolyLibrary;
      if (image) other.image = image;
      result.upload = 'unknown';
      response = await createOrUpdateServerFunctionWithResponse(
        context,
        name,
        description,
        code,
        visibility,
        typeSchemas,
        externalDependencies || null,
        ignoreDependencies ? null : internalDependencies || null,
        other,
        executionApiKey,
      );
    }

    if (client) {
      shell.echo(
        '-n',
        `${
          updating ? 'Updating' : 'Adding'
        } Client Function to PolyAPI Catalog...`,
      );
      result.upload = 'unknown';
      response = await createOrUpdateClientFunctionWithResponse(
        context,
        name,
        description,
        code,
        visibility,
        typeSchemas,
        externalDependencies || null,
        ignoreDependencies ? null : internalDependencies || null,
      );
    }

    if (!response) throw new Error('function_response_missing');
    result.upload = 'accepted';
    result.http_status = response.status;
    const data = response.data as CreateServerCustomFunctionResponseDto | null;
    result.function_id = receiptIdentifier(data?.id);
    result.trace_id = receiptIdentifier(data?.traceId);
    result.deployment_execution_id =
      typeof data?.executionId === 'string' &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.executionId)
        ? data.executionId
        : null;
    result.request_id = receiptIdentifier(
      response.headers['x-request-id'] ?? response.headers['x-correlation-id'],
    );
    const warnings =
      data && typeof data === 'object' && 'warnings' in data
        ? data.warnings
        : null;
    result.warnings.present = Boolean(
      result.trace_id || (Array.isArray(warnings) ? warnings.length : warnings),
    );
    result.warnings.details_omitted = result.warnings.present;
    if (result.trace_id)
      result.warnings.codes.push('description_generation_failed');
    shell.echo(
      chalk.green('UPLOAD ACCEPTED — deployment verification pending'),
    );
    if (result.function_id) shell.echo(`Function ID: ${result.function_id}`);
    if (result.warnings.present)
      shell.echo(
        chalk.yellow(
          'Provider warning received; review the deployment receipt.',
        ),
      );
    if (result.http_status === 202 || !result.function_id) {
      result.generation = 'blocked';
      result.failure = {
        stage,
        code:
          result.http_status === 202
            ? 'deployment_pending'
            : 'response_identity_missing',
      };
      return result;
    }

    if (skipGenerate) {
      result.generation = 'skipped';
      shell.echo('Flag --skip-generate received. Skipping generate step.');
    } else {
      stage = 'generate';
      await generateSingleCustomFunction(
        polyPath,
        result.function_id,
        updating,
      );
      result.generation = 'completed';
    }
  } catch (e) {
    if (stage === 'upload' && isAxiosError(e) && e.response) {
      result.http_status = e.response.status;
      result.request_id = receiptIdentifier(e.response.headers['x-request-id']);
    }
    if (stage === 'generate') result.generation = 'failed';
    result.failure = { stage, code: `${stage}_failed` };
    if (isAxiosError(e) && e.response) {
      result.failure.http_status = e.response.status;
      result.failure.request_id = receiptIdentifier(
        e.response.headers['x-request-id'],
      );
    }
    shell.echo(
      chalk.redBright(`ERROR: ${result.failure.code}`),
      result.http_status ?? '',
    );
  } finally {
    if (receiptFd !== undefined) {
      try {
        fs.writeFileSync(receiptFd, JSON.stringify(result) + '\n');
        fs.fsyncSync(receiptFd);
      } catch {
        result.failure = { stage: 'receipt', code: 'receipt_write_failed' };
        shell.echo(chalk.redBright('ERROR: receipt_write_failed'));
      } finally {
        fs.closeSync(receiptFd);
      }
    }
  }
  return result;
};
