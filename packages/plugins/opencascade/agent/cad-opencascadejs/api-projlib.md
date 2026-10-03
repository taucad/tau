# libcascade — ProjLib

17 top-level symbols. Signatures are verbatim typescript.

ProjLib: declare class ProjLib

  // ProjLib.constructor (constructor)
  constructor();

  // ProjLib.Project (method)
  static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
  static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
  static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
  static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
  static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
  static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
  static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
  static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
  static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
  static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
  static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
  static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
  static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
  static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
  static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
  static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;

  // ProjLib.MakePCurveOfType (method)
  static MakePCurveOfType(PC: ProjLib_ProjectedCurve): { aC: Geom2d_Curve; [Symbol.dispose](): void };

  // ProjLib.IsAnaSurf (method)
  static IsAnaSurf(theAS: Adaptor3d_Surface): boolean;

  // ProjLib.delete (method)
  delete(): void;

  // ProjLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_CompProjectedCurve: declare class ProjLib_CompProjectedCurve extends Adaptor2d_Curve2d

  // ProjLib_CompProjectedCurve.constructor (constructor)
  constructor();
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, TolU: number, TolV: number);
  constructor(Tol3d: number, S: Adaptor3d_Surface, C: Adaptor3d_Curve, MaxDist?: number);
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, TolU: number, TolV: number, MaxDist: number);

  // ProjLib_CompProjectedCurve.get_type_name (method)
  static get_type_name(): string;

  // ProjLib_CompProjectedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ProjLib_CompProjectedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // ProjLib_CompProjectedCurve.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // ProjLib_CompProjectedCurve.Init (method)
  Init(): void;

  // ProjLib_CompProjectedCurve.Perform (method)
  Perform(): void;

  // ProjLib_CompProjectedCurve.SetTol3d (method)
  SetTol3d(theTol3d: number): void;

  // ProjLib_CompProjectedCurve.SetContinuity (method)
  SetContinuity(theContinuity: GeomAbs_Shape): void;

  // ProjLib_CompProjectedCurve.SetMaxDegree (method)
  SetMaxDegree(theMaxDegree: number): void;

  // ProjLib_CompProjectedCurve.SetMaxSeg (method)
  SetMaxSeg(theMaxSeg: number): void;

  // ProjLib_CompProjectedCurve.SetProj2d (method)
  SetProj2d(theProj2d: boolean): void;

  // ProjLib_CompProjectedCurve.SetProj3d (method)
  SetProj3d(theProj3d: boolean): void;

  // ProjLib_CompProjectedCurve.Load (method)
  Load(S: Adaptor3d_Surface): void;
  Load(C: Adaptor3d_Curve): void;

  // ProjLib_CompProjectedCurve.GetSurface (method)
  GetSurface(): Adaptor3d_Surface;

  // ProjLib_CompProjectedCurve.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // ProjLib_CompProjectedCurve.GetTolerance (method)
  GetTolerance(TolU?: number, TolV?: number): { TolU: number; TolV: number };

  // ProjLib_CompProjectedCurve.NbCurves (method)
  NbCurves(): number;

  // ProjLib_CompProjectedCurve.Bounds (method)
  Bounds(Index: number, Udeb?: number, Ufin?: number): { Udeb: number; Ufin: number };

  // ProjLib_CompProjectedCurve.IsSinglePnt (method)
  IsSinglePnt(Index: number, P: gp_Pnt2d): boolean;

  // ProjLib_CompProjectedCurve.IsUIso (method)
  IsUIso(Index: number, U?: number): { returnValue: boolean; U: number };

  // ProjLib_CompProjectedCurve.IsVIso (method)
  IsVIso(Index: number, V?: number): { returnValue: boolean; V: number };

  // ProjLib_CompProjectedCurve.Value (method)
  Value(U: number): gp_Pnt2d;

  // ProjLib_CompProjectedCurve.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // ProjLib_CompProjectedCurve.D1 (method)
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // ProjLib_CompProjectedCurve.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ProjLib_CompProjectedCurve.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // ProjLib_CompProjectedCurve.FirstParameter (method)
  FirstParameter(): number;

  // ProjLib_CompProjectedCurve.LastParameter (method)
  LastParameter(): number;

  // ProjLib_CompProjectedCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // ProjLib_CompProjectedCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // ProjLib_CompProjectedCurve.Trim (method)
  Trim(FirstParam: number, LastParam: number, Tol: number): Adaptor2d_Curve2d;

  // ProjLib_CompProjectedCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // ProjLib_CompProjectedCurve.MaxDistance (method)
  MaxDistance(Index: number): number;

  // ProjLib_CompProjectedCurve.GetSequence (method)
  GetSequence(): NCollection_HSequence_handle_NCollection_HSequence_gp_Pnt;

  // ProjLib_CompProjectedCurve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // ProjLib_CompProjectedCurve.ResultIsPoint (method)
  ResultIsPoint(theIndex: number): boolean;

  // ProjLib_CompProjectedCurve.GetResult2dUApproxError (method)
  GetResult2dUApproxError(theIndex: number): number;

  // ProjLib_CompProjectedCurve.GetResult2dVApproxError (method)
  GetResult2dVApproxError(theIndex: number): number;

  // ProjLib_CompProjectedCurve.GetResult3dApproxError (method)
  GetResult3dApproxError(theIndex: number): number;

  // ProjLib_CompProjectedCurve.GetResult2dC (method)
  GetResult2dC(theIndex: number): Geom2d_Curve;

  // ProjLib_CompProjectedCurve.GetResult3dC (method)
  GetResult3dC(theIndex: number): Geom_Curve;

  // ProjLib_CompProjectedCurve.GetResult2dP (method)
  GetResult2dP(theIndex: number): gp_Pnt2d;

  // ProjLib_CompProjectedCurve.GetResult3dP (method)
  GetResult3dP(theIndex: number): gp_Pnt;

  // ProjLib_CompProjectedCurve.GetProj2d (method)
  GetProj2d(): boolean;

  // ProjLib_CompProjectedCurve.GetProj3d (method)
  GetProj3d(): boolean;

  // ProjLib_CompProjectedCurve.delete (method)
  delete(): void;

  // ProjLib_CompProjectedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_ComputeApprox: declare class ProjLib_ComputeApprox

  // ProjLib_ComputeApprox.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, Tol: number);

  // ProjLib_ComputeApprox.Perform (method)
  Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;

  // ProjLib_ComputeApprox.SetTolerance (method)
  SetTolerance(theTolerance: number): void;

  // ProjLib_ComputeApprox.SetDegree (method)
  SetDegree(theDegMin: number, theDegMax: number): void;

  // ProjLib_ComputeApprox.SetMaxSegments (method)
  SetMaxSegments(theMaxSegments: number): void;

  // ProjLib_ComputeApprox.SetBndPnt (method)
  SetBndPnt(theBndPnt: AppParCurves_Constraint): void;

  // ProjLib_ComputeApprox.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // ProjLib_ComputeApprox.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // ProjLib_ComputeApprox.Tolerance (method)
  Tolerance(): number;

  // ProjLib_ComputeApprox.delete (method)
  delete(): void;

  // ProjLib_ComputeApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_ComputeApproxOnPolarSurface: declare class ProjLib_ComputeApproxOnPolarSurface

  // ProjLib_ComputeApproxOnPolarSurface.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, Tol?: number);
  constructor(InitCurve2d: Adaptor2d_Curve2d, C: Adaptor3d_Curve, S: Adaptor3d_Surface, Tol: number);
  constructor(InitCurve2d: Adaptor2d_Curve2d, InitCurve2dBis: Adaptor2d_Curve2d, C: Adaptor3d_Curve, S: Adaptor3d_Surface, Tol: number);

  // ProjLib_ComputeApproxOnPolarSurface.SetDegree (method)
  SetDegree(theDegMin: number, theDegMax: number): void;

  // ProjLib_ComputeApproxOnPolarSurface.SetMaxSegments (method)
  SetMaxSegments(theMaxSegments: number): void;

  // ProjLib_ComputeApproxOnPolarSurface.SetBndPnt (method)
  SetBndPnt(theBndPnt: AppParCurves_Constraint): void;

  // ProjLib_ComputeApproxOnPolarSurface.SetMaxDist (method)
  SetMaxDist(theMaxDist: number): void;

  // ProjLib_ComputeApproxOnPolarSurface.SetTolerance (method)
  SetTolerance(theTolerance: number): void;

  // ProjLib_ComputeApproxOnPolarSurface.Perform (method)
  Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;
  Perform(InitCurve2d: Adaptor2d_Curve2d, C: Adaptor3d_Curve, S: Adaptor3d_Surface): Geom2d_BSplineCurve;

  // ProjLib_ComputeApproxOnPolarSurface.BuildInitialCurve2d (method)
  BuildInitialCurve2d(Curve: Adaptor3d_Curve, S: Adaptor3d_Surface): Adaptor2d_Curve2d;

  // ProjLib_ComputeApproxOnPolarSurface.ProjectUsingInitialCurve2d (method)
  ProjectUsingInitialCurve2d(Curve: Adaptor3d_Curve, S: Adaptor3d_Surface, InitCurve2d: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  // ProjLib_ComputeApproxOnPolarSurface.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // ProjLib_ComputeApproxOnPolarSurface.Curve2d (method)
  Curve2d(): Geom2d_Curve;

  // ProjLib_ComputeApproxOnPolarSurface.IsDone (method)
  IsDone(): boolean;

  // ProjLib_ComputeApproxOnPolarSurface.Tolerance (method)
  Tolerance(): number;

  // ProjLib_ComputeApproxOnPolarSurface.delete (method)
  delete(): void;

  // ProjLib_ComputeApproxOnPolarSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_Cone: declare class ProjLib_Cone extends ProjLib_Projector

  // ProjLib_Cone.constructor (constructor)
  constructor();
  constructor(Co: gp_Cone);
  constructor(Co: gp_Cone, L: gp_Lin);
  constructor(Co: gp_Cone, C: gp_Circ);

  // ProjLib_Cone.Init (method)
  Init(Co: gp_Cone): void;

  // ProjLib_Cone.Project (method)
  Project(L: gp_Lin): void;
  Project(C: gp_Circ): void;
  Project(E: gp_Elips): void;
  Project(P: gp_Parab): void;
  Project(H: gp_Hypr): void;

  // ProjLib_Cone.delete (method)
  delete(): void;

  // ProjLib_Cone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_Cylinder: declare class ProjLib_Cylinder extends ProjLib_Projector

  // ProjLib_Cylinder.constructor (constructor)
  constructor();
  constructor(Cyl: gp_Cylinder);
  constructor(Cyl: gp_Cylinder, L: gp_Lin);
  constructor(Cyl: gp_Cylinder, C: gp_Circ);
  constructor(Cyl: gp_Cylinder, E: gp_Elips);

  // ProjLib_Cylinder.Init (method)
  Init(Cyl: gp_Cylinder): void;

  // ProjLib_Cylinder.Project (method)
  Project(L: gp_Lin): void;
  Project(C: gp_Circ): void;
  Project(E: gp_Elips): void;
  Project(P: gp_Parab): void;
  Project(H: gp_Hypr): void;

  // ProjLib_Cylinder.delete (method)
  delete(): void;

  // ProjLib_Cylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_Plane: declare class ProjLib_Plane extends ProjLib_Projector

  // ProjLib_Plane.constructor (constructor)
  constructor();
  constructor(Pl: gp_Pln);
  constructor(Pl: gp_Pln, L: gp_Lin);
  constructor(Pl: gp_Pln, C: gp_Circ);
  constructor(Pl: gp_Pln, E: gp_Elips);
  constructor(Pl: gp_Pln, P: gp_Parab);
  constructor(Pl: gp_Pln, H: gp_Hypr);

  // ProjLib_Plane.Init (method)
  Init(Pl: gp_Pln): void;

  // ProjLib_Plane.Project (method)
  Project(L: gp_Lin): void;
  Project(C: gp_Circ): void;
  Project(E: gp_Elips): void;
  Project(P: gp_Parab): void;
  Project(H: gp_Hypr): void;

  // ProjLib_Plane.delete (method)
  delete(): void;

  // ProjLib_Plane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_PrjFunc: declare class ProjLib_PrjFunc extends math_FunctionSetWithDerivatives

  // ProjLib_PrjFunc.constructor (constructor)
  constructor(C: Adaptor3d_Curve, FixVal: number, S: Adaptor3d_Surface, Fix: number);

  // ProjLib_PrjFunc.NbVariables (method)
  NbVariables(): number;

  // ProjLib_PrjFunc.NbEquations (method)
  NbEquations(): number;

  // ProjLib_PrjFunc.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // ProjLib_PrjFunc.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // ProjLib_PrjFunc.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // ProjLib_PrjFunc.Solution (method)
  Solution(): gp_Pnt2d;

  // ProjLib_PrjFunc.delete (method)
  delete(): void;

  // ProjLib_PrjFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_PrjResolve: declare class ProjLib_PrjResolve

  // ProjLib_PrjResolve.constructor (constructor)
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, Fix: number);

  // ProjLib_PrjResolve.Perform (method)
  Perform(t: number, U: number, V: number, Tol: gp_Pnt2d, Inf: gp_Pnt2d, Sup: gp_Pnt2d, FTol?: number, StrictInside?: boolean): void;

  // ProjLib_PrjResolve.IsDone (method)
  IsDone(): boolean;

  // ProjLib_PrjResolve.Solution (method)
  Solution(): gp_Pnt2d;

  // ProjLib_PrjResolve.delete (method)
  delete(): void;

  // ProjLib_PrjResolve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_ProjectOnPlane: declare class ProjLib_ProjectOnPlane extends Adaptor3d_Curve

  // ProjLib_ProjectOnPlane.constructor (constructor)
  constructor();
  constructor(Pl: gp_Ax3);
  constructor(Pl: gp_Ax3, D: gp_Dir);

  // ProjLib_ProjectOnPlane.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // ProjLib_ProjectOnPlane.Load (method)
  Load(C: Adaptor3d_Curve, Tolerance: number, KeepParametrization?: boolean): void;

  // ProjLib_ProjectOnPlane.GetPlane (method)
  GetPlane(): gp_Ax3;

  // ProjLib_ProjectOnPlane.GetDirection (method)
  GetDirection(): gp_Dir;

  // ProjLib_ProjectOnPlane.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // ProjLib_ProjectOnPlane.GetResult (method)
  GetResult(): GeomAdaptor_Curve;

  // ProjLib_ProjectOnPlane.FirstParameter (method)
  FirstParameter(): number;

  // ProjLib_ProjectOnPlane.LastParameter (method)
  LastParameter(): number;

  // ProjLib_ProjectOnPlane.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // ProjLib_ProjectOnPlane.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // ProjLib_ProjectOnPlane.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // ProjLib_ProjectOnPlane.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // ProjLib_ProjectOnPlane.IsClosed (method)
  IsClosed(): boolean;

  // ProjLib_ProjectOnPlane.IsPeriodic (method)
  IsPeriodic(): boolean;

  // ProjLib_ProjectOnPlane.Period (method)
  Period(): number;

  // ProjLib_ProjectOnPlane.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // ProjLib_ProjectOnPlane.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // ProjLib_ProjectOnPlane.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // ProjLib_ProjectOnPlane.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // ProjLib_ProjectOnPlane.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // ProjLib_ProjectOnPlane.Resolution (method)
  Resolution(R3d: number): number;

  // ProjLib_ProjectOnPlane.GetType (method)
  GetType(): GeomAbs_CurveType;

  // ProjLib_ProjectOnPlane.Line (method)
  Line(): gp_Lin;

  // ProjLib_ProjectOnPlane.Circle (method)
  Circle(): gp_Circ;

  // ProjLib_ProjectOnPlane.Ellipse (method)
  Ellipse(): gp_Elips;

  // ProjLib_ProjectOnPlane.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // ProjLib_ProjectOnPlane.Parabola (method)
  Parabola(): gp_Parab;

  // ProjLib_ProjectOnPlane.Degree (method)
  Degree(): number;

  // ProjLib_ProjectOnPlane.IsRational (method)
  IsRational(): boolean;

  // ProjLib_ProjectOnPlane.NbPoles (method)
  NbPoles(): number;

  // ProjLib_ProjectOnPlane.NbKnots (method)
  NbKnots(): number;

  // ProjLib_ProjectOnPlane.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // ProjLib_ProjectOnPlane.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // ProjLib_ProjectOnPlane.delete (method)
  delete(): void;

  // ProjLib_ProjectOnPlane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_ProjectOnSurface: declare class ProjLib_ProjectOnSurface

  // ProjLib_ProjectOnSurface.constructor (constructor)
  constructor();
  constructor(S: Adaptor3d_Surface);

  // ProjLib_ProjectOnSurface.Load (method)
  Load(S: Adaptor3d_Surface): void;
  Load(C: Adaptor3d_Curve, Tolerance: number): void;

  // ProjLib_ProjectOnSurface.IsDone (method)
  IsDone(): boolean;

  // ProjLib_ProjectOnSurface.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // ProjLib_ProjectOnSurface.delete (method)
  delete(): void;

  // ProjLib_ProjectOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_ProjectedCurve: declare class ProjLib_ProjectedCurve extends Adaptor2d_Curve2d

  // ProjLib_ProjectedCurve.constructor (constructor)
  constructor();
  constructor(S: Adaptor3d_Surface);
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve);
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, Tol: number);

  // ProjLib_ProjectedCurve.get_type_name (method)
  static get_type_name(): string;

  // ProjLib_ProjectedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ProjLib_ProjectedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // ProjLib_ProjectedCurve.ShallowCopy (method)
  ShallowCopy(): Adaptor2d_Curve2d;

  // ProjLib_ProjectedCurve.Load (method)
  Load(Tolerance: number): void;
  Load(S: Adaptor3d_Surface): void;

  // ProjLib_ProjectedCurve.Perform (method)
  Perform(C: Adaptor3d_Curve): void;

  // ProjLib_ProjectedCurve.SetDegree (method)
  SetDegree(theDegMin: number, theDegMax: number): void;

  // ProjLib_ProjectedCurve.SetMaxSegments (method)
  SetMaxSegments(theMaxSegments: number): void;

  // ProjLib_ProjectedCurve.SetBndPnt (method)
  SetBndPnt(theBndPnt: AppParCurves_Constraint): void;

  // ProjLib_ProjectedCurve.SetMaxDist (method)
  SetMaxDist(theMaxDist: number): void;

  // ProjLib_ProjectedCurve.GetSurface (method)
  GetSurface(): Adaptor3d_Surface;

  // ProjLib_ProjectedCurve.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // ProjLib_ProjectedCurve.GetTolerance (method)
  GetTolerance(): number;

  // ProjLib_ProjectedCurve.FirstParameter (method)
  FirstParameter(): number;

  // ProjLib_ProjectedCurve.LastParameter (method)
  LastParameter(): number;

  // ProjLib_ProjectedCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // ProjLib_ProjectedCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // ProjLib_ProjectedCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // ProjLib_ProjectedCurve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

  // ProjLib_ProjectedCurve.IsClosed (method)
  IsClosed(): boolean;

  // ProjLib_ProjectedCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // ProjLib_ProjectedCurve.Period (method)
  Period(): number;

  // ProjLib_ProjectedCurve.Value (method)
  Value(U: number): gp_Pnt2d;

  // ProjLib_ProjectedCurve.D0 (method)
  D0(U: number, P: gp_Pnt2d): void;

  // ProjLib_ProjectedCurve.D1 (method)
  D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // ProjLib_ProjectedCurve.D2 (method)
  D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // ProjLib_ProjectedCurve.D3 (method)
  D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // ProjLib_ProjectedCurve.DN (method)
  DN(U: number, N: number): gp_Vec2d;

  // ProjLib_ProjectedCurve.Resolution (method)
  Resolution(R3d: number): number;

  // ProjLib_ProjectedCurve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // ProjLib_ProjectedCurve.Line (method)
  Line(): gp_Lin2d;

  // ProjLib_ProjectedCurve.Circle (method)
  Circle(): gp_Circ2d;

  // ProjLib_ProjectedCurve.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // ProjLib_ProjectedCurve.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // ProjLib_ProjectedCurve.Parabola (method)
  Parabola(): gp_Parab2d;

  // ProjLib_ProjectedCurve.Degree (method)
  Degree(): number;

  // ProjLib_ProjectedCurve.IsRational (method)
  IsRational(): boolean;

  // ProjLib_ProjectedCurve.NbPoles (method)
  NbPoles(): number;

  // ProjLib_ProjectedCurve.NbKnots (method)
  NbKnots(): number;

  // ProjLib_ProjectedCurve.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // ProjLib_ProjectedCurve.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // ProjLib_ProjectedCurve.delete (method)
  delete(): void;

  // ProjLib_ProjectedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_Projector: declare class ProjLib_Projector

  // ProjLib_Projector.constructor (constructor)
  constructor();

  // ProjLib_Projector.IsDone (method)
  IsDone(): boolean;

  // ProjLib_Projector.Done (method)
  Done(): void;

  // ProjLib_Projector.GetType (method)
  GetType(): GeomAbs_CurveType;

  // ProjLib_Projector.SetBSpline (method)
  SetBSpline(C: Geom2d_BSplineCurve): void;

  // ProjLib_Projector.SetBezier (method)
  SetBezier(C: Geom2d_BezierCurve): void;

  // ProjLib_Projector.SetType (method)
  SetType(Type: GeomAbs_CurveType): void;

  // ProjLib_Projector.IsPeriodic (method)
  IsPeriodic(): boolean;

  // ProjLib_Projector.SetPeriodic (method)
  SetPeriodic(): void;

  // ProjLib_Projector.Line (method)
  Line(): gp_Lin2d;

  // ProjLib_Projector.Circle (method)
  Circle(): gp_Circ2d;

  // ProjLib_Projector.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // ProjLib_Projector.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // ProjLib_Projector.Parabola (method)
  Parabola(): gp_Parab2d;

  // ProjLib_Projector.Bezier (method)
  Bezier(): Geom2d_BezierCurve;

  // ProjLib_Projector.BSpline (method)
  BSpline(): Geom2d_BSplineCurve;

  // ProjLib_Projector.Project (method)
  Project(L: gp_Lin): void;
  Project(C: gp_Circ): void;
  Project(E: gp_Elips): void;
  Project(P: gp_Parab): void;
  Project(H: gp_Hypr): void;

  // ProjLib_Projector.UFrame (method)
  UFrame(CFirst: number, CLast: number, UFirst: number, Period: number): void;

  // ProjLib_Projector.VFrame (method)
  VFrame(CFirst: number, CLast: number, VFirst: number, Period: number): void;

  // ProjLib_Projector.delete (method)
  delete(): void;

  // ProjLib_Projector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_Sphere: declare class ProjLib_Sphere extends ProjLib_Projector

  // ProjLib_Sphere.constructor (constructor)
  constructor();
  constructor(Sp: gp_Sphere);
  constructor(Sp: gp_Sphere, C: gp_Circ);

  // ProjLib_Sphere.Init (method)
  Init(Sp: gp_Sphere): void;

  // ProjLib_Sphere.Project (method)
  Project(L: gp_Lin): void;
  Project(C: gp_Circ): void;
  Project(E: gp_Elips): void;
  Project(P: gp_Parab): void;
  Project(H: gp_Hypr): void;

  // ProjLib_Sphere.SetInBounds (method)
  SetInBounds(U: number): void;

  // ProjLib_Sphere.delete (method)
  delete(): void;

  // ProjLib_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_Torus: declare class ProjLib_Torus extends ProjLib_Projector

  // ProjLib_Torus.constructor (constructor)
  constructor();
  constructor(To: gp_Torus);
  constructor(To: gp_Torus, C: gp_Circ);

  // ProjLib_Torus.Init (method)
  Init(To: gp_Torus): void;

  // ProjLib_Torus.Project (method)
  Project(L: gp_Lin): void;
  Project(C: gp_Circ): void;
  Project(E: gp_Elips): void;
  Project(P: gp_Parab): void;
  Project(H: gp_Hypr): void;

  // ProjLib_Torus.delete (method)
  delete(): void;

  // ProjLib_Torus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ProjLib_HSequenceOfHSequenceOfPnt: NCollection_HSequence_handle_NCollection_HSequence_gp_Pnt

ProjLib_SequenceOfHSequenceOfPnt: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt
