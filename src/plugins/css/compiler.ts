import type {
  CustomMediaQueries,
  CustomMediaQuery,
  DesignSpec,
  MediaQueryMap,
  NestedDeclarations,
  TokenMap
} from '../../token.js';
import { getTagType, TagType } from '../../token.js';
import { MEDIA_QUERIES, parseQueries, resolveCssValue, similarQuery } from './parser.js';
import { merge } from '@beerush/utils/object';
import type { JSONLine } from 'json-source-map';
import { anyRegEx, mergeTokenMaps } from '../../parser.js';
import { helper } from './helper.js';
import { logger } from '../../logger.js';
import { script } from './script.js';

export type CSSMap = {
  input: [ number, number ];
  output: [ number, number ];
  name?: string;
  url?: string;
}

export type LineMap = {
  pointer?: JSONLine;
  url?: string;
  name?: string;
}

export type CSSCompilerOptions = {
  prefix?: string;
  scope?: string;
  mediaQueries?: CustomMediaQueries;
  strictTags?: TagType[];
  defaultColorScheme?: 'light' | 'dark' | 'system' | string;
  includeTokens?: string[];
  excludeTokens?: string[];
  customQueryMode?: 'attribute' | 'class' | 'id';
};

type CompilerOptions = CSSCompilerOptions & { tokens: TokenMap };

export class CSSCompiler {
  public name: string;
  public currentLine = 1;
  public contents: string[] = [];
  public sourceMaps: CSSMap[] = [];
  public tokenMaps: TokenMap;
  public mediaQueries: CustomMediaQueries;
  public colorSchemes: { type: string; selector: string; }[] = [];

  public get mediaQueryMaps(): MediaQueryMap[] {
    const queries: MediaQueryMap[] = [];

    for (const [ name, option ] of Object.entries(this.mediaQueries)) {
      if (typeof option === 'string' && option.includes('[')) {
        const group = option.includes('light') || option.includes('dark') ? 'color' : 'display';
        const scheme = option.includes('light') ? 'light' : option.includes('dark') ? 'dark' : undefined;
        const query = option.replace(/\[|\]/g, '');
        const mediaQuery = similarQuery(query);

        queries.push({ name, group, query, mediaQuery, scheme, });
      } else if (typeof option === 'object') {
        const { query, mediaQuery, group = 'display', scheme } = option as CustomMediaQuery;

        if (query.includes('[')) {
          queries.push({
            name,
            group,
            scheme,
            query: query.replace(/\[|\]/g, ''),
            mediaQuery: mediaQuery || similarQuery(query)
          });
        }
      }
    }

    return queries;
  }

  constructor(public spec: DesignSpec, public config?: Partial<CSSCompilerOptions>, public parent?: CSSCompiler) {
    this.name = spec.name;
    this.tokenMaps = parent?.tokenMaps || mergeTokenMaps(spec);
    this.mediaQueries = parent?.mediaQueries || { ...MEDIA_QUERIES, ...(config?.mediaQueries || spec.mediaQueries) };
  }

  public createScript(id: string) {
    return [
      this.createHmrScript(id),
      this.createHelperScript()
    ].join('\r\n');
  }

  public createHelperScript() {
    const queries = JSON.stringify(this.mediaQueryMaps);
    const scheme = this.config?.defaultColorScheme || this.spec.defaultColorScheme || 'system';
    const mode = this.config?.customQueryMode || this.spec.customQueryMode || 'class';

    return [
      `(${ helper.toString() })`,
      `(${ queries }, '${ mode }', '${ scheme }');`
    ].join('');
  }

  public createHmrScript(id: string) {
    return [
      `(${ script.toString() })`,
      `('${ id }', '${ this.spec.version }');`
    ].join('\r\n');
  }

  public compile(options?: CSSCompilerOptions, fromLine?: number): this {
    const { spec } = this;
    const config = {
      tokens: this.tokenMaps,
      scope: this.config?.scope || this.spec.rootScope,
      mediaQueries: this.mediaQueries,
      strictTags: this.config?.strictTags,

      prefix: this.config?.prefix || 'tq',
      customQueryMode: this.config?.customQueryMode || this.spec.customQueryMode || 'class',
      colorScheme: this.config?.defaultColorScheme || this.spec.defaultColorScheme || 'system',
      excludeTokens: this.config?.excludeTokens || this.spec.excludeTokens,
      includeTokens: this.config?.includeTokens || this.spec.includeTokens
    };

    const compilerOptions = { ...config, ...options } as CompilerOptions;

    if (fromLine) {
      this.currentLine = fromLine;
    }

    if (!this.parent) {
      this.assignColorScheme(compilerOptions);
    }

    if (spec.extendedSpecs?.length) {
      for (const extendedSpec of spec.extendedSpecs) {
        const css = new CSSCompiler(extendedSpec, this.config, this);

        css.compile(compilerOptions, this.currentLine);

        this.currentLine = css.currentLine;
        this.contents.push(...css.contents);
        this.sourceMaps.push(...css.sourceMaps);
      }
    }

    this.writeTokens(compilerOptions);
    this.writeAnimations(compilerOptions);
    this.writeDesigns(compilerOptions);

    if (spec.includedSpecs?.length) {
      for (const includedSpec of spec.includedSpecs) {
        const css = new CSSCompiler(includedSpec, this.config, this);

        css.compile(compilerOptions, this.currentLine);

        this.currentLine = css.currentLine;
        this.contents.push(...css.contents);
        this.sourceMaps.push(...css.sourceMaps);
      }
    }

    return this;
  }

  public stringify(): string {
    return this.contents.join('\r\n');
  }

  private assignColorScheme(options: Partial<CSSCompilerOptions>) {
    for (const [ , option ] of Object.entries(this.mediaQueries)) {
      if (typeof option === 'string' && option.includes('[')) {
        if (option.includes('light') || option.includes('dark')) {
          this.putColorScheme(option, option.includes('light') ? 'light' : 'dark', options);
        }
      } else if (typeof option === 'object' && option.group === 'color') {
        const { query, scheme } = option as CustomMediaQuery;

        if (query.includes('[')) {
          this.putColorScheme(query, scheme, options);
        }
      }
    }
  }

  private putColorScheme(query: string, color?: string, options: Partial<CSSCompilerOptions> = {}) {
    const { customQueryMode = 'class' } = options;
    let selector = query;

    if ([ 'class', 'id' ].includes(customQueryMode)) {
      selector = selector
        .replace('[', customQueryMode === 'class' ? '.' : '#')
        .replace(']', '');
    }

    this.colorSchemes.push({ selector, type: customQueryMode });

    this.putLine(`${ selector } {`);
    this.putLine(`  color-scheme: only ${ color };`);
    this.putLine(`}`);
    this.putLine('');
  }

  private writeTokens(options: CompilerOptions) {
    if (!Object.keys(this.spec.tokenMaps || {}).length) {
      return;
    }

    const scope = options?.scope || ':root';
    const prefix = options?.prefix;
    const line = this.spec.tokenPointer && {
      pointer: this.spec.tokenPointer,
      name: scope,
      url: this.spec.url
    } as LineMap;

    this.putLine(`${ scope } {`, line);

    const queries: NestedDeclarations = {};

    for (const [ name, ref ] of Object.entries(this.spec.tokenMaps || {})) {
      if (this.shouldIgnore(name, options)) {
        logger.info('Skipping due to an exclusion rule:', name);
        continue;
      }

      const mQueries = name.match(/\.@[\w\-@]+$/);

      if (mQueries) {
        let prop = name;
        mQueries.forEach((n) => (prop = prop.replace(n, '')));
        prop = `--${ prefix ? prefix + '-' : '' }${ prop.replace(/\./g, '-') }`;

        mQueries.forEach((n) => {
          const { queries: q } = parseQueries(
            options,
            prop,
            { [n.replace('.', '')]: ref.value },
            prefix,
            ref.type,
            scope
          );

          merge(queries, q);
        });
      } else {
        const prop = `--${ prefix ? prefix + '-' : '' }${ name.replace(/\./g, '-') }`;
        const value = resolveCssValue(this.tokenMaps, ref.value, prefix, name, ref.type);

        // this.putLine(`  ${ prop }: ${ value };`, {
        //   pointer: ref.pointer, name: prop, url: ref.sourceUrl
        // });

        this.putLine(`  ${ prop }: ${ value };`);
      }
    }

    this.putLine(`}`);
    this.putLine('');

    if (Object.keys(queries).length) {
      this.putLines(queries, '', line);
    }
  }

  private writeAnimations(options: CompilerOptions) {
    const prefix = options?.prefix;

    for (const [ name, ref ] of Object.entries(this.spec.animationMaps || {})) {
      if (Object.keys(ref.frames || {}).length) {
        const selector = `@keyframes ${ prefix }-${ name.replace(/\./g, '-') }`;
        this.putLine(`${ selector } {`, {
          pointer: ref.pointer,
          name: ref.name,
          url: ref.url
        });

        for (const [ key, rules ] of Object.entries(ref.frames)) {
          this.putLine(`  ${ key } {`);

          for (const [ prop, value ] of Object.entries(rules || {})) {
            if (typeof value === 'string') {
              const resolvedValue = resolveCssValue(this.tokenMaps, value, prefix, prop);
              this.putLine(`    ${ prop }: ${ resolvedValue };`);
            }
          }

          this.putLine(`  }`);
        }

        this.putLine(`}`);
        this.putLine('');
      }
    }
  }

  private writeDesigns(options: CompilerOptions) {
    const scope = options?.scope;
    const prefix = options?.prefix;

    for (const [ selector, ref ] of Object.entries(this.spec.designMaps || {})) {
      let selectors = selector.split(/\s?,\s?/);

      if (options?.strictTags?.length) {
        selectors = selectors.filter((s) => {
          const type = getTagType(s);

          if (!options?.strictTags?.includes(type) || ref.important) {
            return true;
          }
        });
      }

      if (!selectors.length) {
        continue;
      }

      if (scope && !ref.important) {
        selectors = selectors.map((s) => `${ scope } ${ s }`);
      }

      if (scope && ref.root) {
        selectors = [ scope ];
      }

      if (ref.rules && Object.keys(ref.rules).length) {
        const queries: NestedDeclarations = {};
        const line = ref.pointer && {
          pointer: ref.pointer,
          name: selectors.join(', '),
          url: ref.sourceUrl
        };

        this.putLine(`${ selectors.join(', ') } {`, line);

        for (const [ name, valueRef ] of Object.entries(ref.rules)) {
          let prop = name;

          if (prop.startsWith('--') && !prop.startsWith('--this')) {
            prop = prop.replace('--', `--this-`);
          }

          if (typeof valueRef === 'object') {
            const { root, queries: q } = parseQueries(
              options,
              prop,
              valueRef,
              prefix,
              undefined,
              selectors.join(', ')
            );

            for (const [ key, value ] of Object.entries(root)) {
              let subProp = key;

              if (subProp.startsWith('--') && !subProp.startsWith('--this')) {
                subProp = subProp.replace('--', `--this-`);
              }

              this.putLine(`  ${ subProp }: ${ value };`);
            }

            merge(queries, q);
          } else if (typeof (valueRef as string) === 'string') {
            const value = resolveCssValue(this.tokenMaps, valueRef as string, prefix, prop);
            this.putLine(`  ${ prop }: ${ value };`);
          }
        }

        this.putLine(`}`);
        this.putLine('');

        if (Object.keys(queries).length) {
          this.putLines(queries, '', line);
        }
      }
    }
  }

  private putLines(maps: NestedDeclarations, space = '', line?: LineMap) {
    const keys = Object.keys(maps);
    keys.forEach((key, i) => {
      const value = maps[key];

      if (typeof value === 'object') {
        this.putLine(`${ space }${ key } {`, line);
        this.putLines(value, `${ space }  `, line);
        this.putLine(`${ space }}`);

        if (i < keys.length - 1 || !space) {
          this.putLine('');
        }
      } else if (typeof (value as string) === 'string') {
        this.putLine(`${ space }${ key }: ${ value };`, line);
      }
    });
  }

  private putLine(text: string, line?: LineMap) {
    if (line) {
      const column = text.match(/^\s+/)?.[0].length ?? 0;
      const input = [ (line.pointer?.line ?? 0) + 1, line.pointer?.column ?? 0 ];
      const output = [ this.currentLine, column ];
      this.sourceMaps.push({ input, output, name: line.name, url: line.url } as never);
    }

    this.currentLine++;
    this.contents.push(text);
  }

  private shouldIgnore(token: string, options?: Partial<CSSCompilerOptions>): boolean {
    const exclude = (options?.excludeTokens || []).filter(r => anyRegEx(r).test(token));
    const include = (options?.includeTokens || []).filter(r => anyRegEx(r).test(token));

    return exclude.length > 0 && include.length < 1;
  }
}
