# libcascade — AppParCurves

10 top-level symbols. Signatures are verbatim typescript.

AppParCurves: declare class AppParCurves

  constructor

  static BernsteinMatrix(NbPoles: number, U: math_VectorBase_double, A: math_Matrix): void;

  static Bernstein(NbPoles: number, U: math_VectorBase_double, A: math_Matrix, DA: math_Matrix): void;

  static SecondDerivativeBernstein(U: number, DDA: math_VectorBase_double): void;

  static SplineFunction(NbPoles: number, Degree: number, Parameters: math_VectorBase_double, FlatKnots: math_VectorBase_double, A: math_Matrix, DA: math_Matrix, Index: math_VectorBase_int): void;

  delete(): void;

  [Symbol.dispose](): void;

AppParCurves_Constraint: typeof AppParCurves_Constraint[keyof typeof AppParCurves_Constraint]

AppParCurves_ConstraintCouple: declare class AppParCurves_ConstraintCouple

  constructor

  Index(): number;

  Constraint(): AppParCurves_Constraint;

  SetIndex(TheIndex: number): void;

  SetConstraint(Cons: AppParCurves_Constraint): void;

  delete(): void;

  [Symbol.dispose](): void;

AppParCurves_MultiBSpCurve: declare class AppParCurves_MultiBSpCurve extends AppParCurves_MultiCurve

  constructor

  SetKnots(theKnots: NCollection_Array1_double): void;

  SetMultiplicities(theMults: NCollection_Array1_int): void;

  Knots(): NCollection_Array1_double;

  Multiplicities(): NCollection_Array1_int;

  Degree(): number;

  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
  Value(Index: number): AppParCurves_MultiPoint;
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
  Value(Index: number): AppParCurves_MultiPoint;
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
  Value(Index: number): AppParCurves_MultiPoint;

  D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;

  D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  delete(): void;

  [Symbol.dispose](): void;

AppParCurves_MultiCurve: declare class AppParCurves_MultiCurve

  constructor

  SetNbPoles(nbPoles: number): void;

  SetValue(Index: number, MPoint: AppParCurves_MultiPoint): void;

  NbCurves(): number;

  NbPoles(): number;

  Degree(): number;

  Dimension(CuIndex: number): number;

  Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt): void;
  Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt2d): void;
  Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt): void;
  Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt2d): void;

  Value(Index: number): AppParCurves_MultiPoint;
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
  Value(Index: number): AppParCurves_MultiPoint;
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
  Value(Index: number): AppParCurves_MultiPoint;
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;

  Pole(CuIndex: number, Nieme: number): gp_Pnt;

  Pole2d(CuIndex: number, Nieme: number): gp_Pnt2d;

  Transform(CuIndex: number, x: number, dx: number, y: number, dy: number, z: number, dz: number): void;

  Transform2d(CuIndex: number, x: number, dx: number, y: number, dy: number): void;

  D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;

  D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  delete(): void;

  [Symbol.dispose](): void;

AppParCurves_MultiPoint: declare class AppParCurves_MultiPoint

  constructor

  SetPoint(Index: number, Point: gp_Pnt): void;

  Point(Index: number): gp_Pnt;

  SetPoint2d(Index: number, Point: gp_Pnt2d): void;

  Point2d(Index: number): gp_Pnt2d;

  Dimension(Index: number): number;

  NbPoints(): number;

  NbPoints2d(): number;

  Transform(CuIndex: number, x: number, dx: number, y: number, dy: number, z: number, dz: number): void;

  Transform2d(CuIndex: number, x: number, dx: number, y: number, dy: number): void;

  delete(): void;

  [Symbol.dispose](): void;

AppParCurves_Array1OfConstraintCouple: NCollection_Array1_AppParCurves_ConstraintCouple

AppParCurves_Array1OfMultiPoint: NCollection_Array1_AppParCurves_MultiPoint

AppParCurves_HArray1OfConstraintCouple: NCollection_HArray1_AppParCurves_ConstraintCouple

AppParCurves_SequenceOfMultiCurve: NCollection_Sequence_AppParCurves_MultiCurve
