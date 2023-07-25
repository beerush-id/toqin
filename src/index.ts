import { watch } from 'chokidar';
import fs from 'fs-extra';
import { join } from 'path';
import { loadSpec } from './loader.js';
import type { CompilerOptions, DesignOutput, TokenCompiler } from './token.js';
import { compileSpecs } from './token.js';

export * from './token.js';
export * from './plugins/index.js';

export type ToqinConfig = {
  outDir?: string;
  watch?: boolean;
  tokenPath?: string;
};

export class Toqin {
  private compilers: TokenCompiler[] = [];
  private readonly tokenPath;

  constructor(public options: ToqinConfig) {
    this.tokenPath = options?.tokenPath ? join(process.cwd(), options.tokenPath) : join(process.cwd(), 'design.toqin');
  }

  public use(compiler: TokenCompiler): this {
    if (!this.compilers.includes(compiler)) {
      this.compilers.push(compiler);
    }

    return this;
  }

  public async run(options?: ToqinConfig): Promise<void> {
    try {
      await this.compile(options);

      if (options?.watch || this.options?.watch) {
        watch(this.tokenPath).on('change', () => {
          console.log(`Design token has been changed. Recompile...`);

          try {
            this.compile(options);
            console.log(`Design token has been recompiled.`);
          } catch (error) {
            console.error('Failed to compile design token.');
            console.error(error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to compile design token.');
      console.error(error);
    }
  }

  public async compile(options?: ToqinConfig): Promise<DesignOutput[]> {
    const config: CompilerOptions = { ...(this.options || {}), ...(options || {}) };
    const { spec } = await loadSpec(this.tokenPath);
    const result = compileSpecs(spec, this.compilers, options ?? this.options);

    const outDir = join(process.cwd(), config.outDir ?? 'tokens');

    for (const item of result) {
      if (item.fileName) {
        const filePath = join(outDir, item.fileName);

        fs.ensureFileSync(filePath);
        fs.writeFileSync(filePath, item.content);
      }
    }

    return result;
  }
}
