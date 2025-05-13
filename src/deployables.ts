import os from 'os';
import { existsSync } from 'fs';
import { open, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import shell from 'shelljs';
import { createHash } from 'crypto';

export const CACHE_VERSION_FILE = './node_modules/.poly/deployments_revision';
export const CACHE_DIR = './node_modules/.poly/deployables';

// NOTE: DeployableTypes should be the string used for these types within the Canopy url.
export type DeployableTypes =
  | 'server-function'
  | 'client-function'
  | 'webhook'
// | "api-function"
// | "variable"
// | "webhook"
// | "trigger";

// NOTE: Make sure these names line up with the public types in `src/index.d.ts`
export type DeployableTypeNames =
  | 'PolyServerFunction'
  | 'PolyClientFunction'
  | 'PolyWebhook';
// | "PolyApiFunction"
// | "PolyVariable"
// | "PolyWebhook"
// | "PolyTrigger";

export type SyncFn = (deployable: SyncDeployment) => Promise<Deployment>;
export type RemoveFn = (deployable: SyncDeployment) => Promise<boolean>; // returns true if found and removed

export const DeployableTypeEntries: [DeployableTypeNames, DeployableTypes][] = [];

DeployableTypeEntries.push(['PolyServerFunction', 'server-function']);
DeployableTypeEntries.push(['PolyClientFunction', 'client-function']);
// DeployableTypeEntries.push(['PolyApiFunction', 'api-function']);
// DeployableTypeEntries.push(['PolyVariable', 'variable']);
DeployableTypeEntries.push(['PolyWebhook', 'webhook']);
// DeployableTypeEntries.push(['PolyTrigger', 'trigger']);

export const DeployableTsTypeToName = Object.fromEntries(DeployableTypeEntries);

export type ParsedDeployableConfig = {
  context: string;
  name: string;
  type: DeployableTypes;
  disableAi?: boolean;
  config: Record<string, any>;
}

export type Deployment = {
  // Deployments can be across several instances (or environments)
  // But the `polyapi` client is configured for a single instance at a time
  // So when we run poly prepare or poly sync we'll only mess with the deployments for the configured instance
  context: string;
  name: string;
  type: DeployableTypes;
  instance: string; // ex. "https://na1.polyapi.io"
  id: string; // uuid of deployed thing
  deployed: string; // ISO timestamp
  fileRevision: string; // ex. "a3f9b02"
}

export type DeployableRecord = ParsedDeployableConfig & {
  gitRevision: string; // ex. "343c0e67", output from `git rev-parse --short HEAD`
  fileRevision: string; // ex. "343c0e67"
  file: string; // ex. "/project/path/to/poly/deployable/file.ts";
  types?: {
    description: string;
    params: Array<{
      name: string;
      type: string;
      description: string;
    }>
    returns: {
      type: string;
      description: string;
    }
  };
  typeSchemas?: Record<string, any>;
  dependencies?: string[];
  description?: string;
  deployments: Deployment[];
  deploymentCommentRanges?: Array<[startIndex: number, endIndex: number]>;
  docStartIndex?: number;
  docEndIndex?: number;
  dirty?: boolean;
}

export type SyncDeployment = {
  context: string;
  name: string;
  description: string;
  type: DeployableTypes;
  fileRevision: string;
  file: string; // ex. "/project/path/to/poly/deployable/file.ts";
  typeSchemas?: Record<string, any>;
  dependencies?: string[];
  config: Record<string, unknown>;
  instance: string; // ex. "https://na1.polyapi.io"
  id?: string; // uuid of deployed thing
  deployed?: string; // ISO timestamp
}

export const prepareDeployableDirectory = async () => {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch { }
};

export const loadDeployableRecords = async (): Promise<DeployableRecord[]> => {
  // Load in all JSON records found in node_modules/.poly/deployables/
  const cachedRecords = (await readdir(CACHE_DIR, { withFileTypes: true }))
    .filter(d => d.isFile() && d.name.endsWith('.json'))
    .map(d => d.name);

  return Promise.all(cachedRecords.map(name =>
    readJsonFile<DeployableRecord>(`${CACHE_DIR}/${name}`)),
  );
};

export const saveDeployableRecords = async (records: DeployableRecord[]) => {
  await Promise.all(records.map(record =>
    writeJsonFile(`${CACHE_DIR}/${record.context}.${record.name}.json`, record),
  ));
};

export const removeDeployableRecords = async (records: DeployableRecord[]) => {
  shell.rm('-f', ...records.map(record => `${CACHE_DIR}/${record.context}.${record.name}.json`));
};

const readJsonFile = async <T = any>(path): Promise<T> => {
  const file = await readFile(path, { encoding: 'utf8' });
  return JSON.parse(file);
};

const writeJsonFile = async <T = any>(path: string, contents: T): Promise<unknown> => {
  await open(path, 'w');
  return writeFile(path, JSON.stringify(contents, undefined, 2), { encoding: 'utf8', flag: 'w' });
};

type PolyDeployConfig = {
  typeNames: DeployableTypeNames[];
  includeDirs: string[];
  includeFilesOrExtensions: string[];
  excludeDirs: string[];
}

export const getAllDeployableFilesWindows = ({
  typeNames,
  includeDirs,
  includeFilesOrExtensions,
  excludeDirs,
}: PolyDeployConfig): string[] => {
  // To get the equivalent of grep in Windows we use a combination of `dir` and `findstr`
  const includePattern = includeFilesOrExtensions.length > 0 ? includeFilesOrExtensions.map(f => f.includes('.') ? f : `*.${f}`).join(' ') : '*';
  const excludePattern = excludeDirs.length > 0 ? excludeDirs.join('|') : '';
  const pattern = typeNames.length > 0
    ? typeNames.map((name) => `polyConfig: ${name}`).join('|')
    : 'polyConfig';

  const excludeCommand = excludePattern ? ` | findstr /V /I "${excludePattern}"` : '';
  const searchCommand = ` | findstr /M /I /F:/ /C:"${pattern}"`;

  let result: string[] = [];
  for (const dir of includeDirs) {
    const dirCommand = `dir /S /P /B ${includePattern} ${dir}`;
    const fullCommand = `${dirCommand}${excludeCommand}${searchCommand}`;
    try {
      const output = shell.exec(fullCommand).toString('utf8');
      result = result.concat(output.split(/\r?\n/).filter(Boolean));
    } catch { }
  }
  return result;
};

export const getAllDeployableFilesLinux = ({
  typeNames,
  includeDirs,
  includeFilesOrExtensions,
  excludeDirs,
}: PolyDeployConfig): string[] => {
  // In Linux we can just use `grep` to find possible poly deployables
  const include = includeFilesOrExtensions.length
    ? includeFilesOrExtensions.map((f) => {
      return `--include=${f.includes('.') ? f : `*.${f}`}`;
    }).join(' ')
    : '';
  const excludeDir = excludeDirs.length ? excludeDirs.map(dir => `--exclude-dir=${dir}`).join(' ') : '';

  const searchPath = includeDirs.length
    ? includeDirs.join(' ')
    : '.';
  const patterns = typeNames.length > 0
    ? typeNames.map((name) => `-e 'polyConfig: ${name}'`).join(' ')
    : '-e \'polyConfig\'';
  const grepCommand = `grep ${include} ${excludeDir} -Rl ${patterns} ${searchPath}`;
  const output: string = shell.exec(grepCommand).toString('utf8');
  return output.split('\n').filter(Boolean) as string[];
};

export const getAllDeployableFiles = (config: Partial<PolyDeployConfig> = {}): string[] => {
  config.typeNames = config.typeNames = DeployableTypeEntries.map(p => p[0]);
  config.includeDirs = config.includeDirs = ['.'];
  config.includeFilesOrExtensions = config.includeFilesOrExtensions = ['ts', 'js'];
  config.excludeDirs = config.excludeDirs = [
    'node_modules',
    'dist',
    'build',
    'output',
    '.vscode',
    '.poly',
    '.github',
    '.husky',
    '.yarn',
  ];
  const isWindows = os.platform() === 'win32';
  return isWindows
    ? getAllDeployableFilesWindows(config as PolyDeployConfig)
    : getAllDeployableFilesLinux(config as PolyDeployConfig);
};

export const getDeployableFileRevision = (fileContents: string): string =>
  createHash('sha256')
    .update(
      // We want the file_revision to reflect the actual contents of the deployable
      // So trim all leading single-line comments before we hash the file
      // This prevents our deployment receipt comments from inadvertently changing the file revision
      fileContents.replace(/^(\/\/.*\n)+/, ''),
    )
    .digest('hex')
    // Trimming to 7 characters to align with git revision format and to keep this nice and short!
    .substring(0, 7);

export const getGitRevision = (branchOrTag = 'HEAD'): string => {
  try {
    const result = shell.exec(`git rev-parse --short ${branchOrTag}`).toString('utf8').trim();
    if (!result) throw new Error('Failed to get git revision.');
    return result;
  } catch (err) {
    console.warn('Failed to get git revision. Falling back to random hash.');
    return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
};

export const getCacheDeploymentsRevision = (): Promise<string> => {
  if (!existsSync(CACHE_VERSION_FILE)) return Promise.resolve('');
  return readFile(CACHE_VERSION_FILE, {
    flag: 'r',
    encoding: 'utf8',
  });
};

export const writeCacheRevision = async (gitRevision: string = getGitRevision()) => {
  await writeFile(CACHE_VERSION_FILE, gitRevision, {
    flag: 'w',
    encoding: 'utf8',
  });
};

export const isCacheUpToDate = async (): Promise<boolean> => {
  const cachedRevision = await getCacheDeploymentsRevision();
  const gitRevision = getGitRevision();
  return cachedRevision === gitRevision;
};

export const writeDeployComments = (deployments: Deployment[]): string => {
  const canopyPath = process.env.POLY_API_BASE_URL?.includes('localhost')
    ? 'polyui/collections'
    : 'canopy/polyui/collections';

  return deployments
    .map(d =>
      `// Poly deployed @ ${d.deployed} - ${d.context}.${d.name} - ${d.instance.endsWith(':8000') ? d.instance.replace(':8000', ':3000') : d.instance}/${canopyPath}/${d.type}s/${d.id} - ${d.fileRevision}`,
    ).join('\n');
};

const printJSDocFunctionComment = ({ description, params, returns }) => {
  return `/**\n${[
    ...description.split('\n').filter(Boolean),
    ...params.map(p => `@param {${p.type}} ${p.name}${p.description ? ' - ' : ''}${p.description}`),
    `@returns {${returns.type}} ${returns.description}`,
  ].map(l => ` * ${l}`).join('\n')}\n */\n`;
};

const updateDeploymentComments = (fileContent: string, deployable: DeployableRecord): string => {
  while (deployable.deploymentCommentRanges.length > 0) {
    const range = deployable.deploymentCommentRanges.pop();
    fileContent = `${fileContent.substring(0, range[0])}${fileContent.substring(range[1])}`;
  }
  if (deployable.deployments.length) {
    const deploymentComments = writeDeployComments(deployable.deployments);
    // +1 because of the newline character we insert afterwards
    deployable.deploymentCommentRanges.push([0, deploymentComments.length + 1]);
    // Then add deploy comments to the top
    fileContent = `${deploymentComments
      }\n${fileContent
      }`;
  }
  return fileContent;
};

const updateDeployableFunctionComments = (fileContent: string, deployable: DeployableRecord, disableDocs = false): string => {
  if (!disableDocs) {
    // First write/overwrite the JSDoc comment
    fileContent = `${fileContent.substring(0, deployable.docStartIndex)
      }${printJSDocFunctionComment(deployable.types)
      }${fileContent.substring(deployable.docEndIndex)
      }`;
  }
  return fileContent;
};

export const writeUpdatedDeployable = async (deployable: DeployableRecord, disableDocs = false): Promise<DeployableRecord> => {
  let fileContents = await readFile(deployable.file, {
    flag: 'r',
    encoding: 'utf8',
  });
  switch (deployable.type) {
    case 'client-function':
    case 'server-function': {
      fileContents = updateDeployableFunctionComments(fileContents, deployable, disableDocs);
      break;
    }
    case 'webhook':
      break;
    default:
      throw new Error(`Unsupported deployable type: '${deployable.type}'`);
  }
  // Then write/overwrite any deployment comments (must happen last to prevent the JSDoc comment ranges from breaking)
  if (deployable.type !== 'webhook') fileContents = updateDeploymentComments(fileContents, deployable);
  await writeFile(deployable.file, fileContents, {
    flag: 'w',
    encoding: 'utf8',
  });
  // Get an updated fileRevision
  deployable.fileRevision = getDeployableFileRevision(fileContents);
  return deployable;
};
