import type { JSONLine } from 'json-source-map';

export type DesignType = 'element' | 'pseudo' | 'pseudo-element' | 'pseudo-class' | 'pseudo-state';
export type DesignState = {
  [state: `::${string}`]: string | DesignQuery;
};
export type DesignQuery = {
  [query: `@${string}`]: string;
};
export type DesignRule = string | (DesignState & DesignQuery);
export type DesignRules = {
  [prop: string]: DesignRule;
};

export type Design = {
  name: string;
  type?: DesignType;
  description?: string;

  selectors?: string[];
  layer?: string;
  variables?: DesignRules;
  rules: DesignRules;

  /* Variant selectors will be merged with the element selector. */
  variants?: Design[];
  /* Children selectors will be scoped to the element selector. */
  children?: Design[];
  /* Only select direct children. */
  directChildren?: boolean;

  /* Replace the selector with "rootScope" if it is the root element. */
  root?: boolean;
  /* Prevent the selector from being scoped. */
  important?: boolean;
  /** Mark the selector as a media query scoped variant. */
  mediaVariants?: string[];
  mediaVariables?: boolean;
};

export type DesignRef = {
  type: string;
  name: string;
  selectors: string[];
  rules: DesignRules;
  root?: boolean;
  important?: boolean;
  mediaVariants?: string[];
  mediaVariables?: boolean;
  sourceUrl?: string;
  pointer?: JSONLine;
  path?: string;
  layer?: string;
};

export type DesignMap = {
  [selector: string]: DesignRef;
};

export type PseudoVariant = {
  name: string;
  type: DesignType;
};

export type DesignRuleSet = {
  selector: string;
  rules: DesignRules;
};
export type DesignImplementor = {
  group: string;
  select: string[];
  layer?: string;
  ruleSets: DesignRuleSet[];
};
