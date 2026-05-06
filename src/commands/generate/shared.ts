import { toPascalCase } from '@guanghechen/helper-string';
import { memoize } from 'lodash';
import { EOL } from 'node:os';

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


export const __test = {
  formatName,
  printComment,
};
