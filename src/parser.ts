import type { DesignMap, DesignRules, DesignSpec, DesignToken, PseudoVariant, TokenMap } from './token.js';
import type { DesignSystem } from './design.js';
import { merge } from '@beerush/utils/object';
import type { JSONPointer, JSONPointers } from 'json-source-map';
import { AnimationMap } from './animation.js';

export const PSEUDO_STATES = [
  'hover',
  'focus',
  'disabled',
  'active',
  'visited',
  'checked',
  'default',
  'indeterminate'
];
export const PSEUDO_ELEMENTS = [
  'before',
  'after',
  'selection',
  'placeholder',
  'marker'
];
export const MOZ_PSEUDO_STATES = [
  '-moz-focusring'
];

export function mergeTokenMaps(spec: DesignSpec, maps: TokenMap = {}) {
  if (spec.extendedSpecs?.length) {
    for (const extendedSpec of spec.extendedSpecs) {
      mergeTokenMaps(extendedSpec, maps);
    }
  }

  if (spec.tokenMaps) {
    merge(maps, spec.tokenMaps);
  }

  if (spec.includedSpecs?.length) {
    for (const includedSpec of spec.includedSpecs) {
      mergeTokenMaps(includedSpec, maps);
    }
  }

  return maps;
}

export function createTokenMap(
  spec: DesignSpec,
  parent?: DesignToken,
  parentName?: string,
  parentPath?: string
): TokenMap {
  const root: TokenMap = {};

  (spec.tokens || []).forEach((token, i) => {
    const path = parentPath ? `${ parentPath }.${ i }` : `tokens.${ i }`;
    const name = parentName ? `${ parentName }.${ token.name }` : token.name;

    if (parent?.type && !token.type) {
      token.type = parent.type;
    }

    if (token.value) {
      if (typeof token.value === 'object') {
        for (const [ key, value ] of Object.entries(token.value)) {
          const childPath = `${ path }.value.${ key }`;
          const pointer = getPointer(spec.pointers, childPath);
          const childName = (key === '@' || key === '.') ? name : `${ name }.${ key }`;

          root[childName] = {
            value,
            path: childPath,
            name: token.name,
            type: token.type,
            url: spec.url,
            pointer: pointer?.key
          };
        }
      } else if (typeof (token.value as string) === 'string') {
        const pointer = getPointer(spec.pointers, path + '.value');
        root[name] = {
          path,
          name: token.name,
          type: token.type,
          value: token.value,
          url: spec.url,
          pointer: pointer?.key
        };
      }
    }

    if (token.tokens?.length) {
      const childSpec = { ...spec, tokens: token.tokens } as DesignSpec;
      const childMap = createTokenMap(childSpec, token, name, `${ path }.tokens`);
      merge(root, childMap);
    }
  });

  return root;
}

export function createAnimationMap(spec: DesignSpec, parentName?: string, parentPath?: string) {
  const keyframes: AnimationMap = {};

  (spec.animations || []).forEach((animation, i) => {
    const path = parentPath ? `${ parentPath }.${ i }` : `animations.${ i }`;
    const name = parentName ? `${ parentName }-${ animation.name }` : animation.name;

    if (Object.keys(animation.frames || {}).length) {
      keyframes[name] = {
        name, path,
        url: spec.url,
        pointer: getPointer(spec.pointers, path)?.key,
        frames: animation.frames
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
  spec: DesignSpec,
  parentSelectors?: string[],
  isVariant?: boolean,
  parentPath?: string
) {
  const scope = spec.rootScope;
  const root: DesignMap = {};

  (spec.designs || []).forEach((design, i) => {
    const path = parentPath ? `${ parentPath }.${ i }` : `designs.${ i }`;
    let selectors = design.selectors || [ `.${ design.name }` ];

    if (parentSelectors?.length) {
      if (isVariant) {
        selectors = selectors.map(item => variantSelector(item));
      }

      selectors = joinSelectors(selectors, parentSelectors, isVariant ? '' : ' ');
    } else if (scope) {
      selectors = selectors.map(item => `${ scope } ${ item }`);
    }

    if (Object.keys(design.rules || {}).length) {
      const name = selectors.join(', ');
      const { root: rules, variants } = parseDesignRules(design.rules as never);

      if (variants?.length) {
        const variantSpec = { ...spec, designs: variants } as DesignSpec;
        const paths = [ path, 'rules' ].join('.');
        merge(root, createDesignMap(variantSpec, selectors, true, paths));
      }

      root[name] = {
        type: design.type || 'element',
        root: design.root,
        important: design.important,
        name: design.name,
        selectors: design.selectors || [ `.${ design.name }` ],
        url: spec.url,
        pointer: getPointer(spec.pointers, path + '.name')?.key,
        path,
        rules,
      };
    }

    if (design.variants?.length) {
      const variantSpec = { ...spec, designs: design.variants } as DesignSpec;
      const variants = createDesignMap(variantSpec, selectors, true, `${ path }.variants`);
      merge(root, variants);
    }

    if (design.children?.length) {
      const childSpec = { ...spec, designs: design.children } as DesignSpec;
      const children = createDesignMap(childSpec, selectors, false, `${ path }.children`);
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
    [key: string]: DesignSystem
  } = {};
  const variants: {
    [key: string]: DesignSystem
  } = {};

  for (const [ prop, value ] of Object.entries(rules)) {
    if (typeof value === 'string') {
      root[prop] = value;
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
                rules: {}
              };
            }

            classVariants[psClass.name].rules[prop as never] = values;
          }

          if (!variants[psState.name]) {
            variants[psState.name] = {
              name: psState.name,
              type: psState.type,
              selectors: [ psState.name ],
              rules: {}
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
        type: 'pseudo-state'
      },
      {
        name: `.${ name }`,
        type: 'pseudo-class'
      }
    ];
  } else if (PSEUDO_ELEMENTS.includes(name) || MOZ_PSEUDO_STATES.includes(name)) {
    return [
      {
        name: `:${ name }`,
        type: 'pseudo-element'
      }
    ];
  } else {
    return [
      {
        name: `::${ name }`,
        type: 'pseudo'
      }
    ];
  }
}

export function getPointer(pointers: JSONPointers = {}, path = ''): JSONPointer {
  return pointers[`/${ path.replace(/\./g, '/') }`];
}
