import fs from 'fs';
import chalk from 'chalk';
import shell from 'shelljs';
import ts from 'typescript';
import * as TJS from 'typescript-json-schema';
import { SymbolRef } from 'typescript-json-schema';
import path from 'path';
import {
  DeployableRecord,
  DeployableTsTypeToName,
  DeployableTypeEntries,
  DeployableTypes,
  Deployment,
  getDeployableFileRevision,
  ParsedDeployableConfig,
} from './deployables';
import os from 'os';
import crypto from 'crypto';

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
  'axios'
];

export const getTSConfig = () => {
  const tsConfig = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
  if (tsConfig) {
    return ts.readConfigFile(tsConfig, ts.sys.readFile).config;
  }
  return {};
};

export const getTSBaseUrl = (config = getTSConfig()) => config.compilerOptions?.baseUrl || undefined;

interface SchemaDef {
  schema: Record<string, any>;
  typeParameterVariations?: Record<string, string>[];
}

const loadTsSourceFile = (filePath: string): ts.SourceFile => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return sourceFile;
};

export const getDependencies = (code: string, fileName: string, baseUrl: string | undefined) => {
  const importedLibraries = new Set<string>();

  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    noImplicitUseStrict: true,
    baseUrl,
  };

  const compilerHost = ts.createCompilerHost(compilerOptions);
  ts.transpileModule(code, {
    compilerOptions,
    transformers: {
      before: [
        (context) => {
          return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node => {
              if (ts.isImportDeclaration(node)) {
                const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;
                const resolvedModule = ts.resolveModuleName(moduleName, fileName, compilerOptions, compilerHost);

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
              }
              return node;
            };
            return ts.visitEachChild(sourceFile, visitor, context);
          };
        },
      ],
    },
  });

  let dependencies = Array.from(importedLibraries)
    .filter(library => !EXCLUDED_REQUIREMENTS.includes(library));

  if (dependencies.length) {
    let packageJson: any = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8');

    try {
      packageJson = JSON.parse(packageJson);
    } catch (error) {
      shell.echo(chalk.yellow('\nWarning:'), 'Failed to parse package.json file in order to read dependencies, there could be issues with some dependencies at the time of deploying the server function.');
    }

    const packageJsonDependencies = packageJson.dependencies || {};
    const packageJsonDevDependencies = packageJson.devDependencies || {};

    for (const dependency of dependencies) {
      if (packageJsonDependencies[dependency] || packageJsonDevDependencies[dependency]) {
        continue;
      }

      const dependencyParts = dependency.split('/');

      while (dependencyParts.length > 0) {
        dependencyParts.pop();

        const newDependencyPath = dependencyParts.join('/');

        if (packageJsonDependencies[newDependencyPath] || packageJsonDevDependencies[newDependencyPath]) {
          dependencies = dependencies.map(currentDependency => {
            if (currentDependency === dependency) {
              return dependencyParts.join('/');
            }

            return currentDependency;
          });
          break;
        }
      }
    }
  }

  return dependencies;
};

export const generateTypeSchemas = (fileName: string, baseUrl: string | undefined, ignoredTypeNames?: string[]): { [typeName: string]: any } => {
  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    lib: ['es2015'],
    baseUrl,
  };
  const sourceFile = loadTsSourceFile(fileName);
  const program = ts.createProgram(
    [fileName],
    compilerOptions,
  );
  const schemaDefs: { [typeName: string]: SchemaDef } = {};
  const settings: TJS.PartialArgs = {
    required: true,
    noExtraProps: true,
    ignoreErrors: true,
    strictNullChecks: true,
  };
  const generator = TJS.buildGenerator(program, settings);

  /**
   * This functions looks for the type declaration by priority and replaces the data in generator,
   * so the correct schema is generated.
   *
   * @param typeName
   * @param symbolRefs
   */
  const consolidateGeneratorSymbolType = (typeName: string, symbolRefs: SymbolRef[]) => {
    const tryConsolidationByFile = (fileName: string) => {
      const symbolRef = symbolRefs.find(symbolRef => {
        return symbolRef.symbol.declarations.some(declaration => declaration.getSourceFile().fileName.includes(fileName));
      });

      if (symbolRef) {
        const declaredType = program.getTypeChecker().getDeclaredTypeOfSymbol(symbolRef.symbol);
        if (declaredType) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore hack to replace the symbol with the preferred one
          generator.allSymbols[typeName] = declaredType;
          return true;
        }
      }

      return false;
    };

    if (tryConsolidationByFile(fileName)) {
      return;
    }

    tryConsolidationByFile('/node_modules/.poly/');
  };

  const isInnerFunctionNode = (node: ts.Node) => {
    let parent = node.parent;
    let insideBlock = false;
    while (parent) {
      if (parent.kind === ts.SyntaxKind.Block) {
        insideBlock = true;
      } else if (parent.kind === ts.SyntaxKind.FunctionDeclaration && insideBlock) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  };

  const visitor = (node: ts.Node) => {
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      // create a temporary combined type to get the schema for the union/intersection
      const combinedTypeName = 'CombinedTempType';
      const typeName = node.getText();
      if (ignoredTypeNames?.includes(typeName)) {
        return;
      }

      const tempSource = `type ${combinedTypeName} = ${typeName};`;
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `${crypto.randomBytes(16).toString('hex')}.ts`);
      fs.writeFileSync(tempFilePath, tempSource);

      try {
        const tempCombinedTypeProgram = ts.createProgram(
          [fileName, tempFilePath],
          compilerOptions,
        );

        let schema = TJS.generateSchema(tempCombinedTypeProgram, combinedTypeName, settings, undefined, TJS.buildGenerator(tempCombinedTypeProgram, settings));
        if (schema) {
          const hasVoidType = node.types.some(type => type.getText() === 'void');
          if (hasVoidType && ts.isUnionTypeNode(node)) {
            // Check if the union contains 'void' type and if so, add nullable type to the schema
            if (schema.anyOf) {
              schema.anyOf.push({ type: 'null' });
            } else {
              schema = {
                $schema: schema.$schema,
                anyOf: [
                  { ...schema, $schema: undefined },
                  { type: 'null' },
                ],
              };
            }
          }

          schemaDefs[typeName] = {
            schema,
            typeParameterVariations: [],
          };
        }
      } finally {
        fs.unlinkSync(tempFilePath);
      }
    }

    if (ts.isTypeReferenceNode(node) && !isInnerFunctionNode(node)) {
      const typeName = node.typeName.getText();

      if (ignoredTypeNames?.includes(typeName)) {
        return;
      }

      const symbolRefs = generator.getSymbols(typeName);
      const isGenericType = node.typeArguments?.length > 0;
      if (!symbolRefs.length) {
        // not a reference to a type
        return;
      }

      consolidateGeneratorSymbolType(typeName, symbolRefs);

      const typeParameterVariations = schemaDefs[typeName]?.typeParameterVariations || [];

      if (isGenericType) {
        const symbolRef = symbolRefs[0];
        const typeParameters = [];

        if (typeParameters.length === 0 && symbolRef) {
          // read type parameters from declaration
          symbolRef.symbol.declarations.forEach(declaration => {
            if (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration)) {
              if (declaration.parent && ts.isSourceFile(declaration.parent) && declaration.parent.hasNoDefaultLib) {
                // skipping, this is a default lib
                return;
              }
              typeParameters.push(...declaration.typeParameters?.map(typeParameter => typeParameter.name.text) || []);
            }
          });
        }

        if (typeParameters.length) {
          const parameterSchemaTypes: Record<string, string> = {};

          typeParameters.forEach((typeParameter, index) => {
            const typeArgument = node.typeArguments[index];
            if (typeArgument) {
              parameterSchemaTypes[typeParameter] = typeArgument.getText();
            }
          });

          typeParameterVariations.push(parameterSchemaTypes);
        }
      }

      const schema = schemaDefs[typeName]?.schema || TJS.generateSchema(program, typeName, settings, undefined, generator);
      if (schema) {
        schemaDefs[typeName] = {
          schema,
          typeParameterVariations,
        };
      }
    }

    ts.forEachChild(node, visitor);
  };

  ts.forEachChild(sourceFile, visitor);

  enhanceWithParameterTypeSchemas(schemaDefs);

  return extractSchemas(schemaDefs);
};

const enhanceWithParameterTypeSchemas = (schemaDefs: Record<string, SchemaDef>) => {
  Object.keys(schemaDefs)
    .forEach(typeName => {
      const schemaDef = schemaDefs[typeName];
      const typeVariations = schemaDef.typeParameterVariations;

      if (!typeVariations.length) {
        return;
      }
      typeVariations.forEach(typeVariation => {
        const typeParameters = Object.keys(typeVariation); // e.g. <T, S>
        if (!typeParameters.length) {
          return;
        }
        const parameterTypes = `${Object.values(typeVariation).join(', ')}`;
        const updatedDefinitions = {
          ...schemaDef.schema.definitions,
          ...typeParameters.reduce((acc, typeParameter) => {
            const typeParameterSchemaDef = schemaDefs[typeVariation[typeParameter]];

            return ({
              ...acc,
              ...typeParameterSchemaDef?.schema.definitions,
              [typeParameter]: {
                ...typeParameterSchemaDef?.schema,
                $schema: undefined,
                definitions: undefined,
              },
            });
          }, {}),
        };

        schemaDefs[`${typeName}<${parameterTypes}>`] = {
          schema: {
            ...schemaDef.schema,
            definitions: updatedDefinitions,
          },
        };
      });
    });
};

const extractSchemas = (schemaDefs: Record<string, SchemaDef>) => Object.keys(schemaDefs)
  .reduce((acc, typeName) => {
    return {
      ...acc,
      [typeName]: schemaDefs[typeName].schema,
    };
  }, {});

export const parseDeployComment = (comment: string): Deployment => {
  // Poly deployed @ 2024-08-29T22:46:46.791Z - test.weeklyReport - https://develop-k8s.polyapi.io/canopy/polyui/collections/server-functions/f0630f95-eac8-4c7d-9d23-639d39034bb6 - e3b0c44
  const match = comment.match(/^\s*(?:\/\/\s*)*Poly deployed @ (\S+) - (\S+)\.([^.]+) - (https?:\/\/[^/]+)\/\S+\/(\S+)s\/(\S+) - (\S+)$/);
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
    instance: instance.endsWith('localhost:3000') ? instance.replace(':3000', ':8000') : instance,
  };
};

type Ranges = Array<[start: number, end: number]>;

// Function to extract leading comments from the source file
const getDeployComments = (sourceFile: ts.SourceFile): [Deployment[], Ranges] => {
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
        ranges.push([range.pos, range.end + (range.hasTrailingNewLine ? 1 : 0)]);
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
    jsDocTags.description = firstJsDoc.comment ? ts.getTextOfJSDocComment(firstJsDoc.comment) : '';
    firstJsDoc.tags?.forEach(tag => {
      const tagName = tag.tagName.text;
      const tagComment = ts.getTextOfJSDocComment(tag.comment) || '';
      if (tagName === 'param' && ts.isJSDocParameterTag(tag)) {
        const paramDetails = tagComment.split(/[\s-]+/);
        const paramName = tag.name.getText();
        const paramType = tag.typeExpression?.getText().replace(/^{|}$/g, '') || '';
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

const parseTSTypes = (node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): any => {
  const params = node.parameters.map(param => {
    const name = param.name.getText(sourceFile);
    const type = param.type?.getText(sourceFile);
    if (!type) throw new Error(`Missing type for function argument '${name}' in file '${sourceFile.fileName}'.`);
    return {
      name,
      type,
      description: '',
    };
  });

  const type = node.type?.getText(sourceFile);
  if (!type) throw new Error(`Missing return type for function in file '${sourceFile.fileName}'. Use 'void' if no return type.`);
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
const getFunctionDetails = (sourceFile: ts.SourceFile, functionName: string) => {
  let functionDetails: null | Pick<DeployableRecord, 'types' | 'docStartIndex' | 'docEndIndex' | 'dirty'> = null;
  let dirty = false; // Dirty means that something needs fixed in the file
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === functionName) {
      const jsDoc = parseJSDoc(node);
      const types = parseTSTypes(node, sourceFile);
      if (
        jsDoc &&
        types.params.every((p, i) => p.type === jsDoc.params[i].type && p.name === jsDoc.params[i].name) &&
        types.returns.type === jsDoc.returns.type
      ) {
        // Try to preserve JSDoc descriptions if things haven't changed
        jsDoc.params.forEach((p, i) => {
          types.params[i].description = p.description;
        });
        types.returns.description = jsDoc.returns.description;
        types.description = jsDoc.description;
        dirty = types.params.some((p, i) => p.type !== jsDoc.params[i].type || p.name !== jsDoc.params[i].name);
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
  if (!functionDetails) throw new Error(`Failed to find a function named '${functionName}' within file '${sourceFile.fileName}'. Verify that your polyConfig name matches a valid function declared within the same file.`);
  return functionDetails;
};

const parseDeployableFunction = (sourceFile: ts.SourceFile, polyConfig: ParsedDeployableConfig, baseUrl: string, fileRevision: string, gitRevision: string): DeployableRecord => {
  const [deployments, deploymentCommentRanges] = getDeployComments(sourceFile);
  const functionDetails = getFunctionDetails(sourceFile, polyConfig.name);
  const dependencies = getDependencies(sourceFile.getFullText(), sourceFile.fileName, baseUrl);
  const typeSchemas = generateTypeSchemas(sourceFile.fileName, baseUrl, DeployableTypeEntries.map(d => d[0]));
  return {
    ...polyConfig,
    ...functionDetails,
    deployments,
    deploymentCommentRanges,
    dependencies,
    typeSchemas,
    fileRevision,
    gitRevision,
    file: sourceFile.fileName,
  };
};

const parseWebhook = (sourceFile: ts.SourceFile, polyConfig: ParsedDeployableConfig, baseUrl: string, fileRevision: string, gitRevision: string): DeployableRecord => {
  const [deployments] = getDeployComments(sourceFile);
  return {
    ...polyConfig,
    deployments,
    fileRevision,
    gitRevision,
    file: sourceFile.fileName,
  };
};

export const parseDeployable = async (filePath: string, baseUrl: string, gitRevision: string): Promise<[DeployableRecord, string]> => {
  const sourceFile = await loadTsSourceFile(filePath);

  const polyConfig = getPolyConfig(DeployableTypeEntries.map(e => e[0]), sourceFile);
  polyConfig.type = DeployableTsTypeToName[polyConfig.type];
  const fileContents = sourceFile.getFullText();
  const fileRevision = getDeployableFileRevision(fileContents);
  try {
    switch (polyConfig.type) {
      case 'server-function':
      case 'client-function':
        return [parseDeployableFunction(sourceFile, polyConfig, baseUrl, fileRevision, gitRevision), fileContents];
      case 'webhook':
        return [parseWebhook(sourceFile, polyConfig, baseUrl, fileRevision, gitRevision), fileContents];
    }
    throw new Error('Invalid Poly deployment with unsupported type');
  } catch (err) {
    console.error(`Prepared ${polyConfig.type.replaceAll('-', ' ')} ${polyConfig.context}.${polyConfig.name}: ERROR`);
    console.error(err);
  }
};
