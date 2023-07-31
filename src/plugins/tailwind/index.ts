import type { TokenMap, TokenRef } from '../../token.js';
import { mergeTokenMaps } from '../../parser.js';
import { MEDIA_QUERIES, resolveCssValue } from '../css/parser.js';
import type { DesignOutput, LoadedDesignSpec, MediaQueries } from '../../core.js';

export type TailwindPluginConfig = {
  outDir?: string;
  indexName?: string;
  prefix?: string;
  useCssVariable?: boolean;
  extendRules?: ExtendRules;
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

export type TailwindPreset = {
  screens: NestedProps;
  supports: NestedProps;
  data: NestedProps;
  colors: NestedProps;
  spacing: NestedProps;
  fontFamily: NestedProps;
  extend: NestedProps;
};

export const EXTEND_RULES: ExtendRules = {
  fontSize: {
    tags: ['font-size', 'text-size'],
    shifts: [/^font\.size\./, /^text\.size\./],
  },
  fontWeight: {
    tags: ['font-weight', 'text-weight'],
    shifts: [/^font\.weight\./, /^text\.weight\./],
  },
  letterSpacing: {
    tags: ['letter-spacing', 'text-spacing'],
    shifts: [/^font\.space\./, /^text\.space\./],
  },
  lineHeight: {
    tags: ['font-height', 'text-height'],
    shifts: [/^font\.height\./, /^text\.height\./],
  },
};

export function tailwind(config?: TailwindPluginConfig) {
  const defaultOptions: TailwindPluginConfig = {
    outDir: '.',
    indexName: 'tailwind.config.js',
    useCssVariable: true,
  };
  const options = { ...defaultOptions, ...config };

  return (spec: LoadedDesignSpec): DesignOutput[] => {
    const compiler = new TailwindCompiler(spec, options);
    compiler.compile();

    return [
      {
        name: 'tailwind.config.js',
        fileName: `${options.outDir}/${options.indexName}`,
        content: compiler.stringify(),
      },
    ];
  };
}

export class TailwindCompiler {
  public currentLine = 1;
  public contents: string[] = [];

  public preset: Partial<TailwindPreset> = {};
  public mediaQueries: MediaQueries;
  public tokenMaps: TokenMap;
  public extendedRules: ExtendRules;

  constructor(public spec: LoadedDesignSpec, public config: Partial<TailwindPluginConfig>) {
    this.tokenMaps = mergeTokenMaps(spec);
    this.mediaQueries = { ...MEDIA_QUERIES, ...spec.mediaQueries };
    this.extendedRules = { ...EXTEND_RULES, ...config?.extendRules };
  }

  public compile() {
    this.importScreens();
    this.importFontFamilies();
    this.importColors();
    this.importSpacing();
    this.extendRules();

    this.putLine('module.exports = {');
    this.putLine('  theme: {');
    this.putLines(this.preset, '    ');
    this.putLine('  },');
    this.putLine('};');

    return this;
  }

  public stringify() {
    return this.contents.join('\r\n');
  }

  private importScreens() {
    const screens: NestedProps = {};

    for (const [q, v] of Object.entries(this.mediaQueries)) {
      if (typeof v === 'string') {
        if (v.includes('width') || v.includes('height')) {
          const size = v.match(/min-width:\s*(\d+px)/);

          if (size) {
            screens[q] = size[1];
          }
        }
      } else if (typeof v === 'object') {
        if (v.group === 'display') {
          const size = v.query.match(/min-width:\s*(\d+px)/);

          if (size) {
            screens[q] = size[1];
          }
        }
      }
    }

    this.preset.screens = screens;
  }

  private importFontFamilies() {
    const groups = ['font-family', 'font-families'];
    const shifts = [/^font\.family\./, /^font\./];

    this.preset.fontFamily = this.importTokens(groups, shifts, (value) =>
      value.split(/\s?,\s?/g).map((item) => item.replace(/['"]+/g, ''))
    );
  }

  private importColors() {
    const groups = ['color', 'palette', 'colors', 'theme'];
    const shifts = [/^color\./, /^palette\./];

    this.preset.colors = this.importTokens(groups, shifts);
  }

  private importSpacing() {
    const groups = ['space', 'spacing'];
    const shifts = [/^space\./];

    this.preset.spacing = this.importTokens(groups, shifts);
  }

  private extendRules() {
    if (!this.preset.extend) {
      this.preset.extend = {};
    }

    for (const [prop, rule] of Object.entries(this.extendedRules)) {
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

    for (const [name, token] of Object.entries(this.tokenMaps)) {
      if (isInGroup(token, groups)) {
        let prop = name.replace('@', '');

        if (shifts?.length) {
          shifts.forEach((shift) => {
            prop = prop.replace(shift, '');
          });
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
    for (const [key, value] of Object.entries(lines)) {
      if (typeof value === 'string') {
        this.putLine(`${indent}'${key}': '${value}',`);
      } else if (Array.isArray(value)) {
        if (value.length) {
          this.putLine(`${indent}'${key}': [`);
          this.putLine(`${indent}  ${value.map((item) => `'${item}'`).join(', ')}`);
          this.putLine(`${indent}],`);
        }
      } else if (typeof value === 'object') {
        if (Object.keys(value).length) {
          this.putLine(`${indent}'${key}': {`);
          this.putLines(value, `${indent}  `);
          this.putLine(`${indent}},`);
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
