# libcascade — StepElement

57 top-level symbols. Signatures are verbatim typescript.

StepElement_AnalysisItemWithinRepresentation: declare class StepElement_AnalysisItemWithinRepresentation extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aItem: StepRepr_RepresentationItem, aRep: StepRepr_Representation): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

Item(): StepRepr_RepresentationItem;

SetItem(Item: StepRepr_RepresentationItem): void;

Rep(): StepRepr_Representation;

SetRep(Rep: StepRepr_Representation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_Curve3dElementDescriptor: declare class StepElement_Curve3dElementDescriptor extends StepElement_ElementDescriptor

constructor

Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

Purpose(): NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember;

SetPurpose(Purpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveEdge: typeof StepElement_CurveEdge[keyof typeof StepElement_CurveEdge]

StepElement_CurveElementEndReleasePacket: declare class StepElement_CurveElementEndReleasePacket extends Standard_Transient

constructor

Init(aReleaseFreedom: StepElement_CurveElementFreedom, aReleaseStiffness: number): void;

ReleaseFreedom(): StepElement_CurveElementFreedom;

SetReleaseFreedom(ReleaseFreedom: StepElement_CurveElementFreedom): void;

ReleaseStiffness(): number;

SetReleaseStiffness(ReleaseStiffness: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveElementFreedom: declare class StepElement_CurveElementFreedom extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetEnumeratedCurveElementFreedom(aVal: StepElement_EnumeratedCurveElementFreedom): void;

EnumeratedCurveElementFreedom(): StepElement_EnumeratedCurveElementFreedom;

SetApplicationDefinedDegreeOfFreedom(aVal: TCollection_HAsciiString): void;

ApplicationDefinedDegreeOfFreedom(): TCollection_HAsciiString;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveElementFreedomMember: declare class StepElement_CurveElementFreedomMember extends StepData_SelectNamed

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveElementPurpose: declare class StepElement_CurveElementPurpose extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetEnumeratedCurveElementPurpose(aVal: StepElement_EnumeratedCurveElementPurpose): void;

EnumeratedCurveElementPurpose(): StepElement_EnumeratedCurveElementPurpose;

SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveElementPurposeMember: declare class StepElement_CurveElementPurposeMember extends StepData_SelectNamed

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveElementSectionDefinition: declare class StepElement_CurveElementSectionDefinition extends Standard_Transient

constructor

Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

SectionAngle(): number;

SetSectionAngle(SectionAngle: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_CurveElementSectionDerivedDefinitions: declare class StepElement_CurveElementSectionDerivedDefinitions extends StepElement_CurveElementSectionDefinition

constructor

Init(aCurveElementSectionDefinition_Description: TCollection_HAsciiString, aCurveElementSectionDefinition_SectionAngle: number, aCrossSectionalArea: number, aShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aSecondMomentOfArea: NCollection_HArray1_double, aTorsionalConstant: number, aWarpingConstant: StepElement_MeasureOrUnspecifiedValue, aLocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aPolarMoment: StepElement_MeasureOrUnspecifiedValue): void;
Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;
Init(aCurveElementSectionDefinition_Description: TCollection_HAsciiString, aCurveElementSectionDefinition_SectionAngle: number, aCrossSectionalArea: number, aShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aSecondMomentOfArea: NCollection_HArray1_double, aTorsionalConstant: number, aWarpingConstant: StepElement_MeasureOrUnspecifiedValue, aLocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aPolarMoment: StepElement_MeasureOrUnspecifiedValue): void;
Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;

CrossSectionalArea(): number;

SetCrossSectionalArea(CrossSectionalArea: number): void;

ShearArea(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

SetShearArea(ShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

SecondMomentOfArea(): NCollection_HArray1_double;

SetSecondMomentOfArea(SecondMomentOfArea: NCollection_HArray1_double): void;

TorsionalConstant(): number;

SetTorsionalConstant(TorsionalConstant: number): void;

WarpingConstant(): StepElement_MeasureOrUnspecifiedValue;

SetWarpingConstant(WarpingConstant: StepElement_MeasureOrUnspecifiedValue): void;

LocationOfCentroid(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

SetLocationOfCentroid(LocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

LocationOfShearCentre(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

SetLocationOfShearCentre(LocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

LocationOfNonStructuralMass(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

SetLocationOfNonStructuralMass(LocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

NonStructuralMass(): StepElement_MeasureOrUnspecifiedValue;

SetNonStructuralMass(NonStructuralMass: StepElement_MeasureOrUnspecifiedValue): void;

PolarMoment(): StepElement_MeasureOrUnspecifiedValue;

SetPolarMoment(PolarMoment: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_Element2dShape: typeof StepElement_Element2dShape[keyof typeof StepElement_Element2dShape]

StepElement_ElementAspect: declare class StepElement_ElementAspect extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetElementVolume(aVal: StepElement_ElementVolume): void;

ElementVolume(): StepElement_ElementVolume;

SetVolume3dFace(aVal: number): void;

Volume3dFace(): number;

SetVolume2dFace(aVal: number): void;

Volume2dFace(): number;

SetVolume3dEdge(aVal: number): void;

Volume3dEdge(): number;

SetVolume2dEdge(aVal: number): void;

Volume2dEdge(): number;

SetSurface3dFace(aVal: number): void;

Surface3dFace(): number;

SetSurface2dFace(aVal: number): void;

Surface2dFace(): number;

SetSurface3dEdge(aVal: number): void;

Surface3dEdge(): number;

SetSurface2dEdge(aVal: number): void;

Surface2dEdge(): number;

SetCurveEdge(aVal: StepElement_CurveEdge): void;

CurveEdge(): StepElement_CurveEdge;

delete(): void;

[Symbol.dispose](): void;

StepElement_ElementAspectMember: declare class StepElement_ElementAspectMember extends StepData_SelectNamed

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_ElementDescriptor: declare class StepElement_ElementDescriptor extends Standard_Transient

constructor

Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

TopologyOrder(): StepElement_ElementOrder;

SetTopologyOrder(TopologyOrder: StepElement_ElementOrder): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_ElementMaterial: declare class StepElement_ElementMaterial extends Standard_Transient

constructor

Init(aMaterialId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aProperties: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation): void;

MaterialId(): TCollection_HAsciiString;

SetMaterialId(MaterialId: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

Properties(): NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation;

SetProperties(Properties: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_ElementOrder: typeof StepElement_ElementOrder[keyof typeof StepElement_ElementOrder]

StepElement_ElementVolume: typeof StepElement_ElementVolume[keyof typeof StepElement_ElementVolume]

StepElement_EnumeratedCurveElementFreedom: typeof StepElement_EnumeratedCurveElementFreedom[keyof typeof StepElement_EnumeratedCurveElementFreedom]

StepElement_EnumeratedCurveElementPurpose: typeof StepElement_EnumeratedCurveElementPurpose[keyof typeof StepElement_EnumeratedCurveElementPurpose]

StepElement_EnumeratedSurfaceElementPurpose: typeof StepElement_EnumeratedSurfaceElementPurpose[keyof typeof StepElement_EnumeratedSurfaceElementPurpose]

StepElement_EnumeratedVolumeElementPurpose: typeof StepElement_EnumeratedVolumeElementPurpose[keyof typeof StepElement_EnumeratedVolumeElementPurpose]

StepElement_MeasureOrUnspecifiedValue: declare class StepElement_MeasureOrUnspecifiedValue extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetContextDependentMeasure(aVal: number): void;

ContextDependentMeasure(): number;

SetUnspecifiedValue(aVal: StepElement_UnspecifiedValue): void;

UnspecifiedValue(): StepElement_UnspecifiedValue;

delete(): void;

[Symbol.dispose](): void;

StepElement_MeasureOrUnspecifiedValueMember: declare class StepElement_MeasureOrUnspecifiedValueMember extends StepData_SelectNamed

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_Surface3dElementDescriptor: declare class StepElement_Surface3dElementDescriptor extends StepElement_ElementDescriptor

constructor

Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember, aShape: StepElement_Element2dShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember, aShape: StepElement_Element2dShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

Purpose(): NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember;

SetPurpose(Purpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember): void;

Shape(): StepElement_Element2dShape;

SetShape(Shape: StepElement_Element2dShape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceElementProperty: declare class StepElement_SurfaceElementProperty extends Standard_Transient

constructor

Init(aPropertyId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aSection: StepElement_SurfaceSectionField): void;

PropertyId(): TCollection_HAsciiString;

SetPropertyId(PropertyId: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

Section(): StepElement_SurfaceSectionField;

SetSection(Section: StepElement_SurfaceSectionField): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceElementPurpose: declare class StepElement_SurfaceElementPurpose extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetEnumeratedSurfaceElementPurpose(aVal: StepElement_EnumeratedSurfaceElementPurpose): void;

EnumeratedSurfaceElementPurpose(): StepElement_EnumeratedSurfaceElementPurpose;

SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceElementPurposeMember: declare class StepElement_SurfaceElementPurposeMember extends StepData_SelectNamed

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceSection: declare class StepElement_SurfaceSection extends Standard_Transient

constructor

Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

Offset(): StepElement_MeasureOrUnspecifiedValue;

SetOffset(Offset: StepElement_MeasureOrUnspecifiedValue): void;

NonStructuralMass(): StepElement_MeasureOrUnspecifiedValue;

SetNonStructuralMass(NonStructuralMass: StepElement_MeasureOrUnspecifiedValue): void;

NonStructuralMassOffset(): StepElement_MeasureOrUnspecifiedValue;

SetNonStructuralMassOffset(NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceSectionField: declare class StepElement_SurfaceSectionField extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceSectionFieldConstant: declare class StepElement_SurfaceSectionFieldConstant extends StepElement_SurfaceSectionField

constructor

Init(aDefinition: StepElement_SurfaceSection): void;

Definition(): StepElement_SurfaceSection;

SetDefinition(Definition: StepElement_SurfaceSection): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_SurfaceSectionFieldVarying: declare class StepElement_SurfaceSectionFieldVarying extends StepElement_SurfaceSectionField

constructor

Init(aDefinitions: NCollection_HArray1_handle_StepElement_SurfaceSection, aAdditionalNodeValues: boolean): void;

Definitions(): NCollection_HArray1_handle_StepElement_SurfaceSection;

SetDefinitions(Definitions: NCollection_HArray1_handle_StepElement_SurfaceSection): void;

AdditionalNodeValues(): boolean;

SetAdditionalNodeValues(AdditionalNodeValues: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_UniformSurfaceSection: declare class StepElement_UniformSurfaceSection extends StepElement_SurfaceSection

constructor

Init(aSurfaceSection_Offset: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue, aThickness: number, aBendingThickness: StepElement_MeasureOrUnspecifiedValue, aShearThickness: StepElement_MeasureOrUnspecifiedValue): void;
Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;
Init(aSurfaceSection_Offset: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue, aThickness: number, aBendingThickness: StepElement_MeasureOrUnspecifiedValue, aShearThickness: StepElement_MeasureOrUnspecifiedValue): void;
Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

Thickness(): number;

SetThickness(Thickness: number): void;

BendingThickness(): StepElement_MeasureOrUnspecifiedValue;

SetBendingThickness(BendingThickness: StepElement_MeasureOrUnspecifiedValue): void;

ShearThickness(): StepElement_MeasureOrUnspecifiedValue;

SetShearThickness(ShearThickness: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_UnspecifiedValue: typeof StepElement_UnspecifiedValue[keyof typeof StepElement_UnspecifiedValue]

StepElement_Volume3dElementDescriptor: declare class StepElement_Volume3dElementDescriptor extends StepElement_ElementDescriptor

constructor

Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember, aShape: StepElement_Volume3dElementShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember, aShape: StepElement_Volume3dElementShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

Purpose(): NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember;

SetPurpose(Purpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember): void;

Shape(): StepElement_Volume3dElementShape;

SetShape(Shape: StepElement_Volume3dElementShape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_Volume3dElementShape: typeof StepElement_Volume3dElementShape[keyof typeof StepElement_Volume3dElementShape]

StepElement_VolumeElementPurpose: declare class StepElement_VolumeElementPurpose extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetEnumeratedVolumeElementPurpose(aVal: StepElement_EnumeratedVolumeElementPurpose): void;

EnumeratedVolumeElementPurpose(): StepElement_EnumeratedVolumeElementPurpose;

SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

delete(): void;

[Symbol.dispose](): void;

StepElement_VolumeElementPurposeMember: declare class StepElement_VolumeElementPurposeMember extends StepData_SelectNamed

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepElement_Array1OfCurveElementEndReleasePacket: NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket

StepElement_Array1OfCurveElementSectionDefinition: NCollection_Array1_handle_StepElement_CurveElementSectionDefinition

StepElement_Array1OfHSequenceOfCurveElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

StepElement_Array1OfHSequenceOfSurfaceElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

StepElement_Array1OfMeasureOrUnspecifiedValue: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue

StepElement_Array1OfSurfaceSection: NCollection_Array1_handle_StepElement_SurfaceSection

StepElement_Array1OfVolumeElementPurposeMember: NCollection_Array1_handle_StepElement_VolumeElementPurposeMember

StepElement_HArray1OfCurveElementEndReleasePacket: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket

StepElement_HArray1OfCurveElementSectionDefinition: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition

StepElement_HArray1OfHSequenceOfCurveElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

StepElement_HArray1OfHSequenceOfSurfaceElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

StepElement_HArray1OfMeasureOrUnspecifiedValue: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue

StepElement_HArray1OfSurfaceSection: NCollection_HArray1_handle_StepElement_SurfaceSection

StepElement_HArray1OfVolumeElementPurposeMember: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember

StepElement_HSequenceOfCurveElementPurposeMember: NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

StepElement_HSequenceOfCurveElementSectionDefinition: NCollection_HSequence_handle_StepElement_CurveElementSectionDefinition

StepElement_HSequenceOfElementMaterial: NCollection_HSequence_handle_StepElement_ElementMaterial

StepElement_HSequenceOfSurfaceElementPurposeMember: NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

StepElement_SequenceOfCurveElementSectionDefinition: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition

StepElement_SequenceOfElementMaterial: NCollection_Sequence_handle_StepElement_ElementMaterial
