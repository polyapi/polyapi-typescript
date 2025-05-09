/* eslint-disable @typescript-eslint/ban-ts-comment */
import fs from 'fs';
import chalk from 'chalk';
import shell from 'shelljs';
import { CreateServerCustomFunctionResponseDto, FunctionDetailsDto } from '../types';
import { createOrUpdateClientFunction, createOrUpdateServerFunction, getSpecs } from '../api';
import { loadConfig } from '../config';
import { generateSingleCustomFunction } from './generate';
import { generateTypeSchemas, getDependencies, getTSBaseUrl } from '../transpiler';
import { DeployableTypeEntries } from '../deployables';

export const addOrUpdateCustomFunction = async (
  polyPath: string,
  context: string | null,
  name: string,
  description: string | null,
  file: string,
  server: boolean | undefined,
  logsEnabled: boolean | undefined,
  generateContexts: string | undefined,
  executionApiKey: string | null | undefined) => {
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
    const functionSpec = specs.find(spec => spec.name === name && spec.context === context);
    const updating = !!functionSpec;
    if (server === undefined && updating) {
      server = functionSpec.type === 'serverFunction';
    } else {
      server = server ?? false;
    }

    const typeSchemas = generateTypeSchemas(file, tsConfigBaseUrl, DeployableTypeEntries.map(d => d[0]));

    if (server) {
      shell.echo('-n', `${updating ? 'Updating' : 'Adding'} custom server side function...`);

      const dependencies = getDependencies(code, file, tsConfigBaseUrl);
      if (dependencies.length) {
        shell.echo(chalk.yellow('Please note that deploying your functions will take a few minutes because it makes use of libraries other than polyapi.'));
      }

      const other: Record<string, any> = {};
      if (generateContexts) other.generateContexts = generateContexts.split(',');
      if (logsEnabled !== undefined) other.logsEnabled = logsEnabled;

      customFunction = await createOrUpdateServerFunction(context, name, description, code, typeSchemas, dependencies, other, executionApiKey);

      const traceId: string | undefined = (customFunction as CreateServerCustomFunctionResponseDto).traceId;

      if (traceId) {
        shell.echo(chalk.yellow('\nWarning:'), 'Failed to generate descriptions while deploying the server function, trace id:', chalk.bold(traceId));
      }

      shell.echo(chalk.green('DEPLOYED'));

      shell.echo(`Function ID: ${customFunction.id}`);
    } else {
      shell.echo('-n', `${updating ? 'Updating' : 'Adding'} Client Function to PolyAPI Catalog...`);
      customFunction = await createOrUpdateClientFunction(context, name, description, code, typeSchemas);
      shell.echo(chalk.green('DONE'));
      shell.echo(`Client Function ID: ${customFunction.id}`);
    }

    await generateSingleCustomFunction(polyPath, customFunction.id, updating);
  } catch (e) {
    shell.echo(chalk.red('ERROR\n'));
    shell.echo(`${e.response?.data?.message || e.message}`);
  }
};
