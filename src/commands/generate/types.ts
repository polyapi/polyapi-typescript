import fs from 'fs';
import handlebars from 'handlebars';
import { toCamelCase, toPascalCase } from '@guanghechen/helper-string';
import { compile } from 'json-schema-to-typescript';
import * as ts from 'typescript';

import {
  FunctionPropertyType,
  ObjectPropertyType,
  PropertySpecification,
  SchemaRef,
  SchemaSpecification,
  Specification,
  SpecificationWithFunction,
  SpecificationWithVariable,
  ServerFunctionSpecification,
  FunctionSpecification,
} from '../../types';
import {
  getContextData,
  getStringPaths,
  prettyPrint,
  loadTemplate,
  GenerationError,
  echoGenerationError,
  isPlainObjectPredicate,
  isBinary,
  iterateRefs,
  toTypeDeclaration,
} from '../../utils';

interface Context {
  name: string;
  path: string;
  interfaceName: string;
  fileName?: string;
  level?: number;
}

let generationErrors = false;

export const setGenerationErrors = (value: boolean) => {
  generationErrors = value;
};

export const getGenerationErrors = () => generationErrors;

const schemaToDeclarations = async (
  namespace: string,
  typeName: string,
  schema: Record<string, any>,
  value?: any | undefined,
  options: {
    unknownAny: boolean;
  } = {
    unknownAny: true,
  },
) => {
  const wrapToNamespace = (code: string) =>
    `namespace ${namespace} {\n  ${code}\n}`;

  const appendPathUnionType = (code: string, value: any) => {
    if (Array.isArray(value) || isPlainObjectPredicate(value)) {
      const unionPath = getStringPaths(value).map((value) => `'${value}'`);
      // If the value is an empty array or object we naturally can't get any property paths
      // So we fallback to an empty string as the type
      const pathValue = unionPath.join(' | ') || "''";
      return `${code}\nexport type PathValue = ${pathValue}`;
    }

    return code;
  };

  const typeNameContextDelimiter = '$$$';

  schema.title = typeName;
  let result = await compile(schema, typeName, {
    format: false,
    bannerComment: '',
    ignoreMinAndMaxItems: true,
    unknownAny: options.unknownAny,
    customName(innerSchema, keyNameFromDefinition) {
      const ref = innerSchema['x-poly-ref'] as
        // eslint-disable-next-line @typescript-eslint/naming-convention
        | (SchemaRef & { 'x-unresolved'?: true })
        | undefined;

      if (ref !== null && typeof ref === 'object' && !Array.isArray(ref)) {
        const schemaTypeNameParts = ['$PolySchema'];

        if (['Argument', 'ReturnType'].includes(innerSchema.title)) {
          schemaTypeNameParts.push(`$${innerSchema.title}`);
        } else {
          schemaTypeNameParts.push('___');
        }

        if (ref.publicNamespace) {
          schemaTypeNameParts.push('$Public');
        } else {
          schemaTypeNameParts.push('___');
        }

        if (ref['x-unresolved']) {
          schemaTypeNameParts.push('$Unresolved');
        } else {
          schemaTypeNameParts.push('$Resolved');
        }

        if (ref.publicNamespace) {
          schemaTypeNameParts.push(ref.publicNamespace, ...ref.path.split('.'));
        } else {
          schemaTypeNameParts.push(...ref.path.split('.'));
        }

        return schemaTypeNameParts.join(typeNameContextDelimiter);
      }

      return keyNameFromDefinition;
    },
  });

  const sourceFile = ts.createSourceFile(
    'x.ts',
    result,
    ts.ScriptTarget.Latest,
  );

  const polySchemaTypeReferenceSet = new Set(); // used to dedupe references to same schema
  const polySchemaTypeReferenceList: {
    name: string;
    path: string;
    replacement: string;
  }[] = [];
  const polySchemaInterfaceDeclarationList: { name: string; code: string }[] =
    [];

  const visitor = (node: ts.Node) => {
    if (ts.isTypeReferenceNode(node)) {
      const name = node.getFullText(sourceFile).trim();

      if (
        name.match(/^\$PolySchema\$\$\$/) &&
        !polySchemaTypeReferenceSet.has(name)
      ) {
        polySchemaTypeReferenceSet.add(name);
        polySchemaTypeReferenceList.push({
          name,
          path: '',
          replacement: '',
        });
      }
    }

    if (ts.isInterfaceDeclaration(node)) {
      const children = node.getChildren(sourceFile);
      const possibleIdentifier = children.find(
        (node) => node.kind === ts.SyntaxKind.Identifier,
      );

      if (possibleIdentifier) {
        const name = possibleIdentifier.getFullText(sourceFile).trim();

        const code = node.getFullText(sourceFile);

        if (
          name.match(/^\$PolySchema\$\$\$/) ||
          (['Argument', 'ReturnType'].includes(name) &&
            code.match(/<path>.+?<\/path>/))
        ) {
          polySchemaInterfaceDeclarationList.push({
            name,
            code,
          });
        }
      }
    }

    ts.forEachChild(node, visitor);
  };

  ts.forEachChild(sourceFile, visitor);

  const visitedPaths: { path: string; typeName: string }[] = [];

  const getUnresolvedSchemaArg = (path: string, isPublic: boolean): string => {
    return isPublic
      ? `Unresolved public schema \`${path}\`.`
      : `Unresolved schema, please add schema \`${path}\` to complete it.`;
  };

  type PolySchemaTypeParts = [
    prefix: '$PolySchema',
    argOrReturnType: '$Argument' | '$ReturnType' | '___',
    visibilityStatus: '$Public' | '___',
    resolvedStatus: '$Resolved' | '$Unresolved',
    ...realContextParts: string[],
  ];

  const getPolySchemaTypeParts = (typeName: string): PolySchemaTypeParts =>
    typeName.split(typeNameContextDelimiter) as PolySchemaTypeParts;

  /*
    1. Remove interfaces from resolved schemas that belong to some object property, also track them to fix each type that point to removed interfaces.
    2. Extend argument/return type interfaces with linked schema if they are linked to a schema.
    3. Replace interfaces from argument/return type that are linked to an unresolved schemas for an `any` type.
  */
  for (const polySchemaInterfaceDeclaration of polySchemaInterfaceDeclarationList) {
    const [
      ,
      argumentOrReturnType,
      visibilityStatus,
      resolvedStatus,
      ...realContextParts
    ] = getPolySchemaTypeParts(polySchemaInterfaceDeclaration.name);

    const isResolved = resolvedStatus === '$Resolved';
    const isPublic = visibilityStatus === '$Public';

    const matchPathNameCommentInCode =
      polySchemaInterfaceDeclaration.code.match(/<path>(.+?)<\/path>/);

    if (matchPathNameCommentInCode === null) {
      continue;
    }

    const [, path] = matchPathNameCommentInCode;

    if (['$ReturnType', '$Argument'].includes(argumentOrReturnType)) {
      if (isResolved) {
        const typePath = `schemas.${path
          .split('.')
          .map(toPascalCase)
          .join('.')}`;

        result = result.replace(
          polySchemaInterfaceDeclaration.code,
          `export interface ${argumentOrReturnType.replace(
            '$',
            '',
          )} extends ${typePath} {}`,
        );
      } else {
        result = result.replace(
          polySchemaInterfaceDeclaration.code,
          `/**\n    * ${getUnresolvedSchemaArg(
            path,
            isPublic,
          )}\n    */\n    export type ${argumentOrReturnType.replace(
            '$',
            '',
          )} = any;`,
        );
      }
    } else {
      const polySchemaTypeReference = polySchemaTypeReferenceList.find(
        (polySchemaTypeReference) =>
          polySchemaTypeReference.name === polySchemaInterfaceDeclaration.name,
      );

      if (polySchemaTypeReference) {
        polySchemaTypeReference.path = path;
      }

      if (isResolved) {
        result = result.replace(polySchemaInterfaceDeclaration.code, '');
      } else {
        const schemaPathVisited = visitedPaths.find(
          (visitedPath) => visitedPath.path === path,
        );

        if (!schemaPathVisited) {
          visitedPaths.push({
            path,
            typeName: polySchemaInterfaceDeclaration.name,
          });

          result = result.replace(
            polySchemaInterfaceDeclaration.code,
            `/**\n    * ${getUnresolvedSchemaArg(
              path,
              isPublic,
            )}\n    */\n    type ${[...realContextParts, 'Schema'].join(
              '$',
            )} = any`,
          );
        } else {
          polySchemaTypeReference.replacement = schemaPathVisited.typeName;

          result = result.replace(polySchemaInterfaceDeclaration.code, '');
        }
      }
    }
  }

  /**
   * Iterate over all removed interfaces and replace each type reference with proper schema reference.
   */
  for (const polySchemaTypeReference of polySchemaTypeReferenceList) {
    const polySchemaTypeReferenceParts = getPolySchemaTypeParts(
      polySchemaTypeReference.name,
    );

    const [, , , resolvedStatus] = polySchemaTypeReferenceParts;

    const isResolved = resolvedStatus === '$Resolved';

    if (isResolved) {
      const realPathParts = polySchemaTypeReference.path
        .split('.')
        .map(toPascalCase);

      result = result.replace(
        polySchemaTypeReference.name,
        `schemas.${realPathParts.join('.')}`,
      );
    } else {
      result = result.replace(polySchemaTypeReference.name, 'unknown');
    }
  }

  return wrapToNamespace(appendPathUnionType(result, value));
};

const getObjectTypeDeclarations = async (
  namespacePath: string,
  namespace: string,
  objectProperty: ObjectPropertyType,
  typeName: string,
): Promise<string> => {
  const declarations = await schemaToDeclarations(
    namespace,
    typeName,
    objectProperty.schema,
  );

  // setting typeName to be used when generating return type
  objectProperty.typeName = `${
    namespacePath ? `${namespacePath}.` : ''
  }${namespace}.${typeName}`;
  return declarations;
};

const getArgumentsTypeDeclarations = async (
  namespacePath: string,
  parentType: string,
  properties: PropertySpecification[],
  typeName = 'Argument',
) => {
  const typeDeclarations: string[] = [];
  const objectProperties = properties.filter(
    (property) => property.type.kind === 'object',
  );
  const functionProperties = properties.filter(
    (property) => property.type.kind === 'function',
  );

  for (const property of objectProperties) {
    const objectProperty = property.type as ObjectPropertyType;
    if (objectProperty.schema) {
      const namespace = `${parentType}$${toPascalCase(property.name)}`;
      // setting typeName to be used when generating arguments type
      objectProperty.typeName = `${
        namespacePath ? `${namespacePath}.` : ''
      }${namespace}.${typeName}`;

      typeDeclarations.push(
        await schemaToDeclarations(namespace, typeName, objectProperty.schema),
      );
    } else if (objectProperty.properties) {
      typeDeclarations.push(
        ...(await getArgumentsTypeDeclarations(
          namespacePath,
          `${parentType}$${toPascalCase(property.name)}`,
          objectProperty.properties,
        )),
      );
    }
  }

  for (const property of functionProperties) {
    const functionProperty = property.type as FunctionPropertyType;
    if (functionProperty.name) {
      // predefined type name
      continue;
    }

    typeDeclarations.push(
      ...(await getArgumentsTypeDeclarations(
        namespacePath,
        `${parentType}$${toPascalCase(property.name)}`,
        functionProperty.spec.arguments.filter(
          (arg) => arg.type.kind === 'object',
        ),
      )),
    );
    if (
      functionProperty.spec.returnType.kind === 'object' &&
      functionProperty.spec.returnType.schema
    ) {
      typeDeclarations.push(
        await getObjectTypeDeclarations(
          namespacePath,
          `${parentType}$${toPascalCase(property.name)}`,
          functionProperty.spec.returnType as ObjectPropertyType,
          'ReturnType',
        ),
      );
    }
  }

  return typeDeclarations;
};

const getIDComment = (specification: Specification) => {
  switch (specification.type) {
    case 'apiFunction':
    case 'serverFunction':
    case 'customFunction':
      return `* Function ID: ${specification.id}`;
    case 'authFunction':
      return `* Auth provider ID: ${specification.id}`;
    case 'webhookHandle':
      return `* Webhook ID: ${specification.id}`;
    default:
      return null;
  }
};

const getAdditionalComments = (specification: Specification) => {
  switch (specification.type) {
    case 'customFunction':
      if (!specification.requirements.length) {
        return null;
      }
      return `This function requires you to have the following libraries installed:\n- ${specification.requirements.join(
        '\n- ',
      )}`;
    default:
      return null;
  }
};

const getSpecificationWithFunctionComment = (
  specification: SpecificationWithFunction,
) => {
  const descriptionComment = specification.description
    ? specification.description
      .split('\n')
      .map((line) => `* ${line}`)
      .join('\n')
    : null;
  const toArgumentComment = (arg: PropertySpecification, prefix = '') => {
    if (
      arg.name === 'payload' &&
      arg.type.kind === 'object' &&
      arg.type.properties
    ) {
      return arg.type.properties
        .map((payloadProperty) =>
          toArgumentComment(payloadProperty, 'payload.'),
        )
        .filter(Boolean)
        .join('\n');
    }

    if (!arg.description) {
      return null;
    }
    return `* @param ${prefix}${arg.name} ${arg.description}`;
  };

  const argumentsComment = specification.function.arguments
    .map((arg) => toArgumentComment(arg))
    .filter(Boolean)
    .join('\n');
  const additionalComments = getAdditionalComments(specification);
  const idComment = getIDComment(specification);

  return `${descriptionComment ? `${descriptionComment}\n` : ''}${
    argumentsComment ? `${argumentsComment}\n` : ''
  }${additionalComments ? `${additionalComments}\n` : ''}${
    idComment ? `*\n${idComment}\n` : ''
  }`.trim();
};

const getSpecificationWithVariableComment = (
  specification: SpecificationWithVariable,
) => {
  const descriptionComment = specification.description
    ? specification.description
      .split('\n')
      .map((line) => `* ${line}`)
      .join('\n')
    : null;
  const secretComment =
    specification.variable.secrecy === 'SECRET'
      ? '* Note: The variable is secret and can be used only within Poly functions.'
      : null;

  const idComment = `* Variable ID: ${specification.id}`;

  return `${descriptionComment ? `${descriptionComment}\n` : ''}${
    secretComment ? `${secretComment}\n` : ''
  }${idComment ? `*\n${idComment}` : ''}`.trim();
};

const getVariableValueTypeDeclarations = async (
  namespacePath: string,
  namespace: string,
  objectProperty: ObjectPropertyType,
  value: any,
): Promise<string> => {
  const declarations = await schemaToDeclarations(
    namespace,
    'ValueType',
    objectProperty.schema,
    value,
    {
      unknownAny: false,
    },
  );

  // setting typeName to be used when generating variable value type
  objectProperty.typeName = `${
    namespacePath ? `${namespacePath}.` : ''
  }${namespace}.ValueType`;

  return declarations;
};

const getSpecificationsTypeDeclarations = async (
  namespacePath: string,
  specifications: Specification[],
): Promise<string> => {
  const errors: GenerationError[] = [];
  const getDeclarationOrHandleError = async (
    getDeclaration: () => Promise<string[] | string>,
    specification: Specification,
  ): Promise<string[] | string> => {
    try {
      return await getDeclaration();
    } catch (error) {
      setGenerationErrors(true);
      errors.push({
        specification,
        stack: error.stack,
      });
      return Promise.resolve('');
    }
  };
  const argumentsTypeDeclarations = (
    await Promise.all(
      specifications
        .filter((spec) => 'function' in spec)
        .map((spec) => spec as SpecificationWithFunction)
        .map((spec) =>
          getDeclarationOrHandleError(
            () =>
              getArgumentsTypeDeclarations(
                namespacePath,
                toPascalCase(spec.name),
                spec.function.arguments,
              ),
            spec,
          ),
        ),
    )
  ).flat();
  const returnTypeDeclarations = await Promise.all(
    specifications
      .filter(
        (spec) =>
          'function' in spec &&
          ((spec.function.returnType.kind === 'object' &&
            spec.function.returnType.schema &&
            !isBinary(spec.function.returnType)) ||
            (spec.type === 'serverFunction' &&
              (spec as ServerFunctionSpecification).serverSideAsync === true)),
      )
      .map((spec) => spec as SpecificationWithFunction)
      .map((spec) => {
        if (
          spec.type === 'serverFunction' &&
          (spec as ServerFunctionSpecification).serverSideAsync === true
        ) {
          const ns = toPascalCase(spec.name);
          return Promise.resolve(
            `namespace ${ns} {\n  export type ReturnType = { executionId: string };\n}`,
          );
        } else {
          return getDeclarationOrHandleError(
            () =>
              getObjectTypeDeclarations(
                namespacePath,
                toPascalCase(spec.name),
                spec.function.returnType as ObjectPropertyType,
                'ReturnType',
              ),
            spec,
          ) as Promise<string>;
        }
      }),
  );

  const variableValueDeclarations = await Promise.all(
    specifications
      .filter(
        (spec) =>
          'variable' in spec &&
          spec.variable.valueType.kind === 'object' &&
          spec.variable.valueType.schema,
      )
      .map((spec) => spec as SpecificationWithVariable)
      .map(
        (spec) =>
          getDeclarationOrHandleError(
            () =>
              getVariableValueTypeDeclarations(
                namespacePath,
                toPascalCase(spec.name),
                spec.variable.valueType as ObjectPropertyType,
                spec.variable.value,
              ),
            spec,
          ) as Promise<string>,
      ),
  );

  const schemaDeclarations = await Promise.all(
    specifications
      .filter((specification) => specification.type === 'schema')
      .map((spec) =>
        getDeclarationOrHandleError(
          () =>
            getObjectTypeDeclarations(
              namespacePath,
              toPascalCase(spec.name),
              {
                schema: (spec as SchemaSpecification).definition as any,
                kind: 'object',
              },
              'Schema',
            ),
          spec,
        ),
      ),
  );

  if (errors.length) {
    errors.forEach((err) => {
      echoGenerationError(err.specification);
    });
  }

  return [
    ...argumentsTypeDeclarations,
    ...returnTypeDeclarations,
    ...variableValueDeclarations,
    ...schemaDeclarations,
  ].join('\n');
};

const generateTSContextDeclarationFile = async (
  libPath: string,
  context: Context,
  specifications: Specification[],
  subContexts: Context[],
  pathPrefix: string,
) => {
  const template = handlebars.compile(
    loadTemplate(`${pathPrefix}/{{context}}.d.ts.hbs`),
  );
  const contextPaths =
    context.path === '' ? [] : context.path.split('.').map(toPascalCase);

  const typeDeclarations = await getSpecificationsTypeDeclarations(
    contextPaths.join('.'),
    specifications,
  );

  const toFunctionDeclaration = (specification: SpecificationWithFunction) => {
    const toArgumentDeclaration = (arg: PropertySpecification) => ({
      name: toCamelCase(arg.name),
      required: arg.required,
      type: toTypeDeclaration(arg.type),
    });
    const wrapInResponseType = (returnType: string) => {
      switch (specification.type) {
        case 'apiFunction':
          return specification.apiType === 'graphql'
            ? `GraphqlAPIFunctionResponse<${returnType}>`
            : `ApiFunctionResponse<${returnType}>`;
        case 'authFunction':
          return specification.name === 'getToken'
            ? returnType
            : `AuthFunctionResponse<${returnType}>`;
      }
      return returnType;
    };

    let computedReturnType: string;
    if (
      specification.type === 'serverFunction' &&
      (specification as ServerFunctionSpecification).serverSideAsync === true
    ) {
      computedReturnType = `${context.interfaceName}.${toPascalCase(
        specification.name,
      )}.ReturnType`;
    } else {
      computedReturnType = toTypeDeclaration(specification.function.returnType);
    }

    return {
      name: specification.name.split('.').pop(),
      comment: getSpecificationWithFunctionComment(specification),
      deprecated: specification.state === 'DEPRECATED',
      arguments: specification.function.arguments.map(toArgumentDeclaration),
      returnType: wrapInResponseType(computedReturnType),
      synchronous:
        specification.type === 'serverFunction'
          ? false
          : specification.function.synchronous === true,
    };
  };

  const toVariableDeclaration = (specification: SpecificationWithVariable) => {
    const type = toTypeDeclaration(specification.variable.valueType);
    const pathUnionType = type.split('.');

    pathUnionType[pathUnionType.length - 1] = 'PathValue';

    return {
      name: specification.name.split('.').pop(),
      comment: getSpecificationWithVariableComment(specification),
      type,
      secrecy: specification.variable.secrecy,
      isObjectType: specification.variable.valueType.kind === 'object',
      pathUnionType: pathUnionType.join('.'),
    };
  };

  const toSchemaDeclaration = (specification: SchemaSpecification) => {
    const contextParts = specification.context.split('.').filter((v) => v);

    return {
      name: specification.name.split('.').pop(),
      typeDeclaration: contextParts.length
        ? `${specification.context
            .split('.')
            .map(toPascalCase)
            .join('.')}.${toPascalCase(specification.name)}`
        : `${toPascalCase(specification.name)}`,
    };
  };

  const outputPath = `${libPath}/${pathPrefix}/${context.fileName}`;
  fs.writeFileSync(
    outputPath,
    await prettyPrint(
      template({
        interfaceName: context.interfaceName,
        contextPaths,
        typeDeclarations,
        functionDeclarations: specifications
          .filter((spec) => 'function' in spec)
          .map(toFunctionDeclaration),
        variableDeclarations: specifications
          .filter((spec) => 'variable' in spec)
          .map(toVariableDeclaration),
        schemaDeclarations: specifications
          .filter((spec) => spec.type === 'schema')
          .map(toSchemaDeclaration),
        subContexts,
      }),
    ),
  );
};

const generateTSDeclarationFilesForContext = async (
  libPath: string,
  context: Context,
  contextData: Record<string, any>,
  pathPrefix: string,
  contextCollector: Context[] = [],
) => {
  const contextDataKeys = Object.keys(contextData);
  const contextDataSpecifications = contextDataKeys
    .map((key) => contextData[key])
    .filter((value) => typeof value.type === 'string') as Specification[];
  const contextDataSubContexts = contextDataKeys
    .filter((key) => !contextData[key].type)
    .map((key) => {
      const path = `${context.path ? `${context.path}.` : ''}${key}`;

      return {
        name: key,
        path,
        fileName: `${path}.d.ts`,
        interfaceName: toPascalCase(path),
        level: context.level + 1,
      };
    });

  await generateTSContextDeclarationFile(
    libPath,
    context,
    contextDataSpecifications,
    contextDataSubContexts,
    pathPrefix,
  );
  contextCollector = [...contextCollector, context];

  for await (const subContext of contextDataSubContexts) {
    contextCollector = await generateTSDeclarationFilesForContext(
      libPath,
      subContext,
      contextData[subContext.name],
      pathPrefix,
      contextCollector,
    );
  }

  return contextCollector;
};

const assignUnresolvedRefsToPolySchemaRefObj = (
  schemaDefinition: any,
  unresolvedPolySchemaRefs: SchemaRef[] = [],
) => {
  iterateRefs(
    schemaDefinition,
    (schema) => {
      const ref = schema['x-poly-ref'] as SchemaRef;

      if (ref !== null && typeof ref === 'object' && !Array.isArray(ref)) {
        const foundUnresolved = unresolvedPolySchemaRefs.find(
          (unresolvedPolySchemaRef) =>
            unresolvedPolySchemaRef.path === ref.path &&
            unresolvedPolySchemaRef.publicNamespace === ref.publicNamespace,
        );

        if (foundUnresolved) {
          schema['x-poly-ref']['x-unresolved'] = true;
        }

        schema.description = `<path>${
          ref.publicNamespace ? `${ref.publicNamespace}.${ref.path}` : ref.path
        }</path>`;
      }

      return schema;
    },
    'x-poly-ref',
  );
};

const generateTSDeclarationFiles = async (
  libPath: string,
  specs: Specification[],
  interfaceName: string,
  pathPrefix: string,
) => {
  const contextData = getContextData(specs);

  const contexts = await generateTSDeclarationFilesForContext(
    libPath,
    {
      name: '',
      path: '',
      interfaceName,
      fileName: 'default.d.ts',
      level: 0,
    },
    contextData,
    pathPrefix,
  );

  await generateTSIndexDeclarationFile(libPath, contexts, pathPrefix);
};

const generateTSIndexDeclarationFile = async (
  libPath: string,
  contexts: Context[],
  pathPrefix: string,
) => {
  const template = handlebars.compile(
    loadTemplate(`${pathPrefix}/index.d.ts.hbs`),
  );
  fs.writeFileSync(
    `${libPath}/${pathPrefix}/index.d.ts`,
    await prettyPrint(
      template({
        contexts: contexts.map((context) => ({
          ...context,
          firstLevel: context.level === 1,
        })),
      }),
    ),
  );
};

export const generateFunctionsTSDeclarationFile = async (
  libPath: string,
  specs: Specification[],
) => {
  const assignUnresolvedRefsRecursive = (fn: FunctionSpecification) => {
    for (const functionArg of fn.arguments) {
      if (functionArg.type.kind === 'object' && functionArg.type.schema) {
        assignUnresolvedRefsToPolySchemaRefObj(
          functionArg.type.schema,
          functionArg.type.unresolvedPolySchemaRefs,
        );
      } else if (
        functionArg.type.kind === 'object' &&
        functionArg.type.properties
      ) {
        for (const property of functionArg.type.properties) {
          if (property.type.kind === 'object') {
            assignUnresolvedRefsToPolySchemaRefObj(
              property.type.schema,
              functionArg.type.unresolvedPolySchemaRefs,
            );
          }
        }
      } else if (
        functionArg.type.kind === 'function' &&
        typeof functionArg.type.spec === 'object'
      ) {
        assignUnresolvedRefsRecursive(functionArg.type.spec);
      }
    }
    if (fn.returnType.kind === 'object' && fn.returnType.schema) {
      assignUnresolvedRefsToPolySchemaRefObj(
        fn.returnType.schema,
        fn.returnType.unresolvedPolySchemaRefs,
      );
    }
  };

  await generateTSDeclarationFiles(
    libPath,
    specs
      .filter((spec) => 'function' in spec)
      .map((spec: SpecificationWithFunction) => {
        assignUnresolvedRefsRecursive(spec.function);
        return spec;
      }),
    'Poly',
    '.',
  );
};

export const generateVariablesTSDeclarationFile = async (
  libPath: string,
  specs: Specification[],
) =>
  await generateTSDeclarationFiles(
    libPath,
    specs.filter((spec) => 'variable' in spec),
    'Vari',
    'vari',
  );
