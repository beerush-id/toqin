import type { TokenMap, TokenType } from '../../token.js';
import { logger } from '../../logger.js';
import type { MediaQueries, MediaQueryKey, NestedDeclarations, ScopedDeclarations } from '../../core.js';
import type { DesignRule } from '../../design.js';

export type ParserOptions = {
  tokens: TokenMap;
  mediaQueries?: MediaQueries;
  customQueryMode?: 'attribute' | 'class' | 'id';
};

export const CUSTOM_QUERY_REGEX = /\[[\w-]+]/g;
export const CSS_UNIT_REGEX = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%)$/i;
export const COLOR_REGEX = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\([^)]*\)/i;
export const COLOR_VALUE_MATCHER = /^#|(rgb|rgba|hsl|hsla)\(/;
export const COLOR_HEX_REGEX = /^#([0-9a-f]{3}){1,2}$/i;
export const COLOR_RGB_REGEX = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i;
export const COLOR_RGBA_REGEX = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(\.\d+)?)\)$/i;
export const COLOR_HSL_REGEX = /^hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)$/i;
export const COLOR_HSLA_REGEX = /^hsla\((\d+),\s*(\d+)%?,\s*(\d+)%?,\s*(\d+(\.\d+)?)\)$/i;
export const COLOR_TRANSFORM_REGEX = /[=<>^]+/;

export const MEDIA_QUERIES: MediaQueries = {
  '@light': '(prefers-color-scheme: light)',
  '@dark': '(prefers-color-scheme: dark)',
  '@sm': '(min-width: 640px)',
  '@md': '(min-width: 768px)',
  '@lg': '(min-width: 1024px)',
  '@xl': '(min-width: 1440px)',
  '@print': 'print',
};

export function similarQuery(search: string): string | undefined {
  for (const [ name, query ] of Object.entries(MEDIA_QUERIES)) {
    if (search.includes(`prefer-${ name.replace('@', '') }`)) {
      return query as string;
    }
  }
}

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

export function colorDarken(color: string, amount: string | number): string {
  const value = parseInt(amount as string, 10);

  if (COLOR_HEX_REGEX.test(color)) {
    const [ r, g, b ] = hexToRgbValue(color);
    return `rgb(${ r / value }, ${ g / value }, ${ b / value })`;
  }

  return color;
}

export function shadeColor(color: string, percent: number) {
  let [ R, G, B ] = hexToRgbValue(color);

  R = (R * (100 + percent) / 100);
  G = (G * (100 + percent) / 100);
  B = (B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;
  G = (G < 255) ? G : 255;
  B = (B < 255) ? B : 255;

  R = Math.round(R);
  G = Math.round(G);
  B = Math.round(B);

  const RR = ((R.toString(16).length == 1) ? '0' + R.toString(16) : R.toString(16));
  const GG = ((G.toString(16).length == 1) ? '0' + G.toString(16) : G.toString(16));
  const BB = ((B.toString(16).length == 1) ? '0' + B.toString(16) : B.toString(16));

  return '#' + RR + GG + BB;
}

export function contrastColor(color: string, amount = 0): string {
  const [ r, g, b ] = hexToRgbValue(color);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? shadeColor(color, -amount) : shadeColor(color, amount);
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

export function getMedia(query: MediaQueryKey, userQueries: MediaQueries = {}): string {
  const queries = { ...MEDIA_QUERIES };

  if (typeof userQueries === 'object') {
    for (const [ key, value ] of Object.entries(userQueries)) {
      if (typeof value === 'string') {
        queries[`${ key }` as MediaQueryKey] = value;
      } else if (typeof value === 'object') {
        queries[`${ key }` as MediaQueryKey] = value.query;
      }
    }
  }

  const q: MediaQueryKey = `@${ query.replace(/^@/, '') }` as never;

  if (typeof queries[q] === 'string') {
    return queries[q] as string;
  }

  logger.warn(`The media query "${ query }" is not supported.`);

  return query;
}

export function parseMediaQuery(query: MediaQueryKey | string, userQueries: MediaQueries = {}) {
  const queries = query.replace(/^@/, '').split('@') as MediaQueryKey[];
  return queries.map((q) => getMedia(q, userQueries)).join(' and ');
}

export function resolveCssValue(
  maps: TokenMap,
  value: string,
  prefix?: string,
  name?: string,
  kind?: TokenType,
  inline?: boolean,
): string {
  const shortcuts = value.match(/\+[\w.\-_:=]+/g);
  if (shortcuts) {
    shortcuts.forEach((item) => {
      const [ base, alpha ] = item.split('=');
      const [ key, extra ] = base.split(':');
      const name = key.replace('+', '');
      const token = maps?.[name];

      if (token && token.value) {
        if (alpha) {
          value = value.replace(item, `${ token.value.replace('@', '$') }=${ alpha }`);
        } else if (extra) {
          value = value.replace(item, `${ token.value }.${ extra }`);
        }
      }
    });
  }

  const locals = value.match(/~[\w.\-_|@]+/g);
  if (locals) {
    locals.forEach((item) => {
      const [ key, fallback ] = item.split('|');
      const variable = key.replace('~', '').replace(/\./g, '-');
      const fallbackValue = fallback && /^(@|~|\{|\$)/.test(fallback)
                            ? resolveCssValue(maps, fallback, prefix, name, kind, inline)
                            : fallback;

      // value = value.replace(item, `var(--this-${ variable }${ fallbackValue ? ', ' + fallbackValue : '' })`);
      value = value.replace(item, `var(--${ variable }${ fallbackValue ? ', ' + fallbackValue : '' })`);
    });
  }

  const globals = value.match(/@[\w.\-_|]+/g);
  if (globals) {
    globals.forEach((item) => {
      const [ key, fallback ] = item.split('|');
      const token = maps?.[key.replace('@', '')];

      if (!token) {
        logger.warn(`Cannot find global token "${ key }". UI might be not rendered correctly.`);
      }

      if (inline) {
        if (/^(@|~|\$)/.test(token?.value as string)) {
          value = resolveCssValue(maps, token?.value as string, prefix, name, kind, inline);
        } else {
          value = value.replace(item, token?.value as string);
        }
      } else {
        const variable = key.replace('@', '').replace(/\./g, '-');

        value = value.replace(
          item,
          `var(--${ prefix ? prefix + '-' : '' }${ variable }${ fallback ? ', ' + fallback : '' })`,
        );
      }
    });
  }

  const prefixes = value.match(/\{[\w.\-_]+\}/g);
  if (prefixes) {
    prefixes.forEach((item) => {
      const variable = item.replace('{', '').replace('}', '').replace(/\./g, '-');

      value = value.replace(item, `${ prefix ? prefix + '-' : '' }${ variable }`);
    });
  }

  const copies = value.match(/\$[\w!.\-_<>^=|]+/g);
  if (copies) {
    copies.forEach((copy) => {
      const [ base, fallback ] = copy.replace('$', '').split(':');
      const [ key ] = base.split(COLOR_TRANSFORM_REGEX);
      const [ , alpha ] = base.split(/[!=|]/);
      const [ , darken ] = base.split('<');
      const [ , lighten ] = base.split('>');
      const [ , contrast ] = base.split('^');
      const token = maps?.[key];

      if (token && token.value) {
        let tValue = token.value;

        if (/^(@|~|\{|\$)/.test(token?.value as string)) {
          tValue = resolveCssValue(maps, token.value as string, prefix, name, kind, true);
        }

        if (alpha) {
          value = value.replace(copy, colorOpacity(tValue as string, alpha));
        } else if (darken) {
          value = value.replace(copy, shadeColor(tValue as string, -parseInt(darken)));
        } else if (lighten) {
          value = value.replace(copy, shadeColor(tValue as string, parseInt(lighten)));
        } else if (contrast) {
          value = value.replace(copy, contrastColor(tValue as string, parseInt(contrast)));
        } else {
          value = value.replace(copy, tValue as string);
        }
      } else {
        if (fallback) {
          const fallbackValue = resolveCssValue(maps, fallback, prefix, name, kind, true);
          value = value.replace(copy, fallbackValue);
        } else {
          throw new Error(`COPY VALUE ERROR: Cannot resolve the token value of "${ copy }".`);
        }
      }
    });
  }

  const hexColors = value.match(/#[\w!.\-_<>^=|]+/g);
  if (hexColors) {
    hexColors.forEach((color) => {
      const [ key ] = color.split(COLOR_TRANSFORM_REGEX);
      const [ , alpha ] = color.split(/[!=|]/);
      const [ , darken ] = color.split('<');
      const [ , lighten ] = color.split('>');
      const [ , contrast ] = color.split('^');

      if (alpha) {
        value = value.replace(color, colorOpacity(key, alpha));
      } else if (darken) {
        value = value.replace(color, shadeColor(key, -parseInt(darken)));
      } else if (lighten) {
        value = value.replace(color, shadeColor(key, parseInt(lighten)));
      } else if (contrast) {
        value = value.replace(color, contrastColor(key, parseInt(contrast)));
      }
    });
  }

  const maths = value.match(/\d+[a-z]+\([+\-*/][\d.]+\)/g);
  if (maths) {
    maths.forEach((item) => {
      const [ , size, operator, scale ] = /(\w+)\(([+\-*/])([\d.]+)\)/.exec(item) || [];
      if (size && operator && scale) {
        const [ , int, unit ] = /(\d+)(\w+)/.exec(size) || [];
        const nInt = parseFloat(int);
        const nScale = parseFloat(scale);

        if (nInt && nScale) {
          switch (operator) {
            case '+':
              value = value.replace(item, `${ Math.round(nInt + nScale) }${ unit || '' }`);
              break;
            case '-':
              value = value.replace(item, `${ Math.round(nInt - nScale) }${ unit || '' }`);
              break;
            case '*':
              value = value.replace(item, `${ Math.round(nInt * nScale) }${ unit || '' }`);
              break;
            case '/':
              value = value.replace(item, `${ Math.round(nInt / nScale) }${ unit || '' }`);
              break;
            default:
              break;
          }
        }
      }
    });
  }

  if (name && kind && !value.startsWith('var(')) {
    validate(name, kind, value);
  }

  return value;
}

export function validate(name: string, kind: TokenType, value: unknown) {
  if (value === '0' || value === 0) {
    return true;
  }

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
  values: DesignRule,
  prefix?: string,
  kind?: TokenType,
  scope = ':root',
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
            custom = custom.replace(/\[/g, '.').replace(/]/g, '');
          } else if (options?.customQueryMode === 'id') {
            custom = custom.replace(/\[/g, '#').replace(/]/g, '');
          }

          for (const c of customs) {
            newQuery = newQuery.replace(` and ${ c }`, '').replace(`${ c } and `, '').replace(c, '');
          }

          if (scope !== ':root') {
            custom = scope
              .split(/\s?,\s?/)
              .map((s) => `${ custom } ${ s }`)
              .join(', ');
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
              kind,
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
