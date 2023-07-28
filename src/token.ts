import type { DesignSystem, DesignValue } from './design.js';
import { DesignType } from './design.js';
import type { AnimationMap, AnimationSpec } from './animation.js';
import type { JSONLine, JSONPointers } from 'json-source-map';

export type TokenType = 'color' | 'unit' | 'number' | 'boolean' | 'any';

export type DesignToken = {
  name: string;
  description?: string;
  tags?: string[];
  type?: TokenType;
  url?: string;

  tokens?: DesignToken[];
  value?: DesignValue;
};

export type CustomMediaQuery = {
  query: string;
  group?: 'color' | 'display';
  scheme?: 'light' | 'dark';
};

export type MediaQueryMap = {
  name: string;
  group: 'color' | 'display';
  query: string;
  scheme?: 'light' | 'dark';
}

export type CustomMediaQueries = {
  [key: string]: string | CustomMediaQuery;
};

export type TagType = 'class' | 'id' | 'attribute' | 'element';

export type TokenRef = {
  name: string;
  value: string;
  path?: string;
  type?: TokenType;
  tags?: string[];
  url?: string;
  pointer?: JSONLine;
  valuePointer?: JSONLine;
};

export type TokenMap = {
  [path: string]: TokenRef;
};

export type DesignRules = {
  [prop: string]: DesignValue;
};

export type DesignRef = {
  type: string;
  name: string;
  selectors: string[];
  rules: DesignRules;
  root?: boolean;
  important?: boolean;
  url?: string;
  pointer?: JSONLine;
  path?: string;
};

export type DesignMap = {
  [selector: string]: DesignRef;
};

export type PseudoVariant = {
  name: string;
  type: DesignType;
}

export type DesignSpec = {
  name: string;
  version?: string;
  description?: string;

  tokens?: DesignToken[];
  tokenMaps?: TokenMap;
  designs?: DesignSystem[];
  designMaps?: DesignMap;
  animations?: AnimationSpec[];
  animationMaps?: AnimationMap;

  variablePrefix?: string;
  mediaQueries?: CustomMediaQueries;
  defaultColorScheme?: 'light' | 'dark' | 'system' | string;
  customQueryMode?: 'attribute' | 'class';
  rootScope?: string;

  excludeTokens?: string[];
  includeTokens?: string[];

  id?: string;
  url?: string;
  extends?: string[];
  extendedSpecs?: DesignSpec[];
  includes?: string[];
  includedSpecs?: DesignSpec[];

  pointers?: JSONPointers;
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

export type NestedDeclarations = {
  [key: string]: NestedDeclarations;
};

export type ScopedDeclarations = {
  root: NestedDeclarations;
  queries: NestedDeclarations;
};

export type TokenCompiler = (spec: DesignSpec, options?: CompilerOptions) => Promise<DesignOutput[]> | DesignOutput[];

export async function compileSpecs(spec: DesignSpec, compilers: TokenCompiler[], options?: CompilerOptions) {
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
