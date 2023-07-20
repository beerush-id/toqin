import { DesignOutput } from '../../design.js';
import type { DesignSpecs, TokenOutput } from '../../token.js';
import { compileDesign } from './design-compiler.js';
import { compileToken, CSSCompileTokenConfig } from './token-compiler.js';

export type CSSConfig = {
  outDir?: string;
  indexName?: string;
  indexOnly?: boolean;
} & CSSCompileTokenConfig;

export function css(config: CSSConfig) {
  return (spec: DesignSpecs): TokenOutput[] => {
    const {
      mode = 'css',
      extension = mode as 'css',
      indexOnly = true,
      outDir = mode as string
    } = config || {};

    let outputs: TokenOutput[] = [];

    const tokenOutputs = compileToken(spec, config)
      .map(item => {
        item.fileName = `${ outDir }/${ item.fileName }`;
        return item;
      });

    const designOutputs: DesignOutput[] = compileDesign(spec, config)
      .map(item => {
        item.fileName = `${ outDir }/${ item.fileName }`;
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
            content: outputs.map(item => item.content).join('\r\n')
          }
        ];
      } else {
        outputs.push({
          name: 'token.index',
          fileName: `${ outDir }/tokens.${ extension }`,
          content: tokenOutputs.map(item => item.content).join('\r\n')
        });

        outputs.push({
          name: 'design.index',
          fileName: `${ outDir }/designs.${ extension }`,
          content: designOutputs.map(item => item.content).join('\r\n')
        });
      }
    } else {
      const tokens: string[] = (spec.tokens ?? [])
        .map(t => `@import "tokens/${ t.name }";`);
      const designs: string[] = (spec.designs ?? [])
        .map(d => `@import "designs/${ d.name }";`);

      outputs.push({
        name: 'index',
        fileName: `${ outDir }/${ config?.indexName ?? spec?.name?.toLowerCase() ?? 'index' }.${ extension }`,
        content: [ ...tokens, ...designs ].join('\r\n') + '\r\n',
      });
    }

    return outputs;
  };
}