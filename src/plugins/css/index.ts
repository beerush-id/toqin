import type { HmrContext } from 'vite';
import type { MediaQuery } from '../../design.js';
import { resolveSpec } from '../../resolver.js';
import type { CustomMediaQueries, DesignOutput, DesignSpecs, TagType } from '../../token.js';
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
    for (const [query, value] of Object.entries(config.mediaQueries)) {
      setMedia(query as MediaQuery, value);
    }
  }

  return (specs: DesignSpecs): DesignOutput[] => {
    const spec: DesignSpecs = { ...specs };

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

      for (let [, value] of Object.entries(queries)) {
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
          content: [`${schemes.light.join(', ')} {`, '  color-scheme: only light;', '}'].join('\r\n') + '\r\n',
        });
      }

      if (schemes.dark.length) {
        outputs.push({
          name: 'dark',
          content: [`${schemes.dark.join(', ')} {`, '  color-scheme: only dark;', '}'].join('\r\n') + '\r\n',
        });
      }
    }

    const tokenOutputs = compileToken(spec, config).map((item) => {
      item.fileName = `${outDir}/${item.fileName}`;
      item.content = [`/* Design Token: ${item.name}. */`, item.content].join('\r\n');

      return item;
    });

    const designOutputs: DesignOutput[] = compileDesign(spec, config).map((item) => {
      item.fileName = `${outDir}/${item.fileName}`;
      item.content = [`/* Design System: ${item.name}. */`, item.content].join('\r\n');

      return item;
    });

    outputs.push(...tokenOutputs);
    outputs.push(...designOutputs);

    if (mode === 'css') {
      if (indexOnly) {
        outputs = [
          {
            name: 'index',
            fileName: `${outDir}/${config?.indexName ?? spec?.name?.toLowerCase() ?? 'index'}.${extension}`,
            content: outputs.map((item) => item.content).join('\r\n'),
          },
        ];
      } else {
        outputs.push({
          name: 'token.index',
          fileName: `${outDir}/tokens.${extension}`,
          content: tokenOutputs.map((item) => item.content).join('\r\n'),
        });

        outputs.push({
          name: 'design.index',
          fileName: `${outDir}/designs.${extension}`,
          content: designOutputs.map((item) => item.content).join('\r\n'),
        });
      }
    } else {
      const tokens: string[] = (spec.tokens ?? []).map((t) => `@import "tokens/${t.name}";`);
      const designs: string[] = (spec.designs ?? []).map((d) => `@import "designs/${d.name}";`);

      outputs.push({
        name: 'index',
        fileName: `${outDir}/${config?.indexName ?? spec?.name?.toLowerCase() ?? 'index'}.${extension}`,
        content: [...tokens, ...designs].join('\r\n') + '\r\n',
      });
    }

    return outputs;
  };
}

export function viteCss(config?: CSSConfig) {
  let specs: DesignSpecs;
  let content = '';
  const transform = css(config);

  const compile = (src: string, id: string) => {
    try {
      specs = resolveSpec(src);

      const results = transform(specs);

      content = results.map((item) => item.content).join('\r\n');
    } catch (error) {
      console.error(`Failed to parse design token file: ${id}`);
      console.error(error);
    }
  };

  return {
    name: 'vite-plugin-toqin-css',
    transform(src: string, id: string) {
      if (id.endsWith('.toqin')) {
        try {
          compile(src, id);

          const themes: {
            [key: string]: string;
          } = {};

          for (const [query, value] of Object.entries(specs?.mediaQueries || {})) {
            const selector = typeof value === 'string' ? value : value.query;

            if (selector.includes('[')) {
              themes[query] = selector.replace('[', '').replace(']', '');
            }
          }

          const scriptContent = [
            `(${script.toString().replace('--CONTENT--', content)})`,
            `(${JSON.stringify(themes)}, '${specs?.customQueryMode || 'attribute'}', '${
              specs?.colorScheme || 'system'
            }')`,
          ].join('');

          return {
            code: scriptContent,
            map: null,
          };
        } catch (error) {
          console.error(`Failed to parse design token file: ${id}`);
          console.error(error);
        }

        return { code: '' };
      }

      if (id.endsWith('.css') || id.endsWith('.scss')) {
        let code = src;
        const tokens = src.match(/var\(--[\w-]+\)/g);

        if (specs && content && tokens) {
          const prefix = config?.prefix ?? specs?.variablePrefix;

          tokens.forEach((token) => {
            if (token.startsWith('var(--this-')) {
              return;
            }

            const search = token
              .replace('var(', '')
              .replace(')', '')
              .replace('--tq-', '--')
              .replace('--', prefix ? `--${prefix}-` : '--');
            const replace = `var(${search})`;

            if (replace !== token && content.includes(search)) {
              code = code.replace(token, replace);
            }
          });
        }

        return { code, map: null };
      }

      return { code: src, map: null };
    },
    handleHotUpdate: async ({ file, read, server }: HmrContext) => {
      if (file.endsWith('.toqin')) {
        const prefix = specs?.variablePrefix;

        try {
          compile(await read(), file);

          if (prefix !== specs?.variablePrefix) {
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
          console.error(`Failed to parse design token file: ${file}`);
          console.error(error);
        }

        return [];
      }
    },
  };
}
