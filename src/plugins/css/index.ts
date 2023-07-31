import { type CSSOptions, encode } from './encoder.js';
import { DesignSpec } from '../../token.js';

export function css(config?: CSSOptions) {
  return (spec: DesignSpec) => encode(spec, config);
}

export * from './vite.js';
export * from './encoder.js';
