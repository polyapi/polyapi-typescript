import fs, { PathOrFileDescriptor } from 'fs';
import handlebars from 'handlebars';
import chalk from 'chalk';
import shell from 'shelljs';
import { v4 as uuidv4 } from 'uuid';

import {
  ApiFunctionSpecification,
  AuthFunctionSpecification,
  CustomFunctionSpecification,
  ServerFunctionSpecification,
  ServerVariableSpecification,
  Specification,
  WebhookHandleSpecification,
} from '../../types';
import { getSpecs } from '../../api';
import { loadConfig } from '../../config';
import {
  generateContextDataFile,
  getContextDataFileContent,
  getPolyLibPath,
  getSpecsFromContextData,
  showErrGettingSpecs,
  getStringPaths,
  loadTemplate,
  GenerationError,
  echoGenerationError,
  isPlainObjectPredicate,
  getContextData,
} from '../../utils';
import { DEFAULT_POLY_PATH } from '../../constants';
import { generateFunctionsTSDeclarationFile, generateVariablesTSDeclarationFile, getGenerationErrors, setGenerationErrors } from './types';
import { generateSchemaTSDeclarationFiles } from './schemaTypes';

// Register the eq helper for equality comparison
handlebars.registerHelper('eq', (a, b) => a === b);

const fsWriteAsync = (file: PathOrFileDescriptor, data: string) =>
  new Promise<void>((resolve, reject) => {
    fs.writeFile(file, data, (err) => err ? reject(err) : resolve());
  });

const getApiBaseUrl = () => process.env.POLY_API_BASE_URL || 'http://localhost:8000';

const getApiKey = () => process.env.POLY_API_KEY;

const prepareDir = async (polyPath: string) => {
  const libPath = getPolyLibPath(polyPath);

  fs.rmSync(libPath, { recursive: true, force: true });
  fs.mkdirSync(libPath, { recursive: true });
  fs.mkdirSync(`${libPath}/api`);
  fs.mkdirSync(`${libPath}/client`);
  fs.mkdirSync(`${libPath}/auth`);
  fs.mkdirSync(`${libPath}/webhooks`);
  fs.mkdirSync(`${libPath}/server`);
  fs.mkdirSync(`${libPath}/vari`);
  fs.mkdirSync(`${libPath}/schemas`);

  if (polyPath !== DEFAULT_POLY_PATH) {
    try {
      await generateRedirectIndexFiles(polyPath);
    } catch (err) {
      shell.echo(chalk.red(`Could not generate redirect index files: ${err.message}, continuing...`));
    }
  }
};

const getExecutionConfig = () => ({
  directExecute: process.env.API_FUNCTION_DIRECT_EXECUTE === 'true',
  mtls: {
    certPath: process.env.MTLS_CERT_PATH,
    keyPath: process.env.MTLS_KEY_PATH,
    caPath: process.env.MTLS_CA_PATH,
    rejectUnauthorized: process.env.NODE_ENV !== 'development',
  },
});

const generateRedirectIndexFiles = async (polyPath: string) => {
  const defaultPolyLib = getPolyLibPath(DEFAULT_POLY_PATH);

  polyPath = polyPath.startsWith('/') ? polyPath : `../../../${polyPath}`;

  fs.rmSync(defaultPolyLib, { recursive: true, force: true });
  fs.mkdirSync(defaultPolyLib, { recursive: true });

  const indexRedirectJSTemplate = handlebars.compile(loadTemplate('index-redirect.js.hbs'));
  const indexTSRedirectJSTemplate = handlebars.compile(loadTemplate('index-redirect.d.ts.hbs'));

  await Promise.all([
    fsWriteAsync(`${defaultPolyLib}/index.js`, indexRedirectJSTemplate({ polyPath })),
    fsWriteAsync(`${defaultPolyLib}/index.d.ts`, indexTSRedirectJSTemplate({ polyPath })),
  ]);
};

const generateJSFiles = async (libPath: string, specs: Specification[]): Promise<GenerationError[]> => {
  const apiFunctions = specs.filter((spec) => spec.type === 'apiFunction') as ApiFunctionSpecification[];
  const customFunctions = specs
    .filter((spec) => spec.type === 'customFunction')
    .filter((spec) => (spec as CustomFunctionSpecification).language === 'javascript') as CustomFunctionSpecification[];
  const webhookHandles = specs.filter((spec) => spec.type === 'webhookHandle') as WebhookHandleSpecification[];
  const authFunctions = specs.filter((spec) => spec.type === 'authFunction') as AuthFunctionSpecification[];
  const serverFunctions = specs.filter((spec) => spec.type === 'serverFunction') as ServerFunctionSpecification[];
  const serverVariables = specs.filter((spec) => spec.type === 'serverVariable') as ServerVariableSpecification[];

  await generateIndexJSFile(libPath);
  await generatePolyCustomJSFile(libPath);
  await generateAxiosJSFile(libPath);
  await generateErrorHandlerFile(libPath);
  await tryAsync(generateApiFunctionJSFiles(libPath, apiFunctions), 'api functions');
  const customFnCodeGenerationErrors = await tryAsync(generateCustomFunctionJSFiles(libPath, customFunctions), 'custom functions');
  await tryAsync(generateWebhooksJSFiles(libPath, webhookHandles), 'webhooks');
  await tryAsync(generateAuthFunctionJSFiles(libPath, authFunctions), 'auth functions');
  await tryAsync(generateServerFunctionJSFiles(libPath, serverFunctions), 'server functions');
  await tryAsync(generateServerVariableJSFiles(libPath, serverVariables), 'variables');

  return customFnCodeGenerationErrors;
};

const generateIndexJSFile = async (libPath: string) => {
  const indexJSTemplate = handlebars.compile(loadTemplate('index.js.hbs'));
  fs.writeFileSync(
    `${libPath}/index.js`,
    indexJSTemplate({
      clientID: uuidv4(),
      apiBaseUrl: getApiBaseUrl(),
      apiKey: getApiKey(),
    }),
  );
};

const generatePolyCustomJSFile = async (libPath: string) => {
  const polyCustomJSTemplate = handlebars.compile(loadTemplate('poly-custom.js.hbs'));
  fs.writeFileSync(
    `${libPath}/poly-custom.js`,
    polyCustomJSTemplate({
      apiBaseUrl: getApiBaseUrl(),
      apiKey: getApiKey(),
    }),
  );
};

const generateAxiosJSFile = async (libPath: string) => {
  const axiosJSTemplate = handlebars.compile(loadTemplate('axios.js.hbs'));
  fs.writeFileSync(
    `${libPath}/axios.js`,
    axiosJSTemplate({
      apiBaseUrl: getApiBaseUrl(),
      apiKey: getApiKey(),
    }),
  );
};

const generateErrorHandlerFile = async (libPath: string) => {
  const errorHandlerJSTemplate = handlebars.compile(loadTemplate('error-handler.js.hbs'));
  fs.writeFileSync(
    `${libPath}/error-handler.js`,
    errorHandlerJSTemplate({
    }),
  );
};

const generateApiFunctionJSFiles = async (libPath: string, specifications: ApiFunctionSpecification[]) => {
  const template = handlebars.compile(loadTemplate('api-index.js.hbs'));
  fs.writeFileSync(
    `${libPath}/api/index.js`,
    template({
      specifications,
      executionConfig: getExecutionConfig(),
    }),
  );
};

const generateCustomFunctionJSFiles = async (libPath: string, specifications: CustomFunctionSpecification[]): Promise<GenerationError[]> => {
  const codeGenerationErrors: Record<string, GenerationError> = {};

  if (specifications.length) {
    const customFunctionJSTemplate = handlebars.compile(loadTemplate('custom-function.js.hbs'));

    await Promise.all(
      specifications.map((spec) =>
        fsWriteAsync(`${libPath}/client/${spec.context ? `${spec.context}-` : ''}${spec.name}.js`, customFunctionJSTemplate(spec))
          .catch(error => {
            codeGenerationErrors[spec.id] = {
              stack: (error as Error).stack,
              specification: spec,
            };
          }),
      ),
    );
  }
  const customIndexJSTemplate = handlebars.compile(loadTemplate('custom-index.js.hbs'));
  fs.writeFileSync(
    `${libPath}/client/index.js`,
    customIndexJSTemplate({
      specifications: specifications.filter(spec => !codeGenerationErrors[spec.id]),
    }),
  );

  return Array.from(Object.values(codeGenerationErrors));
};

const generateWebhooksJSFiles = async (libPath: string, specifications: WebhookHandleSpecification[]) => {
  const template = handlebars.compile(loadTemplate('webhooks-index.js.hbs'));
  fs.writeFileSync(
    `${libPath}/webhooks/index.js`,
    template({
      specifications,
      apiKey: getApiKey(),
    }),
  );
};

const generateServerFunctionJSFiles = async (libPath: string, specifications: ServerFunctionSpecification[]) => {
  const serverIndexJSTemplate = handlebars.compile(loadTemplate('server-index.js.hbs'));
  fs.writeFileSync(
    `${libPath}/server/index.js`,
    serverIndexJSTemplate({
      specifications,
    }),
  );
};

const generateServerVariableJSFiles = async (libPath: string, specifications: ServerVariableSpecification[]) => {
  const contextData = getContextData(specifications);
  const contextPaths = getContextPaths(contextData);
  const template = handlebars.compile(loadTemplate('vari/index.js.hbs'));

  const arrPaths = [];

  for (const specification of specifications) {
    if (isPlainObjectPredicate(specification.variable.value) || Array.isArray(specification.variable.value)) {
      arrPaths.push({
        context: specification.context || '',
        paths: getStringPaths(specification.variable.value),
      });
    }
  }

  fs.writeFileSync(
    `${libPath}/vari/index.js`,
    template({
      specifications,
      contextPaths,
      apiKey: getApiKey(),
      arrPaths: JSON.stringify(arrPaths),
    }),
  );
};

const generateAuthFunctionJSFiles = async (libPath: string, specifications: AuthFunctionSpecification[]): Promise<GenerationError[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const apiKey = getApiKey();

  const authIndexJSTemplate = handlebars.compile(loadTemplate('auth-index.js.hbs'));
  fs.writeFileSync(
    `${libPath}/auth/index.js`,
    authIndexJSTemplate({
      getTokenFunctions: specifications.filter((spec) => spec.name === 'getToken'),
      subResourceFunctions: specifications.filter((spec) => spec.subResource),
      apiBaseUrl,
      apiKey,
    }),
  );

  const specsToGenerate = specifications.filter((spec) => !spec.subResource);
  if (specsToGenerate.length === 0) return [];

  const authFunctionJSTemplate = handlebars.compile(loadTemplate('auth-function.js.hbs'));

  const codeGenerationErrors: Record<string, GenerationError> = {};

  await Promise.all(
    specifications.map((spec) =>
      fsWriteAsync(`${libPath}/auth/${spec.context ? `${spec.context}-` : ''}${spec.name}.js`, authFunctionJSTemplate({
        ...spec,
        audienceRequired: spec.function.arguments.some((arg) => arg.name === 'audience'),
        apiBaseUrl,
        apiKey,
      }))
        .catch(error => {
          codeGenerationErrors[spec.id] = {
            stack: (error as Error).stack,
            specification: spec,
          };
        }),
    ),
  );

  return Array.from(Object.values(codeGenerationErrors));
};

const getContextPaths = (contextData: Record<string, any>) => {
  const paths: string[] = [];
  const traverseAndAddPath = (data, path = '') => {
    for (const key of Object.keys(data)) {
      if (typeof data[key].context === 'string') {
        continue;
      }
      const currentPath = path ? `${path}.${key}` : key;
      paths.push(currentPath);
      traverseAndAddPath(data[key], currentPath);
    }
  };

  traverseAndAddPath(contextData);

  return paths;
};

const showErrGeneratingFiles = (error: any) => {
  shell.echo(chalk.red('ERROR'));
  shell.echo('Error while generating code files. Make sure the version of library/server is up to date.');
  shell.echo(chalk.red(error.message));
  shell.echo(chalk.red(error.stack));
  shell.exit(2);
};

const generateSingleCustomFunction = async (polyPath: string, functionId: string, updated: boolean, noTypes = false) => {
  shell.echo('-n', updated ? 'Regenerating TypeScript SDK...' : 'Generating TypeScript SDK...');

  const libPath = getPolyLibPath(polyPath);
  let contextData: Record<string, any> = {};

  try {
    contextData = getContextDataFileContent(libPath);
  } catch (error) {
    shell.echo(chalk.red('ERROR'));
    shell.echo('Error while fetching local context data.');
    shell.echo(chalk.red(error.message));
    shell.echo(chalk.red(error.stack));
    return;
  }

  const prevSpecs = getSpecsFromContextData(contextData);

  let specs: Specification[] = [];

  try {
    specs = await getSpecs([], [], [functionId], noTypes);
  } catch (error) {
    showErrGettingSpecs(error);
    return;
  }

  const [customFunction] = specs;

  if (prevSpecs.some((prevSpec) => prevSpec.id === customFunction.id)) {
    specs = prevSpecs.map((prevSpec) => {
      if (prevSpec.id === customFunction.id) {
        return customFunction;
      }
      return prevSpec;
    });
  } else {
    prevSpecs.push(customFunction);
    specs = prevSpecs;
  }

  await prepareDir(polyPath);

  setGenerationErrors(false);

  await generateSpecs(libPath, specs, noTypes);

  if (getGenerationErrors()) {
    shell.echo(chalk.yellow('Generate DONE with errors. Please investigate the errors and contact support@polyapi.io for assistance.'));
  } else {
    shell.echo(chalk.green('DONE'));
  }
};

const generate = async ({
  polyPath,
  contexts,
  names,
  functionIds,
  noTypes,
}: {
  polyPath: string;
  contexts?: string[];
  names?: string[];
  functionIds?: string[];
  noTypes: boolean;
}) => {
  let specs: Specification[] = [];

  const generateMsg = contexts ? `Generating Poly TypeScript SDK for contexts "${contexts}"...` : 'Generating Poly TypeScript SDK...';
  shell.echo('-n', generateMsg);

  await prepareDir(polyPath);
  loadConfig(polyPath);

  try {
    specs = await getSpecs(contexts, names, functionIds, noTypes);
  } catch (error) {
    showErrGettingSpecs(error);
    return;
  }

  setGenerationErrors(false);
  await generateSpecs(getPolyLibPath(polyPath), specs, noTypes);

  if (getGenerationErrors()) {
    shell.echo(chalk.yellow('Generate DONE with errors. Please investigate the errors and contact support@polyapi.io for assistance.'));
  } else {
    shell.echo(chalk.green('DONE'));
  }
};

const tryAsync = async <R = unknown>(promise: Promise<R>, generatingName: string): Promise<R> => {
  try {
    return await promise;
  } catch (err) {
    shell.echo(
      chalk.red(`\nUnexpected error encountered while generating ${generatingName}: ${err}`),
    );
  }
};

export const generateSpecs = async (libPath: string, specs: Specification[], noTypes: boolean) => {
  try {
    let missingNames: Specification[] = [];
    [missingNames, specs] = specs.reduce((acc, s) => {
      acc[s.name.trim() ? 1 : 0].push(s);
      return acc;
    }, [[], []]);
    const jsFilesCodeGenerationErrors = await generateJSFiles(libPath, specs);

    const filteredSpecs = specs.filter(spec => !jsFilesCodeGenerationErrors.find(codeGenerationError => codeGenerationError.specification.id === spec.id));

    if (!noTypes) {
      await tryAsync(generateFunctionsTSDeclarationFile(libPath, filteredSpecs), 'function types');
      await tryAsync(generateVariablesTSDeclarationFile(libPath, filteredSpecs), 'variable types');
      await tryAsync(generateSchemaTSDeclarationFiles(libPath, filteredSpecs.filter(s => s.type === 'schema') as any[]), 'schemas');
    }

    generateContextDataFile(libPath, filteredSpecs);

    if (missingNames.length) {
      setGenerationErrors(true);
      missingNames.map((s) => echoGenerationError(s));
    }
    if (jsFilesCodeGenerationErrors.length) {
      setGenerationErrors(true);
      jsFilesCodeGenerationErrors.forEach((error) => {
        echoGenerationError(error.specification);
      });
    }
  } catch (error) {
    showErrGeneratingFiles(error);
  }
};

export { generate, generateSingleCustomFunction };
