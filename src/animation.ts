import type { JSONLine } from 'json-source-map';

export type AnimationFrame = {
  [frame: string]: Partial<CSSStyleDeclaration>;
}

export type Animation = {
  name: string;
  url?: string;
  description?: string;
  children?: Animation[];
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
