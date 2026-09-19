# libcascade — MAT2d

8 top-level symbols. Signatures are verbatim typescript.

MAT2d_BiInt: declare class MAT2d_BiInt

  constructor

  FirstIndex(): number;
  FirstIndex(I1: number): void;
  FirstIndex(): number;
  FirstIndex(I1: number): void;

  SecondIndex(): number;
  SecondIndex(I2: number): void;
  SecondIndex(): number;
  SecondIndex(I2: number): void;

  IsEqual(B: MAT2d_BiInt): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MAT2d_Circuit: declare class MAT2d_Circuit extends Standard_Transient

  constructor

  Perform(aFigure: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry, IsClosed: NCollection_Sequence_bool, IndRefLine: number, Trigo: boolean): void;

  NumberOfItems(): number;

  Value(Index: number): Geom2d_Geometry;

  LineLength(IndexLine: number): number;

  RefToEqui(IndLine: number, IndCurve: number): NCollection_Sequence_int;

  Connexion(Index: number): MAT2d_Connexion;

  ConnexionOn(Index: number): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MAT2d_Connexion: declare class MAT2d_Connexion extends Standard_Transient

  constructor

  IndexFirstLine(): number;
  IndexFirstLine(anIndex: number): void;
  IndexFirstLine(): number;
  IndexFirstLine(anIndex: number): void;

  IndexSecondLine(): number;
  IndexSecondLine(anIndex: number): void;
  IndexSecondLine(): number;
  IndexSecondLine(anIndex: number): void;

  IndexItemOnFirst(): number;
  IndexItemOnFirst(anIndex: number): void;
  IndexItemOnFirst(): number;
  IndexItemOnFirst(anIndex: number): void;

  IndexItemOnSecond(): number;
  IndexItemOnSecond(anIndex: number): void;
  IndexItemOnSecond(): number;
  IndexItemOnSecond(anIndex: number): void;

  ParameterOnFirst(): number;
  ParameterOnFirst(aParameter: number): void;
  ParameterOnFirst(): number;
  ParameterOnFirst(aParameter: number): void;

  ParameterOnSecond(): number;
  ParameterOnSecond(aParameter: number): void;
  ParameterOnSecond(): number;
  ParameterOnSecond(aParameter: number): void;

  PointOnFirst(): gp_Pnt2d;
  PointOnFirst(aPoint: gp_Pnt2d): void;
  PointOnFirst(): gp_Pnt2d;
  PointOnFirst(aPoint: gp_Pnt2d): void;

  PointOnSecond(): gp_Pnt2d;
  PointOnSecond(aPoint: gp_Pnt2d): void;
  PointOnSecond(): gp_Pnt2d;
  PointOnSecond(aPoint: gp_Pnt2d): void;

  Distance(): number;
  Distance(aDistance: number): void;
  Distance(): number;
  Distance(aDistance: number): void;

  Reverse(): MAT2d_Connexion;

  IsAfter(aConnexion: MAT2d_Connexion, aSense: number): boolean;

  Dump(Deep?: number, Offset?: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

MAT2d_Mat2d: declare class MAT2d_Mat2d

  constructor

  CreateMat(aTool: MAT2d_Tool2d): void;

  CreateMatOpen(aTool: MAT2d_Tool2d): void;

  IsDone(): boolean;

  Init(): void;

  More(): boolean;

  Next(): void;

  Bisector(): MAT_Bisector;

  SemiInfinite(): boolean;

  NumberOfBisectors(): number;

  delete(): void;

  [Symbol.dispose](): void;

MAT2d_MiniPath: declare class MAT2d_MiniPath

  constructor

  Perform(Figure: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry, IndStart: number, Sense: boolean): void;

  RunOnConnexions(): void;

  Path(): NCollection_Sequence_handle_MAT2d_Connexion;

  IsConnexionsFrom(Index: number): boolean;

  ConnexionsFrom(Index: number): NCollection_Sequence_handle_MAT2d_Connexion;

  IsRoot(Index: number): boolean;

  Father(Index: number): MAT2d_Connexion;

  delete(): void;

  [Symbol.dispose](): void;

MAT2d_Tool2d: declare class MAT2d_Tool2d

  constructor

  Sense(aside: MAT_Side): void;

  SetJoinType(aJoinType: GeomAbs_JoinType): void;

  InitItems(aCircuit: MAT2d_Circuit): void;

  NumberOfItems(): number;

  ToleranceOfConfusion(): number;

  FirstPoint(anitem: number, dist?: number): { returnValue: number; dist: number };

  TangentBefore(anitem: number, IsOpenResult: boolean): number;

  TangentAfter(anitem: number, IsOpenResult: boolean): number;

  Tangent(bisector: number): number;

  CreateBisector(abisector: MAT_Bisector): void;

  TrimBisector(abisector: MAT_Bisector): boolean;
  TrimBisector(abisector: MAT_Bisector, apoint: number): boolean;
  TrimBisector(abisector: MAT_Bisector): boolean;
  TrimBisector(abisector: MAT_Bisector, apoint: number): boolean;

  IntersectBisector(bisectorone: MAT_Bisector, bisectortwo: MAT_Bisector, intpnt?: number): { returnValue: number; intpnt: number };

  Distance(abisector: MAT_Bisector, param1: number, param2: number): number;

  Dump(bisector: number, erease: number): void;

  GeomBis(Index: number): Bisector_Bisec;

  GeomElt(Index: number): Geom2d_Geometry;

  GeomPnt(Index: number): gp_Pnt2d;

  GeomVec(Index: number): gp_Vec2d;

  Circuit(): MAT2d_Circuit;

  BisecFusion(Index1: number, Index2: number): void;

  ChangeGeomBis(Index: number): Bisector_Bisec;

  delete(): void;

  [Symbol.dispose](): void;

MAT2d_SequenceOfConnexion: NCollection_Sequence_handle_MAT2d_Connexion

MAT2d_SequenceOfSequenceOfGeometry: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry
