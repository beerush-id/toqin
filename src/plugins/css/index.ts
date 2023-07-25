import type { HmrContext, ViteDevServer } from 'vite';
import type { MediaQuery } from '../../design.js';
import { loadSpec, type ResolvedSpec } from '../../loader.js';
import type { CustomMediaQueries, DesignOutput, DesignSpec, TagType } from '../../token.js';
import { compileDesign } from './design-compiler.js';
import { script } from './script.js';
import { compileToken, type CSSCompileTokenConfig, MEDIA_QUERIES, setMedia } from './token-compiler.js';

export type CSSConfig = {
  outDir?: string;
  indexName?: string;
  indexOnly?: boolean;
  rootScope?: string;
  strictTags?: TagType[];
} & CSSCompileTokenConfig;

export function css(config: CSSConfig = {}) {
  if (config?.mediaQueries) {
    for (const [ query, value ] of Object.entries(config.mediaQueries)) {
      setMedia(query as MediaQuery, value);
    }
  }

  return (specs: DesignSpec): DesignOutput[] => {
    const spec: DesignSpec = { ...specs };

    if (config?.rootScope) {
      spec.rootScope = config.rootScope;
    }

    if (config?.strictTags) {
      spec.strictTags = config.strictTags;
    }

    const { mode = 'css', extension = mode as 'css', indexOnly = true, outDir = mode as string } = config || {};

    let outputs: DesignOutput[] = [];

    const queries: CustomMediaQueries = { ...MEDIA_QUERIES, ...(spec?.mediaQueries || {}) } as never;
    if (Object.keys(queries).length) {
      const schemes: {
        light: string[];
        dark: string[];
      } = {
        light: [],
        dark: [],
      };

      for (let [ , value ] of Object.entries(queries)) {
        if (typeof value === 'string' && value.includes('[')) {
          if (spec?.customQueryMode === 'class') {
            value = value.replace('[', '.').replace(']', '');
          } else if (spec?.customQueryMode === 'id') {
            value = value.replace('[', '#').replace(']', '');
          }

          if (value.includes('light')) {
            schemes.light.push(value);
          } else if (value.includes('dark')) {
            schemes.dark.push(value);
          }
        } else if (typeof value === 'object') {
          if (value.scheme === 'light') {
            schemes.light.push(value.query);
          } else if (value.scheme === 'dark') {
            schemes.dark.push(value.query);
          }
        }
      }

      if (schemes.light.length) {
        outputs.push({
          name: 'light',
          content: [ `${ schemes.light.join(', ') } {`, '  color-scheme: only light;', '}' ].join('\r\n') + '\r\n',
        });
      }

      if (schemes.dark.length) {
        outputs.push({
          name: 'dark',
          content: [ `${ schemes.dark.join(', ') } {`, '  color-scheme: only dark;', '}' ].join('\r\n') + '\r\n',
        });
      }
    }

    const tokenOutputs = compileToken(spec, config).map((item) => {
      item.fileName = `${ outDir }/${ item.fileName }`;
      item.content = [ `/* Design Token: ${ item.name }. */`, item.content ].join('\r\n');

      return item;
    });

    const designOutputs: DesignOutput[] = compileDesign(spec, config).map((item) => {
      item.fileName = `${ outDir }/${ item.fileName }`;
      item.content = [ `/* Design System: ${ item.name }. */`, item.content ].join('\r\n');

      return item;
    });

    outputs.push(...tokenOutputs);
    outputs.push(...designOutputs);

    if (mode === 'css') {
      if (indexOnly) {
        outputs = [
          {
            name: 'index',
            fileName: `${ outDir }/${ config?.indexName ?? spec?.name?.toLowerCase() ?? 'index' }.${ extension }`,
            content: outputs.map((item) => item.content).join('\r\n'),
          },
        ];
      } else {
        outputs.push({
          name: 'token.index',
          fileName: `${ outDir }/tokens.${ extension }`,
          content: tokenOutputs.map((item) => item.content).join('\r\n'),
        });

        outputs.push({
          name: 'design.index',
          fileName: `${ outDir }/designs.${ extension }`,
          content: designOutputs.map((item) => item.content).join('\r\n'),
        });
      }
    } else {
      const tokens: string[] = (spec.tokens ?? []).map((t) => `@import "tokens/${ t.name }";`);
      const designs: string[] = (spec.designs ?? []).map((d) => `@import "designs/${ d.name }";`);

      outputs.push({
        name: 'index',
        fileName: `${ outDir }/${ config?.indexName ?? spec?.name?.toLowerCase() ?? 'index' }.${ extension }`,
        content: [ ...tokens, ...designs ].join('\r\n') + '\r\n',
      });
    }

    return outputs;
  };
}

export type ViteCSSConfig = CSSConfig & {
  tokenPath?: string;
}

export async function viteCss(config?: ViteCSSConfig) {
  const watchPaths: string[] = [];
  const transform = css(config);

  let server: ViteDevServer;
  let designSpec: DesignSpec;
  let resolvedSpec: ResolvedSpec;
  let mainSpecPath: string;
  let content = '';

  const compile = async (file: string) => {
    try {
      if (!mainSpecPath) {
        mainSpecPath = file;
      }

      resolvedSpec = await loadSpec(mainSpecPath);
      const { spec, paths } = resolvedSpec;

      paths.forEach(path => {
        if (!watchPaths.includes(path)) {
          if (server?.watcher) {
            server.watcher.add(path);
            watchPaths.push(path);
          }
        }
      });

      designSpec = spec;
      const results = transform(designSpec);

      content = results.map((item) => item.content).join('\r\n');
    } catch (error) {
      console.error(`Failed to parse design token file: ${ file }`);
      console.error(error);
    }
  };

  const find = (id: string) => {
    return resolvedSpec.specs?.find((spec) => spec.id === id);
  };

  return {
    name: 'vite-plugin-toqin-css',
    configureServer(_server: ViteDevServer) {
      server = _server;

      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/toqin/specs')) {
          const [ , child ] = decodeURI(req.url).split('/toqin/specs');

          if (req.method?.toLowerCase() === 'get') {
            if (child) {
              const spec = find(child.replace('/', ''));
              if (spec) {
                res.end(JSON.stringify(spec));
                return;
              } else {
                res.statusCode = 404;
                res.end();
                return;
              }
            } else {
              res.end(JSON.stringify(designSpec));
              return;
            }
          }
        }

        next();
      });

      server.ws.on('toqin:set', (data) => {
        console.log(data);
      });
    },
    transform: async (src: string, file: string) => {
      if (file.endsWith('.toqin')) {
        try {
          await compile(file);

          const themes: {
            [key: string]: string;
          } = {};

          for (const [ query, value ] of Object.entries(designSpec?.mediaQueries || {})) {
            const selector = typeof value === 'string' ? value : value.query;

            if (selector.includes('[')) {
              themes[query] = selector.replace('[', '').replace(']', '');
            }
          }

          const scriptContent = [
            `(${ script.toString().replace('--CONTENT--', content) })`,
            `(${ JSON.stringify(themes) }, '${ designSpec?.customQueryMode || 'attribute' }', '${
              designSpec?.colorScheme || 'system'
            }')`,
          ].join('');

          return {
            code: scriptContent,
            map: null,
          };
        } catch (error) {
          console.error(`Failed to parse design token file: ${ file }`);
          console.error(error);
        }

        return { code: '' };
      }

      if (file.endsWith('.css') || file.endsWith('.scss')) {
        let code = src;
        const tokens = src.match(/var\(--[\w-]+\)/g);

        if (designSpec && content && tokens) {
          const prefix = config?.prefix ?? designSpec?.variablePrefix;

          tokens.forEach((token) => {
            if (token.startsWith('var(--this-')) {
              return;
            }

            const search = token
              .replace('var(', '')
              .replace(')', '')
              .replace('--tq-', '--')
              .replace('--', prefix ? `--${ prefix }-` : '--');
            const replace = `var(${ search })`;

            if (replace !== token && content.includes(search)) {
              code = code.replace(token, replace);
            }
          });
        }

        return { code, map: null };
      }

      return { code: src, map: null };
    },
    handleHotUpdate: async ({ file, server }: HmrContext) => {
      if (file.endsWith('.toqin')) {
        const prefix = designSpec?.variablePrefix;

        try {
          await compile(file);

          if (prefix !== designSpec?.variablePrefix) {
            console.log(`Design token signature has been changed. Restarting server...`);
            server.restart().then(() => {
              server.ws.send({
                type: 'custom',
                event: 'toqin-change',
                path: '*',
              });
            });

            return [];
          }

          server.ws.send({
            type: 'custom',
            event: 'toqin-change',
            data: content,
          });
        } catch (error) {
          console.error(`Failed to parse design token file: ${ file }`);
          console.error(error);
        }

        return [];
      }
    },
  };
}
