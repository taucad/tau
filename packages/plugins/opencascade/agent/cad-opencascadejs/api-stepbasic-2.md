# libcascade — StepBasic (2)

37 top-level symbols. Signatures are verbatim typescript.

StepBasic_CoordinatedUniversalTimeOffset: declare class StepBasic_CoordinatedUniversalTimeOffset extends Standard_Transient

  // StepBasic_CoordinatedUniversalTimeOffset.constructor (constructor)
  constructor();

  // StepBasic_CoordinatedUniversalTimeOffset.Init (method)
  Init(aHourOffset: number, hasAminuteOffset: boolean, aMinuteOffset: number, aSense: StepBasic_AheadOrBehind): void;

  // StepBasic_CoordinatedUniversalTimeOffset.SetHourOffset (method)
  SetHourOffset(aHourOffset: number): void;

  // StepBasic_CoordinatedUniversalTimeOffset.HourOffset (method)
  HourOffset(): number;

  // StepBasic_CoordinatedUniversalTimeOffset.SetMinuteOffset (method)
  SetMinuteOffset(aMinuteOffset: number): void;

  // StepBasic_CoordinatedUniversalTimeOffset.UnSetMinuteOffset (method)
  UnSetMinuteOffset(): void;

  // StepBasic_CoordinatedUniversalTimeOffset.MinuteOffset (method)
  MinuteOffset(): number;

  // StepBasic_CoordinatedUniversalTimeOffset.HasMinuteOffset (method)
  HasMinuteOffset(): boolean;

  // StepBasic_CoordinatedUniversalTimeOffset.SetSense (method)
  SetSense(aSense: StepBasic_AheadOrBehind): void;

  // StepBasic_CoordinatedUniversalTimeOffset.Sense (method)
  Sense(): StepBasic_AheadOrBehind;

  // StepBasic_CoordinatedUniversalTimeOffset.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_CoordinatedUniversalTimeOffset.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_CoordinatedUniversalTimeOffset.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_CoordinatedUniversalTimeOffset.delete (method)
  delete(): void;

  // StepBasic_CoordinatedUniversalTimeOffset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Date: declare class StepBasic_Date extends Standard_Transient

  // StepBasic_Date.constructor (constructor)
  constructor();

  // StepBasic_Date.Init (method)
  Init(aYearComponent: number): void;

  // StepBasic_Date.SetYearComponent (method)
  SetYearComponent(aYearComponent: number): void;

  // StepBasic_Date.YearComponent (method)
  YearComponent(): number;

  // StepBasic_Date.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Date.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Date.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Date.delete (method)
  delete(): void;

  // StepBasic_Date.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DateAndTime: declare class StepBasic_DateAndTime extends Standard_Transient

  // StepBasic_DateAndTime.constructor (constructor)
  constructor();

  // StepBasic_DateAndTime.Init (method)
  Init(aDateComponent: StepBasic_Date, aTimeComponent: StepBasic_LocalTime): void;

  // StepBasic_DateAndTime.SetDateComponent (method)
  SetDateComponent(aDateComponent: StepBasic_Date): void;

  // StepBasic_DateAndTime.DateComponent (method)
  DateComponent(): StepBasic_Date;

  // StepBasic_DateAndTime.SetTimeComponent (method)
  SetTimeComponent(aTimeComponent: StepBasic_LocalTime): void;

  // StepBasic_DateAndTime.TimeComponent (method)
  TimeComponent(): StepBasic_LocalTime;

  // StepBasic_DateAndTime.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DateAndTime.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DateAndTime.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DateAndTime.delete (method)
  delete(): void;

  // StepBasic_DateAndTime.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DateAndTimeAssignment: declare class StepBasic_DateAndTimeAssignment extends Standard_Transient

  // StepBasic_DateAndTimeAssignment.constructor (constructor)
  constructor();

  // StepBasic_DateAndTimeAssignment.Init (method)
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  // StepBasic_DateAndTimeAssignment.SetAssignedDateAndTime (method)
  SetAssignedDateAndTime(aAssignedDateAndTime: StepBasic_DateAndTime): void;

  // StepBasic_DateAndTimeAssignment.AssignedDateAndTime (method)
  AssignedDateAndTime(): StepBasic_DateAndTime;

  // StepBasic_DateAndTimeAssignment.SetRole (method)
  SetRole(aRole: StepBasic_DateTimeRole): void;

  // StepBasic_DateAndTimeAssignment.Role (method)
  Role(): StepBasic_DateTimeRole;

  // StepBasic_DateAndTimeAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DateAndTimeAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DateAndTimeAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DateAndTimeAssignment.delete (method)
  delete(): void;

  // StepBasic_DateAndTimeAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DateAssignment: declare class StepBasic_DateAssignment extends Standard_Transient

  // StepBasic_DateAssignment.constructor (constructor)
  constructor();

  // StepBasic_DateAssignment.Init (method)
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  // StepBasic_DateAssignment.SetAssignedDate (method)
  SetAssignedDate(aAssignedDate: StepBasic_Date): void;

  // StepBasic_DateAssignment.AssignedDate (method)
  AssignedDate(): StepBasic_Date;

  // StepBasic_DateAssignment.SetRole (method)
  SetRole(aRole: StepBasic_DateRole): void;

  // StepBasic_DateAssignment.Role (method)
  Role(): StepBasic_DateRole;

  // StepBasic_DateAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DateAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DateAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DateAssignment.delete (method)
  delete(): void;

  // StepBasic_DateAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DateRole: declare class StepBasic_DateRole extends Standard_Transient

  // StepBasic_DateRole.constructor (constructor)
  constructor();

  // StepBasic_DateRole.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepBasic_DateRole.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_DateRole.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_DateRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DateRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DateRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DateRole.delete (method)
  delete(): void;

  // StepBasic_DateRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DateTimeRole: declare class StepBasic_DateTimeRole extends Standard_Transient

  // StepBasic_DateTimeRole.constructor (constructor)
  constructor();

  // StepBasic_DateTimeRole.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepBasic_DateTimeRole.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_DateTimeRole.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_DateTimeRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DateTimeRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DateTimeRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DateTimeRole.delete (method)
  delete(): void;

  // StepBasic_DateTimeRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DateTimeSelect: declare class StepBasic_DateTimeSelect extends StepData_SelectType

  // StepBasic_DateTimeSelect.constructor (constructor)
  constructor();

  // StepBasic_DateTimeSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_DateTimeSelect.Date (method)
  Date(): StepBasic_Date;

  // StepBasic_DateTimeSelect.LocalTime (method)
  LocalTime(): StepBasic_LocalTime;

  // StepBasic_DateTimeSelect.DateAndTime (method)
  DateAndTime(): StepBasic_DateAndTime;

  // StepBasic_DateTimeSelect.delete (method)
  delete(): void;

  // StepBasic_DateTimeSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DerivedUnit: declare class StepBasic_DerivedUnit extends Standard_Transient

  // StepBasic_DerivedUnit.constructor (constructor)
  constructor();

  // StepBasic_DerivedUnit.Init (method)
  Init(elements: NCollection_HArray1_handle_StepBasic_DerivedUnitElement): void;

  // StepBasic_DerivedUnit.SetElements (method)
  SetElements(elements: NCollection_HArray1_handle_StepBasic_DerivedUnitElement): void;

  // StepBasic_DerivedUnit.Elements (method)
  Elements(): NCollection_HArray1_handle_StepBasic_DerivedUnitElement;

  // StepBasic_DerivedUnit.NbElements (method)
  NbElements(): number;

  // StepBasic_DerivedUnit.ElementsValue (method)
  ElementsValue(num: number): StepBasic_DerivedUnitElement;

  // StepBasic_DerivedUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DerivedUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DerivedUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DerivedUnit.delete (method)
  delete(): void;

  // StepBasic_DerivedUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DerivedUnitElement: declare class StepBasic_DerivedUnitElement extends Standard_Transient

  // StepBasic_DerivedUnitElement.constructor (constructor)
  constructor();

  // StepBasic_DerivedUnitElement.Init (method)
  Init(aUnit: StepBasic_NamedUnit, aExponent: number): void;

  // StepBasic_DerivedUnitElement.SetUnit (method)
  SetUnit(aUnit: StepBasic_NamedUnit): void;

  // StepBasic_DerivedUnitElement.Unit (method)
  Unit(): StepBasic_NamedUnit;

  // StepBasic_DerivedUnitElement.SetExponent (method)
  SetExponent(aExponent: number): void;

  // StepBasic_DerivedUnitElement.Exponent (method)
  Exponent(): number;

  // StepBasic_DerivedUnitElement.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DerivedUnitElement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DerivedUnitElement.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DerivedUnitElement.delete (method)
  delete(): void;

  // StepBasic_DerivedUnitElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DesignContext: declare class StepBasic_DesignContext extends StepBasic_ProductDefinitionContext

  // StepBasic_DesignContext.constructor (constructor)
  constructor();

  // StepBasic_DesignContext.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DesignContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DesignContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DesignContext.delete (method)
  delete(): void;

  // StepBasic_DesignContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DigitalDocument: declare class StepBasic_DigitalDocument extends StepBasic_Document

  // StepBasic_DigitalDocument.constructor (constructor)
  constructor();

  // StepBasic_DigitalDocument.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DigitalDocument.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DigitalDocument.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DigitalDocument.delete (method)
  delete(): void;

  // StepBasic_DigitalDocument.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DimensionalExponents: declare class StepBasic_DimensionalExponents extends Standard_Transient

  // StepBasic_DimensionalExponents.constructor (constructor)
  constructor();

  // StepBasic_DimensionalExponents.Init (method)
  Init(aLengthExponent: number, aMassExponent: number, aTimeExponent: number, aElectricCurrentExponent: number, aThermodynamicTemperatureExponent: number, aAmountOfSubstanceExponent: number, aLuminousIntensityExponent: number): void;

  // StepBasic_DimensionalExponents.SetLengthExponent (method)
  SetLengthExponent(aLengthExponent: number): void;

  // StepBasic_DimensionalExponents.LengthExponent (method)
  LengthExponent(): number;

  // StepBasic_DimensionalExponents.SetMassExponent (method)
  SetMassExponent(aMassExponent: number): void;

  // StepBasic_DimensionalExponents.MassExponent (method)
  MassExponent(): number;

  // StepBasic_DimensionalExponents.SetTimeExponent (method)
  SetTimeExponent(aTimeExponent: number): void;

  // StepBasic_DimensionalExponents.TimeExponent (method)
  TimeExponent(): number;

  // StepBasic_DimensionalExponents.SetElectricCurrentExponent (method)
  SetElectricCurrentExponent(aElectricCurrentExponent: number): void;

  // StepBasic_DimensionalExponents.ElectricCurrentExponent (method)
  ElectricCurrentExponent(): number;

  // StepBasic_DimensionalExponents.SetThermodynamicTemperatureExponent (method)
  SetThermodynamicTemperatureExponent(aThermodynamicTemperatureExponent: number): void;

  // StepBasic_DimensionalExponents.ThermodynamicTemperatureExponent (method)
  ThermodynamicTemperatureExponent(): number;

  // StepBasic_DimensionalExponents.SetAmountOfSubstanceExponent (method)
  SetAmountOfSubstanceExponent(aAmountOfSubstanceExponent: number): void;

  // StepBasic_DimensionalExponents.AmountOfSubstanceExponent (method)
  AmountOfSubstanceExponent(): number;

  // StepBasic_DimensionalExponents.SetLuminousIntensityExponent (method)
  SetLuminousIntensityExponent(aLuminousIntensityExponent: number): void;

  // StepBasic_DimensionalExponents.LuminousIntensityExponent (method)
  LuminousIntensityExponent(): number;

  // StepBasic_DimensionalExponents.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DimensionalExponents.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DimensionalExponents.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DimensionalExponents.delete (method)
  delete(): void;

  // StepBasic_DimensionalExponents.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Document: declare class StepBasic_Document extends Standard_Transient

  // StepBasic_Document.constructor (constructor)
  constructor();

  // StepBasic_Document.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;

  // StepBasic_Document.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_Document.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepBasic_Document.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Document.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_Document.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_Document.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_Document.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_Document.Kind (method)
  Kind(): StepBasic_DocumentType;

  // StepBasic_Document.SetKind (method)
  SetKind(Kind: StepBasic_DocumentType): void;

  // StepBasic_Document.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Document.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Document.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Document.delete (method)
  delete(): void;

  // StepBasic_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentFile: declare class StepBasic_DocumentFile extends StepBasic_Document

  // StepBasic_DocumentFile.constructor (constructor)
  constructor();

  // StepBasic_DocumentFile.Init (method)
  Init(aDocument_Id: TCollection_HAsciiString, aDocument_Name: TCollection_HAsciiString, hasDocument_Description: boolean, aDocument_Description: TCollection_HAsciiString, aDocument_Kind: StepBasic_DocumentType, aCharacterizedObject_Name: TCollection_HAsciiString, hasCharacterizedObject_Description: boolean, aCharacterizedObject_Description: TCollection_HAsciiString): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;

  // StepBasic_DocumentFile.CharacterizedObject (method)
  CharacterizedObject(): StepBasic_CharacterizedObject;

  // StepBasic_DocumentFile.SetCharacterizedObject (method)
  SetCharacterizedObject(CharacterizedObject: StepBasic_CharacterizedObject): void;

  // StepBasic_DocumentFile.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentFile.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentFile.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentFile.delete (method)
  delete(): void;

  // StepBasic_DocumentFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentProductAssociation: declare class StepBasic_DocumentProductAssociation extends Standard_Transient

  // StepBasic_DocumentProductAssociation.constructor (constructor)
  constructor();

  // StepBasic_DocumentProductAssociation.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingDocument: StepBasic_Document, aRelatedProduct: StepBasic_ProductOrFormationOrDefinition): void;

  // StepBasic_DocumentProductAssociation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_DocumentProductAssociation.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_DocumentProductAssociation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_DocumentProductAssociation.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_DocumentProductAssociation.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_DocumentProductAssociation.RelatingDocument (method)
  RelatingDocument(): StepBasic_Document;

  // StepBasic_DocumentProductAssociation.SetRelatingDocument (method)
  SetRelatingDocument(RelatingDocument: StepBasic_Document): void;

  // StepBasic_DocumentProductAssociation.RelatedProduct (method)
  RelatedProduct(): StepBasic_ProductOrFormationOrDefinition;

  // StepBasic_DocumentProductAssociation.SetRelatedProduct (method)
  SetRelatedProduct(RelatedProduct: StepBasic_ProductOrFormationOrDefinition): void;

  // StepBasic_DocumentProductAssociation.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentProductAssociation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentProductAssociation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentProductAssociation.delete (method)
  delete(): void;

  // StepBasic_DocumentProductAssociation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentProductEquivalence: declare class StepBasic_DocumentProductEquivalence extends StepBasic_DocumentProductAssociation

  // StepBasic_DocumentProductEquivalence.constructor (constructor)
  constructor();

  // StepBasic_DocumentProductEquivalence.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentProductEquivalence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentProductEquivalence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentProductEquivalence.delete (method)
  delete(): void;

  // StepBasic_DocumentProductEquivalence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentReference: declare class StepBasic_DocumentReference extends Standard_Transient

  // StepBasic_DocumentReference.constructor (constructor)
  constructor();

  // StepBasic_DocumentReference.Init0 (method)
  Init0(aAssignedDocument: StepBasic_Document, aSource: TCollection_HAsciiString): void;

  // StepBasic_DocumentReference.AssignedDocument (method)
  AssignedDocument(): StepBasic_Document;

  // StepBasic_DocumentReference.SetAssignedDocument (method)
  SetAssignedDocument(aAssignedDocument: StepBasic_Document): void;

  // StepBasic_DocumentReference.Source (method)
  Source(): TCollection_HAsciiString;

  // StepBasic_DocumentReference.SetSource (method)
  SetSource(aSource: TCollection_HAsciiString): void;

  // StepBasic_DocumentReference.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentReference.delete (method)
  delete(): void;

  // StepBasic_DocumentReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentRelationship: declare class StepBasic_DocumentRelationship extends Standard_Transient

  // StepBasic_DocumentRelationship.constructor (constructor)
  constructor();

  // StepBasic_DocumentRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelating: StepBasic_Document, aRelated: StepBasic_Document): void;

  // StepBasic_DocumentRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_DocumentRelationship.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_DocumentRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_DocumentRelationship.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_DocumentRelationship.RelatingDocument (method)
  RelatingDocument(): StepBasic_Document;

  // StepBasic_DocumentRelationship.SetRelatingDocument (method)
  SetRelatingDocument(aRelating: StepBasic_Document): void;

  // StepBasic_DocumentRelationship.RelatedDocument (method)
  RelatedDocument(): StepBasic_Document;

  // StepBasic_DocumentRelationship.SetRelatedDocument (method)
  SetRelatedDocument(aRelated: StepBasic_Document): void;

  // StepBasic_DocumentRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentRelationship.delete (method)
  delete(): void;

  // StepBasic_DocumentRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentRepresentationType: declare class StepBasic_DocumentRepresentationType extends Standard_Transient

  // StepBasic_DocumentRepresentationType.constructor (constructor)
  constructor();

  // StepBasic_DocumentRepresentationType.Init (method)
  Init(aName: TCollection_HAsciiString, aRepresentedDocument: StepBasic_Document): void;

  // StepBasic_DocumentRepresentationType.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_DocumentRepresentationType.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_DocumentRepresentationType.RepresentedDocument (method)
  RepresentedDocument(): StepBasic_Document;

  // StepBasic_DocumentRepresentationType.SetRepresentedDocument (method)
  SetRepresentedDocument(RepresentedDocument: StepBasic_Document): void;

  // StepBasic_DocumentRepresentationType.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentRepresentationType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentRepresentationType.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentRepresentationType.delete (method)
  delete(): void;

  // StepBasic_DocumentRepresentationType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentType: declare class StepBasic_DocumentType extends Standard_Transient

  // StepBasic_DocumentType.constructor (constructor)
  constructor();

  // StepBasic_DocumentType.Init (method)
  Init(apdt: TCollection_HAsciiString): void;

  // StepBasic_DocumentType.ProductDataType (method)
  ProductDataType(): TCollection_HAsciiString;

  // StepBasic_DocumentType.SetProductDataType (method)
  SetProductDataType(apdt: TCollection_HAsciiString): void;

  // StepBasic_DocumentType.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentType.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentType.delete (method)
  delete(): void;

  // StepBasic_DocumentType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_DocumentUsageConstraint: declare class StepBasic_DocumentUsageConstraint extends Standard_Transient

  // StepBasic_DocumentUsageConstraint.constructor (constructor)
  constructor();

  // StepBasic_DocumentUsageConstraint.Init (method)
  Init(aSource: StepBasic_Document, ase: TCollection_HAsciiString, asev: TCollection_HAsciiString): void;

  // StepBasic_DocumentUsageConstraint.Source (method)
  Source(): StepBasic_Document;

  // StepBasic_DocumentUsageConstraint.SetSource (method)
  SetSource(aSource: StepBasic_Document): void;

  // StepBasic_DocumentUsageConstraint.SubjectElement (method)
  SubjectElement(): TCollection_HAsciiString;

  // StepBasic_DocumentUsageConstraint.SetSubjectElement (method)
  SetSubjectElement(ase: TCollection_HAsciiString): void;

  // StepBasic_DocumentUsageConstraint.SubjectElementValue (method)
  SubjectElementValue(): TCollection_HAsciiString;

  // StepBasic_DocumentUsageConstraint.SetSubjectElementValue (method)
  SetSubjectElementValue(asev: TCollection_HAsciiString): void;

  // StepBasic_DocumentUsageConstraint.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_DocumentUsageConstraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_DocumentUsageConstraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_DocumentUsageConstraint.delete (method)
  delete(): void;

  // StepBasic_DocumentUsageConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Effectivity: declare class StepBasic_Effectivity extends Standard_Transient

  // StepBasic_Effectivity.constructor (constructor)
  constructor();

  // StepBasic_Effectivity.Init (method)
  Init(aid: TCollection_HAsciiString): void;

  // StepBasic_Effectivity.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_Effectivity.SetId (method)
  SetId(aid: TCollection_HAsciiString): void;

  // StepBasic_Effectivity.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Effectivity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Effectivity.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Effectivity.delete (method)
  delete(): void;

  // StepBasic_Effectivity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_EffectivityAssignment: declare class StepBasic_EffectivityAssignment extends Standard_Transient

  // StepBasic_EffectivityAssignment.constructor (constructor)
  constructor();

  // StepBasic_EffectivityAssignment.Init (method)
  Init(aAssignedEffectivity: StepBasic_Effectivity): void;

  // StepBasic_EffectivityAssignment.AssignedEffectivity (method)
  AssignedEffectivity(): StepBasic_Effectivity;

  // StepBasic_EffectivityAssignment.SetAssignedEffectivity (method)
  SetAssignedEffectivity(AssignedEffectivity: StepBasic_Effectivity): void;

  // StepBasic_EffectivityAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_EffectivityAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_EffectivityAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_EffectivityAssignment.delete (method)
  delete(): void;

  // StepBasic_EffectivityAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_EulerAngles: declare class StepBasic_EulerAngles extends Standard_Transient

  // StepBasic_EulerAngles.constructor (constructor)
  constructor();

  // StepBasic_EulerAngles.Init (method)
  Init(aAngles: NCollection_HArray1_double): void;

  // StepBasic_EulerAngles.Angles (method)
  Angles(): NCollection_HArray1_double;

  // StepBasic_EulerAngles.SetAngles (method)
  SetAngles(Angles: NCollection_HArray1_double): void;

  // StepBasic_EulerAngles.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_EulerAngles.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_EulerAngles.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_EulerAngles.delete (method)
  delete(): void;

  // StepBasic_EulerAngles.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ExternalIdentificationAssignment: declare class StepBasic_ExternalIdentificationAssignment extends StepBasic_IdentificationAssignment

  // StepBasic_ExternalIdentificationAssignment.constructor (constructor)
  constructor();

  // StepBasic_ExternalIdentificationAssignment.Init (method)
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
  Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

  // StepBasic_ExternalIdentificationAssignment.Source (method)
  Source(): StepBasic_ExternalSource;

  // StepBasic_ExternalIdentificationAssignment.SetSource (method)
  SetSource(Source: StepBasic_ExternalSource): void;

  // StepBasic_ExternalIdentificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ExternalIdentificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ExternalIdentificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ExternalIdentificationAssignment.delete (method)
  delete(): void;

  // StepBasic_ExternalIdentificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ExternalSource: declare class StepBasic_ExternalSource extends Standard_Transient

  // StepBasic_ExternalSource.constructor (constructor)
  constructor();

  // StepBasic_ExternalSource.Init (method)
  Init(aSourceId: StepBasic_SourceItem): void;

  // StepBasic_ExternalSource.SourceId (method)
  SourceId(): StepBasic_SourceItem;

  // StepBasic_ExternalSource.SetSourceId (method)
  SetSourceId(SourceId: StepBasic_SourceItem): void;

  // StepBasic_ExternalSource.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ExternalSource.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ExternalSource.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ExternalSource.delete (method)
  delete(): void;

  // StepBasic_ExternalSource.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ExternallyDefinedItem: declare class StepBasic_ExternallyDefinedItem extends Standard_Transient

  // StepBasic_ExternallyDefinedItem.constructor (constructor)
  constructor();

  // StepBasic_ExternallyDefinedItem.Init (method)
  Init(aItemId: StepBasic_SourceItem, aSource: StepBasic_ExternalSource): void;

  // StepBasic_ExternallyDefinedItem.ItemId (method)
  ItemId(): StepBasic_SourceItem;

  // StepBasic_ExternallyDefinedItem.SetItemId (method)
  SetItemId(ItemId: StepBasic_SourceItem): void;

  // StepBasic_ExternallyDefinedItem.Source (method)
  Source(): StepBasic_ExternalSource;

  // StepBasic_ExternallyDefinedItem.SetSource (method)
  SetSource(Source: StepBasic_ExternalSource): void;

  // StepBasic_ExternallyDefinedItem.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ExternallyDefinedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ExternallyDefinedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ExternallyDefinedItem.delete (method)
  delete(): void;

  // StepBasic_ExternallyDefinedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_GeneralProperty: declare class StepBasic_GeneralProperty extends Standard_Transient

  // StepBasic_GeneralProperty.constructor (constructor)
  constructor();

  // StepBasic_GeneralProperty.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_GeneralProperty.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_GeneralProperty.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepBasic_GeneralProperty.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_GeneralProperty.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_GeneralProperty.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_GeneralProperty.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_GeneralProperty.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_GeneralProperty.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_GeneralProperty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_GeneralProperty.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_GeneralProperty.delete (method)
  delete(): void;

  // StepBasic_GeneralProperty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_GeneralPropertyAssociation: declare class StepBasic_GeneralPropertyAssociation extends Standard_Transient

  // StepBasic_GeneralPropertyAssociation.constructor (constructor)
  constructor();

  // StepBasic_GeneralPropertyAssociation.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aGeneralProperty: StepBasic_GeneralProperty, aPropertyDefinition: StepRepr_PropertyDefinition): void;

  // StepBasic_GeneralPropertyAssociation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_GeneralPropertyAssociation.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_GeneralPropertyAssociation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_GeneralPropertyAssociation.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_GeneralPropertyAssociation.GeneralProperty (method)
  GeneralProperty(): StepBasic_GeneralProperty;

  // StepBasic_GeneralPropertyAssociation.SetGeneralProperty (method)
  SetGeneralProperty(GeneralProperty: StepBasic_GeneralProperty): void;

  // StepBasic_GeneralPropertyAssociation.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepBasic_GeneralPropertyAssociation.SetPropertyDefinition (method)
  SetPropertyDefinition(PropertyDefinition: StepRepr_PropertyDefinition): void;

  // StepBasic_GeneralPropertyAssociation.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_GeneralPropertyAssociation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_GeneralPropertyAssociation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_GeneralPropertyAssociation.delete (method)
  delete(): void;

  // StepBasic_GeneralPropertyAssociation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_GeneralPropertyRelationship: declare class StepBasic_GeneralPropertyRelationship extends Standard_Transient

  // StepBasic_GeneralPropertyRelationship.constructor (constructor)
  constructor();

  // StepBasic_GeneralPropertyRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingGeneralProperty: StepBasic_GeneralProperty, aRelatedGeneralProperty: StepBasic_GeneralProperty): void;

  // StepBasic_GeneralPropertyRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_GeneralPropertyRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_GeneralPropertyRelationship.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_GeneralPropertyRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_GeneralPropertyRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_GeneralPropertyRelationship.RelatingGeneralProperty (method)
  RelatingGeneralProperty(): StepBasic_GeneralProperty;

  // StepBasic_GeneralPropertyRelationship.SetRelatingGeneralProperty (method)
  SetRelatingGeneralProperty(RelatingGeneralProperty: StepBasic_GeneralProperty): void;

  // StepBasic_GeneralPropertyRelationship.RelatedGeneralProperty (method)
  RelatedGeneralProperty(): StepBasic_GeneralProperty;

  // StepBasic_GeneralPropertyRelationship.SetRelatedGeneralProperty (method)
  SetRelatedGeneralProperty(RelatedGeneralProperty: StepBasic_GeneralProperty): void;

  // StepBasic_GeneralPropertyRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_GeneralPropertyRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_GeneralPropertyRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_GeneralPropertyRelationship.delete (method)
  delete(): void;

  // StepBasic_GeneralPropertyRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Group: declare class StepBasic_Group extends Standard_Transient

  // StepBasic_Group.constructor (constructor)
  constructor();

  // StepBasic_Group.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_Group.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Group.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_Group.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_Group.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_Group.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_Group.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Group.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Group.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Group.delete (method)
  delete(): void;

  // StepBasic_Group.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_GroupAssignment: declare class StepBasic_GroupAssignment extends Standard_Transient

  // StepBasic_GroupAssignment.constructor (constructor)
  constructor();

  // StepBasic_GroupAssignment.Init (method)
  Init(aAssignedGroup: StepBasic_Group): void;

  // StepBasic_GroupAssignment.AssignedGroup (method)
  AssignedGroup(): StepBasic_Group;

  // StepBasic_GroupAssignment.SetAssignedGroup (method)
  SetAssignedGroup(AssignedGroup: StepBasic_Group): void;

  // StepBasic_GroupAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_GroupAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_GroupAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_GroupAssignment.delete (method)
  delete(): void;

  // StepBasic_GroupAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_GroupRelationship: declare class StepBasic_GroupRelationship extends Standard_Transient

  // StepBasic_GroupRelationship.constructor (constructor)
  constructor();

  // StepBasic_GroupRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingGroup: StepBasic_Group, aRelatedGroup: StepBasic_Group): void;

  // StepBasic_GroupRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_GroupRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_GroupRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_GroupRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_GroupRelationship.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_GroupRelationship.RelatingGroup (method)
  RelatingGroup(): StepBasic_Group;

  // StepBasic_GroupRelationship.SetRelatingGroup (method)
  SetRelatingGroup(RelatingGroup: StepBasic_Group): void;

  // StepBasic_GroupRelationship.RelatedGroup (method)
  RelatedGroup(): StepBasic_Group;

  // StepBasic_GroupRelationship.SetRelatedGroup (method)
  SetRelatedGroup(RelatedGroup: StepBasic_Group): void;

  // StepBasic_GroupRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_GroupRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_GroupRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_GroupRelationship.delete (method)
  delete(): void;

  // StepBasic_GroupRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_IdentificationAssignment: declare class StepBasic_IdentificationAssignment extends Standard_Transient

  // StepBasic_IdentificationAssignment.constructor (constructor)
  constructor();

  // StepBasic_IdentificationAssignment.Init (method)
  Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

  // StepBasic_IdentificationAssignment.AssignedId (method)
  AssignedId(): TCollection_HAsciiString;

  // StepBasic_IdentificationAssignment.SetAssignedId (method)
  SetAssignedId(AssignedId: TCollection_HAsciiString): void;

  // StepBasic_IdentificationAssignment.Role (method)
  Role(): StepBasic_IdentificationRole;

  // StepBasic_IdentificationAssignment.SetRole (method)
  SetRole(Role: StepBasic_IdentificationRole): void;

  // StepBasic_IdentificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_IdentificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_IdentificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_IdentificationAssignment.delete (method)
  delete(): void;

  // StepBasic_IdentificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_IdentificationRole: declare class StepBasic_IdentificationRole extends Standard_Transient

  // StepBasic_IdentificationRole.constructor (constructor)
  constructor();

  // StepBasic_IdentificationRole.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_IdentificationRole.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_IdentificationRole.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_IdentificationRole.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_IdentificationRole.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_IdentificationRole.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_IdentificationRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_IdentificationRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_IdentificationRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_IdentificationRole.delete (method)
  delete(): void;

  // StepBasic_IdentificationRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_LengthMeasureWithUnit: declare class StepBasic_LengthMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_LengthMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_LengthMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_LengthMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_LengthMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_LengthMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_LengthMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
