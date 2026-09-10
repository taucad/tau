# libcascade — StepFEA

25 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity AlignedCurve3dElementCoordinateSystem
StepFEA_AlignedCurve3dElementCoordinateSystem: declare class StepFEA_AlignedCurve3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field CoordinateSystem
CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

// Set field CoordinateSystem
SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity AlignedSurface3dElementCoordinateSystem
StepFEA_AlignedSurface3dElementCoordinateSystem: declare class StepFEA_AlignedSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field CoordinateSystem
CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

// Set field CoordinateSystem
SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ArbitraryVolume3dElementCoordinateSystem
StepFEA_ArbitraryVolume3dElementCoordinateSystem: declare class StepFEA_ArbitraryVolume3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field CoordinateSystem
CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

// Set field CoordinateSystem
SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConstantSurface3dElementCoordinateSystem
StepFEA_ConstantSurface3dElementCoordinateSystem: declare class StepFEA_ConstantSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Axis
Axis(): number;

// Set field Axis
SetAxis(Axis: number): void;

// Returns field Angle
Angle(): number;

// Set field Angle
SetAngle(Angle: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepFEA_CoordinateSystemType: typeof StepFEA_CoordinateSystemType[keyof typeof StepFEA_CoordinateSystemType]

// Representation of STEP entity Curve3dElementProperty
StepFEA_Curve3dElementProperty: declare class StepFEA_Curve3dElementProperty extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aPropertyId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aIntervalDefinitions: NCollection_HArray1_handle_StepFEA_CurveElementInterval, aEndOffsets: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset, aEndReleases: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease): void;

// Returns field PropertyId
PropertyId(): TCollection_HAsciiString;

// Set field PropertyId
SetPropertyId(PropertyId: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field IntervalDefinitions
IntervalDefinitions(): NCollection_HArray1_handle_StepFEA_CurveElementInterval;

// Set field IntervalDefinitions
SetIntervalDefinitions(IntervalDefinitions: NCollection_HArray1_handle_StepFEA_CurveElementInterval): void;

// Returns field EndOffsets
EndOffsets(): NCollection_HArray1_handle_StepFEA_CurveElementEndOffset;

// Set field EndOffsets
SetEndOffsets(EndOffsets: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset): void;

// Returns field EndReleases
EndReleases(): NCollection_HArray1_handle_StepFEA_CurveElementEndRelease;

// Set field EndReleases
SetEndReleases(EndReleases: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Curve3dElementRepresentation
StepFEA_Curve3dElementRepresentation: declare class StepFEA_Curve3dElementRepresentation extends StepFEA_ElementRepresentation

constructor

// Initialize all fields (own and inherited)
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field ModelRef
ModelRef(): StepFEA_FeaModel3d;

// Set field ModelRef
SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

// Returns field ElementDescriptor
ElementDescriptor(): StepElement_Curve3dElementDescriptor;

// Set field ElementDescriptor
SetElementDescriptor(ElementDescriptor: StepElement_Curve3dElementDescriptor): void;

// Returns field Property
Property(): StepFEA_Curve3dElementProperty;

// Set field Property
SetProperty(Property: StepFEA_Curve3dElementProperty): void;

// Returns field Material
Material(): StepElement_ElementMaterial;

// Set field Material
SetMaterial(Material: StepElement_ElementMaterial): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveEdge: typeof StepFEA_CurveEdge[keyof typeof StepFEA_CurveEdge]

// Representation of STEP SELECT type CurveElementEndCoordinateSystem
StepFEA_CurveElementEndCoordinateSystem: declare class StepFEA_CurveElementEndCoordinateSystem extends StepData_SelectType

constructor

// Recognizes a kind of CurveElementEndCoordinateSystem select type 1 -> FeaAxis2Placement3d from StepFEA 2 -> AlignedCurve3dElementCoordinateSystem from StepFEA 3 -> ParametricCurve3dElementCoordinateSystem from StepFEA 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as FeaAxis2Placement3d (or Null if another type)
FeaAxis2Placement3d(): StepFEA_FeaAxis2Placement3d;

// Returns Value as AlignedCurve3dElementCoordinateSystem (or Null if another type)
AlignedCurve3dElementCoordinateSystem(): StepFEA_AlignedCurve3dElementCoordinateSystem;

// Returns Value as ParametricCurve3dElementCoordinateSystem (or Null if another type)
ParametricCurve3dElementCoordinateSystem(): StepFEA_ParametricCurve3dElementCoordinateSystem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementEndOffset
StepFEA_CurveElementEndOffset: declare class StepFEA_CurveElementEndOffset extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aCoordinateSystem: StepFEA_CurveElementEndCoordinateSystem, aOffsetVector: NCollection_HArray1_double): void;

// Returns field CoordinateSystem
CoordinateSystem(): StepFEA_CurveElementEndCoordinateSystem;

// Set field CoordinateSystem
SetCoordinateSystem(CoordinateSystem: StepFEA_CurveElementEndCoordinateSystem): void;

// Returns field OffsetVector
OffsetVector(): NCollection_HArray1_double;

// Set field OffsetVector
SetOffsetVector(OffsetVector: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementEndRelease
StepFEA_CurveElementEndRelease: declare class StepFEA_CurveElementEndRelease extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aCoordinateSystem: StepFEA_CurveElementEndCoordinateSystem, aReleases: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket): void;

// Returns field CoordinateSystem
CoordinateSystem(): StepFEA_CurveElementEndCoordinateSystem;

// Set field CoordinateSystem
SetCoordinateSystem(CoordinateSystem: StepFEA_CurveElementEndCoordinateSystem): void;

// Returns field Releases
Releases(): NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket;

// Set field Releases
SetReleases(Releases: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementInterval
StepFEA_CurveElementInterval: declare class StepFEA_CurveElementInterval extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

// Returns field FinishPosition
FinishPosition(): StepFEA_CurveElementLocation;

// Set field FinishPosition
SetFinishPosition(FinishPosition: StepFEA_CurveElementLocation): void;

// Returns field EuAngles
EuAngles(): StepBasic_EulerAngles;

// Set field EuAngles
SetEuAngles(EuAngles: StepBasic_EulerAngles): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementIntervalConstant
StepFEA_CurveElementIntervalConstant: declare class StepFEA_CurveElementIntervalConstant extends StepFEA_CurveElementInterval

constructor

// Initialize all fields (own and inherited)
Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSection: StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;
Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSection: StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

// Returns field Section
Section(): StepElement_CurveElementSectionDefinition;

// Set field Section
SetSection(Section: StepElement_CurveElementSectionDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementIntervalLinearlyVarying
StepFEA_CurveElementIntervalLinearlyVarying: declare class StepFEA_CurveElementIntervalLinearlyVarying extends StepFEA_CurveElementInterval

constructor

// Initialize all fields (own and inherited)
Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;
Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

// Returns field Sections
Sections(): NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition;

// Set field Sections
SetSections(Sections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CurveElementLocation
StepFEA_CurveElementLocation: declare class StepFEA_CurveElementLocation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aCoordinate: StepFEA_FeaParametricPoint): void;

// Returns field Coordinate
Coordinate(): StepFEA_FeaParametricPoint;

// Set field Coordinate
SetCoordinate(Coordinate: StepFEA_FeaParametricPoint): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type DegreeOfFreedom
StepFEA_DegreeOfFreedom: declare class StepFEA_DegreeOfFreedom extends StepData_SelectType

constructor

// Recognizes a kind of CurveElementFreedom select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member CurveElementFreedomMember 1 -> EnumeratedCurveElementFreedom 2 -> ApplicationDefinedDegreeOfFreedom 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type CurveElementFreedomMember
NewMember(): StepData_SelectMember;

// Returns Value as EnumeratedDegreeOfFreedom (or Null if another type)
SetEnumeratedDegreeOfFreedom(aVal: StepFEA_EnumeratedDegreeOfFreedom): void;

// Returns Value as EnumeratedDegreeOfFreedom (or Null if another type)
EnumeratedDegreeOfFreedom(): StepFEA_EnumeratedDegreeOfFreedom;

// Set Value for ApplicationDefinedDegreeOfFreedom
SetApplicationDefinedDegreeOfFreedom(aVal: TCollection_HAsciiString): void;

// Returns Value as ApplicationDefinedDegreeOfFreedom (or Null if another type)
ApplicationDefinedDegreeOfFreedom(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type CurveElementFreedom
StepFEA_DegreeOfFreedomMember: declare class StepFEA_DegreeOfFreedomMember extends StepData_SelectNamed

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

// Representation of STEP entity DummyNode
StepFEA_DummyNode: declare class StepFEA_DummyNode extends StepFEA_NodeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ElementGeometricRelationship
StepFEA_ElementGeometricRelationship: declare class StepFEA_ElementGeometricRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aElementRef: StepFEA_ElementOrElementGroup, aItem: StepElement_AnalysisItemWithinRepresentation, aAspect: StepElement_ElementAspect): void;

// Returns field ElementRef
ElementRef(): StepFEA_ElementOrElementGroup;

// Set field ElementRef
SetElementRef(ElementRef: StepFEA_ElementOrElementGroup): void;

// Returns field Item
Item(): StepElement_AnalysisItemWithinRepresentation;

// Set field Item
SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

// Returns field Aspect
Aspect(): StepElement_ElementAspect;

// Set field Aspect
SetAspect(Aspect: StepElement_ElementAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ElementGroup
StepFEA_ElementGroup: declare class StepFEA_ElementGroup extends StepFEA_FeaGroup

constructor

// Initialize all fields (own and inherited)
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Elements
Elements(): NCollection_HArray1_handle_StepFEA_ElementRepresentation;

// Set field Elements
SetElements(Elements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type ElementOrElementGroup
StepFEA_ElementOrElementGroup: declare class StepFEA_ElementOrElementGroup extends StepData_SelectType

constructor

// Recognizes a kind of ElementOrElementGroup select type 1 -> ElementRepresentation from StepFEA 2 -> ElementGroup from StepFEA 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as ElementRepresentation (or Null if another type)
ElementRepresentation(): StepFEA_ElementRepresentation;

// Returns Value as ElementGroup (or Null if another type)
ElementGroup(): StepFEA_ElementGroup;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ElementRepresentation
StepFEA_ElementRepresentation: declare class StepFEA_ElementRepresentation extends StepRepr_Representation

constructor

// Initialize all fields (own and inherited)
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field NodeList
NodeList(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

// Set field NodeList
SetNodeList(NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepFEA_ElementVolume: typeof StepFEA_ElementVolume[keyof typeof StepFEA_ElementVolume]

StepFEA_EnumeratedDegreeOfFreedom: typeof StepFEA_EnumeratedDegreeOfFreedom[keyof typeof StepFEA_EnumeratedDegreeOfFreedom]

// Representation of STEP entity FeaAreaDensity
StepFEA_FeaAreaDensity: declare class StepFEA_FeaAreaDensity extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstant
FeaConstant(): number;

// Set field FeaConstant
SetFeaConstant(FeaConstant: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
