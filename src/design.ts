import type { JSONLine } from 'json-source-map';

export type DesignType = 'element' | 'pseudo' | 'pseudo-element' | 'pseudo-class' | 'pseudo-state';
export type DesignState = {
  [state: `::${ string }`]: string | DesignQuery;
};
export type DesignQuery = {
  [query: `@${ string }`]: string;
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
  rules: DesignRules;

  /* Variant selectors will be merged with the element selector. */
  variants?: Design[];
  /* Children selectors will be scoped to the element selector. */
  children?: Design[];

  /* Replace the selector with "rootScope" if it is the root element. */
  root?: boolean;
  /* Prevent the selector from being scoped. */
  important?: boolean;
};

export type DesignRef = {
  type: string;
  name: string;
  selectors: string[];
  rules: DesignRules;
  root?: boolean;
  important?: boolean;
  sourceUrl?: string;
  pointer?: JSONLine;
  path?: string;
};

export type DesignMap = {
  [selector: string]: DesignRef;
};

export type PseudoVariant = {
  name: string;
  type: DesignType;
};
