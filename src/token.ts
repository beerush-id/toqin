import type { DesignSystem } from './design.js';

export type TokenType = 'color' | 'unit' | 'number' | 'boolean' | 'any';

export type DesignToken = {
  name: string;
  description?: string;

  tokens?: DesignToken[];
  value?:
    | string
    | number
    | boolean
    | {
        default: string | number | boolean;
        [key: string]: string | number | boolean;
      };
};

export type TokenGroup = {
  name: string;
  type: TokenType;
  description?: string;
  tokens: DesignToken[];
};

export type CustomMediaQueries = {
  [key: string]:
    | string
    | {
        query: string;
        mediaQuery?: string;
        group?: 'color' | 'display';
        scheme?: 'light' | 'dark';
      };
};

export type TagType = 'class' | 'id' | 'attribute' | 'element';

export type DesignSpecs = {
  name: string;
  version?: string;
  description?: string;

  tokens: TokenGroup[];
  designs?: DesignSystem[];

  variablePrefix?: string;
  mediaQueries?: CustomMediaQueries;
  colorScheme?: 'light' | 'dark' | 'system' | string;
  customQueryMode?: 'attribute' | 'class' | 'id';
  strictTags?: TagType[];
  rootScope?: string;
  extends?: string[];
};

export type CompilerOptions = {
  outDir?: string;
  watch?: boolean;
};

export type DesignOutput = {
  name: string;
  content: string;
  fileName?: string;
};

export type TokenCompiler = (spec: DesignSpecs, options?: CompilerOptions) => DesignOutput[];

export function compileSpecs(spec: DesignSpecs, compilers: TokenCompiler[], options?: CompilerOptions) {
  const results: DesignOutput[] = [];

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
    token = ((lists as TokenGroup[]) || []).find((item) => item.name === part);

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

export function getTagType(tag: string): TagType {
  if (tag.startsWith('.')) {
    return 'class';
  } else if (tag.startsWith('#')) {
    return 'id';
  } else if (tag.startsWith('[')) {
    return 'attribute';
  }

  return 'element';
}
