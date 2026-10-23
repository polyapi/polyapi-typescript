import { memoize, set } from 'lodash';
import chalk from 'chalk';
import shell from 'shelljs';
import { EOL } from 'node:os';
import { ISpecification, Specification, SpecificationType } from "../../types";
import { echoGenerationError, toPascalCase } from '../../utils';
import { setGenerationErrors } from './types';

const unsafeCharacters = /(?:^\d)|[^0-9a-zA-Z_]/gi;
const unescapedSingleQuote = /\b'\b/gi;

const wrapUnsafeNames = (name: string) => {
  if (!name.match(unsafeCharacters)) return name;
  if (name.includes("'")) name = name.replaceAll(unescapedSingleQuote, "'");
  return `'${name}'`;
};

export const formatName = (name: string, nested = false) =>
  name === '[k: string]'
    ? name
    : wrapUnsafeNames(nested ? name : toPascalCase(name));

export type NestedT = undefined | null | 'object' | 'array' | 'union' | 'intersection';

export const ws = memoize((depth = 1) =>
    depth < 0 ? '' : new Array(depth).fill('  ').join(''),
);
export const end = memoize((nested?: NestedT) =>
    !nested || nested === 'object' ? ';' : '',
);

export const wrapParens = (v: string): string =>
  v.includes('| ') || v.includes('& ') ? `(${v})` : v;

export const printComment = (comment = '', depth = 0, deprecated = false) => {
  if (!comment && !deprecated) return '';

  if (!comment && deprecated) {
    return `${ws(depth)}/**${EOL}${ws(depth)} * @deprecated${EOL}${ws(
      depth,
    )} */${EOL}`;
  }

  const nl = comment.includes(EOL) ? EOL : '\n';
  return [
    `${ws(depth)}/**${deprecated ? `${EOL}${ws(depth)} * @deprecated` : ''}`,
    ...comment.split(nl).map((line) => `${ws(depth)} * ${line}`),
    `${ws(depth)} */${EOL}`,
  ].join(EOL);
};

export type ResourceTree<S extends ISpecification> = Record<
  string,
  S | Record<string, S>
>;

export type ResourceRoot<S extends ISpecification> = {
  path: string;
  interfaceName: string;
  namespaces: ResourceTree<S>;
  interfaces: Record<string, string | S>;
  hasTypes: boolean;
};

export type PrintOptions<S extends ISpecification> = {
  interfaceName: string;
  namespace: string;
  type: SpecificationType;
  printResourceInterface: (resource: S, depth: number) => string;
  printResourceNamespace: (resource: S, depth: number) => string;
}

export const buildTree = <S extends ISpecification>(specs: S[], interfaceName: string): ResourceRoot<S>[] => {
  const schemas: Record<string, ResourceRoot<S>> = {
    default: {
      path: 'default',
      interfaceName: interfaceName,
      interfaces: {},
      namespaces: {},
      hasTypes: false,
    },
  };
  for (const spec of specs) {
    if (!spec.context) {
      schemas.default.interfaces[spec.name] = spec;
      schemas.default.namespaces[spec.name] = spec;
      schemas.default.hasTypes = true;
      continue;
    }
    const contextParts = spec.context.split('.');
    const last = contextParts.length - 1;
    for (let i = 0; i <= last; i++) {
      const name = contextParts[i];
      const interfaceName = toPascalCase(i === last ? name : contextParts[i]);
      const path = contextParts.slice(0, i + 1).join('.');
      const parent = i ? contextParts.slice(0, i).join('.') : 'default';
      if (schemas[path]) continue;
      schemas[path] = {
        path,
        interfaceName,
        interfaces: {},
        namespaces: {},
        hasTypes: false,
      };
      schemas[parent].interfaces[name] = interfaceName;
      set(schemas[parent].namespaces, path, {});
    }
    set(
      schemas[spec.context].namespaces,
      spec.contextName
        .split('.')
        .map((v) => toPascalCase(v))
        .join('.'),
      spec,
    );
    schemas[spec.context].interfaces[spec.name] = spec;
    schemas[spec.context].hasTypes = true;
  }
  return Array.from(Object.values(schemas));
};

const printResourceInterface = <S extends ISpecification>(
  resource: S | string,
  options: PrintOptions<S>,
  depth = 1,
): string => {
  if (typeof resource === 'string') return `${resource};`;
  return `{${EOL}${ws(depth + 1)}${options.printResourceInterface(resource, depth)}${EOL}${ws(depth + 1)}}`;
};

const printResourceNamespace = <S extends ISpecification>(
  resource: S,
  name: string,
  options: PrintOptions<S>,
  depth = 1,
): string => {
  return `${ws(depth)}namespace ${toPascalCase(
    name,
  )} {${EOL}${options.printResourceNamespace(resource, depth + 1)}${EOL}${ws(depth)}}`;
};

const printResourceTreeAsTypes = <S extends ISpecification>(
  table: ResourceTree<S>,
  name: string,
  options: PrintOptions<S>,
  depth = 0,
): string => {
  let result = `${ws(depth)}namespace ${name} {`;
  for (const [key, child] of Object.entries(table)) {
    if (!Object.keys(child).length) continue;

    let generated = '';
    if ('type' in child && child.type === options.type) {
      try {
        generated = printResourceNamespace(
          child as S,
          (child.name || key) as string,
          options,
          depth + 1,
        );
      } catch (err) {
        shell.echo(chalk.red(err));
        echoGenerationError(child as unknown as Specification);
        setGenerationErrors(true);
      }
    } else {
      generated = printResourceTreeAsTypes(child as ResourceTree<S>, key, options, depth + 1);
    }
    result = `${result}${EOL}${generated}`;
  }
  result = `${result}${EOL}${ws(depth)}}`;
  return result;
};

const printResourceRoot = <S extends ISpecification>(
  root: ResourceRoot<S>,
  options: PrintOptions<S>
): string => {
  // print the interfaces
  let result = `declare namespace ${options.namespace} {`;
  // print the namespaces
  if (root.hasTypes) {
    for (const [key, resource] of Object.entries(root.namespaces)) {
      if (!Object.keys(resource).length) continue;
      const types =
        'type' in resource && resource.type === options.type
          ? printResourceNamespace(resource as S, key, options, 1)
          : printResourceTreeAsTypes(resource as ResourceTree<S>, key, options, 1);
      result = `${result}${EOL}${types}`;
    }
    result = `${result}${EOL}`;
  }
  // print the interfaces
  result = `${result}${EOL}${ws(1)}interface ${
    root.interfaceName
  } {${Object.entries(root.interfaces)
    .map(([k, v]) => `${EOL}${ws(2)}${k}: ${printResourceInterface(v, options)}`)
    .join('')}${EOL}${ws(1)}}`;

  // close the module
  result = `${result}${EOL}}`;
  return result;
};

export const printResourceSpecs = <S extends ISpecification>(
  specs: S[],
  options: PrintOptions<S>
): Record<string, string> => {
  const resources = buildTree<S>(specs, options.interfaceName);
  // then print all the schema types as strings ready to be saved to disk
  const fileMap = Object.fromEntries(
    resources.map((r) => [`${r.path}.d.ts`, printResourceRoot(r, options)]),
  );
  fileMap['index.d.ts'] = Object.keys(fileMap)
    .map((file) => `/// <reference path="./${file}" />`)
    .concat(['/// <reference path="./types.d.ts" />'])
    .join(EOL);
  return fileMap;
};

export const __test = {
  formatName,
  printComment,
  printResourceSpecs,
};
