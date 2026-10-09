# libcascade — TopoDSToStep

23 top-level symbols. Signatures are verbatim typescript.

TopoDSToStep: declare class TopoDSToStep

  // TopoDSToStep.constructor (constructor)
  constructor();

  // TopoDSToStep.DecodeBuilderError (method)
  static DecodeBuilderError(E: TopoDSToStep_BuilderError): TCollection_HAsciiString;

  // TopoDSToStep.DecodeFaceError (method)
  static DecodeFaceError(E: TopoDSToStep_MakeFaceError): TCollection_HAsciiString;

  // TopoDSToStep.DecodeWireError (method)
  static DecodeWireError(E: TopoDSToStep_MakeWireError): TCollection_HAsciiString;

  // TopoDSToStep.DecodeEdgeError (method)
  static DecodeEdgeError(E: TopoDSToStep_MakeEdgeError): TCollection_HAsciiString;

  // TopoDSToStep.DecodeVertexError (method)
  static DecodeVertexError(E: TopoDSToStep_MakeVertexError): TCollection_HAsciiString;

  // TopoDSToStep.AddResult (method)
  static AddResult(FP: Transfer_FinderProcess, Shape: TopoDS_Shape, entity: Standard_Transient): void;
  static AddResult(FP: Transfer_FinderProcess, Tool: TopoDSToStep_Tool): void;

  // TopoDSToStep.delete (method)
  delete(): void;

  // TopoDSToStep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_Builder: declare class TopoDSToStep_Builder extends TopoDSToStep_Root

  // TopoDSToStep_Builder.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theTessellatedGeomParam: number, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_Builder.Init (method)
  Init(S: TopoDS_Shape, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theTessellatedGeomParam: number, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): void;

  // TopoDSToStep_Builder.Error (method)
  Error(): TopoDSToStep_BuilderError;

  // TopoDSToStep_Builder.Value (method)
  Value(): StepShape_TopologicalRepresentationItem;

  // TopoDSToStep_Builder.TessellatedValue (method)
  TessellatedValue(): StepVisual_TessellatedItem;

  // TopoDSToStep_Builder.delete (method)
  delete(): void;

  // TopoDSToStep_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_BuilderError: typeof TopoDSToStep_BuilderError[keyof typeof TopoDSToStep_BuilderError]

  readonly TopoDSToStep_BuilderDone: 'TopoDSToStep_BuilderDone'

  readonly TopoDSToStep_NoFaceMapped: 'TopoDSToStep_NoFaceMapped'

  readonly TopoDSToStep_BuilderOther: 'TopoDSToStep_BuilderOther'

TopoDSToStep_FacetedError: typeof TopoDSToStep_FacetedError[keyof typeof TopoDSToStep_FacetedError]

  readonly TopoDSToStep_FacetedDone: 'TopoDSToStep_FacetedDone'

  readonly TopoDSToStep_SurfaceNotPlane: 'TopoDSToStep_SurfaceNotPlane'

  readonly TopoDSToStep_PCurveNotLinear: 'TopoDSToStep_PCurveNotLinear'

TopoDSToStep_FacetedTool: declare class TopoDSToStep_FacetedTool

  // TopoDSToStep_FacetedTool.constructor (constructor)
  constructor();

  // TopoDSToStep_FacetedTool.CheckTopoDSShape (method)
  static CheckTopoDSShape(SH: TopoDS_Shape): TopoDSToStep_FacetedError;

  // TopoDSToStep_FacetedTool.delete (method)
  delete(): void;

  // TopoDSToStep_FacetedTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeBrepWithVoids: declare class TopoDSToStep_MakeBrepWithVoids extends TopoDSToStep_Root

  // TopoDSToStep_MakeBrepWithVoids.constructor (constructor)
  constructor(S: TopoDS_Solid, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_MakeBrepWithVoids.Value (method)
  Value(): StepShape_BrepWithVoids;

  // TopoDSToStep_MakeBrepWithVoids.TessellatedValue (method)
  TessellatedValue(): StepVisual_TessellatedItem;

  // TopoDSToStep_MakeBrepWithVoids.delete (method)
  delete(): void;

  // TopoDSToStep_MakeBrepWithVoids.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeEdgeError: typeof TopoDSToStep_MakeEdgeError[keyof typeof TopoDSToStep_MakeEdgeError]

  readonly TopoDSToStep_EdgeDone: 'TopoDSToStep_EdgeDone'

  readonly TopoDSToStep_NonManifoldEdge: 'TopoDSToStep_NonManifoldEdge'

  readonly TopoDSToStep_EdgeOther: 'TopoDSToStep_EdgeOther'

TopoDSToStep_MakeFaceError: typeof TopoDSToStep_MakeFaceError[keyof typeof TopoDSToStep_MakeFaceError]

  readonly TopoDSToStep_FaceDone: 'TopoDSToStep_FaceDone'

  readonly TopoDSToStep_InfiniteFace: 'TopoDSToStep_InfiniteFace'

  readonly TopoDSToStep_NonManifoldFace: 'TopoDSToStep_NonManifoldFace'

  readonly TopoDSToStep_NoWireMapped: 'TopoDSToStep_NoWireMapped'

  readonly TopoDSToStep_FaceOther: 'TopoDSToStep_FaceOther'

TopoDSToStep_MakeFacetedBrep: declare class TopoDSToStep_MakeFacetedBrep extends TopoDSToStep_Root

  // TopoDSToStep_MakeFacetedBrep.constructor (constructor)
  constructor(S: TopoDS_Shell, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);
  constructor(S: TopoDS_Solid, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_MakeFacetedBrep.Value (method)
  Value(): StepShape_FacetedBrep;

  // TopoDSToStep_MakeFacetedBrep.TessellatedValue (method)
  TessellatedValue(): StepVisual_TessellatedItem;

  // TopoDSToStep_MakeFacetedBrep.delete (method)
  delete(): void;

  // TopoDSToStep_MakeFacetedBrep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeFacetedBrepAndBrepWithVoids: declare class TopoDSToStep_MakeFacetedBrepAndBrepWithVoids extends TopoDSToStep_Root

  // TopoDSToStep_MakeFacetedBrepAndBrepWithVoids.constructor (constructor)
  constructor(S: TopoDS_Solid, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_MakeFacetedBrepAndBrepWithVoids.Value (method)
  Value(): StepShape_FacetedBrepAndBrepWithVoids;

  // TopoDSToStep_MakeFacetedBrepAndBrepWithVoids.TessellatedValue (method)
  TessellatedValue(): StepVisual_TessellatedItem;

  // TopoDSToStep_MakeFacetedBrepAndBrepWithVoids.delete (method)
  delete(): void;

  // TopoDSToStep_MakeFacetedBrepAndBrepWithVoids.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeGeometricCurveSet: declare class TopoDSToStep_MakeGeometricCurveSet extends TopoDSToStep_Root

  // TopoDSToStep_MakeGeometricCurveSet.constructor (constructor)
  constructor(SH: TopoDS_Shape, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors);

  // TopoDSToStep_MakeGeometricCurveSet.Value (method)
  Value(): StepShape_GeometricCurveSet;

  // TopoDSToStep_MakeGeometricCurveSet.delete (method)
  delete(): void;

  // TopoDSToStep_MakeGeometricCurveSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeManifoldSolidBrep: declare class TopoDSToStep_MakeManifoldSolidBrep extends TopoDSToStep_Root

  // TopoDSToStep_MakeManifoldSolidBrep.constructor (constructor)
  constructor(S: TopoDS_Shell, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);
  constructor(S: TopoDS_Solid, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_MakeManifoldSolidBrep.Value (method)
  Value(): StepShape_ManifoldSolidBrep;

  // TopoDSToStep_MakeManifoldSolidBrep.TessellatedValue (method)
  TessellatedValue(): StepVisual_TessellatedItem;

  // TopoDSToStep_MakeManifoldSolidBrep.delete (method)
  delete(): void;

  // TopoDSToStep_MakeManifoldSolidBrep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeShellBasedSurfaceModel: declare class TopoDSToStep_MakeShellBasedSurfaceModel extends TopoDSToStep_Root

  // TopoDSToStep_MakeShellBasedSurfaceModel.constructor (constructor)
  constructor(F: TopoDS_Face, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);
  constructor(S: TopoDS_Shell, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);
  constructor(S: TopoDS_Solid, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_MakeShellBasedSurfaceModel.Value (method)
  Value(): StepShape_ShellBasedSurfaceModel;

  // TopoDSToStep_MakeShellBasedSurfaceModel.TessellatedValue (method)
  TessellatedValue(): StepVisual_TessellatedItem;

  // TopoDSToStep_MakeShellBasedSurfaceModel.delete (method)
  delete(): void;

  // TopoDSToStep_MakeShellBasedSurfaceModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeStepEdge: declare class TopoDSToStep_MakeStepEdge extends TopoDSToStep_Root

  // TopoDSToStep_MakeStepEdge.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors);

  // TopoDSToStep_MakeStepEdge.Init (method)
  Init(E: TopoDS_Edge, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

  // TopoDSToStep_MakeStepEdge.Value (method)
  Value(): StepShape_TopologicalRepresentationItem;

  // TopoDSToStep_MakeStepEdge.Error (method)
  Error(): TopoDSToStep_MakeEdgeError;

  // TopoDSToStep_MakeStepEdge.delete (method)
  delete(): void;

  // TopoDSToStep_MakeStepEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeStepFace: declare class TopoDSToStep_MakeStepFace extends TopoDSToStep_Root

  // TopoDSToStep_MakeStepFace.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors);

  // TopoDSToStep_MakeStepFace.Init (method)
  Init(F: TopoDS_Face, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

  // TopoDSToStep_MakeStepFace.Value (method)
  Value(): StepShape_TopologicalRepresentationItem;

  // TopoDSToStep_MakeStepFace.Error (method)
  Error(): TopoDSToStep_MakeFaceError;

  // TopoDSToStep_MakeStepFace.delete (method)
  delete(): void;

  // TopoDSToStep_MakeStepFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeStepVertex: declare class TopoDSToStep_MakeStepVertex extends TopoDSToStep_Root

  // TopoDSToStep_MakeStepVertex.constructor (constructor)
  constructor();
  constructor(V: TopoDS_Vertex, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors);

  // TopoDSToStep_MakeStepVertex.Init (method)
  Init(V: TopoDS_Vertex, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

  // TopoDSToStep_MakeStepVertex.Value (method)
  Value(): StepShape_TopologicalRepresentationItem;

  // TopoDSToStep_MakeStepVertex.Error (method)
  Error(): TopoDSToStep_MakeVertexError;

  // TopoDSToStep_MakeStepVertex.delete (method)
  delete(): void;

  // TopoDSToStep_MakeStepVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeStepWire: declare class TopoDSToStep_MakeStepWire extends TopoDSToStep_Root

  // TopoDSToStep_MakeStepWire.constructor (constructor)
  constructor();
  constructor(W: TopoDS_Wire, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors);

  // TopoDSToStep_MakeStepWire.Init (method)
  Init(W: TopoDS_Wire, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

  // TopoDSToStep_MakeStepWire.Value (method)
  Value(): StepShape_TopologicalRepresentationItem;

  // TopoDSToStep_MakeStepWire.Error (method)
  Error(): TopoDSToStep_MakeWireError;

  // TopoDSToStep_MakeStepWire.delete (method)
  delete(): void;

  // TopoDSToStep_MakeStepWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeTessellatedItem: declare class TopoDSToStep_MakeTessellatedItem extends TopoDSToStep_Root

  // TopoDSToStep_MakeTessellatedItem.constructor (constructor)
  constructor();
  constructor(theShell: TopoDS_Shell, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, theProgress?: Message_ProgressRange);
  constructor(theFace: TopoDS_Face, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theToPreferSurfaceSet: boolean, theLocalFactors: StepData_Factors, theProgress?: Message_ProgressRange);

  // TopoDSToStep_MakeTessellatedItem.Init (method)
  Init(theFace: TopoDS_Face, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theToPreferSurfaceSet: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theShell: TopoDS_Shell, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;

  // TopoDSToStep_MakeTessellatedItem.Value (method)
  Value(): StepVisual_TessellatedItem;

  // TopoDSToStep_MakeTessellatedItem.delete (method)
  delete(): void;

  // TopoDSToStep_MakeTessellatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_MakeVertexError: typeof TopoDSToStep_MakeVertexError[keyof typeof TopoDSToStep_MakeVertexError]

  readonly TopoDSToStep_VertexDone: 'TopoDSToStep_VertexDone'

  readonly TopoDSToStep_VertexOther: 'TopoDSToStep_VertexOther'

TopoDSToStep_MakeWireError: typeof TopoDSToStep_MakeWireError[keyof typeof TopoDSToStep_MakeWireError]

  readonly TopoDSToStep_WireDone: 'TopoDSToStep_WireDone'

  readonly TopoDSToStep_NonManifoldWire: 'TopoDSToStep_NonManifoldWire'

  readonly TopoDSToStep_WireOther: 'TopoDSToStep_WireOther'

TopoDSToStep_Root: declare class TopoDSToStep_Root

  // TopoDSToStep_Root.Tolerance (method)
  Tolerance(): number;

  // TopoDSToStep_Root.IsDone (method)
  IsDone(): boolean;

  // TopoDSToStep_Root.delete (method)
  delete(): void;

  // TopoDSToStep_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_Tool: declare class TopoDSToStep_Tool

  // TopoDSToStep_Tool.constructor (constructor)
  constructor(theModel: StepData_StepModel);
  constructor(M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, FacetedContext: boolean, theSurfCurveMode: number);

  // TopoDSToStep_Tool.Init (method)
  Init(M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, FacetedContext: boolean, theSurfCurveMode: number): void;

  // TopoDSToStep_Tool.IsBound (method)
  IsBound(S: TopoDS_Shape): boolean;

  // TopoDSToStep_Tool.Bind (method)
  Bind(S: TopoDS_Shape, T: StepShape_TopologicalRepresentationItem): void;

  // TopoDSToStep_Tool.Find (method)
  Find(S: TopoDS_Shape): StepShape_TopologicalRepresentationItem;

  // TopoDSToStep_Tool.Faceted (method)
  Faceted(): boolean;

  // TopoDSToStep_Tool.SetCurrentShell (method)
  SetCurrentShell(S: TopoDS_Shell): void;

  // TopoDSToStep_Tool.CurrentShell (method)
  CurrentShell(): TopoDS_Shell;

  // TopoDSToStep_Tool.SetCurrentFace (method)
  SetCurrentFace(F: TopoDS_Face): void;

  // TopoDSToStep_Tool.CurrentFace (method)
  CurrentFace(): TopoDS_Face;

  // TopoDSToStep_Tool.SetCurrentWire (method)
  SetCurrentWire(W: TopoDS_Wire): void;

  // TopoDSToStep_Tool.CurrentWire (method)
  CurrentWire(): TopoDS_Wire;

  // TopoDSToStep_Tool.SetCurrentEdge (method)
  SetCurrentEdge(E: TopoDS_Edge): void;

  // TopoDSToStep_Tool.CurrentEdge (method)
  CurrentEdge(): TopoDS_Edge;

  // TopoDSToStep_Tool.SetCurrentVertex (method)
  SetCurrentVertex(V: TopoDS_Vertex): void;

  // TopoDSToStep_Tool.CurrentVertex (method)
  CurrentVertex(): TopoDS_Vertex;

  // TopoDSToStep_Tool.Lowest3DTolerance (method)
  Lowest3DTolerance(): number;

  // TopoDSToStep_Tool.SetSurfaceReversed (method)
  SetSurfaceReversed(B: boolean): void;

  // TopoDSToStep_Tool.SurfaceReversed (method)
  SurfaceReversed(): boolean;

  // TopoDSToStep_Tool.Map (method)
  Map(): NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher;

  // TopoDSToStep_Tool.PCurveMode (method)
  PCurveMode(): number;

  // TopoDSToStep_Tool.delete (method)
  delete(): void;

  // TopoDSToStep_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDSToStep_WireframeBuilder: declare class TopoDSToStep_WireframeBuilder extends TopoDSToStep_Root

  // TopoDSToStep_WireframeBuilder.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, T: TopoDSToStep_Tool, theLocalFactors?: StepData_Factors);

  // TopoDSToStep_WireframeBuilder.Init (method)
  Init(S: TopoDS_Shape, T: TopoDSToStep_Tool, theLocalFactors?: StepData_Factors): void;

  // TopoDSToStep_WireframeBuilder.Error (method)
  Error(): TopoDSToStep_BuilderError;

  // TopoDSToStep_WireframeBuilder.Value (method)
  Value(): NCollection_HSequence_handle_Standard_Transient;

  // TopoDSToStep_WireframeBuilder.GetTrimmedCurveFromEdge (method)
  GetTrimmedCurveFromEdge(E: TopoDS_Edge, F: TopoDS_Face, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  // TopoDSToStep_WireframeBuilder.GetTrimmedCurveFromFace (method)
  GetTrimmedCurveFromFace(F: TopoDS_Face, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  // TopoDSToStep_WireframeBuilder.GetTrimmedCurveFromShape (method)
  GetTrimmedCurveFromShape(S: TopoDS_Shape, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  // TopoDSToStep_WireframeBuilder.delete (method)
  delete(): void;

  // TopoDSToStep_WireframeBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
