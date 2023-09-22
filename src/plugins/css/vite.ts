import type { Plugin, ViteDevServer, WebSocketServer } from 'vite';
import { CSSCompiler } from './compiler.js';
import { basename, join, normalize } from 'path';
import type { CSSOptions } from './encoder.js';
import { encode } from './encoder.js';
import { Store } from '../../store.js';
import { logger } from '../../logger.js';
import fs from 'fs-extra';
import type { CompilerOptions, DesignOutput, LoadedDesignSpec } from '../../core.js';
import { TokenMap } from '../../token.js';
import { mergeTokenMaps } from '../../parser.js';
import { resolveCssValue } from './parser.js';

export type ViteCSSConfig = CompilerOptions & {
  token?: string;
  baseURL?: string;
  extension?: 'css' | 'scss';
  compilerOptions?: Partial<CSSOptions>;
}

export async function viteRemote(config?: ViteCSSConfig, options?: Partial<CSSOptions>): Promise<Plugin> {
  const ext = `.${ config?.extension ?? 'css' }`;
  let remotePath = (config?.baseURL || '/tokens')
    .replace(/\/$/, '')
    .replace(/^\./, '');

  if (!remotePath.startsWith('/')) {
    remotePath = `/${ remotePath }`;
  }

  const stores = new Map<string, Store>();
  const csStore = new Map<string, string>();
  const jsStore = new Map<string, string>();
  const tokenMaps: TokenMap = {};

  let socket: WebSocketServer;

  const registerStore = async (url: string, registrant: string) => {
    const store = new Store(url, config);

    const base = config?.compilerOptions?.indexName || basename(url);
    const href = `${ remotePath }/${ base }`;

    store.use(async (spec: LoadedDesignSpec): Promise<DesignOutput[]> => {
      const compilerOptions = {
        indexName: base,
        extension: config?.extension,
        sourceMap: 'inline',
        ...config?.compilerOptions,
      } as CSSOptions;
      const compiler = new CSSCompiler(spec, compilerOptions);
      const outputs = await encode(compiler, compilerOptions);

      const css: DesignOutput = outputs.find(output => output.fileName.endsWith(ext)) as never;
      const csContent = css?.content || '';
      const jsContent = compiler.createScript(href + ext);

      csStore.set(`${ base }${ ext }`, csContent);
      jsStore.set(`${ base }.helper.js`, jsContent);

      if (config?.outDir) {
        const outPath = join(process.cwd(), config?.outDir || '.', compilerOptions.outDir || '.');
        outputs.forEach(output => {
          fs.ensureFileSync(join(outPath, output.fileName));
          fs.writeFileSync(join(outPath, output.fileName), output.content);
        });
      }

      return outputs;
    });

    store.subscribe(event => {
      if (event.type === 'compile:complete') {
        const content = csStore.get(`${ base }${ ext }`);

        logger.debug(`Sending updated CSS to client.`);
        socket?.send({
          type: 'custom',
          event: 'toqin-change',
          data: { id: href + ext, content, version: store.root.version },
        });
      }
    });

    await store.run();
    await store.compile();

    logger.info(`Design token "${ store.root.file }" is registered by "${ registrant }".`);
    stores.set(store.root.file, store);

    mergeTokenMaps(store.root.spec, tokenMaps);

    return store;
  };

  if (config?.token) {
    await registerStore(config.token, 'CSS Vite Plugin');
  }

  return {
    name: 'vite-plugin-toqin-remote-css',
    configureServer: async (server: ViteDevServer) => {
      socket = server.ws;

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        if (url.startsWith(remotePath)) {
          const file = basename(url);

          if (file.endsWith(ext)) {
            const css = csStore.get(file);

            if (css) {
              res.setHeader('Content-Type', 'text/css');
              res.end(css);
              return;
            }
          }

          if (file.endsWith('.js')) {
            const script = jsStore.get(file);

            if (script) {
              res.setHeader('Content-Type', 'text/javascript');
              res.end(script);
              return;
            }
          }
        }

        if (url.endsWith('.toqin')) {
          const path = url.replace(new RegExp(`^${remotePath}`), '')
            .replace(/^\//, '');
          const content = fs.readFileSync(normalize(path), 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(content);
          return;
        }

        next();
      });
    },
    transform: async (code: string, file: string) => {
      if (file.endsWith(ext) && !file.endsWith(`.toqin${ ext }`)) {
        const variables = code.match(/var\(--tq-[\w-]+\)/g);
        const inherits = code.match(/var\(--var-[\w_-]+\)/g);

        if (variables && options?.prefix) {
          for (const variable of variables) {
            code = code.replace(variable, variable.replace('--tq-', `--${ options?.prefix }-`));
          }
        }

        if (inherits) {
          for (const inherit of inherits) {
            const key = inherit.replace('var(--var-', '$')
              .replace(/_/g, '.')
              .replace(')', '');
            const value = resolveCssValue(tokenMaps, key, undefined, undefined, undefined, true);

            code = code.replace(inherit, value);
          }
        }

        return { code, map: null };
      }
    },
  };
}
