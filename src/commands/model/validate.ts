import shell from 'shelljs';
import fs from 'fs';
import chalk from 'chalk';
import { promisify } from 'util';
import { chunk } from 'lodash';
import { SpecificationInputDto } from '../../types';
import { validateApiFunctionDto, validateWebhookHandleDto } from '../../api';

const readFile = promisify(fs.readFile);

class DuplicatedIdentifierError extends Error {
  constructor(public readonly identifier: string) {
    super('Duplicated name and context');
  }
}

const getDuplicatedIdentifier = (
  apiFunctions: { name: string; context: string }[],
): string | null => {
  for (let i = 0; i < apiFunctions.length; i++) {
    const firstApiFunction = apiFunctions[i]!;

    for (let c = 0; c < apiFunctions.length; c++) {
      const secondApiFunction = apiFunctions[c]!;

      if (
        firstApiFunction.name &&
        firstApiFunction.context === secondApiFunction.context &&
        firstApiFunction.name === secondApiFunction.name &&
        c !== i
      ) {
        return firstApiFunction.context
          ? `${firstApiFunction.context}.${firstApiFunction.name}`
          : firstApiFunction.name;
      }
    }
  }

  return null;
};

export const validateModel = async (path: string) => {
  shell.echo('Validating poly specification input...');

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

    if (
      !('functions' in specificationInput) &&
      !('webhooks' in specificationInput)
    ) {
      throw new Error(
        'Expected specification to contain "webhooks" and/or "functions", but found neither.',
      );
    }

    if ('functions' in specificationInput) {
      const duplicatedIdentifier = getDuplicatedIdentifier(
        specificationInput.functions,
      );

      if (duplicatedIdentifier) {
        throw new DuplicatedIdentifierError(duplicatedIdentifier);
      }

      const chunkSize = 5;

      const apiFunctionChunks = chunk(specificationInput.functions, chunkSize);

      for (const apiFunctionsChunk of apiFunctionChunks) {
        for (const apiFunction of apiFunctionsChunk) {
          await validateApiFunctionDto(apiFunction);
        }
      }
    }

    if ('webhooks' in specificationInput) {
      const duplicatedIdentifier = getDuplicatedIdentifier(
        specificationInput.webhooks,
      );

      if (duplicatedIdentifier) {
        throw new DuplicatedIdentifierError(duplicatedIdentifier);
      }

      const chunkSize = 5;

      const webhookHandleChunks = chunk(specificationInput.webhooks, chunkSize);

      for (const webhookHandleChunk of webhookHandleChunks) {
        for (const webhookHandle of webhookHandleChunk) {
          await validateWebhookHandleDto(webhookHandle);
        }
      }
    }

    shell.echo(chalk.green('Poly specification input is valid.'));
  } catch (error) {
    if (error instanceof DuplicatedIdentifierError) {
      shell.echo(
        chalk.red('Error:'),
        error.message,
        chalk.red(error.identifier),
      );
    } else if (error.response?.status === 400) {
      shell.echo(chalk.red('Error:'), error.response.data?.message);
    } else {
      shell.echo(chalk.red('Error:'), error.message);
    }
  }
};
