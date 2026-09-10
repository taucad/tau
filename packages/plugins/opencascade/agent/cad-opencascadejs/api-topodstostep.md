# libcascade — TopoDSToStep

23 top-level symbols. Signatures are verbatim typescript.

// This package implements the mapping between CAS.CAD Shape representation and AP214 Shape Representation
TopoDSToStep: declare class TopoDSToStep

constructor

static DecodeBuilderError(E: TopoDSToStep_BuilderError): TCollection_HAsciiString;

static DecodeFaceError(E: TopoDSToStep_MakeFaceError): TCollection_HAsciiString;

static DecodeWireError(E: TopoDSToStep_MakeWireError): TCollection_HAsciiString;

static DecodeEdgeError(E: TopoDSToStep_MakeEdgeError): TCollection_HAsciiString;

// Returns a new shape without undirect surfaces
static DecodeVertexError(E: TopoDSToStep_MakeVertexError): TCollection_HAsciiString;

// Adds an entity into the list of results (binders) for shape stored in FinderProcess
static AddResult(FP: Transfer_FinderProcess, Shape: TopoDS_Shape, entity: Standard_Transient): void;
static AddResult(FP: Transfer_FinderProcess, Tool: TopoDSToStep_Tool): void;
static AddResult(FP: Transfer_FinderProcess, Shape: TopoDS_Shape, entity: Standard_Transient): void;
static AddResult(FP: Transfer_FinderProcess, Tool: TopoDSToStep_Tool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This builder Class provides services to build a ProSTEP Shape model from a Cas.Cad BRep
TopoDSToStep_Builder: declare class TopoDSToStep_Builder extends TopoDSToStep_Root

constructor

Init(S: TopoDS_Shape, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theTessellatedGeomParam: number, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): void;

Error(): TopoDSToStep_BuilderError;

Value(): StepShape_TopologicalRepresentationItem;

TessellatedValue(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_BuilderError: typeof TopoDSToStep_BuilderError[keyof typeof TopoDSToStep_BuilderError]

TopoDSToStep_FacetedError: typeof TopoDSToStep_FacetedError[keyof typeof TopoDSToStep_FacetedError]

// This Tool Class provides Information about Faceted Shapes to be mapped to STEP
TopoDSToStep_FacetedTool: declare class TopoDSToStep_FacetedTool

constructor

static CheckTopoDSShape(SH: TopoDS_Shape): TopoDSToStep_FacetedError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Solid from `TopoDS` and BrepWithVoids from StepShape
TopoDSToStep_MakeBrepWithVoids: declare class TopoDSToStep_MakeBrepWithVoids extends TopoDSToStep_Root

constructor

Value(): StepShape_BrepWithVoids;

TessellatedValue(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeEdgeError: typeof TopoDSToStep_MakeEdgeError[keyof typeof TopoDSToStep_MakeEdgeError]

TopoDSToStep_MakeFaceError: typeof TopoDSToStep_MakeFaceError[keyof typeof TopoDSToStep_MakeFaceError]

// This class implements the mapping between classes Shell or Solid from `TopoDS` and FacetedBrep from StepShape
TopoDSToStep_MakeFacetedBrep: declare class TopoDSToStep_MakeFacetedBrep extends TopoDSToStep_Root

constructor

Value(): StepShape_FacetedBrep;

TessellatedValue(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Solid from `TopoDS` and FacetedBrepAndBrepWithVoids from StepShape
TopoDSToStep_MakeFacetedBrepAndBrepWithVoids: declare class TopoDSToStep_MakeFacetedBrepAndBrepWithVoids extends TopoDSToStep_Root

constructor

Value(): StepShape_FacetedBrepAndBrepWithVoids;

TessellatedValue(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between a Shape from `TopoDS` and a GeometricCurveSet from StepShape in order to create a GeometricallyBoundedWireframeRepresentation
TopoDSToStep_MakeGeometricCurveSet: declare class TopoDSToStep_MakeGeometricCurveSet extends TopoDSToStep_Root

constructor

Value(): StepShape_GeometricCurveSet;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Shell or Solid from `TopoDS` and ManifoldSolidBrep from StepShape
TopoDSToStep_MakeManifoldSolidBrep: declare class TopoDSToStep_MakeManifoldSolidBrep extends TopoDSToStep_Root

constructor

Value(): StepShape_ManifoldSolidBrep;

TessellatedValue(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Face, Shell or Solid from `TopoDS` and ShellBasedSurfaceModel from StepShape
TopoDSToStep_MakeShellBasedSurfaceModel: declare class TopoDSToStep_MakeShellBasedSurfaceModel extends TopoDSToStep_Root

constructor

Value(): StepShape_ShellBasedSurfaceModel;

TessellatedValue(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Edge from `TopoDS` and TopologicalRepresentationItem from StepShape
TopoDSToStep_MakeStepEdge: declare class TopoDSToStep_MakeStepEdge extends TopoDSToStep_Root

constructor

Init(E: TopoDS_Edge, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeEdgeError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Face from `TopoDS` and TopologicalRepresentationItem from StepShape
TopoDSToStep_MakeStepFace: declare class TopoDSToStep_MakeStepFace extends TopoDSToStep_Root

constructor

Init(F: TopoDS_Face, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeFaceError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Vertex from `TopoDS` and TopologicalRepresentationItem from StepShape
TopoDSToStep_MakeStepVertex: declare class TopoDSToStep_MakeStepVertex extends TopoDSToStep_Root

constructor

Init(V: TopoDS_Vertex, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeVertexError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Wire from `TopoDS` and TopologicalRepresentationItem from StepShape
TopoDSToStep_MakeStepWire: declare class TopoDSToStep_MakeStepWire extends TopoDSToStep_Root

constructor

Init(W: TopoDS_Wire, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeWireError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between Face, Shell fromTopoDS and TriangulatedFace from StepVisual
TopoDSToStep_MakeTessellatedItem: declare class TopoDSToStep_MakeTessellatedItem extends TopoDSToStep_Root

constructor

Init(theFace: TopoDS_Face, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theToPreferSurfaceSet: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theShell: TopoDS_Shell, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFace: TopoDS_Face, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theToPreferSurfaceSet: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theShell: TopoDS_Shell, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;

Value(): StepVisual_TessellatedItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeVertexError: typeof TopoDSToStep_MakeVertexError[keyof typeof TopoDSToStep_MakeVertexError]

TopoDSToStep_MakeWireError: typeof TopoDSToStep_MakeWireError[keyof typeof TopoDSToStep_MakeWireError]

// This class implements the common services for all classes of {@link TopoDSToStep`TopoDSToStep`} which report error
TopoDSToStep_Root: declare class TopoDSToStep_Root

// Returns (modifiable) the tolerance to be used for writing If not set, starts at 0.0001
Tolerance(): number;

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This Tool Class provides Information to build a ProSTEP Shape model from a Cas.Cad BRep
TopoDSToStep_Tool: declare class TopoDSToStep_Tool

constructor

Init(M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, FacetedContext: boolean, theSurfCurveMode: number): void;

IsBound(S: TopoDS_Shape): boolean;

Bind(S: TopoDS_Shape, T: StepShape_TopologicalRepresentationItem): void;

Find(S: TopoDS_Shape): StepShape_TopologicalRepresentationItem;

Faceted(): boolean;

SetCurrentShell(S: TopoDS_Shell): void;

CurrentShell(): TopoDS_Shell;

SetCurrentFace(F: TopoDS_Face): void;

CurrentFace(): TopoDS_Face;

SetCurrentWire(W: TopoDS_Wire): void;

CurrentWire(): TopoDS_Wire;

SetCurrentEdge(E: TopoDS_Edge): void;

CurrentEdge(): TopoDS_Edge;

SetCurrentVertex(V: TopoDS_Vertex): void;

CurrentVertex(): TopoDS_Vertex;

Lowest3DTolerance(): number;

SetSurfaceReversed(B: boolean): void;

SurfaceReversed(): boolean;

Map(): NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher;

// Returns mode for writing pcurves (initialized by parameter write.surfacecurve.mode)
PCurveMode(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This builder Class provides services to build a ProSTEP Wireframemodel from a Cas.Cad BRep
TopoDSToStep_WireframeBuilder: declare class TopoDSToStep_WireframeBuilder extends TopoDSToStep_Root

constructor

Init(S: TopoDS_Shape, T: TopoDSToStep_Tool, theLocalFactors?: StepData_Factors): void;

Error(): TopoDSToStep_BuilderError;

Value(): NCollection_HSequence_handle_Standard_Transient;

// Extraction of Trimmed Curves from {@link TopoDS_Edge`TopoDS_Edge`} for the Creation of a GeometricallyBoundedWireframeRepresentation
GetTrimmedCurveFromEdge(E: TopoDS_Edge, F: TopoDS_Face, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };
// M: Mutated in place

// Extraction of Trimmed Curves from {@link TopoDS_Face`TopoDS_Face`} for the Creation of a GeometricallyBoundedWireframeRepresentation
GetTrimmedCurveFromFace(F: TopoDS_Face, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };
// M: Mutated in place

// Extraction of Trimmed Curves from any {@link TopoDS_Shape`TopoDS_Shape`} for the Creation of a GeometricallyBoundedWireframeRepresentation
GetTrimmedCurveFromShape(S: TopoDS_Shape, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };
// M: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
