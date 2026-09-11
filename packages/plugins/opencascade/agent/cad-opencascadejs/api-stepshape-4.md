# libcascade — StepShape (4)

27 top-level symbols. Signatures are verbatim typescript.

StepShape_ValueFormatTypeQualifier: declare class StepShape_ValueFormatTypeQualifier extends Standard_Transient

constructor

Init(theFormatType: TCollection_HAsciiString): void;

FormatType(): TCollection_HAsciiString;

SetFormatType(theFormatType: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_ValueQualifier: declare class StepShape_ValueQualifier extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

PrecisionQualifier(): StepShape_PrecisionQualifier;

TypeQualifier(): StepShape_TypeQualifier;

ValueFormatTypeQualifier(): StepShape_ValueFormatTypeQualifier;

delete(): void;

[Symbol.dispose](): void;

StepShape_Vertex: declare class StepShape_Vertex extends StepShape_TopologicalRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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
