import { merge } from '@beerush/utils/object';
import { ToqinMediaQueries } from '../../design.js';
import type { CustomMediaQueries, TokenOutput } from '../../token.js';
import { DesignSpecs, DesignToken, getToken, TokenTypes } from '../../token.js';

export type CSSCompileTokenConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  extension?: 'css' | 'scss';
  themeClasses?: boolean;
  themeClassNames?: {
    light?: string;
    dark?: string;
  };
  mediaQueries?: {
    [key in ToqinMediaQueries]?: string;
  };
};

export const COLOR_REGEX = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\([^)]*\)/i;
export const CSS_UNIT_REGEX = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%)$/i;
export const COLOR_HEX_REGEX = /^#([0-9a-f]{3}){1,2}$/i;
export const COLOR_RGB_REGEX = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i;
export const COLOR_RGBA_REGEX = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(\.\d+)?)\)$/i;
export const COLOR_HSL_REGEX = /^hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)$/i;
export const COLOR_HSLA_REGEX = /^hsla\((\d+),\s*(\d+)%?,\s*(\d+)%?,\s*(\d+(\.\d+)?)\)$/i;

export const MEDIA_QUERIES: Partial<{
  [key in ToqinMediaQueries]?: string;
}> = {
  '@light': '[toqin-theme-light]',
  '@dark': '[toqin-theme-dark]',
  '@mobile': '(max-width: 767px)',
  '@tablet': '(min-width: 768px) and (max-width: 1023px)',
  '@desktop': '(min-width: 1024px)',
  '@print': 'print',
};

export function compileToken(spec: DesignSpecs, config: CSSCompileTokenConfig): TokenOutput[] {
  const outputs: TokenOutput[] = [];
  const prefix = config?.prefix ?? spec.variablePrefix;

  for (const group of spec.tokens) {
    const result = parseToken(spec, group, group.type, prefix ? `--${prefix}` : undefined, prefix);
    const output = {
      name: group.name,
      fileName: `tokens/${group.name}.${config?.extension ?? config?.mode ?? 'css'}`,
      content: [':root {', parseDeclarations(result.root, '  '), '}\r\n', parseDeclarations(result.queries) + '\r\n']
        .join('\r\n')
        .replace(/\r\n\r\n/g, '\r\n'),
    };
    outputs.push(output);
  }

  return outputs;
}

export type VariableList = {
  [key: string]: string;
};

export type VariableQueries = {
  [key: string]: {
    root: VariableList;
    [key: string]: VariableList | VariableQueries;
  };
};

export type VariableDeclarations = {
  root: VariableList;
  queries: VariableQueries;
};

function parseToken(
  spec: DesignSpecs,
  token: DesignToken,
  kind: TokenTypes,
  parent?: string,
  prefix?: string
): VariableDeclarations {
  const name = parent ? (token.name ? `${parent}-${token.name}` : parent) : token.name;
  const root: VariableList = {};
  const queries: VariableQueries = {};

  if (typeof token.value === 'string') {
    root[name] = parseTokenValue(spec, name, kind, token.value, prefix);
  } else if (typeof token.value === 'object') {
    for (const [key, value] of Object.entries(token.value)) {
      if (key.startsWith('@')) {
        if (key === '@') {
          root[name] = parseTokenValue(spec, name, kind, value as string, prefix);
        } else {
          const query = parseMediaQuery(key, spec.mediaQueries);
          const customs = query.match(/\[[\w-]+]/g);

          if (customs) {
            let custom = customs.join('');
            let newQuery = query;

            if (spec?.customQueryMode === 'class') {
              custom = custom.replace(/\[/g, '.').replace(/]/g, '');
            } else if (spec?.customQueryMode === 'id') {
              custom = custom.replace(/\[/g, '#').replace(/]/g, '');
            }

            for (const c of customs) {
              newQuery = newQuery.replace(` and ${c}`, '').replace(`${c} and `, '').replace(c, '');
            }

            if (newQuery) {
              const q = `@media ${newQuery}`;

              queries[q] = queries[q] || {};
              queries[q][custom] = queries[q][custom] || {};
              queries[q][custom][name as never] = parseTokenValue(spec, name, kind, value as string, prefix) as never;
            } else {
              queries[custom] = queries[custom] || {};
              queries[custom][name] = parseTokenValue(spec, name, kind, value as string, prefix) as never;
            }
          } else {
            const q = `@media ${query}`;

            queries[q] = queries[q] || {};
            queries[q].root = queries[q].root || {};
            queries[q].root[name] = parseTokenValue(spec, name, kind, value as string, prefix);
          }
        }
      }
    }
  }

  if (token.tokens) {
    for (const child of token.tokens) {
      const { root: childRoot, queries: childQueries } = parseToken(spec, child, kind, name, prefix);

      merge(root, childRoot);
      merge(queries, childQueries);
    }
  }

  return { root, queries };
}

function parseTokenValue(spec: DesignSpecs, name: string, kind: TokenTypes, value: string, prefix?: string): string {
  validate(name, kind, value);
  return resolveCssValue(value, prefix, spec);
}

function parseDeclarations(declarations: VariableList | VariableQueries, space = ''): string {
  const contents: string[] = [];

  for (const [q, v] of Object.entries(declarations)) {
    if (typeof v === 'object') {
      contents.push(`${space}${q === 'root' ? ':root' : q} {`);
      contents.push(parseDeclarations(v, space + '  '));
      contents.push(`${space}}\r\n`);
    } else {
      contents.push(`${space}${q}: ${v};`);
    }
  }

  return contents.join('\r\n');
}

export function validate(name: string, kind: TokenTypes, value: unknown) {
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
        throw new Error(`The value of "${name}: ( ${value} )" must be a string.`);
      }

      if (!COLOR_REGEX.test(value)) {
        throw new Error(`The value of "${name}: ( ${value} )" must be a valid CSS color.`);
      }

      break;
    case 'unit':
      if (typeof value !== 'string' && parseFloat(value as never) !== 0) {
        throw new Error(`The value of "${name}: ( ${value} )" must be a string or "0".`);
      }

      if (!CSS_UNIT_REGEX.test(value as string)) {
        throw new Error(`The value of "${name}: ( ${value} )" must be a valid CSS unit.`);
      }

      break;
    case 'number':
      if (typeof value !== 'number') {
        throw new Error(`The value of "${name}: ( ${value} )" must be a number.`);
      }

      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`The value of "${name}: ( ${value} )" must be a boolean.`);
      }

      break;
    case 'any':
      break;
    default:
      throw new Error(`The kind of "${name}: ( ${value} )" is not supported.`);
  }
}

export function resolveCssValue(value: string, prefix?: string, spec?: DesignSpecs): string {
  const globals = value.match(/@[\w.-]+/g);
  if (globals) {
    globals.forEach((item) => {
      const variable = item.replace('@', '').replace(/\./g, '-');

      value = value.replace(item, `var(--${prefix ? prefix + '-' : ''}${variable})`);
    });
  }

  const locals = value.match(/~[\w.-]+/g);
  if (locals) {
    locals.forEach((item) => {
      const variable = item.replace('~', '').replace(/\./g, '-');

      value = value.replace(item, `var(--this-${variable})`);
    });
  }

  const copies = value.match(/\$[\w!.-]+/g);
  if (copies) {
    copies.forEach((copy) => {
      const [key, alpha] = copy.replace('$', '').split('!');
      const token = getToken(spec?.tokens || [], key);

      if (token && token.value) {
        if (alpha) {
          value = value.replace(copy, colorOpacity(token.value as string, alpha));
        } else {
          value = value.replace(copy, token.value as string);
        }
      }
    });
  }

  return value;
}

export function colorOpacity(color: string, opacity: string | number): string {
  const alpha = parseFloat(opacity as string);

  if (COLOR_REGEX.test(color)) {
    if (COLOR_HEX_REGEX.test(color)) {
      return hexToRgba(color, alpha);
    } else if (COLOR_RGB_REGEX.test(color)) {
      return color.replace(')', `, ${alpha / 100})`).replace('rgb', 'rgba');
    } else if (COLOR_RGBA_REGEX.test(color)) {
      return color.replace(/,\s*\d+(\.\d+)?\)/, `, ${alpha / 100})`);
    } else if (COLOR_HSL_REGEX.test(color)) {
      return color.replace(')', `, ${alpha / 100})`).replace('hsl', 'hsla');
    } else if (COLOR_HSLA_REGEX.test(color)) {
      return color.replace(/,\s*\d+(\.\d+)?\)/, `, ${alpha / 100})`);
    }
  }

  return color;
}

export function hexToRgba(hex: string, alpha?: number): string {
  const colors = hexToRgbValue(hex);

  if (alpha) {
    return `rgba(${colors.join(', ')}, ${alpha > 1 ? alpha / 100 : alpha})`;
  } else {
    return `rgb(${colors.join(', ')})`;
  }
}

export function hexToRgbValue(hex: string): [number, number, number] {
  const colors = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [];
  return [parseInt(colors[1], 16), parseInt(colors[2], 16), parseInt(colors[3], 16)];
}

export function parseMediaQuery(query: ToqinMediaQueries | string, userQueries: CustomMediaQueries = {}) {
  const queries = query.replace(/^@/, '').split('@') as ToqinMediaQueries[];
  return queries.map((q) => getMedia(q, userQueries)).join(' and ');
}

export function getMedia(query: ToqinMediaQueries, userQueries: CustomMediaQueries = {}): string {
  const queries = { ...MEDIA_QUERIES };

  if (typeof userQueries === 'object') {
    for (const [key, value] of Object.entries(userQueries)) {
      if (typeof value === 'string') {
        queries[`${key}` as ToqinMediaQueries] = value;
      } else if (typeof value === 'object') {
        queries[`${key}` as ToqinMediaQueries] = value.query;
      }
    }
  }

  const q: ToqinMediaQueries = `@${query.replace(/^@/, '')}` as never;

  if (typeof queries[q] === 'string') {
    return queries[q] as string;
  }

  console.warn(`The media query "${query}" is not supported.`);

  return query;
}

export function setMedia(query: ToqinMediaQueries, value: string) {
  MEDIA_QUERIES[query] = value;
}
