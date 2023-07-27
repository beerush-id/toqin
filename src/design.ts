export type MediaQuery = '.' | '@' | '@light' | '@dark' | '@mobile' | '@desktop' | '@tablet' | '@print';
export type MediaQueryList = Partial<{
  [key in MediaQuery]: string;
}>;

export type ElementState =
  | '::normal'
  | '::hover'
  | '::active'
  | '::focus'
  | '::disabled'
  | '::checked'
  | '::visited'
  | '::default'
  | '::intermediate';
export type PseudoElement = '::before' | '::after' | '::selection' | '::placeholder' | '::marker';
export type ElementStateList = Partial<{
  [key in ElementState]: MediaQueryList | string;
}> &
  Partial<{
    [key in PseudoElement]: MediaQueryList | string;
  }>;

export type ToqinStyleState = MediaQueryList & ElementStateList;

export type ToqinStyle = Partial<{
  [key in keyof CSSStyleDeclaration]: ToqinStyleState | string;
}>;

export type DesignValue = string | {
  [key: string]: string;
}

export type DesignType = 'element' | 'pseudo' | 'pseudo-element' | 'pseudo-class' | 'pseudo-state';

export type DesignSystem = {
  name: string;
  rules: ToqinStyle;
  type?: DesignType;
  selectors?: string[];
  url?: string;
  root?: boolean;
  important?: boolean;
  description?: string;
  variants?: DesignSystem[];
  children?: DesignSystem[];
};
