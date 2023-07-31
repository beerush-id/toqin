import type { DesignSpec } from '../../token.js';
import { DesignOutput } from '../../token.js';
import postcss, { ProcessOptions as PostCSSOptions } from 'postcss';
import cssnano, { Options as CSSNanoOptions } from 'cssnano';
import autoprefixer, { Options as AutoprefixerOptions } from 'autoprefixer';
import { CSSCompiler, type CSSCompilerOptions } from './compiler.js';
import { SourceMapGenerator } from 'source-map';
import { normalizePath } from 'vite';

export type CSSOptions = {
  outDir?: string;
  indexName?: string;

  sourceMap?: boolean | 'inline';
  postcss?: PostCSSOptions | boolean;
  cssnano?: CSSNanoOptions | boolean;
  autoprefixer?: AutoprefixerOptions | boolean;

  mode?: 'css' | 'scss';
  extension?: 'css' | 'scss';
} & CSSCompilerOptions;

export type EncodedCss = DesignOutput[] & {
  stringify(): string;
}

export async function encode(spec: DesignSpec | CSSCompiler, options?: CSSOptions): Promise<EncodedCss> {
  const { mode = 'css', extension = mode as 'css', outDir = '.' as string } = options || {};
  const outputs: EncodedCss = [] as never;
  const outName = `${ options?.indexName ?? spec?.name?.toLowerCase() ?? 'index' }.${ extension }`;
  const outPath = `${ outDir }/${ outName }`;
  const output = spec instanceof CSSCompiler ? spec : new CSSCompiler(spec);

  output.compile(options);

  if (options?.sourceMap || typeof options?.sourceMap === 'undefined') {
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

    if (options?.sourceMap === undefined || options?.sourceMap === 'inline') {
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

  if (options?.postcss) {
    const useNano = options?.cssnano || !('cssnano' in options);
    const useAutoPrefix = options?.autoprefixer || !('autoprefixer' in options);
    const plugins = [];

    if (useNano) {
      plugins.push(cssnano(options?.cssnano as CSSNanoOptions));
    }

    if (useAutoPrefix) {
      plugins.push(autoprefixer(options?.autoprefixer as AutoprefixerOptions));
    }

    for (const output of outputs) {
      const result = await postcss(plugins).process(output.content, {
        map: false,
        from: output.fileName,
        ...(options?.postcss as PostCSSOptions || {}),
      });
      output.content = result.css;
    }
  }

  outputs.stringify = () => outputs.map(item => item.content).join('\r\n');

  return outputs;
}
