# libcascade — UnitsAPI

2 top-level symbols. Signatures are verbatim typescript.

UnitsAPI: declare class UnitsAPI

constructor

static CurrentToLS(aData: number, aQuantity: string): number;

static CurrentToSI(aData: number, aQuantity: string): number;

static CurrentFromLS(aData: number, aQuantity: string): number;

static CurrentFromSI(aData: number, aQuantity: string): number;

static AnyToLS(aData: number, aUnit: string): number;

static AnyToLS_1(aData: number, aUnit: string): number;

static AnyToLS_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

static AnyToSI(aData: number, aUnit: string): number;

static AnyToSI_1(aData: number, aUnit: string): number;

static AnyToSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

static AnyFromLS(aData: number, aUnit: string): number;

static AnyFromSI(aData: number, aUnit: string): number;

static CurrentToAny(aData: number, aQuantity: string, aUnit: string): number;

static CurrentFromAny(aData: number, aQuantity: string, aUnit: string): number;

static AnyToAny(aData: number, aUnit1: string, aUnit2: string): number;

static LSToSI(aData: number, aQuantity: string): number;

static SIToLS(aData: number, aQuantity: string): number;

static SetLocalSystem(aSystemUnit?: UnitsAPI_SystemUnits): void;

static LocalSystem(): UnitsAPI_SystemUnits;

static SetCurrentUnit(aQuantity: string, aUnit: string): void;

static CurrentUnit(aQuantity: string): string;

static Save(): void;

static Reload(): void;

static Dimensions(aQuantity: string): Units_Dimensions;

static DimensionLess(): Units_Dimensions;

static DimensionMass(): Units_Dimensions;

static DimensionLength(): Units_Dimensions;

static DimensionTime(): Units_Dimensions;

static DimensionElectricCurrent(): Units_Dimensions;

static DimensionThermodynamicTemperature(): Units_Dimensions;

static DimensionAmountOfSubstance(): Units_Dimensions;

static DimensionLuminousIntensity(): Units_Dimensions;

static DimensionPlaneAngle(): Units_Dimensions;

static DimensionSolidAngle(): Units_Dimensions;

static Check(aQuantity: string, aUnit: string): boolean;

delete(): void;

[Symbol.dispose](): void;

UnitsAPI_SystemUnits: typeof UnitsAPI_SystemUnits[keyof typeof UnitsAPI_SystemUnits]
