# libcascade — MAT2d

8 top-level symbols. Signatures are verbatim typescript.

MAT2d_BiInt: declare class MAT2d_BiInt

  // MAT2d_BiInt.constructor (constructor)
  constructor(I1: number, I2: number);

  // MAT2d_BiInt.FirstIndex (method)
  FirstIndex(): number;
  FirstIndex(I1: number): void;

  // MAT2d_BiInt.SecondIndex (method)
  SecondIndex(): number;
  SecondIndex(I2: number): void;

  // MAT2d_BiInt.IsEqual (method)
  IsEqual(B: MAT2d_BiInt): boolean;

  // MAT2d_BiInt.delete (method)
  delete(): void;

  // MAT2d_BiInt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT2d_Circuit: declare class MAT2d_Circuit extends Standard_Transient

  // MAT2d_Circuit.constructor (constructor)
  constructor(aJoinType?: GeomAbs_JoinType, IsOpenResult?: boolean);

  // MAT2d_Circuit.Perform (method)
  Perform(aFigure: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry, IsClosed: NCollection_Sequence_bool, IndRefLine: number, Trigo: boolean): void;

  // MAT2d_Circuit.NumberOfItems (method)
  NumberOfItems(): number;

  // MAT2d_Circuit.Value (method)
  Value(Index: number): Geom2d_Geometry;

  // MAT2d_Circuit.LineLength (method)
  LineLength(IndexLine: number): number;

  // MAT2d_Circuit.RefToEqui (method)
  RefToEqui(IndLine: number, IndCurve: number): NCollection_Sequence_int;

  // MAT2d_Circuit.Connexion (method)
  Connexion(Index: number): MAT2d_Connexion;

  // MAT2d_Circuit.ConnexionOn (method)
  ConnexionOn(Index: number): boolean;

  // MAT2d_Circuit.get_type_name (method)
  static get_type_name(): string;

  // MAT2d_Circuit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT2d_Circuit.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT2d_Circuit.delete (method)
  delete(): void;

  // MAT2d_Circuit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT2d_Connexion: declare class MAT2d_Connexion extends Standard_Transient

  // MAT2d_Connexion.constructor (constructor)
  constructor();
  constructor(LineA: number, LineB: number, ItemA: number, ItemB: number, Distance: number, ParameterOnA: number, ParameterOnB: number, PointA: gp_Pnt2d, PointB: gp_Pnt2d);

  // MAT2d_Connexion.IndexFirstLine (method)
  IndexFirstLine(): number;
  IndexFirstLine(anIndex: number): void;

  // MAT2d_Connexion.IndexSecondLine (method)
  IndexSecondLine(): number;
  IndexSecondLine(anIndex: number): void;

  // MAT2d_Connexion.IndexItemOnFirst (method)
  IndexItemOnFirst(): number;
  IndexItemOnFirst(anIndex: number): void;

  // MAT2d_Connexion.IndexItemOnSecond (method)
  IndexItemOnSecond(): number;
  IndexItemOnSecond(anIndex: number): void;

  // MAT2d_Connexion.ParameterOnFirst (method)
  ParameterOnFirst(): number;
  ParameterOnFirst(aParameter: number): void;

  // MAT2d_Connexion.ParameterOnSecond (method)
  ParameterOnSecond(): number;
  ParameterOnSecond(aParameter: number): void;

  // MAT2d_Connexion.PointOnFirst (method)
  PointOnFirst(): gp_Pnt2d;
  PointOnFirst(aPoint: gp_Pnt2d): void;

  // MAT2d_Connexion.PointOnSecond (method)
  PointOnSecond(): gp_Pnt2d;
  PointOnSecond(aPoint: gp_Pnt2d): void;

  // MAT2d_Connexion.Distance (method)
  Distance(): number;
  Distance(aDistance: number): void;

  // MAT2d_Connexion.Reverse (method)
  Reverse(): MAT2d_Connexion;

  // MAT2d_Connexion.IsAfter (method)
  IsAfter(aConnexion: MAT2d_Connexion, aSense: number): boolean;

  // MAT2d_Connexion.Dump (method)
  Dump(Deep?: number, Offset?: number): void;

  // MAT2d_Connexion.get_type_name (method)
  static get_type_name(): string;

  // MAT2d_Connexion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT2d_Connexion.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT2d_Connexion.delete (method)
  delete(): void;

  // MAT2d_Connexion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT2d_Mat2d: declare class MAT2d_Mat2d

  // MAT2d_Mat2d.constructor (constructor)
  constructor(IsOpenResult?: boolean);

  // MAT2d_Mat2d.CreateMat (method)
  CreateMat(aTool: MAT2d_Tool2d): void;

  // MAT2d_Mat2d.CreateMatOpen (method)
  CreateMatOpen(aTool: MAT2d_Tool2d): void;

  // MAT2d_Mat2d.IsDone (method)
  IsDone(): boolean;

  // MAT2d_Mat2d.Init (method)
  Init(): void;

  // MAT2d_Mat2d.More (method)
  More(): boolean;

  // MAT2d_Mat2d.Next (method)
  Next(): void;

  // MAT2d_Mat2d.Bisector (method)
  Bisector(): MAT_Bisector;

  // MAT2d_Mat2d.SemiInfinite (method)
  SemiInfinite(): boolean;

  // MAT2d_Mat2d.NumberOfBisectors (method)
  NumberOfBisectors(): number;

  // MAT2d_Mat2d.delete (method)
  delete(): void;

  // MAT2d_Mat2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT2d_MiniPath: declare class MAT2d_MiniPath

  // MAT2d_MiniPath.constructor (constructor)
  constructor();

  // MAT2d_MiniPath.Perform (method)
  Perform(Figure: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry, IndStart: number, Sense: boolean): void;

  // MAT2d_MiniPath.RunOnConnexions (method)
  RunOnConnexions(): void;

  // MAT2d_MiniPath.Path (method)
  Path(): NCollection_Sequence_handle_MAT2d_Connexion;

  // MAT2d_MiniPath.IsConnexionsFrom (method)
  IsConnexionsFrom(Index: number): boolean;

  // MAT2d_MiniPath.ConnexionsFrom (method)
  ConnexionsFrom(Index: number): NCollection_Sequence_handle_MAT2d_Connexion;

  // MAT2d_MiniPath.IsRoot (method)
  IsRoot(Index: number): boolean;

  // MAT2d_MiniPath.Father (method)
  Father(Index: number): MAT2d_Connexion;

  // MAT2d_MiniPath.delete (method)
  delete(): void;

  // MAT2d_MiniPath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT2d_Tool2d: declare class MAT2d_Tool2d

  // MAT2d_Tool2d.constructor (constructor)
  constructor();

  // MAT2d_Tool2d.Sense (method)
  Sense(aside: MAT_Side): void;

  // MAT2d_Tool2d.SetJoinType (method)
  SetJoinType(aJoinType: GeomAbs_JoinType): void;

  // MAT2d_Tool2d.InitItems (method)
  InitItems(aCircuit: MAT2d_Circuit): void;

  // MAT2d_Tool2d.NumberOfItems (method)
  NumberOfItems(): number;

  // MAT2d_Tool2d.ToleranceOfConfusion (method)
  ToleranceOfConfusion(): number;

  // MAT2d_Tool2d.FirstPoint (method)
  FirstPoint(anitem: number, dist?: number): { returnValue: number; dist: number };

  // MAT2d_Tool2d.TangentBefore (method)
  TangentBefore(anitem: number, IsOpenResult: boolean): number;

  // MAT2d_Tool2d.TangentAfter (method)
  TangentAfter(anitem: number, IsOpenResult: boolean): number;

  // MAT2d_Tool2d.Tangent (method)
  Tangent(bisector: number): number;

  // MAT2d_Tool2d.CreateBisector (method)
  CreateBisector(abisector: MAT_Bisector): void;

  // MAT2d_Tool2d.TrimBisector (method)
  TrimBisector(abisector: MAT_Bisector): boolean;
  TrimBisector(abisector: MAT_Bisector, apoint: number): boolean;

  // MAT2d_Tool2d.IntersectBisector (method)
  IntersectBisector(bisectorone: MAT_Bisector, bisectortwo: MAT_Bisector, intpnt?: number): { returnValue: number; intpnt: number };

  // MAT2d_Tool2d.Distance (method)
  Distance(abisector: MAT_Bisector, param1: number, param2: number): number;

  // MAT2d_Tool2d.Dump (method)
  Dump(bisector: number, erease: number): void;

  // MAT2d_Tool2d.GeomBis (method)
  GeomBis(Index: number): Bisector_Bisec;

  // MAT2d_Tool2d.GeomElt (method)
  GeomElt(Index: number): Geom2d_Geometry;

  // MAT2d_Tool2d.GeomPnt (method)
  GeomPnt(Index: number): gp_Pnt2d;

  // MAT2d_Tool2d.GeomVec (method)
  GeomVec(Index: number): gp_Vec2d;

  // MAT2d_Tool2d.Circuit (method)
  Circuit(): MAT2d_Circuit;

  // MAT2d_Tool2d.BisecFusion (method)
  BisecFusion(Index1: number, Index2: number): void;

  // MAT2d_Tool2d.ChangeGeomBis (method)
  ChangeGeomBis(Index: number): Bisector_Bisec;

  // MAT2d_Tool2d.delete (method)
  delete(): void;

  // MAT2d_Tool2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT2d_SequenceOfConnexion: NCollection_Sequence_handle_MAT2d_Connexion

MAT2d_SequenceOfSequenceOfGeometry: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry
