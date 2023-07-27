import type { DesignSpec, TokenMap } from '../../token.js';
import { mergeTokenMaps } from '../../parser.js';

export type TailwindPluginConfig = {
  prefix?: string;
  cssVariables?: boolean;
}

export function tailwind(config: TailwindPluginConfig) {
  return (spec: DesignSpec) => {
    return [];
  };
}

export class TailwindSpec {
  public tokenMaps: TokenMap;

  constructor(public spec: DesignSpec) {
    this.tokenMaps = mergeTokenMaps(spec);
  }

  public compile() {
    return this;
  }
}
