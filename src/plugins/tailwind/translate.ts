import { toCamelCase } from '@beerush/utils';

export const VARIABLE_SHIFTS = [
  /\s?color\./,
  /\s?palette\./,
  /\s?font\.family\./,
  /\s?font\.size\./,
  /\s?font\.weight\./,
  /\s?font\.space\./,
  /\s?font\.height\./,
  /\s?text\.size\./,
  /\s?text\.weight\./,
  /\s?text\.space\./,
  /\s?text\.height\./,
  /\s?space\./,
  /\s?spacing\./,
];

const translators: {
  [key: string]: (value: string) => string;
} = {
  color: (value: string) => `text-${ value }`,
  backgroundColor: (value: string) => `bg-${ value }`,
  display: (value: string) => `${ value }`,

  alignItems: (value: string) => `items-${ value }`,
  flex: (value: string) => `flex-${ value }`,
  flexDirection: (value: string) => `flex-${ value }`,
  flexWrap: (value: string) => `flex-${ value }`,
  justifyContent: (value: string) => `justify-${ value }`,

  fontSize: (value: string) => `text-${ value }`,
  fontWeight: (value: string) => `font-${ value }`,
  lineHeight: (value: string) => `leading-${ value }`,
};

const VARIABLES = /^[@$~]/;

export function translate(prop: string, value: string | object): string | void {
  const key = toCamelCase(prop);
  let val = typeof value === 'string' ? value : value['@' as never];

  for (const shift of VARIABLE_SHIFTS) {
    if (shift.test(val)) {
      val = val.replace(shift, '');
    }
  }

  if (VARIABLES.test(val)) {
    val = val
      .replace(VARIABLES, '')
      .replace(/[.]+/g, '-');
  }

  if (val) {
    return translators[key] ? translators[key](val) : undefined;
  }
}
