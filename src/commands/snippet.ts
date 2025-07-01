import fs from 'fs';
import { promisify } from 'util';
import chalk from 'chalk';
import shell from 'shelljs';

import { upsertSnippet } from '../api';
import { upsertResourceInSpec } from '../utils';

const readFile = promisify(fs.readFile);

const languageFormatMap = {
  javascript: ['js', 'ts', 'mjs'],
  java: ['java'],
  python: ['py'],
};

export const addSnippet = async (
  polyPath: string,
  name: string,
  path: string,
  context: string,
  description: string,
) => {
  let code = '';

  let language = '';

  try {
    code = await readFile(path, { encoding: 'utf-8' });
  } catch (error) {
    throw new Error('File does not exist.');
  }

  const fileFormat = path.split('.').pop();

  for (const [currentLanguage, formats] of Object.entries(languageFormatMap)) {
    if (formats.includes(fileFormat)) {
      language = currentLanguage;
      break;
    }
  }

  try {
    shell.echo('Adding snippet...');

    const response = await upsertSnippet({
      name,
      context,
      description: description || undefined,
      code,
      language,
    } as any);
    shell.echo(
      `${chalk.greenBright('Success:')}`,
      'Snippet successfully added.',
    );

    shell.echo(`Snippet ID: ${response.data.id}`);
    upsertResourceInSpec(polyPath, {
      updated: response.status === 200,
      resourceId: response.data.id,
      resourceName: 'snippet',
    });
  } catch (error) {
    const httpStatusCode = error.response?.status;

    const errMessage = error.response?.data?.message;

    let finalMessage = '';

    if (httpStatusCode === 400) {
      const messages = Array.isArray(error.response.data.message)
        ? error.response.data.message
        : [`Failed with status code ${chalk.redBright(400)}`];
      finalMessage = messages[0];
    } else if (httpStatusCode) {
      finalMessage = errMessage;
    } else {
      finalMessage = error.message;
    }
    shell.echo(`${chalk.redBright('Error:')}`, finalMessage);
  }
};
