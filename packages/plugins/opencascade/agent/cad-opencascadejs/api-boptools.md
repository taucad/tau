# libcascade — BOPTools

2 top-level symbols. Signatures are verbatim typescript.

// Provides tools used in Boolean Operations algorithm
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class contains handy static functions dealing with the topology This is the copy of the BOPTools_AlgoTools2D.cdl
BOPTools_AlgoTools2D: declare class BOPTools_AlgoTools2D

constructor

// Compute P-Curve for the edge <aE> on the face <aF>
static BuildPCurveForEdgeOnFace(aE: TopoDS_Edge, aF: TopoDS_Face, theContext?: IntTools_Context): void;

// Compute tangent for the edge <aE> [in 3D] at parameter <aT>
static EdgeTangent(anE: TopoDS_Edge, aT: number, Tau: gp_Vec): boolean;
// Tau: Mutated in place

// Compute surface parameters <U,V> of the face <aF> for the point from the edge <aE> at parameter <aT>
static PointOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, U: number, V: number, theContext: IntTools_Context): { U: number; V: number };

// Get P-Curve <aC> for the edge <aE> on surface <aF>
static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
static CurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };

// Returns TRUE if the edge <aE> has P-Curve <aC> on surface <aF>
static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst?: number, aLast?: number, aToler?: number): { returnValue: boolean; aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face): boolean;
static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst?: number, aLast?: number, aToler?: number): { returnValue: boolean; aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };
static HasCurveOnSurface(aE: TopoDS_Edge, aF: TopoDS_Face): boolean;

// Adjust P-Curve <theC2D> (3D-curve <theC3D>) on surface of the face <theF>
static AdjustPCurveOnFace(theF: TopoDS_Face, theC3D: Geom_Curve, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
static AdjustPCurveOnFace(theF: TopoDS_Face, theFirst: number, theLast: number, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
static AdjustPCurveOnFace(theF: TopoDS_Face, theC3D: Geom_Curve, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };
static AdjustPCurveOnFace(theF: TopoDS_Face, theFirst: number, theLast: number, theC2D: Geom2d_Curve, theContext: IntTools_Context): { theC2DA: Geom2d_Curve; [Symbol.dispose](): void };

// Adjust P-Curve <aC2D> (3D-curve <C3D>) on surface <aF>
static AdjustPCurveOnSurf(aF: BRepAdaptor_Surface, aT1: number, aT2: number, aC2D: Geom2d_Curve): { aC2DA: Geom2d_Curve; [Symbol.dispose](): void };

// Compute intermediate value in between [aFirst, aLast]
static IntermediatePoint(aFirst: number, aLast: number): number;
static IntermediatePoint(anE: TopoDS_Edge): number;
static IntermediatePoint(aFirst: number, aLast: number): number;
static IntermediatePoint(anE: TopoDS_Edge): number;

// Make P-Curve <aC> for the edge <aE> on surface <aF>
static Make2D(aE: TopoDS_Edge, aF: TopoDS_Face, aFirst: number, aLast: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aFirst: number; aLast: number; aToler: number; [Symbol.dispose](): void };

// Make P-Curve <aC> for the 3D-curve <C3D> on surface <aF>
static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aT1: number, aT2: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };
static MakePCurveOnFace(aF: TopoDS_Face, C3D: Geom_Curve, aT1: number, aT2: number, aToler: number, theContext: IntTools_Context): { aC: Geom2d_Curve; aToler: number; [Symbol.dispose](): void };

// Attach P-Curve from the edge <aEold> on surface <aF> to the edge <aEnew> Returns 0 in case of success
static AttachExistingPCurve(aEold: TopoDS_Edge, aEnew: TopoDS_Edge, aF: TopoDS_Face, aCtx: IntTools_Context): number;

// Checks if CurveOnSurface of theE on theF matches with isoline of theF surface
static IsEdgeIsoline(theE: TopoDS_Edge, theF: TopoDS_Face, isTheUIso?: boolean, isTheVIso?: boolean): { isTheUIso: boolean; isTheVIso: boolean };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
