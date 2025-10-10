import fs from 'fs';
import chalk from 'chalk';
import shell from 'shelljs';
import {
  CreateServerCustomFunctionResponseDto,
  FunctionDetailsDto,
} from '../types';
import {
  createOrUpdateClientFunction,
  createOrUpdateServerFunction,
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
  visibility: string | undefined,
) => {
  loadConfig(polyPath);

  let code = '';
  try {
    code = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // Handle various file-system related issues, or silly errors like the file not existing
    shell.echo(chalk.redBright('ERROR:'), err);
    return;
  }

  const tsConfigBaseUrl = getTSBaseUrl();

  try {
    let customFunction: FunctionDetailsDto;

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
        return;
      }
    }

    const typeSchemas = generateTypeSchemas(file, DeployableTypeEntries.map(d => d[0]), name);
    const [externalDependencies, internalDependencies] = await getDependencies(code, file, tsConfigBaseUrl);

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
      if (generateContexts) { other.generateContexts = generateContexts.split(','); }
      if (logsEnabled !== undefined) other.logsEnabled = logsEnabled;
      if (cachePolyLibrary !== undefined) other.cachePolyLibrary = cachePolyLibrary;
      customFunction = await createOrUpdateServerFunction(
        context,
        name,
        description,
        code,
        visibility,
        typeSchemas,
        externalDependencies,
        internalDependencies,
        other,
        executionApiKey,
      );

      const traceId: string | undefined = (
        customFunction as CreateServerCustomFunctionResponseDto
      ).traceId;

      if (traceId) {
        shell.echo(
          chalk.yellow('\nWarning:'),
          'Failed to generate descriptions while deploying the server function, trace id:',
          chalk.bold(traceId),
        );
      }

      shell.echo(chalk.green('DEPLOYED'));

      shell.echo(`Function ID: ${customFunction.id}`);
    }

    if (client) {
      shell.echo(
        '-n',
        `${
          updating ? 'Updating' : 'Adding'
        } Client Function to PolyAPI Catalog...`,
      );
      customFunction = await createOrUpdateClientFunction(
        context,
        name,
        description,
        code,
        visibility,
        typeSchemas,
        externalDependencies,
        internalDependencies,
      );
      shell.echo(chalk.green('DONE'));
      shell.echo(`Client Function ID: ${customFunction.id}`);
    }

    await generateSingleCustomFunction(polyPath, customFunction.id, updating);
  } catch (e) {
    shell.echo(chalk.redBright('ERROR\n'));
    shell.echo(chalk.red((e instanceof Error ? e.message : e.response?.data?.message) || 'Unexpected error.'));
  }
};
