import { merge } from '@beerush/utils/object';
import fs from 'fs-extra';
import { DesignSpecs } from './token.js';
import util from './utils.cjs';

export function resolveSpec(spec: DesignSpecs | string): DesignSpecs {
  let resolved: DesignSpecs = spec as DesignSpecs;

  if (typeof spec === 'string') {
    try {
      resolved = JSON.parse(spec);
    } catch (error) {
      throw new Error('Unable to parse design spec.');
    }
  }

  if (resolved.extends?.length) {
    const parents = Array.isArray(resolved.extends) ? resolved.extends : [resolved.extends];
    const extended: DesignSpecs = {} as DesignSpecs;

    for (const parent of parents) {
      const path = util.resolve(parent);

      try {
        const specContent = fs.readFileSync(path, 'utf-8');
        merge(extended, JSON.parse(specContent));
      } catch (error) {
        console.error(error);
        throw new Error(`Unable to extend design spec: ${parent}`);
      }
    }

    merge(extended, resolved);
    return extended;
  }

  return resolved;
}
