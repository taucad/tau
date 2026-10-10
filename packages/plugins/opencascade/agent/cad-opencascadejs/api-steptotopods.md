# libcascade — StepToTopoDS

27 top-level symbols. Signatures are verbatim typescript.

StepToTopoDS: declare class StepToTopoDS

  // StepToTopoDS.constructor (constructor)
  constructor();

  // StepToTopoDS.DecodeBuilderError (method)
  static DecodeBuilderError(Error: StepToTopoDS_BuilderError): TCollection_HAsciiString;

  // StepToTopoDS.DecodeShellError (method)
  static DecodeShellError(Error: StepToTopoDS_TranslateShellError): TCollection_HAsciiString;

  // StepToTopoDS.DecodeFaceError (method)
  static DecodeFaceError(Error: StepToTopoDS_TranslateFaceError): TCollection_HAsciiString;

  // StepToTopoDS.DecodeEdgeError (method)
  static DecodeEdgeError(Error: StepToTopoDS_TranslateEdgeError): TCollection_HAsciiString;

  // StepToTopoDS.DecodeVertexError (method)
  static DecodeVertexError(Error: StepToTopoDS_TranslateVertexError): TCollection_HAsciiString;

  // StepToTopoDS.DecodeVertexLoopError (method)
  static DecodeVertexLoopError(Error: StepToTopoDS_TranslateVertexLoopError): TCollection_HAsciiString;

  // StepToTopoDS.DecodePolyLoopError (method)
  static DecodePolyLoopError(Error: StepToTopoDS_TranslatePolyLoopError): TCollection_HAsciiString;

  // StepToTopoDS.DecodeGeometricToolError (method)
  static DecodeGeometricToolError(Error: StepToTopoDS_GeometricToolError): string;

  // StepToTopoDS.delete (method)
  delete(): void;

  // StepToTopoDS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_Builder: declare class StepToTopoDS_Builder extends StepToTopoDS_Root

  // StepToTopoDS_Builder.constructor (constructor)
  constructor();

  // StepToTopoDS_Builder.Init (method)
  Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
  Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
  Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
  Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
  Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
  Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
  Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };

  // StepToTopoDS_Builder.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_Builder.Error (method)
  Error(): StepToTopoDS_BuilderError;

  // StepToTopoDS_Builder.delete (method)
  delete(): void;

  // StepToTopoDS_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_BuilderError: typeof StepToTopoDS_BuilderError[keyof typeof StepToTopoDS_BuilderError]

  readonly StepToTopoDS_BuilderDone: 'StepToTopoDS_BuilderDone'

  readonly StepToTopoDS_BuilderOther: 'StepToTopoDS_BuilderOther'

StepToTopoDS_GeometricTool: declare class StepToTopoDS_GeometricTool

  // StepToTopoDS_GeometricTool.constructor (constructor)
  constructor();

  // StepToTopoDS_GeometricTool.PCurve (method)
  static PCurve(SC: StepGeom_SurfaceCurve, S: StepGeom_Surface, last: number): { returnValue: number; PC: StepGeom_Pcurve; [Symbol.dispose](): void };

  // StepToTopoDS_GeometricTool.IsSeamCurve (method)
  static IsSeamCurve(SC: StepGeom_SurfaceCurve, S: StepGeom_Surface, E: StepShape_Edge, EL: StepShape_EdgeLoop): boolean;

  // StepToTopoDS_GeometricTool.IsLikeSeam (method)
  static IsLikeSeam(SC: StepGeom_SurfaceCurve, S: StepGeom_Surface, E: StepShape_Edge, EL: StepShape_EdgeLoop): boolean;

  // StepToTopoDS_GeometricTool.UpdateParam3d (method)
  static UpdateParam3d(C: Geom_Curve, w1: number, w2: number, preci: number): { returnValue: boolean; w1: number; w2: number };

  // StepToTopoDS_GeometricTool.delete (method)
  delete(): void;

  // StepToTopoDS_GeometricTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_GeometricToolError: typeof StepToTopoDS_GeometricToolError[keyof typeof StepToTopoDS_GeometricToolError]

  readonly StepToTopoDS_GeometricToolDone: 'StepToTopoDS_GeometricToolDone'

  readonly StepToTopoDS_GeometricToolIsDegenerated: 'StepToTopoDS_GeometricToolIsDegenerated'

  readonly StepToTopoDS_GeometricToolHasNoPCurve: 'StepToTopoDS_GeometricToolHasNoPCurve'

  readonly StepToTopoDS_GeometricToolWrong3dParameters: 'StepToTopoDS_GeometricToolWrong3dParameters'

  readonly StepToTopoDS_GeometricToolNoProjectiOnCurve: 'StepToTopoDS_GeometricToolNoProjectiOnCurve'

  readonly StepToTopoDS_GeometricToolOther: 'StepToTopoDS_GeometricToolOther'

StepToTopoDS_MakeTransformed: declare class StepToTopoDS_MakeTransformed extends StepToTopoDS_Root

  // StepToTopoDS_MakeTransformed.constructor (constructor)
  constructor();

  // StepToTopoDS_MakeTransformed.Compute (method)
  Compute(Origin: StepGeom_Axis2Placement3d, Target: StepGeom_Axis2Placement3d, theLocalFactors: StepData_Factors): boolean;
  Compute(Operator: StepGeom_CartesianTransformationOperator3d, theLocalFactors: StepData_Factors): boolean;

  // StepToTopoDS_MakeTransformed.Transformation (method)
  Transformation(): gp_Trsf;

  // StepToTopoDS_MakeTransformed.Transform (method)
  Transform(shape: TopoDS_Shape): boolean;

  // StepToTopoDS_MakeTransformed.TranslateMappedItem (method)
  TranslateMappedItem(mapit: StepRepr_MappedItem, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // StepToTopoDS_MakeTransformed.delete (method)
  delete(): void;

  // StepToTopoDS_MakeTransformed.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_NMTool: declare class StepToTopoDS_NMTool

  // StepToTopoDS_NMTool.constructor (constructor)
  constructor();
  constructor(MapOfRI: NCollection_DataMap_handle_StepRepr_RepresentationItem_TopoDS_Shape, MapOfRINames: NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape);

  // StepToTopoDS_NMTool.Init (method)
  Init(MapOfRI: NCollection_DataMap_handle_StepRepr_RepresentationItem_TopoDS_Shape, MapOfRINames: NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape): void;

  // StepToTopoDS_NMTool.SetActive (method)
  SetActive(isActive: boolean): void;

  // StepToTopoDS_NMTool.IsActive (method)
  IsActive(): boolean;

  // StepToTopoDS_NMTool.CleanUp (method)
  CleanUp(): void;

  // StepToTopoDS_NMTool.IsBound (method)
  IsBound(RI: StepRepr_RepresentationItem): boolean;
  IsBound(RIName: TCollection_AsciiString): boolean;

  // StepToTopoDS_NMTool.Bind (method)
  Bind(RI: StepRepr_RepresentationItem, S: TopoDS_Shape): void;
  Bind(RIName: TCollection_AsciiString, S: TopoDS_Shape): void;

  // StepToTopoDS_NMTool.Find (method)
  Find(RI: StepRepr_RepresentationItem): TopoDS_Shape;
  Find(RIName: TCollection_AsciiString): TopoDS_Shape;

  // StepToTopoDS_NMTool.RegisterNMEdge (method)
  RegisterNMEdge(Edge: TopoDS_Shape): void;

  // StepToTopoDS_NMTool.IsSuspectedAsClosing (method)
  IsSuspectedAsClosing(BaseShell: TopoDS_Shape, SuspectedShell: TopoDS_Shape): boolean;

  // StepToTopoDS_NMTool.IsPureNMShell (method)
  IsPureNMShell(Shell: TopoDS_Shape): boolean;

  // StepToTopoDS_NMTool.SetIDEASCase (method)
  SetIDEASCase(IDEASCase: boolean): void;

  // StepToTopoDS_NMTool.IsIDEASCase (method)
  IsIDEASCase(): boolean;

  // StepToTopoDS_NMTool.delete (method)
  delete(): void;

  // StepToTopoDS_NMTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_PointPair: declare class StepToTopoDS_PointPair

  // StepToTopoDS_PointPair.constructor (constructor)
  constructor(P1: StepGeom_CartesianPoint, P2: StepGeom_CartesianPoint);

  // StepToTopoDS_PointPair.GetPoint1 (method)
  GetPoint1(): StepGeom_CartesianPoint;

  // StepToTopoDS_PointPair.GetPoint2 (method)
  GetPoint2(): StepGeom_CartesianPoint;

  // StepToTopoDS_PointPair.delete (method)
  delete(): void;

  // StepToTopoDS_PointPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_Root: declare class StepToTopoDS_Root

  // StepToTopoDS_Root.IsDone (method)
  IsDone(): boolean;

  // StepToTopoDS_Root.Precision (method)
  Precision(): number;

  // StepToTopoDS_Root.SetPrecision (method)
  SetPrecision(preci: number): void;

  // StepToTopoDS_Root.MaxTol (method)
  MaxTol(): number;

  // StepToTopoDS_Root.SetMaxTol (method)
  SetMaxTol(maxpreci: number): void;

  // StepToTopoDS_Root.delete (method)
  delete(): void;

  // StepToTopoDS_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_Tool: declare class StepToTopoDS_Tool

  // StepToTopoDS_Tool.constructor (constructor)
  constructor();
  constructor(Map: NCollection_DataMap_handle_StepShape_TopologicalRepresentationItem_TopoDS_Shape, TP: Transfer_TransientProcess);

  // StepToTopoDS_Tool.Init (method)
  Init(Map: NCollection_DataMap_handle_StepShape_TopologicalRepresentationItem_TopoDS_Shape, TP: Transfer_TransientProcess): void;

  // StepToTopoDS_Tool.IsBound (method)
  IsBound(TRI: StepShape_TopologicalRepresentationItem): boolean;

  // StepToTopoDS_Tool.Bind (method)
  Bind(TRI: StepShape_TopologicalRepresentationItem, S: TopoDS_Shape): void;

  // StepToTopoDS_Tool.Find (method)
  Find(TRI: StepShape_TopologicalRepresentationItem): TopoDS_Shape;

  // StepToTopoDS_Tool.ClearEdgeMap (method)
  ClearEdgeMap(): void;

  // StepToTopoDS_Tool.IsEdgeBound (method)
  IsEdgeBound(PP: StepToTopoDS_PointPair): boolean;

  // StepToTopoDS_Tool.BindEdge (method)
  BindEdge(PP: StepToTopoDS_PointPair, E: TopoDS_Edge): void;

  // StepToTopoDS_Tool.FindEdge (method)
  FindEdge(PP: StepToTopoDS_PointPair): TopoDS_Edge;

  // StepToTopoDS_Tool.ClearVertexMap (method)
  ClearVertexMap(): void;

  // StepToTopoDS_Tool.IsVertexBound (method)
  IsVertexBound(PG: StepGeom_CartesianPoint): boolean;

  // StepToTopoDS_Tool.BindVertex (method)
  BindVertex(P: StepGeom_CartesianPoint, V: TopoDS_Vertex): void;

  // StepToTopoDS_Tool.FindVertex (method)
  FindVertex(P: StepGeom_CartesianPoint): TopoDS_Vertex;

  // StepToTopoDS_Tool.ComputePCurve (method)
  ComputePCurve(B: boolean): void;
  ComputePCurve(): boolean;

  // StepToTopoDS_Tool.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // StepToTopoDS_Tool.AddContinuity (method)
  AddContinuity(GeomSurf: Geom_Surface): void;
  AddContinuity(GeomCurve: Geom_Curve): void;
  AddContinuity(GeomCur2d: Geom2d_Curve): void;

  // StepToTopoDS_Tool.C0Surf (method)
  C0Surf(): number;

  // StepToTopoDS_Tool.C1Surf (method)
  C1Surf(): number;

  // StepToTopoDS_Tool.C2Surf (method)
  C2Surf(): number;

  // StepToTopoDS_Tool.C0Cur2 (method)
  C0Cur2(): number;

  // StepToTopoDS_Tool.C1Cur2 (method)
  C1Cur2(): number;

  // StepToTopoDS_Tool.C2Cur2 (method)
  C2Cur2(): number;

  // StepToTopoDS_Tool.C0Cur3 (method)
  C0Cur3(): number;

  // StepToTopoDS_Tool.C1Cur3 (method)
  C1Cur3(): number;

  // StepToTopoDS_Tool.C2Cur3 (method)
  C2Cur3(): number;

  // StepToTopoDS_Tool.delete (method)
  delete(): void;

  // StepToTopoDS_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateCompositeCurve: declare class StepToTopoDS_TranslateCompositeCurve extends StepToTopoDS_Root

  // StepToTopoDS_TranslateCompositeCurve.constructor (constructor)
  constructor();
  constructor(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors);
  constructor(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, S: StepGeom_Surface, Surf: Geom_Surface, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslateCompositeCurve.Init (method)
  Init(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): boolean;
  Init(CC: StepGeom_CompositeCurve, TP: Transfer_TransientProcess, S: StepGeom_Surface, Surf: Geom_Surface, theLocalFactors: StepData_Factors): boolean;

  // StepToTopoDS_TranslateCompositeCurve.Value (method)
  Value(): TopoDS_Wire;

  // StepToTopoDS_TranslateCompositeCurve.IsInfiniteSegment (method)
  IsInfiniteSegment(): boolean;

  // StepToTopoDS_TranslateCompositeCurve.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateCompositeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateCurveBoundedSurface: declare class StepToTopoDS_TranslateCurveBoundedSurface extends StepToTopoDS_Root

  // StepToTopoDS_TranslateCurveBoundedSurface.constructor (constructor)
  constructor();
  constructor(CBS: StepGeom_CurveBoundedSurface, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslateCurveBoundedSurface.Init (method)
  Init(CBS: StepGeom_CurveBoundedSurface, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors): boolean;

  // StepToTopoDS_TranslateCurveBoundedSurface.Value (method)
  Value(): TopoDS_Face;

  // StepToTopoDS_TranslateCurveBoundedSurface.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateCurveBoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateEdge: declare class StepToTopoDS_TranslateEdge extends StepToTopoDS_Root

  // StepToTopoDS_TranslateEdge.constructor (constructor)
  constructor();
  constructor(E: StepShape_Edge, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslateEdge.Init (method)
  Init(E: StepShape_Edge, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

  // StepToTopoDS_TranslateEdge.MakeFromCurve3D (method)
  MakeFromCurve3D(C3D: StepGeom_Curve, EC: StepShape_EdgeCurve, Vend: StepShape_Vertex, preci: number, E: TopoDS_Edge, V1: TopoDS_Vertex, V2: TopoDS_Vertex, T: StepToTopoDS_Tool, theLocalFactors: StepData_Factors): void;

  // StepToTopoDS_TranslateEdge.MakePCurve (method)
  MakePCurve(PCU: StepGeom_Pcurve, ConvSurf: Geom_Surface, theLocalFactors?: StepData_Factors): Geom2d_Curve;

  // StepToTopoDS_TranslateEdge.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslateEdge.Error (method)
  Error(): StepToTopoDS_TranslateEdgeError;

  // StepToTopoDS_TranslateEdge.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateEdgeError: typeof StepToTopoDS_TranslateEdgeError[keyof typeof StepToTopoDS_TranslateEdgeError]

  readonly StepToTopoDS_TranslateEdgeDone: 'StepToTopoDS_TranslateEdgeDone'

  readonly StepToTopoDS_TranslateEdgeOther: 'StepToTopoDS_TranslateEdgeOther'

StepToTopoDS_TranslateEdgeLoop: declare class StepToTopoDS_TranslateEdgeLoop extends StepToTopoDS_Root

  // StepToTopoDS_TranslateEdgeLoop.constructor (constructor)
  constructor();
  constructor(FB: StepShape_FaceBound, F: TopoDS_Face, S: Geom_Surface, SS: StepGeom_Surface, ss: boolean, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslateEdgeLoop.Init (method)
  Init(FB: StepShape_FaceBound, F: TopoDS_Face, S: Geom_Surface, SS: StepGeom_Surface, ss: boolean, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

  // StepToTopoDS_TranslateEdgeLoop.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslateEdgeLoop.Error (method)
  Error(): StepToTopoDS_TranslateEdgeLoopError;

  // StepToTopoDS_TranslateEdgeLoop.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateEdgeLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateEdgeLoopError: typeof StepToTopoDS_TranslateEdgeLoopError[keyof typeof StepToTopoDS_TranslateEdgeLoopError]

  readonly StepToTopoDS_TranslateEdgeLoopDone: 'StepToTopoDS_TranslateEdgeLoopDone'

  readonly StepToTopoDS_TranslateEdgeLoopOther: 'StepToTopoDS_TranslateEdgeLoopOther'

StepToTopoDS_TranslateFaceError: typeof StepToTopoDS_TranslateFaceError[keyof typeof StepToTopoDS_TranslateFaceError]

  readonly StepToTopoDS_TranslateFaceDone: 'StepToTopoDS_TranslateFaceDone'

  readonly StepToTopoDS_TranslateFaceOther: 'StepToTopoDS_TranslateFaceOther'

StepToTopoDS_TranslatePolyLoop: declare class StepToTopoDS_TranslatePolyLoop extends StepToTopoDS_Root

  // StepToTopoDS_TranslatePolyLoop.constructor (constructor)
  constructor();
  constructor(PL: StepShape_PolyLoop, T: StepToTopoDS_Tool, S: Geom_Surface, F: TopoDS_Face, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslatePolyLoop.Init (method)
  Init(PL: StepShape_PolyLoop, T: StepToTopoDS_Tool, S: Geom_Surface, F: TopoDS_Face, theLocalFactors: StepData_Factors): void;

  // StepToTopoDS_TranslatePolyLoop.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslatePolyLoop.Error (method)
  Error(): StepToTopoDS_TranslatePolyLoopError;

  // StepToTopoDS_TranslatePolyLoop.delete (method)
  delete(): void;

  // StepToTopoDS_TranslatePolyLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslatePolyLoopError: typeof StepToTopoDS_TranslatePolyLoopError[keyof typeof StepToTopoDS_TranslatePolyLoopError]

  readonly StepToTopoDS_TranslatePolyLoopDone: 'StepToTopoDS_TranslatePolyLoopDone'

  readonly StepToTopoDS_TranslatePolyLoopOther: 'StepToTopoDS_TranslatePolyLoopOther'

StepToTopoDS_TranslateShell: declare class StepToTopoDS_TranslateShell extends StepToTopoDS_Root

  // StepToTopoDS_TranslateShell.constructor (constructor)
  constructor();

  // StepToTopoDS_TranslateShell.Init (method)
  Init(CFS: StepShape_ConnectedFaceSet, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
  Init(theTSh: StepVisual_TessellatedShell, theTool: StepToTopoDS_Tool, theNMTool: StepToTopoDS_NMTool, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };

  // StepToTopoDS_TranslateShell.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslateShell.Error (method)
  Error(): StepToTopoDS_TranslateShellError;

  // StepToTopoDS_TranslateShell.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateShellError: typeof StepToTopoDS_TranslateShellError[keyof typeof StepToTopoDS_TranslateShellError]

  readonly StepToTopoDS_TranslateShellDone: 'StepToTopoDS_TranslateShellDone'

  readonly StepToTopoDS_TranslateShellOther: 'StepToTopoDS_TranslateShellOther'

StepToTopoDS_TranslateSolid: declare class StepToTopoDS_TranslateSolid extends StepToTopoDS_Root

  // StepToTopoDS_TranslateSolid.constructor (constructor)
  constructor();

  // StepToTopoDS_TranslateSolid.Init (method)
  Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theTool: StepToTopoDS_Tool, theNMTool: StepToTopoDS_NMTool, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };

  // StepToTopoDS_TranslateSolid.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslateSolid.Error (method)
  Error(): StepToTopoDS_TranslateSolidError;

  // StepToTopoDS_TranslateSolid.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateSolidError: typeof StepToTopoDS_TranslateSolidError[keyof typeof StepToTopoDS_TranslateSolidError]

  readonly StepToTopoDS_TranslateSolidDone: 'StepToTopoDS_TranslateSolidDone'

  readonly StepToTopoDS_TranslateSolidOther: 'StepToTopoDS_TranslateSolidOther'

StepToTopoDS_TranslateVertex: declare class StepToTopoDS_TranslateVertex extends StepToTopoDS_Root

  // StepToTopoDS_TranslateVertex.constructor (constructor)
  constructor();
  constructor(V: StepShape_Vertex, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslateVertex.Init (method)
  Init(V: StepShape_Vertex, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

  // StepToTopoDS_TranslateVertex.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslateVertex.Error (method)
  Error(): StepToTopoDS_TranslateVertexError;

  // StepToTopoDS_TranslateVertex.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateVertexError: typeof StepToTopoDS_TranslateVertexError[keyof typeof StepToTopoDS_TranslateVertexError]

  readonly StepToTopoDS_TranslateVertexDone: 'StepToTopoDS_TranslateVertexDone'

  readonly StepToTopoDS_TranslateVertexOther: 'StepToTopoDS_TranslateVertexOther'

StepToTopoDS_TranslateVertexLoop: declare class StepToTopoDS_TranslateVertexLoop extends StepToTopoDS_Root

  // StepToTopoDS_TranslateVertexLoop.constructor (constructor)
  constructor();
  constructor(VL: StepShape_VertexLoop, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors?: StepData_Factors);

  // StepToTopoDS_TranslateVertexLoop.Init (method)
  Init(VL: StepShape_VertexLoop, T: StepToTopoDS_Tool, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors): void;

  // StepToTopoDS_TranslateVertexLoop.Value (method)
  Value(): TopoDS_Shape;

  // StepToTopoDS_TranslateVertexLoop.Error (method)
  Error(): StepToTopoDS_TranslateVertexLoopError;

  // StepToTopoDS_TranslateVertexLoop.delete (method)
  delete(): void;

  // StepToTopoDS_TranslateVertexLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepToTopoDS_TranslateVertexLoopError: typeof StepToTopoDS_TranslateVertexLoopError[keyof typeof StepToTopoDS_TranslateVertexLoopError]

  readonly StepToTopoDS_TranslateVertexLoopDone: 'StepToTopoDS_TranslateVertexLoopDone'

  readonly StepToTopoDS_TranslateVertexLoopOther: 'StepToTopoDS_TranslateVertexLoopOther'
