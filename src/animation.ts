import { JSONLine } from 'json-source-map';

export type AnimationFrame = {
  [frame: string]: Partial<CSSStyleDeclaration>;
}

export type AnimationSpec = {
  name: string;
  description?: string;
  children?: AnimationSpec[];
  frames: AnimationFrame;
}

export type AnimationRef = {
  name: string;
  path?: string;
  url?: string;
  pointer?: JSONLine;
  frames: AnimationFrame;
}

export type AnimationMap = {
  [name: string]: AnimationRef;
}
