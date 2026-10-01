# libcascade — BOPTools

8 top-level symbols. Signatures are verbatim typescript.

BOPTools_AlgoTools: declare class BOPTools_AlgoTools

  // BOPTools_AlgoTools.constructor (constructor)
  constructor();

  // BOPTools_AlgoTools.DTolerance (method)
  static DTolerance(): number;

  // BOPTools_AlgoTools.ComputeVV (method)
  static ComputeVV(theV: TopoDS_Vertex, theP: gp_Pnt, theTolP: number): number;
  static ComputeVV(theV1: TopoDS_Vertex, theV2: TopoDS_Vertex, theFuzz: number): number;

  // BOPTools_AlgoTools.MakeVertex (method)
  static MakeVertex(theLV: NCollection_List_TopoDS_Shape, theV: TopoDS_Vertex): void;

  // BOPTools_AlgoTools.MakeNewVertex (method)
  static MakeNewVertex(aP1: gp_Pnt, aTol: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aV1: TopoDS_Vertex, aV2: TopoDS_Vertex, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aF2: TopoDS_Face, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aE2: TopoDS_Edge, aP2: number, aNewVertex: TopoDS_Vertex): void;

  // BOPTools_AlgoTools.UpdateVertex (method)
  static UpdateVertex(aVF: TopoDS_Vertex, aVN: TopoDS_Vertex): void;
  static UpdateVertex(aIC: IntTools_Curve, aT: number, aV: TopoDS_Vertex): void;
  static UpdateVertex(aE: TopoDS_Edge, aT: number, aV: TopoDS_Vertex): void;

  // BOPTools_AlgoTools.MakeEdge (method)
  static MakeEdge(theCurve: IntTools_Curve, theV1: TopoDS_Vertex, theT1: number, theV2: TopoDS_Vertex, theT2: number, theTolR3D: number, theE: TopoDS_Edge): void;

  // BOPTools_AlgoTools.CopyEdge (method)
  static CopyEdge(theEdge: TopoDS_Edge): TopoDS_Edge;

  // BOPTools_AlgoTools.MakeSplitEdge (method)
  static MakeSplitEdge(aE1: TopoDS_Edge, aV1: TopoDS_Vertex, aP1: number, aV2: TopoDS_Vertex, aP2: number, aNewEdge: TopoDS_Edge): void;

  // BOPTools_AlgoTools.MakeSectEdge (method)
  static MakeSectEdge(aIC: IntTools_Curve, aV1: TopoDS_Vertex, aP1: number, aV2: TopoDS_Vertex, aP2: number, aNewEdge: TopoDS_Edge): void;

  // BOPTools_AlgoTools.ComputeState (method)
  static ComputeState(thePoint: gp_Pnt, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theVertex: TopoDS_Vertex, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theEdge: TopoDS_Edge, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theTol: number, theBounds: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): TopAbs_State;

  // BOPTools_AlgoTools.ComputeStateByOnePoint (method)
  static ComputeStateByOnePoint(theShape: TopoDS_Shape, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;

  // BOPTools_AlgoTools.GetFaceOff (method)
  static GetFaceOff(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theLCEF: NCollection_List_BOPTools_CoupleOfShape, theFaceOff: TopoDS_Face, theContext: IntTools_Context): boolean;

  // BOPTools_AlgoTools.IsInternalFace (method)
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theLF: NCollection_List_TopoDS_Shape, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theMEF: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theTol: number, theContext: IntTools_Context): boolean;

  // BOPTools_AlgoTools.MakePCurve (method)
  static MakePCurve(theE: TopoDS_Edge, theF1: TopoDS_Face, theF2: TopoDS_Face, theCurve: IntTools_Curve, thePC1: boolean, thePC2: boolean, theContext?: IntTools_Context): void;

  // BOPTools_AlgoTools.IsHole (method)
  static IsHole(theW: TopoDS_Shape, theF: TopoDS_Shape): boolean;

  // BOPTools_AlgoTools.IsSplitToReverse (method)
  static IsSplitToReverse(theSplit: TopoDS_Shape, theShape: TopoDS_Shape, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Face, theShape: TopoDS_Face, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Edge, theShape: TopoDS_Edge, theContext: IntTools_Context, theError: number): boolean;

  // BOPTools_AlgoTools.IsSplitToReverseWithWarn (method)
  static IsSplitToReverseWithWarn(theSplit: TopoDS_Shape, theShape: TopoDS_Shape, theContext: IntTools_Context, theReport?: Message_Report): boolean;

  // BOPTools_AlgoTools.Sense (method)
  static Sense(theF1: TopoDS_Face, theF2: TopoDS_Face, theContext: IntTools_Context): number;

  // BOPTools_AlgoTools.MakeConnexityBlock (method)
  static MakeConnexityBlock(theLS: NCollection_List_TopoDS_Shape, theMapAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theLSCB: NCollection_List_TopoDS_Shape, theAllocator: NCollection_BaseAllocator): void;

  // BOPTools_AlgoTools.MakeConnexityBlocks (method)
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_TopoDS_Shape): void;
  static MakeConnexityBlocks(theLS: NCollection_List_TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_BOPTools_ConnexityBlock): void;
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_NCollection_List_TopoDS_Shape, theConnectionMap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BOPTools_AlgoTools.OrientEdgesOnWire (method)
  static OrientEdgesOnWire(theWire: TopoDS_Shape): void;

  // BOPTools_AlgoTools.OrientFacesOnShell (method)
  static OrientFacesOnShell(theShell: TopoDS_Shape): void;

  // BOPTools_AlgoTools.CorrectTolerances (method)
  static CorrectTolerances(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theTolMax?: number, theRunParallel?: boolean): void;

  // BOPTools_AlgoTools.CorrectCurveOnSurface (method)
  static CorrectCurveOnSurface(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theTolMax?: number, theRunParallel?: boolean): void;

  // BOPTools_AlgoTools.CorrectPointOnCurve (method)
  static CorrectPointOnCurve(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theTolMax?: number, theRunParallel?: boolean): void;

  // BOPTools_AlgoTools.CorrectShapeTolerances (method)
  static CorrectShapeTolerances(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theRunParallel?: boolean): void;

  // BOPTools_AlgoTools.AreFacesSameDomain (method)
  static AreFacesSameDomain(theF1: TopoDS_Face, theF2: TopoDS_Face, theContext: IntTools_Context, theFuzz?: number): boolean;

  // BOPTools_AlgoTools.GetEdgeOff (method)
  static GetEdgeOff(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theEdgeOff: TopoDS_Edge): boolean;

  // BOPTools_AlgoTools.GetEdgeOnFace (method)
  static GetEdgeOnFace(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theEdgeOnF: TopoDS_Edge): boolean;

  // BOPTools_AlgoTools.CorrectRange (method)
  static CorrectRange(aE1: TopoDS_Edge, aE2: TopoDS_Edge, aSR: IntTools_Range, aNewSR: IntTools_Range): void;
  static CorrectRange(aE: TopoDS_Edge, aF: TopoDS_Face, aSR: IntTools_Range, aNewSR: IntTools_Range): void;

  // BOPTools_AlgoTools.IsMicroEdge (method)
  static IsMicroEdge(theEdge: TopoDS_Edge, theContext: IntTools_Context, theCheckSplittable?: boolean): boolean;

  // BOPTools_AlgoTools.IsInvertedSolid (method)
  static IsInvertedSolid(theSolid: TopoDS_Solid): boolean;

  // BOPTools_AlgoTools.ComputeTolerance (method)
  static ComputeTolerance(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theMaxDist?: number, theMaxPar?: number): { returnValue: boolean; theMaxDist: number; theMaxPar: number };

  // BOPTools_AlgoTools.MakeContainer (method)
  static MakeContainer(theType: TopAbs_ShapeEnum, theShape: TopoDS_Shape): void;

  // BOPTools_AlgoTools.PointOnEdge (method)
  static PointOnEdge(aEdge: TopoDS_Edge, aPrm: number, aP: gp_Pnt): void;

  // BOPTools_AlgoTools.IsBlockInOnFace (method)
  static IsBlockInOnFace(aShR: IntTools_Range, aF: TopoDS_Face, aE: TopoDS_Edge, aContext: IntTools_Context): boolean;

  // BOPTools_AlgoTools.Dimensions (method)
  static Dimensions(theS: TopoDS_Shape, theDMin?: number, theDMax?: number): { theDMin: number; theDMax: number };

  // BOPTools_AlgoTools.Dimension (method)
  static Dimension(theS: TopoDS_Shape): number;

  // BOPTools_AlgoTools.TreatCompound (method)
  static TreatCompound(theS: TopoDS_Shape, theList: NCollection_List_TopoDS_Shape, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BOPTools_AlgoTools.IsOpenShell (method)
  static IsOpenShell(theShell: TopoDS_Shell): boolean;

  // BOPTools_AlgoTools.delete (method)
  delete(): void;

  // BOPTools_AlgoTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPTools_AlgoTools2D: declare class BOPTools_AlgoTools2D

  // BOPTools_AlgoTools2D.constructor (constructor)
  constructor();

  // BOPTools_AlgoTools2D.BuildPCurveForEdgeOnFace (method)
  static BuildPCurveForEdgeOnFace(aE: TopoDS_Edge, aF: TopoDS_Face, theContext?: IntTools_Context): void;

  // BOPTools_AlgoTools2D.EdgeTangent (method)
  static EdgeTangent(anE: TopoDS_Edge, aT: number, Tau: gp_Vec): boolean;

  // BOPTools_AlgoTools2D.PointOnSurface (method)
  static PointOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, U: number, V: number, theContext: IntTools_Context): { U: number; V: number };

  // BOPTools_AlgoTools2D.CurveOnSurface (method)
  static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };

  // BOPTools_AlgoTools2D.HasCurveOnSurface (method)
  static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst?: number, aLast?: number, aToler?: number): { returnValue: boolean; aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
  static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face): boolean;

  // BOPTools_AlgoTools2D.AdjustPCurveOnFace (method)
  static AdjustPCurveOnFace(theF: TopoDS_Face, theC3D: Geom_Curve, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
  static AdjustPCurveOnFace(theF: TopoDS_Face, theFirst: number, theLast: number, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };

  // BOPTools_AlgoTools2D.AdjustPCurveOnSurf (method)
  static AdjustPCurveOnSurf(aF: BRepAdaptor_Surface, aT1: number, aT2: number, aC2D: Geom2d_Curve): { aC2DA: Geom2d_Curve; [Symbol.dispose](): void };

  // BOPTools_AlgoTools2D.IntermediatePoint (method)
  static IntermediatePoint(aFirst: number, aLast: number): number;
  static IntermediatePoint(anE: TopoDS_Edge): number;

  // BOPTools_AlgoTools2D.Make2D (method)
  static Make2D(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };

  // BOPTools_AlgoTools2D.MakePCurveOnFace (method)
  static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aT1: number, aT2: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };

  // BOPTools_AlgoTools2D.AttachExistingPCurve (method)
  static AttachExistingPCurve(aEold: TopoDS_Edge, aEnew: TopoDS_Edge, aF: TopoDS_Face, aCtx: IntTools_Context): number;

  // BOPTools_AlgoTools2D.IsEdgeIsoline (method)
  static IsEdgeIsoline(theE: TopoDS_Edge, theF: TopoDS_Face, isTheUIso?: boolean, isTheVIso?: boolean): { isTheUIso: boolean; isTheVIso: boolean };

  // BOPTools_AlgoTools2D.delete (method)
  delete(): void;

  // BOPTools_AlgoTools2D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPTools_AlgoTools3D: declare class BOPTools_AlgoTools3D

  // BOPTools_AlgoTools3D.constructor (constructor)
  constructor();

  // BOPTools_AlgoTools3D.DoSplitSEAMOnFace (method)
  static DoSplitSEAMOnFace(theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
  static DoSplitSEAMOnFace(theEOrigin: TopoDS_Edge, theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;

  // BOPTools_AlgoTools3D.GetNormalToFaceOnEdge (method)
  static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aD: gp_Dir, theContext: IntTools_Context): void;
  static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aD: gp_Dir, theContext: IntTools_Context): void;

  // BOPTools_AlgoTools3D.SenseFlag (method)
  static SenseFlag(aNF1: gp_Dir, aNF2: gp_Dir): number;

  // BOPTools_AlgoTools3D.GetNormalToSurface (method)
  static GetNormalToSurface(aS: Geom_Surface, U: number, V: number, aD: gp_Dir): boolean;

  // BOPTools_AlgoTools3D.GetApproxNormalToFaceOnEdge (method)
  static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;

  // BOPTools_AlgoTools3D.PointNearEdge (method)
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;

  // BOPTools_AlgoTools3D.MinStepIn2d (method)
  static MinStepIn2d(): number;

  // BOPTools_AlgoTools3D.IsEmptyShape (method)
  static IsEmptyShape(aS: TopoDS_Shape): boolean;

  // BOPTools_AlgoTools3D.OrientEdgeOnFace (method)
  static OrientEdgeOnFace(aE: TopoDS_Edge, aF: TopoDS_Face, aER: TopoDS_Edge): void;

  // BOPTools_AlgoTools3D.PointInFace (method)
  static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;

  // BOPTools_AlgoTools3D.delete (method)
  delete(): void;

  // BOPTools_AlgoTools3D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPTools_ConnexityBlock: declare class BOPTools_ConnexityBlock

  // BOPTools_ConnexityBlock.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPTools_ConnexityBlock.Shapes (method)
  Shapes(): NCollection_List_TopoDS_Shape;

  // BOPTools_ConnexityBlock.ChangeShapes (method)
  ChangeShapes(): NCollection_List_TopoDS_Shape;

  // BOPTools_ConnexityBlock.SetRegular (method)
  SetRegular(theFlag: boolean): void;

  // BOPTools_ConnexityBlock.IsRegular (method)
  IsRegular(): boolean;

  // BOPTools_ConnexityBlock.Loops (method)
  Loops(): NCollection_List_TopoDS_Shape;

  // BOPTools_ConnexityBlock.ChangeLoops (method)
  ChangeLoops(): NCollection_List_TopoDS_Shape;

  // BOPTools_ConnexityBlock.delete (method)
  delete(): void;

  // BOPTools_ConnexityBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPTools_CoupleOfShape: declare class BOPTools_CoupleOfShape

  // BOPTools_CoupleOfShape.constructor (constructor)
  constructor();

  // BOPTools_CoupleOfShape.SetShape1 (method)
  SetShape1(theShape: TopoDS_Shape): void;

  // BOPTools_CoupleOfShape.Shape1 (method)
  Shape1(): TopoDS_Shape;

  // BOPTools_CoupleOfShape.SetShape2 (method)
  SetShape2(theShape: TopoDS_Shape): void;

  // BOPTools_CoupleOfShape.Shape2 (method)
  Shape2(): TopoDS_Shape;

  // BOPTools_CoupleOfShape.delete (method)
  delete(): void;

  // BOPTools_CoupleOfShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPTools_Set: declare class BOPTools_Set

  // BOPTools_Set.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: BOPTools_Set);

  // BOPTools_Set.Assign (method)
  Assign(Other: BOPTools_Set): BOPTools_Set;

  // BOPTools_Set.Shape (method)
  Shape(): TopoDS_Shape;

  // BOPTools_Set.Add (method)
  Add(theS: TopoDS_Shape, theType: TopAbs_ShapeEnum): void;

  // BOPTools_Set.NbShapes (method)
  NbShapes(): number;

  // BOPTools_Set.IsEqual (method)
  IsEqual(aOther: BOPTools_Set): boolean;

  // BOPTools_Set.GetSum (method)
  GetSum(): number;

  // BOPTools_Set.delete (method)
  delete(): void;

  // BOPTools_Set.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPTools_ListOfConnexityBlock: NCollection_List_BOPTools_ConnexityBlock

BOPTools_ListOfCoupleOfShape: NCollection_List_BOPTools_CoupleOfShape
