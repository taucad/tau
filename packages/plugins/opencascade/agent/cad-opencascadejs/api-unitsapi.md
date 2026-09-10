# libcascade — UnitsAPI

2 top-level symbols. Signatures are verbatim typescript.

// The {@link UnitsAPI`UnitsAPI`} global functions are used to convert a value from any unit into another unit
UnitsAPI: declare class UnitsAPI

constructor

// Converts the current unit value to the local system units value
static CurrentToLS(aData: number, aQuantity: string): number;

// Converts the current unit value to the SI system units value
static CurrentToSI(aData: number, aQuantity: string): number;

// Converts the local system units value to the current unit value
static CurrentFromLS(aData: number, aQuantity: string): number;

// Converts the SI system units value to the current unit value
static CurrentFromSI(aData: number, aQuantity: string): number;

// Converts the local unit value to the local system units value
static AnyToLS(aData: number, aUnit: string): number;

// Converts the local unit value to the local system units value
static AnyToLS_1(aData: number, aUnit: string): number;

// Converts the local unit value to the local system units value
static AnyToLS_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

// Converts the local unit value to the SI system units value
static AnyToSI(aData: number, aUnit: string): number;

// Converts the local unit value to the SI system units value
static AnyToSI_1(aData: number, aUnit: string): number;

// Converts the local unit value to the SI system units value
static AnyToSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

// Converts the local system units value to the local unit value
static AnyFromLS(aData: number, aUnit: string): number;

// Converts the SI system units value to the local unit value
static AnyFromSI(aData: number, aUnit: string): number;

// Converts the aData value expressed in the current unit for the working environment, as defined for the physical quantity aQuantity by the last call to the SetCurrentUnit function, into the unit aUnit
static CurrentToAny(aData: number, aQuantity: string, aUnit: string): number;

// Converts the aData value expressed in the unit aUnit, into the current unit for the working environment, as defined for the physical quantity aQuantity by the last call to the SetCurrentUnit function
static CurrentFromAny(aData: number, aQuantity: string, aUnit: string): number;

// Converts the local unit value to another local unit value
static AnyToAny(aData: number, aUnit1: string, aUnit2: string): number;

// Converts the local system units value to the SI system unit value
static LSToSI(aData: number, aQuantity: string): number;

// Converts the SI system unit value to the local system units value
static SIToLS(aData: number, aQuantity: string): number;

// Sets the local system units
static SetLocalSystem(aSystemUnit?: UnitsAPI_SystemUnits): void;

// Returns the current local system units
static LocalSystem(): UnitsAPI_SystemUnits;

// Sets the current unit dimension <aUnit> to the unit quantity <aQuantity>
static SetCurrentUnit(aQuantity: string, aUnit: string): void;

// Returns the current unit dimension <aUnit> from the unit quantity <aQuantity>
static CurrentUnit(aQuantity: string): string;

// saves the units in the file .CurrentUnits of the directory pointed by the CSF_CurrentUnitsUserDefaults environment variable
static Save(): void;

static Reload(): void;

// return the dimension associated to the quantity
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

// Returns the basic dimensions
static DimensionSolidAngle(): Units_Dimensions;

// Checks the coherence between the quantity <aQuantity> and the unit <aUnits> in the current system and returns FALSE when it's WRONG
static Check(aQuantity: string, aUnit: string): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identifies unit systems which may be defined as a basis system in the user's session
UnitsAPI_SystemUnits: typeof UnitsAPI_SystemUnits[keyof typeof UnitsAPI_SystemUnits]
