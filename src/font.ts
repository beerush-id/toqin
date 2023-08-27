export type FontFace = {
  fontDisplay?: string;
  fontFamily: string;
  fontStretch?: string;
  fontStyle?: string;
  fontWeight?: string;
  fontFeatureSettings?: string;
  fontVariationSettings?: string;
  sizeAdjust?: string;
  unicodeRange?: string;

  baseUrl: string;
  fonts: FontSource[];
  local?: string;
};

export type FontSource = {
  name: string;
  format?: string;
};
