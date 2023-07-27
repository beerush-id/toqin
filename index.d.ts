declare module 'json-source-map' {
  export type JSONLine = {
    line: number;
    column: number;
    pos: number;
  }

  export type JSONPointer = {
    key: JSONLine;
    keyEnd: JSONLine;
    value: JSONLine;
    valueEnd: JSONLine;
  }

  export type JSONPointers = {
    [path: string]: JSONPointer;
  }

  export type JSONMap<T> = {
    data: T;
    pointers: JSONPointers;
  }

  export function parse<T>(json: string): JSONMap<T>;
}
