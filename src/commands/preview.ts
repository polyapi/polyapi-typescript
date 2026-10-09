import chalk from 'chalk';
import shell from 'shelljs';
import { loadConfig } from '../config';
import { startApplicationPreview } from '../component/preview';

export const previewApplication = async (
  polyPath: string,
  options: {
    subpath?: string;
    app?: string;
    env?: string;
    port?: number;
    projectRoot?: string;
  },
) => {
  loadConfig(polyPath);
  if (!process.env.POLY_API_BASE_URL) {
    shell.echo(
      'Poly is not configured. Please run `poly setup` or set POLY_API_BASE_URL.',
    );
    return;
  }

  shell.echo('-n', 'Starting local application preview...');
  try {
    const server = await startApplicationPreview({
      subpath: options.subpath,
      app: options.app,
      env: options.env,
      port: options.port,
      projectRoot: options.projectRoot,
    });
    shell.echo(chalk.green('DONE'));
    shell.echo(`Preview URL: ${server.url}`);
    shell.echo(
      'Deployed poly:vendor and poly:app-vendor are proxied from the instance. Component modules are compiled from local files and reload on save.',
    );
    shell.echo('Press Ctrl+C to stop.');

    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', () => {
      void shutdown();
    });
    process.on('SIGTERM', () => {
      void shutdown();
    });
  } catch (e) {
    shell.echo(chalk.redBright('ERROR\n'));
    const err = e as { message?: string };
    shell.echo(chalk.redBright.bold(err?.message ?? 'Unexpected error.'));
    throw e;
  }
};
