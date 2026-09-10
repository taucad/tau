# libcascade — UnitsMethods

2 top-level symbols. Signatures are verbatim typescript.

// Class for using global units variables
UnitsMethods: declare class UnitsMethods

constructor

// Returns value of unit encoded by parameter theUnit (integer value denoting unit, as described in IGES standard) in millimeters by default
static GetLengthFactorValue(theUnit: number): number;

// Returns value of current internal unit for CASCADE in millemeters by default
static GetCasCadeLengthUnit(theBaseUnit?: UnitsMethods_LengthUnit): number;

// Sets value of current internal unit for CASCADE
static SetCasCadeLengthUnit(theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
static SetCasCadeLengthUnit(theUnit: number): void;
static SetCasCadeLengthUnit(theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
static SetCasCadeLengthUnit(theUnit: number): void;

// Returns the scale factor for switch from first given unit to second given unit
static GetLengthUnitScale(theFromUnit: UnitsMethods_LengthUnit, theToUnit: UnitsMethods_LengthUnit): number;

// Returns the enumeration corresponding to the given scale factor
static GetLengthUnitByFactorValue(theFactorValue: number, theBaseUnit?: UnitsMethods_LengthUnit): UnitsMethods_LengthUnit;

// Returns string name for the given scale factor
static DumpLengthUnit(theScaleFactor: number, theBaseUnit: UnitsMethods_LengthUnit): string;
static DumpLengthUnit(theUnit: UnitsMethods_LengthUnit): string;
static DumpLengthUnit(theScaleFactor: number, theBaseUnit: UnitsMethods_LengthUnit): string;
static DumpLengthUnit(theUnit: UnitsMethods_LengthUnit): string;

// Make conversion of given string to value of LengthUnit
static LengthUnitFromString(theStr: string, theCaseSensitive: boolean): UnitsMethods_LengthUnit;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Enumeration describes possible values for length units
UnitsMethods_LengthUnit: typeof UnitsMethods_LengthUnit[keyof typeof UnitsMethods_LengthUnit]
