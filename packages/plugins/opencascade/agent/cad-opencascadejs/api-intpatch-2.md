# libcascade — IntPatch (2)

17 top-level symbols. Signatures are verbatim typescript.

IntPatch_PrmPrmIntersection: declare class IntPatch_PrmPrmIntersection

  constructor

  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
  Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;

  IsDone(): boolean;

  IsEmpty(): boolean;

  NbLines(): number;

  Line(Index: number): IntPatch_Line;

  NewLine(Caro1: Adaptor3d_Surface, Caro2: Adaptor3d_Surface, IndexLine: number, LowPoint: number, HighPoint: number, NbPoints: number): IntPatch_Line;

  GrilleInteger(ix: number, iy: number, iz: number): number;

  IntegerGrille(t: number, ix?: number, iy?: number, iz?: number): { ix: number; iy: number; iz: number };

  DansGrille(t: number): number;

  NbPointsGrille(): number;

  RemplitLin(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

  RemplitTri(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

  Remplit(a: number, b: number, c: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

  CodeReject(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number): number;

  PointDepart(S1: Adaptor3d_Surface, SU1: number, SV1: number, S2: Adaptor3d_Surface, SU2: number, SV2: number): { LineOn2S: IntSurf_LineOn2S; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_PrmPrmIntersection_T3Bits: declare class IntPatch_PrmPrmIntersection_T3Bits

  constructor

  Add(t: number): void;

  Val(t: number): number;

  Raz(t: number): void;

  ResetAnd(): void;

  And(Oth: IntPatch_PrmPrmIntersection_T3Bits, indiceprecedent?: number): { returnValue: number; indiceprecedent: number };

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_RstInt: declare class IntPatch_RstInt

  constructor

  static PutVertexOnLine(L: IntPatch_Line, Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, OtherSurf: Adaptor3d_Surface, OnFirst: boolean, Tol: number): void;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_SpecPntType: typeof IntPatch_SpecPntType[keyof typeof IntPatch_SpecPntType]

IntPatch_SpecialPoints: declare class IntPatch_SpecialPoints

  constructor

  static AddCrossUVIsoPoint(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theTol3d: number, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;

  static AddPointOnUorVIso(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theIsU: boolean, theIsoParameter: number, theToler: math_VectorBase_double, theInitPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;

  static AddSingularPole(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, thePtIso: IntSurf_PntOn2S, theVertex: IntPatch_Point, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean, theIsReqRefCheck: boolean): boolean;

  static ContinueAfterSpecialPoint(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theSPType: IntPatch_SpecPntType, theTol2D: number, theNewPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;

  static AdjustPointAndVertex(theRefPoint: IntSurf_PntOn2S, theArrPeriods: [number, number, number, number], theNewPoint: IntSurf_PntOn2S, theVertex: IntPatch_Point): void;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_TheIWLineOfTheIWalking: declare class IntPatch_TheIWLineOfTheIWalking extends Standard_Transient

  constructor

  Reverse(): void;

  Cut(Index: number): void;

  AddPoint(P: IntSurf_PntOn2S): void;

  AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
  AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
  AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
  AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  AddStatusFirstLast(Closed: boolean, HasFirst: boolean, HasLast: boolean): void;

  AddStatusLast(HasLast: boolean): void;
  AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
  AddStatusLast(HasLast: boolean): void;
  AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

  AddIndexPassing(Index: number): void;

  SetTangentVector(V: gp_Vec, Index: number): void;

  SetTangencyAtBegining(IsTangent: boolean): void;

  SetTangencyAtEnd(IsTangent: boolean): void;

  NbPoints(): number;

  Value(Index: number): IntSurf_PntOn2S;

  Line(): IntSurf_LineOn2S;

  IsClosed(): boolean;

  HasFirstPoint(): boolean;

  HasLastPoint(): boolean;

  FirstPoint(): IntSurf_PathPoint;

  FirstPointIndex(): number;

  LastPoint(): IntSurf_PathPoint;

  LastPointIndex(): number;

  NbPassingPoint(): number;

  PassingPoint(Index: number, IndexLine?: number, IndexPnts?: number): { IndexLine: number; IndexPnts: number };

  TangentVector(Index?: number): { returnValue: gp_Vec; Index: number; [Symbol.dispose](): void };

  IsTangentAtBegining(): boolean;

  IsTangentAtEnd(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_TheIWalking: declare class IntPatch_TheIWalking

  constructor

  SetTolerance(Epsilon: number, Deflection: number, Step: number): void;

  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
  Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;

  IsDone(): boolean;

  NbLines(): number;

  Value(Index: number): IntPatch_TheIWLineOfTheIWalking;

  NbSinglePnts(): number;

  SinglePnt(Index: number): IntSurf_PathPoint;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_ThePathPointOfTheSOnBounds: declare class IntPatch_ThePathPointOfTheSOnBounds

  constructor

  SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
  SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;

  Value(): gp_Pnt;

  Tolerance(): number;

  IsNew(): boolean;

  Vertex(): Adaptor3d_HVertex;

  Arc(): Adaptor2d_Curve2d;

  Parameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_TheSOnBounds: declare class IntPatch_TheSOnBounds

  constructor

  Perform(F: IntPatch_ArcFunction, Domain: Adaptor3d_TopolTool, TolBoundary: number, TolTangency: number, RecheckOnRegularity: boolean): void;

  IsDone(): boolean;

  AllArcSolution(): boolean;

  NbPoints(): number;

  Point(Index: number): IntPatch_ThePathPointOfTheSOnBounds;

  NbSegments(): number;

  Segment(Index: number): IntPatch_TheSegmentOfTheSOnBounds;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_TheSearchInside: declare class IntPatch_TheSearchInside

  constructor

  Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
  Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;
  Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
  Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;

  IsDone(): boolean;

  NbPoints(): number;

  Value(Index: number): IntSurf_InteriorPoint;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_TheSegmentOfTheSOnBounds: declare class IntPatch_TheSegmentOfTheSOnBounds

  constructor

  SetValue(A: Adaptor2d_Curve2d): void;

  SetLimitPoint(V: IntPatch_ThePathPointOfTheSOnBounds, First: boolean): void;

  Curve(): Adaptor2d_Curve2d;

  HasFirstPoint(): boolean;

  FirstPoint(): IntPatch_ThePathPointOfTheSOnBounds;

  HasLastPoint(): boolean;

  LastPoint(): IntPatch_ThePathPointOfTheSOnBounds;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_TheSurfFunction: declare class IntPatch_TheSurfFunction extends math_FunctionSetWithDerivatives

  constructor

  Set(PS: Adaptor3d_Surface): void;
  Set(Tolerance: number): void;
  Set(PS: Adaptor3d_Surface): void;
  Set(Tolerance: number): void;

  SetImplicitSurface(IS: IntSurf_Quadric): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Root(): number;

  Tolerance(): number;

  Point(): gp_Pnt;

  IsTangent(): boolean;

  Direction3d(): gp_Vec;

  Direction2d(): gp_Dir2d;

  PSurface(): Adaptor3d_Surface;

  ISurface(): IntSurf_Quadric;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_WLine: declare class IntPatch_WLine extends IntPatch_PointLine

  constructor

  AddVertex(Pnt: IntPatch_Point, theIsPrepend?: boolean): void;

  SetPoint(Index: number, Pnt: IntPatch_Point): void;

  Replace(Index: number, Pnt: IntPatch_Point): void;

  SetFirstPoint(IndFirst: number): void;

  SetLastPoint(IndLast: number): void;

  NbPnts(): number;

  Point(Index: number): IntSurf_PntOn2S;

  HasFirstPoint(): boolean;

  HasLastPoint(): boolean;

  FirstPoint(): IntPatch_Point;
  FirstPoint(Indfirst?: number): { returnValue: IntPatch_Point; Indfirst: number; [Symbol.dispose](): void };
  FirstPoint(): IntPatch_Point;
  FirstPoint(Indfirst?: number): { returnValue: IntPatch_Point; Indfirst: number; [Symbol.dispose](): void };

  LastPoint(): IntPatch_Point;
  LastPoint(Indlast?: number): { returnValue: IntPatch_Point; Indlast: number; [Symbol.dispose](): void };
  LastPoint(): IntPatch_Point;
  LastPoint(Indlast?: number): { returnValue: IntPatch_Point; Indlast: number; [Symbol.dispose](): void };

  NbVertex(): number;

  Vertex(Index: number): IntPatch_Point;

  ChangeVertex(Index: number): IntPatch_Point;

  ComputeVertexParameters(Tol: number): void;

  Curve(): IntSurf_LineOn2S;

  IsOutSurf1Box(P1: gp_Pnt2d): boolean;

  IsOutSurf2Box(P2: gp_Pnt2d): boolean;

  IsOutBox(P: gp_Pnt): boolean;

  SetPeriod(pu1: number, pv1: number, pu2: number, pv2: number): void;

  U1Period(): number;

  V1Period(): number;

  U2Period(): number;

  V2Period(): number;

  SetArcOnS1(A: Adaptor2d_Curve2d): void;

  HasArcOnS1(): boolean;

  GetArcOnS1(): Adaptor2d_Curve2d;

  SetArcOnS2(A: Adaptor2d_Curve2d): void;

  HasArcOnS2(): boolean;

  GetArcOnS2(): Adaptor2d_Curve2d;

  ClearVertexes(): void;

  RemoveVertex(theIndex: number): void;

  InsertVertexBefore(theIndex: number, thePnt: IntPatch_Point): void;

  Dump(theMode: number): void;

  EnablePurging(theIsEnabled: boolean): void;

  IsPurgingAllowed(): boolean;

  GetCreatingWay(): IntPatch_WLine_IntPatch_WLType;

  SetCreatingWayInfo(theAlgo: IntPatch_WLine_IntPatch_WLType): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_WLine_IntPatch_WLType: typeof IntPatch_WLine_IntPatch_WLType[keyof typeof IntPatch_WLine_IntPatch_WLType]

IntPatch_WLineTool: declare class IntPatch_WLineTool

  constructor

  static ComputePurgedWLine(theWLine: IntPatch_WLine, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theDom1: Adaptor3d_TopolTool, theDom2: Adaptor3d_TopolTool): IntPatch_WLine;

  static JoinWLines(theSlin: NCollection_Sequence_handle_IntPatch_Line, theSPnt: NCollection_Sequence_IntPatch_Point, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theTol3D: number): void;

  static ExtendTwoWLines(theSlin: NCollection_Sequence_handle_IntPatch_Line, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theToler3D: number, theArrPeriods: number, theBoxS1: Bnd_Box2d, theBoxS2: Bnd_Box2d, theListOfCriticalPoints: NCollection_List_gp_Pnt): void;

  delete(): void;

  [Symbol.dispose](): void;

IntPatch_SequenceOfLine: NCollection_Sequence_handle_IntPatch_Line

IntPatch_SequenceOfPoint: NCollection_Sequence_IntPatch_Point
