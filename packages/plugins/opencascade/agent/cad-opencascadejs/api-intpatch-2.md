# libcascade — IntPatch (2)

13 top-level symbols. Signatures are verbatim typescript.

IntPatch_SpecialPoints: declare class IntPatch_SpecialPoints

  // IntPatch_SpecialPoints.constructor (constructor)
  constructor();

  // IntPatch_SpecialPoints.AddCrossUVIsoPoint (method)
  static AddCrossUVIsoPoint(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theTol3d: number, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;

  // IntPatch_SpecialPoints.AddPointOnUorVIso (method)
  static AddPointOnUorVIso(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theIsU: boolean, theIsoParameter: number, theToler: math_VectorBase_double, theInitPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;

  // IntPatch_SpecialPoints.AddSingularPole (method)
  static AddSingularPole(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, thePtIso: IntSurf_PntOn2S, theVertex: IntPatch_Point, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean, theIsReqRefCheck: boolean): boolean;

  // IntPatch_SpecialPoints.ContinueAfterSpecialPoint (method)
  static ContinueAfterSpecialPoint(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theSPType: IntPatch_SpecPntType, theTol2D: number, theNewPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;

  // IntPatch_SpecialPoints.AdjustPointAndVertex (method)
  static AdjustPointAndVertex(theRefPoint: IntSurf_PntOn2S, theArrPeriods: [number, number, number, number], theNewPoint: IntSurf_PntOn2S, theVertex: IntPatch_Point): void;

  // IntPatch_SpecialPoints.delete (method)
  delete(): void;

  // IntPatch_SpecialPoints.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_TheIWLineOfTheIWalking: declare class IntPatch_TheIWLineOfTheIWalking extends Standard_Transient

  // IntPatch_TheIWLineOfTheIWalking.constructor (constructor)
  constructor(theAllocator?: unknown);

  // IntPatch_TheIWLineOfTheIWalking.Reverse (method)
  Reverse(): void;

  // IntPatch_TheIWLineOfTheIWalking.Cut (method)
  Cut(Index: number): void;

  // IntPatch_TheIWLineOfTheIWalking.AddPoint (method)
  AddPoint(P: IntSurf_PntOn2S): void;

  // IntPatch_TheIWLineOfTheIWalking.AddStatusFirst (method)
  AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
  AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  // IntPatch_TheIWLineOfTheIWalking.AddStatusFirstLast (method)
  AddStatusFirstLast(Closed: boolean, HasFirst: boolean, HasLast: boolean): void;

  // IntPatch_TheIWLineOfTheIWalking.AddStatusLast (method)
  AddStatusLast(HasLast: boolean): void;
  AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  // IntPatch_TheIWLineOfTheIWalking.AddIndexPassing (method)
  AddIndexPassing(Index: number): void;

  // IntPatch_TheIWLineOfTheIWalking.SetTangentVector (method)
  SetTangentVector(V: gp_Vec, Index: number): void;

  // IntPatch_TheIWLineOfTheIWalking.SetTangencyAtBegining (method)
  SetTangencyAtBegining(IsTangent: boolean): void;

  // IntPatch_TheIWLineOfTheIWalking.SetTangencyAtEnd (method)
  SetTangencyAtEnd(IsTangent: boolean): void;

  // IntPatch_TheIWLineOfTheIWalking.NbPoints (method)
  NbPoints(): number;

  // IntPatch_TheIWLineOfTheIWalking.Value (method)
  Value(Index: number): IntSurf_PntOn2S;

  // IntPatch_TheIWLineOfTheIWalking.Line (method)
  Line(): IntSurf_LineOn2S;

  // IntPatch_TheIWLineOfTheIWalking.IsClosed (method)
  IsClosed(): boolean;

  // IntPatch_TheIWLineOfTheIWalking.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntPatch_TheIWLineOfTheIWalking.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntPatch_TheIWLineOfTheIWalking.FirstPoint (method)
  FirstPoint(): IntSurf_PathPoint;

  // IntPatch_TheIWLineOfTheIWalking.FirstPointIndex (method)
  FirstPointIndex(): number;

  // IntPatch_TheIWLineOfTheIWalking.LastPoint (method)
  LastPoint(): IntSurf_PathPoint;

  // IntPatch_TheIWLineOfTheIWalking.LastPointIndex (method)
  LastPointIndex(): number;

  // IntPatch_TheIWLineOfTheIWalking.NbPassingPoint (method)
  NbPassingPoint(): number;

  // IntPatch_TheIWLineOfTheIWalking.PassingPoint (method)
  PassingPoint(Index: number, IndexLine?: number, IndexPnts?: number): { IndexLine: number; IndexPnts: number };

  // IntPatch_TheIWLineOfTheIWalking.TangentVector (method)
  TangentVector(Index?: number): { returnValue: gp_Vec; Index: number; [Symbol.dispose](): void };

  // IntPatch_TheIWLineOfTheIWalking.IsTangentAtBegining (method)
  IsTangentAtBegining(): boolean;

  // IntPatch_TheIWLineOfTheIWalking.IsTangentAtEnd (method)
  IsTangentAtEnd(): boolean;

  // IntPatch_TheIWLineOfTheIWalking.get_type_name (method)
  static get_type_name(): string;

  // IntPatch_TheIWLineOfTheIWalking.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntPatch_TheIWLineOfTheIWalking.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntPatch_TheIWLineOfTheIWalking.delete (method)
  delete(): void;

  // IntPatch_TheIWLineOfTheIWalking.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_TheIWalking: declare class IntPatch_TheIWalking

  // IntPatch_TheIWalking.constructor (constructor)
  constructor(Epsilon: number, Deflection: number, Step: number, theToFillHoles?: boolean);

  // IntPatch_TheIWalking.SetTolerance (method)
  SetTolerance(Epsilon: number, Deflection: number, Step: number): void;

  // IntPatch_TheIWalking.Perform (method)
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;

  // IntPatch_TheIWalking.IsDone (method)
  IsDone(): boolean;

  // IntPatch_TheIWalking.NbLines (method)
  NbLines(): number;

  // IntPatch_TheIWalking.Value (method)
  Value(Index: number): IntPatch_TheIWLineOfTheIWalking;

  // IntPatch_TheIWalking.NbSinglePnts (method)
  NbSinglePnts(): number;

  // IntPatch_TheIWalking.SinglePnt (method)
  SinglePnt(Index: number): IntSurf_PathPoint;

  // IntPatch_TheIWalking.delete (method)
  delete(): void;

  // IntPatch_TheIWalking.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_ThePathPointOfTheSOnBounds: declare class IntPatch_ThePathPointOfTheSOnBounds

  // IntPatch_ThePathPointOfTheSOnBounds.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number);
  constructor(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number);

  // IntPatch_ThePathPointOfTheSOnBounds.SetValue (method)
  SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;

  // IntPatch_ThePathPointOfTheSOnBounds.Value (method)
  Value(): gp_Pnt;

  // IntPatch_ThePathPointOfTheSOnBounds.Tolerance (method)
  Tolerance(): number;

  // IntPatch_ThePathPointOfTheSOnBounds.IsNew (method)
  IsNew(): boolean;

  // IntPatch_ThePathPointOfTheSOnBounds.Vertex (method)
  Vertex(): Adaptor3d_HVertex;

  // IntPatch_ThePathPointOfTheSOnBounds.Arc (method)
  Arc(): Adaptor2d_Curve2d;

  // IntPatch_ThePathPointOfTheSOnBounds.Parameter (method)
  Parameter(): number;

  // IntPatch_ThePathPointOfTheSOnBounds.delete (method)
  delete(): void;

  // IntPatch_ThePathPointOfTheSOnBounds.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_TheSOnBounds: declare class IntPatch_TheSOnBounds

  // IntPatch_TheSOnBounds.constructor (constructor)
  constructor();

  // IntPatch_TheSOnBounds.Perform (method)
  Perform(F: IntPatch_ArcFunction, Domain: Adaptor3d_TopolTool, TolBoundary: number, TolTangency: number, RecheckOnRegularity: boolean): void;

  // IntPatch_TheSOnBounds.IsDone (method)
  IsDone(): boolean;

  // IntPatch_TheSOnBounds.AllArcSolution (method)
  AllArcSolution(): boolean;

  // IntPatch_TheSOnBounds.NbPoints (method)
  NbPoints(): number;

  // IntPatch_TheSOnBounds.Point (method)
  Point(Index: number): IntPatch_ThePathPointOfTheSOnBounds;

  // IntPatch_TheSOnBounds.NbSegments (method)
  NbSegments(): number;

  // IntPatch_TheSOnBounds.Segment (method)
  Segment(Index: number): IntPatch_TheSegmentOfTheSOnBounds;

  // IntPatch_TheSOnBounds.delete (method)
  delete(): void;

  // IntPatch_TheSOnBounds.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_TheSearchInside: declare class IntPatch_TheSearchInside

  // IntPatch_TheSearchInside.constructor (constructor)
  constructor();
  constructor(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number);

  // IntPatch_TheSearchInside.Perform (method)
  Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
  Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;

  // IntPatch_TheSearchInside.IsDone (method)
  IsDone(): boolean;

  // IntPatch_TheSearchInside.NbPoints (method)
  NbPoints(): number;

  // IntPatch_TheSearchInside.Value (method)
  Value(Index: number): IntSurf_InteriorPoint;

  // IntPatch_TheSearchInside.delete (method)
  delete(): void;

  // IntPatch_TheSearchInside.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_TheSegmentOfTheSOnBounds: declare class IntPatch_TheSegmentOfTheSOnBounds

  // IntPatch_TheSegmentOfTheSOnBounds.constructor (constructor)
  constructor();

  // IntPatch_TheSegmentOfTheSOnBounds.SetValue (method)
  SetValue(A: Adaptor2d_Curve2d): void;

  // IntPatch_TheSegmentOfTheSOnBounds.SetLimitPoint (method)
  SetLimitPoint(V: IntPatch_ThePathPointOfTheSOnBounds, First: boolean): void;

  // IntPatch_TheSegmentOfTheSOnBounds.Curve (method)
  Curve(): Adaptor2d_Curve2d;

  // IntPatch_TheSegmentOfTheSOnBounds.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntPatch_TheSegmentOfTheSOnBounds.FirstPoint (method)
  FirstPoint(): IntPatch_ThePathPointOfTheSOnBounds;

  // IntPatch_TheSegmentOfTheSOnBounds.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntPatch_TheSegmentOfTheSOnBounds.LastPoint (method)
  LastPoint(): IntPatch_ThePathPointOfTheSOnBounds;

  // IntPatch_TheSegmentOfTheSOnBounds.delete (method)
  delete(): void;

  // IntPatch_TheSegmentOfTheSOnBounds.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_TheSurfFunction: declare class IntPatch_TheSurfFunction extends math_FunctionSetWithDerivatives

  // IntPatch_TheSurfFunction.constructor (constructor)
  constructor();
  constructor(IS: IntSurf_Quadric);
  constructor(PS: Adaptor3d_Surface, IS: IntSurf_Quadric);

  // IntPatch_TheSurfFunction.Set (method)
  Set(PS: Adaptor3d_Surface): void;
  Set(Tolerance: number): void;

  // IntPatch_TheSurfFunction.SetImplicitSurface (method)
  SetImplicitSurface(IS: IntSurf_Quadric): void;

  // IntPatch_TheSurfFunction.NbVariables (method)
  NbVariables(): number;

  // IntPatch_TheSurfFunction.NbEquations (method)
  NbEquations(): number;

  // IntPatch_TheSurfFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // IntPatch_TheSurfFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // IntPatch_TheSurfFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // IntPatch_TheSurfFunction.Root (method)
  Root(): number;

  // IntPatch_TheSurfFunction.Tolerance (method)
  Tolerance(): number;

  // IntPatch_TheSurfFunction.Point (method)
  Point(): gp_Pnt;

  // IntPatch_TheSurfFunction.IsTangent (method)
  IsTangent(): boolean;

  // IntPatch_TheSurfFunction.Direction3d (method)
  Direction3d(): gp_Vec;

  // IntPatch_TheSurfFunction.Direction2d (method)
  Direction2d(): gp_Dir2d;

  // IntPatch_TheSurfFunction.PSurface (method)
  PSurface(): Adaptor3d_Surface;

  // IntPatch_TheSurfFunction.ISurface (method)
  ISurface(): IntSurf_Quadric;

  // IntPatch_TheSurfFunction.delete (method)
  delete(): void;

  // IntPatch_TheSurfFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_WLine: declare class IntPatch_WLine extends IntPatch_PointLine

  // IntPatch_WLine.constructor (constructor)
  constructor(Line: IntSurf_LineOn2S, Tang: boolean);
  constructor(Line: IntSurf_LineOn2S, Tang: boolean, Trans1: IntSurf_TypeTrans, Trans2: IntSurf_TypeTrans);
  constructor(Line: IntSurf_LineOn2S, Tang: boolean, Situ1: IntSurf_Situation, Situ2: IntSurf_Situation);

  // IntPatch_WLine.AddVertex (method)
  AddVertex(Pnt: IntPatch_Point, theIsPrepend?: boolean): void;

  // IntPatch_WLine.SetPoint (method)
  SetPoint(Index: number, Pnt: IntPatch_Point): void;

  // IntPatch_WLine.Replace (method)
  Replace(Index: number, Pnt: IntPatch_Point): void;

  // IntPatch_WLine.SetFirstPoint (method)
  SetFirstPoint(IndFirst: number): void;

  // IntPatch_WLine.SetLastPoint (method)
  SetLastPoint(IndLast: number): void;

  // IntPatch_WLine.NbPnts (method)
  NbPnts(): number;

  // IntPatch_WLine.Point (method)
  Point(Index: number): IntSurf_PntOn2S;

  // IntPatch_WLine.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntPatch_WLine.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntPatch_WLine.FirstPoint (method)
  FirstPoint(): IntPatch_Point;
  FirstPoint(Indfirst?: number): { returnValue: IntPatch_Point; Indfirst: number; [Symbol.dispose](): void };

  // IntPatch_WLine.LastPoint (method)
  LastPoint(): IntPatch_Point;
  LastPoint(Indlast?: number): { returnValue: IntPatch_Point; Indlast: number; [Symbol.dispose](): void };

  // IntPatch_WLine.NbVertex (method)
  NbVertex(): number;

  // IntPatch_WLine.Vertex (method)
  Vertex(Index: number): IntPatch_Point;

  // IntPatch_WLine.ChangeVertex (method)
  ChangeVertex(Index: number): IntPatch_Point;

  // IntPatch_WLine.ComputeVertexParameters (method)
  ComputeVertexParameters(Tol: number): void;

  // IntPatch_WLine.Curve (method)
  Curve(): IntSurf_LineOn2S;

  // IntPatch_WLine.IsOutSurf1Box (method)
  IsOutSurf1Box(P1: gp_Pnt2d): boolean;

  // IntPatch_WLine.IsOutSurf2Box (method)
  IsOutSurf2Box(P2: gp_Pnt2d): boolean;

  // IntPatch_WLine.IsOutBox (method)
  IsOutBox(P: gp_Pnt): boolean;

  // IntPatch_WLine.SetPeriod (method)
  SetPeriod(pu1: number, pv1: number, pu2: number, pv2: number): void;

  // IntPatch_WLine.U1Period (method)
  U1Period(): number;

  // IntPatch_WLine.V1Period (method)
  V1Period(): number;

  // IntPatch_WLine.U2Period (method)
  U2Period(): number;

  // IntPatch_WLine.V2Period (method)
  V2Period(): number;

  // IntPatch_WLine.SetArcOnS1 (method)
  SetArcOnS1(A: Adaptor2d_Curve2d): void;

  // IntPatch_WLine.HasArcOnS1 (method)
  HasArcOnS1(): boolean;

  // IntPatch_WLine.GetArcOnS1 (method)
  GetArcOnS1(): Adaptor2d_Curve2d;

  // IntPatch_WLine.SetArcOnS2 (method)
  SetArcOnS2(A: Adaptor2d_Curve2d): void;

  // IntPatch_WLine.HasArcOnS2 (method)
  HasArcOnS2(): boolean;

  // IntPatch_WLine.GetArcOnS2 (method)
  GetArcOnS2(): Adaptor2d_Curve2d;

  // IntPatch_WLine.ClearVertexes (method)
  ClearVertexes(): void;

  // IntPatch_WLine.RemoveVertex (method)
  RemoveVertex(theIndex: number): void;

  // IntPatch_WLine.InsertVertexBefore (method)
  InsertVertexBefore(theIndex: number, thePnt: IntPatch_Point): void;

  // IntPatch_WLine.Dump (method)
  Dump(theMode: number): void;

  // IntPatch_WLine.EnablePurging (method)
  EnablePurging(theIsEnabled: boolean): void;

  // IntPatch_WLine.IsPurgingAllowed (method)
  IsPurgingAllowed(): boolean;

  // IntPatch_WLine.GetCreatingWay (method)
  GetCreatingWay(): IntPatch_WLine_IntPatch_WLType;

  // IntPatch_WLine.SetCreatingWayInfo (method)
  SetCreatingWayInfo(theAlgo: IntPatch_WLine_IntPatch_WLType): void;

  // IntPatch_WLine.get_type_name (method)
  static get_type_name(): string;

  // IntPatch_WLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntPatch_WLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntPatch_WLine.delete (method)
  delete(): void;

  // IntPatch_WLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_WLine_IntPatch_WLType: typeof IntPatch_WLine_IntPatch_WLType[keyof typeof IntPatch_WLine_IntPatch_WLType]

  readonly IntPatch_WLUnknown: 'IntPatch_WLUnknown'

  readonly IntPatch_WLImpImp: 'IntPatch_WLImpImp'

  readonly IntPatch_WLImpPrm: 'IntPatch_WLImpPrm'

  readonly IntPatch_WLPrmPrm: 'IntPatch_WLPrmPrm'

IntPatch_WLineTool: declare class IntPatch_WLineTool

  // IntPatch_WLineTool.constructor (constructor)
  constructor();

  // IntPatch_WLineTool.ComputePurgedWLine (method)
  static ComputePurgedWLine(theWLine: IntPatch_WLine, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theDom1: Adaptor3d_TopolTool, theDom2: Adaptor3d_TopolTool): IntPatch_WLine;

  // IntPatch_WLineTool.JoinWLines (method)
  static JoinWLines(theSlin: NCollection_Sequence_handle_IntPatch_Line, theSPnt: NCollection_Sequence_IntPatch_Point, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theTol3D: number): void;

  // IntPatch_WLineTool.ExtendTwoWLines (method)
  static ExtendTwoWLines(theSlin: NCollection_Sequence_handle_IntPatch_Line, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theToler3D: number, theArrPeriods: number, theBoxS1: Bnd_Box2d, theBoxS2: Bnd_Box2d, theListOfCriticalPoints: NCollection_List_gp_Pnt): void;

  // IntPatch_WLineTool.delete (method)
  delete(): void;

  // IntPatch_WLineTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPatch_SequenceOfLine: NCollection_Sequence_handle_IntPatch_Line

IntPatch_SequenceOfPoint: NCollection_Sequence_IntPatch_Point
