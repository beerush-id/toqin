import { join } from 'path';
import { type CompileEvent, Store } from './store.js';
import { logger } from './logger.js';
import { css, CSSOptions } from './plugins/index.js';
import { Compiler } from './core.js';

export type ToqinCLIConfig = {
  token: string;
  outDir?: string;
  plugins?: Compiler[];
  server?: boolean | ToqinServerConfig;
  watch?: boolean;
};

export type ToqinServerConfig = {
  host?: string;
  port?: number;
}

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const configFile = join(process.cwd(), './toqin.config.js');

import(`file://${ configFile }`)
  .then(async ({ default: config = {} as never }: { default: ToqinCLIConfig }) => {
    const cssConfig: CSSOptions = { postcss: minify, cssnano: minify, withHelper: true };
    const { token, outDir = './styles', plugins = [ css(cssConfig) ] } = config as ToqinCLIConfig;

    if (!outDir) {
      logger.warn(`Output directory is not specified.`);
      logger.warn(`Toqin will generate output files in "./styles" directory.`);
    }

    if (!config.plugins) {
      logger.warn(`Plugins is not specified.`);
      logger.warn(`Toqin will load default plugin "CSS".`);
    }

    if (token) {
      const store = new Store(token, { outDir, watch: watch || config.watch });

      for (const plugin of plugins) {
        store.use(plugin);
      }

      store.subscribe(event => {
        if (event.type === 'compile:complete') {
          (event as CompileEvent).data.write();
        }
      });

      await store.run();
      await store.compile();

      logger.info(`Design token "${ store.root.name }" is listened by "Toqin CLI".`);
    } else {
      logger.error(`Token file is not specified. Toqin CLI will exit.`);
    }
  })
  .catch(() => {
    logger.error(`Failed to load config file: ${ configFile }. Toqin CLI will exit.`);
  });
