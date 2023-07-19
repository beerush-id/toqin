export type TokenTypes = 'color' | 'unit' | 'number' | 'boolean' | 'any';

export type Token = {
  name: string;
  description?: string;

  tokens?: Token[];
  value?: string | number | boolean | {
    default: string | number | boolean;
    [key: string]: string | number | boolean;
  };
}

export type TokenGroup = {
  name: string;
  type: TokenTypes
  description?: string;
  tokens: Token[];
}

export type DesignToken = {
  name: string;
  version?: string;
  description?: string;
  variablePrefix?: string;
  tokens: TokenGroup[];
}

export type CompilerOptions = {
  writeFile?: boolean;
  outDir?: string;
  watch?: boolean;
}

export type Result = {
  name: string;
  fileName: string;
  content: string;
}

export type Compiler = (design: DesignToken, options?: CompilerOptions) => Result[];

export function compile(design: DesignToken, compilers: Compiler[], options?: CompilerOptions) {
  const results: Result[] = [];

  if (compilers?.length) {
    for (const compiler of compilers) {
      results.push(...compiler(design, options));
    }
  }

  return results;
}

export function getToken(tokens: TokenGroup[], path: string): Token | void {
  const paths = path.split('.');

  let lists: TokenGroup[] | Token[] = tokens;
  let token: TokenGroup | void = undefined;

  while (paths.length) {
    const path = paths.shift();

    token = (lists as TokenGroup[]).find(item => item.name === path);

    if (token && token.tokens) {
      lists = token.tokens;
    } else {
      lists = [];
    }
  }

  return token;
}
