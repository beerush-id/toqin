export type ToqinMediaQueries = '.' | '@' | '@light' | '@dark' | '@mobile' | '@desktop' | '@tablet' | '@print';
export type ToqinMediaQueriesList = Partial<{
  [key in ToqinMediaQueries]: string;
}>;

export type ToqinStates = '::normal' | '::hover' | '::active' | '::focus' | '::disabled' | '::checked';
export type ToqinPseudoStates = '::before' | '::after' | '::selection' | '::placeholder' | '::marker';
export type ToqinStatesList = Partial<{
  [key in ToqinStates]: ToqinMediaQueriesList | string;
}> & Partial<{
  [key in ToqinPseudoStates]: ToqinMediaQueriesList | string;
}>;

export type ToqinStyleState = ToqinMediaQueriesList & ToqinStatesList;

export type ToqinStyle = Partial<{
  [key in keyof CSSStyleDeclaration]: ToqinStyleState | string;
}>;

export type DesignSystem = {
  name: string;
  styles: ToqinStyle;
  tags?: string[];
  description?: string;
  variants?: DesignSystem[];
}

export type DesignOutput = {
  name: string;
  fileName: string;
  content: string;
}

export type ToqinStateStyles = Partial<{
  [key in ToqinStates]: Partial<CSSStyleDeclaration>;
}>;
export type ToqinQueryStyles = Partial<{
  [key in ToqinMediaQueries]: Partial<CSSStyleDeclaration>;
}>;
