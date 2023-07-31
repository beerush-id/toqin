import { watch } from 'chokidar';
import fs from 'fs-extra';
import { join } from 'path';
import { loadSpec } from './loader.js';
import { logger } from './logger.js';
import { type Compiler, type CompilerOptions, compileSpecs, type DesignOutput } from './core.js';

export * from './core.js';
export * from './token.js';
export * from './plugins/index.js';
export * from './loader.js';
export * from './store.js';

export type ToqinConfig = {
  outDir?: string;
  watch?: boolean;
  token?: string;
};

export type CompilerOutput = {
  outputs: DesignOutput[];
  paths: string[];
}

export class Toqin {
  private compilers: Compiler[] = [];
  private readonly token;
  private watchPaths: string[] = [];

  constructor(public options: ToqinConfig) {
    this.token = options?.token ? join(process.cwd(), options.token) : join(process.cwd(), 'design.toqin');
  }

  public use(compiler: Compiler): this {
    if (!this.compilers.includes(compiler)) {
      this.compilers.push(compiler);
    }

    return this;
  }

  public async run(options?: ToqinConfig): Promise<void> {
    try {
      await this.compile(options);
    } catch (error) {
      logger.error('Failed to compile design token.');
      logger.error(error);
    }
  }

  public watch(path: string, options?: ToqinConfig) {
    watch(path).on('change', async () => {
      logger.info(`Design token ${ path } has been changed.`);

      try {
        await this.compile(options);
      } catch (error) {
        logger.error('Failed to compile design token.');
        logger.error(error);
      }
    });
  }

  public async compile(options?: ToqinConfig): Promise<CompilerOutput> {
    const now = Date.now();

    const config: CompilerOptions = { ...(this.options || {}), ...(options || {}) };
    const { spec, paths } = await loadSpec(this.token);
    const outputs = await compileSpecs(spec, this.compilers, options ?? this.options);

    logger.debug(`Compiled design token in ${ Date.now() - now }ms.`);

    const outDir = join(process.cwd(), config.outDir ?? 'tokens');

    for (const item of outputs) {
      if (item.fileName) {
        const filePath = join(outDir, item.fileName);

        fs.ensureFileSync(filePath);
        fs.writeFileSync(filePath, item.content);
      }
    }

    if (options?.watch || this.options?.watch) {
      for (const path of paths) {
        if (!this.watchPaths.includes(path)) {
          this.watch(path, options);
          this.watchPaths.push(path);
        }
      }
    }

    return { outputs, paths };
  }
}
