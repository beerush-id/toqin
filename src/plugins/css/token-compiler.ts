import { merge } from '@beerush/utils/object';
import { DesignValue, MediaQuery } from '../../design.js';
import type { DesignOutput } from '../../token.js';
import { DesignSpec, DesignToken } from '../../token.js';
import { parseQueries, resolveCssValue } from './parser.js';

export type CSSCompileTokenConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  extension?: 'css' | 'scss';
  mediaQueries?: {
    [key in MediaQuery]?: string;
  };
};

export function compileToken(spec: DesignSpec, config: CSSCompileTokenConfig): DesignOutput[] {
  const outputs: DesignOutput[] = [];
  const prefix = config?.prefix ?? spec.variablePrefix;

  for (const token of (spec.tokens || [])) {
    const result = parseToken(spec, token, prefix ? `--${ prefix }` : undefined, prefix);
    const output = {
      name: token.name,
      fileName: `tokens/${ token.name }.${ config?.extension ?? config?.mode ?? 'css' }`,
      content: parseDeclarations(spec, { root: result.root as never, ...result.queries }).join('\r\n'),
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
  spec: DesignSpec,
  token: DesignToken,
  parent?: string,
  prefix?: string
): VariableDeclarations {
  const prop = parent ? (token.name ? `${ parent }-${ token.name }` : parent) : token.name;
  const root: VariableList = {};
  const queries: VariableQueries = {};

  if (typeof token.value === 'string') {
    root[prop] = resolveCssValue(spec as never, token.value, prefix, prop, token.type);
  } else if (typeof token.value === 'object') {
    const { root: r, queries: q } = parseQueries(spec as never, prop, token.value as DesignValue, prefix, token.type);

    merge(root, r);
    merge(queries, q);
  }

  if (token.tokens) {
    for (const child of token.tokens) {
      const { root: childRoot, queries: childQueries } = parseToken(spec, child, prop, prefix);

      merge(root, childRoot);
      merge(queries, childQueries);
    }
  }

  return { root, queries };
}

function parseDeclarations(spec: DesignSpec, declarations: VariableList | VariableQueries, space = ''): string[] {
  const contents: string[] = [];

  for (const [ q, declaration ] of Object.entries(declarations)) {
    if (typeof declaration === 'string') {
      contents.push(`${ space }${ q }: ${ declaration };`);
    } else if (typeof declarations === 'object') {
      const scope = q === 'root' ? (spec as any).rootScope || ':root' : (spec as any).rootScope
                                                                        ? `${ q } ${ (spec as any).rootScope }`
                                                                        : q;
      contents.push(`${ space }${ scope } {`);
      contents.push(...parseDeclarations(spec, declaration, space + '  '));
      contents.push(`${ space }}${ space === '' ? '\r\n' : '' }`);
    }
  }

  return contents;
}
