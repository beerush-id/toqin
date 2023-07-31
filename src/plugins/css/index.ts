import { type CSSOptions, encode } from './encoder.js';
import type { LoadedDesignSpec } from '../../core.js';

export function css(config?: CSSOptions) {
  return (spec: LoadedDesignSpec) => encode(spec, config);
}

export * from './vite.js';
export * from './encoder.js';
