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

export type DesignSystem = {
  name: string;
  styles: ToqinStyle;
  url?: string;
  root?: boolean;
  tags?: string[];
  important?: boolean;
  description?: string;
  variants?: DesignSystem[];
  children?: DesignSystem[];
};

export type FileOutput = {
  name: string;
  content: string;
  fileName: string;
};

export type ToqinStateStyles = Partial<{
  [key in ElementState]: Partial<CSSStyleDeclaration>;
}>;
export type ToqinQueryStyles = Partial<{
  [key in MediaQuery]: Partial<CSSStyleDeclaration>;
}>;
