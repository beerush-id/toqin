import type { Token, TokenMap, TokenValue } from './token.js';
import type { Design, DesignImplementor, DesignMap, DesignRules, PseudoVariant } from './design.js';
import { merge } from '@beerush/utils';
import type { JSONLine, JSONPointer, JSONPointers } from 'json-source-map';
import { AnimationMap } from './animation.js';
import { logger } from './logger.js';
import { LoadedDesignSpec } from './core.js';
import { COLOR_TRANSFORM_REGEX } from './plugins/css/parser.js';

export const PSEUDO_STATES = [
  'hover',
  'focus',
  'disabled',
  'active',
  'visited',
  'checked',
  'default',
  'indeterminate',
];
export const PSEUDO_ELEMENTS = [
  'before',
  'after',
  'selection',
  'placeholder',
  'marker',
];
export const MOZ_PSEUDO_STATES = [
  '-moz-focusring',
];
export const RESTRICTED_SPEC_KEYS: Array<keyof LoadedDesignSpec> = [
  'extendedSpecs', 'includedSpecs',
];

export function mergeImports(spec: LoadedDesignSpec, maps: string[] = []) {
  if (spec.extendedSpecs?.length) {
    for (const extendedSpec of spec.extendedSpecs) {
      mergeImports(extendedSpec, maps);
    }
  }

  if (spec.imports?.length) {
    for (const url of spec.imports) {
      if (!maps.includes(url)) {
        maps.push(url);
      }
    }
  }

  if (spec.includedSpecs?.length) {
    for (const includedSpec of spec.includedSpecs) {
      mergeImports(includedSpec, maps);
    }
  }

  return maps;
}

export function mergeTokenMaps(spec: LoadedDesignSpec, maps: TokenMap = {}) {
  if (spec.extendedSpecs?.length) {
    for (const extendedSpec of spec.extendedSpecs) {
      mergeTokenMaps(extendedSpec, maps);
    }
  }

  if (spec.tokenMaps) {
    merge(maps, JSON.parse(JSON.stringify(spec.tokenMaps)));
  }

  if (spec.includedSpecs?.length) {
    for (const includedSpec of spec.includedSpecs) {
      mergeTokenMaps(includedSpec, maps);
    }
  }

  return maps;
}

export function createTokenMap(
  spec: LoadedDesignSpec,
  parent?: Token,
  parentName?: string,
  parentPath?: string,
): TokenMap {
  const root: TokenMap = {};

  (spec.tokens || []).forEach((token, i) => {
    const path = parentPath ? `${ parentPath }.${ i }` : `tokens.${ i }`;
    const name = parentName ? `${ parentName }.${ token.name }` : token.name;

    token.type = token.type || parent?.type || 'any';
    token.tags = token.tags || parent?.tags || [];

    if (token.value) {
      if (typeof token.value === 'object') {
        for (const [ key, value ] of Object.entries(token.value)) {
          let nextValue = value as string;
          const inherit = value.startsWith('&this');

          if (inherit && parent?.value) {
            const source: TokenValue = typeof (parent.value as string) === 'string'
                                       ? parent.value
                                       : (parent.value['@' as never] || '') as never;
            if (COLOR_TRANSFORM_REGEX.test(value)) {
              nextValue = (source as string).replace('@', '$') + value.replace('&this', '');
            } else {
              nextValue = source + value.replace('&this', '');
            }
          }

          const childPath = `${ path }.value.${ key }`;
          const pointer = getPointer(spec.pointers, childPath);
          const childName = (key === '@' || key === '.') ? name : `${ name }.${ key }`;

          root[childName] = {
            value: nextValue,
            path: childPath,
            name: token.name,
            type: token.type,
            tags: token.tags,
            sourceUrl: spec.url,
            pointer: pointer?.key,
          };
        }
      } else if (typeof (token.value as string) === 'string') {
        let nextValue = token.value as string;

        const pointer = getPointer(spec.pointers, path + '.value');
        const inherit = token.value.startsWith('&this');

        if (inherit && parent?.value) {
          const source: TokenValue = typeof (parent.value as string) === 'string'
                                     ? parent.value
                                     : (parent.value['@' as never] || '') as never;
          if (COLOR_TRANSFORM_REGEX.test(token.value)) {
            nextValue = (source as string).replace('@', '$') + token.value.replace('&this', '');
          } else {
            nextValue = source + token.value.replace('&this', '');
          }
        }

        root[name] = {
          path,
          name: token.name,
          type: token.type,
          tags: token.tags,
          value: nextValue,
          sourceUrl: spec.url,
          pointer: pointer?.key,
        };
      }
    }

    if (token.tokens?.length) {
      const childSpec = { ...spec, tokens: token.tokens } as LoadedDesignSpec;
      const childMap = createTokenMap(childSpec, token, name, `${ path }.tokens`);
      merge(root, childMap);
    }
  });

  if (!parent) {
    logger.debug(`Design tokens for "${ spec.name }" has been mapped.`);
  }

  return root;
}

export function createAnimationMap(spec: LoadedDesignSpec, parentName?: string, parentPath?: string) {
  const keyframes: AnimationMap = {};

  (spec.animations || []).forEach((animation, i) => {
    const path = parentPath ? `${ parentPath }.${ i }` : `animations.${ i }`;
    const name = parentName ? `${ parentName }-${ animation.name }` : animation.name;

    if (Object.keys(animation.frames || {}).length) {
      keyframes[name] = {
        name, path,
        url: spec.url,
        pointer: getPointer(spec.pointers, path)?.key,
        frames: animation.frames,
      };
    }

    if (animation.children?.length) {
      const childAnimation = createAnimationMap({ ...spec, animations: animation.children }, name, path + '.children');
      merge(keyframes, childAnimation);
    }
  });

  return keyframes;
}

export function createDesignMap(
  spec: LoadedDesignSpec,
  parentSelectors?: string[],
  isVariant?: boolean,
  parentPath?: string,
  parentPointer?: JSONLine,
  parentLayer?: string,
) {
  const root: DesignMap = {};

  if (spec.mixins?.length) {
    Object.assign(root, createImplementations(spec.mixins, spec));
  }

  (spec.designs || []).forEach((design, i) => {
    const layer = design.layer ?? parentLayer ?? spec.layer;
    const path = parentPath ? `${ parentPath }.${ i }` : `designs.${ i }`;
    let selectors = design.selectors || [ `.${ design.name }` ];

    if (parentSelectors?.length) {
      if (isVariant) {
        selectors = selectors.map(item => variantSelector(item));
      }

      const joint: string = isVariant ? '' : (design.directChildren ? ' > ' : ' ');
      selectors = joinSelectors(selectors, parentSelectors, joint);
    }

    if (typeof design.variables === 'object' && Object.keys(design.variables ?? {}).length) {
      if (!design.rules || typeof design.rules !== 'object') {
        design.rules = {};
      }

      for (const [ name, value ] of Object.entries(design.variables)) {
        if (!name.startsWith('--')) {
          design.rules[`--${ name }`] = value;
        } else {
          design.rules[name] = value;
        }
      }
    }

    if (Object.keys(design.rules || {}).length) {
      const name = selectors.join(', ');
      const pointer = getPointer(spec.pointers, path + '.name')?.key;
      const { root: rules, variants } = parseDesignRules(design.rules as never);

      if (variants?.length) {
        const variantSpec = { ...spec, designs: variants } as LoadedDesignSpec;
        const paths = [ path, 'rules' ].join('.');
        merge(root, createDesignMap(variantSpec, selectors, true, paths, pointer, layer));
      }

      root[name] = {
        type: design.type || 'element',
        root: design.root,
        important: design.important,
        name: design.name,
        selectors: design.selectors || [ `.${ design.name }` ],
        sourceUrl: spec.url,
        pointer: parentPointer || getPointer(spec.pointers, path + '.name')?.key,
        layer,
        path,
        rules,
      };
    }

    if (design.variants?.length) {
      const variantSpec = { ...spec, designs: design.variants } as LoadedDesignSpec;
      const variants = createDesignMap(variantSpec, selectors, true, `${ path }.variants`, undefined, layer);
      merge(root, variants);
    }

    if (design.children?.length) {
      const childSpec = { ...spec, designs: design.children } as LoadedDesignSpec;
      const children = createDesignMap(childSpec, selectors, false, `${ path }.children`, undefined, layer);
      merge(root, children);
    }
  });

  return root;
}

export function joinSelectors(source: string[], target: string[], separator?: string) {
  const selectors: string[] = [];

  for (const sourceSelector of source) {
    for (const targetSelector of target) {
      selectors.push(`${ targetSelector }${ separator || '' }${ sourceSelector }`);
    }
  }

  return selectors;
}

export function parseDesignRules(rules: DesignRules) {
  const root: DesignRules = {};
  const classVariants: {
    [key: string]: Design
  } = {};
  const variants: {
    [key: string]: Design
  } = {};

  for (const [ prop, value ] of Object.entries(rules)) {
    if (typeof value === 'string' || Array.isArray(value)) {
      root[prop] = Array.isArray(value) ? value.join(', ') : value;
    } else if (typeof value === 'object') {
      root[prop] = {};

      for (const [ name, values ] of Object.entries(value)) {
        if (name.startsWith('@') || name === '.') {
          if (!(root[prop] as DesignRules)[name]) {
            (root[prop] as DesignRules)[name] = {};
          }

          (root[prop] as DesignRules)[name] = values;
        } else if (name.startsWith(':')) {
          const [ psState, psClass ] = parsePseudoVariants(name);

          if (psClass) {
            if (!classVariants[psClass.name]) {
              classVariants[psClass.name] = {
                name: psClass.name,
                type: psClass.type,
                selectors: [ psClass.name ],
                rules: {},
              };
            }

            classVariants[psClass.name].rules[prop as never] = values;
          }

          if (!variants[psState.name]) {
            variants[psState.name] = {
              name: psState.name,
              type: psState.type,
              selectors: [ psState.name ],
              rules: {},
            };
          }

          variants[psState.name].rules[prop as never] = values;
        }
      }
    }
  }

  return { root, variants: Object.entries({ ...classVariants, ...variants }).map(item => item[1]) };
}

function variantSelector(name: string) {
  if (/^[a-zA-Z]/.test(name)) {
    return `.${ name }`;
  }

  return name;
}

function parsePseudoVariants(name: string): PseudoVariant[] {
  name = name.replace(/:/g, '');

  if (PSEUDO_STATES.includes(name)) {
    return [
      {
        name: `:${ name }`,
        type: 'pseudo-state',
      },
      {
        name: `.${ name }`,
        type: 'pseudo-class',
      },
    ];
  } else if (PSEUDO_ELEMENTS.includes(name) || MOZ_PSEUDO_STATES.includes(name)) {
    return [
      {
        name: `::${ name }`,
        type: 'pseudo-element',
      },
    ];
  } else {
    return [
      {
        name: `::${ name }`,
        type: 'pseudo',
      },
    ];
  }
}

export function getPointer(pointers: JSONPointers = {}, path = ''): JSONPointer {
  return pointers[`/${ path.replace(/\./g, '/') }`];
}

export function anyRegEx(rule: string): RegExp {
  return new RegExp(rule.replace('.*', '\\.([^?]+)'), 'g');
}

function createImplementations(implementations: DesignImplementor[], spec: LoadedDesignSpec) {
  const root: DesignMap = {};
  const designs: Design[] = [];

  implementations.forEach((mix, i) => {
    const { group, select = [], ruleSets = [] } = mix;
    const pointer = getPointer(spec.pointers, `implements.${ i }.ruleSets`)?.key;

    select.forEach(token => {
      ruleSets.forEach(ruleSet => {
        const { selector, rules: r } = ruleSet;
        const name = selector.replace('@this', token);
        const rules: DesignRules = {};

        for (const [ prop, value ] of Object.entries(r)) {
          rules[prop] = (value as string).replace('@this', `@${ group }.${ token }`);
        }

        designs.push({
          name: name,
          selectors: [ `.${ name }` ],
          layer: mix.layer || spec.layer,
          rules,
        });
      });
    });

    const map = createDesignMap({ ...spec, designs, mixins: undefined }, undefined, undefined, undefined, pointer);
    Object.assign(root, map);
  });

  return root;
}
