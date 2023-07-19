import { watch } from 'chokidar';
import fs from 'fs-extra';
import { join } from 'path';
import type { Compiler, CompilerOptions, Result } from './tokin.js';
import { compile } from './tokin.js';

export * from './tokin.js';
export * from './plugins/index.js';

export class Toqin {
  private compilers: Compiler[] = [];
  private tokenPath = join(process.cwd(), 'design-token.json');

  constructor(public options: CompilerOptions) {}

  public use(compiler: Compiler): this {
    if (!this.compilers.includes(compiler)) {
      this.compilers.push(compiler);
    }

    return this;
  }

  public run(options?: CompilerOptions): void {
    try {
      this.compile(options);

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

  public compile(options?: CompilerOptions): Result[] {
    const config: CompilerOptions = { ...this.options || {}, ...options || {} };
    const design = fs.readFileSync(this.tokenPath, 'utf-8');
    const result = compile(JSON.parse(design), this.compilers, options ?? this.options);

    if (config.writeFile) {
      const outDir = join(process.cwd(), config.outDir ?? 'tokens');

      for (const item of result) {
        const filePath = join(outDir, item.fileName);

        fs.ensureDirSync(outDir);
        fs.writeFileSync(filePath, item.content);
      }
    }

    return result;
  }
}
