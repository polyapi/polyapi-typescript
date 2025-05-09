import fs from 'fs';
import { promisify } from 'util';
import chalk from 'chalk';
import shell from 'shelljs';
import { escapeRegExp } from 'lodash';
import Axios from 'axios';

import { ApiFunctionDescriptionGenerationDto, SpecificationInputDto, WebhookHandleDescriptionGenerationDto } from '../../types';
import { translateSpecification, getApiFunctionDescription, getWebhookHandleDescription } from '../../api';
import { firstLetterToUppercase } from '../../utils';
import path from 'path';
import { default as slugifyString } from 'slugify';
import { chunk } from 'lodash';

export type RenameT = Array<[prevName: string, newName: string]>;

const readFile = promisify(fs.readFile);
const readDir = promisify(fs.readdir);
const access = promisify(fs.access);
const write = promisify(fs.writeFile);

const slugify = (content: string) => slugifyString(content, {
  lower: true,
  strict: true,
});

const axiosClient = Axios.create();

const writeModelFile = async (title: string, specificationInput: SpecificationInputDto, destination?: string, rename: RenameT = []) => {
  title = slugify(title);

  const adjustLines = (v: string) => {
    const lines = v.split('\n');

    return lines.map((line, index) => {
      if (index === 0) {
        return line;
      }

      return `    ${line}`;
    }).join('\n');
  };

  /*
    This json stringify logic is needed because `JSON.stringify()` contains a limit about how much big an object should be, if it exceeds that limit
    it throws an error, for instance when importing +500 stripe  functions which contain big schemas, that limit is reached.
    So we stringify each object separately and we built the JSON stringified object manually.
  */
  let contents = `{
  "functions": [
    ${specificationInput.functions.map(f => JSON.stringify(f, null, 2)).map(adjustLines).join(',\n    ')}
  ],
  "webhooks": [
    ${specificationInput.webhooks.map(w => JSON.stringify(w, null, 2)).map(adjustLines).join(',\n    ')}
  ],
  "schemas": [
    ${specificationInput.schemas.map(s => JSON.stringify(s, null, 2)).map(adjustLines).join(',\n    ')}
  ]
}`;

  for (const [prevName, newName] of rename) {
    // Match name with full word boundaries
    // So given prevName = "foo", newName = "bar":
    // ` foo ` becomes ` bar `,
    // and `{{foo}}` becomes `{{bar}}`,
    // but ` foobaz ` stays ` foobaz `
    contents = contents.replaceAll(new RegExp(`\\b${prevName}\\b`, 'g'), newName);
  }

  const writeFile = (fileName: string) => {
    return write(path.join('./', fileName), contents, { encoding: 'utf-8' });
  };

  if (destination) {
    await writeFile(destination);
    return path.join('./', destination);
  } else {
    const getFilename = (currentCount: number) => {
      return currentCount === 0 ? `${title}.json` : `${title}-${currentCount}.json`;
    };

    let lastCount = 0;
    let foundSingleName = false;

    try {
      await access(path.join('./', `${title}.json`));
      foundSingleName = true;
    } catch (error) {
      // Do nothing.
    }

    for (const file of await readDir('.')) {
      const matchResult = file.match(new RegExp(`${escapeRegExp(title)}-([0-9])+`));

      if (matchResult) {
        const [, count] = matchResult;

        if (Number(count) > lastCount) {
          lastCount = Number(count);
        }
      }
    }

    const fileName = getFilename(lastCount === 0 && !foundSingleName ? 0 : lastCount + 1);

    await writeFile(fileName);

    return fileName;
  }
};

type BaseResource = {
  context: string;
  name: string;
}

type BaseAIData = {
  traceId?: string
  name: string
}

const processResources = async <Resource extends BaseResource, AIData extends BaseAIData>({
  resources,
  disableAi,
  context,
  defaultAIDataGenerator,
  aiDataProcessor,
  getAIDataFn,
  resourceName,
}: {
  resources: Resource[],
  disableAi: boolean,
  defaultAIDataGenerator: (resource: Resource) => AIData,
  aiDataProcessor: (resource: Resource, aiData: AIData) => void,
  getAIDataFn(resource: Resource): Promise<AIData>,
  context?: string,
  resourceName: string,
}) => {
  const chunkSize = 5;

  const resourceChunks = chunk(resources, chunkSize);

  let chunkIterations = 0;
  const descriptionSettledResults: PromiseSettledResult<AIData>[] = [];

  shell.echo('\n');

  for (const resourceChunk of resourceChunks) {
    const calls: Promise<AIData>[] = [];

    const lastFunctionNumberInChunk = chunkSize * (chunkIterations + 1);

    if (!disableAi) {
      shell.echo(`Processing from ${resourceName} number ${(chunkSize * chunkIterations) + 1} to ${resourceName} number ${lastFunctionNumberInChunk <= resources.length ? lastFunctionNumberInChunk : resources.length} out of ${resources.length}`);
    }

    for (const resource of resourceChunk) {
      if (disableAi) {
        calls.push(new Promise<AIData>(resolve => resolve(defaultAIDataGenerator(resource))));
      } else {
        calls.push(getAIDataFn(resource));
      }
    }

    chunkIterations++;
    descriptionSettledResults.push(...(await Promise.allSettled(calls)));
  }

  const failedDescriptions: (typeof resources[number] & { index: number, reason?: string, traceId?: string })[] = [];
  const resourcesWithNoName: (typeof resources[number] & { index: number })[] = [];

  for (let i = 0; i < descriptionSettledResults.length; i++) {
    const descriptionSettledResult = descriptionSettledResults[i];
    const resource = resources[i];

    if (descriptionSettledResult.status === 'rejected') {
      if (context) {
        resource.context = context;
      }

      const httpStatusCode = descriptionSettledResult.reason?.response?.status;

      const errMessage = descriptionSettledResult.reason?.response?.data?.message;

      let message = 'Request failure';

      if (httpStatusCode) {
        message = `${message} with status code ${chalk.redBright(httpStatusCode)}`;
      }

      if (errMessage) {
        message = `${message} - "${errMessage}"`;
      }

      failedDescriptions.push({
        ...resource,
        index: i,
        reason: message,
      });
      if (!resource.name) {
        resourcesWithNoName.push({
          ...resource,
          index: i,
        });
      }
    } else {
      const response = descriptionSettledResult.value;

      aiDataProcessor(resource, response);

      if (response.traceId) {
        failedDescriptions.push({
          ...resource,
          index: i,
          traceId: response.traceId,
        });
      }

      if (!resource.name && !response.name) {
        resourcesWithNoName.push({
          ...resource,
          index: i,
        });
      }
    }
  }

  if (failedDescriptions.length) {
    shell.echo('\n');
    shell.echo(chalk.yellowBright('Warning:'), `Failed to generate some descriptions for ${resourceName}s:`);
    shell.echo('\n');
    for (const failedResourceDescription of failedDescriptions) {
      shell.echo(`${firstLetterToUppercase(resourceName)} with context`, `"${failedResourceDescription.context || ''}" and`, 'name', `"${failedResourceDescription.name || ''}"`, 'at index:', chalk.yellow(`${failedResourceDescription.index}`), failedResourceDescription.reason ? `- Reason: ${failedResourceDescription.reason}` : `- Trace id: ${failedResourceDescription.traceId}`);
    }
  }

  if (resourcesWithNoName.length) {
    shell.echo('\n');
    shell.echo(chalk.redBright('Action required:'), `The following ${resourceName}s from your specification input do not have a name:`);
    shell.echo('\n');
    for (const resourceWithNoName of resourcesWithNoName) {
      shell.echo(`${firstLetterToUppercase(resourceName)} at index:`, chalk.redBright(resourceWithNoName.index));
    }
  }
};

export const generateModel = async (
  specPath: string,
  destination?: string,
  context?: string,
  hostUrl?: string,
  hostUrlAsArgument?: string,
  disableAi = false,
  rename: RenameT = [],
) => {
  try {
    shell.echo('Translating specification into poly api specification input and generating context, names and descriptions for all resources...');

    let contents = '';

    if (specPath.startsWith('https://')) {
      try {
        shell.echo('Fetching open api specs from provided url...');
        const response = await axiosClient.get(specPath);

        contents = response.data;
      } catch (error) {
        throw new Error(`Failed to fetch contents from url "${specPath}"`);
      }
    } else {
      try {
        contents = await readFile(specPath, { encoding: 'utf-8' });
      } catch (error) {
        throw new Error('File does not exist.');
      }
    }

    try {
      if (disableAi) {
        shell.echo('Ai generation is disabled.');
      }

      if (destination && fs.existsSync(path.join('./', destination))) {
        throw new Error('Destination file already exists.');
      }

      if (hostUrlAsArgument === '') {
        hostUrlAsArgument = 'hostUrl';
      }

      const specificationInputDto = await translateSpecification(contents, context, hostUrl, hostUrlAsArgument);

      await processResources<typeof specificationInputDto.functions[number], ApiFunctionDescriptionGenerationDto>({
        resources: specificationInputDto.functions,
        aiDataProcessor(resource, aiData) {
          resource.name = aiData.name;
          resource.context = context || aiData.context;
          resource.description = aiData.description;
          resource.arguments = aiData.arguments;
        },
        defaultAIDataGenerator(resource) {
          return {
            name: resource.name,
            context: resource.context,
            description: resource.description,
            arguments: resource.arguments,
          };
        },
        disableAi,
        getAIDataFn(resource) {
          return getApiFunctionDescription({
            name: resource.name,
            context: resource.context,
            description: resource.description,
            arguments: resource.arguments,
            source: resource.source,
          });
        },
        context,
        resourceName: 'function',
      });

      await processResources<typeof specificationInputDto.webhooks[number], WebhookHandleDescriptionGenerationDto>({
        resources: specificationInputDto.webhooks,
        aiDataProcessor(resource, aiData) {
          resource.name = aiData.name;
          resource.context = context || aiData.context;
          resource.description = aiData.description;
        },
        defaultAIDataGenerator(resource) {
          return {
            name: resource.name,
            context: resource.context,
            description: resource.description,
          };
        },

        disableAi,
        getAIDataFn(resource) {
          return getWebhookHandleDescription({
            name: resource.name,
            context: resource.context,
            description: resource.description,
            eventPayload: resource.eventPayloadTypeSchema,
          });
        },
        context,
        resourceName: 'webhook',
      });

      const createdFileName = await writeModelFile(specificationInputDto.title, specificationInputDto, destination, rename);

      shell.echo(chalk.green('Poly api specification input created:'), 'Open file', chalk.blueBright(createdFileName), 'to check details.');
    } catch (error) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  } catch (error) {
    shell.echo(chalk.red('Error:'), error.message);
  }
};
