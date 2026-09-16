# libcascade — IntSurf

16 top-level symbols. Signatures are verbatim typescript.

IntSurf: declare class IntSurf

  constructor

  static MakeTransition(TgFirst: gp_Vec, TgSecond: gp_Vec, Normal: gp_Dir, TFirst: IntSurf_Transition, TSecond: IntSurf_Transition): void;

  static SetPeriod(theFirstSurf: Adaptor3d_Surface, theSecondSurf: Adaptor3d_Surface, theArrOfPeriod: [number, number, number, number]): void;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_Couple: declare class IntSurf_Couple

  constructor

  First(): number;

  Second(): number;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_InteriorPoint: declare class IntSurf_InteriorPoint

  constructor

  SetValue(P: gp_Pnt, U: number, V: number, Direc: gp_Vec, Direc2d: gp_Vec2d): void;

  Value(): gp_Pnt;

  Parameters(U?: number, V?: number): { U: number; V: number };

  UParameter(): number;

  VParameter(): number;

  Direction(): gp_Vec;

  Direction2d(): gp_Vec2d;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_InteriorPointTool: declare class IntSurf_InteriorPointTool

  constructor

  static Value3d(PStart: IntSurf_InteriorPoint): gp_Pnt;

  static Value2d(PStart: IntSurf_InteriorPoint, U?: number, V?: number): { U: number; V: number };

  static Direction3d(PStart: IntSurf_InteriorPoint): gp_Vec;

  static Direction2d(PStart: IntSurf_InteriorPoint): gp_Dir2d;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_LineOn2S: declare class IntSurf_LineOn2S extends Standard_Transient

  constructor

  Add(P: IntSurf_PntOn2S): void;

  NbPoints(): number;

  Value(Index: number): IntSurf_PntOn2S;
  Value(Index: number, P: IntSurf_PntOn2S): void;
  Value(Index: number): IntSurf_PntOn2S;
  Value(Index: number, P: IntSurf_PntOn2S): void;

  Reverse(): void;

  Split(Index: number): IntSurf_LineOn2S;

  SetPoint(Index: number, thePnt: gp_Pnt): void;

  SetUV(Index: number, OnFirst: boolean, U: number, V: number): void;

  Clear(): void;

  InsertBefore(I: number, P: IntSurf_PntOn2S): void;

  RemovePoint(I: number): void;

  IsOutSurf1Box(theP: gp_Pnt2d): boolean;

  IsOutSurf2Box(theP: gp_Pnt2d): boolean;

  IsOutBox(theP: gp_Pnt): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_PathPoint: declare class IntSurf_PathPoint

  constructor

  SetValue(P: gp_Pnt, U: number, V: number): void;

  AddUV(U: number, V: number): void;

  SetDirections(V: gp_Vec, D: gp_Dir2d): void;

  SetTangency(Tang: boolean): void;

  SetPassing(Pass: boolean): void;

  Value(): gp_Pnt;

  Value2d(U?: number, V?: number): { U: number; V: number };

  IsPassingPnt(): boolean;

  IsTangent(): boolean;

  Direction3d(): gp_Vec;

  Direction2d(): gp_Dir2d;

  Multiplicity(): number;

  Parameters(Index: number, U?: number, V?: number): { U: number; V: number };

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_PathPointTool: declare class IntSurf_PathPointTool

  constructor

  static Value3d(PStart: IntSurf_PathPoint): gp_Pnt;

  static Value2d(PStart: IntSurf_PathPoint, U?: number, V?: number): { U: number; V: number };

  static IsPassingPnt(PStart: IntSurf_PathPoint): boolean;

  static IsTangent(PStart: IntSurf_PathPoint): boolean;

  static Direction3d(PStart: IntSurf_PathPoint): gp_Vec;

  static Direction2d(PStart: IntSurf_PathPoint): gp_Dir2d;

  static Multiplicity(PStart: IntSurf_PathPoint): number;

  static Parameters(PStart: IntSurf_PathPoint, Mult: number, U?: number, V?: number): { U: number; V: number };

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_PntOn2S: declare class IntSurf_PntOn2S

  constructor

  SetValue(Pt: gp_Pnt): void;
  SetValue(OnFirst: boolean, U: number, V: number): void;
  SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
  SetValue(U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt): void;
  SetValue(OnFirst: boolean, U: number, V: number): void;
  SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
  SetValue(U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt): void;
  SetValue(OnFirst: boolean, U: number, V: number): void;
  SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
  SetValue(U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt): void;
  SetValue(OnFirst: boolean, U: number, V: number): void;
  SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
  SetValue(U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt): void;
  SetValue(OnFirst: boolean, U: number, V: number): void;
  SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
  SetValue(U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;

  Value(): gp_Pnt;

  ValueOnSurface(OnFirst: boolean): gp_Pnt2d;

  ParametersOnS1(U1?: number, V1?: number): { U1: number; V1: number };

  ParametersOnS2(U2?: number, V2?: number): { U2: number; V2: number };

  ParametersOnSurface(OnFirst: boolean, U?: number, V?: number): { U: number; V: number };

  Parameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  IsSame(theOtherPoint: IntSurf_PntOn2S, theTol3D?: number, theTol2D?: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_Quadric: declare class IntSurf_Quadric

  constructor

  SetValue(P: gp_Pln): void;
  SetValue(C: gp_Cylinder): void;
  SetValue(S: gp_Sphere): void;
  SetValue(C: gp_Cone): void;
  SetValue(T: gp_Torus): void;
  SetValue(P: gp_Pln): void;
  SetValue(C: gp_Cylinder): void;
  SetValue(S: gp_Sphere): void;
  SetValue(C: gp_Cone): void;
  SetValue(T: gp_Torus): void;
  SetValue(P: gp_Pln): void;
  SetValue(C: gp_Cylinder): void;
  SetValue(S: gp_Sphere): void;
  SetValue(C: gp_Cone): void;
  SetValue(T: gp_Torus): void;
  SetValue(P: gp_Pln): void;
  SetValue(C: gp_Cylinder): void;
  SetValue(S: gp_Sphere): void;
  SetValue(C: gp_Cone): void;
  SetValue(T: gp_Torus): void;
  SetValue(P: gp_Pln): void;
  SetValue(C: gp_Cylinder): void;
  SetValue(S: gp_Sphere): void;
  SetValue(C: gp_Cone): void;
  SetValue(T: gp_Torus): void;

  Distance(P: gp_Pnt): number;

  Gradient(P: gp_Pnt): gp_Vec;

  ValAndGrad(P: gp_Pnt, Dist: number, Grad: gp_Vec): { Dist: number };

  TypeQuadric(): GeomAbs_SurfaceType;

  Plane(): gp_Pln;

  Sphere(): gp_Sphere;

  Cylinder(): gp_Cylinder;

  Cone(): gp_Cone;

  Torus(): gp_Torus;

  Value(U: number, V: number): gp_Pnt;

  D1(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  DN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Normale(U: number, V: number): gp_Vec;
  Normale(P: gp_Pnt): gp_Vec;
  Normale(U: number, V: number): gp_Vec;
  Normale(P: gp_Pnt): gp_Vec;

  Parameters(P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_QuadricTool: declare class IntSurf_QuadricTool

  constructor

  static Value(Quad: IntSurf_Quadric, X: number, Y: number, Z: number): number;

  static Gradient(Quad: IntSurf_Quadric, X: number, Y: number, Z: number, V: gp_Vec): void;

  static ValueAndGradient(Quad: IntSurf_Quadric, X: number, Y: number, Z: number, Val: number, Grad: gp_Vec): { Val: number };

  static Tolerance(Quad: IntSurf_Quadric): number;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_Situation: typeof IntSurf_Situation[keyof typeof IntSurf_Situation]

IntSurf_Transition: declare class IntSurf_Transition

  constructor

  SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
  SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
  SetValue(): void;
  SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
  SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
  SetValue(): void;
  SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
  SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
  SetValue(): void;

  TransitionType(): IntSurf_TypeTrans;

  IsTangent(): boolean;

  Situation(): IntSurf_Situation;

  IsOpposite(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IntSurf_TypeTrans: typeof IntSurf_TypeTrans[keyof typeof IntSurf_TypeTrans]

IntSurf_ListOfPntOn2S: NCollection_List_IntSurf_PntOn2S

IntSurf_SequenceOfInteriorPoint: NCollection_Sequence_IntSurf_InteriorPoint

IntSurf_SequenceOfPathPoint: NCollection_Sequence_IntSurf_PathPoint
