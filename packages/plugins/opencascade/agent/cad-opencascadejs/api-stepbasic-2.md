# libcascade — StepBasic (2)

33 top-level symbols. Signatures are verbatim typescript.

StepBasic_ConversionBasedUnitAndMassUnit: declare class StepBasic_ConversionBasedUnitAndMassUnit extends StepBasic_ConversionBasedUnit

constructor

Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetMassUnit(aMassUnit: StepBasic_MassUnit): void;

MassUnit(): StepBasic_MassUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndPlaneAngleUnit: declare class StepBasic_ConversionBasedUnitAndPlaneAngleUnit extends StepBasic_ConversionBasedUnit

constructor

Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetPlaneAngleUnit(aPlaneAngleUnit: StepBasic_PlaneAngleUnit): void;

PlaneAngleUnit(): StepBasic_PlaneAngleUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndRatioUnit: declare class StepBasic_ConversionBasedUnitAndRatioUnit extends StepBasic_ConversionBasedUnit

constructor

Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetRatioUnit(aRatioUnit: StepBasic_RatioUnit): void;

RatioUnit(): StepBasic_RatioUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndSolidAngleUnit: declare class StepBasic_ConversionBasedUnitAndSolidAngleUnit extends StepBasic_ConversionBasedUnit

constructor

Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetSolidAngleUnit(aSolidAngleUnit: StepBasic_SolidAngleUnit): void;

SolidAngleUnit(): StepBasic_SolidAngleUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndTimeUnit: declare class StepBasic_ConversionBasedUnitAndTimeUnit extends StepBasic_ConversionBasedUnit

constructor

Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetTimeUnit(aTimeUnit: StepBasic_TimeUnit): void;

TimeUnit(): StepBasic_TimeUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndVolumeUnit: declare class StepBasic_ConversionBasedUnitAndVolumeUnit extends StepBasic_ConversionBasedUnit

constructor

SetVolumeUnit(aVolumeUnit: StepBasic_VolumeUnit): void;

VolumeUnit(): StepBasic_VolumeUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_CoordinatedUniversalTimeOffset: declare class StepBasic_CoordinatedUniversalTimeOffset extends Standard_Transient

constructor

Init(aHourOffset: number, hasAminuteOffset: boolean, aMinuteOffset: number, aSense: StepBasic_AheadOrBehind): void;

SetHourOffset(aHourOffset: number): void;

HourOffset(): number;

SetMinuteOffset(aMinuteOffset: number): void;

UnSetMinuteOffset(): void;

MinuteOffset(): number;

HasMinuteOffset(): boolean;

SetSense(aSense: StepBasic_AheadOrBehind): void;

Sense(): StepBasic_AheadOrBehind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_Date: declare class StepBasic_Date extends Standard_Transient

constructor

Init(aYearComponent: number): void;

SetYearComponent(aYearComponent: number): void;

YearComponent(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DateAndTime: declare class StepBasic_DateAndTime extends Standard_Transient

constructor

Init(aDateComponent: StepBasic_Date, aTimeComponent: StepBasic_LocalTime): void;

SetDateComponent(aDateComponent: StepBasic_Date): void;

DateComponent(): StepBasic_Date;

SetTimeComponent(aTimeComponent: StepBasic_LocalTime): void;

TimeComponent(): StepBasic_LocalTime;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DateAndTimeAssignment: declare class StepBasic_DateAndTimeAssignment extends Standard_Transient

constructor

Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

SetAssignedDateAndTime(aAssignedDateAndTime: StepBasic_DateAndTime): void;

AssignedDateAndTime(): StepBasic_DateAndTime;

SetRole(aRole: StepBasic_DateTimeRole): void;

Role(): StepBasic_DateTimeRole;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DateAssignment: declare class StepBasic_DateAssignment extends Standard_Transient

constructor

Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

SetAssignedDate(aAssignedDate: StepBasic_Date): void;

AssignedDate(): StepBasic_Date;

SetRole(aRole: StepBasic_DateRole): void;

Role(): StepBasic_DateRole;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DateRole: declare class StepBasic_DateRole extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DateTimeRole: declare class StepBasic_DateTimeRole extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DateTimeSelect: declare class StepBasic_DateTimeSelect extends StepData_SelectType

constructor

// Recognizes a DateTimeSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Date (Null if another type)
Date(): StepBasic_Date;

// returns Value as a LocalTime (Null if another type)
LocalTime(): StepBasic_LocalTime;

// returns Value as a DateAndTime (Null if another type)
DateAndTime(): StepBasic_DateAndTime;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added from StepBasic Rev2 to Rev4
StepBasic_DerivedUnit: declare class StepBasic_DerivedUnit extends Standard_Transient

constructor

Init(elements: NCollection_HArray1_handle_StepBasic_DerivedUnitElement): void;

SetElements(elements: NCollection_HArray1_handle_StepBasic_DerivedUnitElement): void;

Elements(): NCollection_HArray1_handle_StepBasic_DerivedUnitElement;

NbElements(): number;

ElementsValue(num: number): StepBasic_DerivedUnitElement;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added from StepBasic Rev2 to Rev4
StepBasic_DerivedUnitElement: declare class StepBasic_DerivedUnitElement extends Standard_Transient

constructor

Init(aUnit: StepBasic_NamedUnit, aExponent: number): void;

SetUnit(aUnit: StepBasic_NamedUnit): void;

Unit(): StepBasic_NamedUnit;

SetExponent(aExponent: number): void;

Exponent(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// class added to Schema AP214 around April 1996
StepBasic_DesignContext: declare class StepBasic_DesignContext extends StepBasic_ProductDefinitionContext

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DigitalDocument: declare class StepBasic_DigitalDocument extends StepBasic_Document

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DimensionalExponents: declare class StepBasic_DimensionalExponents extends Standard_Transient

constructor

Init(aLengthExponent: number, aMassExponent: number, aTimeExponent: number, aElectricCurrentExponent: number, aThermodynamicTemperatureExponent: number, aAmountOfSubstanceExponent: number, aLuminousIntensityExponent: number): void;

SetLengthExponent(aLengthExponent: number): void;

LengthExponent(): number;

SetMassExponent(aMassExponent: number): void;

MassExponent(): number;

SetTimeExponent(aTimeExponent: number): void;

TimeExponent(): number;

SetElectricCurrentExponent(aElectricCurrentExponent: number): void;

ElectricCurrentExponent(): number;

SetThermodynamicTemperatureExponent(aThermodynamicTemperatureExponent: number): void;

ThermodynamicTemperatureExponent(): number;

SetAmountOfSubstanceExponent(aAmountOfSubstanceExponent: number): void;

AmountOfSubstanceExponent(): number;

SetLuminousIntensityExponent(aLuminousIntensityExponent: number): void;

LuminousIntensityExponent(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Document
StepBasic_Document: declare class StepBasic_Document extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;

// Returns field Id
Id(): TCollection_HAsciiString;

// Set field Id
SetId(Id: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

// Returns field Kind
Kind(): StepBasic_DocumentType;

// Set field Kind
SetKind(Kind: StepBasic_DocumentType): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DocumentFile
StepBasic_DocumentFile: declare class StepBasic_DocumentFile extends StepBasic_Document

constructor

// Initialize all fields (own and inherited)
Init(aDocument_Id: TCollection_HAsciiString, aDocument_Name: TCollection_HAsciiString, hasDocument_Description: boolean, aDocument_Description: TCollection_HAsciiString, aDocument_Kind: StepBasic_DocumentType, aCharacterizedObject_Name: TCollection_HAsciiString, hasCharacterizedObject_Description: boolean, aCharacterizedObject_Description: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;
Init(aDocument_Id: TCollection_HAsciiString, aDocument_Name: TCollection_HAsciiString, hasDocument_Description: boolean, aDocument_Description: TCollection_HAsciiString, aDocument_Kind: StepBasic_DocumentType, aCharacterizedObject_Name: TCollection_HAsciiString, hasCharacterizedObject_Description: boolean, aCharacterizedObject_Description: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;

// Returns data for supertype CharacterizedObject
CharacterizedObject(): StepBasic_CharacterizedObject;

// Set data for supertype CharacterizedObject
SetCharacterizedObject(CharacterizedObject: StepBasic_CharacterizedObject): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DocumentProductAssociation
StepBasic_DocumentProductAssociation: declare class StepBasic_DocumentProductAssociation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingDocument: StepBasic_Document, aRelatedProduct: StepBasic_ProductOrFormationOrDefinition): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

// Returns field RelatingDocument
RelatingDocument(): StepBasic_Document;

// Set field RelatingDocument
SetRelatingDocument(RelatingDocument: StepBasic_Document): void;

// Returns field RelatedProduct
RelatedProduct(): StepBasic_ProductOrFormationOrDefinition;

// Set field RelatedProduct
SetRelatedProduct(RelatedProduct: StepBasic_ProductOrFormationOrDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DocumentProductEquivalence
StepBasic_DocumentProductEquivalence: declare class StepBasic_DocumentProductEquivalence extends StepBasic_DocumentProductAssociation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentReference: declare class StepBasic_DocumentReference extends Standard_Transient

constructor

Init0(aAssignedDocument: StepBasic_Document, aSource: TCollection_HAsciiString): void;

AssignedDocument(): StepBasic_Document;

SetAssignedDocument(aAssignedDocument: StepBasic_Document): void;

Source(): TCollection_HAsciiString;

SetSource(aSource: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentRelationship: declare class StepBasic_DocumentRelationship extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelating: StepBasic_Document, aRelated: StepBasic_Document): void;

Name(): TCollection_HAsciiString;

SetName(aName: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

RelatingDocument(): StepBasic_Document;

SetRelatingDocument(aRelating: StepBasic_Document): void;

RelatedDocument(): StepBasic_Document;

SetRelatedDocument(aRelated: StepBasic_Document): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DocumentRepresentationType
StepBasic_DocumentRepresentationType: declare class StepBasic_DocumentRepresentationType extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, aRepresentedDocument: StepBasic_Document): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field RepresentedDocument
RepresentedDocument(): StepBasic_Document;

// Set field RepresentedDocument
SetRepresentedDocument(RepresentedDocument: StepBasic_Document): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentType: declare class StepBasic_DocumentType extends Standard_Transient

constructor

Init(apdt: TCollection_HAsciiString): void;

ProductDataType(): TCollection_HAsciiString;

SetProductDataType(apdt: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentUsageConstraint: declare class StepBasic_DocumentUsageConstraint extends Standard_Transient

constructor

Init(aSource: StepBasic_Document, ase: TCollection_HAsciiString, asev: TCollection_HAsciiString): void;

Source(): StepBasic_Document;

SetSource(aSource: StepBasic_Document): void;

SubjectElement(): TCollection_HAsciiString;

SetSubjectElement(ase: TCollection_HAsciiString): void;

SubjectElementValue(): TCollection_HAsciiString;

SetSubjectElementValue(asev: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_Effectivity: declare class StepBasic_Effectivity extends Standard_Transient

constructor

Init(aid: TCollection_HAsciiString): void;

Id(): TCollection_HAsciiString;

SetId(aid: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity EffectivityAssignment
StepBasic_EffectivityAssignment: declare class StepBasic_EffectivityAssignment extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aAssignedEffectivity: StepBasic_Effectivity): void;

// Returns field AssignedEffectivity
AssignedEffectivity(): StepBasic_Effectivity;

// Set field AssignedEffectivity
SetAssignedEffectivity(AssignedEffectivity: StepBasic_Effectivity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity EulerAngles
StepBasic_EulerAngles: declare class StepBasic_EulerAngles extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aAngles: NCollection_HArray1_double): void;

// Returns field Angles
Angles(): NCollection_HArray1_double;

// Set field Angles
SetAngles(Angles: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ExternalIdentificationAssignment
StepBasic_ExternalIdentificationAssignment: declare class StepBasic_ExternalIdentificationAssignment extends StepBasic_IdentificationAssignment

constructor

// Initialize all fields (own and inherited)
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

// Returns field Source
Source(): StepBasic_ExternalSource;

// Set field Source
SetSource(Source: StepBasic_ExternalSource): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ExternalSource
StepBasic_ExternalSource: declare class StepBasic_ExternalSource extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aSourceId: StepBasic_SourceItem): void;

// Returns field SourceId
SourceId(): StepBasic_SourceItem;

// Set field SourceId
SetSourceId(SourceId: StepBasic_SourceItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
