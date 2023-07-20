import type { DesignSystem } from './design.js';

export type TokenTypes = 'color' | 'unit' | 'number' | 'boolean' | 'any';

export type DesignToken = {
  name: string;
  description?: string;

  tokens?: DesignToken[];
  value?: string | number | boolean | {
    default: string | number | boolean;
    [key: string]: string | number | boolean;
  };
}

export type TokenGroup = {
  name: string;
  type: TokenTypes
  description?: string;
  tokens: DesignToken[];
}

export type DesignSpecs = {
  name: string;
  tokens: TokenGroup[];

  version?: string;
  description?: string;
  variablePrefix?: string;
  designs?: DesignSystem[];
}

export type CompilerOptions = {
  outDir?: string;
  watch?: boolean;
}

export type TokenOutput = {
  name: string;
  fileName: string;
  content: string;
}

export type TokenCompiler = (spec: DesignSpecs, options?: CompilerOptions) => TokenOutput[];

export function compileToken(spec: DesignSpecs, compilers: TokenCompiler[], options?: CompilerOptions) {
  const results: TokenOutput[] = [];

  if (compilers?.length) {
    for (const compiler of compilers) {
      results.push(...compiler(spec, options));
    }
  }

  return results;
}

export function getToken(tokens: TokenGroup[], path: string): DesignToken | void {
  const paths = (path || '').split('.');

  let lists: TokenGroup[] | DesignToken[] = tokens;
  let token: DesignToken | undefined = undefined;

  for (const part of paths) {
    token = (lists as TokenGroup[] || []).find(item => item.name === part);

    if (!token) {
      return undefined;
    }

    if (token?.tokens) {
      lists = token.tokens;
    } else {
      lists = [];
    }
  }

  return token;
}

export function getTokenValue(spec: DesignSpecs, name: string): string | number | boolean {
  const token: DesignToken | void = getToken(spec.tokens, name);

  if (token && token.value) {
    return token.value as string;
  }

  return '';
}
