# libcascade — UnitsMethods

2 top-level symbols. Signatures are verbatim typescript.

UnitsMethods: declare class UnitsMethods

  // UnitsMethods.constructor (constructor)
  constructor();

  // UnitsMethods.GetLengthFactorValue (method)
  static GetLengthFactorValue(theUnit: number): number;

  // UnitsMethods.GetCasCadeLengthUnit (method)
  static GetCasCadeLengthUnit(theBaseUnit?: UnitsMethods_LengthUnit): number;

  // UnitsMethods.SetCasCadeLengthUnit (method)
  static SetCasCadeLengthUnit(theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
  static SetCasCadeLengthUnit(theUnit: number): void;

  // UnitsMethods.GetLengthUnitScale (method)
  static GetLengthUnitScale(theFromUnit: UnitsMethods_LengthUnit, theToUnit: UnitsMethods_LengthUnit): number;

  // UnitsMethods.GetLengthUnitByFactorValue (method)
  static GetLengthUnitByFactorValue(theFactorValue: number, theBaseUnit?: UnitsMethods_LengthUnit): UnitsMethods_LengthUnit;

  // UnitsMethods.DumpLengthUnit (method)
  static DumpLengthUnit(theScaleFactor: number, theBaseUnit: UnitsMethods_LengthUnit): string;
  static DumpLengthUnit(theUnit: UnitsMethods_LengthUnit): string;

  // UnitsMethods.LengthUnitFromString (method)
  static LengthUnitFromString(theStr: string, theCaseSensitive: boolean): UnitsMethods_LengthUnit;

  // UnitsMethods.delete (method)
  delete(): void;

  // UnitsMethods.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

UnitsMethods_LengthUnit: typeof UnitsMethods_LengthUnit[keyof typeof UnitsMethods_LengthUnit]

  readonly UnitsMethods_LengthUnit_Undefined: 'UnitsMethods_LengthUnit_Undefined'

  readonly UnitsMethods_LengthUnit_Inch: 'UnitsMethods_LengthUnit_Inch'

  readonly UnitsMethods_LengthUnit_Millimeter: 'UnitsMethods_LengthUnit_Millimeter'

  readonly UnitsMethods_LengthUnit_Foot: 'UnitsMethods_LengthUnit_Foot'

  readonly UnitsMethods_LengthUnit_Mile: 'UnitsMethods_LengthUnit_Mile'

  readonly UnitsMethods_LengthUnit_Meter: 'UnitsMethods_LengthUnit_Meter'

  readonly UnitsMethods_LengthUnit_Kilometer: 'UnitsMethods_LengthUnit_Kilometer'

  readonly UnitsMethods_LengthUnit_Mil: 'UnitsMethods_LengthUnit_Mil'

  readonly UnitsMethods_LengthUnit_Micron: 'UnitsMethods_LengthUnit_Micron'

  readonly UnitsMethods_LengthUnit_Centimeter: 'UnitsMethods_LengthUnit_Centimeter'

  readonly UnitsMethods_LengthUnit_Microinch: 'UnitsMethods_LengthUnit_Microinch'
