import fs from 'fs';
import set from 'lodash/set';
import jp from 'jsonpath';
import prettier from 'prettier';
import chalk from 'chalk';
import shell from 'shelljs';

import {
  ObjectPropertyType,
  PropertySpecification,
  PropertyType,
  Specification,
  SpecificationType,
} from './types';

import { INSTANCE_URL_MAP } from './constants';

export const getPolyLibPath = (polyPath: string) =>
  polyPath.startsWith('/')
    ? `${polyPath}/lib`
    : `${__dirname}/../../../${polyPath}/lib`;

export const getCachedSpecs = (libPath: string) => {
  try {
    const contents = fs.readFileSync(`${libPath}/specs.json`, 'utf-8');
    return JSON.parse(contents) as Specification[];
  } catch (err) {
    return [];
  }
};

export const writeCachedSpecs = (
  libPath: string,
  specs: Specification[],
) => {
  fs.mkdirSync(libPath, { recursive: true });
  fs.writeFileSync(
    `${libPath}/specs.json`,
    JSON.stringify(
      specs.filter((spec) => {
        if (spec.type === 'snippet') {
          return spec.language === 'javascript';
        }
        if (spec.type === 'customFunction') {
          return spec.language === 'javascript';
        }

        return true;
      }),
      null,
      2,
    ),
  );
};


export type GenerationError = {
  specification: Specification;
  stack: string;
};

export const echoGenerationError = (specification: Specification) => {
  const typeMap: Record<SpecificationType, string> = {
    apiFunction: 'API Function',
    customFunction: 'Custom Function',
    authFunction: 'Auth Function',
    webhookHandle: 'Webhook Handle',
    graphqlSubscription: 'Webhook Handle',
    serverFunction: 'Server Function',
    serverVariable: 'Variable',
    schema: 'Schema',
    snippet: 'Snippet',
    table: 'Table'
  };

  const type = typeMap[specification.type];

  shell.echo(
    chalk.red(
      `\nError encountered while processing ${type} '${specification.contextName}' (id: '${specification.id}'). ${type} is unavailable.`,
    ),
  );
};

export const templateUrl = (fileName: string): string => `${__dirname}/templates/${fileName}`;

export const loadTemplate = (fileName: string) =>
  fs.readFileSync(templateUrl(fileName), 'utf8');

export const prettyPrint = (code: string, parser = 'typescript') =>
  prettier.format(code, {
    parser,
    singleQuote: true,
    printWidth: 160,
  });

export const showErrGettingSpecs = (error: any) => {
  shell.echo(chalk.red('ERROR'));
  shell.echo(
    'Error while getting data from Poly server. Make sure the version of library/server is up to date.',
  );
  shell.echo(
    chalk.red(error.message),
    chalk.red(JSON.stringify(error.response?.data)),
  );
  shell.exit(1);
};

export const getStringPaths = (data: Record<string, any> | any[]) => {
  const paths = jp.paths(data, '$..*', 100);

  const stringPaths: string[] = [];

  for (let i = 0; i < paths.length; i++) {
    let stringPath = '';
    const parts = paths[i];
    if (!parts) continue;
    for (const part of parts) {
      const isString = typeof part === 'string';
      const delimiter = stringPath.length > 0 && isString ? '.' : '';
      if (isString) {
        stringPath = `${stringPath}${delimiter}${part}`;
      } else {
        stringPath = `${stringPath}${delimiter}[${part}]`;
      }
    }
    stringPaths.push(stringPath);
  }

  return stringPaths;
};

export const firstLetterToUppercase = (value: string) =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

export const isValidHttpUrl = (url: any) => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

const sanitizeUrl = (url: any) => {
  if (url?.endsWith('/')) {
    url = url.slice(0, -1);
  }
  return url;
};

export const URL_REGEX =
  /^(https?:\/\/)?(?:w{1,3}\.)?((localhost|(\d{1,3}(\.\d{1,3}){3})|[^\s.]+\.[a-z]{2,})(?:\.[a-z]{2,})?)(:\d+)?(\/[^\s]*)?(?![^<]*(?:<\/\w+>|\/?>))$/;

export const validateBaseUrl = (url: any): string => {
  const sanitizedUrl = sanitizeUrl(url);

  if (sanitizedUrl && !URL_REGEX.test(sanitizedUrl)) {
    throw new Error('Given URL is not valid. Please enter a valid URL.');
  }

  return sanitizedUrl;
};

export const handleAxiosError = (error: any, axios: any) => {
  let errorMessage = '';

  if (error instanceof AggregateError) {
    errorMessage = 'Multiple errors occurred:\n';
    error.errors.forEach((err, index) => {
      errorMessage += `Error #${index + 1}: ${err.message}\n`;
    });
  } else if (axios.isAxiosError(error)) {
    if (error.response) {
      errorMessage = `Request failed with status code ${error.response.status}\n`;
      errorMessage += `Status text: ${error.response.statusText}\n`;
    } else if (error.request) {
      errorMessage = 'No response received from the server.\n';
    } else {
      errorMessage = `Axios error occurred: ${error.message}\n`;
    }
  } else if (error.code === 'ECONNREFUSED') {
    errorMessage = `Connection refused. Is the server running?\nDetails: ${error.message}\n`;
  } else if (error.code === 'ENOTFOUND') {
    errorMessage = `DNS resolution failed. Is the hostname correct?\nDetails: ${error.message}\n`;
  } else {
    errorMessage = `Unexpected error occurred: ${error.message}\n`;
    if (error.stack) {
      errorMessage += `Stack trace: ${error.stack}\n`;
    }
  }

  return errorMessage.trim();
};

export const isPlainObjectPredicate = (value: unknown): value is object => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isBinary = (type: ObjectPropertyType) =>
  type.schema?.type === 'string' && type.schema?.format === 'binary';

/**
 * Iterate all schemas that contain `$ref` key and pass them to {@link cb}, {@link cb} return value will replace current schema being iterated.
 * This method mutates the schema.
 * If you want to iterate over refs defined in an [annotation](https://json-schema.org/blog/posts/custom-annotations-will-continue#how-did-we-arrive-at-as-the-prefix-of-choice)
 * you can specify the annotation name through {@link refIdentifier} option which by default is `$ref`.
 */
export const iterateRefs = (
  schema: any,
  cb: (schema: any) => any,
  refIdentifier = '$ref',
) => {
  if (isPlainObjectPredicate(schema)) {
    if (typeof schema[refIdentifier] !== 'undefined') {
      return cb(schema);
    }

    for (const key of Object.keys(schema)) {
      schema[key] = iterateRefs(schema[key], cb, refIdentifier);
    }
  } else if (Array.isArray(schema)) {
    for (let i = 0; i < schema.length; i++) {
      schema[i] = iterateRefs(schema[i], cb, refIdentifier);
    }
  }

  return schema;
};

export const getContextData = (
  specs: Specification[] | Record<string, unknown>,
  collectTypesUnder?: Partial<Record<SpecificationType, string>>,
) => {
  const contextData = {} as Record<string, any>;

  if (Array.isArray(specs)) {
    specs.forEach((spec) => {
      const collected = collectTypesUnder?.[spec.type] || '';
      const context = spec.context || '';
      const path = [context, collected, spec.name].filter(Boolean).join('.');
      set(contextData, path, spec);
    });
    return contextData;
  }

  return specs;
};

export const toTypeDeclaration = (type: PropertyType, synchronous = true) => {
  const wrapInPromiseIfNeeded = (code: string) =>
    synchronous ? code : `Promise<${code}>`;
  switch (type.kind) {
    case 'plain':
      return type.value;
    case 'primitive':
      return wrapInPromiseIfNeeded(type.type);
    case 'void':
      return wrapInPromiseIfNeeded('void');
    case 'array':
      return wrapInPromiseIfNeeded(`${toTypeDeclaration(type.items)}[]`);
    case 'object':
      if (type.typeName && !isBinary(type)) {
        return wrapInPromiseIfNeeded(type.typeName);
      } else if (type.properties) {
        return wrapInPromiseIfNeeded(
          `{ ${type.properties
            .map(
              (prop) =>
                `'${prop.name}'${
                  prop.required === false ? '?' : ''
                }: ${toTypeDeclaration(prop.type)}`,
            )
            .join(';\n')} }`,
        );
      } else {
        return wrapInPromiseIfNeeded('any');
      }
    case 'function': {
      if (type.name) {
        return type.name;
      }
      const toArgument = (arg: PropertySpecification) =>
        `${arg.name}${arg.required === false ? '?' : ''}: ${toTypeDeclaration(
          arg.type,
        )}${arg.nullable === true ? ' | null' : ''}`;

      return `(${type.spec.arguments
        .map(toArgument)
        .join(', ')}) => ${toTypeDeclaration(
        type.spec.returnType,
        type.spec.synchronous === true,
      )}`;
    }
  }
};

export const getInstanceUrl = (instance = 'local') => {
  if (typeof INSTANCE_URL_MAP[instance] === 'undefined') {
    return instance;
  }

  let protocol = instance === 'local' ? 'http://' : 'https://';
  let instanceUrl = INSTANCE_URL_MAP[instance];

  if (typeof INSTANCE_URL_MAP[instance] === 'undefined') {
    protocol = 'http://';
    instanceUrl = INSTANCE_URL_MAP.local;
  }

  return `${protocol}${instanceUrl}`;
};
