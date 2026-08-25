import fs from 'fs';
import set from 'lodash/set';
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

export const writeCachedSpecs = (libPath: string, specs: Specification[]) => {
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
    table: 'Table',
    aiFunction: 'AI Function',
  };

  const type = typeMap[specification.type];

  shell.echo(
    chalk.red(
      `\nError encountered while processing ${type} '${specification.contextName}' (id: '${specification.id}'). ${type} is unavailable.`,
    ),
  );
};

export const templateUrl = (fileName: string): string =>
  `${__dirname}/templates/${fileName}`;

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

const MAX_PATHS = 100;
export const getStringPaths = (data: Record<string, any> | any[]) => {
  const stringPaths: string[] = [];
  const queue: Array<[any, string]> = [[data, '$']];

  while (queue.length > 0 && stringPaths.length < MAX_PATHS) {
    const [node, prefix] = queue.shift()!;
    if (node === null || typeof node !== 'object') continue;

    const entries: Array<[string, any]> = Array.isArray(node)
      ? node.map((value, i) => [`${prefix}[${i}]`, value])
      : Object.keys(node).map((key) => [`${prefix}.${key}`, node[key]]);

    for (const [path, value] of entries) {
      if (stringPaths.length >= MAX_PATHS) break;
      stringPaths.push(path);
      queue.push([value, path]);
    }
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
                `'${prop.name}'${prop.required === false ? '?' : ''
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


// Regexps involved with splitting words in various case formats.
const SPLIT_LOWER_UPPER_RE = /([\p{Ll}\d])(\p{Lu})/gu;
const SPLIT_UPPER_UPPER_RE = /(\p{Lu})([\p{Lu}][\p{Ll}])/gu;

const DEFAULT_STRIP_REGEXP = /[^\p{L}\d]+/giu; // Regexp involved with stripping non-word characters from the result.
const SPLIT_REPLACE_VALUE = '$1\0$2'; // The replacement value for splits.

/**
 * Split any cased input strings into an array of words.
 */
const split = (input: string): string[] => {
  let result = input
    .replace(SPLIT_LOWER_UPPER_RE, SPLIT_REPLACE_VALUE)
    .replace(SPLIT_UPPER_UPPER_RE, SPLIT_REPLACE_VALUE)

  result = result.replace(DEFAULT_STRIP_REGEXP, '\0')

  let start = 0
  let end = result.length

  // Trim the delimiter from around the output string.
  while (result.charAt(start) === '\0') start += 1
  if (start === end) return []
  while (result.charAt(end - 1) === '\0') end -= 1

  // Transform each token independently.
  return result.slice(start, end).split(/\0/g)
}

export const toPascalCase = (input: string): string => {
  return split(input)
    .map((word: string, index: number): string => {
      const char0 = word[0];
      const initial = index > 0 && char0 >= '0' && char0 <= '9' ? '_' + char0 : char0.toLocaleUpperCase();
      return initial + word.slice(1).toLocaleLowerCase();
    })
    .join('');
}

export const toCamelCase = (input: string): string => {
  return split(input)
    .map((word, index) => {
      if (index === 0) return word.toLocaleLowerCase();
      return `${word[0].toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`;
    })
    .join('');
}

const SLUGIFY_CHAR_MAP = { "$": "dollar", "%": "percent", "&": "and", "<": "less", ">": "greater", "|": "or", "¢": "cent", "£": "pound", "¤": "currency", "¥": "yen", "©": "(c)", "ª": "a", "®": "(r)", "º": "o", "À": "A", "Á": "A", "Â": "A", "Ã": "A", "Ä": "A", "Å": "A", "Æ": "AE", "Ç": "C", "È": "E", "É": "E", "Ê": "E", "Ë": "E", "Ì": "I", "Í": "I", "Î": "I", "Ï": "I", "Ð": "D", "Ñ": "N", "Ò": "O", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O", "Ø": "O", "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U", "Ý": "Y", "Þ": "TH", "ß": "ss", "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "æ": "ae", "ç": "c", "è": "e", "é": "e", "ê": "e", "ë": "e", "ì": "i", "í": "i", "î": "i", "ï": "i", "ð": "d", "ñ": "n", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o", "ù": "u", "ú": "u", "û": "u", "ü": "u", "ý": "y", "þ": "th", "ÿ": "y", "Ā": "A", "ā": "a", "Ă": "A", "ă": "a", "Ą": "A", "ą": "a", "Ć": "C", "ć": "c", "Č": "C", "č": "c", "Ď": "D", "ď": "d", "Đ": "DJ", "đ": "dj", "Ē": "E", "ē": "e", "Ė": "E", "ė": "e", "Ę": "E", "ę": "e", "Ě": "E", "ě": "e", "Ğ": "G", "ğ": "g", "Ģ": "G", "ģ": "g", "Ĩ": "I", "ĩ": "i", "Ī": "I", "ī": "i", "Į": "I", "į": "i", "İ": "I", "ı": "i", "Ķ": "K", "ķ": "k", "Ļ": "L", "ļ": "l", "Ľ": "L", "ľ": "l", "Ł": "L", "ł": "l", "Ń": "N", "ń": "n", "Ņ": "N", "ņ": "n", "Ň": "N", "ň": "n", "Ō": "O", "ō": "o", "Ő": "O", "ő": "o", "Œ": "OE", "œ": "oe", "Ŕ": "R", "ŕ": "r", "Ř": "R", "ř": "r", "Ś": "S", "ś": "s", "Ş": "S", "ş": "s", "Š": "S", "š": "s", "Ţ": "T", "ţ": "t", "Ť": "T", "ť": "t", "Ũ": "U", "ũ": "u", "Ū": "U", "ū": "u", "Ů": "U", "ů": "u", "Ű": "U", "ű": "u", "Ų": "U", "ų": "u", "Ŵ": "W", "ŵ": "w", "Ŷ": "Y", "ŷ": "y", "Ÿ": "Y", "Ź": "Z", "ź": "z", "Ż": "Z", "ż": "z", "Ž": "Z", "ž": "z", "Ə": "E", "ƒ": "f", "Ơ": "O", "ơ": "o", "Ư": "U", "ư": "u", "ǈ": "LJ", "ǉ": "lj", "ǋ": "NJ", "ǌ": "nj", "Ș": "S", "ș": "s", "Ț": "T", "ț": "t", "ə": "e", "˚": "o", "Ά": "A", "Έ": "E", "Ή": "H", "Ί": "I", "Ό": "O", "Ύ": "Y", "Ώ": "W", "ΐ": "i", "Α": "A", "Β": "B", "Γ": "G", "Δ": "D", "Ε": "E", "Ζ": "Z", "Η": "H", "Θ": "8", "Ι": "I", "Κ": "K", "Λ": "L", "Μ": "M", "Ν": "N", "Ξ": "3", "Ο": "O", "Π": "P", "Ρ": "R", "Σ": "S", "Τ": "T", "Υ": "Y", "Φ": "F", "Χ": "X", "Ψ": "PS", "Ω": "W", "Ϊ": "I", "Ϋ": "Y", "ά": "a", "έ": "e", "ή": "h", "ί": "i", "ΰ": "y", "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "h", "θ": "8", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "3", "ο": "o", "π": "p", "ρ": "r", "ς": "s", "σ": "s", "τ": "t", "υ": "y", "φ": "f", "χ": "x", "ψ": "ps", "ω": "w", "ϊ": "i", "ϋ": "y", "ό": "o", "ύ": "y", "ώ": "w", "Ё": "Yo", "Ђ": "DJ", "Є": "Ye", "І": "I", "Ї": "Yi", "Ј": "J", "Љ": "LJ", "Њ": "NJ", "Ћ": "C", "Џ": "DZ", "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "Ж": "Zh", "З": "Z", "И": "I", "Й": "J", "К": "K", "Л": "L", "М": "M", "Н": "N", "О": "O", "П": "P", "Р": "R", "С": "S", "Т": "T", "У": "U", "Ф": "F", "Х": "H", "Ц": "C", "Ч": "Ch", "Ш": "Sh", "Щ": "Sh", "Ъ": "U", "Ы": "Y", "Ь": "", "Э": "E", "Ю": "Yu", "Я": "Ya", "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh", "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "u", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ё": "yo", "ђ": "dj", "є": "ye", "і": "i", "ї": "yi", "ј": "j", "љ": "lj", "њ": "nj", "ћ": "c", "ѝ": "u", "џ": "dz", "Ґ": "G", "ґ": "g", "Ғ": "GH", "ғ": "gh", "Қ": "KH", "қ": "kh", "Ң": "NG", "ң": "ng", "Ү": "UE", "ү": "ue", "Ұ": "U", "ұ": "u", "Һ": "H", "һ": "h", "Ә": "AE", "ә": "ae", "Ө": "OE", "ө": "oe", "Ա": "A", "Բ": "B", "Գ": "G", "Դ": "D", "Ե": "E", "Զ": "Z", "Է": "E'", "Ը": "Y'", "Թ": "T'", "Ժ": "JH", "Ի": "I", "Լ": "L", "Խ": "X", "Ծ": "C'", "Կ": "K", "Հ": "H", "Ձ": "D'", "Ղ": "GH", "Ճ": "TW", "Մ": "M", "Յ": "Y", "Ն": "N", "Շ": "SH", "Չ": "CH", "Պ": "P", "Ջ": "J", "Ռ": "R'", "Ս": "S", "Վ": "V", "Տ": "T", "Ր": "R", "Ց": "C", "Փ": "P'", "Ք": "Q'", "Օ": "O''", "Ֆ": "F", "և": "EV", "ء": "a", "آ": "aa", "أ": "a", "ؤ": "u", "إ": "i", "ئ": "e", "ا": "a", "ب": "b", "ة": "h", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "th", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "dh", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ى": "a", "ي": "y", "ً": "an", "ٌ": "on", "ٍ": "en", "َ": "a", "ُ": "u", "ِ": "e", "ْ": "", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "پ": "p", "چ": "ch", "ژ": "zh", "ک": "k", "گ": "g", "ی": "y", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "฿": "baht", "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v", "ზ": "z", "თ": "t", "ი": "i", "კ": "k", "ლ": "l", "მ": "m", "ნ": "n", "ო": "o", "პ": "p", "ჟ": "zh", "რ": "r", "ს": "s", "ტ": "t", "უ": "u", "ფ": "f", "ქ": "k", "ღ": "gh", "ყ": "q", "შ": "sh", "ჩ": "ch", "ც": "ts", "ძ": "dz", "წ": "ts", "ჭ": "ch", "ხ": "kh", "ჯ": "j", "ჰ": "h", "Ṣ": "S", "ṣ": "s", "Ẁ": "W", "ẁ": "w", "Ẃ": "W", "ẃ": "w", "Ẅ": "W", "ẅ": "w", "ẞ": "SS", "Ạ": "A", "ạ": "a", "Ả": "A", "ả": "a", "Ấ": "A", "ấ": "a", "Ầ": "A", "ầ": "a", "Ẩ": "A", "ẩ": "a", "Ẫ": "A", "ẫ": "a", "Ậ": "A", "ậ": "a", "Ắ": "A", "ắ": "a", "Ằ": "A", "ằ": "a", "Ẳ": "A", "ẳ": "a", "Ẵ": "A", "ẵ": "a", "Ặ": "A", "ặ": "a", "Ẹ": "E", "ẹ": "e", "Ẻ": "E", "ẻ": "e", "Ẽ": "E", "ẽ": "e", "Ế": "E", "ế": "e", "Ề": "E", "ề": "e", "Ể": "E", "ể": "e", "Ễ": "E", "ễ": "e", "Ệ": "E", "ệ": "e", "Ỉ": "I", "ỉ": "i", "Ị": "I", "ị": "i", "Ọ": "O", "ọ": "o", "Ỏ": "O", "ỏ": "o", "Ố": "O", "ố": "o", "Ồ": "O", "ồ": "o", "Ổ": "O", "ổ": "o", "Ỗ": "O", "ỗ": "o", "Ộ": "O", "ộ": "o", "Ớ": "O", "ớ": "o", "Ờ": "O", "ờ": "o", "Ở": "O", "ở": "o", "Ỡ": "O", "ỡ": "o", "Ợ": "O", "ợ": "o", "Ụ": "U", "ụ": "u", "Ủ": "U", "ủ": "u", "Ứ": "U", "ứ": "u", "Ừ": "U", "ừ": "u", "Ử": "U", "ử": "u", "Ữ": "U", "ữ": "u", "Ự": "U", "ự": "u", "Ỳ": "Y", "ỳ": "y", "Ỵ": "Y", "ỵ": "y", "Ỷ": "Y", "ỷ": "y", "Ỹ": "Y", "ỹ": "y", "–": "-", "‘": "'", "’": "'", "“": "\"", "”": "\"", "„": "\"", "†": "+", "•": "*", "…": "...", "₠": "ecu", "₢": "cruzeiro", "₣": "french franc", "₤": "lira", "₥": "mill", "₦": "naira", "₧": "peseta", "₨": "rupee", "₩": "won", "₪": "new shequel", "₫": "dong", "€": "euro", "₭": "kip", "₮": "tugrik", "₯": "drachma", "₰": "penny", "₱": "peso", "₲": "guarani", "₳": "austral", "₴": "hryvnia", "₵": "cedi", "₸": "kazakhstani tenge", "₹": "indian rupee", "₺": "turkish lira", "₽": "russian ruble", "₿": "bitcoin", "℠": "sm", "™": "tm", "∂": "d", "∆": "delta", "∑": "sum", "∞": "infinity", "♥": "love", "元": "yuan", "円": "yen", "﷼": "rial", "ﻵ": "laa", "ﻷ": "laa", "ﻹ": "lai", "ﻻ": "la" };

export const slugify = (value: string): string => {
  if (typeof value !== 'string') {
    throw new Error('slugify: string argument expected')
  }

  let slug = value.normalize().split('')
    // replace characters based on charMap
    .reduce(function (result, ch) {
      let appendChar = SLUGIFY_CHAR_MAP[ch] ?? ch;
      if (appendChar === '-') appendChar = ' ';
      return `${result}${appendChar.replace(/[^\w\s$*_+~.()'"!\-:@]+/g, '')}`;
    }, '');

  slug = slug.replace(/[^A-Za-z0-9\s]/g, '');
  slug = slug.trim()
  // Replace spaces with dash, treating multiple consecutive spaces as a single space.
  slug = slug.replace(/\s+/g, '-');

  return slug.toLowerCase();
}

// Copied from 'uuid' package
const UUID_REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;
export const validateUUID = (uuid: unknown): boolean =>
  typeof uuid === 'string' && UUID_REGEX.test(uuid);
