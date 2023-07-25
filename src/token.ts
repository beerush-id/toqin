import type { DesignSystem } from './design.js';

export type TokenType = 'color' | 'unit' | 'number' | 'boolean' | 'any';

export type DesignToken = {
  name: string;
  description?: string;
  type?: TokenType;
  url?: string;

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

export type DesignSpec = {
  name: string;
  version?: string;
  description?: string;

  tokens?: DesignToken[];
  initTokens?: DesignToken[];
  designs?: DesignSystem[];
  initDesigns?: DesignSystem[];

  variablePrefix?: string;
  mediaQueries?: CustomMediaQueries;
  colorScheme?: 'light' | 'dark' | 'system' | string;
  customQueryMode?: 'attribute' | 'class' | 'id';
  strictTags?: TagType[];
  rootScope?: string;

  id?: string;
  url?: string;
  extends?: string[];
  extendedSpecs?: DesignSpec[];
  includes?: string[];
  includedSpecs?: DesignSpec[];
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

export type TokenCompiler = (spec: DesignSpec, options?: CompilerOptions) => Promise<DesignOutput[]> | DesignOutput[];

export async function compileSpecs(spec: DesignSpec, compilers: TokenCompiler[], options?: CompilerOptions) {
  const results: DesignOutput[] = [];

  if (compilers?.length) {
    for (const compiler of compilers) {
      results.push(...await compiler(spec, options));
    }
  }

  return results;
}

export function getToken(tokens: DesignToken[], path: string): DesignToken | void {
  const paths = (path || '').split('.');

  let lists: DesignToken[] = tokens;
  let token: DesignToken | undefined = undefined;

  for (const part of paths) {
    token = lists.find((item) => item.name === part);

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
