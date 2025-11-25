import fs from 'fs';
import chalk from 'chalk';
import shell from 'shelljs';
import ts from 'typescript';
import path from 'path';
import { createGenerator } from 'ts-json-schema-generator';
import { toPascalCase } from '@guanghechen/helper-string';
import {
  DeployableRecord,
  DeployableTsTypeToName,
  DeployableTypeEntries,
  DeployableTypes,
  Deployment,
  getDeployableFileRevision,
  ParsedDeployableConfig,
} from './deployables';
import { getCachedSpecs, getPolyLibPath, writeCachedSpecs } from './utils';
import { DEFAULT_POLY_PATH } from './constants';
import { Specification } from './types';
import { getSpecs } from './api';

// NodeJS built-in libraries + polyapi
// https://www.w3schools.com/nodejs/ref_modules.asp
const EXCLUDED_REQUIREMENTS = [
  // Node.js
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'domain', // deprecated
  'events',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'punycode', // deprecated
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'zlib',

  // PolyAPI
  'polyapi',

  // 3rd Party
  'axios',
];

export const getTSConfig = () => {
  const tsConfig = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
  if (tsConfig) {
    return ts.readConfigFile(tsConfig, ts.sys.readFile).config;
  }
  return {};
};

export const getTSBaseUrl = (config = getTSConfig()) =>
  config.compilerOptions?.baseUrl || undefined;

const loadTsSourceFile = (filePath: string): ts.SourceFile => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return sourceFile;
};

let fetchedSpecs = false;

type InternalDependencyReference = {
  id: string;
  path: string;
  tenantName?: string;
  environmentName?: string;
}

export const getDependencies = async (
  code: string,
  fileName: string,
  baseUrl: string | undefined,
  ignoreDependencies?: boolean,
): Promise<[external: undefined | Record<string, string>, internal: undefined | Record<string, InternalDependencyReference[]>]> => {
  const importedLibraries = new Set<string>();
  const internalReferences = new Set<string>();
  let polyImportIdentifier: string | null = null;
  let variImportIdentifier: string | null = null;
  let tabiImportIdentifier: string | null = null;
  let schemasImportIdentifier = 'schemas.';
  const otherImportIdentifiers: string[] = [];
  let lookForInternalDependencies = false;
  // Users can alias references to parts of the poly tree by assigning to a variable
  // So this map holds those references 
  const aliasMap = new Map<string, string>();

  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    noImplicitUseStrict: true,
    baseUrl,
  };


  // Helper to extract dotted path
  const getPropertyPath = (expr: ts.PropertyAccessExpression): string => {
    const parts: string[] = [];
    let current: ts.Expression = expr;
    while (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = current.expression;
    }
    if (ts.isIdentifier(current)) {
      parts.unshift(current.text);
    }
    return parts.join('.');
  }

  const unwrapExpression = (expr: ts.Expression): ts.Expression => {
    while (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isTypeAssertionExpression(expr)
    ) {
      expr = expr.expression;
    }
    return expr;
  }

  const flattenTypeName = (name: ts.EntityName): string => {
    const parts: string[] = [];
    const recurse = (n: ts.EntityName): void => {
      if (ts.isQualifiedName(n)) {
        recurse(n.left);
        parts.push(n.right.text);
      } else {
        parts.push(n.text);
      }
    }
    recurse(name);
    return parts.join('.');
  }

  const VariMethods = /\.(?:(?:get)|(?:update)|(?:onUpdate)|(?:inject))$/;
  const TabiMethods = /\.(?:(?:count)|(?:selectMany)|(?:selectOne)|(?:insertMany)|(?:insertOne)|(?:upsertMany)|(?:upsertOne)|(?:updateMany)|(?:updateOne)|(?:deleteMany)|(?:deleteOne))$/;

  const compilerHost = ts.createCompilerHost(compilerOptions);
  ts.transpileModule(code, {
    compilerOptions,
    transformers: {
      before: [
        (context) => {
          return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node => {
              // Pull out external dependencies
              if (ts.isImportDeclaration(node)) {
                const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;

                // Capture poly imports
                if (moduleName === "polyapi" && node.importClause) {
                  // Get name of polyapi default import if defined
                  if (node.importClause.name) {
                    polyImportIdentifier = `${node.importClause.name.text}.`;
                    lookForInternalDependencies = true;
                  }

                  // Look for any other named imports (like vari, tabi, schemas, and other top-level namespaces (like OOB, etc))
                  if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                    for (const element of node.importClause.namedBindings.elements) {
                      const imported = element.propertyName ? element.propertyName.text : element.name.text;
                      const local = element.name.text;

                      if (imported === "vari") {
                        variImportIdentifier = `${local}.`;
                        lookForInternalDependencies = true;
                      } else if (imported === "tabi") {
                        tabiImportIdentifier = `${local}.`;
                        lookForInternalDependencies = true;
                      } else if (imported === "schemas") {
                        schemasImportIdentifier = `${local}.`;
                        lookForInternalDependencies = true;
                      } else if (local !== 'polyCustom') {
                        otherImportIdentifiers.push(`${local}.`);
                        lookForInternalDependencies = true;
                      }
                    }
                  }
                }

                const resolvedModule = ts.resolveModuleName(
                  moduleName,
                  fileName,
                  compilerOptions,
                  compilerHost,
                );

                if (resolvedModule.resolvedModule) {
                  if (resolvedModule.resolvedModule.isExternalLibraryImport) {
                    importedLibraries.add(moduleName);
                  }
                } else {
                  // Handle unresolved modules (fallback)
                  if (!moduleName.startsWith('.')) {
                    importedLibraries.add(moduleName);
                  }
                }
                return node;
              }


              // Pull out internal dependencies
              if (lookForInternalDependencies) {
                // Track assignments of poly imports to follow aliases
                if (ts.isVariableDeclaration(node) && node.initializer) {
                  const initializer = unwrapExpression(node.initializer);
                  // Simple variable assignments (aliases), ex. `const OOB = polyapi.OOB;`
                  if (ts.isIdentifier(node.name) && ts.isPropertyAccessExpression(initializer)) {
                    const path = getPropertyPath(initializer);

                    if (
                      // Capture poly reference aliases
                      (polyImportIdentifier && path.startsWith(polyImportIdentifier)) ||
                      // Capture vari reference aliases
                      (variImportIdentifier && path.startsWith(variImportIdentifier)) ||
                      // Capture tabi reference aliases
                      (tabiImportIdentifier && path.startsWith(tabiImportIdentifier)) ||
                      // Capture other top-level namespace reference aliases
                      (otherImportIdentifiers.length && otherImportIdentifiers.some(other => path.startsWith(other)))
                    ) {
                      if (node.name && ts.isIdentifier(node.name)) {
                        aliasMap.set(node.name.text, path);
                        return node; // Don't recurse into assignment, just move on
                      }
                    }
                  }
                  // Destructuring assignments (aliases), ex. `const { OOB } = polyapi;`
                  else if (ts.isObjectBindingPattern(node.name)) {
                    let basePath: string | undefined;
                    if (ts.isPropertyAccessExpression(initializer)) {
                      basePath = getPropertyPath(initializer);
                    } else if (ts.isIdentifier(initializer)) {
                      basePath = initializer.text;
                    }
                    if (!basePath) return node;

                    for (const element of node.name.elements) {
                      if (!ts.isBindingElement(element)) continue;

                      // Handle `propertyName: alias` and shorthand `{ prop }`
                      const propName = element.propertyName
                        ? element.propertyName.getText()
                        : element.name.getText();
                      const localName = element.name.getText();
                      let path = `${basePath}.${propName}`;
                      const root = path.split('.')[0];
                      // Check for alias to handle case where we're destructuring something from an aliased import
                      if (aliasMap.has(root)) {
                        const aliasBase = aliasMap.get(root);
                        path = aliasBase.split(".").concat(path.split('.').slice(1)).join('.');
                      }
                      if (
                        (polyImportIdentifier && path.startsWith(polyImportIdentifier)) ||
                        (variImportIdentifier && path.startsWith(variImportIdentifier)) ||
                        (tabiImportIdentifier && path.startsWith(tabiImportIdentifier)) ||
                        (otherImportIdentifiers.length && otherImportIdentifiers.some(other => path.startsWith(other)))
                      ) {
                        aliasMap.set(localName, path);
                      }
                    }
                    return node;
                  }
                }
                // Look for use of imported poly dep!
                else if (ts.isPropertyAccessExpression(node) && !ts.isPropertyAccessExpression(node.parent)) {
                  let path = getPropertyPath(node);
                  const root = path.split('.')[0];
                  // If root is an alias, substitute
                  if (aliasMap.has(root)) {
                    const aliasBase = aliasMap.get(root)!;
                    path = aliasBase.split(".").concat(path.split('.').slice(1)).join('.');
                  }
                  // Capture poly references (all function types, webhooks, and subscriptions)
                  if (polyImportIdentifier && path.startsWith(polyImportIdentifier)) {
                    internalReferences.add(path);
                  }
                  // Capture vari references
                  else if (variImportIdentifier && path.startsWith(variImportIdentifier)) {
                    internalReferences.add(path.replace(VariMethods, ''));
                  }
                  // Capture tabi references
                  else if (tabiImportIdentifier && path.startsWith(tabiImportIdentifier)) {
                    internalReferences.add(path.replace(TabiMethods, ''));
                  }
                  // Capture other top-level namespace references
                  else if (otherImportIdentifiers.length) {
                    const match = otherImportIdentifiers.find(other => path.startsWith(other));
                    if (match) internalReferences.add(path);
                  }
                }
              }

              // Capture type references
              if (schemasImportIdentifier && ts.isTypeReferenceNode(node)) {
                const path = flattenTypeName(node.typeName);
                if (path.startsWith(schemasImportIdentifier)) {
                  internalReferences.add(path);
                  return node;
                }
              }

              return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitEachChild(sourceFile, visitor, context);
          };
        },
      ],
    },
  });

  const dependencies = Array.from(importedLibraries).filter(
    (library) => !EXCLUDED_REQUIREMENTS.includes(library),
  );
  const externalDependencies: Record<string, string> = {};
  const internalDependencies: Record<string, InternalDependencyReference[]> = {};

  // Finalize any external dependencies
  if (dependencies.length) {
    let packageJson: any = {};
    try {
      // Read dependency versions from package.json
      packageJson = fs.readFileSync(
        path.join(process.cwd(), 'package.json'),
        'utf-8',
      );
      packageJson = JSON.parse(packageJson);
    } catch (error) {
      if (!ignoreDependencies)
        shell.echo(
          chalk.yellow('\nWarning:'),
          'Failed to parse package.json file in order to read dependencies, there could be issues with some dependencies at the time of deploying the server function. Rerun command with \'--ignore-dependencies\' to skip parsing dependencies.',
        );
    }

    const packageJsonDependencies = packageJson.dependencies || {};
    const packageJsonDevDependencies = packageJson.devDependencies || {};

    for (const dependency of dependencies) {
      let dependencyName = dependency;
      let version = packageJsonDependencies[dependencyName] || packageJsonDevDependencies[dependencyName];
      if (version) {
        externalDependencies[dependency] = version;
        continue;
      }

      const dependencyParts = dependency.split('/');

      while (dependencyParts.length > 0) {
        dependencyParts.pop();

        dependencyName = dependencyParts.join('/');
        version = packageJsonDependencies[dependencyName] || packageJsonDevDependencies[dependencyName];

        if (version) {
          externalDependencies[dependencyName] = version;
          break;
        }
      }
      if (!dependencyName) {
        externalDependencies[dependency] = 'latest';
      }
    }
  }

  // Finalize any internal dependencies
  if (internalReferences.size) {
    // Find each reference in the specs
    // Group internal references by type in a map from contextName to id
    const libPath = getPolyLibPath(DEFAULT_POLY_PATH);
    let specs = getCachedSpecs(libPath);
    const found: Specification[] = [];
    let missing: string[] = [];

    const findReferencedSpecs = (toFind: string[] | Set<string>) => {
      for (let path of toFind) {
        let type;
        if (path.startsWith(polyImportIdentifier)) {
          path = path.replace(polyImportIdentifier, '');
        } else if (path.startsWith(variImportIdentifier)) {
          type = "serverVariable";
          path = path.replace(variImportIdentifier, '');
        } else if (path.startsWith(tabiImportIdentifier)) {
          type = "table";
          path = path.replace(tabiImportIdentifier, '');
        } else if (path.startsWith(schemasImportIdentifier)) {
          type = "schema";
          path = path.replace(schemasImportIdentifier, '');
        }
        const spec = specs.find(s => {
          if (type) {
            if (type !== s.type) return false;
          } else if (['serverVariable', 'table', 'schema'].includes(s.type)) return false;
          if (s.type === 'schema') {
            // Schema names are munged too much to just compare by lowercase
            return s.contextName.split('.').map(s => toPascalCase(s)).join('.') === path;
          }
          return s.contextName.toLowerCase() === path.toLowerCase();
        });
        if (spec) {
          found.push(spec);
          let type: string = spec.type;
          const dep = { path: spec.contextName, id: spec.id };
          if (
            spec.visibilityMetadata.visibility === 'PUBLIC' &&
            ['apiFunction', 'customFunction', 'serverFunction'].includes(type)
          ) {
            type = `public${type.substring(0, 1).toUpperCase()}${type.substring(1)}`;
            dep['tenantName'] = spec.visibilityMetadata.foreignTenantName;
            dep['environmentName'] = spec.visibilityMetadata.foreignEnvironmentName;
          }
          internalDependencies[type] = internalDependencies[type] || [];
          internalDependencies[type].push(dep);
        } else {
          missing.push(path);
        }
      }
    }
    findReferencedSpecs(internalReferences);
    if (missing.length && !fetchedSpecs) {
      // In case user generated the library with only a subset of the specs needed, grab them fresh from the api and try again
      specs = await getSpecs();
      writeCachedSpecs(libPath, specs);
      fetchedSpecs = true;
      const toFind = missing;
      missing = [];
      findReferencedSpecs(toFind);
    }

    if (missing.length && !ignoreDependencies) {
      throw new Error(`Cannot resolve all poly resources referenced within function.\n\nMissing:\n${missing.map(n => `  '${n}'`).join('\n')}\n\nRerun command with '--ignore-dependencies' to skip resolving dependencies.`)
    }
  }

  return [dependencies.length ? externalDependencies : undefined, internalReferences.size ? internalDependencies : undefined];
};

export const parseDeployComment = (comment: string): Deployment => {
  // Poly deployed @ 2024-08-29T22:46:46.791Z - test.weeklyReport - https://develop-k8s.polyapi.io/canopy/polyui/collections/server-functions/f0630f95-eac8-4c7d-9d23-639d39034bb6 - e3b0c44
  const match = comment.match(
    /^\s*(?:\/\/\s*)*Poly deployed @ (\S+) - (\S+)\.([^.]+) - (https?:\/\/[^/]+)\/\S+\/(\S+)s\/(\S+) - (\S+)$/,
  );
  if (!match) return null;
  const [, deployed, context, name, instance, type, id, fileRevision] = match;
  return {
    name,
    context,
    type: type as DeployableTypes,
    id,
    deployed,
    fileRevision,
    // Local development puts canopy on a different port than the poly-server
    instance: instance.endsWith('localhost:3000')
      ? instance.replace(':3000', ':8000')
      : instance,
  };
};

type Ranges = Array<[start: number, end: number]>;

// Function to extract leading comments from the source file
const getDeployComments = (
  sourceFile: ts.SourceFile,
): [Deployment[], Ranges] => {
  const text = sourceFile.getFullText();
  const matches: Deployment[] = [];
  const ranges = [] as Ranges;
  const leadingRanges = ts.getLeadingCommentRanges(text, 0);
  if (leadingRanges) {
    for (const range of leadingRanges) {
      const comment = text.substring(range.pos, range.end);
      const match = parseDeployComment(comment.trim());
      if (match) {
        matches.push(match);
        ranges.push([
          range.pos,
          range.end + (range.hasTrailingNewLine ? 1 : 0),
        ]);
      }
    }
  }
  return [matches, ranges];
};

// Function to extract the PolyServerFunction config
const getPolyConfig = (types: string[], sourceFile: ts.SourceFile): any => {
  let config: any = null;

  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      const name = declaration.name.getText(sourceFile);
      const type = declaration.type?.getText(sourceFile);
      if (name === 'polyConfig' && type && types.includes(type)) {
        const initializer = node.declarationList.declarations[0].initializer;
        if (initializer && ts.isObjectLiteralExpression(initializer)) {
          // eval() is generally considered harmful
          // but since we're running entirely client side on user-provided code
          // and since these configs are type-safe we're going to allow it
          // eslint-disable-next-line no-eval
          config = eval(`(${initializer.getText()})`);
          config.type = type;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const { name, context, type, description, ...other } = config;
  if (!name) throw new Error("polyConfig is missing 'name'.");
  if (!context) throw new Error("polyConfig is missing 'context'.");
  return { name, context, type, description, config: other };
};

// Helper function to parse JSDoc tags into an object
const parseJSDoc = (node: ts.FunctionDeclaration): any => {
  let jsDocTags: any = null;

  const jsDoc = node.getChildren().filter(ts.isJSDoc);
  if (jsDoc.length > 0) {
    jsDocTags = {
      description: '',
      params: [],
      returns: {
        type: 'void',
        description: '',
      },
    };
    const firstJsDoc = jsDoc[0];
    jsDocTags.description = firstJsDoc.comment
      ? ts.getTextOfJSDocComment(firstJsDoc.comment)
      : '';
    firstJsDoc.tags?.forEach((tag) => {
      const tagName = tag.tagName.text;
      const tagComment = ts.getTextOfJSDocComment(tag.comment) || '';
      if (tagName === 'param' && ts.isJSDocParameterTag(tag)) {
        const paramDetails = tagComment.split(/[\s-]+/);
        const paramName = tag.name.getText();
        const paramType =
          tag.typeExpression?.getText().replace(/^{|}$/g, '') || '';
        const paramDescription = paramDetails.join(' ').trim();

        jsDocTags.params.push({
          name: paramName,
          type: paramType,
          description: paramDescription,
        });
      } else if (tagName === 'returns' && ts.isJSDocReturnTag(tag)) {
        jsDocTags.returns = {
          type: tag.typeExpression?.getText().replace(/^{|}$/g, '') || '',
          description: tagComment.trim(),
        };
      } else {
        jsDocTags[tagName] = tagComment.trim();
      }
    });
  }

  return jsDocTags;
};

const parseTSTypes = (
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): any => {
  const params = node.parameters.map((param) => {
    const name = param.name.getText(sourceFile);
    const type = param.type?.getText(sourceFile);
    if (!type) {
      throw new Error(
        `Missing type for function argument '${name}' in file '${sourceFile.fileName}'.`,
      );
    }
    return {
      name,
      type,
      description: '',
    };
  });

  const type = node.type?.getText(sourceFile);
  if (!type) {
    throw new Error(
      `Missing return type for function in file '${sourceFile.fileName}'. Use 'void' if no return type.`,
    );
  }
  const returns = {
    type,
    description: '',
  };
  return {
    params,
    returns,
    description: '',
  };
};

// Function to extract function details including JSDoc, arguments, and return type
const getFunctionDetails = (
  sourceFile: ts.SourceFile,
  functionName: string,
) => {
  let functionDetails: null | Pick<
    DeployableRecord,
    'types' | 'docStartIndex' | 'docEndIndex' | 'dirty'
  > = null;
  let dirty = false; // Dirty means that something needs fixed in the file
  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.getText(sourceFile) === functionName
    ) {
      const jsDoc = parseJSDoc(node);
      const types = parseTSTypes(node, sourceFile);
      if (
        jsDoc &&
        types.params.length === jsDoc.params.length &&
        types.params.every(
          (p, i) =>
            p.type === jsDoc.params[i].type && p.name === jsDoc.params[i].name,
        ) &&
        types.returns.type === jsDoc.returns.type
      ) {
        // Try to preserve JSDoc descriptions if things haven't changed
        jsDoc.params.forEach((p, i) => {
          types.params[i].description = p.description;
        });
        types.returns.description = jsDoc.returns.description;
        types.description = jsDoc.description;
        dirty = types.params.some(
          (p, i) =>
            p.type !== jsDoc.params[i].type || p.name !== jsDoc.params[i].name,
        );
      } else {
        dirty = true;
      }

      const docStartIndex = node.getStart(sourceFile, true);
      const docEndIndex = node.getStart(sourceFile, false);

      functionDetails = {
        types,
        docStartIndex,
        docEndIndex,
        dirty,
      };
    } else {
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);
  if (!functionDetails) {
    throw new Error(
      `Failed to find a function named '${functionName}' within file '${sourceFile.fileName}'. Verify that your polyConfig name matches a valid function declared within the same file.`,
    );
  }
  return functionDetails;
};

const parseDeployableFunction = async (
  sourceFile: ts.SourceFile,
  polyConfig: ParsedDeployableConfig,
  baseUrl: string,
  fileRevision: string,
  gitRevision: string,
): Promise<DeployableRecord> => {
  const [deployments, deploymentCommentRanges] = getDeployComments(sourceFile);
  const functionDetails = getFunctionDetails(sourceFile, polyConfig.name);
  if (polyConfig.description) {
    if (polyConfig.description !== functionDetails.types.description) {
      functionDetails.types.description = polyConfig.description;
      functionDetails.dirty = true;
    }
  } else {
    polyConfig.description = functionDetails.types.description || '';
  }
  const [externalDependencies, internalDependencies] = await getDependencies(sourceFile.getFullText(), sourceFile.fileName, baseUrl);
  const referencedSchemas = internalDependencies && "schema" in internalDependencies
    ? Object.fromEntries(internalDependencies.schema.map(schema => [
      `schemas.${schema.path.split('.').map(s => toPascalCase(s)).join('.')}`,
      { 'x-poly-ref': { path: schema.path } }
    ]))
    : null;
  const typeSchemas = generateTypeSchemas(sourceFile.fileName, DeployableTypeEntries.map(d => d[0]), polyConfig.name, referencedSchemas);
  return {
    ...polyConfig,
    ...functionDetails,
    deployments,
    deploymentCommentRanges,
    externalDependencies,
    internalDependencies,
    typeSchemas,
    fileRevision,
    gitRevision,
    file: sourceFile.fileName,
  };
};

const parseWebhook = (
  sourceFile: ts.SourceFile,
  polyConfig: ParsedDeployableConfig,
  baseUrl: string,
  fileRevision: string,
  gitRevision: string,
): DeployableRecord => {
  const [deployments] = getDeployComments(sourceFile);
  return {
    ...polyConfig,
    deployments,
    fileRevision,
    gitRevision,
    file: sourceFile.fileName,
  };
};

export const parseDeployable = async (
  filePath: string,
  baseUrl: string,
  gitRevision: string,
): Promise<[DeployableRecord, string]> => {
  const sourceFile = await loadTsSourceFile(filePath);

  const polyConfig = getPolyConfig(
    DeployableTypeEntries.map((e) => e[0]),
    sourceFile,
  );
  polyConfig.type = DeployableTsTypeToName[polyConfig.type];
  const fileContents = sourceFile.getFullText();
  const fileRevision = getDeployableFileRevision(fileContents);
  try {
    switch (polyConfig.type) {
      case 'server-function':
      case 'client-function':
        return [
          await parseDeployableFunction(
            sourceFile,
            polyConfig,
            baseUrl,
            fileRevision,
            gitRevision,
          ),
          fileContents,
        ];
      case 'webhook':
        return [
          parseWebhook(
            sourceFile,
            polyConfig,
            baseUrl,
            fileRevision,
            gitRevision,
          ),
          fileContents,
        ];
    }
    throw new Error('Invalid Poly deployment with unsupported type');
  } catch (e) {
    shell.echo(chalk.redBright(
      `Prepared ${polyConfig.type.replaceAll('-', ' ')} ${polyConfig.context}.${polyConfig.name
      }: ERROR`,
    ));
    shell.echo(chalk.red((e instanceof Error ? e.message : e.response?.data?.message) || 'Unexpected error.'));
  }
};

const dereferenceSchema = (obj: any, definitions: any, visited: Set<string> = new Set()): any => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => dereferenceSchema(item, definitions, visited));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string') {
      const match = value.match(/^#\/definitions\/(.+)$/);
      if (match) {
        const defName = match[1];

        // Prevent infinite recursion
        if (visited.has(defName)) {
          return { $ref: value };
        }

        const definition = definitions[defName];
        if (definition) {
          // Inspired by old flattenDefinitions logic: Check if this looks like a "real" type 
          // vs a utility type by examining the definition structure
          const shouldInline = isInlineableDefinition(definition, defName);

          if (shouldInline) {
            // Inline the definition
            visited.add(defName);
            const { definitions: _, ...inlinedDef } = definition;
            const result = dereferenceSchema(inlinedDef, definitions, visited);
            visited.delete(defName);
            return result;
          } else {
            // Keep as reference (utility types, complex mapped types, etc.)
            return { $ref: value };
          }
        }
      }
      return { $ref: value };
    } else {
      result[key] = dereferenceSchema(value, definitions, visited);
    }
  }

  return result;
};

const isInlineableDefinition = (definition: any, defName: string): boolean => {
  const decodedDefName = decodeURIComponent(defName);

  // If it has "real" object properties, it's probably a real interface that should be inlined
  if (definition.type === 'object' && definition.properties &&
    Object.keys(definition.properties).length > 0) {
    return true;
  }

  // If it has array items with concrete structure, inline it
  if (definition.type === 'array' && definition.items &&
    typeof definition.items === 'object' && definition.items.type) {
    return true;
  }

  // If it's a simple type (string, number, boolean), inline it
  if (['string', 'number', 'boolean', 'integer'].includes(definition.type)) {
    return true;
  }

  // If it has enum values, it's a real type, inline it
  if (definition.enum && definition.enum.length > 0) {
    return true;
  }

  // If it's a union/intersection of concrete types, inline it
  if ((definition.anyOf || definition.allOf) && !decodedDefName.includes('<')) {
    return true;
  }

  // Keep as reference if it looks like a utility type (contains < > or other TypeScript operators)
  if (decodedDefName.includes('<') || decodedDefName.includes('>') ||
    decodedDefName.includes('|') || decodedDefName.includes('&')) {
    return false;
  }

  // If we can't determine, err on the side of inlining for "normal" looking names
  return !/[<>%|&]/.test(decodedDefName);
};

const dereferenceRoot = (schema: any): any => {
  if (!schema || !schema.definitions) return schema;

  // If schema has a root $ref, dereference it first
  let rootSchema = schema;
  if (schema.$ref) {
    const match = schema.$ref.match(/^#\/definitions\/(.+)$/);
    if (match) {
      const defName = match[1];
      const root = schema.definitions[defName];
      if (root) {
        const { definitions, $schema, $ref, ...rest } = schema;
        rootSchema = {
          ...root,
          definitions,
          $schema,
          ...rest,
        };
      }
    }
  }

  // Now recursively dereference based on intelligent heuristics
  const { definitions, $schema, ...rest } = rootSchema;
  const dereferencedRest = dereferenceSchema(rest, definitions);

  // Collect remaining references that weren't inlined
  const filteredDefinitions: any = {};
  const findReferences = (obj: any, visited: Set<string> = new Set()): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(item => findReferences(item, visited));
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        const match = value.match(/^#\/definitions\/(.+)$/);
        if (match) {
          const encodedDefName = match[1];
          const decodedDefName = decodeURIComponent(encodedDefName);

          // Try both encoded and decoded versions
          const actualDefName = definitions[encodedDefName] ? encodedDefName :
            definitions[decodedDefName] ? decodedDefName : null;

          if (actualDefName && !visited.has(actualDefName)) {
            visited.add(actualDefName);
            filteredDefinitions[actualDefName] = definitions[actualDefName];
            // Also recursively find references within this definition
            findReferences(definitions[actualDefName], visited);
          }
        }
      } else {
        findReferences(value, visited);
      }
    }
  };

  findReferences(dereferencedRest);

  return {
    ...dereferencedRest,
    ...(Object.keys(filteredDefinitions).length > 0 && { definitions: filteredDefinitions }),
    $schema,
  };
};

export const extractTypesFromAST = (filePath: string, functionName: string): string[] => {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) throw new Error(`Could not load file: ${filePath}`);

  const extractedTypes: Set<string> = new Set();

  const extractFromTypeNode = (typeNode: ts.TypeNode) => {
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeName = typeNode.typeName.getText(sourceFile);

      // Skip primitive and built-in types
      const primitives = ['Promise', 'Array', 'Record', 'string', 'number', 'boolean', 'void', 'any', 'unknown', 'object', 'undefined', 'null'];
      if (!primitives.includes(typeName)) {
        extractedTypes.add(typeName);
      }

      // Extract type arguments from generics (like Promise<T> -> extract T)
      if (typeNode.typeArguments) {
        for (const typeArg of typeNode.typeArguments) {
          extractFromTypeNode(typeArg);
        }
      }
    } else if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
      // Handle union/intersection types
      for (const type of typeNode.types) {
        extractFromTypeNode(type);
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      // Extract types from parameters
      for (const param of node.parameters) {
        if (param.type) {
          extractFromTypeNode(param.type);
        }
      }

      // Extract types from return type
      if (node.type) {
        extractFromTypeNode(node.type);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return Array.from(extractedTypes);
};

export const generateTypeSchemas = (
  filePath: string,
  ignoredTypeNames: string[] = [],
  functionName?: string,
  referencedSchemas: Record<string, any> | null = null,
): Record<string, any> => {
  const tsconfigPath = path.resolve('tsconfig.json');
  // Use provided function name or default to filename
  const actualFunctionName = functionName || path.basename(filePath, '.ts');

  // FIXED: Use AST-based type extraction instead of string manipulation
  const extractedTypes = extractTypesFromAST(filePath, actualFunctionName);

  // Filter ignored types
  const typeNames = extractedTypes.filter(typeName =>
    !ignoredTypeNames.includes(typeName)
  );

  const output: Record<string, any> = {};

  for (const typeName of typeNames) {
    if (ignoredTypeNames.includes(typeName)) continue;
    if (referencedSchemas[typeName]) {
      output[typeName] = referencedSchemas[typeName];
      continue;
    }

    try {
      const generator = createGenerator({
        path: filePath,
        tsconfig: tsconfigPath,
        type: typeName,
        expose: 'all',
        topRef: true,
        skipTypeCheck: true,
      });

      const schema = generator.createSchema(typeName);
      output[typeName] = dereferenceRoot(schema);
    } catch (err: any) {
      if (!/No root type.*found/.test(err.message)) {
        console.warn(`⚠️ Error generating schema for "${typeName}":`, err.message);
      }
    }
  }

  return output;
};
