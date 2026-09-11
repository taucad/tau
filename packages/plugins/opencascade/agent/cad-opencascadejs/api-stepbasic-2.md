# libcascade — StepBasic (2)

37 top-level symbols. Signatures are verbatim typescript.

StepBasic_ConversionBasedUnitAndVolumeUnit: declare class StepBasic_ConversionBasedUnitAndVolumeUnit extends StepBasic_ConversionBasedUnit

constructor

SetVolumeUnit(aVolumeUnit: StepBasic_VolumeUnit): void;

VolumeUnit(): StepBasic_VolumeUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_DateTimeSelect: declare class StepBasic_DateTimeSelect extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Date(): StepBasic_Date;

LocalTime(): StepBasic_LocalTime;

DateAndTime(): StepBasic_DateAndTime;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_DesignContext: declare class StepBasic_DesignContext extends StepBasic_ProductDefinitionContext

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_DigitalDocument: declare class StepBasic_DigitalDocument extends StepBasic_Document

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_Document: declare class StepBasic_Document extends Standard_Transient

constructor

Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;

Id(): TCollection_HAsciiString;

SetId(Id: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

Kind(): StepBasic_DocumentType;

SetKind(Kind: StepBasic_DocumentType): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentFile: declare class StepBasic_DocumentFile extends StepBasic_Document

constructor

Init(aDocument_Id: TCollection_HAsciiString, aDocument_Name: TCollection_HAsciiString, hasDocument_Description: boolean, aDocument_Description: TCollection_HAsciiString, aDocument_Kind: StepBasic_DocumentType, aCharacterizedObject_Name: TCollection_HAsciiString, hasCharacterizedObject_Description: boolean, aCharacterizedObject_Description: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;
Init(aDocument_Id: TCollection_HAsciiString, aDocument_Name: TCollection_HAsciiString, hasDocument_Description: boolean, aDocument_Description: TCollection_HAsciiString, aDocument_Kind: StepBasic_DocumentType, aCharacterizedObject_Name: TCollection_HAsciiString, hasCharacterizedObject_Description: boolean, aCharacterizedObject_Description: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aKind: StepBasic_DocumentType): void;

CharacterizedObject(): StepBasic_CharacterizedObject;

SetCharacterizedObject(CharacterizedObject: StepBasic_CharacterizedObject): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentProductAssociation: declare class StepBasic_DocumentProductAssociation extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingDocument: StepBasic_Document, aRelatedProduct: StepBasic_ProductOrFormationOrDefinition): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

RelatingDocument(): StepBasic_Document;

SetRelatingDocument(RelatingDocument: StepBasic_Document): void;

RelatedProduct(): StepBasic_ProductOrFormationOrDefinition;

SetRelatedProduct(RelatedProduct: StepBasic_ProductOrFormationOrDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentProductEquivalence: declare class StepBasic_DocumentProductEquivalence extends StepBasic_DocumentProductAssociation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_DocumentRepresentationType: declare class StepBasic_DocumentRepresentationType extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aRepresentedDocument: StepBasic_Document): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

RepresentedDocument(): StepBasic_Document;

SetRepresentedDocument(RepresentedDocument: StepBasic_Document): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_EffectivityAssignment: declare class StepBasic_EffectivityAssignment extends Standard_Transient

constructor

Init(aAssignedEffectivity: StepBasic_Effectivity): void;

AssignedEffectivity(): StepBasic_Effectivity;

SetAssignedEffectivity(AssignedEffectivity: StepBasic_Effectivity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_EulerAngles: declare class StepBasic_EulerAngles extends Standard_Transient

constructor

Init(aAngles: NCollection_HArray1_double): void;

Angles(): NCollection_HArray1_double;

SetAngles(Angles: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ExternalIdentificationAssignment: declare class StepBasic_ExternalIdentificationAssignment extends StepBasic_IdentificationAssignment

constructor

Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

Source(): StepBasic_ExternalSource;

SetSource(Source: StepBasic_ExternalSource): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ExternalSource: declare class StepBasic_ExternalSource extends Standard_Transient

constructor

Init(aSourceId: StepBasic_SourceItem): void;

SourceId(): StepBasic_SourceItem;

SetSourceId(SourceId: StepBasic_SourceItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ExternallyDefinedItem: declare class StepBasic_ExternallyDefinedItem extends Standard_Transient

constructor

Init(aItemId: StepBasic_SourceItem, aSource: StepBasic_ExternalSource): void;

ItemId(): StepBasic_SourceItem;

SetItemId(ItemId: StepBasic_SourceItem): void;

Source(): StepBasic_ExternalSource;

SetSource(Source: StepBasic_ExternalSource): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_GeneralProperty: declare class StepBasic_GeneralProperty extends Standard_Transient

constructor

Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

Id(): TCollection_HAsciiString;

SetId(Id: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_GeneralPropertyAssociation: declare class StepBasic_GeneralPropertyAssociation extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aGeneralProperty: StepBasic_GeneralProperty, aPropertyDefinition: StepRepr_PropertyDefinition): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

GeneralProperty(): StepBasic_GeneralProperty;

SetGeneralProperty(GeneralProperty: StepBasic_GeneralProperty): void;

PropertyDefinition(): StepRepr_PropertyDefinition;

SetPropertyDefinition(PropertyDefinition: StepRepr_PropertyDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_GeneralPropertyRelationship: declare class StepBasic_GeneralPropertyRelationship extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingGeneralProperty: StepBasic_GeneralProperty, aRelatedGeneralProperty: StepBasic_GeneralProperty): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

HasDescription(): boolean;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

RelatingGeneralProperty(): StepBasic_GeneralProperty;

SetRelatingGeneralProperty(RelatingGeneralProperty: StepBasic_GeneralProperty): void;

RelatedGeneralProperty(): StepBasic_GeneralProperty;

SetRelatedGeneralProperty(RelatedGeneralProperty: StepBasic_GeneralProperty): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_Group: declare class StepBasic_Group extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_GroupAssignment: declare class StepBasic_GroupAssignment extends Standard_Transient

constructor

Init(aAssignedGroup: StepBasic_Group): void;

AssignedGroup(): StepBasic_Group;

SetAssignedGroup(AssignedGroup: StepBasic_Group): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_GroupRelationship: declare class StepBasic_GroupRelationship extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingGroup: StepBasic_Group, aRelatedGroup: StepBasic_Group): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

RelatingGroup(): StepBasic_Group;

SetRelatingGroup(RelatingGroup: StepBasic_Group): void;

RelatedGroup(): StepBasic_Group;

SetRelatedGroup(RelatedGroup: StepBasic_Group): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_IdentificationAssignment: declare class StepBasic_IdentificationAssignment extends Standard_Transient

constructor

Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

AssignedId(): TCollection_HAsciiString;

SetAssignedId(AssignedId: TCollection_HAsciiString): void;

Role(): StepBasic_IdentificationRole;

SetRole(Role: StepBasic_IdentificationRole): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_IdentificationRole: declare class StepBasic_IdentificationRole extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
