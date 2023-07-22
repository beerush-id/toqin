import type {
  DesignOutput,
  DesignSystem,
  ToqinMediaQueries,
  ToqinMediaQueriesList,
  ToqinStates,
  ToqinStyleState,
} from '../../design.js';
import type { DesignSpecs } from '../../token.js';
import { parseMediaQuery, resolveCssValue } from './token-compiler.js';

export type CSSCompileDesignConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  extension?: 'css' | 'scss';
  themeClasses?: boolean;
  themeClassNames?: {
    light?: string;
    dark?: string;
  };
};

export type ElementStyles = {
  [key: string]: Partial<CSSStyleDeclaration>;
};
export type MediaSelectors = {
  [key: string]: ElementStyles;
};
export type DesignSelectors = {
  [key: string]: ElementStyles | MediaSelectors;
};

export type CSSDeclarations = {
  [key: string]: Partial<CSSStyleDeclaration>;
};
export type CSSSelectors = {
  [key: string]: unknown;
};

export type StateSelectors = {
  [key in ToqinStates]?: {
    [selector: string]: Partial<CSSStyleDeclaration>;
  };
};

export type QuerySelectors = {
  [key in ToqinMediaQueries]?: {
    [selector: string]: Partial<CSSStyleDeclaration>;
  };
};

export function compileDesign(spec: DesignSpecs, config: CSSCompileDesignConfig): DesignOutput[] {
  const outputs: DesignOutput[] = [];
  const prefix = config?.prefix ?? spec.variablePrefix;

  for (const design of spec.designs || []) {
    const output = parseDesign(spec, design, undefined, prefix);
    const contents = [cssFromDeclarations(output)];

    if (design.variants) {
      for (const variant of design.variants) {
        const variantOutput = parseDesign(spec, variant, design, prefix);
        contents.push(cssFromDeclarations(variantOutput));
      }
    }

    outputs.push({
      name: design.name,
      fileName: `designs/${design.name}.${config?.extension ?? config?.mode ?? 'css'}`,
      content: contents.join('\r\n'),
    });
  }

  return outputs;
}

export function cssFromDeclarations(declarations: DesignSelectors, space = '') {
  const contents: string[] = [];

  for (const [selector, styles] of Object.entries(declarations)) {
    contents.push(`${space}${selector.replace('!@', '@')} {`);

    if (selector.startsWith('@media') || selector.startsWith('!@media')) {
      const content = cssFromDeclarations(styles as never, space + '  ').replace(/\r\n$/, '');
      contents.push(content);
    } else {
      for (const [prop, value] of Object.entries(styles as object)) {
        contents.push(`${space}  ${prop}: ${value};`);
      }
    }

    contents.push(`${space}}\r\n`);
  }

  return contents.join('\r\n');
}

function parseDesign(spec: DesignSpecs, design: DesignSystem, parent?: DesignSystem, prefix?: string): DesignSelectors {
  const selectors: DesignSelectors = {};

  const normal: ElementStyles = {};
  const states: StateSelectors = {} as never;
  const queries: QuerySelectors = {} as never;

  for (const [prop, styles] of Object.entries(design.styles)) {
    if (typeof styles === 'string') {
      let key: string = prop as never;

      if (key.startsWith('--') && !key.startsWith('--this-')) {
        key = key.replace('--', `--this-`);
      }

      normal[key as never] = resolveCssValue(styles, prefix);
    } else if (typeof styles === 'object') {
      assignDesignValues(spec, normal, states, queries, prop as keyof CSSStyleDeclaration, styles, prefix);
    }
  }

  let tags = design.tags ?? [design.name?.toLowerCase() || ''];
  if (parent) {
    tags = (parent.tags || [parent.name]).map((tag) => `${tag}.${design.name?.toLowerCase()}`);
  }

  if (Object.keys(normal).length) {
    selectors[tags.join(', ')] = normal;
  }

  if (Object.keys(states).length) {
    mergeSelectors(selectors as MediaSelectors, parseDeclarations(tags, states));
  }

  const queryKeys = Object.keys(queries) as ToqinMediaQueries[];

  if (queryKeys.length) {
    for (const query of queryKeys) {
      const styles: CSSSelectors = queries[query] as never;
      const parsed = parseMediaQuery(query, spec.mediaQueries);
      const customs = parsed.match(/\[[\w-]+]/g);

      if (customs) {
        let queryTags: string[] = tags.map((tag) => `${customs.join('')} ${tag}`);
        let newQuery = parsed;

        if (spec?.customQueryMode === 'class') {
          queryTags = queryTags.map((tag) => tag.replace(/\[/g, '.').replace(/]/g, ''));
        } else if (spec?.customQueryMode === 'id') {
          queryTags = queryTags.map((tag) => tag.replace(/\[/g, '#').replace(/]/g, ''));
        }

        customs.forEach((c) => {
          newQuery = newQuery.replace(` and ${c}`, '').replace(`${c} and `, '').replace(c, '');
        });

        if (newQuery) {
          const q = `@media ${newQuery}`;

          if (!selectors[q]) {
            selectors[q] = {};
          }

          mergeSelectors(selectors[q], parseDeclarations(queryTags, styles));
        } else {
          mergeSelectors(selectors as MediaSelectors, parseDeclarations(queryTags, styles));
        }
      } else {
        const q = `@media ${parsed}`;

        if (!selectors[q]) {
          selectors[q] = {};
        }

        mergeSelectors(selectors[q], parseDeclarations(tags, styles));
      }
    }
  }

  return selectors;
}

function mergeSelectors(target: ElementStyles | MediaSelectors, source: ElementStyles | MediaSelectors) {
  for (const [selector, styles] of Object.entries(source)) {
    if (!target[selector]) {
      target[selector] = {};
    }

    Object.assign(target[selector], styles);
  }
}

function assignDesignValues(
  spec: DesignSpecs,
  normal: ElementStyles,
  states: StateSelectors,
  queries: QuerySelectors,
  property: keyof CSSStyleDeclaration,
  styles: ToqinStyleState,
  prefix?: string
) {
  let prop: string = property as never;

  if (prop.startsWith('--') && !prop.startsWith('--this-')) {
    prop = prop.replace('--', `--this-`);
  }

  for (const [key, style] of Object.entries(styles)) {
    if (key.startsWith('::')) {
      const s: keyof ToqinStates = key as never;

      if (!states[s]) {
        states[s] = {} as never;
      }

      if (typeof style === 'string') {
        states[s][prop] = resolveCssValue(style, prefix, spec) as never;
      } else if (typeof style === 'object') {
        Object.entries(style as ToqinMediaQueriesList).forEach(([query, value]) => {
          const q: keyof ToqinMediaQueries = query as never;

          if (!queries[q]) {
            queries[q] = {} as never;
          }

          if (!queries[q][s]) {
            queries[q][s] = {} as never;
          }

          queries[q][s][prop] = resolveCssValue(value, prefix, spec) as never;
        });
      }
    } else if (key === '@' || key === '.') {
      normal[prop as never] = resolveCssValue(style as string, prefix, spec) as never;
    } else if (key.startsWith('@')) {
      const q: keyof ToqinMediaQueries = key as never;

      if (!queries[q]) {
        queries[q] = {} as never;
      }

      if (!queries[q][prop]) {
        queries[q][prop] = {} as never;
      }

      queries[q][prop] = resolveCssValue(style as string, prefix, spec) as never;
    }
  }
}

function parseDeclarations(tags: string[], styles: CSSSelectors): CSSDeclarations {
  const selectors: any = {
    [tags.join(', ')]: {},
  };

  for (const [key, value] of Object.entries(styles)) {
    if (key.startsWith('::')) {
      const state = key.replace('::', '');
      const selector = [...tags.map((t) => `${t}:${state}`), ...tags.map((t) => `${t}.${state}`)].join(', ');

      if (!selectors[selector]) {
        selectors[selector] = {};
      }

      selectors[selector] = value;
    } else {
      selectors[tags.join(', ')][key] = value;
    }
  }

  for (const [key, value] of Object.entries(selectors)) {
    if (!Object.keys(value as object).length) {
      delete selectors[key];
    }
  }

  return selectors;
}
