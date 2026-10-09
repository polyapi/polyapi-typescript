import chalk from 'chalk';
import shell from 'shelljs';
import { createPolyVendor } from '../api';
import { loadConfig } from '../config';
import {
  bundleVendor,
  readPackageVersion,
  resolveExternalDependencies,
} from '../component/compile';
import { INSTANCE_REACT_VENDOR_SPECIFIERS } from '../component/types';

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

export const publishInstanceVendor = async (
  polyPath: string,
  options: { projectRoot?: string; npmResolveDir?: string } = {},
) => {
  loadConfig(polyPath);
  const npmResolveDir =
    options.npmResolveDir ?? options.projectRoot ?? process.cwd();

  shell.echo('-n', 'Publishing instance polyVendor...');
  try {
    const code = await bundleVendor(
      [...INSTANCE_REACT_VENDOR_SPECIFIERS],
      npmResolveDir,
      { production: true, minify: true },
    );
    const packages = resolveExternalDependencies(
      ['react', 'react-dom', 'react/jsx-runtime'],
      npmResolveDir,
    );
    packages.react = readPackageVersion('react', npmResolveDir);
    packages['react-dom'] = readPackageVersion('react-dom', npmResolveDir);
    packages['react/jsx-runtime'] = packages.react;

    const saved = await createPolyVendor({ code, packages });
    shell.echo(chalk.green('DONE'));
    shell.echo(
      `polyVendor hash: ${saved.hash} (${Buffer.byteLength(code, 'utf8')} bytes)`,
    );
    if (saved.url) {
      shell.echo(`polyVendor url: ${saved.url}`);
    }
  } catch (e) {
    shell.echo(chalk.redBright('ERROR\n'));
    const message = shortErrorMessage(e);
    shell.echo(chalk.redBright.bold(message));
    throw new Error(message);
  }
};
