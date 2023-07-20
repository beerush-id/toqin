import type { TokenGroup, TokenOutput } from '../../token.js';
import { DesignSpecs, DesignToken, getToken, TokenTypes } from '../../token.js';

export const COLOR_REGEX = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\([^)]*\)/i;
export const CSS_UNIT_REGEX = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%)$/i;
export const COLOR_HEX_REGEX = /^#([0-9a-f]{3}){1,2}$/i;
export const COLOR_RGB_REGEX = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i;
export const COLOR_RGBA_REGEX = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(\.\d+)?)\)$/i;
export const COLOR_HSL_REGEX = /^hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)$/i;
export const COLOR_HSLA_REGEX = /^hsla\((\d+),\s*(\d+)%?,\s*(\d+)%?,\s*(\d+(\.\d+)?)\)$/i;

export type CSSCompileTokenConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  extension?: 'css' | 'scss';
  themeClasses?: boolean;
  themeClassNames?: {
    light?: string;
    dark?: string;
  }
}

export function compileToken(spec: DesignSpecs, config: CSSCompileTokenConfig): TokenOutput[] {
  const outputs: TokenOutput[] = [];
  const prefix = config?.prefix ?? spec.variablePrefix;

  for (const group of spec.tokens) {
    const content = compileVariables(
      group.name,
      group.tokens,
      group.type,
      config,
      prefix
    );

    outputs.push({
      name: group.name,
      fileName: `tokens/${ group.name }.${ config?.extension ?? config?.mode ?? 'css' }`,
      content: resolveCssInheritances(spec.tokens, content, prefix),
    });
  }

  return outputs;
}

export function compileVariables(
  name: string,
  tokens: DesignToken[],
  kind: TokenTypes,
  configs: CSSCompileTokenConfig,
  prefix?: string
) {
  const { mode = 'css', themeClasses = true, themeClassNames = {} } = configs || {};
  const { light: lightClass = 'prefer-light', dark: darkClass = 'prefer-dark' } = themeClassNames || {};
  const contents: string[] = [];
  const variables: string[] = parseVariables(tokens, kind, name, prefix);

  const globalVariables: string[] = variables
    .filter(item => !item.includes('-@light:') && !item.includes('-@dark:'));
  const lightVariables: string[] = variables
    .filter(item => item.includes('-@light:'))
    .map(item => item.replace('-@light:', ':'));
  const darkVariables: string[] = variables
    .filter(item => item.includes('-@dark:'))
    .map(item => item.replace('-@dark:', ':'));

  if (globalVariables.length) {
    const globalContents = globalVariables
      .map(item => `  --${ prefix ? `${ prefix }-` : '' }${ item };`);

    contents.push(mode === 'css' ? ':root {' : `@mixin ${ name } {`);
    contents.push(...globalContents);
    contents.push('}\r\n');
  }

  if (lightVariables.length) {
    const lightContents = lightVariables
      .map(item => `  --${ prefix ? `${ prefix }-` : '' }${ item };`);

    contents.push(mode === 'css' ? ':root {' : `@mixin ${ name }-light {`);
    contents.push(...lightContents);
    contents.push('}\r\n');

    if (mode === 'css' && themeClasses) {
      contents.push(`.${ lightClass } {`);
      contents.push('  color-scheme: only light;');
      contents.push(...lightContents);
      contents.push('}\r\n');
    }
  }

  if (darkVariables.length) {
    const darkContents = darkVariables.map(item => `  --${ prefix ? `${ prefix }-` : '' }${ item };`);

    if (mode === 'css') {
      contents.push('@media (prefers-color-scheme: dark) {');
      contents.push('  :root {');
      contents.push(...darkContents.map(item => `  ${ item }`));
      contents.push('  }');
      contents.push('}\r\n');
    } else {
      contents.push(`@mixin ${ name }-dark {`);
      contents.push(...darkContents);
      contents.push('}\r\n');
    }

    if (mode === 'css' && themeClasses) {
      contents.push(`.${ darkClass } {`);
      contents.push('  color-scheme: only dark;');
      contents.push(...darkContents);
      contents.push('}\r\n');
    }
  }

  return contents.join('\r\n');
}

export function parseVariables(tokens: DesignToken[], kind: TokenTypes, parent?: string, prefix?: string): string[] {
  const results: string[] = [];

  for (const token of tokens) {
    if (token.value) {
      const name = parent ? (token.name ? `${ parent }-${ token.name }` : parent) : token.name;

      if (typeof token.value === 'object') {
        for (const [ key, value ] of Object.entries(token.value)) {
          validate(`${ name }-${ key }`, kind, value);

          if (key === 'default') {
            results.push(`${ name }: ${ resolveCssValue(value as string, prefix) }`);
          } else {
            results.push(`${ name }-${ key }: ${ resolveCssValue(value as string, prefix) }`);
          }
        }
      } else {
        validate(name, kind, token.value);
        results.push(`${ name }: ${ resolveCssValue(token.value as string, prefix) }`);
      }
    }

    if (token.tokens) {
      const childResults = parseVariables(token.tokens, kind, token.name, prefix)
        .map(item => parent ? `${ parent }-${ item }` : item);
      results.push(...childResults);
    }
  }

  return results;
}

export function validate(name: string, kind: TokenTypes, value: unknown) {
  if (typeof value === 'string' && (
    value.startsWith('@') ||
    value.startsWith('$') ||
    value.startsWith('~') ||
    value.startsWith('var(') ||
    value.startsWith('calc(')
  )) {
    return;
  }

  switch (kind) {
    case 'color':
      if (typeof value !== 'string') {
        throw new Error(`The value of "${ name }: ( ${ value } )" must be a string.`);
      }

      if (!COLOR_REGEX.test(value)) {
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

export function resolveCssValue(value: string, prefix?: string): string {
  const globals = value.match(/@[\w\d.-]+/g);

  if (globals) {
    globals.forEach(item => {
      const variable = item
        .replace('@', '')
        .replace(/\./g, '-');

      value = value.replace(item, `var(--${ prefix ? prefix + '-' : '' }${ variable })`);
    });
  }

  const locals = value.match(/~[\w\d.-]+/g);

  if (locals) {
    locals.forEach(item => {
      const variable = item
        .replace('~', '')
        .replace(/\./g, '-');

      value = value.replace(item, `var(--${ variable })`);
    });
  }

  return value;
}

export function resolveCssInheritances(tokens: TokenGroup[], content: string, prefix?: string) {
  let result = content;

  const copies = content.match(/\$[\w\d.!]+;/g);

  if (copies) {
    for (const copy of copies) {
      const [ key, alpha ] = copy.replace('$', '')
        .replace(';', '')
        .split('!');

      const token = getToken(tokens, key);

      if (token && token.value) {
        if (alpha) {
          result = result.replace(copy, colorOpacity(token.value as string, alpha) + ';');
        } else {
          result = result.replace(copy, token.value as string + ';');
        }
      }
    }
  }

  return result;
}

export function colorOpacity(color: string, opacity: string | number): string {
  const alpha = parseFloat(opacity as string);

  if (COLOR_REGEX.test(color)) {
    if (COLOR_HEX_REGEX.test(color)) {
      return hexToRgba(color, alpha);
    } else if (COLOR_RGB_REGEX.test(color)) {
      return color.replace(')', `, ${ alpha / 100 })`)
        .replace('rgb', 'rgba');
    } else if (COLOR_RGBA_REGEX.test(color)) {
      return color.replace(/,\s*\d+(\.\d+)?\)/, `, ${ alpha / 100 })`);
    } else if (COLOR_HSL_REGEX.test(color)) {
      return color.replace(')', `, ${ alpha / 100 })`)
        .replace('hsl', 'hsla');
    } else if (COLOR_HSLA_REGEX.test(color)) {
      return color.replace(/,\s*\d+(\.\d+)?\)/, `, ${ alpha / 100 })`);
    }
  }

  return color;
}

export function hexToRgba(hex: string, alpha?: number): string {
  const colors = hexToRgbValue(hex);

  if (alpha) {
    return `rgba(${ colors.join(', ') }, ${ alpha > 1 ? alpha / 100 : alpha })`;
  } else {
    return `rgb(${ colors.join(', ') })`;
  }
}

export function hexToRgbValue(hex: string): [ number, number, number ] {
  const colors = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [];
  return [ parseInt(colors[1], 16), parseInt(colors[2], 16), parseInt(colors[3], 16) ];
}

export function parseMediaQuery(query: string) {
  const queries = query
    .replace(/^@/, '')
    .split('@');
  return queries.map(getMedia).join(' and ');
}

export function getMedia(query: string) {
  switch (query.replace('@', '')) {
    case 'light':
      return '(prefers-color-scheme: light)';
    case 'dark':
      return '(prefers-color-scheme: dark)';
    case 'mobile':
      return '(max-width: 767px)';
    case 'tablet':
      return '(min-width: 768px) and (max-width: 1023px)';
    case 'desktop':
      return '(min-width: 1024px)';
    case 'print':
      return 'print';
    default:
      return query;
  }
}
