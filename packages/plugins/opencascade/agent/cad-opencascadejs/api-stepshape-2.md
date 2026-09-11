# libcascade — StepShape (2)

29 top-level symbols. Signatures are verbatim typescript.

StepShape_ExtrudedAreaSolid: declare class StepShape_ExtrudedAreaSolid extends StepShape_SweptAreaSolid

constructor

Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;

SetExtrudedDirection(aExtrudedDirection: StepGeom_Direction): void;

ExtrudedDirection(): StepGeom_Direction;

SetDepth(aDepth: number): void;

Depth(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_ExtrudedFaceSolid: declare class StepShape_ExtrudedFaceSolid extends StepShape_SweptFaceSolid

constructor

Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString): void;

SetExtrudedDirection(aExtrudedDirection: StepGeom_Direction): void;

ExtrudedDirection(): StepGeom_Direction;

SetDepth(aDepth: number): void;

Depth(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_Face: declare class StepShape_Face extends StepShape_TopologicalRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;

SetBounds(aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;

Bounds(): NCollection_HArray1_handle_StepShape_FaceBound;

BoundsValue(num: number): StepShape_FaceBound;

NbBounds(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FaceBasedSurfaceModel: declare class StepShape_FaceBasedSurfaceModel extends StepGeom_GeometricRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFbsmFaces: NCollection_HArray1_handle_StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFbsmFaces: NCollection_HArray1_handle_StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;

FbsmFaces(): NCollection_HArray1_handle_StepShape_ConnectedFaceSet;

SetFbsmFaces(FbsmFaces: NCollection_HArray1_handle_StepShape_ConnectedFaceSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FaceBound: declare class StepShape_FaceBound extends StepShape_TopologicalRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aBound: StepShape_Loop, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBound: StepShape_Loop, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString): void;

SetBound(aBound: StepShape_Loop): void;

Bound(): StepShape_Loop;

SetOrientation(aOrientation: boolean): void;

Orientation(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FaceOuterBound: declare class StepShape_FaceOuterBound extends StepShape_FaceBound

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FaceSurface: declare class StepShape_FaceSurface extends StepShape_Face

constructor

Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound, aFaceGeometry: StepGeom_Surface, aSameSense: boolean): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound, aFaceGeometry: StepGeom_Surface, aSameSense: boolean): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound, aFaceGeometry: StepGeom_Surface, aSameSense: boolean): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;

SetFaceGeometry(aFaceGeometry: StepGeom_Surface): void;

FaceGeometry(): StepGeom_Surface;

SetSameSense(aSameSense: boolean): void;

SameSense(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FacetedBrep: declare class StepShape_FacetedBrep extends StepShape_ManifoldSolidBrep

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FacetedBrepAndBrepWithVoids: declare class StepShape_FacetedBrepAndBrepWithVoids extends StepShape_ManifoldSolidBrep

constructor

Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aFacetedBrep: StepShape_FacetedBrep, aBrepWithVoids: StepShape_BrepWithVoids): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aFacetedBrep: StepShape_FacetedBrep, aBrepWithVoids: StepShape_BrepWithVoids): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aFacetedBrep: StepShape_FacetedBrep, aBrepWithVoids: StepShape_BrepWithVoids): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aFacetedBrep: StepShape_FacetedBrep, aBrepWithVoids: StepShape_BrepWithVoids): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aFacetedBrep: StepShape_FacetedBrep, aBrepWithVoids: StepShape_BrepWithVoids): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;

SetFacetedBrep(aFacetedBrep: StepShape_FacetedBrep): void;

FacetedBrep(): StepShape_FacetedBrep;

SetBrepWithVoids(aBrepWithVoids: StepShape_BrepWithVoids): void;

BrepWithVoids(): StepShape_BrepWithVoids;

SetVoids(aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;

Voids(): NCollection_HArray1_handle_StepShape_OrientedClosedShell;

VoidsValue(num: number): StepShape_OrientedClosedShell;

NbVoids(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_FacetedBrepShapeRepresentation: declare class StepShape_FacetedBrepShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_GeometricCurveSet: declare class StepShape_GeometricCurveSet extends StepShape_GeometricSet

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_GeometricSet: declare class StepShape_GeometricSet extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aElements: NCollection_HArray1_StepShape_GeometricSetSelect): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aElements: NCollection_HArray1_StepShape_GeometricSetSelect): void;
Init(aName: TCollection_HAsciiString): void;

SetElements(aElements: NCollection_HArray1_StepShape_GeometricSetSelect): void;

Elements(): NCollection_HArray1_StepShape_GeometricSetSelect;

ElementsValue(num: number): StepShape_GeometricSetSelect;

NbElements(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_GeometricSetSelect: declare class StepShape_GeometricSetSelect extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Point(): StepGeom_Point;

Curve(): StepGeom_Curve;

Surface(): StepGeom_Surface;

delete(): void;

[Symbol.dispose](): void;

StepShape_GeometricallyBoundedSurfaceShapeRepresentation: declare class StepShape_GeometricallyBoundedSurfaceShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_GeometricallyBoundedWireframeShapeRepresentation: declare class StepShape_GeometricallyBoundedWireframeShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_HalfSpaceSolid: declare class StepShape_HalfSpaceSolid extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
Init(aName: TCollection_HAsciiString): void;

SetBaseSurface(aBaseSurface: StepGeom_Surface): void;

BaseSurface(): StepGeom_Surface;

SetAgreementFlag(aAgreementFlag: boolean): void;

AgreementFlag(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_LimitsAndFits: declare class StepShape_LimitsAndFits extends Standard_Transient

constructor

Init(form_variance: TCollection_HAsciiString, zone_variance: TCollection_HAsciiString, grade: TCollection_HAsciiString, source: TCollection_HAsciiString): void;

FormVariance(): TCollection_HAsciiString;

SetFormVariance(form_variance: TCollection_HAsciiString): void;

ZoneVariance(): TCollection_HAsciiString;

SetZoneVariance(zone_variance: TCollection_HAsciiString): void;

Grade(): TCollection_HAsciiString;

SetGrade(grade: TCollection_HAsciiString): void;

Source(): TCollection_HAsciiString;

SetSource(source: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_Loop: declare class StepShape_Loop extends StepShape_TopologicalRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_LoopAndPath: declare class StepShape_LoopAndPath extends StepShape_TopologicalRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aLoop: StepShape_Loop, aPath: StepShape_Path): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLoop: StepShape_Loop, aPath: StepShape_Path): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLoop: StepShape_Loop, aPath: StepShape_Path): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;

SetLoop(aLoop: StepShape_Loop): void;

Loop(): StepShape_Loop;

SetPath(aPath: StepShape_Path): void;

Path(): StepShape_Path;

SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

EdgeListValue(num: number): StepShape_OrientedEdge;

NbEdgeList(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_ManifoldSolidBrep: declare class StepShape_ManifoldSolidBrep extends StepShape_SolidModel

constructor

Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;

SetOuter(aOuter: StepShape_ConnectedFaceSet): void;

Outer(): StepShape_ConnectedFaceSet;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_ManifoldSurfaceShapeRepresentation: declare class StepShape_ManifoldSurfaceShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_MeasureQualification: declare class StepShape_MeasureQualification extends Standard_Transient

constructor

Init(name: TCollection_HAsciiString, description: TCollection_HAsciiString, qualified_measure: Standard_Transient, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

Name(): TCollection_HAsciiString;

SetName(name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(description: TCollection_HAsciiString): void;

QualifiedMeasure(): Standard_Transient;

SetQualifiedMeasure(qualified_measure: Standard_Transient): void;

Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

NbQualifiers(): number;

SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

QualifiersValue(num: number): StepShape_ValueQualifier;

SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem: declare class StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
Init(aName: TCollection_HAsciiString): void;

SetMeasure(Measure: StepBasic_MeasureWithUnit): void;

Measure(): StepBasic_MeasureWithUnit;

Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

NbQualifiers(): number;

SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

QualifiersValue(num: number): StepShape_ValueQualifier;

SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_NonManifoldSurfaceShapeRepresentation: declare class StepShape_NonManifoldSurfaceShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_OpenShell: declare class StepShape_OpenShell extends StepShape_ConnectedFaceSet

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_OrientedClosedShell: declare class StepShape_OrientedClosedShell extends StepShape_ClosedShell

constructor

Init(aName: TCollection_HAsciiString, aClosedShellElement: StepShape_ClosedShell, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aClosedShellElement: StepShape_ClosedShell, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aClosedShellElement: StepShape_ClosedShell, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;

SetClosedShellElement(aClosedShellElement: StepShape_ClosedShell): void;

ClosedShellElement(): StepShape_ClosedShell;

SetOrientation(aOrientation: boolean): void;

Orientation(): boolean;

SetCfsFaces(aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;

CfsFaces(): NCollection_HArray1_handle_StepShape_Face;

CfsFacesValue(num: number): StepShape_Face;

NbCfsFaces(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_OrientedEdge: declare class StepShape_OrientedEdge extends StepShape_Edge

constructor

Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;

SetEdgeElement(aEdgeElement: StepShape_Edge): void;

EdgeElement(): StepShape_Edge;

SetOrientation(aOrientation: boolean): void;

Orientation(): boolean;

SetEdgeStart(aEdgeStart: StepShape_Vertex): void;

EdgeStart(): StepShape_Vertex;

SetEdgeEnd(aEdgeEnd: StepShape_Vertex): void;

EdgeEnd(): StepShape_Vertex;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_OrientedFace: declare class StepShape_OrientedFace extends StepShape_Face

constructor

Init(aName: TCollection_HAsciiString, aFaceElement: StepShape_Face, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFaceElement: StepShape_Face, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFaceElement: StepShape_Face, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;

SetFaceElement(aFaceElement: StepShape_Face): void;

FaceElement(): StepShape_Face;

SetOrientation(aOrientation: boolean): void;

Orientation(): boolean;

SetBounds(aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;

Bounds(): NCollection_HArray1_handle_StepShape_FaceBound;

BoundsValue(num: number): StepShape_FaceBound;

NbBounds(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_OrientedOpenShell: declare class StepShape_OrientedOpenShell extends StepShape_OpenShell

constructor

Init(aName: TCollection_HAsciiString, aOpenShellElement: StepShape_OpenShell, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOpenShellElement: StepShape_OpenShell, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOpenShellElement: StepShape_OpenShell, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;

SetOpenShellElement(aOpenShellElement: StepShape_OpenShell): void;

OpenShellElement(): StepShape_OpenShell;

SetOrientation(aOrientation: boolean): void;

Orientation(): boolean;

SetCfsFaces(aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;

CfsFaces(): NCollection_HArray1_handle_StepShape_Face;

CfsFacesValue(num: number): StepShape_Face;

NbCfsFaces(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
