import type { HmrContext, ViteDevServer } from 'vite';
import { FSWatcher, normalizePath } from 'vite';
import { loadSpec } from '../../loader.js';
import type { DesignOutput, DesignSpec } from '../../token.js';
import type { ProcessOptions as PostCSSOptions } from 'postcss';
import postcss from 'postcss';
import type { Options as CSSNanoOptions } from 'cssnano';
import cssnano from 'cssnano';
import type { Options as AutoprefixerOptions } from 'autoprefixer';
import autoprefixer from 'autoprefixer';
import { ParserOptions } from './parser.js';
import { CSSCompiler } from './compiler.js';
import { SourceMapGenerator } from 'source-map';
import fs from 'fs-extra';
import { join } from 'path';

export type CSSConfig = {
  outDir?: string;
  baseURL?: string;
  indexName?: string;

  sourceMap?: boolean | 'inline';
  postcss?: PostCSSOptions | boolean;
  cssnano?: CSSNanoOptions | boolean;
  autoprefixer?: AutoprefixerOptions | boolean;

  mode?: 'css' | 'scss';
  extension?: 'css' | 'scss';
} & Partial<ParserOptions>;

export function css(config: CSSConfig = {}) {
  return async (spec: DesignSpec | CSSCompiler): Promise<DesignOutput[]> => {
    const { mode = 'css', extension = mode as 'css', outDir = mode as string } = config || {};
    const outputs: DesignOutput[] = [];
    const outName = `${ config?.indexName ?? spec?.name?.toLowerCase() ?? 'index' }.${ extension }`;
    const outPath = `${ outDir }/${ outName }`;
    const output = spec instanceof CSSCompiler ? spec : new CSSCompiler(spec, config);

    output.compile();

    console.log(output);

    if (config?.sourceMap || typeof config?.sourceMap === 'undefined') {
      const map = new SourceMapGenerator({
        file: outPath,
      });

      for (const { name, url, input, output: out } of output.sourceMaps) {
        map.addMapping({
          name,
          source: normalizePath(url || ''),
          original: { line: input[0], column: input[1] },
          generated: { line: out[0], column: out[1] },
        });
      }

      if (config?.sourceMap === undefined || config?.sourceMap === 'inline') {
        const base64 = Buffer.from(map.toString()).toString('base64');
        output.contents.push(`/*# sourceMappingURL=data:application/json;base64,${ base64 } */`);
      } else {
        output.contents.push(`/*# sourceMappingURL=${ outPath }.map */`, '\r\n');
        outputs.push({
          name: 'index.map',
          fileName: `${ outPath }.map`,
          content: map.toString(),
        });
      }
    }

    outputs.push({
      name: 'index',
      fileName: outPath,
      content: output.stringify(),
    });

    if (config?.postcss) {
      const useNano = config?.cssnano || !('cssnano' in config);
      const useAutoPrefix = config?.autoprefixer || !('autoprefixer' in config);
      const plugins = [];

      if (useNano) {
        plugins.push(cssnano(config?.cssnano as CSSNanoOptions));
      }

      if (useAutoPrefix) {
        plugins.push(autoprefixer(config?.autoprefixer as AutoprefixerOptions));
      }

      for (const output of outputs) {
        const result = await postcss(plugins).process(output.content, {
          ...(config?.postcss as PostCSSOptions || {}),
          from: output.fileName
        });
        output.content = result.css;
      }
    }

    return outputs;
  };
}

export type ViteCSSConfig = CSSConfig & {
  tokenPath?: string;
}

export async function viteCss(config?: ViteCSSConfig) {
  const watchPaths: string[] = [];
  const watchQueue: string[] = [];
  const transform = css({ ...config, outDir: '.' });

  let watcher: FSWatcher;
  let specPath: string;
  let designSpec: DesignSpec;
  let designSpecs: DesignSpec[];

  let compiler: CSSCompiler = undefined as never;
  let content = '';

  const compile = async (file: string) => {
    specPath = specPath || file;

    try {
      const { spec, paths, specs = [] } = await loadSpec(specPath);

      designSpec = spec;
      designSpecs = specs;

      for (const path of paths) {
        if (!watchQueue.includes(path)) {
          watchQueue.push(path);
        }
      }

      compiler = new CSSCompiler(spec, config);
      const results = await transform(compiler);

      content = results
        .filter(item => !(item.fileName || '').endsWith('.map'))
        .map((item) => item.content)
        .join('\r\n');

      if (config?.outDir) {
        results.forEach((item) => {
          if (item.fileName) {
            const fileName = join(process.cwd(), config?.outDir || './', item.fileName);
            fs.ensureFileSync(fileName);
            fs.writeFileSync(fileName, item.content);
          }
        });

        const scriptFile = join(process.cwd(), config?.outDir || './', `${ config?.indexName ?? 'index' }.js`);
        fs.ensureFileSync(scriptFile);
        fs.writeFileSync(scriptFile, compiler.createHelperScript(true));
      }

      if (watcher) {
        watch();
      }
    } catch (error) {
      console.error(`Failed to parse design token file: ${ file }`);
      console.error(error);
    }
  };

  const watch = () => {
    for (const path of watchQueue) {
      if (!watchPaths.includes(path) && watcher) {
        watcher.add(path);
        watchPaths.push(path);
      }
    }
  };

  if (config?.tokenPath) {
    specPath = config.tokenPath;
    await compile(config.tokenPath);
  }

  const find = (id: string) => {
    return designSpecs?.find((spec) => spec.id === id);
  };

  return {
    name: 'vite-plugin-toqin-css',
    configureServer(_server: ViteDevServer) {
      watcher = _server.watcher;

      _server.middlewares.use(async (req, res, next) => {
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
              const { spec } = await loadSpec(specPath, undefined, undefined, false);
              res.end(JSON.stringify(spec));
              return;
            }
          }
        }

        if (req.url?.endsWith('.toqin')) {
          const path = req.url?.replace(config?.baseURL ? config.baseURL + '/' : /^\//, '');

          if (path) {
            const file = fs.readFileSync(path);
            res.end(file);
            return;
          }
        }

        next();
      });

      _server.ws.on('toqin:set', (data) => {
        console.log(data);
      });

      watch();
    },
    resolveId(id: string) {
      if (id === 'virtual:toqin-helper') {
        return id;
      }
    },
    load(id: string) {
      if (id === 'virtual:toqin-helper') {
        return compiler?.createHelperScript(true);
      }
    },
    transform: async (src: string, file: string) => {
      if (file.endsWith('.toqin')) {
        try {
          await compile(file);

          return { code: compiler.createHelperScript(false, content), map: null };
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
          console.log(`Design token ${ file } has been changed.`);
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
