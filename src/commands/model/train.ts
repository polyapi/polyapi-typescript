import fs from 'fs';
import { promisify } from 'util';
import chalk from 'chalk';
import shell from 'shelljs';
import { exec as execChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { chunk } from 'lodash';

import { SpecificationInputDto } from '../../types';
import {
  upsertApiFunction,
  upsertSchema,
  upsertWebhookHandle,
} from '../../api';
import { firstLetterToUppercase } from '../../utils';

const readFile = promisify(fs.readFile);
const exec = promisify(execChildProcess);

dotenv.config();

type BaseResource = {
  name: string;
  context: string;
};

type BaseResult = {
  id: string;
  name: string;
  context: string;
};

type SchemaRef = {
  path: string;
  publicNamespace?: string;
};

const getSchemaContextName = (schema: { name: string; context?: string }) =>
  [schema.context, schema.name].filter(Boolean).join('.');

const getPolySchemaRefs = (schema: Record<string, any>): SchemaRef[] => {
  const ref = schema['x-poly-ref'] as SchemaRef | undefined;
  if (ref && typeof ref === 'object' && !Array.isArray(ref) && ref.path) {
    return [ref];
  }

  let toSearch: Record<string, any>[] = [];
  if (schema.schemas) {
    toSearch = toSearch.concat(Object.values(schema.schemas));
  }
  if (schema.properties) {
    toSearch = toSearch.concat(Object.values(schema.properties));
  }
  if (schema.patternProperties) {
    toSearch = toSearch.concat(Object.values(schema.patternProperties));
  }
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      toSearch = toSearch.concat(schema.items);
    } else {
      toSearch.push(schema.items);
    }
  }
  if (typeof schema.additionalItems === 'object') {
    toSearch.push(schema.additionalItems);
  }
  if (typeof schema.additionalProperties === 'object') {
    toSearch.push(schema.additionalProperties);
  }
  if (Array.isArray(schema.allOf)) {
    toSearch = toSearch.concat(schema.allOf);
  }
  if (Array.isArray(schema.anyOf)) {
    toSearch = toSearch.concat(schema.anyOf);
  }
  if (Array.isArray(schema.oneOf)) {
    toSearch = toSearch.concat(schema.oneOf);
  }

  return toSearch.flatMap((s) => getPolySchemaRefs(s));
};

const orderSchemasByDependencies = <T extends { name: string; context?: string; definition: Record<string, any> }>(
  schemas: T[],
): T[] => {
  if (schemas.length <= 1) return schemas;

  const schemaByContextName = new Map<string, T>();
  const originalOrder = schemas.map((schema) => {
    const contextName = getSchemaContextName(schema);
    schemaByContextName.set(contextName, schema);
    return contextName;
  });

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const contextName of originalOrder) {
    adjacency.set(contextName, new Set());
    indegree.set(contextName, 0);
  }

  for (const schema of schemas) {
    const schemaContextName = getSchemaContextName(schema);
    const refs = getPolySchemaRefs(schema.definition)
      .filter((ref) => !ref.publicNamespace)
      .map((ref) => ref.path)
      .filter((refPath) => schemaByContextName.has(refPath));

    for (const refPath of refs) {
      const dependents = adjacency.get(refPath);
      if (!dependents || dependents.has(schemaContextName)) continue;
      dependents.add(schemaContextName);
      indegree.set(
        schemaContextName,
        (indegree.get(schemaContextName) || 0) + 1,
      );
    }
  }

  const queue = originalOrder.filter(
    (contextName) => (indegree.get(contextName) || 0) === 0,
  );
  const ordered: string[] = [];

  while (queue.length) {
    const current = queue.shift() as string;
    ordered.push(current);
    const dependents = adjacency.get(current);
    if (!dependents) continue;
    for (const dependent of dependents) {
      const nextIndegree = (indegree.get(dependent) || 0) - 1;
      indegree.set(dependent, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (ordered.length !== schemas.length) {
    const orderedSet = new Set(ordered);
    for (const contextName of originalOrder) {
      if (!orderedSet.has(contextName)) {
        ordered.push(contextName);
      }
    }
  }

  return ordered
    .map((contextName) => schemaByContextName.get(contextName))
    .filter((schema): schema is T => Boolean(schema));
};

const generateClientCode = async (polyPath: string) => {
  try {
    shell.echo('Re-generating poly library...');

    const response = await exec(`npx poly generate --customPath ${polyPath}`);

    if (response.stderr) {
      throw new Error();
    }

    shell.echo(chalk.green('Success: '), 'Poly library re-generated.');
  } catch (error) {
    shell.echo(chalk.yellow('Warning:', '"npx poly generate" command failed.'));
  }
};

const executeTraining = async <T extends BaseResource, V extends BaseResult>({
  resources,
  resourceName,
  upsertFn,
}: {
  resources: T[];
  resourceName: string;
  upsertFn(resource: T): Promise<V>;
}) => {
  const chunkSize = 5;

  const resourceChunks = chunk(resources, chunkSize);

  let chunkIterations = 0;
  const results: PromiseSettledResult<V>[] = [];

  shell.echo('\n');
  for (const resourceChunk of resourceChunks) {
    const calls: ReturnType<typeof upsertFn>[] = [];

    const lastResourceNumberInChunk = chunkSize * (chunkIterations + 1);

    shell.echo(
      `Training from ${resourceName} number ${
        chunkSize * chunkIterations + 1
      } to ${resourceName} number ${
        lastResourceNumberInChunk <= resources.length
          ? lastResourceNumberInChunk
          : resources.length
      } out of ${resources.length}`,
    );

    for (const resource of resourceChunk) {
      calls.push(upsertFn(resource));
    }

    chunkIterations++;
    results.push(...(await Promise.allSettled(calls)));
  }

  const failedResources: ((typeof resources)[number] & {
    index: number;
    reason?: string;
  })[] = [];
  const createdResources: V[] = [];

  for (let i = 0; i < results.length; i++) {
    const settledResult = results[i];
    const resource = resources[i];

    if (settledResult.status === 'rejected') {
      const httpStatusCode = settledResult.reason?.response?.status;

      const errMessage = settledResult.reason?.response?.data?.message;

      let message = 'Request failure';

      if (httpStatusCode) {
        message = `${message} with status code ${chalk.redBright(
          httpStatusCode,
        )}`;
      }

      if (errMessage) {
        message = `${message} - "${errMessage}"`;
      }

      failedResources.push({
        ...resource,
        index: i,
        reason: message,
      });
    } else {
      const response = settledResult.value;

      createdResources.push(response);
    }
  }

  if (createdResources.length) {
    shell.echo('\n');
    shell.echo(chalk.green('Success:'), `Trained ${resourceName}s:`);
    shell.echo('\n');
    shell.echo(
      createdResources
        .map(({ id, name, context }, index) =>
          chalk.blueBright(
            `${index + 1}. ${context ? context + '.' : ''}${name} - ${id}`,
          ),
        )
        .join('\n'),
    );
    shell.echo('\n');
  }

  if (failedResources.length) {
    shell.echo('\n');
    shell.echo(
      chalk.redBright('Danger:'),
      `Failed to train ${resourceName}s for:`,
    );
    shell.echo('\n');
    for (const failedResource of failedResources) {
      shell.echo(
        `${firstLetterToUppercase(resourceName)} with context`,
        `"${failedResource.context || ''}" and`,
        'name',
        `"${failedResource.name || ''}"`,
        'at index:',
        chalk.yellow(`${failedResource.index}`),
        `- Reason: ${failedResource.reason}`,
      );
    }
    shell.echo('\n');
  }

  return createdResources.length;
};

export const train = async (polyPath: string, path: string) => {
  shell.echo('Training poly resources...');

  let contents = '';

  try {
    contents = await readFile(path, { encoding: 'utf-8' });
  } catch (error) {
    throw new Error('File does not exist.');
  }

  try {
    const specificationInput: SpecificationInputDto = JSON.parse(
      contents,
    ) as SpecificationInputDto;

    const createdApiFunctionsCount = await executeTraining({
      resources: specificationInput.functions,
      resourceName: 'api function',
      upsertFn(resource) {
        return upsertApiFunction(resource);
      },
    });

    const createdWebhooksCount = await executeTraining({
      resources: specificationInput.webhooks,
      resourceName: 'webhook',
      upsertFn(resource) {
        return upsertWebhookHandle(resource);
      },
    });

    const createdSchemasCount = await executeTraining({
      resources: orderSchemasByDependencies(specificationInput.schemas),
      resourceName: 'schema',
      upsertFn(resource) {
        return upsertSchema(resource);
      },
    });

    if (
      createdApiFunctionsCount > 0 ||
      createdWebhooksCount > 0 ||
      createdSchemasCount > 0
    ) {
      await generateClientCode(polyPath);
    }
  } catch (error) {
    if (error.response?.status === 400) {
      shell.echo(chalk.red('Error:'), error.response.data?.message);
    } else {
      shell.echo(chalk.red('Error:'), error.message);
    }
  }
};
