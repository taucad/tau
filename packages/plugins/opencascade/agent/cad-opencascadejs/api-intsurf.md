# libcascade — IntSurf

16 top-level symbols. Signatures are verbatim typescript.

IntSurf: declare class IntSurf

  // IntSurf.constructor (constructor)
  constructor();

  // IntSurf.MakeTransition (method)
  static MakeTransition(TgFirst: gp_Vec, TgSecond: gp_Vec, Normal: gp_Dir, TFirst: IntSurf_Transition, TSecond: IntSurf_Transition): void;

  // IntSurf.SetPeriod (method)
  static SetPeriod(theFirstSurf: Adaptor3d_Surface, theSecondSurf: Adaptor3d_Surface, theArrOfPeriod: [number, number, number, number]): void;

  // IntSurf.delete (method)
  delete(): void;

  // IntSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_Couple: declare class IntSurf_Couple

  // IntSurf_Couple.constructor (constructor)
  constructor();
  constructor(Index1: number, Index2: number);

  // IntSurf_Couple.First (method)
  First(): number;

  // IntSurf_Couple.Second (method)
  Second(): number;

  // IntSurf_Couple.delete (method)
  delete(): void;

  // IntSurf_Couple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_InteriorPoint: declare class IntSurf_InteriorPoint

  // IntSurf_InteriorPoint.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, U: number, V: number, Direc: gp_Vec, Direc2d: gp_Vec2d);

  // IntSurf_InteriorPoint.SetValue (method)
  SetValue(P: gp_Pnt, U: number, V: number, Direc: gp_Vec, Direc2d: gp_Vec2d): void;

  // IntSurf_InteriorPoint.Value (method)
  Value(): gp_Pnt;

  // IntSurf_InteriorPoint.Parameters (method)
  Parameters(U?: number, V?: number): { U: number; V: number };

  // IntSurf_InteriorPoint.UParameter (method)
  UParameter(): number;

  // IntSurf_InteriorPoint.VParameter (method)
  VParameter(): number;

  // IntSurf_InteriorPoint.Direction (method)
  Direction(): gp_Vec;

  // IntSurf_InteriorPoint.Direction2d (method)
  Direction2d(): gp_Vec2d;

  // IntSurf_InteriorPoint.delete (method)
  delete(): void;

  // IntSurf_InteriorPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_InteriorPointTool: declare class IntSurf_InteriorPointTool

  // IntSurf_InteriorPointTool.constructor (constructor)
  constructor();

  // IntSurf_InteriorPointTool.Value3d (method)
  static Value3d(PStart: IntSurf_InteriorPoint): gp_Pnt;

  // IntSurf_InteriorPointTool.Value2d (method)
  static Value2d(PStart: IntSurf_InteriorPoint, U?: number, V?: number): { U: number; V: number };

  // IntSurf_InteriorPointTool.Direction3d (method)
  static Direction3d(PStart: IntSurf_InteriorPoint): gp_Vec;

  // IntSurf_InteriorPointTool.Direction2d (method)
  static Direction2d(PStart: IntSurf_InteriorPoint): gp_Dir2d;

  // IntSurf_InteriorPointTool.delete (method)
  delete(): void;

  // IntSurf_InteriorPointTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_LineOn2S: declare class IntSurf_LineOn2S extends Standard_Transient

  // IntSurf_LineOn2S.constructor (constructor)
  constructor(theAllocator?: unknown);

  // IntSurf_LineOn2S.Add (method)
  Add(P: IntSurf_PntOn2S): void;

  // IntSurf_LineOn2S.NbPoints (method)
  NbPoints(): number;

  // IntSurf_LineOn2S.Value (method)
  Value(Index: number): IntSurf_PntOn2S;
  Value(Index: number, P: IntSurf_PntOn2S): void;

  // IntSurf_LineOn2S.Reverse (method)
  Reverse(): void;

  // IntSurf_LineOn2S.Split (method)
  Split(Index: number): IntSurf_LineOn2S;

  // IntSurf_LineOn2S.SetPoint (method)
  SetPoint(Index: number, thePnt: gp_Pnt): void;

  // IntSurf_LineOn2S.SetUV (method)
  SetUV(Index: number, OnFirst: boolean, U: number, V: number): void;

  // IntSurf_LineOn2S.Clear (method)
  Clear(): void;

  // IntSurf_LineOn2S.InsertBefore (method)
  InsertBefore(I: number, P: IntSurf_PntOn2S): void;

  // IntSurf_LineOn2S.RemovePoint (method)
  RemovePoint(I: number): void;

  // IntSurf_LineOn2S.IsOutSurf1Box (method)
  IsOutSurf1Box(theP: gp_Pnt2d): boolean;

  // IntSurf_LineOn2S.IsOutSurf2Box (method)
  IsOutSurf2Box(theP: gp_Pnt2d): boolean;

  // IntSurf_LineOn2S.IsOutBox (method)
  IsOutBox(theP: gp_Pnt): boolean;

  // IntSurf_LineOn2S.get_type_name (method)
  static get_type_name(): string;

  // IntSurf_LineOn2S.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IntSurf_LineOn2S.DynamicType (method)
  DynamicType(): Standard_Type;

  // IntSurf_LineOn2S.delete (method)
  delete(): void;

  // IntSurf_LineOn2S.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_PathPoint: declare class IntSurf_PathPoint

  // IntSurf_PathPoint.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, U: number, V: number);

  // IntSurf_PathPoint.SetValue (method)
  SetValue(P: gp_Pnt, U: number, V: number): void;

  // IntSurf_PathPoint.AddUV (method)
  AddUV(U: number, V: number): void;

  // IntSurf_PathPoint.SetDirections (method)
  SetDirections(V: gp_Vec, D: gp_Dir2d): void;

  // IntSurf_PathPoint.SetTangency (method)
  SetTangency(Tang: boolean): void;

  // IntSurf_PathPoint.SetPassing (method)
  SetPassing(Pass: boolean): void;

  // IntSurf_PathPoint.Value (method)
  Value(): gp_Pnt;

  // IntSurf_PathPoint.Value2d (method)
  Value2d(U?: number, V?: number): { U: number; V: number };

  // IntSurf_PathPoint.IsPassingPnt (method)
  IsPassingPnt(): boolean;

  // IntSurf_PathPoint.IsTangent (method)
  IsTangent(): boolean;

  // IntSurf_PathPoint.Direction3d (method)
  Direction3d(): gp_Vec;

  // IntSurf_PathPoint.Direction2d (method)
  Direction2d(): gp_Dir2d;

  // IntSurf_PathPoint.Multiplicity (method)
  Multiplicity(): number;

  // IntSurf_PathPoint.Parameters (method)
  Parameters(Index: number, U?: number, V?: number): { U: number; V: number };

  // IntSurf_PathPoint.delete (method)
  delete(): void;

  // IntSurf_PathPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_PathPointTool: declare class IntSurf_PathPointTool

  // IntSurf_PathPointTool.constructor (constructor)
  constructor();

  // IntSurf_PathPointTool.Value3d (method)
  static Value3d(PStart: IntSurf_PathPoint): gp_Pnt;

  // IntSurf_PathPointTool.Value2d (method)
  static Value2d(PStart: IntSurf_PathPoint, U?: number, V?: number): { U: number; V: number };

  // IntSurf_PathPointTool.IsPassingPnt (method)
  static IsPassingPnt(PStart: IntSurf_PathPoint): boolean;

  // IntSurf_PathPointTool.IsTangent (method)
  static IsTangent(PStart: IntSurf_PathPoint): boolean;

  // IntSurf_PathPointTool.Direction3d (method)
  static Direction3d(PStart: IntSurf_PathPoint): gp_Vec;

  // IntSurf_PathPointTool.Direction2d (method)
  static Direction2d(PStart: IntSurf_PathPoint): gp_Dir2d;

  // IntSurf_PathPointTool.Multiplicity (method)
  static Multiplicity(PStart: IntSurf_PathPoint): number;

  // IntSurf_PathPointTool.Parameters (method)
  static Parameters(PStart: IntSurf_PathPoint, Mult: number, U?: number, V?: number): { U: number; V: number };

  // IntSurf_PathPointTool.delete (method)
  delete(): void;

  // IntSurf_PathPointTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_PntOn2S: declare class IntSurf_PntOn2S

  // IntSurf_PntOn2S.constructor (constructor)
  constructor();

  // IntSurf_PntOn2S.SetValue (method)
  SetValue(Pt: gp_Pnt): void;
  SetValue(OnFirst: boolean, U: number, V: number): void;
  SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
  SetValue(U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;

  // IntSurf_PntOn2S.Value (method)
  Value(): gp_Pnt;

  // IntSurf_PntOn2S.ValueOnSurface (method)
  ValueOnSurface(OnFirst: boolean): gp_Pnt2d;

  // IntSurf_PntOn2S.ParametersOnS1 (method)
  ParametersOnS1(U1?: number, V1?: number): { U1: number; V1: number };

  // IntSurf_PntOn2S.ParametersOnS2 (method)
  ParametersOnS2(U2?: number, V2?: number): { U2: number; V2: number };

  // IntSurf_PntOn2S.ParametersOnSurface (method)
  ParametersOnSurface(OnFirst: boolean, U?: number, V?: number): { U: number; V: number };

  // IntSurf_PntOn2S.Parameters (method)
  Parameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  // IntSurf_PntOn2S.IsSame (method)
  IsSame(theOtherPoint: IntSurf_PntOn2S, theTol3D?: number, theTol2D?: number): boolean;

  // IntSurf_PntOn2S.delete (method)
  delete(): void;

  // IntSurf_PntOn2S.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_Quadric: declare class IntSurf_Quadric

  // IntSurf_Quadric.constructor (constructor)
  constructor();
  constructor(P: gp_Pln);
  constructor(C: gp_Cylinder);
  constructor(S: gp_Sphere);
  constructor(C: gp_Cone);
  constructor(T: gp_Torus);

  // IntSurf_Quadric.SetValue (method)
  SetValue(P: gp_Pln): void;
  SetValue(C: gp_Cylinder): void;
  SetValue(S: gp_Sphere): void;
  SetValue(C: gp_Cone): void;
  SetValue(T: gp_Torus): void;

  // IntSurf_Quadric.Distance (method)
  Distance(P: gp_Pnt): number;

  // IntSurf_Quadric.Gradient (method)
  Gradient(P: gp_Pnt): gp_Vec;

  // IntSurf_Quadric.ValAndGrad (method)
  ValAndGrad(P: gp_Pnt, Dist: number, Grad: gp_Vec): { Dist: number };

  // IntSurf_Quadric.TypeQuadric (method)
  TypeQuadric(): GeomAbs_SurfaceType;

  // IntSurf_Quadric.Plane (method)
  Plane(): gp_Pln;

  // IntSurf_Quadric.Sphere (method)
  Sphere(): gp_Sphere;

  // IntSurf_Quadric.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // IntSurf_Quadric.Cone (method)
  Cone(): gp_Cone;

  // IntSurf_Quadric.Torus (method)
  Torus(): gp_Torus;

  // IntSurf_Quadric.Value (method)
  Value(U: number, V: number): gp_Pnt;

  // IntSurf_Quadric.D1 (method)
  D1(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  // IntSurf_Quadric.DN (method)
  DN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // IntSurf_Quadric.Normale (method)
  Normale(U: number, V: number): gp_Vec;
  Normale(P: gp_Pnt): gp_Vec;

  // IntSurf_Quadric.Parameters (method)
  Parameters(P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  // IntSurf_Quadric.delete (method)
  delete(): void;

  // IntSurf_Quadric.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_QuadricTool: declare class IntSurf_QuadricTool

  // IntSurf_QuadricTool.constructor (constructor)
  constructor();

  // IntSurf_QuadricTool.Value (method)
  static Value(Quad: IntSurf_Quadric, X: number, Y: number, Z: number): number;

  // IntSurf_QuadricTool.Gradient (method)
  static Gradient(Quad: IntSurf_Quadric, X: number, Y: number, Z: number, V: gp_Vec): void;

  // IntSurf_QuadricTool.ValueAndGradient (method)
  static ValueAndGradient(Quad: IntSurf_Quadric, X: number, Y: number, Z: number, Val: number, Grad: gp_Vec): { Val: number };

  // IntSurf_QuadricTool.Tolerance (method)
  static Tolerance(Quad: IntSurf_Quadric): number;

  // IntSurf_QuadricTool.delete (method)
  delete(): void;

  // IntSurf_QuadricTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_Situation: typeof IntSurf_Situation[keyof typeof IntSurf_Situation]

  readonly IntSurf_Inside: 'IntSurf_Inside'

  readonly IntSurf_Outside: 'IntSurf_Outside'

  readonly IntSurf_Unknown: 'IntSurf_Unknown'

IntSurf_Transition: declare class IntSurf_Transition

  // IntSurf_Transition.constructor (constructor)
  constructor();
  constructor(Tangent: boolean, Type: IntSurf_TypeTrans);
  constructor(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean);

  // IntSurf_Transition.SetValue (method)
  SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
  SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
  SetValue(): void;

  // IntSurf_Transition.TransitionType (method)
  TransitionType(): IntSurf_TypeTrans;

  // IntSurf_Transition.IsTangent (method)
  IsTangent(): boolean;

  // IntSurf_Transition.Situation (method)
  Situation(): IntSurf_Situation;

  // IntSurf_Transition.IsOpposite (method)
  IsOpposite(): boolean;

  // IntSurf_Transition.delete (method)
  delete(): void;

  // IntSurf_Transition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntSurf_TypeTrans: typeof IntSurf_TypeTrans[keyof typeof IntSurf_TypeTrans]

  readonly IntSurf_In: 'IntSurf_In'

  readonly IntSurf_Out: 'IntSurf_Out'

  readonly IntSurf_Touch: 'IntSurf_Touch'

  readonly IntSurf_Undecided: 'IntSurf_Undecided'

IntSurf_ListOfPntOn2S: NCollection_List_IntSurf_PntOn2S

IntSurf_SequenceOfInteriorPoint: NCollection_Sequence_IntSurf_InteriorPoint

IntSurf_SequenceOfPathPoint: NCollection_Sequence_IntSurf_PathPoint
