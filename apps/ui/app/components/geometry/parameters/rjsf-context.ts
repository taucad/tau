import type { LengthSymbol } from '@taucad/units';

export type Units = {
  length: {
    symbol: LengthSymbol;
    factor: number;
  };
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for formContext
export type RJSFContext = {
  searchTerm: string;
  allExpanded: boolean;
  resetSingleParameter: (fieldPath: string[]) => void;
  shouldShowField: (prettyLabel: string) => boolean;
  defaultParameters?: Record<string, unknown>;
  units: Units;
};
