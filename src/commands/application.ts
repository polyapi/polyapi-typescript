import chalk from 'chalk';
import shell from 'shelljs';
import { loadConfig } from '../config';
import { addCanopyV2Application } from '../component/applications';

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
  saved: {
    application: { id: string; name: string };
    subdomain: string;
    environmentSubdomain: string;
  },
) => {
  shell.echo(chalk.green(action));
  shell.echo(`Application ${saved.application.name} ID: ${saved.application.id}`);
  const joined = `${saved.subdomain}-${saved.environmentSubdomain}`;
  shell.echo(`Origin host label: ${joined}`);
  shell.echo(`Spec: /applications/${joined}/spec`);
  shell.echo(`HTTP page: /?app=${joined}`);
};

export const addApplicationCommand = async (
  polyPath: string,
  options: {
    name: string;
    subdomain?: string;
    rootComponent: string;
    authenticatedRoot?: string | null;
  },
) => {
  loadConfig(polyPath);
  try {
    const saved = await addCanopyV2Application(
      {
        name: options.name,
        subdomain: options.subdomain,
        rootComponent: options.rootComponent,
        authenticatedRoot: options.authenticatedRoot,
      },
      (updating) => {
        shell.echo(
          '-n',
          `${updating ? 'Updating' : 'Adding'} canopy-v2 application...`,
        );
      },
    );
    echoApplication('DONE', saved);
  } catch (error) {
    shell.echo(chalk.redBright('ERROR\n'));
    shell.echo(chalk.redBright.bold(shortErrorMessage(error)));
    throw error;
  }
};
