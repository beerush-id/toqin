import type {
  CustomMediaQueries,
  NestedDeclarations,
  ScopedDeclarations,
  TagType,
  TokenMap,
  TokenType
} from '../../token.js';
import type { DesignValue, MediaQuery } from '../../design.js';

export type ParserOptions = {
  tokens: TokenMap;
  scope?: string;
  prefix?: string;
  strictTags?: TagType[];
  mediaQueries?: CustomMediaQueries;
  customQueryMode?: 'attribute' | 'class' | 'id';
  colorScheme?: 'light' | 'dark' | 'system' | string;
}

export const CUSTOM_QUERY_REGEX = /\[[\w-]+]/g;
export const COLOR_REGEX = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\([^)]*\)/i;
export const COLOR_VALUE_MATCHER = /^#|(rgb|rgba|hsl|hsla)\(/;
export const CSS_UNIT_REGEX = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%)$/i;
export const COLOR_HEX_REGEX = /^#([0-9a-f]{3}){1,2}$/i;
export const COLOR_RGB_REGEX = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i;
export const COLOR_RGBA_REGEX = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(\.\d+)?)\)$/i;
export const COLOR_HSL_REGEX = /^hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)$/i;
export const COLOR_HSLA_REGEX = /^hsla\((\d+),\s*(\d+)%?,\s*(\d+)%?,\s*(\d+(\.\d+)?)\)$/i;

export const MEDIA_QUERIES: CustomMediaQueries = {
  '@light': '(prefers-color-scheme: light)',
  '@dark': '(prefers-color-scheme: dark)',
  '@sm': '(max-width: 767px)',
  '@md': '(min-width: 768px) and (max-width: 1023px)',
  '@lg': '(min-width: 1024px)',
  '@xl': '(min-width: 1440px)',
  '@print': 'print',
};

export function colorOpacity(color: string, opacity: string | number): string {
  const alpha = parseFloat(opacity as string);

  if (COLOR_REGEX.test(color)) {
    if (COLOR_HEX_REGEX.test(color)) {
      return hexToRgba(color, alpha);
    } else if (COLOR_RGB_REGEX.test(color)) {
      return color.replace(')', `, ${ alpha / 100 })`).replace('rgb', 'rgba');
    } else if (COLOR_RGBA_REGEX.test(color)) {
      return color.replace(/,\s*\d+(\.\d+)?\)/, `, ${ alpha / 100 })`);
    } else if (COLOR_HSL_REGEX.test(color)) {
      return color.replace(')', `, ${ alpha / 100 })`).replace('hsl', 'hsla');
    } else if (COLOR_HSLA_REGEX.test(color)) {
      return color.replace(/,\s*\d+(\.\d+)?\)/, `, ${ alpha / 100 })`);
    }
  }

  return color;
}

export function hexToRgba(hex: string, alpha?: number): string {
  const colors = hexToRgbValue(hex);

  if (typeof alpha === 'number' && !isNaN(alpha)) {
    return `rgba(${ colors.join(', ') }, ${ alpha > 1 ? alpha / 100 : alpha })`;
  } else {
    return `rgb(${ colors.join(', ') })`;
  }
}

export function hexToRgbValue(hex: string): [ number, number, number ] {
  const colors = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [];
  return [ parseInt(colors[1], 16), parseInt(colors[2], 16), parseInt(colors[3], 16) ];
}

export function getMedia(query: MediaQuery, userQueries: CustomMediaQueries = {}): string {
  const queries = { ...MEDIA_QUERIES };

  if (typeof userQueries === 'object') {
    for (const [ key, value ] of Object.entries(userQueries)) {
      if (typeof value === 'string') {
        queries[`${ key }` as MediaQuery] = value;
      } else if (typeof value === 'object') {
        queries[`${ key }` as MediaQuery] = value.query;
      }
    }
  }

  const q: MediaQuery = `@${ query.replace(/^@/, '') }` as never;

  if (typeof queries[q] === 'string') {
    return queries[q] as string;
  }

  console.warn(`The media query "${ query }" is not supported.`);

  return query;
}

export function setMedia(query: MediaQuery, value: string) {
  MEDIA_QUERIES[query] = value;
}

export function parseMediaQuery(query: MediaQuery | string, userQueries: CustomMediaQueries = {}) {
  const queries = query.replace(/^@/, '').split('@') as MediaQuery[];
  return queries.map((q) => getMedia(q, userQueries)).join(' and ');
}

export function resolveCssValue(
  maps: TokenMap,
  value: string,
  prefix?: string,
  name?: string,
  kind?: TokenType
): string {
  const globals = value.match(/@[\w.\-|]+/g);
  if (globals) {
    globals.forEach((item) => {
      const [ key, fallback ] = item.split('|');
      const variable = key.replace('@', '').replace(/\./g, '-');

      value = value.replace(
        item,
        `var(--${ prefix ? prefix + '-' : '' }${ variable }${ fallback ? ', ' + fallback : '' })`
      );
    });
  }

  const locals = value.match(/~[\w.\-|]+/g);
  if (locals) {
    locals.forEach((item) => {
      const [ key, fallback ] = item.split('|');
      const variable = key.replace('~', '').replace(/\./g, '-');

      value = value.replace(item, `var(--this-${ variable }${ fallback ? ', ' + fallback : '' })`);
    });
  }

  const animations = value.match(/\{[\w.-]+\}/g);
  if (animations) {
    animations.forEach(item => {
      const variable = item
        .replace('{', '')
        .replace('}', '')
        .replace(/\./g, '-');

      value = value.replace(item, `${ prefix ? prefix + '-' : '' }${ variable }`);
    });
  }

  const copies = value.match(/\$[\w!.-]+/g);
  if (copies) {
    copies.forEach((copy) => {
      const [ key, alpha ] = copy.replace('$', '').split('!');
      const token = maps?.[key];

      if (token && token.value) {
        if (alpha) {
          value = value.replace(copy, colorOpacity(token.value as string, alpha));
        } else {
          value = value.replace(copy, token.value as string);
        }
      } else {
        throw new Error(`COPY VALUE ERROR: Can not find the token value of "${ copy }".`);
      }
    });
  }

  if (name && kind && !value.startsWith('var(')) {
    validate(name, kind, value);
  }

  return value;
}

export function validate(name: string, kind: TokenType, value: unknown) {
  if (
    typeof value === 'string' &&
    (value.startsWith('@') ||
      value.startsWith('$') ||
      value.startsWith('~') ||
      value.startsWith('var(') ||
      value.startsWith('calc('))
  ) {
    return;
  }

  switch (kind) {
    case 'color':
      if (typeof value !== 'string') {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a string.`);
      }

      if (COLOR_VALUE_MATCHER.test(value) && !COLOR_REGEX.test(value)) {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a valid CSS color.`);
      }

      break;
    case 'unit':
      if (typeof value !== 'string' && parseFloat(value as never) !== 0) {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a string or "0".`);
      }

      if (!CSS_UNIT_REGEX.test(value as string)) {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a valid CSS unit.`);
      }

      break;
    case 'number':
      if (typeof value !== 'number') {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a number.`);
      }

      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a boolean.`);
      }

      break;
    case 'any':
      break;
    default:
      throw new Error(`The kind of "${ name }: ( ${ value } )" is not supported.`);
  }
}

/**
 * Parse a design spec into a flat list of CSS selectors.
 * @param {ParserOptions} options
 * @param {string} prop
 * @param {DesignValue} values
 * @param {string} prefix
 * @param {TokenType} kind
 * @param scope
 * @returns {ScopedDeclarations}
 */
export function parseQueries(
  options: ParserOptions,
  prop: string,
  values: DesignValue,
  prefix?: string,
  kind?: TokenType,
  scope = ':root'
): ScopedDeclarations {
  const root: NestedDeclarations = {};
  const queries: NestedDeclarations = {};

  for (const [ key, value ] of Object.entries(values)) {
    if (key.startsWith('@') || key === '.') {
      if (key === '@' || key === '.') {
        root[prop] = resolveCssValue(options.tokens, value as string, prefix, prop, kind) as never;
      } else {
        const query = parseMediaQuery(key, options.mediaQueries || {});
        const customs = query.match(CUSTOM_QUERY_REGEX);

        if (customs) {
          let custom = customs.join('');
          let newQuery = query;

          if (options?.customQueryMode === 'class') {
            custom = custom
              .replace(/\[/g, '.')
              .replace(/]/g, '');
          } else if (options?.customQueryMode === 'id') {
            custom = custom
              .replace(/\[/g, '#')
              .replace(/]/g, '');
          }

          for (const c of customs) {
            newQuery = newQuery
              .replace(` and ${ c }`, '')
              .replace(`${ c } and `, '')
              .replace(c, '');
          }

          if (scope !== ':root') {
            custom = scope.split(/\s?,\s?/).map((s) => `${ custom } ${ s }`).join(', ');
          }

          if (newQuery) {
            const q = `@media ${ newQuery }`;

            queries[q] = queries[q] || {};
            queries[q][custom] = queries[q][custom] || {};
            queries[q][custom][prop as never] = resolveCssValue(
              options.tokens,
              value as string,
              prefix,
              prop,
              kind
            ) as never;
          } else {
            queries[custom] = queries[custom] || {};
            queries[custom][prop] = resolveCssValue(options.tokens, value as string, prefix, prop, kind) as never;
          }
        } else {
          const q = `@media ${ query }`;

          queries[q] = queries[q] || {};
          queries[q][scope] = queries[q][scope] || {};
          queries[q][scope][prop] = resolveCssValue(options.tokens, value as string, prefix, prop, kind) as never;
        }
      }
    }
  }

  return { root, queries };
}

/**
 * Convert flat list of CSS selectors into css string list.
 * @param {NestedDeclarations} declarations
 * @param space
 * @returns {string[]}
 */
export function parseDeclaration(declarations: NestedDeclarations, space = ''): string[] {
  const contents: string[] = [];

  for (const [ name, properties ] of Object.entries(declarations)) {
    if (typeof (properties as NestedDeclarations) === 'string') {
      contents.push(`${ space }${ name }: ${ properties };`);
    } else if (typeof properties === 'object') {
      contents.push(`${ space }${ name } {`);
      contents.push(...parseDeclaration(properties, `${ space }  `));
      contents.push(`${ space }}${ space === '' ? '\r\n' : '' }`);
    }
  }

  return contents;
}
