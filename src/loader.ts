import fs from 'fs-extra';
import { get as https } from 'https';
import { resolve as resolveModule } from '@beerush/resolve';
import { dirname, join, resolve } from 'path';
import { createAnimationMap, createDesignMap, createTokenMap } from './parser.js';
import { merge } from '@beerush/utils/object';
import type { JSONMap, JSONPointers } from 'json-source-map';
import { parse as parseJson } from 'json-source-map';
import type { DesignSpec, LoadedDesignSpec } from './core.js';

export type ResolvedSpec = {
  spec: LoadedDesignSpec;
  data: DesignSpec;
  path: string;
  paths: string[];
  specs?: LoadedDesignSpec[];
}

export type SingleSpec = {
  spec: LoadedDesignSpec;
  data: DesignSpec;
  path: string;
  pointers: JSONPointers
}

const cachedSpecs: {
  [key: string]: SingleSpec;
} = {};

export const ALLOWED_OVERRIDE_KEYS: Array<keyof LoadedDesignSpec> = [
  'mediaQueries',
  'defaultColorScheme',
  'customQueryMode',
  'rootScope',
  'layers'
];

function parse<T>(json: string, compact?: boolean): JSONMap<T> {
  if (compact) {
    return { data: JSON.parse(json), pointers: {} };
  }

  return parseJson<T>(json);
}

export async function loadSpec(
  url: string,
  fromPath?: string,
  fromFile?: string,
  compact?: boolean
): Promise<ResolvedSpec> {
  const specs: LoadedDesignSpec[] = [];
  const paths: string[] = [];
  const { spec, data, pointers, path } = await readSpec(url, fromPath, fromFile, compact);

  if (!compact) {
    spec.pointers = pointers;
    spec.tokenMaps = {};
    spec.designMaps = {};
    spec.animationMaps = {};
  }

  spec.id = btoa(path);
  spec.url = path;

  specs.push(spec);
  paths.push(path);

  const tokenMaps = createTokenMap(spec);
  const designMaps = createDesignMap(spec);
  const animationMaps = createAnimationMap(spec);

  if (spec.extends?.length) {
    for (const extend of spec.extends) {
      const resolved = await loadSpec(extend, dirname(path), path, compact);
      const { spec: extendedSpec, paths: extendedPaths, specs: extendedSpecs } = resolved;

      paths.unshift(...extendedPaths);

      if (!spec.extendedSpecs) {
        spec.extendedSpecs = [];
      }

      spec.extendedSpecs.unshift(extendedSpec);

      for (const [ key, value ] of Object.entries(extendedSpec)) {
        if (ALLOWED_OVERRIDE_KEYS.includes(key as keyof LoadedDesignSpec) && typeof spec[key as never] === 'undefined') {
          spec[key as never] = value as never;
        }
      }

      specs.unshift(...(extendedSpecs || []));
    }
  }

  if (!compact) {
    if (Object.keys(tokenMaps).length) {
      merge(spec.tokenMaps || {}, tokenMaps);
    }

    if (Object.keys(animationMaps).length) {
      merge(spec.animationMaps || {}, animationMaps);
    }

    if (Object.keys(designMaps).length) {
      merge(spec.designMaps || {}, designMaps);
    }
  }

  if (spec.includes?.length) {
    for (const child of spec.includes) {
      const resolved = await loadSpec(child, dirname(path), path, compact);
      const { spec: includedSpec, paths: includedPaths, specs: includedSpecs } = resolved;

      paths.push(...includedPaths);

      if (!spec.includedSpecs) {
        spec.includedSpecs = [];
      }

      spec.includedSpecs.push(includedSpec);

      for (const [ key, value ] of Object.entries(includedSpec)) {
        if (ALLOWED_OVERRIDE_KEYS.includes(key as keyof LoadedDesignSpec) && typeof spec[key as never] === 'undefined') {
          spec[key as never] = value as never;
        }
      }

      specs.push(...(includedSpecs || []));
    }
  }

  return { spec, data, path, paths, specs };
}

/**
 * Design Spec reader. Supports local file, module file, and remote file using URL.
 * @param {string} path - Path to the design spec file.
 * @param {string} [fromPath] - Parent path of the design spec file.
 * @param {string} [fromFile] - Parent file of the design spec file.
 * @param compact
 * @returns {Promise<SingleSpec>}
 */
export async function readSpec(
  path: string,
  fromPath?: string,
  fromFile?: string,
  compact?: boolean
): Promise<SingleSpec> {
  try {
    if (path.startsWith('http')) {
      if (cachedSpecs[path]) {
        return cachedSpecs[path];
      }

      const { spec, data, pointers } = await new Promise<SingleSpec>((resolve, reject) => {
        https(path, (res) => {
          const data: string[] = [];

          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => {
            const content = data.join('');
            const result = parse<LoadedDesignSpec>(content, compact);
            resolve({ path, spec: result.data, data: JSON.parse(content), pointers: result.pointers });
          });
          res.on('error', reject);
        });
      });

      cachedSpecs[path] = { spec, data, pointers, path };
      return cachedSpecs[path];
    } else {
      try {
        const file = fromPath && path.startsWith('.') ? join(fromPath, path) : resolve(path);
        const content = fs.readFileSync(file, 'utf-8');
        const { data: spec, pointers } = parse<LoadedDesignSpec>(content, compact);

        return {
          spec,
          pointers,
          data: JSON.parse(content),
          path: file
        };
      } catch (error) {
        const file = resolveModule(path);
        const content = fs.readFileSync(file, 'utf-8');
        const { data: spec, pointers } = parse<LoadedDesignSpec>(content, compact);

        return {
          spec,
          pointers,
          data: JSON.parse(content),
          path: file
        };
      }
    }
  } catch (error) {
    if (fromFile) {
      throw new Error(`Unable to read design spec: ${ path } from ${ fromFile }`);
    }

    throw new Error(`Unable to read design spec: ${ path }`);
  }
}
