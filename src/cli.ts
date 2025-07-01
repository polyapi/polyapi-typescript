#!/usr/bin/env node
/* tslint:disable:no-shadowed-variable */
import yargs from 'yargs';
import shell from 'shelljs';
import chalk from 'chalk';
import { validate as uuidValidate } from 'uuid';
import { loadConfig } from './config';
import { type RenameT } from './commands/model';
import { DEFAULT_POLY_PATH } from './constants';
import { isValidHttpUrl } from './utils';

if (process.env.NO_COLOR) {
  // Support NO_COLOR env variable https://no-color.org/
  chalk.level = 0;
}

const checkPolyConfig = (polyPath: string) => {
  loadConfig(polyPath);

  if (!process.env.POLY_API_KEY) {
    return false;
  }

  return true;
};

void yargs
  .usage('$0 <cmd> [args]')
  .command(
    'setup [baseUrl] [apiKey]',
    'Setups your Poly connection',
    (yargs) => {
      return yargs
        .positional('baseUrl', {
          describe: 'The base URL for the Poly connection',
          type: 'string',
        })
        .positional('apiKey', {
          describe: 'Your Poly API key for authentication',
          type: 'string',
        })
        .option('apiVersion', {
          describe: 'The version of the API to use.',
          type: 'string',
          choices: ['1', '2'],
          default: '1',
        });
    },
    async (argv) => {
      const { default: setup } = await import('./commands/setup');
      await setup(
        DEFAULT_POLY_PATH,
        argv.baseUrl,
        argv.apiKey,
        argv.apiVersion,
      );
    },
  )
  .command(
    'generate [options]',
    'Generates Poly library',
    (yargs) => {
      return yargs.parserConfiguration({ 'boolean-negation': false }).options({
        contexts: {
          describe: 'Contexts to generate',
          demandOption: false,
          type: 'string',
        },
        names: {
          describe: 'Names to generate',
          demandOption: false,
          type: 'string',
        },
        functionIds: {
          describe: 'Function IDs to generate',
          demandOption: false,
          type: 'string',
        },
        customPath: {
          describe: 'Custom path to .poly directory (internal use only)',
          demandOption: false,
          type: 'string',
        },
        noTypes: {
          describe: 'Skip generating type definitions',
          demandOption: false,
          type: 'boolean',
          alias: 'no-types',
        },
      });
    },
    async ({
      exitWhenNoConfig,
      contexts,
      names,
      functionIds,
      customPath = DEFAULT_POLY_PATH,
      noTypes = false,
    }) => {
      if (!checkPolyConfig(customPath)) {
        if (exitWhenNoConfig) {
          shell.echo(
            'Poly is not configured. Please run `poly generate` manually.',
          );
          return;
        }
        const { default: setup } = await import('./commands/setup');
        await setup(customPath);
      }

      const { generate } = await import('./commands/generate');
      await generate({
        polyPath: customPath,
        contexts: contexts?.split(','),
        names: names?.split(','),
        functionIds: functionIds?.split(','),
        noTypes,
      });
    },
  )
  .command(
    'prepare [options]',
    'Find and prepare all Poly deployables',
    (yargs) =>
      yargs
        .usage('$0 prepare [options]')
        .option('lazy', {
          describe:
            'Skip prepare work if the cache is up to date. (Relies on `git`)',
          type: 'boolean',
          default: false,
        })
        .option('disable-docs', {
          describe: "Don't write any JSDocs into the deployable files.",
          type: 'boolean',
          default: false,
        })
        .option('disable-ai', {
          describe: "Don't use AI to fill in any missing descriptions.",
          type: 'boolean',
          default: false,
        }),
    async ({ disableDocs, disableAi, lazy }) => {
      if (!checkPolyConfig(DEFAULT_POLY_PATH)) {
        return shell.echo(
          'Poly is not configured. Please run `poly setup` to configure it.',
        );
      }
      disableAi = disableAi || process.env.DISABLE_AI === 'true';
      const { prepareDeployables } = await import('./commands/prepare');
      await prepareDeployables(lazy, disableDocs, disableAi);
    },
  )
  .command(
    'sync [options]',
    'Find and sync all Poly deployables',
    (yargs) =>
      yargs
        .usage('$0 sync [options]')
        .option('dry-run', {
          describe:
            "Run through sync steps with logging but don't make any changes.",
          type: 'boolean',
          default: false,
        })
        .option('custom-path', {
          describe: 'Custom path to .poly directory (internal use only)',
          default: DEFAULT_POLY_PATH,
          type: 'string',
        }),
    async ({ dryRun, customPath = DEFAULT_POLY_PATH }) => {
      if (!checkPolyConfig(customPath)) {
        return shell.echo(
          'Poly is not configured. Please run `poly setup` to configure it.',
        );
      }

      const { prepareDeployables } = await import('./commands/prepare');
      // At this point everything should already be prepared
      // So we're not going to add anything other than deployment receipts
      await prepareDeployables(
        true, // lazy!
        true, // don't write JSDocs
        true, // don't use AI
      );
      shell.echo('Syncing Poly deployments...');
      const { syncDeployables } = await import('./commands/sync');
      await syncDeployables(dryRun);
      shell.echo('Poly deployments synced.');
    },
  )
  .command('function <command>', 'Manages functions', (yargs) => {
    yargs.command(
      'add <name> <file> [options]',
      'Adds a custom function',
      (yargs) =>
        yargs
          .usage(
            '$0 function add <name> <file> (--server | --client) [options]',
          )
          .default('context', '')
          .positional('name', {
            describe: 'Name of the function',
            type: 'string',
          })
          .positional('file', {
            describe: 'Path to the function TS file',
            type: 'string',
          })
          .option('context', {
            describe: 'Context of the function',
            type: 'string',
          })
          .option('description', {
            describe: 'Description of the function',
            type: 'string',
          })
          .option('client', {
            describe: 'Marks the function as a client function',
            type: 'boolean',
          })
          .option('server', {
            describe: 'Marks the function as a server function',
            type: 'boolean',
          })
          .option('logs', {
            describe:
              'Server function only - `--logs=enabled` or `--logs=disabled` to enable to disable logging respectively',
            type: 'string',
          })
          .option('generateContexts', {
            describe:
              'Server function only - only include certain contexts to speed up function execution',
            type: 'string',
          })
          .option('execution-api-key', {
            describe: 'Optional API key for server functions',
            type: 'string',
          })
          .option('cache-poly-library', {
            describe: 'Server function only - cache the poly library to improve function performance',
            type: 'boolean',
          }),
      async ({
        name,
        description,
        file,
        context,
        client,
        server,
        logs,
        generateContexts,
        executionApiKey,
        cachePolyLibrary,
      }) => {
        const logsEnabled =
          logs === 'enabled' ? true : logs === 'disabled' ? false : undefined;
        const err = !name
          ? 'Missing function name.'
          : !file
              ? 'Missing function file path.'
              : !client && !server
                  ? 'You must specify `--server` or `--client`.`'
                  : client && server
                    ? 'Specify either `--server` or `--client`. Found both.'
                    : generateContexts && !server
                      ? 'Option `generateContexts` is only for server functions (--server).'
                      : logs && !server
                        ? 'Option `logs` is only for server functions (--server).'
                        : logs && logsEnabled === undefined
                          ? 'Invalid value for `logs` option.'
                          : executionApiKey && !uuidValidate(executionApiKey)
                            ? 'Invalid value for `execution-api-key`. Must be a valid PolyAPI Key.'
                            : cachePolyLibrary && !server
                              ? 'Option `cache-poly-library` is only for server functions (--server).'
                            : '';
        if (err) {
          shell.echo(chalk.redBright('ERROR:'), err);
          yargs.showHelp();
          return;
        }
        const { addOrUpdateCustomFunction } = await import(
          './commands/function'
        );
        await addOrUpdateCustomFunction(
          DEFAULT_POLY_PATH,
          context,
          name,
          description,
          file,
          client,
          server,
          logsEnabled,
          generateContexts,
          executionApiKey,
          cachePolyLibrary,
        );
      },
    );
  })
  .command('tenant <command>', 'Manages tenants', (yargs) => {
    yargs.command(
      'create [options]',
      'Creates a new tenant',
      {
        instance: {
          describe:
            'Instance where you want to create tenant (develop | na1 | local)',
          demandOption: false,
          type: 'string',
        },
      },
      async ({ instance = 'na1' }) => {
        const { create } = await import('./commands/tenant');
        await create(instance);
      },
    );
  })
  .command('model <command>', 'Manages models.', async (yargs) => {
    yargs
      .command(
        'generate <path> [destination] [options]',
        'Generates a new model.',
        (yargs) =>
          yargs
            .positional('path', {
              type: 'string',
              demandOption: true,
              describe: 'Path to open api specification file.',
            })
            .positional('destination', {
              type: 'string',
              describe: 'Path to destination poly schema file.',
              demandOption: false,
            })
            .option('context', {
              describe: 'Context for all api functions.',
              type: 'string',
            })
            .option('hostUrl', {
              describe:
                'Hardcode the hostUrl to use for all api functions. Leave undefined to use the server url specified in the specification file, if one is specified.',
              type: 'string',
            })
            .option('hostUrlAsArgument', {
              describe:
                'Require the host url as an argument to be passed in when calling an api function. Value passed in will be used as the argument name, or if left empty will default to "hostUrl".',
              type: 'string',
            })
            .options('disable-ai', {
              describe: 'Disable ai generation.',
              boolean: true,
            })
            .options('rename', {
              describe:
                'List of name mappings, ex. `--rename foo:bar "Old key:New key"` would rename all instances of "foo" with "bar" and "Old key" with "New key".',
              type: 'array',
            }),
        async ({
          path,
          destination,
          context,
          hostUrl,
          hostUrlAsArgument,
          disableAi,
          rename = [],
        }) => {
          if (!checkPolyConfig(DEFAULT_POLY_PATH)) {
            return shell.echo(
              'Poly is not configured. Please run `poly setup` to configure it.',
            );
          }
          if (!path) {
            yargs.showHelp();
            return;
          }

          if (hostUrl && !isValidHttpUrl(hostUrl)) {
            return shell.echo(`${hostUrl} is not a valid url`);
          }

          const preparedRenames: RenameT = [];
          for (const mappings of rename) {
            const [prevName = '', newName = ''] = `${mappings}`.split(':');
            if (!prevName || !newName) {
              shell.echo(
                chalk.redBright('ERROR:'),
                `Invalid rename mapping from "${prevName}" to "${newName}".`,
              );
              yargs.showHelp();
              return;
            }
            preparedRenames.push([prevName, newName]);
          }

          const { generateModel } = await import('./commands/model');
          await generateModel(
            path,
            destination,
            context,
            hostUrl,
            hostUrlAsArgument,
            !!disableAi,
            preparedRenames,
          );
        },
      )
      .command(
        'validate <path>',
        'Validates a Poly model',
        {
          path: {
            type: 'string',
            demandOption: true,
            describe: 'Path to Poly model file.',
          },
        },
        async ({ path }) => {
          if (!checkPolyConfig(DEFAULT_POLY_PATH)) {
            return shell.echo(
              'Poly is not configured. Please run `poly setup` to configure it.',
            );
          }
          if (!path) {
            yargs.showHelp();
            return;
          }

          const { validateModel } = await import('./commands/model');
          validateModel(path);
        },
      )
      .command(
        'train <path>',
        'Train generated Poly model.',
        {
          path: {
            type: 'string',
            demandOption: true,
            describe: 'Path to Poly model file.',
          },
        },
        async ({ path }) => {
          if (!checkPolyConfig(DEFAULT_POLY_PATH)) {
            return shell.echo(
              'Poly is not configured. Please run `poly setup` to configure it.',
            );
          }

          if (!path) {
            yargs.showHelp();
            return;
          }

          const { train } = await import('./commands/model');
          await train(DEFAULT_POLY_PATH, path);
        },
      );
  })
  .command('snippet <command>', 'Manage snippets.', async (yargs) => {
    yargs.command(
      'add <name> <path> [options]',
      'Adds a new snippet.',
      (yargs) =>
        yargs
          .positional('name', {
            type: 'string',
            demandOption: true,
            describe: 'Snippet name.',
          })
          .positional('path', {
            type: 'string',
            demandOption: true,
            describe: 'Path to destination that contains snippet.',
          })
          .option('context', {
            type: 'string',
            describe: 'Assign a context to this snippet',
          })
          .option('description', {
            type: 'string',
            describe: 'Assign a description to this snippet',
          }),
      async ({ name, path, context, description }) => {
        if (!checkPolyConfig(DEFAULT_POLY_PATH)) {
          return shell.echo(
            'Poly is not configured. Please run `poly setup` to configure it.',
          );
        }
        if (!path) {
          yargs.showHelp();
          return;
        }

        const { addSnippet } = await import('./commands/snippet');
        await addSnippet(
          DEFAULT_POLY_PATH,
          name,
          path,
          context || '',
          description || '',
        );
      },
    );
  })
  // Use strict parsing so unrecognized commands or options will raise an error rather than fail silently
  .strict(true)
  .showHelpOnFail(true, 'Specify --help for available commands and options.')
  .help(true).argv;
