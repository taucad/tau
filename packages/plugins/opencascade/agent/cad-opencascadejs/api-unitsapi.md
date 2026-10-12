# libcascade — UnitsAPI

2 top-level symbols. Signatures are verbatim typescript.

UnitsAPI: declare class UnitsAPI

  // UnitsAPI.constructor (constructor)
  constructor();

  // UnitsAPI.CurrentToLS (method)
  static CurrentToLS(aData: number, aQuantity: string): number;

  // UnitsAPI.CurrentToSI (method)
  static CurrentToSI(aData: number, aQuantity: string): number;

  // UnitsAPI.CurrentFromLS (method)
  static CurrentFromLS(aData: number, aQuantity: string): number;

  // UnitsAPI.CurrentFromSI (method)
  static CurrentFromSI(aData: number, aQuantity: string): number;

  // UnitsAPI.AnyToLS (method)
  static AnyToLS(aData: number, aUnit: string): number;

  // UnitsAPI.AnyToLS_1 (method)
  static AnyToLS_1(aData: number, aUnit: string): number;

  // UnitsAPI.AnyToLS_2 (method)
  static AnyToLS_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

  // UnitsAPI.AnyToSI (method)
  static AnyToSI(aData: number, aUnit: string): number;

  // UnitsAPI.AnyToSI_1 (method)
  static AnyToSI_1(aData: number, aUnit: string): number;

  // UnitsAPI.AnyToSI_2 (method)
  static AnyToSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

  // UnitsAPI.AnyFromLS (method)
  static AnyFromLS(aData: number, aUnit: string): number;

  // UnitsAPI.AnyFromSI (method)
  static AnyFromSI(aData: number, aUnit: string): number;

  // UnitsAPI.CurrentToAny (method)
  static CurrentToAny(aData: number, aQuantity: string, aUnit: string): number;

  // UnitsAPI.CurrentFromAny (method)
  static CurrentFromAny(aData: number, aQuantity: string, aUnit: string): number;

  // UnitsAPI.AnyToAny (method)
  static AnyToAny(aData: number, aUnit1: string, aUnit2: string): number;

  // UnitsAPI.LSToSI (method)
  static LSToSI(aData: number, aQuantity: string): number;

  // UnitsAPI.SIToLS (method)
  static SIToLS(aData: number, aQuantity: string): number;

  // UnitsAPI.SetLocalSystem (method)
  static SetLocalSystem(aSystemUnit?: UnitsAPI_SystemUnits): void;

  // UnitsAPI.LocalSystem (method)
  static LocalSystem(): UnitsAPI_SystemUnits;

  // UnitsAPI.SetCurrentUnit (method)
  static SetCurrentUnit(aQuantity: string, aUnit: string): void;

  // UnitsAPI.CurrentUnit (method)
  static CurrentUnit(aQuantity: string): string;

  // UnitsAPI.Save (method)
  static Save(): void;

  // UnitsAPI.Reload (method)
  static Reload(): void;

  // UnitsAPI.Dimensions (method)
  static Dimensions(aQuantity: string): Units_Dimensions;

  // UnitsAPI.DimensionLess (method)
  static DimensionLess(): Units_Dimensions;

  // UnitsAPI.DimensionMass (method)
  static DimensionMass(): Units_Dimensions;

  // UnitsAPI.DimensionLength (method)
  static DimensionLength(): Units_Dimensions;

  // UnitsAPI.DimensionTime (method)
  static DimensionTime(): Units_Dimensions;

  // UnitsAPI.DimensionElectricCurrent (method)
  static DimensionElectricCurrent(): Units_Dimensions;

  // UnitsAPI.DimensionThermodynamicTemperature (method)
  static DimensionThermodynamicTemperature(): Units_Dimensions;

  // UnitsAPI.DimensionAmountOfSubstance (method)
  static DimensionAmountOfSubstance(): Units_Dimensions;

  // UnitsAPI.DimensionLuminousIntensity (method)
  static DimensionLuminousIntensity(): Units_Dimensions;

  // UnitsAPI.DimensionPlaneAngle (method)
  static DimensionPlaneAngle(): Units_Dimensions;

  // UnitsAPI.DimensionSolidAngle (method)
  static DimensionSolidAngle(): Units_Dimensions;

  // UnitsAPI.Check (method)
  static Check(aQuantity: string, aUnit: string): boolean;

  // UnitsAPI.delete (method)
  delete(): void;

  // UnitsAPI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

UnitsAPI_SystemUnits: typeof UnitsAPI_SystemUnits[keyof typeof UnitsAPI_SystemUnits]

  readonly UnitsAPI_DEFAULT: 'UnitsAPI_DEFAULT'

  readonly UnitsAPI_SI: 'UnitsAPI_SI'

  readonly UnitsAPI_MDTV: 'UnitsAPI_MDTV'
