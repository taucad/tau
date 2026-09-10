# libcascade — StepShape (4)

40 top-level symbols. Signatures are verbatim typescript.

StepShape_SolidReplica: declare class StepShape_SolidReplica extends StepShape_SolidModel

constructor

Init(aName: TCollection_HAsciiString, aParentSolid: StepShape_SolidModel, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aParentSolid: StepShape_SolidModel, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
Init(aName: TCollection_HAsciiString): void;

SetParentSolid(aParentSolid: StepShape_SolidModel): void;

ParentSolid(): StepShape_SolidModel;

SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator3d): void;

Transformation(): StepGeom_CartesianTransformationOperator3d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Sphere: declare class StepShape_Sphere extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aRadius: number, aCentre: StepGeom_Point): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aRadius: number, aCentre: StepGeom_Point): void;
Init(aName: TCollection_HAsciiString): void;

SetRadius(aRadius: number): void;

Radius(): number;

SetCentre(aCentre: StepGeom_Point): void;

Centre(): StepGeom_Point;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Subedge
StepShape_Subedge: declare class StepShape_Subedge extends StepShape_Edge

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ParentEdge
ParentEdge(): StepShape_Edge;

// Set field ParentEdge
SetParentEdge(ParentEdge: StepShape_Edge): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Subface
StepShape_Subface: declare class StepShape_Subface extends StepShape_Face

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ParentFace
ParentFace(): StepShape_Face;

// Set field ParentFace
SetParentFace(ParentFace: StepShape_Face): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_SurfaceModel: declare class StepShape_SurfaceModel extends StepData_SelectType

constructor

// Recognizes a SurfaceModel Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ShellBasedSurfaceModel (Null if another type)
ShellBasedSurfaceModel(): StepShape_ShellBasedSurfaceModel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_SweptAreaSolid: declare class StepShape_SweptAreaSolid extends StepShape_SolidModel

constructor

Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
Init(aName: TCollection_HAsciiString): void;

SetSweptArea(aSweptArea: StepGeom_CurveBoundedSurface): void;

SweptArea(): StepGeom_CurveBoundedSurface;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_SweptFaceSolid: declare class StepShape_SweptFaceSolid extends StepShape_SolidModel

constructor

Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
Init(aName: TCollection_HAsciiString): void;

SetSweptFace(aSweptArea: StepShape_FaceSurface): void;

SweptFace(): StepShape_FaceSurface;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_ToleranceMethodDefinition: declare class StepShape_ToleranceMethodDefinition extends StepData_SelectType

constructor

// Recognizes a kind of ValueQualifier Select Type
CaseNum(ent: Standard_Transient): number;

// Returns Value as ToleranceValue
ToleranceValue(): StepShape_ToleranceValue;

// Returns Value as LimitsAndFits
LimitsAndFits(): StepShape_LimitsAndFits;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_ToleranceValue: declare class StepShape_ToleranceValue extends Standard_Transient

constructor

Init(lower_bound: Standard_Transient, upper_bound: Standard_Transient): void;

LowerBound(): Standard_Transient;

SetLowerBound(lower_bound: Standard_Transient): void;

UpperBound(): Standard_Transient;

SetUpperBound(upper_bound: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_TopologicalRepresentationItem: declare class StepShape_TopologicalRepresentationItem extends StepRepr_RepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Torus: declare class StepShape_Torus extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aMajorRadius: number, aMinorRadius: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aMajorRadius: number, aMinorRadius: number): void;
Init(aName: TCollection_HAsciiString): void;

SetPosition(aPosition: StepGeom_Axis1Placement): void;

Position(): StepGeom_Axis1Placement;

SetMajorRadius(aMajorRadius: number): void;

MajorRadius(): number;

SetMinorRadius(aMinorRadius: number): void;

MinorRadius(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_TransitionalShapeRepresentation: declare class StepShape_TransitionalShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_TypeQualifier: declare class StepShape_TypeQualifier extends Standard_Transient

constructor

Init(name: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetName(name: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_ValueFormatTypeQualifier: declare class StepShape_ValueFormatTypeQualifier extends Standard_Transient

constructor

// Init all field own and inherited
Init(theFormatType: TCollection_HAsciiString): void;

// Returns field FormatType
FormatType(): TCollection_HAsciiString;

// Set field FormatType
SetFormatType(theFormatType: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepShape_ValueQualifier: declare class StepShape_ValueQualifier extends StepData_SelectType

constructor

// Recognizes a kind of ValueQualifier Select Type
CaseNum(ent: Standard_Transient): number;

// Returns Value as PrecisionQualifier
PrecisionQualifier(): StepShape_PrecisionQualifier;

// Returns Value as TypeQualifier
TypeQualifier(): StepShape_TypeQualifier;

// Returns Value as ValueFormatTypeQualifier
ValueFormatTypeQualifier(): StepShape_ValueFormatTypeQualifier;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Vertex: declare class StepShape_Vertex extends StepShape_TopologicalRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_VertexLoop: declare class StepShape_VertexLoop extends StepShape_Loop

constructor

Init(aName: TCollection_HAsciiString, aLoopVertex: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLoopVertex: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;

SetLoopVertex(aLoopVertex: StepShape_Vertex): void;

LoopVertex(): StepShape_Vertex;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_VertexPoint: declare class StepShape_VertexPoint extends StepShape_Vertex

constructor

Init(aName: TCollection_HAsciiString, aVertexGeometry: StepGeom_Point): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aVertexGeometry: StepGeom_Point): void;
Init(aName: TCollection_HAsciiString): void;

SetVertexGeometry(aVertexGeometry: StepGeom_Point): void;

VertexGeometry(): StepGeom_Point;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Array1OfConnectedEdgeSet: NCollection_Array1_handle_StepShape_ConnectedEdgeSet

StepShape_Array1OfConnectedFaceSet: NCollection_Array1_handle_StepShape_ConnectedFaceSet

StepShape_Array1OfEdge: NCollection_Array1_handle_StepShape_Edge

StepShape_Array1OfFace: NCollection_Array1_handle_StepShape_Face

StepShape_Array1OfFaceBound: NCollection_Array1_handle_StepShape_FaceBound

StepShape_Array1OfGeometricSetSelect: NCollection_Array1_StepShape_GeometricSetSelect

StepShape_Array1OfOrientedClosedShell: NCollection_Array1_handle_StepShape_OrientedClosedShell

StepShape_Array1OfOrientedEdge: NCollection_Array1_handle_StepShape_OrientedEdge

StepShape_Array1OfShapeDimensionRepresentationItem: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem

StepShape_Array1OfShell: NCollection_Array1_StepShape_Shell

StepShape_Array1OfValueQualifier: NCollection_Array1_StepShape_ValueQualifier

StepShape_HArray1OfConnectedEdgeSet: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet

StepShape_HArray1OfConnectedFaceSet: NCollection_HArray1_handle_StepShape_ConnectedFaceSet

StepShape_HArray1OfEdge: NCollection_HArray1_handle_StepShape_Edge

StepShape_HArray1OfFace: NCollection_HArray1_handle_StepShape_Face

StepShape_HArray1OfFaceBound: NCollection_HArray1_handle_StepShape_FaceBound

StepShape_HArray1OfGeometricSetSelect: NCollection_HArray1_StepShape_GeometricSetSelect

StepShape_HArray1OfOrientedClosedShell: NCollection_HArray1_handle_StepShape_OrientedClosedShell

StepShape_HArray1OfOrientedEdge: NCollection_HArray1_handle_StepShape_OrientedEdge

StepShape_HArray1OfShapeDimensionRepresentationItem: NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem

StepShape_HArray1OfShell: NCollection_HArray1_StepShape_Shell

StepShape_HArray1OfValueQualifier: NCollection_HArray1_StepShape_ValueQualifier
