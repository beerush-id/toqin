import type { JSONLine } from 'json-source-map';

export type TokenType = 'color' | 'unit' | 'number' | 'boolean' | 'any';

export type TokenValue = string | {
  [key: `@${ string }`]: string;
}

export type Token = {
  name: string;
  description?: string;
  tags?: string[];
  type?: TokenType;

  tokens?: Token[];
  value?: TokenValue;
};

export type TagType = 'class' | 'id' | 'attribute' | 'element';

export type TokenRef = {
  name: string;
  value: string;
  path?: string;
  type?: TokenType;
  tags?: string[];
  sourceUrl?: string;
  pointer?: JSONLine;
  valuePointer?: JSONLine;
};

export type TokenMap = {
  [path: string]: TokenRef;
};
