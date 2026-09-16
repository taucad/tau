declare module '@lhncbc/ucum-lhc' {
  type ProviderUnit = {
    dim_?: { dimVec_?: number[] };
    moleExp_?: number;
    isArbitrary_?: boolean;
    isSpecial_?: boolean;
    magnitude_?: number;
  };

  type ProviderResult = {
    status: string;
    msg?: string[];
    unit?: ProviderUnit;
    toVal?: number;
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention -- Upstream CommonJS export name.
  export const UcumLhcUtils: {
    getInstance(): {
      validateUnitString(code: string, suggest: boolean, mode: 'validate'): ProviderResult;
      getSpecifiedUnit(code: string, mode: 'validate'): ProviderResult;
      convertUnitTo(from: string, value: number, to: string, options: { suggest: false }): ProviderResult;
    };
  };
}
