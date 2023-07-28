import { normalizePath } from 'vite';
import type { DesignOutput, DesignSpec } from '../../token.js';
import type { ProcessOptions as PostCSSOptions } from 'postcss';
import postcss from 'postcss';
import type { Options as CSSNanoOptions } from 'cssnano';
import cssnano from 'cssnano';
import type { Options as AutoprefixerOptions } from 'autoprefixer';
import autoprefixer from 'autoprefixer';
import { CSSCompiler, type CSSCompilerOptions } from './compiler.js';
import { SourceMapGenerator } from 'source-map';

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
} & Partial<CSSCompilerOptions>;

export function css(config: CSSConfig = {}) {
  return async (spec: DesignSpec | CSSCompiler): Promise<DesignOutput[]> => {
    const { mode = 'css', extension = mode as 'css', outDir = mode as string } = config || {};
    const outputs: DesignOutput[] = [];
    const outName = `${ config?.indexName ?? spec?.name?.toLowerCase() ?? 'index' }.${ extension }`;
    const outPath = `${ outDir }/${ outName }`;
    const output = spec instanceof CSSCompiler ? spec : new CSSCompiler(spec, config);

    output.compile();

    if (config?.sourceMap || typeof config?.sourceMap === 'undefined') {
      const map = new SourceMapGenerator({
        file: outPath,
        skipValidation: true,
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

export * from './vite.js';
