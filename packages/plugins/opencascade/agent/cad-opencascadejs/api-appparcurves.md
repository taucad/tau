# libcascade — AppParCurves

10 top-level symbols. Signatures are verbatim typescript.

AppParCurves: declare class AppParCurves

  // AppParCurves.constructor (constructor)
  constructor();

  // AppParCurves.BernsteinMatrix (method)
  static BernsteinMatrix(NbPoles: number, U: math_VectorBase_double, A: math_Matrix): void;

  // AppParCurves.Bernstein (method)
  static Bernstein(NbPoles: number, U: math_VectorBase_double, A: math_Matrix, DA: math_Matrix): void;

  // AppParCurves.SecondDerivativeBernstein (method)
  static SecondDerivativeBernstein(U: number, DDA: math_VectorBase_double): void;

  // AppParCurves.SplineFunction (method)
  static SplineFunction(NbPoles: number, Degree: number, Parameters: math_VectorBase_double, FlatKnots: math_VectorBase_double, A: math_Matrix, DA: math_Matrix, Index: math_VectorBase_int): void;

  // AppParCurves.delete (method)
  delete(): void;

  // AppParCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AppParCurves_Constraint: typeof AppParCurves_Constraint[keyof typeof AppParCurves_Constraint]

  readonly AppParCurves_NoConstraint: 'AppParCurves_NoConstraint'

  readonly AppParCurves_PassPoint: 'AppParCurves_PassPoint'

  readonly AppParCurves_TangencyPoint: 'AppParCurves_TangencyPoint'

  readonly AppParCurves_CurvaturePoint: 'AppParCurves_CurvaturePoint'

AppParCurves_ConstraintCouple: declare class AppParCurves_ConstraintCouple

  // AppParCurves_ConstraintCouple.constructor (constructor)
  constructor();
  constructor(TheIndex: number, Cons: AppParCurves_Constraint);

  // AppParCurves_ConstraintCouple.Index (method)
  Index(): number;

  // AppParCurves_ConstraintCouple.Constraint (method)
  Constraint(): AppParCurves_Constraint;

  // AppParCurves_ConstraintCouple.SetIndex (method)
  SetIndex(TheIndex: number): void;

  // AppParCurves_ConstraintCouple.SetConstraint (method)
  SetConstraint(Cons: AppParCurves_Constraint): void;

  // AppParCurves_ConstraintCouple.delete (method)
  delete(): void;

  // AppParCurves_ConstraintCouple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AppParCurves_MultiBSpCurve: declare class AppParCurves_MultiBSpCurve extends AppParCurves_MultiCurve

  // AppParCurves_MultiBSpCurve.constructor (constructor)
  constructor();
  constructor(NbPol: number);
  constructor(tabMU: NCollection_Array1_AppParCurves_MultiPoint, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int);
  constructor(SC: AppParCurves_MultiCurve, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int);

  // AppParCurves_MultiBSpCurve.SetKnots (method)
  SetKnots(theKnots: NCollection_Array1_double): void;

  // AppParCurves_MultiBSpCurve.SetMultiplicities (method)
  SetMultiplicities(theMults: NCollection_Array1_int): void;

  // AppParCurves_MultiBSpCurve.Knots (method)
  Knots(): NCollection_Array1_double;

  // AppParCurves_MultiBSpCurve.Multiplicities (method)
  Multiplicities(): NCollection_Array1_int;

  // AppParCurves_MultiBSpCurve.Degree (method)
  Degree(): number;

  // AppParCurves_MultiBSpCurve.Value (method)
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;
  Value(Index: number): AppParCurves_MultiPoint;

  // AppParCurves_MultiBSpCurve.D1 (method)
  D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;

  // AppParCurves_MultiBSpCurve.D2 (method)
  D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // AppParCurves_MultiBSpCurve.delete (method)
  delete(): void;

  // AppParCurves_MultiBSpCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AppParCurves_MultiCurve: declare class AppParCurves_MultiCurve

  // AppParCurves_MultiCurve.constructor (constructor)
  constructor();
  constructor(NbPol: number);
  constructor(tabMU: NCollection_Array1_AppParCurves_MultiPoint);

  // AppParCurves_MultiCurve.SetNbPoles (method)
  SetNbPoles(nbPoles: number): void;

  // AppParCurves_MultiCurve.SetValue (method)
  SetValue(Index: number, MPoint: AppParCurves_MultiPoint): void;

  // AppParCurves_MultiCurve.NbCurves (method)
  NbCurves(): number;

  // AppParCurves_MultiCurve.NbPoles (method)
  NbPoles(): number;

  // AppParCurves_MultiCurve.Degree (method)
  Degree(): number;

  // AppParCurves_MultiCurve.Dimension (method)
  Dimension(CuIndex: number): number;

  // AppParCurves_MultiCurve.Curve (method)
  Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt): void;
  Curve(CuIndex: number, TabPnt: NCollection_Array1_gp_Pnt2d): void;

  // AppParCurves_MultiCurve.Value (method)
  Value(Index: number): AppParCurves_MultiPoint;
  Value(CuIndex: number, U: number, Pt: gp_Pnt): void;
  Value(CuIndex: number, U: number, Pt: gp_Pnt2d): void;

  // AppParCurves_MultiCurve.Pole (method)
  Pole(CuIndex: number, Nieme: number): gp_Pnt;

  // AppParCurves_MultiCurve.Pole2d (method)
  Pole2d(CuIndex: number, Nieme: number): gp_Pnt2d;

  // AppParCurves_MultiCurve.Transform (method)
  Transform(CuIndex: number, x: number, dx: number, y: number, dy: number, z: number, dz: number): void;

  // AppParCurves_MultiCurve.Transform2d (method)
  Transform2d(CuIndex: number, x: number, dx: number, y: number, dy: number): void;

  // AppParCurves_MultiCurve.D1 (method)
  D1(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec): void;
  D1(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d): void;

  // AppParCurves_MultiCurve.D2 (method)
  D2(CuIndex: number, U: number, Pt: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
  D2(CuIndex: number, U: number, Pt: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // AppParCurves_MultiCurve.delete (method)
  delete(): void;

  // AppParCurves_MultiCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AppParCurves_MultiPoint: declare class AppParCurves_MultiPoint

  // AppParCurves_MultiPoint.constructor (constructor)
  constructor();
  constructor(tabP: NCollection_Array1_gp_Pnt);
  constructor(tabP2d: NCollection_Array1_gp_Pnt2d);
  constructor(NbPoints: number, NbPoints2d: number);
  constructor(tabP: NCollection_Array1_gp_Pnt, tabP2d: NCollection_Array1_gp_Pnt2d);

  // AppParCurves_MultiPoint.SetPoint (method)
  SetPoint(Index: number, Point: gp_Pnt): void;

  // AppParCurves_MultiPoint.Point (method)
  Point(Index: number): gp_Pnt;

  // AppParCurves_MultiPoint.SetPoint2d (method)
  SetPoint2d(Index: number, Point: gp_Pnt2d): void;

  // AppParCurves_MultiPoint.Point2d (method)
  Point2d(Index: number): gp_Pnt2d;

  // AppParCurves_MultiPoint.Dimension (method)
  Dimension(Index: number): number;

  // AppParCurves_MultiPoint.NbPoints (method)
  NbPoints(): number;

  // AppParCurves_MultiPoint.NbPoints2d (method)
  NbPoints2d(): number;

  // AppParCurves_MultiPoint.Transform (method)
  Transform(CuIndex: number, x: number, dx: number, y: number, dy: number, z: number, dz: number): void;

  // AppParCurves_MultiPoint.Transform2d (method)
  Transform2d(CuIndex: number, x: number, dx: number, y: number, dy: number): void;

  // AppParCurves_MultiPoint.delete (method)
  delete(): void;

  // AppParCurves_MultiPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AppParCurves_Array1OfConstraintCouple: NCollection_Array1_AppParCurves_ConstraintCouple

AppParCurves_Array1OfMultiPoint: NCollection_Array1_AppParCurves_MultiPoint

AppParCurves_HArray1OfConstraintCouple: NCollection_HArray1_AppParCurves_ConstraintCouple

AppParCurves_SequenceOfMultiCurve: NCollection_Sequence_AppParCurves_MultiCurve
