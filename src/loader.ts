import fs from 'fs-extra';
import type { DesignSpec } from './token.js';
import { get as https } from 'https';
import { resolve as resolveModule } from '@beerush/resolve';
import { dirname, join, normalize, resolve } from 'path';

export type ResolvedSpec = {
  spec: DesignSpec;
  path: string;
  paths: string[];
  specs?: DesignSpec[];
}

export type SingleSpec = {
  spec: DesignSpec;
  path: string;
}

const cachedSpecs: {
  [key: string]: DesignSpec;
} = {};

const RESTRICTED_KEYS = [
  'extends', 'includes', 'tokens', 'designs',
  'id', 'url', 'initTokens', 'initDesigns',
  'extendedSpecs', 'includedSpecs'
];

export async function loadSpec(url: string, fromPath?: string, fromFile?: string): Promise<ResolvedSpec> {
  const specs: DesignSpec[] = [];
  const paths: string[] = [];
  const { spec, path } = await readSpec(url, fromPath, fromFile);

  spec.id = btoa(path);
  spec.url = normalize(path);
  specs.push(spec);

  if (spec.tokens?.length) {
    spec.tokens.forEach(token => token.url = spec.url);
  }

  if (spec.designs?.length) {
    spec.designs.forEach(design => design.url = spec.url);
  }

  if (spec.includes?.length || spec.extends?.length) {
    spec.initTokens = [ ...(spec.tokens || []) ];
    spec.initDesigns = [ ...(spec.designs || []) ];
  }

  paths.push(path);

  if (spec.includes?.length) {
    for (const child of spec.includes) {
      const resolved = await loadSpec(child, dirname(path), path);
      const { spec: childSpec, paths: childPaths, specs: childSpecs } = resolved;

      paths.unshift(...childPaths);

      if (Array.isArray(childSpec.tokens)) {
        if (!spec.tokens) {
          spec.tokens = [];
        }

        spec.tokens.push(...childSpec.tokens);
      }

      if (Array.isArray(childSpec.designs)) {
        if (!spec.designs) {
          spec.designs = [];
        }

        spec.designs.push(...childSpec.designs);
      }

      if (!spec.includedSpecs) {
        spec.includedSpecs = [];
      }

      spec.includedSpecs.push(childSpec);

      for (const [ key, value ] of Object.entries(childSpec)) {
        if (RESTRICTED_KEYS.includes(key) && typeof spec[key as never] === 'undefined') {
          spec[key as never] = value as never;
        }
      }

      specs.push(...(childSpecs || []));
    }
  }

  if (spec.extends?.length) {
    for (const parent of spec.extends) {
      const resolved = await loadSpec(parent, dirname(path), path);
      const { spec: parentSpec, paths: parentPaths, specs: parentSpecs } = resolved;

      paths.unshift(...parentPaths);

      if (Array.isArray(parentSpec.tokens)) {
        if (!spec.tokens) {
          spec.tokens = [];
        }

        spec.tokens.unshift(...parentSpec.tokens);
      }

      if (Array.isArray(parentSpec.designs)) {
        if (!spec.designs) {
          spec.designs = [];
        }
        spec.designs.unshift(...parentSpec.designs);
      }

      if (!spec.extendedSpecs) {
        spec.extendedSpecs = [];
      }

      spec.extendedSpecs.unshift(parentSpec);

      for (const [ key, value ] of Object.entries(parentSpec)) {
        if (!RESTRICTED_KEYS.includes(key) && typeof spec[key as never] === 'undefined') {
          spec[key as never] = value as never;
        }
      }

      specs.unshift(...(parentSpecs || []));
    }
  }

  return { spec, path, paths, specs };
}

/**
 * Design Spec reader. Supports local file, module file, and remote file using URL.
 * @param {string} path - Path to the design spec file.
 * @param {string} [fromPath] - Parent path of the design spec file.
 * @param {string} [fromFile] - Parent file of the design spec file.
 * @returns {Promise<SingleSpec>}
 */
export async function readSpec(path: string, fromPath?: string, fromFile?: string): Promise<SingleSpec> {
  try {
    if (path.startsWith('http')) {
      if (cachedSpecs[path]) {
        return { spec: cachedSpecs[path], path };
      }

      const spec = await new Promise<DesignSpec>((resolve, reject) => {
        https(path, (res) => {
          const data: string[] = [];

          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => {
            resolve(JSON.parse(data.join('')));
          });
          res.on('error', reject);
        });
      });

      cachedSpecs[path] = spec;
      return { spec, path };
    } else {
      try {
        const file = fromPath && path.startsWith('.') ? join(fromPath, path) : resolve(path);
        const content = fs.readFileSync(file, 'utf-8');

        return {
          spec: JSON.parse(content),
          path: file
        };
      } catch (error) {
        const file = resolveModule(path);
        const content = fs.readFileSync(file, 'utf-8');

        return {
          spec: JSON.parse(content),
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
