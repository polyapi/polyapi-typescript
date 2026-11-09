import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import shell from 'shelljs';
import {
  bundleVendor,
  readPackageVersion,
  resolveExternalDependencies,
} from '../component/compile';
import { INSTANCE_REACT_VENDOR_SPECIFIERS } from '../component/types';

const shortErrorMessage = (error: unknown) => {
  const err = error as { message?: string };
  return err?.message || 'Unexpected error.';
};

export const buildInstanceVendor = async (
  options: { npmResolveDir?: string; outFile?: string } = {},
) => {
  const npmResolveDir = path.resolve(
    options.npmResolveDir ?? process.cwd(),
  );
  const outFile = path.resolve(
    options.outFile ?? path.join(npmResolveDir, 'poly-vendor.js'),
  );

  shell.echo('-n', 'Building instance polyVendor...');
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

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, code);
    shell.echo(chalk.green('DONE'));
    shell.echo(
      `polyVendor file: ${outFile} (${Buffer.byteLength(code, 'utf8')} bytes)`,
    );
    for (const [name, version] of Object.entries(packages)) {
      shell.echo(`  ${name} ${version}`);
    }
    return { outFile, code, packages };
  } catch (e) {
    shell.echo(chalk.redBright('ERROR\n'));
    const message = shortErrorMessage(e);
    shell.echo(chalk.redBright.bold(message));
    throw new Error(message);
  }
};
