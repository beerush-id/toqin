import type { DesignOutput, DesignSpec, NestedDeclarations } from '../../token.js';
import type { AnimationSpec } from '../../animation.js';
import type { DesignValue } from '../../design.js';
import { parseDeclaration, parseQueries, resolveCssValue } from './parser.js';
import { CSSConfig } from './index.js';

export function compileAnimation(spec: DesignSpec, config?: CSSConfig): DesignOutput[] {
  const prefix = config?.prefix ?? spec.variablePrefix;
  const outputs: DesignOutput[] = [];

  for (const animation of spec.animations || []) {
    const output = parseAnimation(spec, animation, prefix);
    const content = parseDeclaration(output).join('\r\n');

    outputs.push({
      name: animation.name,
      fileName: `animations/${ animation.name }.${ config?.extension ?? config?.mode ?? 'css' }`,
      content,
    });
  }

  return outputs;
}

function parseAnimation(spec: DesignSpec, animation: AnimationSpec, prefix?: string): NestedDeclarations {
  const name = `@keyframes ${ animation.name }`;
  const root: NestedDeclarations = { [name]: {} };
  const queries: NestedDeclarations = {};

  for (const [ frame, properties ] of Object.entries(animation.frames)) {
    if (typeof properties === 'object') {
      root[name][frame] = {};

      for (const [ prop, value ] of Object.entries(properties)) {
        if (typeof value === 'string') {
          root[name][frame][prop] = resolveCssValue((spec as never), value, prefix) as never;
        } else if (typeof value === 'object') {
          parseAnimationQueries(spec, root, queries, animation.name, frame, prop, value as never, prefix);
        }
      }
    }
  }

  return { ...root, ...queries };
}

function parseAnimationQueries(
  spec: DesignSpec,
  root: NestedDeclarations,
  queries: NestedDeclarations,
  name: string,
  frame: string,
  prop: string,
  values: DesignValue,
  prefix?: string
) {
  const { root: rootProps, queries: queryProps } = parseQueries(spec as never, prop, values as DesignValue, prefix);
  const keyName = `@keyframes ${ name }`;

  for (const [ key, value ] of Object.entries(rootProps)) {
    root[keyName] = root[keyName] || {};
    root[keyName][frame] = root[keyName][frame] || {} as never;
    root[keyName][frame][key] = value as NestedDeclarations;
  }

  for (const [ query, properties ] of Object.entries(queryProps as NestedDeclarations)) {
    queries[query] = queries[query] || {};

    for (const [ propClass, valueProps ] of Object.entries(properties)) {
      if (typeof valueProps === 'object') {
        for (const [ key, value ] of Object.entries(valueProps)) {
          queries[query][propClass] = queries[query][propClass] || {};
          queries[query][propClass][keyName] = queries[query][propClass][keyName] || {};
          queries[query][propClass][keyName][frame] = queries[query][propClass][keyName][frame] || {} as never;
          (queries[query][propClass][keyName][frame] as any)[key] = value as never;
        }
      } else {
        queries[query][keyName] = queries[query][keyName] || {};
        queries[query][keyName][frame] = queries[query][keyName][frame] || {};
        queries[query][keyName][frame][propClass] = valueProps;
      }
    }
  }
}
