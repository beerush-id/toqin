import fs from 'fs-extra';
import { get as https } from 'https';
import { resolve as resolveModule } from '@beerush/resolve';
import { join, resolve } from 'path';
import type { JSONMap, JSONPointers } from 'json-source-map';
import { parse as parseJson } from 'json-source-map';
import type { DesignSpec, LoadedDesignSpec } from './core.js';

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
  'layers',
  'imports',
];

function parse<T>(json: string, compact?: boolean): JSONMap<T> {
  if (compact) {
    return { data: JSON.parse(json), pointers: {} };
  }

  return parseJson<T>(json);
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
  compact?: boolean,
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
          path: file,
        };
      } catch (error) {
        const file = resolveModule(path);
        const content = fs.readFileSync(file, 'utf-8');
        const { data: spec, pointers } = parse<LoadedDesignSpec>(content, compact);

        return {
          spec,
          pointers,
          data: JSON.parse(content),
          path: file,
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
