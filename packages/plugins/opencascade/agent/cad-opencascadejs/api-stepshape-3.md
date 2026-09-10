# libcascade — StepShape (3)

26 top-level symbols. Signatures are verbatim typescript.

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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_OrientedPath: declare class StepShape_OrientedPath extends StepShape_Path

constructor

Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;

SetPathElement(aPathElement: StepShape_EdgeLoop): void;

PathElement(): StepShape_EdgeLoop;

SetOrientation(aOrientation: boolean): void;

Orientation(): boolean;

SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

EdgeListValue(num: number): StepShape_OrientedEdge;

NbEdgeList(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Path: declare class StepShape_Path extends StepShape_TopologicalRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;

SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

EdgeListValue(num: number): StepShape_OrientedEdge;

NbEdgeList(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_PlusMinusTolerance: declare class StepShape_PlusMinusTolerance extends Standard_Transient

constructor

Init(range: StepShape_ToleranceMethodDefinition, toleranced_dimension: StepShape_DimensionalCharacteristic): void;

Range(): StepShape_ToleranceMethodDefinition;

SetRange(range: StepShape_ToleranceMethodDefinition): void;

TolerancedDimension(): StepShape_DimensionalCharacteristic;

SetTolerancedDimension(toleranced_dimension: StepShape_DimensionalCharacteristic): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PointRepresentation
StepShape_PointRepresentation: declare class StepShape_PointRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_PolyLoop: declare class StepShape_PolyLoop extends StepShape_Loop

constructor

Init(aName: TCollection_HAsciiString, aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;

SetPolygon(aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

Polygon(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

PolygonValue(num: number): StepGeom_CartesianPoint;

NbPolygon(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_PrecisionQualifier: declare class StepShape_PrecisionQualifier extends Standard_Transient

constructor

Init(precision_value: number): void;

PrecisionValue(): number;

SetPrecisionValue(precision_value: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_QualifiedRepresentationItem: declare class StepShape_QualifiedRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(aName: TCollection_HAsciiString, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
Init(aName: TCollection_HAsciiString): void;

Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

NbQualifiers(): number;

SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

QualifiersValue(num: number): StepShape_ValueQualifier;

SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ReversibleTopologyItem: declare class StepShape_ReversibleTopologyItem extends StepData_SelectType

constructor

// Recognizes a ReversibleTopologyItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Edge (Null if another type)
Edge(): StepShape_Edge;

// returns Value as a Path (Null if another type)
Path(): StepShape_Path;

// returns Value as a Face (Null if another type)
Face(): StepShape_Face;

// returns Value as a FaceBound (Null if another type)
FaceBound(): StepShape_FaceBound;

// returns Value as a ClosedShell (Null if another type)
ClosedShell(): StepShape_ClosedShell;

// returns Value as a OpenShell (Null if another type)
OpenShell(): StepShape_OpenShell;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_RevolvedAreaSolid: declare class StepShape_RevolvedAreaSolid extends StepShape_SweptAreaSolid

constructor

Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;

SetAxis(aAxis: StepGeom_Axis1Placement): void;

Axis(): StepGeom_Axis1Placement;

SetAngle(aAngle: number): void;

Angle(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_RevolvedFaceSolid: declare class StepShape_RevolvedFaceSolid extends StepShape_SweptFaceSolid

constructor

Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;

SetAxis(aAxis: StepGeom_Axis1Placement): void;

Axis(): StepGeom_Axis1Placement;

SetAngle(aAngle: number): void;

Angle(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_RightAngularWedge: declare class StepShape_RightAngularWedge extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number, aLtx: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number, aLtx: number): void;
Init(aName: TCollection_HAsciiString): void;

SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

Position(): StepGeom_Axis2Placement3d;

SetX(aX: number): void;

X(): number;

SetY(aY: number): void;

Y(): number;

SetZ(aZ: number): void;

Z(): number;

SetLtx(aLtx: number): void;

Ltx(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_RightCircularCone: declare class StepShape_RightCircularCone extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number, aSemiAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number, aSemiAngle: number): void;
Init(aName: TCollection_HAsciiString): void;

SetPosition(aPosition: StepGeom_Axis1Placement): void;

Position(): StepGeom_Axis1Placement;

SetHeight(aHeight: number): void;

Height(): number;

SetRadius(aRadius: number): void;

Radius(): number;

SetSemiAngle(aSemiAngle: number): void;

SemiAngle(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_RightCircularCylinder: declare class StepShape_RightCircularCylinder extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number): void;
Init(aName: TCollection_HAsciiString): void;

SetPosition(aPosition: StepGeom_Axis1Placement): void;

Position(): StepGeom_Axis1Placement;

SetHeight(aHeight: number): void;

Height(): number;

SetRadius(aRadius: number): void;

Radius(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SeamEdge
StepShape_SeamEdge: declare class StepShape_SeamEdge extends StepShape_OrientedEdge

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field PcurveReference
PcurveReference(): StepGeom_Pcurve;

// Set field PcurveReference
SetPcurveReference(PcurveReference: StepGeom_Pcurve): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ShapeDefinitionRepresentation
StepShape_ShapeDefinitionRepresentation: declare class StepShape_ShapeDefinitionRepresentation extends StepRepr_PropertyDefinitionRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ShapeDimensionRepresentation
StepShape_ShapeDimensionRepresentation: declare class StepShape_ShapeDimensionRepresentation extends StepShape_ShapeRepresentation

constructor

// Initialize all fields AP214
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

SetItemsAP242(theItems: NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem): void;

ItemsAP242(): NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ShapeDimensionRepresentationItem: declare class StepShape_ShapeDimensionRepresentationItem extends StepData_SelectType

constructor

// Recognizes a ShapeDimensionRepresentationItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a CompoundRepresentationItem (Null if another type)
CompoundRepresentationItem(): StepRepr_CompoundRepresentationItem;

// returns Value as a DescriptiveRepresentationItem (Null if another type)
DescriptiveRepresentationItem(): StepRepr_DescriptiveRepresentationItem;

// returns Value as a MeasureRepresentationItem (Null if another type)
MeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

// returns Value as a Placement (Null if another type)
Placement(): StepGeom_Placement;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ShapeRepresentation: declare class StepShape_ShapeRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ShapeRepresentationWithParameters
StepShape_ShapeRepresentationWithParameters: declare class StepShape_ShapeRepresentationWithParameters extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Shell: declare class StepShape_Shell extends StepData_SelectType

constructor

// Recognizes a Shell Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a OpenShell (Null if another type)
OpenShell(): StepShape_OpenShell;

// returns Value as a ClosedShell (Null if another type)
ClosedShell(): StepShape_ClosedShell;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ShellBasedSurfaceModel: declare class StepShape_ShellBasedSurfaceModel extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;
Init(aName: TCollection_HAsciiString): void;

SetSbsmBoundary(aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;

SbsmBoundary(): NCollection_HArray1_StepShape_Shell;

SbsmBoundaryValue(num: number): StepShape_Shell;

NbSbsmBoundary(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_SolidModel: declare class StepShape_SolidModel extends StepGeom_GeometricRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
