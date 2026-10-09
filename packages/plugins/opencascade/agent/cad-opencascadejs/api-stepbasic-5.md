# libcascade — StepBasic (5)

20 top-level symbols. Signatures are verbatim typescript.

StepBasic_VolumeUnit: declare class StepBasic_VolumeUnit extends StepBasic_NamedUnit

  // StepBasic_VolumeUnit.constructor (constructor)
  constructor();

  // StepBasic_VolumeUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_VolumeUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_VolumeUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_VolumeUnit.delete (method)
  delete(): void;

  // StepBasic_VolumeUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_WeekOfYearAndDayDate: declare class StepBasic_WeekOfYearAndDayDate extends StepBasic_Date

  // StepBasic_WeekOfYearAndDayDate.constructor (constructor)
  constructor();

  // StepBasic_WeekOfYearAndDayDate.Init (method)
  Init(aYearComponent: number, aWeekComponent: number, hasAdayComponent: boolean, aDayComponent: number): void;
  Init(aYearComponent: number): void;

  // StepBasic_WeekOfYearAndDayDate.SetWeekComponent (method)
  SetWeekComponent(aWeekComponent: number): void;

  // StepBasic_WeekOfYearAndDayDate.WeekComponent (method)
  WeekComponent(): number;

  // StepBasic_WeekOfYearAndDayDate.SetDayComponent (method)
  SetDayComponent(aDayComponent: number): void;

  // StepBasic_WeekOfYearAndDayDate.UnSetDayComponent (method)
  UnSetDayComponent(): void;

  // StepBasic_WeekOfYearAndDayDate.DayComponent (method)
  DayComponent(): number;

  // StepBasic_WeekOfYearAndDayDate.HasDayComponent (method)
  HasDayComponent(): boolean;

  // StepBasic_WeekOfYearAndDayDate.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_WeekOfYearAndDayDate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_WeekOfYearAndDayDate.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_WeekOfYearAndDayDate.delete (method)
  delete(): void;

  // StepBasic_WeekOfYearAndDayDate.[Symbol.dispose] (method)
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
