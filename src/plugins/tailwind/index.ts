import type { DesignSpec } from '../../token.js';

export type TailwindPluginConfig = {
  prefix?: string;
  cssVariables?: boolean;
}

export function tailwind(config: TailwindPluginConfig) {
  return (spec: DesignSpec) => {
    return [];
  };
}
