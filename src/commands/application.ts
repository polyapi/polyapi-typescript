import chalk from 'chalk';
import shell from 'shelljs';
import { loadConfig } from '../config';
import {
  createCanopyV2Application,
  updateCanopyV2Application,
} from '../component/applications';

const shortErrorMessage = (error: unknown) => {
  const err = error as {
    message?: string;
    response?: { status?: number; data?: { message?: string } };
  };
  const status = err?.response?.status;
  const serverMessage = err?.response?.data?.message;
  if (status && serverMessage) {
    return `Request failed with status code ${status}: ${serverMessage}`;
  }
  return err?.message || 'Unexpected error.';
};

const echoApplication = (
  action: string,
  application: { id: string; name: string; subpath?: string; config?: unknown },
) => {
  const config = application.config;
  const subpath =
    config && typeof config === 'object' && 'subpath' in config
      ? String((config as { subpath?: string }).subpath || '')
      : application.subpath || '';
  shell.echo(chalk.green(action));
  shell.echo(`Application ${application.name} ID: ${application.id}`);
  if (subpath) {
    shell.echo(`HTTP manifest: /canopy/v2/manifest?subpath=${subpath}`);
    shell.echo(
      `Origin host label: ${application.name}-{environment.subdomain}`,
    );
  }
};

export const createApplicationCommand = async (
  polyPath: string,
  options: {
    name: string;
    rootComponent: string;
    authenticatedRoot?: string;
    subpath: string;
  },
) => {
  loadConfig(polyPath);
  shell.echo('-n', 'Creating canopy-v2 application...');
  try {
    const application = await createCanopyV2Application({
      name: options.name,
      rootComponent: options.rootComponent,
      authenticatedRoot: options.authenticatedRoot,
      subpath: options.subpath,
    });
    echoApplication('DONE', application);
  } catch (error) {
    shell.echo(chalk.redBright('ERROR\n'));
    shell.echo(chalk.redBright.bold(shortErrorMessage(error)));
    throw error;
  }
};

export const updateApplicationCommand = async (
  polyPath: string,
  options: {
    nameOrId: string;
    name?: string;
    rootComponent?: string;
    authenticatedRoot?: string | null;
    subpath?: string;
  },
) => {
  loadConfig(polyPath);
  shell.echo('-n', 'Updating canopy-v2 application...');
  try {
    const application = await updateCanopyV2Application(options);
    echoApplication('DONE', application);
  } catch (error) {
    shell.echo(chalk.redBright('ERROR\n'));
    shell.echo(chalk.redBright.bold(shortErrorMessage(error)));
    throw error;
  }
};
