import { DesignToken } from '../tokin.js';

export type TailwindPluginConfig = {
  prefix?: string;
  cssVariables?: boolean;
}

export function tailwind(config: TailwindPluginConfig) {
  return (design: DesignToken) => {
    return [];
  };
}
