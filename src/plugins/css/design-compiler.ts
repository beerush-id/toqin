import type {
  DesignOutput,
  DesignSystem,
  ToqinMediaQueries,
  ToqinMediaQueriesList,
  ToqinStates,
  ToqinStyleState
} from '../../design.js';
import type { DesignSpecs } from '../../token.js';
import { getMedia, parseMediaQuery, resolveCssInheritances, resolveCssValue } from './token-compiler.js';

export type CSSCompileDesignConfig = {
  mode?: 'css' | 'scss';
  prefix?: string;
  extension?: 'css' | 'scss';
  themeClasses?: boolean;
  themeClassNames?: {
    light?: string;
    dark?: string;
  }
}

export type ElementSelectors = {
  [key: string]: Partial<CSSStyleDeclaration>;
}
export type MediaSelectors = {
  [key: string]: ElementSelectors
}
export type DesignSelectors = {
  [key: string]: ElementSelectors | MediaSelectors;
}

export type CSSDeclarations = {
  [key: string]: Partial<CSSStyleDeclaration>;
}
export type CSSSelectors = {
  [key: string]: unknown;
}

export type StateSelectors = {
  [key in ToqinStates]?: {
    [selector: string]: Partial<CSSStyleDeclaration>;
  }
}

export type QuerySelectors = {
  [key in ToqinMediaQueries]?: {
    [selector: string]: Partial<CSSStyleDeclaration>;
  }
}

export function compileDesign(spec: DesignSpecs, config: CSSCompileDesignConfig): DesignOutput[] {
  const { themeClasses = true, themeClassNames = {} } = config || {};
  const { light: lightClass = 'prefer-light', dark: darkClass = 'prefer-dark' } = themeClassNames || {};

  const outputs: DesignOutput[] = [];
  const prefix = config?.prefix ?? spec.variablePrefix;

  for (const design of (spec.designs || [])) {
    const output = parseDesign(design, undefined, prefix);

    if (themeClasses) {
      ejectThemeVariables(output, lightClass, darkClass);
    }

    const contents = [
      resolveCssInheritances(spec.tokens, cssFromDeclarations(output), prefix),
    ];

    if (design.variants) {
      for (const variant of design.variants) {
        const variantOutput = parseDesign(variant, design, prefix);

        if (themeClasses) {
          ejectThemeVariables(variantOutput, lightClass, darkClass);
        }

        contents.push(resolveCssInheritances(
          spec.tokens,
          cssFromDeclarations(variantOutput),
          prefix
        ));
      }
    }

    outputs.push({
      name: design.name,
      fileName: `designs/${ design.name }.${ config?.extension ?? config?.mode ?? 'css' }`,
      content: contents.join('\r\n')
    });
  }

  return outputs;
}

export function cssFromDeclarations(declarations: DesignSelectors, space = '') {
  const contents: string[] = [];

  for (const [ selector, styles ] of Object.entries(declarations)) {
    contents.push(`${ space }${ selector.replace('!@', '@') } {`);

    if (selector.startsWith('@media') || selector.startsWith('!@media')) {
      const content = cssFromDeclarations(styles as never, space + '  ')
        .replace(/\r\n$/, '');
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

function parseDesign(design: DesignSystem, parent?: DesignSystem, prefix?: string): DesignSelectors {
  const selectors: DesignSelectors = {};

  const normal: ElementSelectors = {};
  const states: StateSelectors = {} as never;
  const queries: QuerySelectors = {} as never;

  for (const [ prop, styles ] of Object.entries(design.styles)) {
    if (typeof styles === 'string') {
      normal[prop as never] = resolveCssValue(styles, prefix);
    } else if (typeof styles === 'object') {
      assignDesignValues(
        normal,
        states,
        queries,
        prop as keyof CSSStyleDeclaration,
        styles,
        prefix
      );
    }
  }

  let tags = design.tags ?? [ design.name?.toLowerCase() || '' ];
  if (parent) {
    tags = (parent.tags || [ parent.name ]).map(tag => `${ tag }.${ design.name?.toLowerCase() }`);
  }

  selectors[tags.join(', ')] = normal;

  if (Object.keys(states).length) {
    Object.assign(selectors, parseDeclarations(tags, states));
  }

  if (Object.keys(queries).length) {
    for (const [ query, styles ] of Object.entries(queries)) {
      const q = `@media ${ parseMediaQuery(query) }`;

      if (!selectors[q]) {
        selectors[q] = {};
      }

      Object.assign(selectors[q], parseDeclarations(tags, styles as any));
    }
  }

  return selectors;
}

function assignDesignValues(
  normal: ElementSelectors,
  states: StateSelectors,
  queries: QuerySelectors,
  prop: keyof CSSStyleDeclaration,
  styles: ToqinStyleState,
  prefix?: string
) {
  for (const [ key, style ] of Object.entries(styles)) {
    if (key.startsWith('::')) {
      const s: keyof ToqinStates = key as never;

      if (!states[s]) {
        states[s] = {} as never;
      }

      if (typeof style === 'string') {
        states[s][prop] = resolveCssValue(style, prefix) as never;
      } else if (typeof style === 'object') {
        Object
          .entries(style as ToqinMediaQueriesList)
          .forEach(([ query, value ]) => {
            const q: keyof ToqinMediaQueries = query as never;

            if (!queries[q]) {
              queries[q] = {} as never;
            }

            if (!queries[q][s]) {
              queries[q][s] = {} as never;
            }

            queries[q][s][prop] = resolveCssValue(value, prefix) as never;
          });
      }
    } else if (key === '@' || key === '.') {
      normal[prop as never] = resolveCssValue(style as string, prefix) as never;
    } else if (key.startsWith('@')) {
      const q: keyof ToqinMediaQueries = key as never;

      if (!queries[q]) {
        queries[q] = {} as never;
      }

      if (!queries[q][prop]) {
        queries[q][prop] = {} as never;
      }

      queries[q][prop] = resolveCssValue(style as string, prefix) as never;
    }
  }
}

function parseDeclarations(tags: string[], styles: CSSSelectors): CSSDeclarations {
  const selectors: any = {
    [tags.join(', ')]: {}
  };

  for (const [ key, value ] of Object.entries(styles)) {
    if (key.startsWith('::')) {
      const state = key.replace('::', '');
      const selector = [
        ...tags.map(t => `${ t }:${ state }`),
        ...tags.map(t => `${ t }.${ state }`)
      ].join(', ');

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

  return selectors;
}

function ejectThemeVariables(
  selectors: DesignSelectors,
  lightClass: string,
  darkClass: string
) {
  const light = getMedia('@light');
  const dark = getMedia('@dark');

  for (const [ key, elements ] of Object.entries(selectors)) {
    if (key.includes(light)) {
      ejectVariables(
        selectors,
        elements as ElementSelectors,
        `!@media ${ light }`,
        lightClass
      );
    } else if (key.includes(dark)) {
      ejectVariables(
        selectors,
        elements as ElementSelectors,
        `!@media ${ dark }`,
        darkClass
      );
    }
  }
}

function ejectVariables(
  selectors: DesignSelectors,
  elements: ElementSelectors,
  theme: string,
  themeClass: string,
) {
  for (const [ selector, styles ] of Object.entries(elements)) {
    const variables: { [key: string]: string } = {};

    for (const [ prop, value ] of Object.entries(styles)) {
      if (prop.startsWith('--')) {
        variables[prop] = value as string;
        // delete styles[prop as never];
      }
    }

    if (!Object.keys(styles).length) {
      // delete elements[selector];
    }

    if (Object.keys(variables).length) {
      const keys = selector
        .split(',').map(item => item.replace(/^\s+/g, ''));
      const key = keys.map(item => `.${ themeClass } ${ item }`).join(', ');

      if (!selectors[theme]) {
        // selectors[theme] = {};
      }

      // selectors[theme][selector] = variables;
      selectors[key] = variables;
    }
  }
}
