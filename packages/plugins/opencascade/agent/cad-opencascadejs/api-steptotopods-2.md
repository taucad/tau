# libcascade — StepToTopoDS (2)

18 top-level symbols. Signatures are verbatim typescript.

StepToTopoDS_Tool: declare class StepToTopoDS_Tool

constructor

Init(Map: NCollection_DataMap_handle_StepShape_TopologicalRepresentationItem_TopoDS_Shape, TP: Transfer_TransientProcess): void;

IsBound(TRI: StepShape_TopologicalRepresentationItem): boolean;

Bind(TRI: StepShape_TopologicalRepresentationItem, S: TopoDS_Shape): void;

Find(TRI: StepShape_TopologicalRepresentationItem): TopoDS_Shape;

ClearEdgeMap(): void;

IsEdgeBound(PP: StepToTopoDS_PointPair): boolean;

BindEdge(PP: StepToTopoDS_PointPair, E: TopoDS_Edge): void;

FindEdge(PP: StepToTopoDS_PointPair): TopoDS_Edge;

ClearVertexMap(): void;

IsVertexBound(PG: StepGeom_CartesianPoint): boolean;

BindVertex(P: StepGeom_CartesianPoint, V: TopoDS_Vertex): void;

FindVertex(P: StepGeom_CartesianPoint): TopoDS_Vertex;

ComputePCurve(B: boolean): void;
ComputePCurve(): boolean;
ComputePCurve(B: boolean): void;
ComputePCurve(): boolean;

TransientProcess(): Transfer_TransientProcess;

AddContinuity(GeomSurf: Geom_Surface): void;
AddContinuity(GeomCurve: Geom_Curve): void;
AddContinuity(GeomCur2d: Geom2d_Curve): void;
AddContinuity(GeomSurf: Geom_Surface): void;
AddContinuity(GeomCurve: Geom_Curve): void;
AddContinuity(GeomCur2d: Geom2d_Curve): void;
AddContinuity(GeomSurf: Geom_Surface): void;
AddContinuity(GeomCurve: Geom_Curve): void;
AddContinuity(GeomCur2d: Geom2d_Curve): void;

C0Surf(): number;

C1Surf(): number;

C2Surf(): number;

C0Cur2(): number;

C1Cur2(): number;

C2Cur2(): number;

C0Cur3(): number;

C1Cur3(): number;

C2Cur3(): number;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateCompositeCurve: declare class StepToTopoDS_TranslateCompositeCurve extends StepToTopoDS_Root

constructor

Init(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): boolean;
Init(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, S: StepGeom_Surface, Surf: Geom_Surface, theLocalFactors: StepData_Factors): boolean;
Init(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): boolean;
Init(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, S: StepGeom_Surface, Surf: Geom_Surface, theLocalFactors: StepData_Factors): boolean;

Value(): TopoDS_Wire;

IsInfiniteSegment(): boolean;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateCurveBoundedSurface: declare class StepToTopoDS_TranslateCurveBoundedSurface extends StepToTopoDS_Root

constructor

Init(CBS: StepGeom_CurveBoundedSurface, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors): boolean;

Value(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateEdge: declare class StepToTopoDS_TranslateEdge extends StepToTopoDS_Root

constructor

Init(E: StepShape_Edge, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

MakeFromCurve3D(C3D: StepGeom_Curve, EC: StepShape_EdgeCurve, Vend: StepShape_Vertex, preci: number, E: TopoDS_Edge, V1: TopoDS_Vertex, V2: TopoDS_Vertex, T: StepToTopoDS_Tool, theLocalFactors: StepData_Factors): void;

MakePCurve(PCU: StepGeom_Pcurve, ConvSurf: Geom_Surface, theLocalFactors?: StepData_Factors): Geom2d_Curve;

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslateEdgeError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateEdgeError: typeof StepToTopoDS_TranslateEdgeError[keyof typeof StepToTopoDS_TranslateEdgeError]

StepToTopoDS_TranslateEdgeLoop: declare class StepToTopoDS_TranslateEdgeLoop extends StepToTopoDS_Root

constructor

Init(FB: StepShape_FaceBound, F: TopoDS_Face, S: Geom_Surface, SS: StepGeom_Surface, ss: boolean, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslateEdgeLoopError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateEdgeLoopError: typeof StepToTopoDS_TranslateEdgeLoopError[keyof typeof StepToTopoDS_TranslateEdgeLoopError]

StepToTopoDS_TranslateFaceError: typeof StepToTopoDS_TranslateFaceError[keyof typeof StepToTopoDS_TranslateFaceError]

StepToTopoDS_TranslatePolyLoop: declare class StepToTopoDS_TranslatePolyLoop extends StepToTopoDS_Root

constructor

Init(PL: StepShape_PolyLoop, T: StepToTopoDS_Tool, S: Geom_Surface, F: TopoDS_Face, theLocalFactors: StepData_Factors): void;

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslatePolyLoopError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslatePolyLoopError: typeof StepToTopoDS_TranslatePolyLoopError[keyof typeof StepToTopoDS_TranslatePolyLoopError]

StepToTopoDS_TranslateShell: declare class StepToTopoDS_TranslateShell extends StepToTopoDS_Root

constructor

Init(CFS: StepShape_ConnectedFaceSet, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSh: StepVisual_TessellatedShell, theTool: StepToTopoDS_Tool, theNMTool: StepToTopoDS_NMTool, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(CFS: StepShape_ConnectedFaceSet, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSh: StepVisual_TessellatedShell, theTool: StepToTopoDS_Tool, theNMTool: StepToTopoDS_NMTool, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslateShellError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateShellError: typeof StepToTopoDS_TranslateShellError[keyof typeof StepToTopoDS_TranslateShellError]

StepToTopoDS_TranslateSolid: declare class StepToTopoDS_TranslateSolid extends StepToTopoDS_Root

constructor

Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theTool: StepToTopoDS_Tool, theNMTool: StepToTopoDS_NMTool, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslateSolidError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateSolidError: typeof StepToTopoDS_TranslateSolidError[keyof typeof StepToTopoDS_TranslateSolidError]

StepToTopoDS_TranslateVertex: declare class StepToTopoDS_TranslateVertex extends StepToTopoDS_Root

constructor

Init(V: StepShape_Vertex, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslateVertexError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateVertexError: typeof StepToTopoDS_TranslateVertexError[keyof typeof StepToTopoDS_TranslateVertexError]

StepToTopoDS_TranslateVertexLoop: declare class StepToTopoDS_TranslateVertexLoop extends StepToTopoDS_Root

constructor

Init(VL: StepShape_VertexLoop, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

Value(): TopoDS_Shape;

Error(): StepToTopoDS_TranslateVertexLoopError;

delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_TranslateVertexLoopError: typeof StepToTopoDS_TranslateVertexLoopError[keyof typeof StepToTopoDS_TranslateVertexLoopError]
