# libcascade — StepFEA

32 top-level symbols. Signatures are verbatim typescript.

StepFEA_AlignedCurve3dElementCoordinateSystem: declare class StepFEA_AlignedCurve3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_AlignedSurface3dElementCoordinateSystem: declare class StepFEA_AlignedSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ArbitraryVolume3dElementCoordinateSystem: declare class StepFEA_ArbitraryVolume3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ConstantSurface3dElementCoordinateSystem: declare class StepFEA_ConstantSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;

Axis(): number;

SetAxis(Axis: number): void;

Angle(): number;

SetAngle(Angle: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CoordinateSystemType: typeof StepFEA_CoordinateSystemType[keyof typeof StepFEA_CoordinateSystemType]

StepFEA_Curve3dElementProperty: declare class StepFEA_Curve3dElementProperty extends Standard_Transient

constructor

Init(aPropertyId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aIntervalDefinitions: NCollection_HArray1_handle_StepFEA_CurveElementInterval, aEndOffsets: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset, aEndReleases: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease): void;

PropertyId(): TCollection_HAsciiString;

SetPropertyId(PropertyId: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

IntervalDefinitions(): NCollection_HArray1_handle_StepFEA_CurveElementInterval;

SetIntervalDefinitions(IntervalDefinitions: NCollection_HArray1_handle_StepFEA_CurveElementInterval): void;

EndOffsets(): NCollection_HArray1_handle_StepFEA_CurveElementEndOffset;

SetEndOffsets(EndOffsets: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset): void;

EndReleases(): NCollection_HArray1_handle_StepFEA_CurveElementEndRelease;

SetEndReleases(EndReleases: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_Curve3dElementRepresentation: declare class StepFEA_Curve3dElementRepresentation extends StepFEA_ElementRepresentation

constructor

Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

ModelRef(): StepFEA_FeaModel3d;

SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

ElementDescriptor(): StepElement_Curve3dElementDescriptor;

SetElementDescriptor(ElementDescriptor: StepElement_Curve3dElementDescriptor): void;

Property(): StepFEA_Curve3dElementProperty;

SetProperty(Property: StepFEA_Curve3dElementProperty): void;

Material(): StepElement_ElementMaterial;

SetMaterial(Material: StepElement_ElementMaterial): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveEdge: typeof StepFEA_CurveEdge[keyof typeof StepFEA_CurveEdge]

StepFEA_CurveElementEndCoordinateSystem: declare class StepFEA_CurveElementEndCoordinateSystem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

FeaAxis2Placement3d(): StepFEA_FeaAxis2Placement3d;

AlignedCurve3dElementCoordinateSystem(): StepFEA_AlignedCurve3dElementCoordinateSystem;

ParametricCurve3dElementCoordinateSystem(): StepFEA_ParametricCurve3dElementCoordinateSystem;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveElementEndOffset: declare class StepFEA_CurveElementEndOffset extends Standard_Transient

constructor

Init(aCoordinateSystem: StepFEA_CurveElementEndCoordinateSystem, aOffsetVector: NCollection_HArray1_double): void;

CoordinateSystem(): StepFEA_CurveElementEndCoordinateSystem;

SetCoordinateSystem(CoordinateSystem: StepFEA_CurveElementEndCoordinateSystem): void;

OffsetVector(): NCollection_HArray1_double;

SetOffsetVector(OffsetVector: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveElementEndRelease: declare class StepFEA_CurveElementEndRelease extends Standard_Transient

constructor

Init(aCoordinateSystem: StepFEA_CurveElementEndCoordinateSystem, aReleases: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket): void;

CoordinateSystem(): StepFEA_CurveElementEndCoordinateSystem;

SetCoordinateSystem(CoordinateSystem: StepFEA_CurveElementEndCoordinateSystem): void;

Releases(): NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket;

SetReleases(Releases: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveElementInterval: declare class StepFEA_CurveElementInterval extends Standard_Transient

constructor

Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

FinishPosition(): StepFEA_CurveElementLocation;

SetFinishPosition(FinishPosition: StepFEA_CurveElementLocation): void;

EuAngles(): StepBasic_EulerAngles;

SetEuAngles(EuAngles: StepBasic_EulerAngles): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveElementIntervalConstant: declare class StepFEA_CurveElementIntervalConstant extends StepFEA_CurveElementInterval

constructor

Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSection: StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;
Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSection: StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

Section(): StepElement_CurveElementSectionDefinition;

SetSection(Section: StepElement_CurveElementSectionDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveElementIntervalLinearlyVarying: declare class StepFEA_CurveElementIntervalLinearlyVarying extends StepFEA_CurveElementInterval

constructor

Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;
Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;
Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

Sections(): NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition;

SetSections(Sections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_CurveElementLocation: declare class StepFEA_CurveElementLocation extends Standard_Transient

constructor

Init(aCoordinate: StepFEA_FeaParametricPoint): void;

Coordinate(): StepFEA_FeaParametricPoint;

SetCoordinate(Coordinate: StepFEA_FeaParametricPoint): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_DegreeOfFreedom: declare class StepFEA_DegreeOfFreedom extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetEnumeratedDegreeOfFreedom(aVal: StepFEA_EnumeratedDegreeOfFreedom): void;

EnumeratedDegreeOfFreedom(): StepFEA_EnumeratedDegreeOfFreedom;

SetApplicationDefinedDegreeOfFreedom(aVal: TCollection_HAsciiString): void;

ApplicationDefinedDegreeOfFreedom(): TCollection_HAsciiString;

delete(): void;

[Symbol.dispose](): void;

StepFEA_DegreeOfFreedomMember: declare class StepFEA_DegreeOfFreedomMember extends StepData_SelectNamed

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

StepFEA_DummyNode: declare class StepFEA_DummyNode extends StepFEA_NodeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ElementGeometricRelationship: declare class StepFEA_ElementGeometricRelationship extends Standard_Transient

constructor

Init(aElementRef: StepFEA_ElementOrElementGroup, aItem: StepElement_AnalysisItemWithinRepresentation, aAspect: StepElement_ElementAspect): void;

ElementRef(): StepFEA_ElementOrElementGroup;

SetElementRef(ElementRef: StepFEA_ElementOrElementGroup): void;

Item(): StepElement_AnalysisItemWithinRepresentation;

SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

Aspect(): StepElement_ElementAspect;

SetAspect(Aspect: StepElement_ElementAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ElementGroup: declare class StepFEA_ElementGroup extends StepFEA_FeaGroup

constructor

Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

Elements(): NCollection_HArray1_handle_StepFEA_ElementRepresentation;

SetElements(Elements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ElementOrElementGroup: declare class StepFEA_ElementOrElementGroup extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ElementRepresentation(): StepFEA_ElementRepresentation;

ElementGroup(): StepFEA_ElementGroup;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ElementRepresentation: declare class StepFEA_ElementRepresentation extends StepRepr_Representation

constructor

Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

NodeList(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

SetNodeList(NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ElementVolume: typeof StepFEA_ElementVolume[keyof typeof StepFEA_ElementVolume]

StepFEA_EnumeratedDegreeOfFreedom: typeof StepFEA_EnumeratedDegreeOfFreedom[keyof typeof StepFEA_EnumeratedDegreeOfFreedom]

StepFEA_FeaAreaDensity: declare class StepFEA_FeaAreaDensity extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstant(): number;

SetFeaConstant(FeaConstant: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaAxis2Placement3d: declare class StepFEA_FeaAxis2Placement3d extends StepGeom_Axis2Placement3d

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;

SystemType(): StepFEA_CoordinateSystemType;

SetSystemType(SystemType: StepFEA_CoordinateSystemType): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaCurveSectionGeometricRelationship: declare class StepFEA_FeaCurveSectionGeometricRelationship extends Standard_Transient

constructor

Init(aSectionRef: StepElement_CurveElementSectionDefinition, aItem: StepElement_AnalysisItemWithinRepresentation): void;

SectionRef(): StepElement_CurveElementSectionDefinition;

SetSectionRef(SectionRef: StepElement_CurveElementSectionDefinition): void;

Item(): StepElement_AnalysisItemWithinRepresentation;

SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaGroup: declare class StepFEA_FeaGroup extends StepBasic_Group

constructor

Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

ModelRef(): StepFEA_FeaModel;

SetModelRef(ModelRef: StepFEA_FeaModel): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaLinearElasticity: declare class StepFEA_FeaLinearElasticity extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaMassDensity: declare class StepFEA_FeaMassDensity extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstant(): number;

SetFeaConstant(FeaConstant: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaMaterialPropertyRepresentation: declare class StepFEA_FeaMaterialPropertyRepresentation extends StepRepr_MaterialPropertyRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaMaterialPropertyRepresentationItem: declare class StepFEA_FeaMaterialPropertyRepresentationItem extends StepRepr_RepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
