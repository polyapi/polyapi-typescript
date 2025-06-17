import shell from 'shelljs';
import { FunctionArgumentDto } from '../types';
import { getTSBaseUrl, parseDeployable } from '../transpiler';
import {
  DeployableRecord,
  DeployableTypes,
  getAllDeployableFiles,
  getGitRevision,
  isCacheUpToDate,
  prepareDeployableDirectory,
  saveDeployableRecords,
  writeCacheRevision,
  writeUpdatedDeployable,
} from '../deployables';
import {
  getClientFunctionDescription,
  getServerFunctionDescription,
} from '../api';

const getFunctionDescription = (
  type: DeployableTypes,
  description: string,
  args: FunctionArgumentDto[],
  code: string,
) =>
  type === 'server-function'
    ? getServerFunctionDescription({ description, arguments: args, code })
    : getClientFunctionDescription({ description, arguments: args, code });

const fillInMissingFunctionDetails = async (
  deployable: DeployableRecord,
  code: string,
): Promise<DeployableRecord> => {
  const isMissingDescriptions =
    !deployable.types.description ||
    !deployable.types.returns.description ||
    deployable.types.params.some((p) => !p.description);
  if (isMissingDescriptions) {
    try {
      const aiGenerated = await getFunctionDescription(
        deployable.type,
        deployable.types.description,
        deployable.types.params.map((p) => ({ ...p, key: p.name })),
        code,
      );
      if (!deployable.types.description && aiGenerated.description) {
        deployable.types.description = aiGenerated.description;
        deployable.dirty = true;
      }
      deployable.types.params = deployable.types.params.map((p) => {
        if (p.description) return p;
        const aiArg = aiGenerated.arguments.find((a) => a.name === p.name);
        if (!aiArg || !aiArg.description) return p;
        deployable.dirty = true;
        return { ...p, description: aiArg.description };
      });
    } catch {}
  }
  return deployable;
};

const fillInMissingDetails = async (
  deployable: DeployableRecord,
  code: string,
): Promise<DeployableRecord> => {
  switch (deployable.type) {
    case 'server-function':
    case 'client-function':
      return fillInMissingFunctionDetails(deployable, code);
  }
  throw new Error(`Unsupported deployable type: '${deployable.type}'`);
};

const getAllDeployables = async (
  disableDocs: boolean,
  disableAi: boolean,
  gitRevision: string,
): Promise<DeployableRecord[]> => {
  console.log('Searching for poly deployables.');
  const baseUrl = getTSBaseUrl() || '.';
  const possibleDeployables = getAllDeployableFiles({ includeDirs: [baseUrl] });
  console.log(
    `Found ${possibleDeployables.length} possible deployable file${
      possibleDeployables.length === 1 ? '' : 's'
    }.`,
  );
  // Iterate through each type to get us all the files separated by deployable type
  const found = new Map<string, DeployableRecord>();
  for (const possible of possibleDeployables) {
    try {
      const [deployable, code] = await parseDeployable(
        possible,
        baseUrl,
        gitRevision,
      );
      const fullName = `${deployable.context}.${deployable.name}`;
      if (found.has(fullName)) {
        console.error(
          `Prepared ${deployable.type.replaceAll(
            '-',
            ' ',
          )} ${fullName}: DUPLICATE`,
        );
      } else {
        found.set(
          fullName,
          disableAi || deployable.disableAi || deployable.type === 'webhook'
            ? deployable
            : await fillInMissingDetails(deployable, code),
        );
        console.log(
          `Prepared ${deployable.type.replaceAll('-', ' ')} ${fullName}: ${
            deployable.dirty && !disableDocs ? 'UPDATED' : 'OK'
          }`,
        );
      }
    } catch (err) {
      console.error(`ERROR parsing ${possible}`);
      console.error(err);
    }
  }
  return Array.from(found.values());
};

export const prepareDeployables = async (
  lazy: boolean,
  disableDocs: boolean,
  disableAi: boolean,
) => {
  if (lazy && (await isCacheUpToDate())) {
    console.log('Poly deployments are prepared.');
    return;
  }
  shell.echo('Preparing Poly deployments...');
  await prepareDeployableDirectory();
  const gitRevision = getGitRevision();
  // Parse deployable files
  const parsedDeployables = await getAllDeployables(
    disableDocs,
    disableAi,
    gitRevision,
  );
  if (!parsedDeployables.length) {
    console.warn(
      'No deployable files found. Did you define a `polyConfig` within your deployment?',
    );
    return process.exit(1);
  }
  const dirtyDeployables = parsedDeployables.filter((d) => !!d.dirty);
  if (dirtyDeployables.length) {
    // Write back deployables files with updated comments
    console.log(
      `Fixing ${dirtyDeployables.length} deployable file${
        dirtyDeployables.length === 1 ? '' : 's'
      }.`,
    );
    // NOTE: writeUpdatedDeployable has side effects that update deployable.fileRevision which is in both this list and parsedDeployables
    await Promise.all(
      dirtyDeployables.map((deployable) =>
        writeUpdatedDeployable(deployable, disableDocs),
      ),
    );
    const staged = shell.exec('git diff --name-only --cached')
      .toString().split('\n').filter(Boolean);
    const rootPath: string = shell.exec('git rev-parse --show-toplevel', {silent:true})
      .toString('utf8').replace('\n', '');
    for (const deployable of dirtyDeployables) {
      try{
        const deployableName = deployable.file.replace(rootPath, '');
        if (staged.includes(deployableName)) {
          shell.echo(`Staging ${deployableName}`);
          shell.exec(`git add ${deployableName}`);
        }
      }
      catch (error) {
        console.warn(error);
      }
    }
  }
  console.log('Poly deployments are prepared.');
  await saveDeployableRecords(parsedDeployables);
  await writeCacheRevision(gitRevision);
  console.log(
    'Cached deployables and generated typedefs into node_modules/.poly/deployables directory.',
  );
};
