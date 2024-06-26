import type { Design, DesignImplementor, DesignMap } from './design.js';
import type { Animation, AnimationMap } from './animation.js';
import type { JSONLine, JSONPointers } from 'json-source-map';
import type { TagType, Token, TokenMap } from './token.js';
import type { FontFace } from './font.js';

export type MediaQuery = {
  query: string;
  group: 'color' | 'display';
  mediaQuery?: string;
  scheme?: 'light' | 'dark';
};
export type MediaQueries = {
  [key: string]: string | MediaQuery;
};
export type MediaQueryMap = {
  name: string;
  group: 'color' | 'display';
  query: string;
  mediaQuery?: string;
  scheme?: 'light' | 'dark';
};
export type MediaQueryKey = `@${string}`;

export type ExternalRef = {
  url: string;
  excludes?: string[];
  only?: string[];
};

export type DesignSpec = {
  name: string;
  displayName?: string;
  version?: string;
  description?: string;

  tokens?: Token[];
  designs?: Design[];
  animations?: Animation[];
  mixins?: DesignImplementor[];
  layer?: string;
  layers?: string[];

  fontFaces?: FontFace[];
  mediaQueries?: MediaQueries;
  defaultColorScheme?: 'light' | 'dark' | 'system' | string;
  customQueryMode?: 'attribute' | 'class';
  rootScope?: string;

  extends?: ExternalRef[];
  includes?: ExternalRef[];
  imports?: string[];

  excludeTokens?: string[];
  includeTokens?: string[];
};

export type LoadedDesignSpec = DesignSpec & {
  id?: string;
  url?: string;

  tokenMaps: TokenMap;
  designMaps: DesignMap;
  animationMaps: AnimationMap;

  extendedSpecs?: LoadedDesignSpec[];
  includedSpecs?: LoadedDesignSpec[];
  imports?: string[];

  pointers?: JSONPointers;
  tokenPointer?: JSONLine;
};

export type CompilerOptions = {
  outDir?: string;
  watch?: boolean;
};
export type DesignOutput = {
  name: string;
  content: string;
  fileName: string;
};

export type NestedDeclarations = {
  [key: string]: NestedDeclarations;
};
export type ScopedDeclarations = {
  root: NestedDeclarations;
  queries: NestedDeclarations;
};

export type Compiler = (spec: LoadedDesignSpec, options?: CompilerOptions) => Promise<DesignOutput[]> | DesignOutput[];

export async function compileSpecs(spec: LoadedDesignSpec, compilers: Compiler[], options?: CompilerOptions) {
  const results: DesignOutput[] = [];

  if (compilers?.length) {
    for (const compiler of compilers) {
      results.push(...(await compiler(spec, options)));
    }
  }

  return results;
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
