# libcascade — StepElement

29 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity AnalysisItemWithinRepresentation
StepElement_AnalysisItemWithinRepresentation: declare class StepElement_AnalysisItemWithinRepresentation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aItem: StepRepr_RepresentationItem, aRep: StepRepr_Representation): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field Item
Item(): StepRepr_RepresentationItem;

// Set field Item
SetItem(Item: StepRepr_RepresentationItem): void;

// Returns field Rep
Rep(): StepRepr_Representation;

// Set field Rep
SetRep(Rep: StepRepr_Representation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Curve3dElementDescriptor
StepElement_Curve3dElementDescriptor: declare class StepElement_Curve3dElementDescriptor extends StepElement_ElementDescriptor

constructor

// Initialize all fields (own and inherited)
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

// Returns field Purpose
Purpose(): NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember;

// Set field Purpose
SetPurpose(Purpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepElement_CurveEdge: typeof StepElement_CurveEdge[keyof typeof StepElement_CurveEdge]

// Representation of STEP entity CurveElementEndReleasePacket
StepElement_CurveElementEndReleasePacket: declare class StepElement_CurveElementEndReleasePacket extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aReleaseFreedom: StepElement_CurveElementFreedom, aReleaseStiffness: number): void;

// Returns field ReleaseFreedom
ReleaseFreedom(): StepElement_CurveElementFreedom;

// Set field ReleaseFreedom
SetReleaseFreedom(ReleaseFreedom: StepElement_CurveElementFreedom): void;

// Returns field ReleaseStiffness
ReleaseStiffness(): number;

// Set field ReleaseStiffness
SetReleaseStiffness(ReleaseStiffness: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type CurveElementFreedom
StepElement_CurveElementFreedom: declare class StepElement_CurveElementFreedom extends StepData_SelectType

constructor

// Recognizes a kind of CurveElementFreedom select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member CurveElementFreedomMember 1 -> EnumeratedCurveElementFreedom 2 -> ApplicationDefinedDegreeOfFreedom 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type CurveElementFreedomMember
NewMember(): StepData_SelectMember;

// Set Value for EnumeratedCurveElementFreedom
SetEnumeratedCurveElementFreedom(aVal: StepElement_EnumeratedCurveElementFreedom): void;

// Returns Value as EnumeratedCurveElementFreedom (or Null if another type)
EnumeratedCurveElementFreedom(): StepElement_EnumeratedCurveElementFreedom;

// Set Value for ApplicationDefinedDegreeOfFreedom
SetApplicationDefinedDegreeOfFreedom(aVal: TCollection_HAsciiString): void;

// Returns Value as ApplicationDefinedDegreeOfFreedom (or Null if another type)
ApplicationDefinedDegreeOfFreedom(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type CurveElementFreedom
StepElement_CurveElementFreedomMember: declare class StepElement_CurveElementFreedomMember extends StepData_SelectNamed

constructor

// Returns True if has name
HasName(): boolean;

// Returns set name
Name(): string;

// Set name
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one;
Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type CurveElementPurpose
StepElement_CurveElementPurpose: declare class StepElement_CurveElementPurpose extends StepData_SelectType

constructor

// Recognizes a kind of CurveElementPurpose select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member CurveElementPurposeMember 1 -> EnumeratedCurveElementPurpose 2 -> ApplicationDefinedElementPurpose 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type CurveElementPurposeMember
NewMember(): StepData_SelectMember;

// Set Value for EnumeratedCurveElementPurpose
SetEnumeratedCurveElementPurpose(aVal: StepElement_EnumeratedCurveElementPurpose): void;

// Returns Value as EnumeratedCurveElementPurpose (or Null if another type)
EnumeratedCurveElementPurpose(): StepElement_EnumeratedCurveElementPurpose;

// Set Value for ApplicationDefinedElementPurpose
SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

// Returns Value as ApplicationDefinedElementPurpose (or Null if another type)
ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type CurveElementPurpose
StepElement_CurveElementPurposeMember: declare class StepElement_CurveElementPurposeMember extends StepData_SelectNamed

constructor

// Returns True if has name
HasName(): boolean;

// Returns set name
Name(): string;

// Set name
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one;
Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementSectionDefinition
StepElement_CurveElementSectionDefinition: declare class StepElement_CurveElementSectionDefinition extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field SectionAngle
SectionAngle(): number;

// Set field SectionAngle
SetSectionAngle(SectionAngle: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementSectionDerivedDefinitions
StepElement_CurveElementSectionDerivedDefinitions: declare class StepElement_CurveElementSectionDerivedDefinitions extends StepElement_CurveElementSectionDefinition

constructor

// Initialize all fields (own and inherited)
Init(aCurveElementSectionDefinition_Description: TCollection_HAsciiString, aCurveElementSectionDefinition_SectionAngle: number, aCrossSectionalArea: number, aShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aSecondMomentOfArea: NCollection_HArray1_double, aTorsionalConstant: number, aWarpingConstant: StepElement_MeasureOrUnspecifiedValue, aLocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aPolarMoment: StepElement_MeasureOrUnspecifiedValue): void;
Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;
Init(aCurveElementSectionDefinition_Description: TCollection_HAsciiString, aCurveElementSectionDefinition_SectionAngle: number, aCrossSectionalArea: number, aShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aSecondMomentOfArea: NCollection_HArray1_double, aTorsionalConstant: number, aWarpingConstant: StepElement_MeasureOrUnspecifiedValue, aLocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aPolarMoment: StepElement_MeasureOrUnspecifiedValue): void;
Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;

// Returns field CrossSectionalArea
CrossSectionalArea(): number;

// Set field CrossSectionalArea
SetCrossSectionalArea(CrossSectionalArea: number): void;

// Returns field ShearArea
ShearArea(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

// Set field ShearArea
SetShearArea(ShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

// Returns field SecondMomentOfArea
SecondMomentOfArea(): NCollection_HArray1_double;

// Set field SecondMomentOfArea
SetSecondMomentOfArea(SecondMomentOfArea: NCollection_HArray1_double): void;

// Returns field TorsionalConstant
TorsionalConstant(): number;

// Set field TorsionalConstant
SetTorsionalConstant(TorsionalConstant: number): void;

// Returns field WarpingConstant
WarpingConstant(): StepElement_MeasureOrUnspecifiedValue;

// Set field WarpingConstant
SetWarpingConstant(WarpingConstant: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field LocationOfCentroid
LocationOfCentroid(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

// Set field LocationOfCentroid
SetLocationOfCentroid(LocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

// Returns field LocationOfShearCentre
LocationOfShearCentre(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

// Set field LocationOfShearCentre
SetLocationOfShearCentre(LocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

// Returns field LocationOfNonStructuralMass
LocationOfNonStructuralMass(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

// Set field LocationOfNonStructuralMass
SetLocationOfNonStructuralMass(LocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

// Returns field NonStructuralMass
NonStructuralMass(): StepElement_MeasureOrUnspecifiedValue;

// Set field NonStructuralMass
SetNonStructuralMass(NonStructuralMass: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field PolarMoment
PolarMoment(): StepElement_MeasureOrUnspecifiedValue;

// Set field PolarMoment
SetPolarMoment(PolarMoment: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepElement_Element2dShape: typeof StepElement_Element2dShape[keyof typeof StepElement_Element2dShape]

// Representation of STEP SELECT type ElementAspect
StepElement_ElementAspect: declare class StepElement_ElementAspect extends StepData_SelectType

constructor

// Recognizes a kind of ElementAspect select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member ElementAspectMember 1 -> ElementVolume 2 -> Volume3dFace 3 -> Volume2dFace 4 -> Volume3dEdge 5 -> Volume2dEdge 6 -> Surface3dFace 7 -> Surface2dFace 8 -> Surface3dEdge 9 -> Surface2dEdge 10 -> CurveEdge 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type ElementAspectMember
NewMember(): StepData_SelectMember;

// Set Value for ElementVolume
SetElementVolume(aVal: StepElement_ElementVolume): void;

// Returns Value as ElementVolume (or Null if another type)
ElementVolume(): StepElement_ElementVolume;

// Set Value for Volume3dFace
SetVolume3dFace(aVal: number): void;

// Returns Value as Volume3dFace (or Null if another type)
Volume3dFace(): number;

// Set Value for Volume2dFace
SetVolume2dFace(aVal: number): void;

// Returns Value as Volume2dFace (or Null if another type)
Volume2dFace(): number;

// Set Value for Volume3dEdge
SetVolume3dEdge(aVal: number): void;

// Returns Value as Volume3dEdge (or Null if another type)
Volume3dEdge(): number;

// Set Value for Volume2dEdge
SetVolume2dEdge(aVal: number): void;

// Returns Value as Volume2dEdge (or Null if another type)
Volume2dEdge(): number;

// Set Value for Surface3dFace
SetSurface3dFace(aVal: number): void;

// Returns Value as Surface3dFace (or Null if another type)
Surface3dFace(): number;

// Set Value for Surface2dFace
SetSurface2dFace(aVal: number): void;

// Returns Value as Surface2dFace (or Null if another type)
Surface2dFace(): number;

// Set Value for Surface3dEdge
SetSurface3dEdge(aVal: number): void;

// Returns Value as Surface3dEdge (or Null if another type)
Surface3dEdge(): number;

// Set Value for Surface2dEdge
SetSurface2dEdge(aVal: number): void;

// Returns Value as Surface2dEdge (or Null if another type)
Surface2dEdge(): number;

// Set Value for CurveEdge
SetCurveEdge(aVal: StepElement_CurveEdge): void;

// Returns Value as CurveEdge (or Null if another type)
CurveEdge(): StepElement_CurveEdge;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type ElementAspect
StepElement_ElementAspectMember: declare class StepElement_ElementAspectMember extends StepData_SelectNamed

constructor

// Returns True if has name
HasName(): boolean;

// Returns set name
Name(): string;

// Set name
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one;
Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ElementDescriptor
StepElement_ElementDescriptor: declare class StepElement_ElementDescriptor extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

// Returns field TopologyOrder
TopologyOrder(): StepElement_ElementOrder;

// Set field TopologyOrder
SetTopologyOrder(TopologyOrder: StepElement_ElementOrder): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ElementMaterial
StepElement_ElementMaterial: declare class StepElement_ElementMaterial extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aMaterialId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aProperties: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation): void;

// Returns field MaterialId
MaterialId(): TCollection_HAsciiString;

// Set field MaterialId
SetMaterialId(MaterialId: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field Properties
Properties(): NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation;

// Set field Properties
SetProperties(Properties: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepElement_ElementOrder: typeof StepElement_ElementOrder[keyof typeof StepElement_ElementOrder]

StepElement_ElementVolume: typeof StepElement_ElementVolume[keyof typeof StepElement_ElementVolume]

StepElement_EnumeratedCurveElementFreedom: typeof StepElement_EnumeratedCurveElementFreedom[keyof typeof StepElement_EnumeratedCurveElementFreedom]

StepElement_EnumeratedCurveElementPurpose: typeof StepElement_EnumeratedCurveElementPurpose[keyof typeof StepElement_EnumeratedCurveElementPurpose]

StepElement_EnumeratedSurfaceElementPurpose: typeof StepElement_EnumeratedSurfaceElementPurpose[keyof typeof StepElement_EnumeratedSurfaceElementPurpose]

StepElement_EnumeratedVolumeElementPurpose: typeof StepElement_EnumeratedVolumeElementPurpose[keyof typeof StepElement_EnumeratedVolumeElementPurpose]

// Representation of STEP SELECT type MeasureOrUnspecifiedValue
StepElement_MeasureOrUnspecifiedValue: declare class StepElement_MeasureOrUnspecifiedValue extends StepData_SelectType

constructor

// Recognizes a kind of MeasureOrUnspecifiedValue select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member MeasureOrUnspecifiedValueMember 1 -> ContextDependentMeasure 2 -> UnspecifiedValue 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type MeasureOrUnspecifiedValueMember
NewMember(): StepData_SelectMember;

// Set Value for ContextDependentMeasure
SetContextDependentMeasure(aVal: number): void;

// Returns Value as ContextDependentMeasure (or Null if another type)
ContextDependentMeasure(): number;

// Set Value for UnspecifiedValue
SetUnspecifiedValue(aVal: StepElement_UnspecifiedValue): void;

// Returns Value as UnspecifiedValue (or Null if another type)
UnspecifiedValue(): StepElement_UnspecifiedValue;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type MeasureOrUnspecifiedValue
StepElement_MeasureOrUnspecifiedValueMember: declare class StepElement_MeasureOrUnspecifiedValueMember extends StepData_SelectNamed

constructor

// Returns True if has name
HasName(): boolean;

// Returns set name
Name(): string;

// Set name
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one;
Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Surface3dElementDescriptor
StepElement_Surface3dElementDescriptor: declare class StepElement_Surface3dElementDescriptor extends StepElement_ElementDescriptor

constructor

// Initialize all fields (own and inherited)
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember, aShape: StepElement_Element2dShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember, aShape: StepElement_Element2dShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

// Returns field Purpose
Purpose(): NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember;

// Set field Purpose
SetPurpose(Purpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember): void;

// Returns field Shape
Shape(): StepElement_Element2dShape;

// Set field Shape
SetShape(Shape: StepElement_Element2dShape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceElementProperty
StepElement_SurfaceElementProperty: declare class StepElement_SurfaceElementProperty extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aPropertyId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aSection: StepElement_SurfaceSectionField): void;

// Returns field PropertyId
PropertyId(): TCollection_HAsciiString;

// Set field PropertyId
SetPropertyId(PropertyId: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field Section
Section(): StepElement_SurfaceSectionField;

// Set field Section
SetSection(Section: StepElement_SurfaceSectionField): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type SurfaceElementPurpose
StepElement_SurfaceElementPurpose: declare class StepElement_SurfaceElementPurpose extends StepData_SelectType

constructor

// Recognizes a kind of SurfaceElementPurpose select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member SurfaceElementPurposeMember 1 -> EnumeratedSurfaceElementPurpose 2 -> ApplicationDefinedElementPurpose 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type SurfaceElementPurposeMember
NewMember(): StepData_SelectMember;

// Set Value for EnumeratedSurfaceElementPurpose
SetEnumeratedSurfaceElementPurpose(aVal: StepElement_EnumeratedSurfaceElementPurpose): void;

// Returns Value as EnumeratedSurfaceElementPurpose (or Null if another type)
EnumeratedSurfaceElementPurpose(): StepElement_EnumeratedSurfaceElementPurpose;

// Set Value for ApplicationDefinedElementPurpose
SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

// Returns Value as ApplicationDefinedElementPurpose (or Null if another type)
ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type SurfaceElementPurpose
StepElement_SurfaceElementPurposeMember: declare class StepElement_SurfaceElementPurposeMember extends StepData_SelectNamed

constructor

// Returns True if has name
HasName(): boolean;

// Returns set name
Name(): string;

// Set name
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one;
Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceSection
StepElement_SurfaceSection: declare class StepElement_SurfaceSection extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field Offset
Offset(): StepElement_MeasureOrUnspecifiedValue;

// Set field Offset
SetOffset(Offset: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field NonStructuralMass
NonStructuralMass(): StepElement_MeasureOrUnspecifiedValue;

// Set field NonStructuralMass
SetNonStructuralMass(NonStructuralMass: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field NonStructuralMassOffset
NonStructuralMassOffset(): StepElement_MeasureOrUnspecifiedValue;

// Set field NonStructuralMassOffset
SetNonStructuralMassOffset(NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceSectionField
StepElement_SurfaceSectionField: declare class StepElement_SurfaceSectionField extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
