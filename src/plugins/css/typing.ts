export const globalTyping = `
export type MediaQuery = {
  [key: string]: string;
};
declare global {
  interface Window {
    Toqin: {
      getTheme: () => string;
      setTheme: (name: string) => void;
      useQuery: (name: string) => void;
      mediaQueries: MediaQuery[];
    };
  }
}
`;

export const libraryTyping = `
export declare let mediaQueries: MediaQuery[];
export declare let mediaQueryMode: string;
export declare let defaultColorScheme: string;
export declare const register: (queries: MediaQuery[] | undefined, mode: string, scheme: string) => void;
`;
