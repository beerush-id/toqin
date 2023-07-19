import type { Compiler, Result, Token, TokenGroup, TokenTypes } from '../tokin.js';
import { getToken } from '../tokin.js';

export const COLOR_REGEX = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\([^)]*\)/i;
export const CSS_UNIT_REGEX = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%)$/i;
export const COLOR_HEX_REGEX = /^#([0-9a-f]{3}){1,2}$/i;
export const COLOR_RGB_REGEX = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i;
export const COLOR_RGBA_REGEX = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+(\.\d+)?)\)$/i;
export const COLOR_HSL_REGEX = /^hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)$/i;
export const COLOR_HSLA_REGEX = /^hsla\((\d+),\s*(\d+)%?,\s*(\d+)%?,\s*(\d+(\.\d+)?)\)$/i;

export type CssPluginConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  outDir?: string;
  indexName?: string;
  indexOnly?: boolean;
  extension?: 'css' | 'scss';
  addOverride?: boolean;
}

export function css(config: CssPluginConfig = {}): Compiler {
  return (design) => {
    let results: Result[] = [];

    for (const group of design.tokens) {
      const content = compileVariables(
        group.name,
        group.tokens,
        group.type,
        config,
        design.variablePrefix
      );

      results.push({
        name: group.name,
        fileName: `${ config?.outDir ?? 'tokens' }/${ group.name }.${ config?.extension ?? config?.mode ?? 'css' }`,
        content: resolveInheritances(design.tokens, content, design.variablePrefix ?? config?.prefix),
      });
    }

    if (config?.mode === 'css') {
      if (config?.indexOnly) {
        results = [
          {
            name: 'index',
            fileName: `${ config?.indexName ?? 'tokens' }.css`,
            content: results.map(item => item.content).join('\r\n')
          }
        ];
      } else {
        results.push({
          name: 'index',
          fileName: `${ config?.indexName ?? 'tokens' }.css`,
          content: results.map(item => item.content).join('\r\n')
        });
      }
    } else {
      results.push({
        name: 'index',
        fileName: `${ config?.outDir ?? 'tokens' }/index.${ config?.extension ?? config?.mode ?? 'css' }`,
        content: design.tokens.map(g => `@import "${ g.name }";`).join('\r\n') + '\r\n'
      });
    }

    return results;
  };
}

export function compileVariables(
  name: string,
  tokens: Token[],
  kind: TokenTypes,
  configs: CssPluginConfig,
  prefix?: string
) {
  const { prefix: pfx, mode, addOverride } = configs;
  const variablePrefix = prefix ?? pfx;

  const contents: string[] = [];
  const variables: string[] = parseVariables(tokens, kind, name);

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
      .map(item => `  --${ variablePrefix ? `${ variablePrefix }-` : '' }${ item };`);

    contents.push(mode === 'css' ? ':root {' : `@mixin ${ name } {`);
    contents.push(...globalContents);
    contents.push('}\r\n');
  }

  if (lightVariables.length) {
    const lightContents = lightVariables
      .map(item => `  --${ variablePrefix ? `${ variablePrefix }-` : '' }${ item };`);

    contents.push(mode === 'css' ? ':root {' : `@mixin ${ name }-light {`);
    contents.push(...lightContents);
    contents.push('}\r\n');

    if (mode === 'css' && addOverride) {
      contents.push('.prefer-light {');
      contents.push('  color-scheme: only light;');
      contents.push(...lightContents);
      contents.push('}\r\n');
    }
  }

  if (darkVariables.length) {
    const darkContents = darkVariables.map(item => `  --${ variablePrefix ? `${ variablePrefix }-` : '' }${ item };`);

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

    if (mode === 'css' && addOverride) {
      contents.push('.prefer-dark {');
      contents.push('  color-scheme: only dark;');
      contents.push(...darkContents);
      contents.push('}\r\n');
    }
  }

  return contents.join('\r\n');
}

export function parseVariables(tokens: Token[], kind: TokenTypes, parent?: string): string[] {
  const results: string[] = [];

  for (const token of tokens) {
    if (token.value) {
      const name = parent ? (token.name ? `${ parent }-${ token.name }` : parent) : token.name;

      if (typeof token.value === 'object') {
        for (const [ key, value ] of Object.entries(token.value)) {
          validate(`${ name }-${ key }`, kind, value);

          if (key === 'default') {
            results.push(`${ name }: ${ value }`);
          } else {
            results.push(`${ name }-${ key }: ${ value }`);
          }
        }
      } else {
        validate(name, kind, token.value);
        results.push(`${ name }: ${ token.value }`);
      }
    }

    if (token.tokens) {
      const childResults = parseVariables(token.tokens, kind, token.name)
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

export function resolveInheritances(tokens: TokenGroup[], content: string, prefix?: string) {
  let result = content;
  const variables = content.match(/@[\w\d.]+;/g);

  if (variables) {
    for (const search of variables) {
      const value = search.replace(/\./g, '-')
        .replace('@', `var(--${ prefix ? `${ prefix }-` : '' }`)
        .replace(';', ');');

      result = result.replace(search, value);
    }
  }

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
