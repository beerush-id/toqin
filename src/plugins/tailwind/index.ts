import type { TokenMap, TokenRef } from '../../token.js';
import { mergeTokenMaps } from '../../parser.js';
import { MEDIA_QUERIES, resolveCssValue } from '../css/parser.js';
import type { DesignOutput, LoadedDesignSpec, MediaQueries } from '../../core.js';
import { all as knownProps } from 'known-css-properties';
import { camelize } from '@beerush/utils';

export type TailwindPluginConfig = {
  outDir?: string;
  indexName?: string;
  module?: 'esm' | 'cjs' | 'both';
  prefix?: string;
  useCssVariable?: boolean;
  stripMediaQueryMark?: boolean;
  useQuickExtend?: boolean;
  extendRules?: ExtendRules;
  template?: TailwindTemplate;
};

export type ExtendRule = {
  tags: string[];
  shifts?: Array<string | RegExp>;
  replace?: (value: string) => string | string[];
};

export type ExtendRules = {
  [property: string]: ExtendRule;
};

type NestedProps = {
  [key: string]: string | string[] | NestedProps;
};

export type TailwindTemplate = {
  content?: string[];
  theme?: TailwindPreset;
};

export type TailwindPreset = {
  screens?: NestedProps;
  colors?: NestedProps;
  spacing?: NestedProps;
  fontFamily?: NestedProps;
  extend?: NestedProps;
  content?: string[];
};

export const EXTEND_RULES: ExtendRules = {
  fontSize: {
    tags: [ 'font-size', 'text-size' ],
    shifts: [ /^font\.size\./, /^text\.size\./ ],
  },
  fontWeight: {
    tags: [ 'font-weight', 'text-weight' ],
    shifts: [ /^font\.weight\./, /^text\.weight\./ ],
  },
  letterSpacing: {
    tags: [ 'letter-spacing', 'text-spacing' ],
    shifts: [ /^font\.space\./, /^text\.space\./ ],
  },
  lineHeight: {
    tags: [ 'line-height', 'font-height', 'text-height' ],
    shifts: [ /^font\.height\./, /^text\.height\./ ],
  },
};

export const RESERVED_PROPERTIES: string[] = [
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight',
];

export const TEMPLATE_SVELTEKIT: TailwindTemplate = {
  content: [ './src/**/*.{html,js,svelte,ts}' ],
};

export const TEMPLATE_NEXTJS: TailwindTemplate = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
};

export function tailwind(config?: TailwindPluginConfig) {
  const defaultOptions: TailwindPluginConfig = {
    outDir: '.',
    indexName: 'tailwind.config.js',
    module: 'esm',
    useCssVariable: true,
    useQuickExtend: true,
  };
  const options = { ...defaultOptions, ...config };

  if (options.useQuickExtend) {
    for (const prop of knownProps) {
      if (prop.startsWith('-')) {
        continue;
      }

      const key = camelize(prop);
      if (!RESERVED_PROPERTIES.includes(key) && !EXTEND_RULES[key]) {
        EXTEND_RULES[key] = {
          tags: [ prop ],
          shifts: [ new RegExp(`^${ prop.replace(/-/g, '.') }\\.?`) ],
        };
      }
    }
  }

  return (spec: LoadedDesignSpec): DesignOutput[] => {
    const compiler = new TailwindCompiler(spec, options);
    compiler.compile();

    const content = compiler.stringify();
    const outputs: DesignOutput[] = [];

    if (options.module === 'esm') {
      outputs.push({
        name: 'tailwind.config.js',
        fileName: `${ options.outDir }/${ options.indexName }`,
        content: content.replace('module.exports = ', 'export default '),
      });
    } else if (options.module === 'cjs') {
      outputs.push({
        name: 'tailwind.config.cjs',
        fileName: `${ options.outDir }/${ (options.indexName || '').replace(/\.js$/, '.cjs') }`,
        content: content,
      });
    } else if (options.module === 'both') {
      outputs.push({
        name: 'tailwind.config.js',
        fileName: `${ options.outDir }/${ options.indexName }`,
        content: content.replace('module.exports = ', 'export default '),
      });
      outputs.push({
        name: 'tailwind.config.cjs',
        fileName: `${ options.outDir }/${ (options.indexName || '').replace(/\.js$/, '.cjs') }`,
        content: content,
      });
    }

    return outputs;
  };
}

export class TailwindCompiler {
  public currentLine = 1;
  public contents: string[] = [];

  public template: TailwindTemplate = {};
  public preset: Partial<TailwindPreset> = {};
  public mediaQueries: MediaQueries;
  public tokenMaps: TokenMap;
  public extendedRules: ExtendRules;

  constructor(public spec: LoadedDesignSpec, public config: Partial<TailwindPluginConfig>) {
    this.tokenMaps = mergeTokenMaps(spec);
    this.mediaQueries = { ...MEDIA_QUERIES, ...spec.mediaQueries };
    this.extendedRules = { ...EXTEND_RULES, ...config?.extendRules };

    if (config?.template) {
      this.template = config.template;
    }
  }

  public compile() {
    this.importScreens();
    this.importFontFamilies();
    this.importColors();
    this.importSpacing();
    this.extendRules();

    this.putLine('module.exports = {');
    this.putLines({ ...this.template, theme: this.preset }, '  ');
    this.putLine('};');

    return this;
  }

  public stringify() {
    return this.contents.join('\r\n');
  }

  private importScreens() {
    const screens: NestedProps = {};

    for (const [ q, v ] of Object.entries(this.mediaQueries)) {
      const name = this.config?.stripMediaQueryMark ? q.replace(/^@/, '') : q;

      if (typeof v === 'string') {
        if (v.includes('width')) {
          const size = v.match(/min-width:\s*(\d+px)/);

          if (size) {
            screens[name] = size[1];
          }
        }
      } else if (typeof v === 'object') {
        if (v.group === 'display') {
          const size = v.query.match(/min-width:\s*(\d+px)/);

          if (size) {
            screens[name] = size[1];
          }
        }
      }
    }

    this.preset.screens = { ...(this.preset.screens || {}), ...screens };
  }

  private importFontFamilies() {
    const groups = [ 'font-family', 'font-families' ];
    const shifts = [ /^font\.family\./, /^font\./ ];

    this.preset.fontFamily = {
      ...(this.preset.fontFamily || {}),
      ...this.importTokens(groups, shifts, (value) =>
        value.split(/\s?,\s?/g).map((item) => item.replace(/['"]+/g, ''))
      )
    };
  }

  private importColors() {
    const groups = [ 'color', 'palette', 'colors', 'theme' ];
    const shifts = [ /^color\./, /^palette\./ ];

    this.preset.colors = { ...(this.preset.colors || {}), ...this.importTokens(groups, shifts) };
  }

  private importSpacing() {
    const groups = [ 'space', 'spacing' ];
    const shifts = [ /^space\./, /^spacing\./ ];

    this.preset.spacing = { ...(this.preset.spacing || {}), ...this.importTokens(groups, shifts) };
  }

  private extendRules() {
    if (!this.preset.extend) {
      this.preset.extend = {};
    }

    for (const [ prop, rule ] of Object.entries(this.extendedRules)) {
      const props = this.importTokens(rule.tags, rule.shifts, rule.replace);

      if (Object.keys(props).length) {
        this.preset.extend[prop] = props;
      }
    }
  }

  private importTokens(
    groups: string[],
    shifts?: Array<string | RegExp>,
    replace?: (value: string) => string | string[]
  ) {
    const prefix = this.config?.prefix || 'tq';
    const result: NestedProps = {};

    for (const [ name, token ] of Object.entries(this.tokenMaps)) {
      if (isInGroup(token, groups)) {
        let prop = name.replace('@', '');

        if (shifts?.length) {
          shifts.forEach((shift) => {
            prop = prop.replace(shift, '');
          });
        }

        if (prop === '') {
          prop = 'DEFAULT';
        }

        const value = resolveCssValue(
          this.tokenMaps,
          token.value,
          prefix,
          name,
          token.type,
          !this.config?.useCssVariable
        );

        deepSet(result, prop, replace ? (replace(value) as string) : (value as string));
      }
    }

    return result;
  }

  private putLines(lines: NestedProps = this.preset, indent = '') {
    for (const [ key, value ] of Object.entries(lines)) {
      if (typeof value === 'string') {
        this.putLine(`${ indent }'${ key }': '${ value.replace(/'/g, '"') }',`);
      } else if (Array.isArray(value)) {
        if (value.length) {
          this.putLine(`${ indent }'${ key }': [`);
          this.putLine(`${ indent }  ${ value.map((item) => `'${ item }'`).join(', ') }`);
          this.putLine(`${ indent }],`);
        }
      } else if (typeof value === 'object') {
        if (Object.keys(value).length) {
          this.putLine(`${ indent }'${ key }': {`);
          this.putLines(value, `${ indent }  `);
          this.putLine(`${ indent }},`);
        }
      }
    }
  }

  private putLine(text: string) {
    this.contents.push(text);
    this.currentLine++;
  }
}

function isInGroup(token: TokenRef, groups: string[]) {
  for (const tag of token.tags || []) {
    if (groups.includes(tag)) {
      return true;
    }
  }
}

function deepSet(target: NestedProps, path: string, value: string) {
  const parts: string[] = path.split('.');
  let current: NestedProps = target;

  while (parts.length > 1) {
    const part: string = parts.shift() as string;

    if (!current[part]) {
      current[part] = {};
    }

    if (typeof current[part] === 'string') {
      current[part] = { DEFAULT: current[part] };
    }

    current = current[part] as never;
  }

  current[parts[0]] = value;

  return target;
}
