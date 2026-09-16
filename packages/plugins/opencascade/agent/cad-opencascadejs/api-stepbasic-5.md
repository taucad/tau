# libcascade — StepBasic (5)

32 top-level symbols. Signatures are verbatim typescript.

StepBasic_SizeMember: declare class StepBasic_SizeMember extends StepData_SelectReal

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_SizeSelect: declare class StepBasic_SizeSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  NewMember(): StepData_SelectMember;

  CaseMem(ent: StepData_SelectMember): number;

  SetRealValue(aReal: number): void;

  RealValue(): number;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_SolidAngleMeasureWithUnit: declare class StepBasic_SolidAngleMeasureWithUnit extends StepBasic_MeasureWithUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_SolidAngleUnit: declare class StepBasic_SolidAngleUnit extends StepBasic_NamedUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_Source: typeof StepBasic_Source[keyof typeof StepBasic_Source]

StepBasic_SourceItem: declare class StepBasic_SourceItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  NewMember(): StepData_SelectMember;

  Identifier(): TCollection_HAsciiString;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ThermodynamicTemperatureUnit: declare class StepBasic_ThermodynamicTemperatureUnit extends StepBasic_NamedUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_TimeMeasureWithUnit: declare class StepBasic_TimeMeasureWithUnit extends StepBasic_MeasureWithUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_TimeUnit: declare class StepBasic_TimeUnit extends StepBasic_NamedUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_UncertaintyMeasureWithUnit: declare class StepBasic_UncertaintyMeasureWithUnit extends StepBasic_MeasureWithUnit

  constructor

  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetDescription(aDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_Unit: declare class StepBasic_Unit extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  NamedUnit(): StepBasic_NamedUnit;

  DerivedUnit(): StepBasic_DerivedUnit;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_VersionedActionRequest: declare class StepBasic_VersionedActionRequest extends Standard_Transient

  constructor

  Init(aId: TCollection_HAsciiString, aVersion: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  Id(): TCollection_HAsciiString;

  SetId(Id: TCollection_HAsciiString): void;

  Version(): TCollection_HAsciiString;

  SetVersion(Version: TCollection_HAsciiString): void;

  Purpose(): TCollection_HAsciiString;

  SetPurpose(Purpose: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_VolumeUnit: declare class StepBasic_VolumeUnit extends StepBasic_NamedUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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
