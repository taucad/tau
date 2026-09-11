# libcascade — UnitsMethods

2 top-level symbols. Signatures are verbatim typescript.

UnitsMethods: declare class UnitsMethods

constructor

static GetLengthFactorValue(theUnit: number): number;

static GetCasCadeLengthUnit(theBaseUnit?: UnitsMethods_LengthUnit): number;

static SetCasCadeLengthUnit(theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
static SetCasCadeLengthUnit(theUnit: number): void;
static SetCasCadeLengthUnit(theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
static SetCasCadeLengthUnit(theUnit: number): void;

static GetLengthUnitScale(theFromUnit: UnitsMethods_LengthUnit, theToUnit: UnitsMethods_LengthUnit): number;

static GetLengthUnitByFactorValue(theFactorValue: number, theBaseUnit?: UnitsMethods_LengthUnit): UnitsMethods_LengthUnit;

static DumpLengthUnit(theScaleFactor: number, theBaseUnit: UnitsMethods_LengthUnit): string;
static DumpLengthUnit(theUnit: UnitsMethods_LengthUnit): string;
static DumpLengthUnit(theScaleFactor: number, theBaseUnit: UnitsMethods_LengthUnit): string;
static DumpLengthUnit(theUnit: UnitsMethods_LengthUnit): string;

static LengthUnitFromString(theStr: string, theCaseSensitive: boolean): UnitsMethods_LengthUnit;

delete(): void;

[Symbol.dispose](): void;

UnitsMethods_LengthUnit: typeof UnitsMethods_LengthUnit[keyof typeof UnitsMethods_LengthUnit]
