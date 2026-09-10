# libcascade — StepBasic (6)

21 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity VersionedActionRequest
StepBasic_VersionedActionRequest: declare class StepBasic_VersionedActionRequest extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aVersion: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Id
Id(): TCollection_HAsciiString;

// Set field Id
SetId(Id: TCollection_HAsciiString): void;

// Returns field Version
Version(): TCollection_HAsciiString;

// Set field Version
SetVersion(Version: TCollection_HAsciiString): void;

// Returns field Purpose
Purpose(): TCollection_HAsciiString;

// Set field Purpose
SetPurpose(Purpose: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_VolumeUnit: declare class StepBasic_VolumeUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_WeekOfYearAndDayDate: declare class StepBasic_WeekOfYearAndDayDate extends StepBasic_Date

constructor

Init(aYearComponent: number, aWeekComponent: number, hasAdayComponent: boolean, aDayComponent: number): void;
Init(aYearComponent: number): void;
Init(aYearComponent: number, aWeekComponent: number, hasAdayComponent: boolean, aDayComponent: number): void;
Init(aYearComponent: number): void;

SetWeekComponent(aWeekComponent: number): void;

WeekComponent(): number;

SetDayComponent(aDayComponent: number): void;

UnSetDayComponent(): void;

DayComponent(): number;

HasDayComponent(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_Array1OfApproval: NCollection_Array1_handle_StepBasic_Approval

StepBasic_Array1OfDerivedUnitElement: NCollection_Array1_handle_StepBasic_DerivedUnitElement

StepBasic_Array1OfDocument: NCollection_Array1_handle_StepBasic_Document

StepBasic_Array1OfNamedUnit: NCollection_Array1_handle_StepBasic_NamedUnit

StepBasic_Array1OfOrganization: NCollection_Array1_handle_StepBasic_Organization

StepBasic_Array1OfPerson: NCollection_Array1_handle_StepBasic_Person

StepBasic_Array1OfProduct: NCollection_Array1_handle_StepBasic_Product

StepBasic_Array1OfProductContext: NCollection_Array1_handle_StepBasic_ProductContext

StepBasic_Array1OfUncertaintyMeasureWithUnit: NCollection_Array1_handle_StepBasic_UncertaintyMeasureWithUnit

StepBasic_HArray1OfApproval: NCollection_HArray1_handle_StepBasic_Approval

StepBasic_HArray1OfDerivedUnitElement: NCollection_HArray1_handle_StepBasic_DerivedUnitElement

StepBasic_HArray1OfDocument: NCollection_HArray1_handle_StepBasic_Document

StepBasic_HArray1OfNamedUnit: NCollection_HArray1_handle_StepBasic_NamedUnit

StepBasic_HArray1OfOrganization: NCollection_HArray1_handle_StepBasic_Organization

StepBasic_HArray1OfPerson: NCollection_HArray1_handle_StepBasic_Person

StepBasic_HArray1OfProduct: NCollection_HArray1_handle_StepBasic_Product

StepBasic_HArray1OfProductContext: NCollection_HArray1_handle_StepBasic_ProductContext

StepBasic_HArray1OfUncertaintyMeasureWithUnit: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit
