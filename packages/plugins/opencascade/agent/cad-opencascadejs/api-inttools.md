# libcascade — IntTools

29 top-level symbols. Signatures are verbatim typescript.

IntTools: declare class IntTools

  // IntTools.constructor (constructor)
  constructor();

  // IntTools.Length (method)
  static Length(E: TopoDS_Edge): number;

  // IntTools.RemoveIdenticalRoots (method)
  static RemoveIdenticalRoots(aSeq: NCollection_Sequence_IntTools_Root, anEpsT: number): void;

  // IntTools.SortRoots (method)
  static SortRoots(aSeq: NCollection_Sequence_IntTools_Root, anEpsT: number): void;

  // IntTools.FindRootStates (method)
  static FindRootStates(aSeq: NCollection_Sequence_IntTools_Root, anEpsNull: number): void;

  // IntTools.Parameter (method)
  static Parameter(P: gp_Pnt, Curve: Geom_Curve, aParm?: number): { returnValue: number; aParm: number };

  // IntTools.GetRadius (method)
  static GetRadius(C: BRepAdaptor_Curve, t1: number, t3: number, R?: number): { returnValue: number; R: number };

  // IntTools.PrepareArgs (method)
  static PrepareArgs(C: BRepAdaptor_Curve, tMax: number, tMin: number, Discret: number, Deflect: number, anArgs: NCollection_Array1_double): number;

  // IntTools.delete (method)
  delete(): void;

  // IntTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_BaseRangeSample: declare class IntTools_BaseRangeSample

  // IntTools_BaseRangeSample.constructor (constructor)
  constructor();
  constructor(theDepth: number);

  // IntTools_BaseRangeSample.SetDepth (method)
  SetDepth(theDepth: number): void;

  // IntTools_BaseRangeSample.GetDepth (method)
  GetDepth(): number;

  // IntTools_BaseRangeSample.delete (method)
  delete(): void;

  // IntTools_BaseRangeSample.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_BeanFaceIntersector: declare class IntTools_BeanFaceIntersector

  // IntTools_BeanFaceIntersector.constructor (constructor)
  constructor();
  constructor(theEdge: TopoDS_Edge, theFace: TopoDS_Face);
  constructor(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number);
  constructor(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number);

  // IntTools_BeanFaceIntersector.Init (method)
  Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
  Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
  Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;

  // IntTools_BeanFaceIntersector.SetContext (method)
  SetContext(theContext: IntTools_Context): void;

  // IntTools_BeanFaceIntersector.Context (method)
  Context(): IntTools_Context;

  // IntTools_BeanFaceIntersector.SetBeanParameters (method)
  SetBeanParameters(theFirstParOnCurve: number, theLastParOnCurve: number): void;

  // IntTools_BeanFaceIntersector.SetSurfaceParameters (method)
  SetSurfaceParameters(theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number): void;

  // IntTools_BeanFaceIntersector.Perform (method)
  Perform(): void;

  // IntTools_BeanFaceIntersector.IsDone (method)
  IsDone(): boolean;

  // IntTools_BeanFaceIntersector.Result (method)
  Result(): NCollection_Sequence_IntTools_Range;
  Result(theResults: NCollection_Sequence_IntTools_Range): void;

  // IntTools_BeanFaceIntersector.MinimalSquareDistance (method)
  MinimalSquareDistance(): number;

  // IntTools_BeanFaceIntersector.delete (method)
  delete(): void;

  // IntTools_BeanFaceIntersector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_CommonPrt: declare class IntTools_CommonPrt

  // IntTools_CommonPrt.constructor (constructor)
  constructor();
  constructor(aCPrt: IntTools_CommonPrt);

  // IntTools_CommonPrt.Assign (method)
  Assign(Other: IntTools_CommonPrt): IntTools_CommonPrt;

  // IntTools_CommonPrt.SetEdge1 (method)
  SetEdge1(anE: TopoDS_Edge): void;

  // IntTools_CommonPrt.SetEdge2 (method)
  SetEdge2(anE: TopoDS_Edge): void;

  // IntTools_CommonPrt.SetType (method)
  SetType(aType: TopAbs_ShapeEnum): void;

  // IntTools_CommonPrt.SetRange1 (method)
  SetRange1(aR: IntTools_Range): void;
  SetRange1(tf: number, tl: number): void;

  // IntTools_CommonPrt.AppendRange2 (method)
  AppendRange2(aR: IntTools_Range): void;
  AppendRange2(tf: number, tl: number): void;

  // IntTools_CommonPrt.SetVertexParameter1 (method)
  SetVertexParameter1(tV: number): void;

  // IntTools_CommonPrt.SetVertexParameter2 (method)
  SetVertexParameter2(tV: number): void;

  // IntTools_CommonPrt.Edge1 (method)
  Edge1(): TopoDS_Edge;

  // IntTools_CommonPrt.Edge2 (method)
  Edge2(): TopoDS_Edge;

  // IntTools_CommonPrt.Type (method)
  Type(): TopAbs_ShapeEnum;

  // IntTools_CommonPrt.Range1 (method)
  Range1(): IntTools_Range;
  Range1(tf?: number, tl?: number): { tf: number; tl: number };

  // IntTools_CommonPrt.Ranges2 (method)
  Ranges2(): NCollection_Sequence_IntTools_Range;

  // IntTools_CommonPrt.ChangeRanges2 (method)
  ChangeRanges2(): NCollection_Sequence_IntTools_Range;

  // IntTools_CommonPrt.VertexParameter1 (method)
  VertexParameter1(): number;

  // IntTools_CommonPrt.VertexParameter2 (method)
  VertexParameter2(): number;

  // IntTools_CommonPrt.Copy (method)
  Copy(anOther: IntTools_CommonPrt): void;

  // IntTools_CommonPrt.AllNullFlag (method)
  AllNullFlag(): boolean;

  // IntTools_CommonPrt.SetAllNullFlag (method)
  SetAllNullFlag(aFlag: boolean): void;

  // IntTools_CommonPrt.SetBoundingPoints (method)
  SetBoundingPoints(aP1: gp_Pnt, aP2: gp_Pnt): void;

  // IntTools_CommonPrt.BoundingPoints (method)
  BoundingPoints(aP1: gp_Pnt, aP2: gp_Pnt): void;

  // IntTools_CommonPrt.delete (method)
  delete(): void;

  // IntTools_CommonPrt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_Context: declare class IntTools_Context extends Standard_Transient

  // IntTools_Context.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // IntTools_Context.ProjPC (method)
  ProjPC(aE: TopoDS_Edge): GeomAPI_ProjectPointOnCurve;

  // IntTools_Context.ProjPT (method)
  ProjPT(aC: Geom_Curve): GeomAPI_ProjectPointOnCurve;

  // IntTools_Context.SurfaceData (method)
  SurfaceData(aF: TopoDS_Face): IntTools_SurfaceRangeLocalizeData;

  // IntTools_Context.Hatcher (method)
  Hatcher(aF: TopoDS_Face): Geom2dHatch_Hatcher;

  // IntTools_Context.SurfaceAdaptor (method)
  SurfaceAdaptor(theFace: TopoDS_Face): BRepAdaptor_Surface;

  // IntTools_Context.OBB (method)
  OBB(theShape: TopoDS_Shape, theFuzzyValue?: number): Bnd_OBB;

  // IntTools_Context.UVBounds (method)
  UVBounds(theFace: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };

  // IntTools_Context.ComputePE (method)
  ComputePE(theP: gp_Pnt, theTolP: number, theE: TopoDS_Edge, theT?: number, theDist?: number): { returnValue: number; theT: number; theDist: number };

  // IntTools_Context.ComputeVE (method)
  ComputeVE(theV: TopoDS_Vertex, theE: TopoDS_Edge, theT: number, theTol: number, theFuzz: number): { returnValue: number; theT: number; theTol: number };

  // IntTools_Context.ComputeVF (method)
  ComputeVF(theVertex: TopoDS_Vertex, theFace: TopoDS_Face, theU: number, theV: number, theTol: number, theFuzz: number): { returnValue: number; theU: number; theV: number; theTol: number };

  // IntTools_Context.StatePointFace (method)
  StatePointFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): TopAbs_State;

  // IntTools_Context.IsPointInFace (method)
  IsPointInFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;
  IsPointInFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;

  // IntTools_Context.IsPointInOnFace (method)
  IsPointInOnFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;

  // IntTools_Context.IsValidPointForFace (method)
  IsValidPointForFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;

  // IntTools_Context.IsValidPointForFaces (method)
  IsValidPointForFaces(aP3D: gp_Pnt, aF1: TopoDS_Face, aF2: TopoDS_Face, aTol: number): boolean;

  // IntTools_Context.IsValidBlockForFace (method)
  IsValidBlockForFace(aT1: number, aT2: number, aIC: IntTools_Curve, aF: TopoDS_Face, aTol: number): boolean;

  // IntTools_Context.IsValidBlockForFaces (method)
  IsValidBlockForFaces(aT1: number, aT2: number, aIC: IntTools_Curve, aF1: TopoDS_Face, aF2: TopoDS_Face, aTol: number): boolean;

  // IntTools_Context.IsVertexOnLine (method)
  IsVertexOnLine(aV: TopoDS_Vertex, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
  IsVertexOnLine(aV: TopoDS_Vertex, aTolV: number, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };

  // IntTools_Context.ProjectPointOnEdge (method)
  ProjectPointOnEdge(aP: gp_Pnt, aE: TopoDS_Edge, aT?: number): { returnValue: boolean; aT: number };

  // IntTools_Context.BndBox (method)
  BndBox(theS: TopoDS_Shape): Bnd_Box;

  // IntTools_Context.IsInfiniteFace (method)
  IsInfiniteFace(theFace: TopoDS_Face): boolean;

  // IntTools_Context.SetPOnSProjectionTolerance (method)
  SetPOnSProjectionTolerance(theValue: number): void;

  // IntTools_Context.get_type_name (method)
  static get_type_name(): string;

  // IntTools_Context.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntTools_Context.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntTools_Context.delete (method)
  delete(): void;

  // IntTools_Context.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_Curve: declare class IntTools_Curve

  // IntTools_Curve.constructor (constructor)
  constructor();
  constructor(the3dCurve3d: Geom_Curve, the2dCurve1: Geom2d_Curve, the2dCurve2: Geom2d_Curve, theTolerance?: number, theTangentialTolerance?: number);

  // IntTools_Curve.SetCurves (method)
  SetCurves(the3dCurve: Geom_Curve, the2dCurve1: Geom2d_Curve, the2dCurve2: Geom2d_Curve): void;

  // IntTools_Curve.SetCurve (method)
  SetCurve(the3dCurve: Geom_Curve): void;

  // IntTools_Curve.SetFirstCurve2d (method)
  SetFirstCurve2d(the2dCurve1: Geom2d_Curve): void;

  // IntTools_Curve.SetSecondCurve2d (method)
  SetSecondCurve2d(the2dCurve2: Geom2d_Curve): void;

  // IntTools_Curve.SetTolerance (method)
  SetTolerance(theTolerance: number): void;

  // IntTools_Curve.SetTangentialTolerance (method)
  SetTangentialTolerance(theTangentialTolerance: number): void;

  // IntTools_Curve.Curve (method)
  Curve(): Geom_Curve;

  // IntTools_Curve.FirstCurve2d (method)
  FirstCurve2d(): Geom2d_Curve;

  // IntTools_Curve.SecondCurve2d (method)
  SecondCurve2d(): Geom2d_Curve;

  // IntTools_Curve.Tolerance (method)
  Tolerance(): number;

  // IntTools_Curve.TangentialTolerance (method)
  TangentialTolerance(): number;

  // IntTools_Curve.HasBounds (method)
  HasBounds(): boolean;

  // IntTools_Curve.Bounds (method)
  Bounds(theFirst: number, theLast: number, theFirstPnt: gp_Pnt, theLastPnt: gp_Pnt): { returnValue: boolean; theFirst: number; theLast: number };

  // IntTools_Curve.D0 (method)
  D0(thePar: number, thePnt: gp_Pnt): boolean;

  // IntTools_Curve.Type (method)
  Type(): GeomAbs_CurveType;

  // IntTools_Curve.delete (method)
  delete(): void;

  // IntTools_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_CurveRangeLocalizeData: declare class IntTools_CurveRangeLocalizeData

  // IntTools_CurveRangeLocalizeData.constructor (constructor)
  constructor(theNbSample: number, theMinRange: number);

  // IntTools_CurveRangeLocalizeData.GetNbSample (method)
  GetNbSample(): number;

  // IntTools_CurveRangeLocalizeData.GetMinRange (method)
  GetMinRange(): number;

  // IntTools_CurveRangeLocalizeData.AddOutRange (method)
  AddOutRange(theRange: IntTools_CurveRangeSample): void;

  // IntTools_CurveRangeLocalizeData.AddBox (method)
  AddBox(theRange: IntTools_CurveRangeSample, theBox: Bnd_Box): void;

  // IntTools_CurveRangeLocalizeData.FindBox (method)
  FindBox(theRange: IntTools_CurveRangeSample, theBox: Bnd_Box): boolean;

  // IntTools_CurveRangeLocalizeData.IsRangeOut (method)
  IsRangeOut(theRange: IntTools_CurveRangeSample): boolean;

  // IntTools_CurveRangeLocalizeData.ListRangeOut (method)
  ListRangeOut(theList: NCollection_List_IntTools_CurveRangeSample): void;

  // IntTools_CurveRangeLocalizeData.delete (method)
  delete(): void;

  // IntTools_CurveRangeLocalizeData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_CurveRangeSample: declare class IntTools_CurveRangeSample extends IntTools_BaseRangeSample

  // IntTools_CurveRangeSample.constructor (constructor)
  constructor();
  constructor(theIndex: number);

  // IntTools_CurveRangeSample.SetRangeIndex (method)
  SetRangeIndex(theIndex: number): void;

  // IntTools_CurveRangeSample.GetRangeIndex (method)
  GetRangeIndex(): number;

  // IntTools_CurveRangeSample.IsEqual (method)
  IsEqual(Other: IntTools_CurveRangeSample): boolean;

  // IntTools_CurveRangeSample.GetRange (method)
  GetRange(theFirst: number, theLast: number, theNbSample: number): IntTools_Range;

  // IntTools_CurveRangeSample.GetRangeIndexDeeper (method)
  GetRangeIndexDeeper(theNbSample: number): number;

  // IntTools_CurveRangeSample.delete (method)
  delete(): void;

  // IntTools_CurveRangeSample.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_EdgeEdge: declare class IntTools_EdgeEdge

  // IntTools_EdgeEdge.constructor (constructor)
  constructor();
  constructor(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge);
  constructor(theEdge1: TopoDS_Edge, aT11: number, aT12: number, theEdge2: TopoDS_Edge, aT21: number, aT22: number);

  // IntTools_EdgeEdge.SetEdge1 (method)
  SetEdge1(theEdge: TopoDS_Edge): void;
  SetEdge1(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;

  // IntTools_EdgeEdge.SetRange1 (method)
  SetRange1(theRange1: IntTools_Range): void;
  SetRange1(aT1: number, aT2: number): void;

  // IntTools_EdgeEdge.SetEdge2 (method)
  SetEdge2(theEdge: TopoDS_Edge): void;
  SetEdge2(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;

  // IntTools_EdgeEdge.SetRange2 (method)
  SetRange2(theRange: IntTools_Range): void;
  SetRange2(aT1: number, aT2: number): void;

  // IntTools_EdgeEdge.SetFuzzyValue (method)
  SetFuzzyValue(theFuzz: number): void;

  // IntTools_EdgeEdge.Perform (method)
  Perform(): void;

  // IntTools_EdgeEdge.IsDone (method)
  IsDone(): boolean;

  // IntTools_EdgeEdge.FuzzyValue (method)
  FuzzyValue(): number;

  // IntTools_EdgeEdge.CommonParts (method)
  CommonParts(): NCollection_Sequence_IntTools_CommonPrt;

  // IntTools_EdgeEdge.UseQuickCoincidenceCheck (method)
  UseQuickCoincidenceCheck(bFlag: boolean): void;

  // IntTools_EdgeEdge.IsCoincidenceCheckedQuickly (method)
  IsCoincidenceCheckedQuickly(): boolean;

  // IntTools_EdgeEdge.delete (method)
  delete(): void;

  // IntTools_EdgeEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_EdgeFace: declare class IntTools_EdgeFace

  // IntTools_EdgeFace.constructor (constructor)
  constructor();

  // IntTools_EdgeFace.SetEdge (method)
  SetEdge(theEdge: TopoDS_Edge): void;

  // IntTools_EdgeFace.Edge (method)
  Edge(): TopoDS_Edge;

  // IntTools_EdgeFace.SetFace (method)
  SetFace(theFace: TopoDS_Face): void;

  // IntTools_EdgeFace.Face (method)
  Face(): TopoDS_Face;

  // IntTools_EdgeFace.SetRange (method)
  SetRange(theRange: IntTools_Range): void;
  SetRange(theFirst: number, theLast: number): void;

  // IntTools_EdgeFace.Range (method)
  Range(): IntTools_Range;

  // IntTools_EdgeFace.SetContext (method)
  SetContext(theContext: IntTools_Context): void;

  // IntTools_EdgeFace.Context (method)
  Context(): IntTools_Context;

  // IntTools_EdgeFace.SetFuzzyValue (method)
  SetFuzzyValue(theFuzz: number): void;

  // IntTools_EdgeFace.FuzzyValue (method)
  FuzzyValue(): number;

  // IntTools_EdgeFace.UseQuickCoincidenceCheck (method)
  UseQuickCoincidenceCheck(theFlag: boolean): void;

  // IntTools_EdgeFace.IsCoincidenceCheckedQuickly (method)
  IsCoincidenceCheckedQuickly(): boolean;

  // IntTools_EdgeFace.Perform (method)
  Perform(): void;

  // IntTools_EdgeFace.IsDone (method)
  IsDone(): boolean;

  // IntTools_EdgeFace.ErrorStatus (method)
  ErrorStatus(): number;

  // IntTools_EdgeFace.CommonParts (method)
  CommonParts(): NCollection_Sequence_IntTools_CommonPrt;

  // IntTools_EdgeFace.MinimalDistance (method)
  MinimalDistance(): number;

  // IntTools_EdgeFace.delete (method)
  delete(): void;

  // IntTools_EdgeFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_FClass2d: declare class IntTools_FClass2d

  // IntTools_FClass2d.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face, Tol: number);

  // IntTools_FClass2d.Init (method)
  Init(F: TopoDS_Face, Tol: number): void;

  // IntTools_FClass2d.PerformInfinitePoint (method)
  PerformInfinitePoint(): TopAbs_State;

  // IntTools_FClass2d.Perform (method)
  Perform(Puv: gp_Pnt2d, RecadreOnPeriodic?: boolean): TopAbs_State;

  // IntTools_FClass2d.TestOnRestriction (method)
  TestOnRestriction(Puv: gp_Pnt2d, Tol: number, RecadreOnPeriodic?: boolean): TopAbs_State;

  // IntTools_FClass2d.IsHole (method)
  IsHole(): boolean;

  // IntTools_FClass2d.delete (method)
  delete(): void;

  // IntTools_FClass2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_FaceFace: declare class IntTools_FaceFace

  // IntTools_FaceFace.constructor (constructor)
  constructor();

  // IntTools_FaceFace.SetParameters (method)
  SetParameters(ApproxCurves: boolean, ComputeCurveOnS1: boolean, ComputeCurveOnS2: boolean, ApproximationTolerance: number): void;

  // IntTools_FaceFace.Perform (method)
  Perform(F1: TopoDS_Face, F2: TopoDS_Face, theToRunParallel?: boolean): void;

  // IntTools_FaceFace.IsDone (method)
  IsDone(): boolean;

  // IntTools_FaceFace.Lines (method)
  Lines(): NCollection_Sequence_IntTools_Curve;

  // IntTools_FaceFace.Points (method)
  Points(): NCollection_Sequence_IntTools_PntOn2Faces;

  // IntTools_FaceFace.Face1 (method)
  Face1(): TopoDS_Face;

  // IntTools_FaceFace.Face2 (method)
  Face2(): TopoDS_Face;

  // IntTools_FaceFace.TangentFaces (method)
  TangentFaces(): boolean;

  // IntTools_FaceFace.PrepareLines3D (method)
  PrepareLines3D(bToSplit?: boolean): void;

  // IntTools_FaceFace.SetList (method)
  SetList(ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;

  // IntTools_FaceFace.SetContext (method)
  SetContext(aContext: IntTools_Context): void;

  // IntTools_FaceFace.SetFuzzyValue (method)
  SetFuzzyValue(theFuzz: number): void;

  // IntTools_FaceFace.FuzzyValue (method)
  FuzzyValue(): number;

  // IntTools_FaceFace.Context (method)
  Context(): IntTools_Context;

  // IntTools_FaceFace.delete (method)
  delete(): void;

  // IntTools_FaceFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_MarkedRangeSet: declare class IntTools_MarkedRangeSet

  // IntTools_MarkedRangeSet.constructor (constructor)
  constructor();
  constructor(theSortedArray: NCollection_Array1_double, theInitFlag: number);
  constructor(theFirstBoundary: number, theLastBoundary: number, theInitFlag: number);

  // IntTools_MarkedRangeSet.SetBoundaries (method)
  SetBoundaries(theFirstBoundary: number, theLastBoundary: number, theInitFlag: number): void;

  // IntTools_MarkedRangeSet.SetRanges (method)
  SetRanges(theSortedArray: NCollection_Array1_double, theInitFlag: number): void;

  // IntTools_MarkedRangeSet.InsertRange (method)
  InsertRange(theRange: IntTools_Range, theFlag: number): boolean;
  InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number): boolean;
  InsertRange(theRange: IntTools_Range, theFlag: number, theIndex: number): boolean;
  InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number, theIndex: number): boolean;

  // IntTools_MarkedRangeSet.SetFlag (method)
  SetFlag(theIndex: number, theFlag: number): void;

  // IntTools_MarkedRangeSet.Flag (method)
  Flag(theIndex: number): number;

  // IntTools_MarkedRangeSet.GetIndex (method)
  GetIndex(theValue: number): number;
  GetIndex(theValue: number, UseLower: boolean): number;

  // IntTools_MarkedRangeSet.GetIndices (method)
  GetIndices(theValue: number): NCollection_Sequence_int;

  // IntTools_MarkedRangeSet.Length (method)
  Length(): number;

  // IntTools_MarkedRangeSet.Range (method)
  Range(theIndex: number): IntTools_Range;

  // IntTools_MarkedRangeSet.delete (method)
  delete(): void;

  // IntTools_MarkedRangeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_PntOn2Faces: declare class IntTools_PntOn2Faces

  // IntTools_PntOn2Faces.constructor (constructor)
  constructor();

  // IntTools_PntOn2Faces.SetValid (method)
  SetValid(bF: boolean): void;

  // IntTools_PntOn2Faces.IsValid (method)
  IsValid(): boolean;

  // IntTools_PntOn2Faces.delete (method)
  delete(): void;

  // IntTools_PntOn2Faces.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_Range: declare class IntTools_Range

  // IntTools_Range.constructor (constructor)
  constructor();
  constructor(aFirst: number, aLast: number);

  // IntTools_Range.SetFirst (method)
  SetFirst(aFirst: number): void;

  // IntTools_Range.SetLast (method)
  SetLast(aLast: number): void;

  // IntTools_Range.First (method)
  First(): number;

  // IntTools_Range.Last (method)
  Last(): number;

  // IntTools_Range.Range (method)
  Range(aFirst?: number, aLast?: number): { aFirst: number; aLast: number };

  // IntTools_Range.delete (method)
  delete(): void;

  // IntTools_Range.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_Root: declare class IntTools_Root

  // IntTools_Root.constructor (constructor)
  constructor();
  constructor(aRoot: number, aType: number);

  // IntTools_Root.SetRoot (method)
  SetRoot(aRoot: number): void;

  // IntTools_Root.SetType (method)
  SetType(aType: number): void;

  // IntTools_Root.SetStateBefore (method)
  SetStateBefore(aState: TopAbs_State): void;

  // IntTools_Root.SetStateAfter (method)
  SetStateAfter(aState: TopAbs_State): void;

  // IntTools_Root.SetLayerHeight (method)
  SetLayerHeight(aHeight: number): void;

  // IntTools_Root.SetInterval (method)
  SetInterval(t1: number, t2: number, f1: number, f2: number): void;

  // IntTools_Root.Root (method)
  Root(): number;

  // IntTools_Root.Type (method)
  Type(): number;

  // IntTools_Root.StateBefore (method)
  StateBefore(): TopAbs_State;

  // IntTools_Root.StateAfter (method)
  StateAfter(): TopAbs_State;

  // IntTools_Root.LayerHeight (method)
  LayerHeight(): number;

  // IntTools_Root.IsValid (method)
  IsValid(): boolean;

  // IntTools_Root.Interval (method)
  Interval(t1?: number, t2?: number, f1?: number, f2?: number): { t1: number; t2: number; f1: number; f2: number };

  // IntTools_Root.delete (method)
  delete(): void;

  // IntTools_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_ShrunkRange: declare class IntTools_ShrunkRange

  // IntTools_ShrunkRange.constructor (constructor)
  constructor();

  // IntTools_ShrunkRange.SetData (method)
  SetData(aE: TopoDS_Edge, aT1: number, aT2: number, aV1: TopoDS_Vertex, aV2: TopoDS_Vertex): void;

  // IntTools_ShrunkRange.SetContext (method)
  SetContext(aCtx: IntTools_Context): void;

  // IntTools_ShrunkRange.Context (method)
  Context(): IntTools_Context;

  // IntTools_ShrunkRange.SetShrunkRange (method)
  SetShrunkRange(aT1: number, aT2: number): void;

  // IntTools_ShrunkRange.ShrunkRange (method)
  ShrunkRange(aT1?: number, aT2?: number): { aT1: number; aT2: number };

  // IntTools_ShrunkRange.BndBox (method)
  BndBox(): Bnd_Box;

  // IntTools_ShrunkRange.Edge (method)
  Edge(): TopoDS_Edge;

  // IntTools_ShrunkRange.Perform (method)
  Perform(): void;

  // IntTools_ShrunkRange.IsDone (method)
  IsDone(): boolean;

  // IntTools_ShrunkRange.IsSplittable (method)
  IsSplittable(): boolean;

  // IntTools_ShrunkRange.Length (method)
  Length(): number;

  // IntTools_ShrunkRange.delete (method)
  delete(): void;

  // IntTools_ShrunkRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_SurfaceRangeLocalizeData: declare class IntTools_SurfaceRangeLocalizeData

  // IntTools_SurfaceRangeLocalizeData.constructor (constructor)
  constructor();
  constructor(Other: IntTools_SurfaceRangeLocalizeData);
  constructor(theNbSampleU: number, theNbSampleV: number, theMinRangeU: number, theMinRangeV: number);

  // IntTools_SurfaceRangeLocalizeData.Assign (method)
  Assign(Other: IntTools_SurfaceRangeLocalizeData): IntTools_SurfaceRangeLocalizeData;

  // IntTools_SurfaceRangeLocalizeData.GetNbSampleU (method)
  GetNbSampleU(): number;

  // IntTools_SurfaceRangeLocalizeData.GetNbSampleV (method)
  GetNbSampleV(): number;

  // IntTools_SurfaceRangeLocalizeData.GetMinRangeU (method)
  GetMinRangeU(): number;

  // IntTools_SurfaceRangeLocalizeData.GetMinRangeV (method)
  GetMinRangeV(): number;

  // IntTools_SurfaceRangeLocalizeData.AddOutRange (method)
  AddOutRange(theRange: IntTools_SurfaceRangeSample): void;

  // IntTools_SurfaceRangeLocalizeData.AddBox (method)
  AddBox(theRange: IntTools_SurfaceRangeSample, theBox: Bnd_Box): void;

  // IntTools_SurfaceRangeLocalizeData.FindBox (method)
  FindBox(theRange: IntTools_SurfaceRangeSample, theBox: Bnd_Box): boolean;

  // IntTools_SurfaceRangeLocalizeData.IsRangeOut (method)
  IsRangeOut(theRange: IntTools_SurfaceRangeSample): boolean;

  // IntTools_SurfaceRangeLocalizeData.ListRangeOut (method)
  ListRangeOut(theList: NCollection_List_IntTools_SurfaceRangeSample): void;

  // IntTools_SurfaceRangeLocalizeData.RemoveRangeOutAll (method)
  RemoveRangeOutAll(): void;

  // IntTools_SurfaceRangeLocalizeData.SetGridDeflection (method)
  SetGridDeflection(theDeflection: number): void;

  // IntTools_SurfaceRangeLocalizeData.GetGridDeflection (method)
  GetGridDeflection(): number;

  // IntTools_SurfaceRangeLocalizeData.SetRangeUGrid (method)
  SetRangeUGrid(theNbUGrid: number): void;

  // IntTools_SurfaceRangeLocalizeData.GetRangeUGrid (method)
  GetRangeUGrid(): number;

  // IntTools_SurfaceRangeLocalizeData.SetUParam (method)
  SetUParam(theIndex: number, theUParam: number): void;

  // IntTools_SurfaceRangeLocalizeData.GetUParam (method)
  GetUParam(theIndex: number): number;

  // IntTools_SurfaceRangeLocalizeData.SetRangeVGrid (method)
  SetRangeVGrid(theNbVGrid: number): void;

  // IntTools_SurfaceRangeLocalizeData.GetRangeVGrid (method)
  GetRangeVGrid(): number;

  // IntTools_SurfaceRangeLocalizeData.SetVParam (method)
  SetVParam(theIndex: number, theVParam: number): void;

  // IntTools_SurfaceRangeLocalizeData.GetVParam (method)
  GetVParam(theIndex: number): number;

  // IntTools_SurfaceRangeLocalizeData.SetGridPoint (method)
  SetGridPoint(theUIndex: number, theVIndex: number, thePoint: gp_Pnt): void;

  // IntTools_SurfaceRangeLocalizeData.GetGridPoint (method)
  GetGridPoint(theUIndex: number, theVIndex: number): gp_Pnt;

  // IntTools_SurfaceRangeLocalizeData.SetFrame (method)
  SetFrame(theUMin: number, theUMax: number, theVMin: number, theVMax: number): void;

  // IntTools_SurfaceRangeLocalizeData.GetNBUPointsInFrame (method)
  GetNBUPointsInFrame(): number;

  // IntTools_SurfaceRangeLocalizeData.GetNBVPointsInFrame (method)
  GetNBVPointsInFrame(): number;

  // IntTools_SurfaceRangeLocalizeData.GetPointInFrame (method)
  GetPointInFrame(theUIndex: number, theVIndex: number): gp_Pnt;

  // IntTools_SurfaceRangeLocalizeData.GetUParamInFrame (method)
  GetUParamInFrame(theIndex: number): number;

  // IntTools_SurfaceRangeLocalizeData.GetVParamInFrame (method)
  GetVParamInFrame(theIndex: number): number;

  // IntTools_SurfaceRangeLocalizeData.ClearGrid (method)
  ClearGrid(): void;

  // IntTools_SurfaceRangeLocalizeData.delete (method)
  delete(): void;

  // IntTools_SurfaceRangeLocalizeData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_SurfaceRangeSample: declare class IntTools_SurfaceRangeSample

  // IntTools_SurfaceRangeSample.constructor (constructor)
  constructor();
  constructor(Other: IntTools_SurfaceRangeSample);
  constructor(theRangeU: IntTools_CurveRangeSample, theRangeV: IntTools_CurveRangeSample);
  constructor(theIndexU: number, theDepthU: number, theIndexV: number, theDepthV: number);

  // IntTools_SurfaceRangeSample.Assign (method)
  Assign(Other: IntTools_SurfaceRangeSample): IntTools_SurfaceRangeSample;

  // IntTools_SurfaceRangeSample.SetRanges (method)
  SetRanges(theRangeU: IntTools_CurveRangeSample, theRangeV: IntTools_CurveRangeSample): void;

  // IntTools_SurfaceRangeSample.GetRanges (method)
  GetRanges(theRangeU: IntTools_CurveRangeSample, theRangeV: IntTools_CurveRangeSample): void;

  // IntTools_SurfaceRangeSample.SetIndexes (method)
  SetIndexes(theIndexU: number, theIndexV: number): void;

  // IntTools_SurfaceRangeSample.GetIndexes (method)
  GetIndexes(theIndexU?: number, theIndexV?: number): { theIndexU: number; theIndexV: number };

  // IntTools_SurfaceRangeSample.GetDepths (method)
  GetDepths(theDepthU?: number, theDepthV?: number): { theDepthU: number; theDepthV: number };

  // IntTools_SurfaceRangeSample.SetSampleRangeU (method)
  SetSampleRangeU(theRangeSampleU: IntTools_CurveRangeSample): void;

  // IntTools_SurfaceRangeSample.GetSampleRangeU (method)
  GetSampleRangeU(): IntTools_CurveRangeSample;

  // IntTools_SurfaceRangeSample.SetSampleRangeV (method)
  SetSampleRangeV(theRangeSampleV: IntTools_CurveRangeSample): void;

  // IntTools_SurfaceRangeSample.GetSampleRangeV (method)
  GetSampleRangeV(): IntTools_CurveRangeSample;

  // IntTools_SurfaceRangeSample.SetIndexU (method)
  SetIndexU(theIndexU: number): void;

  // IntTools_SurfaceRangeSample.GetIndexU (method)
  GetIndexU(): number;

  // IntTools_SurfaceRangeSample.SetIndexV (method)
  SetIndexV(theIndexV: number): void;

  // IntTools_SurfaceRangeSample.GetIndexV (method)
  GetIndexV(): number;

  // IntTools_SurfaceRangeSample.SetDepthU (method)
  SetDepthU(theDepthU: number): void;

  // IntTools_SurfaceRangeSample.GetDepthU (method)
  GetDepthU(): number;

  // IntTools_SurfaceRangeSample.SetDepthV (method)
  SetDepthV(theDepthV: number): void;

  // IntTools_SurfaceRangeSample.GetDepthV (method)
  GetDepthV(): number;

  // IntTools_SurfaceRangeSample.GetRangeU (method)
  GetRangeU(theFirstU: number, theLastU: number, theNbSampleU: number): IntTools_Range;

  // IntTools_SurfaceRangeSample.GetRangeV (method)
  GetRangeV(theFirstV: number, theLastV: number, theNbSampleV: number): IntTools_Range;

  // IntTools_SurfaceRangeSample.IsEqual (method)
  IsEqual(Other: IntTools_SurfaceRangeSample): boolean;

  // IntTools_SurfaceRangeSample.GetRangeIndexUDeeper (method)
  GetRangeIndexUDeeper(theNbSampleU: number): number;

  // IntTools_SurfaceRangeSample.GetRangeIndexVDeeper (method)
  GetRangeIndexVDeeper(theNbSampleV: number): number;

  // IntTools_SurfaceRangeSample.delete (method)
  delete(): void;

  // IntTools_SurfaceRangeSample.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_Tools: declare class IntTools_Tools

  // IntTools_Tools.constructor (constructor)
  constructor();

  // IntTools_Tools.ComputeVV (method)
  static ComputeVV(V1: TopoDS_Vertex, V2: TopoDS_Vertex): number;

  // IntTools_Tools.HasInternalEdge (method)
  static HasInternalEdge(aW: TopoDS_Wire): boolean;

  // IntTools_Tools.MakeFaceFromWireAndFace (method)
  static MakeFaceFromWireAndFace(aW: TopoDS_Wire, aF: TopoDS_Face, aFNew: TopoDS_Face): void;

  // IntTools_Tools.ClassifyPointByFace (method)
  static ClassifyPointByFace(aF: TopoDS_Face, P: gp_Pnt2d): TopAbs_State;

  // IntTools_Tools.IsVertex (method)
  static IsVertex(aCmnPrt: IntTools_CommonPrt): boolean;
  static IsVertex(E: TopoDS_Edge, t: number): boolean;
  static IsVertex(E: TopoDS_Edge, V: TopoDS_Vertex, t: number): boolean;
  static IsVertex(aP: gp_Pnt, aTolPV: number, aV: TopoDS_Vertex): boolean;

  // IntTools_Tools.IsMiddlePointsEqual (method)
  static IsMiddlePointsEqual(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

  // IntTools_Tools.IntermediatePoint (method)
  static IntermediatePoint(aFirst: number, aLast: number): number;

  // IntTools_Tools.SplitCurve (method)
  static SplitCurve(aC: IntTools_Curve, aS: NCollection_Sequence_IntTools_Curve): number;

  // IntTools_Tools.RejectLines (method)
  static RejectLines(aSIn: NCollection_Sequence_IntTools_Curve, aSOut: NCollection_Sequence_IntTools_Curve): void;

  // IntTools_Tools.IsDirsCoinside (method)
  static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir): boolean;
  static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir, aTol: number): boolean;

  // IntTools_Tools.IsClosed (method)
  static IsClosed(aC: Geom_Curve): boolean;

  // IntTools_Tools.CurveTolerance (method)
  static CurveTolerance(aC: Geom_Curve, aTolBase: number): number;

  // IntTools_Tools.CheckCurve (method)
  static CheckCurve(theCurve: IntTools_Curve, theBox: Bnd_Box): boolean;

  // IntTools_Tools.IsOnPave (method)
  static IsOnPave(theT: number, theRange: IntTools_Range, theTol: number): boolean;

  // IntTools_Tools.VertexParameters (method)
  static VertexParameters(theCP: IntTools_CommonPrt, theT1?: number, theT2?: number): { theT1: number; theT2: number };

  // IntTools_Tools.VertexParameter (method)
  static VertexParameter(theCP: IntTools_CommonPrt, theT?: number): { theT: number };

  // IntTools_Tools.IsOnPave1 (method)
  static IsOnPave1(theT: number, theRange: IntTools_Range, theTol: number): boolean;

  // IntTools_Tools.IsInRange (method)
  static IsInRange(theRRef: IntTools_Range, theR: IntTools_Range, theTol: number): boolean;

  // IntTools_Tools.SegPln (method)
  static SegPln(theLin: gp_Lin, theTLin1: number, theTLin2: number, theTolLin: number, thePln: gp_Pln, theTolPln: number, theP: gp_Pnt, theT?: number, theTolP?: number, theTmin?: number, theTmax?: number): { returnValue: number; theT: number; theTolP: number; theTmin: number; theTmax: number };

  // IntTools_Tools.ComputeTolerance (method)
  static ComputeTolerance(theCurve3D: Geom_Curve, theCurve2D: Geom2d_Curve, theSurf: Geom_Surface, theFirst: number, theLast: number, theMaxDist: number, theMaxPar: number, theTolRange: number, theToRunParallel: boolean): { returnValue: boolean; theMaxDist: number; theMaxPar: number };

  // IntTools_Tools.ComputeIntRange (method)
  static ComputeIntRange(theTol1: number, theTol2: number, theAngle: number): number;

  // IntTools_Tools.delete (method)
  delete(): void;

  // IntTools_Tools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_TopolTool: declare class IntTools_TopolTool extends Adaptor3d_TopolTool

  // IntTools_TopolTool.constructor (constructor)
  constructor();
  constructor(theSurface: Adaptor3d_Surface);

  // IntTools_TopolTool.Initialize (method)
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;

  // IntTools_TopolTool.ComputeSamplePoints (method)
  ComputeSamplePoints(): void;

  // IntTools_TopolTool.NbSamplesU (method)
  NbSamplesU(): number;

  // IntTools_TopolTool.NbSamplesV (method)
  NbSamplesV(): number;

  // IntTools_TopolTool.NbSamples (method)
  NbSamples(): number;

  // IntTools_TopolTool.SamplePoint (method)
  SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

  // IntTools_TopolTool.SamplePnts (method)
  SamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

  // IntTools_TopolTool.get_type_name (method)
  static get_type_name(): string;

  // IntTools_TopolTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntTools_TopolTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntTools_TopolTool.delete (method)
  delete(): void;

  // IntTools_TopolTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_WLineTool: declare class IntTools_WLineTool

  // IntTools_WLineTool.constructor (constructor)
  constructor();

  // IntTools_WLineTool.NotUseSurfacesForApprox (method)
  static NotUseSurfacesForApprox(aF1: TopoDS_Face, aF2: TopoDS_Face, WL: IntPatch_WLine, ifprm: number, ilprm: number): boolean;

  // IntTools_WLineTool.DecompositionOfWLine (method)
  static DecompositionOfWLine(theWLine: IntPatch_WLine, theSurface1: GeomAdaptor_Surface, theSurface2: GeomAdaptor_Surface, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theLConstructor: GeomInt_LineConstructor, theAvoidLConstructor: boolean, theTol: number, theNewLines: NCollection_Sequence_handle_IntPatch_Line, argNo9: IntTools_Context): boolean;

  // IntTools_WLineTool.delete (method)
  delete(): void;

  // IntTools_WLineTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntTools_ListOfCurveRangeSample: NCollection_List_IntTools_CurveRangeSample

IntTools_ListOfSurfaceRangeSample: NCollection_List_IntTools_SurfaceRangeSample

IntTools_SequenceOfCommonPrts: NCollection_Sequence_IntTools_CommonPrt

IntTools_SequenceOfCurves: NCollection_Sequence_IntTools_Curve

IntTools_SequenceOfPntOn2Faces: NCollection_Sequence_IntTools_PntOn2Faces

IntTools_SequenceOfRanges: NCollection_Sequence_IntTools_Range

IntTools_SequenceOfRoots: NCollection_Sequence_IntTools_Root
