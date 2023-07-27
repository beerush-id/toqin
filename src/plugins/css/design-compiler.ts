import type { DesignSystem, ElementState, MediaQuery, MediaQueryList, ToqinStyleState } from '../../design.js';
import type { DesignOutput, DesignSpec, NestedDeclarations, TagType } from '../../token.js';
import { getTagType } from '../../token.js';
import { parseMediaQuery, resolveCssValue } from './parser.js';
import { MOZ_PSEUDO_STATES, PSEUDO_STATES } from '../../parser.js';

export type CSSCompileDesignConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  extension?: 'css' | 'scss';
  stateClasses?: boolean;
  mergeStateClasses?: boolean;
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
  [key in ElementState]?: {
    [selector: string]: Partial<CSSStyleDeclaration>;
  };
};

export type QuerySelectors = {
  [key in MediaQuery]?: {
    [selector: string]: Partial<CSSStyleDeclaration>;
  };
};

function joinTags(target: string[], source: string[], joint = '') {
  const tags: string[] = [];

  for (const t of target) {
    for (const s of source) {
      tags.push(`${ t }${ joint }${ s }`);
    }
  }

  return tags;
}

function strictTags(tags: string[], filters: TagType[]): string[] {
  return tags.filter((tag) => filters.includes(getTagType(tag)));
}

function scopeTags(tags: string[], scope?: string) {
  return scope ? tags.map((tag) => `${ scope } ${ tag }`) : tags;
}

function ensureTags(design: DesignSystem, filters?: TagType[], scope?: string): string[] {
  const tags = (design.selectors || [ `.${ design.name?.toLowerCase() || '' }` ]).filter((t) => t !== '.');

  if (filters?.length) {
    return scopeTags(strictTags(tags, filters), scope);
  }

  return scopeTags(tags, scope);
}

function parseDesign(
  spec: DesignSpec,
  design: DesignSystem,
  extend?: DesignSystem,
  parent?: DesignSystem,
  prefix?: string,
  config?: CSSCompileDesignConfig
): DesignSelectors {
  let tags = ensureTags(design, !design.important ? (spec as any).strictTags : undefined);

  if (!tags.length) {
    return {};
  }

  if (extend) {
    const extendedTags = ensureTags(extend, (spec as any).strictTags);
    tags = joinTags(extendedTags, tags);
  } else if (parent) {
    const parentTags = ensureTags(parent, (spec as any).strictTags);
    tags = joinTags(parentTags, tags, ' ');
  }

  if (spec.rootScope) {
    if (design.root) {
      tags = [ spec.rootScope ];
    } else if (!design.important) {
      tags = scopeTags(tags, spec.rootScope);
    }
  }

  const selectors: DesignSelectors = {};
  const normal: ElementStyles = {};
  const states: StateSelectors = {} as never;
  const queries: QuerySelectors = {} as never;

  for (const [ prop, styles ] of Object.entries(design.rules)) {
    if (typeof styles === 'string') {
      let key: string = prop as never;

      if (key.startsWith('--') && !key.startsWith('--this-')) {
        key = key.replace('--', `--this-`);
      }

      normal[key as never] = resolveCssValue(spec as any, styles, prefix);
    } else if (typeof styles === 'object') {
      assignDesignValues(spec, normal, states, queries, prop as keyof CSSStyleDeclaration, styles, prefix);
    }
  }

  if (Object.keys(normal).length) {
    selectors[tags.join(', ')] = normal;
  }

  if (Object.keys(states).length) {
    mergeSelectors(selectors as MediaSelectors, parseDeclarations(tags, states, config));
  }

  const queryKeys = Object.keys(queries) as MediaQuery[];

  if (queryKeys.length) {
    for (const query of queryKeys) {
      const styles: CSSSelectors = queries[query] as never;
      const parsed = parseMediaQuery(query, spec.mediaQueries);
      const customs = parsed.match(/\[[\w-]+]/g);

      if (customs) {
        let queryTags: string[] = tags.map((tag) => `${ customs.join('') } ${ tag }`);
        let newQuery = parsed;

        if (spec?.customQueryMode === 'class') {
          queryTags = queryTags.map((tag) => tag.replace(/\[/g, '.').replace(/]/g, ''));
        } else if ((spec as any)?.customQueryMode === 'id') {
          queryTags = queryTags.map((tag) => tag.replace(/\[/g, '#').replace(/]/g, ''));
        }

        customs.forEach((c) => {
          newQuery = newQuery.replace(` and ${ c }`, '').replace(`${ c } and `, '').replace(c, '');
        });

        if (newQuery) {
          const q = `@media ${ newQuery }`;

          if (!selectors[q]) {
            selectors[q] = {};
          }

          mergeSelectors(selectors[q], parseDeclarations(queryTags, styles, config));
        } else {
          mergeSelectors(selectors as MediaSelectors, parseDeclarations(queryTags, styles, config));
        }
      } else {
        const q = `@media ${ parsed }`;

        if (!selectors[q]) {
          selectors[q] = {};
        }

        mergeSelectors(selectors[q], parseDeclarations(tags, styles, config));
      }
    }
  }

  return selectors;
}

function mergeSelectors(target: ElementStyles | MediaSelectors, source: ElementStyles | MediaSelectors) {
  for (const [ selector, styles ] of Object.entries(source)) {
    if (!target[selector]) {
      target[selector] = {};
    }

    Object.assign(target[selector], styles);
  }
}

function assignDesignValues(
  spec: DesignSpec,
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

  for (const [ key, style ] of Object.entries(styles)) {
    if (key.startsWith('::')) {
      const s: keyof ElementState = key as never;

      if (!states[s]) {
        states[s] = {} as never;
      }

      if (typeof style === 'string') {
        states[s][prop] = resolveCssValue(spec as any, style, prefix) as never;
      } else if (typeof style === 'object') {
        Object.entries(style as MediaQueryList).forEach(([ query, value ]) => {
          const q: keyof MediaQuery = query as never;

          if (q === '@' || q === '.') {
            states[s] = states[s] || {};
            states[s][prop] = resolveCssValue(spec as any, value, prefix) as never;
          } else {
            if (!queries[q]) {
              queries[q] = {} as never;
            }

            if (!queries[q][s]) {
              queries[q][s] = {} as never;
            }

            queries[q][s][prop] = resolveCssValue(spec as any, value, prefix) as never;
          }
        });
      }
    } else if (key === '@' || key === '.') {
      normal[prop as never] = resolveCssValue(spec as any, style as string, prefix) as never;
    } else if (key.startsWith('@')) {
      const q: keyof MediaQuery = key as never;

      if (!queries[q]) {
        queries[q] = {} as never;
      }

      if (!queries[q][prop]) {
        queries[q][prop] = {} as never;
      }

      queries[q][prop] = resolveCssValue(spec as any, style as string, prefix) as never;
    }
  }
}

function parseDeclarations(tags: string[], styles: CSSSelectors, config?: CSSCompileDesignConfig): CSSDeclarations {
  const stateSelectors: NestedDeclarations = {};
  const selectors: any = {
    [tags.join(', ')]: {},
  };

  for (const [ key, value ] of Object.entries(styles)) {
    if (key.startsWith('::')) {
      const state = key.replace('::', '');
      const baseSelectors = tags.map((t) => {
        if (PSEUDO_STATES.includes(state) || MOZ_PSEUDO_STATES.includes(state)) {
          return `${ t }:${ state }`;
        }

        return `${ t }::${ state }`;
      });

      if (PSEUDO_STATES.includes(state) && config && (config.stateClasses || !('stateClasses' in config))) {
        const stateSelector = tags.map(t => `${ t }.${ state }`);

        if (config?.mergeStateClasses) {
          baseSelectors.unshift(...stateSelector);
        } else {
          const selector = stateSelector.sort((a, b) => a.localeCompare(b)).join(', ');
          if (!stateSelectors[selector]) {
            stateSelectors[selector] = {};
          }

          stateSelectors[selector] = value as never;
        }
      }

      const selector = baseSelectors.sort((a, b) => a.localeCompare(b)).join(', ');

      if (!selectors[selector]) {
        selectors[selector] = {};
      }

      selectors[selector] = value;
    } else {
      selectors[tags.join(', ')][key] = value;
    }
  }

  for (const [ key, value ] of Object.entries(selectors)) {
    if (!Object.keys(value as object).length) {
      delete selectors[key];
    }
  }

  return { ...stateSelectors, ...selectors };
}

export function cssFromDeclarations(declarations: DesignSelectors, space = '') {
  const contents: string[] = [];

  for (const [ selector, styles ] of Object.entries(declarations)) {
    const formattedSelector = `${ space }${ selector.replace('!@', '@') }`.replace(/,\s?/g, `,\r\n${ space }`);
    contents.push(`${ formattedSelector } {`);

    if (selector.startsWith('@media') || selector.startsWith('!@media')) {
      const content = cssFromDeclarations(styles as never, space + '  ').replace(/\r\n$/, '');
      contents.push(content);
    } else {
      for (const [ prop, value ] of Object.entries(styles as object)) {
        contents.push(`${ space }  ${ prop }: ${ value };`);
      }
    }

    contents.push(`${ space }}\r\n`);
  }

  return contents.join('\r\n');
}

export function compileDesign(spec: DesignSpec, config: CSSCompileDesignConfig): DesignOutput[] {
  const outputs: DesignOutput[] = [];
  const prefix = config?.prefix ?? spec.variablePrefix;

  for (const design of spec.designs || []) {
    const output = parseDesign(spec, design, undefined, undefined, prefix, config);
    const contents = [ cssFromDeclarations(output) ];

    if (design.variants?.length) {
      for (const variant of design.variants) {
        const variantOutput = parseDesign(spec, variant, design, undefined, prefix, config);
        contents.push(cssFromDeclarations(variantOutput));
      }
    }

    if (design.children?.length) {
      for (const child of design.children) {
        const childOutput = parseDesign(spec, child, undefined, design, prefix, config);
        contents.push(cssFromDeclarations(childOutput));
      }
    }

    outputs.push({
      name: design.name,
      fileName: `designs/${ design.name }.${ config?.extension ?? config?.mode ?? 'css' }`,
      content: [
        ...contents
      ].join('\r\n'),
    });
  }

  return outputs;
}
