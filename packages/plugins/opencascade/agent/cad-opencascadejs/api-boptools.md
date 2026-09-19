# libcascade — BOPTools

8 top-level symbols. Signatures are verbatim typescript.

BOPTools_AlgoTools: declare class BOPTools_AlgoTools

  constructor

  static DTolerance(): number;

  static ComputeVV(theV: TopoDS_Vertex, theP: gp_Pnt, theTolP: number): number;
  static ComputeVV(theV1: TopoDS_Vertex, theV2: TopoDS_Vertex, theFuzz: number): number;
  static ComputeVV(theV: TopoDS_Vertex, theP: gp_Pnt, theTolP: number): number;
  static ComputeVV(theV1: TopoDS_Vertex, theV2: TopoDS_Vertex, theFuzz: number): number;

  static MakeVertex(theLV: NCollection_List_TopoDS_Shape, theV: TopoDS_Vertex): void;

  static MakeNewVertex(aP1: gp_Pnt, aTol: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aV1: TopoDS_Vertex, aV2: TopoDS_Vertex, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aF2: TopoDS_Face, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aE2: TopoDS_Edge, aP2: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aP1: gp_Pnt, aTol: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aV1: TopoDS_Vertex, aV2: TopoDS_Vertex, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aF2: TopoDS_Face, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aE2: TopoDS_Edge, aP2: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aP1: gp_Pnt, aTol: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aV1: TopoDS_Vertex, aV2: TopoDS_Vertex, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aF2: TopoDS_Face, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aE2: TopoDS_Edge, aP2: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aP1: gp_Pnt, aTol: number, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aV1: TopoDS_Vertex, aV2: TopoDS_Vertex, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aF2: TopoDS_Face, aNewVertex: TopoDS_Vertex): void;
  static MakeNewVertex(aE1: TopoDS_Edge, aP1: number, aE2: TopoDS_Edge, aP2: number, aNewVertex: TopoDS_Vertex): void;

  static UpdateVertex(aVF: TopoDS_Vertex, aVN: TopoDS_Vertex): void;
  static UpdateVertex(aIC: IntTools_Curve, aT: number, aV: TopoDS_Vertex): void;
  static UpdateVertex(aE: TopoDS_Edge, aT: number, aV: TopoDS_Vertex): void;
  static UpdateVertex(aVF: TopoDS_Vertex, aVN: TopoDS_Vertex): void;
  static UpdateVertex(aIC: IntTools_Curve, aT: number, aV: TopoDS_Vertex): void;
  static UpdateVertex(aE: TopoDS_Edge, aT: number, aV: TopoDS_Vertex): void;
  static UpdateVertex(aVF: TopoDS_Vertex, aVN: TopoDS_Vertex): void;
  static UpdateVertex(aIC: IntTools_Curve, aT: number, aV: TopoDS_Vertex): void;
  static UpdateVertex(aE: TopoDS_Edge, aT: number, aV: TopoDS_Vertex): void;

  static MakeEdge(theCurve: IntTools_Curve, theV1: TopoDS_Vertex, theT1: number, theV2: TopoDS_Vertex, theT2: number, theTolR3D: number, theE: TopoDS_Edge): void;

  static CopyEdge(theEdge: TopoDS_Edge): TopoDS_Edge;

  static MakeSplitEdge(aE1: TopoDS_Edge, aV1: TopoDS_Vertex, aP1: number, aV2: TopoDS_Vertex, aP2: number, aNewEdge: TopoDS_Edge): void;

  static MakeSectEdge(aIC: IntTools_Curve, aV1: TopoDS_Vertex, aP1: number, aV2: TopoDS_Vertex, aP2: number, aNewEdge: TopoDS_Edge): void;

  static ComputeState(thePoint: gp_Pnt, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theVertex: TopoDS_Vertex, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theEdge: TopoDS_Edge, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theTol: number, theBounds: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(thePoint: gp_Pnt, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theVertex: TopoDS_Vertex, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theEdge: TopoDS_Edge, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theTol: number, theBounds: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(thePoint: gp_Pnt, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theVertex: TopoDS_Vertex, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theEdge: TopoDS_Edge, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theTol: number, theBounds: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(thePoint: gp_Pnt, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theVertex: TopoDS_Vertex, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theEdge: TopoDS_Edge, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;
  static ComputeState(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theTol: number, theBounds: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): TopAbs_State;

  static ComputeStateByOnePoint(theShape: TopoDS_Shape, theSolid: TopoDS_Solid, theTol: number, theContext: IntTools_Context): TopAbs_State;

  static GetFaceOff(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theLCEF: NCollection_List_BOPTools_CoupleOfShape, theFaceOff: TopoDS_Face, theContext: IntTools_Context): boolean;

  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theLF: NCollection_List_TopoDS_Shape, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theMEF: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theTol: number, theContext: IntTools_Context): boolean;
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theLF: NCollection_List_TopoDS_Shape, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theMEF: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theTol: number, theContext: IntTools_Context): boolean;
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theLF: NCollection_List_TopoDS_Shape, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theContext: IntTools_Context): number;
  static IsInternalFace(theFace: TopoDS_Face, theSolid: TopoDS_Solid, theMEF: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theTol: number, theContext: IntTools_Context): boolean;

  static MakePCurve(theE: TopoDS_Edge, theF1: TopoDS_Face, theF2: TopoDS_Face, theCurve: IntTools_Curve, thePC1: boolean, thePC2: boolean, theContext?: IntTools_Context): void;

  static IsHole(theW: TopoDS_Shape, theF: TopoDS_Shape): boolean;

  static IsSplitToReverse(theSplit: TopoDS_Shape, theShape: TopoDS_Shape, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Face, theShape: TopoDS_Face, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Edge, theShape: TopoDS_Edge, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Shape, theShape: TopoDS_Shape, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Face, theShape: TopoDS_Face, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Edge, theShape: TopoDS_Edge, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Shape, theShape: TopoDS_Shape, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Face, theShape: TopoDS_Face, theContext: IntTools_Context, theError: number): boolean;
  static IsSplitToReverse(theSplit: TopoDS_Edge, theShape: TopoDS_Edge, theContext: IntTools_Context, theError: number): boolean;

  static IsSplitToReverseWithWarn(theSplit: TopoDS_Shape, theShape: TopoDS_Shape, theContext: IntTools_Context, theReport?: Message_Report): boolean;

  static Sense(theF1: TopoDS_Face, theF2: TopoDS_Face, theContext: IntTools_Context): number;

  static MakeConnexityBlock(theLS: NCollection_List_TopoDS_Shape, theMapAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theLSCB: NCollection_List_TopoDS_Shape, theAllocator: NCollection_BaseAllocator): void;

  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_TopoDS_Shape): void;
  static MakeConnexityBlocks(theLS: NCollection_List_TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_BOPTools_ConnexityBlock): void;
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_NCollection_List_TopoDS_Shape, theConnectionMap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_TopoDS_Shape): void;
  static MakeConnexityBlocks(theLS: NCollection_List_TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_BOPTools_ConnexityBlock): void;
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_NCollection_List_TopoDS_Shape, theConnectionMap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_TopoDS_Shape): void;
  static MakeConnexityBlocks(theLS: NCollection_List_TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_BOPTools_ConnexityBlock): void;
  static MakeConnexityBlocks(theS: TopoDS_Shape, theConnectionType: TopAbs_ShapeEnum, theElementType: TopAbs_ShapeEnum, theLCB: NCollection_List_NCollection_List_TopoDS_Shape, theConnectionMap: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static OrientEdgesOnWire(theWire: TopoDS_Shape): void;

  static OrientFacesOnShell(theShell: TopoDS_Shape): void;

  static CorrectTolerances(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theTolMax?: number, theRunParallel?: boolean): void;

  static CorrectCurveOnSurface(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theTolMax?: number, theRunParallel?: boolean): void;

  static CorrectPointOnCurve(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theTolMax?: number, theRunParallel?: boolean): void;

  static CorrectShapeTolerances(theS: TopoDS_Shape, theMapToAvoid: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theRunParallel?: boolean): void;

  static AreFacesSameDomain(theF1: TopoDS_Face, theF2: TopoDS_Face, theContext: IntTools_Context, theFuzz?: number): boolean;

  static GetEdgeOff(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theEdgeOff: TopoDS_Edge): boolean;

  static GetEdgeOnFace(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theEdgeOnF: TopoDS_Edge): boolean;

  static CorrectRange(aE1: TopoDS_Edge, aE2: TopoDS_Edge, aSR: IntTools_Range, aNewSR: IntTools_Range): void;
  static CorrectRange(aE: TopoDS_Edge, aF: TopoDS_Face, aSR: IntTools_Range, aNewSR: IntTools_Range): void;
  static CorrectRange(aE1: TopoDS_Edge, aE2: TopoDS_Edge, aSR: IntTools_Range, aNewSR: IntTools_Range): void;
  static CorrectRange(aE: TopoDS_Edge, aF: TopoDS_Face, aSR: IntTools_Range, aNewSR: IntTools_Range): void;

  static IsMicroEdge(theEdge: TopoDS_Edge, theContext: IntTools_Context, theCheckSplittable?: boolean): boolean;

  static IsInvertedSolid(theSolid: TopoDS_Solid): boolean;

  static ComputeTolerance(theFace: TopoDS_Face, theEdge: TopoDS_Edge, theMaxDist?: number, theMaxPar?: number): { returnValue: boolean; theMaxDist: number; theMaxPar: number };

  static MakeContainer(theType: TopAbs_ShapeEnum, theShape: TopoDS_Shape): void;

  static PointOnEdge(aEdge: TopoDS_Edge, aPrm: number, aP: gp_Pnt): void;

  static IsBlockInOnFace(aShR: IntTools_Range, aF: TopoDS_Face, aE: TopoDS_Edge, aContext: IntTools_Context): boolean;

  static Dimensions(theS: TopoDS_Shape, theDMin?: number, theDMax?: number): { theDMin: number; theDMax: number };

  static Dimension(theS: TopoDS_Shape): number;

  static TreatCompound(theS: TopoDS_Shape, theList: NCollection_List_TopoDS_Shape, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static IsOpenShell(theShell: TopoDS_Shell): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BOPTools_AlgoTools2D: declare class BOPTools_AlgoTools2D

  constructor

  static BuildPCurveForEdgeOnFace(aE: TopoDS_Edge, aF: TopoDS_Face, theContext?: IntTools_Context): void;

  static EdgeTangent(anE: TopoDS_Edge, aT: number, Tau: gp_Vec): boolean;

  static PointOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, U: number, V: number, theContext: IntTools_Context): { U: number; V: number };

  static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
  static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };

  static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst?: number, aLast?: number, aToler?: number): { returnValue: boolean; aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
  static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face): boolean;
  static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst?: number, aLast?: number, aToler?: number): { returnValue: boolean; aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
  static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face): boolean;

  static AdjustPCurveOnFace(theF: TopoDS_Face, theC3D: Geom_Curve, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
  static AdjustPCurveOnFace(theF: TopoDS_Face, theFirst: number, theLast: number, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
  static AdjustPCurveOnFace(theF: TopoDS_Face, theC3D: Geom_Curve, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
  static AdjustPCurveOnFace(theF: TopoDS_Face, theFirst: number, theLast: number, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };

  static AdjustPCurveOnSurf(aF: BRepAdaptor_Surface, aT1: number, aT2: number, aC2D: Geom2d_Curve): { aC2DA: Geom2d_Curve; [Symbol.dispose](): void };

  static IntermediatePoint(aFirst: number, aLast: number): number;
  static IntermediatePoint(anE: TopoDS_Edge): number;
  static IntermediatePoint(aFirst: number, aLast: number): number;
  static IntermediatePoint(anE: TopoDS_Edge): number;

  static Make2D(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };

  static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aT1: number, aT2: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
  static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aT1: number, aT2: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };

  static AttachExistingPCurve(aEold: TopoDS_Edge, aEnew: TopoDS_Edge, aF: TopoDS_Face, aCtx: IntTools_Context): number;

  static IsEdgeIsoline(theE: TopoDS_Edge, theF: TopoDS_Face, isTheUIso?: boolean, isTheVIso?: boolean): { isTheUIso: boolean; isTheVIso: boolean };

  delete(): void;

  [Symbol.dispose](): void;

BOPTools_AlgoTools3D: declare class BOPTools_AlgoTools3D

  constructor

  static DoSplitSEAMOnFace(theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
  static DoSplitSEAMOnFace(theEOrigin: TopoDS_Edge, theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
  static DoSplitSEAMOnFace(theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
  static DoSplitSEAMOnFace(theEOrigin: TopoDS_Edge, theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;

  static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aD: gp_Dir, theContext: IntTools_Context): void;
  static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aD: gp_Dir, theContext: IntTools_Context): void;
  static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aD: gp_Dir, theContext: IntTools_Context): void;
  static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aD: gp_Dir, theContext: IntTools_Context): void;

  static SenseFlag(aNF1: gp_Dir, aNF2: gp_Dir): number;

  static GetNormalToSurface(aS: Geom_Surface, U: number, V: number, aD: gp_Dir): boolean;

  static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;
  static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;
  static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
  static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;

  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
  static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;

  static MinStepIn2d(): number;

  static IsEmptyShape(aS: TopoDS_Shape): boolean;

  static OrientEdgeOnFace(aE: TopoDS_Edge, aF: TopoDS_Face, aER: TopoDS_Edge): void;

  static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;
  static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;
  static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
  static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPTools_ConnexityBlock: declare class BOPTools_ConnexityBlock

  constructor

  Shapes(): NCollection_List_TopoDS_Shape;

  ChangeShapes(): NCollection_List_TopoDS_Shape;

  SetRegular(theFlag: boolean): void;

  IsRegular(): boolean;

  Loops(): NCollection_List_TopoDS_Shape;

  ChangeLoops(): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BOPTools_CoupleOfShape: declare class BOPTools_CoupleOfShape

  constructor

  SetShape1(theShape: TopoDS_Shape): void;

  Shape1(): TopoDS_Shape;

  SetShape2(theShape: TopoDS_Shape): void;

  Shape2(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BOPTools_Set: declare class BOPTools_Set

  constructor

  Assign(Other: BOPTools_Set): BOPTools_Set;

  Shape(): TopoDS_Shape;

  Add(theS: TopoDS_Shape, theType: TopAbs_ShapeEnum): void;

  NbShapes(): number;

  IsEqual(aOther: BOPTools_Set): boolean;

  GetSum(): number;

  delete(): void;

  [Symbol.dispose](): void;

BOPTools_ListOfConnexityBlock: NCollection_List_BOPTools_ConnexityBlock

BOPTools_ListOfCoupleOfShape: NCollection_List_BOPTools_CoupleOfShape
