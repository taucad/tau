# libcascade — Adaptor3d

8 top-level symbols. Signatures are verbatim typescript.

Adaptor3d_Curve: declare class Adaptor3d_Curve extends Standard_Transient

  // Adaptor3d_Curve.constructor (constructor)
  constructor();

  // Adaptor3d_Curve.get_type_name (method)
  static get_type_name(): string;

  // Adaptor3d_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor3d_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor3d_Curve.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // Adaptor3d_Curve.FirstParameter (method)
  FirstParameter(): number;

  // Adaptor3d_Curve.LastParameter (method)
  LastParameter(): number;

  // Adaptor3d_Curve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Adaptor3d_Curve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Adaptor3d_Curve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor3d_Curve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // Adaptor3d_Curve.IsClosed (method)
  IsClosed(): boolean;

  // Adaptor3d_Curve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Adaptor3d_Curve.Period (method)
  Period(): number;

  // Adaptor3d_Curve.Value (method)
  Value(theU: number): gp_Pnt;

  // Adaptor3d_Curve.D0 (method)
  D0(theU: number, theP: gp_Pnt): void;

  // Adaptor3d_Curve.D1 (method)
  D1(theU: number, theP: gp_Pnt, theV: gp_Vec): void;

  // Adaptor3d_Curve.D2 (method)
  D2(theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): void;

  // Adaptor3d_Curve.D3 (method)
  D3(theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

  // Adaptor3d_Curve.DN (method)
  DN(theU: number, theN: number): gp_Vec;

  // Adaptor3d_Curve.Resolution (method)
  Resolution(R3d: number): number;

  // Adaptor3d_Curve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Adaptor3d_Curve.Line (method)
  Line(): gp_Lin;

  // Adaptor3d_Curve.Circle (method)
  Circle(): gp_Circ;

  // Adaptor3d_Curve.Ellipse (method)
  Ellipse(): gp_Elips;

  // Adaptor3d_Curve.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // Adaptor3d_Curve.Parabola (method)
  Parabola(): gp_Parab;

  // Adaptor3d_Curve.Degree (method)
  Degree(): number;

  // Adaptor3d_Curve.IsRational (method)
  IsRational(): boolean;

  // Adaptor3d_Curve.NbPoles (method)
  NbPoles(): number;

  // Adaptor3d_Curve.NbKnots (method)
  NbKnots(): number;

  // Adaptor3d_Curve.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // Adaptor3d_Curve.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // Adaptor3d_Curve.OffsetCurve (method)
  OffsetCurve(): Geom_OffsetCurve;

  // Adaptor3d_Curve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // Adaptor3d_Curve.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // Adaptor3d_Curve.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // Adaptor3d_Curve.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // Adaptor3d_Curve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // Adaptor3d_Curve.delete (method)
  delete(): void;

  // Adaptor3d_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_CurveOnSurface: declare class Adaptor3d_CurveOnSurface extends Adaptor3d_Curve

  // Adaptor3d_CurveOnSurface.constructor (constructor)
  constructor();
  constructor(S: Adaptor3d_Surface);
  constructor(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface);

  // Adaptor3d_CurveOnSurface.get_type_name (method)
  static get_type_name(): string;

  // Adaptor3d_CurveOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor3d_CurveOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor3d_CurveOnSurface.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // Adaptor3d_CurveOnSurface.Load (method)
  Load(S: Adaptor3d_Surface): void;
  Load(C: Adaptor2d_Curve2d): void;
  Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;

  // Adaptor3d_CurveOnSurface.GetCurve (method)
  GetCurve(): Adaptor2d_Curve2d;

  // Adaptor3d_CurveOnSurface.GetSurface (method)
  GetSurface(): Adaptor3d_Surface;

  // Adaptor3d_CurveOnSurface.ChangeCurve (method)
  ChangeCurve(): Adaptor2d_Curve2d;

  // Adaptor3d_CurveOnSurface.ChangeSurface (method)
  ChangeSurface(): Adaptor3d_Surface;

  // Adaptor3d_CurveOnSurface.FirstParameter (method)
  FirstParameter(): number;

  // Adaptor3d_CurveOnSurface.LastParameter (method)
  LastParameter(): number;

  // Adaptor3d_CurveOnSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Adaptor3d_CurveOnSurface.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Adaptor3d_CurveOnSurface.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor3d_CurveOnSurface.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // Adaptor3d_CurveOnSurface.IsClosed (method)
  IsClosed(): boolean;

  // Adaptor3d_CurveOnSurface.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Adaptor3d_CurveOnSurface.Period (method)
  Period(): number;

  // Adaptor3d_CurveOnSurface.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // Adaptor3d_CurveOnSurface.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // Adaptor3d_CurveOnSurface.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // Adaptor3d_CurveOnSurface.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // Adaptor3d_CurveOnSurface.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // Adaptor3d_CurveOnSurface.Resolution (method)
  Resolution(R3d: number): number;

  // Adaptor3d_CurveOnSurface.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Adaptor3d_CurveOnSurface.Line (method)
  Line(): gp_Lin;

  // Adaptor3d_CurveOnSurface.Circle (method)
  Circle(): gp_Circ;

  // Adaptor3d_CurveOnSurface.Ellipse (method)
  Ellipse(): gp_Elips;

  // Adaptor3d_CurveOnSurface.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // Adaptor3d_CurveOnSurface.Parabola (method)
  Parabola(): gp_Parab;

  // Adaptor3d_CurveOnSurface.Degree (method)
  Degree(): number;

  // Adaptor3d_CurveOnSurface.IsRational (method)
  IsRational(): boolean;

  // Adaptor3d_CurveOnSurface.NbPoles (method)
  NbPoles(): number;

  // Adaptor3d_CurveOnSurface.NbKnots (method)
  NbKnots(): number;

  // Adaptor3d_CurveOnSurface.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // Adaptor3d_CurveOnSurface.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // Adaptor3d_CurveOnSurface.delete (method)
  delete(): void;

  // Adaptor3d_CurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_HSurfaceTool: declare class Adaptor3d_HSurfaceTool

  // Adaptor3d_HSurfaceTool.constructor (constructor)
  constructor();

  // Adaptor3d_HSurfaceTool.FirstUParameter (method)
  static FirstUParameter(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.FirstVParameter (method)
  static FirstVParameter(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.LastUParameter (method)
  static LastUParameter(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.LastVParameter (method)
  static LastVParameter(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.NbUIntervals (method)
  static NbUIntervals(theSurf: Adaptor3d_Surface, theSh: GeomAbs_Shape): number;

  // Adaptor3d_HSurfaceTool.NbVIntervals (method)
  static NbVIntervals(theSurf: Adaptor3d_Surface, theSh: GeomAbs_Shape): number;

  // Adaptor3d_HSurfaceTool.UIntervals (method)
  static UIntervals(theSurf: Adaptor3d_Surface, theTab: NCollection_Array1_double, theSh: GeomAbs_Shape): void;

  // Adaptor3d_HSurfaceTool.VIntervals (method)
  static VIntervals(theSurf: Adaptor3d_Surface, theTab: NCollection_Array1_double, theSh: GeomAbs_Shape): void;

  // Adaptor3d_HSurfaceTool.UTrim (method)
  static UTrim(theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number): Adaptor3d_Surface;

  // Adaptor3d_HSurfaceTool.VTrim (method)
  static VTrim(theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number): Adaptor3d_Surface;

  // Adaptor3d_HSurfaceTool.IsUClosed (method)
  static IsUClosed(theSurf: Adaptor3d_Surface): boolean;

  // Adaptor3d_HSurfaceTool.IsVClosed (method)
  static IsVClosed(theSurf: Adaptor3d_Surface): boolean;

  // Adaptor3d_HSurfaceTool.IsUPeriodic (method)
  static IsUPeriodic(theSurf: Adaptor3d_Surface): boolean;

  // Adaptor3d_HSurfaceTool.UPeriod (method)
  static UPeriod(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.IsVPeriodic (method)
  static IsVPeriodic(theSurf: Adaptor3d_Surface): boolean;

  // Adaptor3d_HSurfaceTool.VPeriod (method)
  static VPeriod(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.Value (method)
  static Value(theSurf: Adaptor3d_Surface, theU: number, theV: number): gp_Pnt;

  // Adaptor3d_HSurfaceTool.D0 (method)
  static D0(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt): void;

  // Adaptor3d_HSurfaceTool.D1 (method)
  static D1(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec): void;

  // Adaptor3d_HSurfaceTool.D2 (method)
  static D2(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec): void;

  // Adaptor3d_HSurfaceTool.D3 (method)
  static D3(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec, theD3U: gp_Vec, theD3V: gp_Vec, theD3UUV: gp_Vec, theD3UVV: gp_Vec): void;

  // Adaptor3d_HSurfaceTool.DN (method)
  static DN(theSurf: Adaptor3d_Surface, theU: number, theV: number, theNU: number, theNV: number): gp_Vec;

  // Adaptor3d_HSurfaceTool.UResolution (method)
  static UResolution(theSurf: Adaptor3d_Surface, theR3d: number): number;

  // Adaptor3d_HSurfaceTool.VResolution (method)
  static VResolution(theSurf: Adaptor3d_Surface, theR3d: number): number;

  // Adaptor3d_HSurfaceTool.GetType (method)
  static GetType(theSurf: Adaptor3d_Surface): GeomAbs_SurfaceType;

  // Adaptor3d_HSurfaceTool.Plane (method)
  static Plane(theSurf: Adaptor3d_Surface): gp_Pln;

  // Adaptor3d_HSurfaceTool.Cylinder (method)
  static Cylinder(theSurf: Adaptor3d_Surface): gp_Cylinder;

  // Adaptor3d_HSurfaceTool.Cone (method)
  static Cone(theSurf: Adaptor3d_Surface): gp_Cone;

  // Adaptor3d_HSurfaceTool.Torus (method)
  static Torus(theSurf: Adaptor3d_Surface): gp_Torus;

  // Adaptor3d_HSurfaceTool.Sphere (method)
  static Sphere(theSurf: Adaptor3d_Surface): gp_Sphere;

  // Adaptor3d_HSurfaceTool.Bezier (method)
  static Bezier(theSurf: Adaptor3d_Surface): Geom_BezierSurface;

  // Adaptor3d_HSurfaceTool.BSpline (method)
  static BSpline(theSurf: Adaptor3d_Surface): Geom_BSplineSurface;

  // Adaptor3d_HSurfaceTool.AxeOfRevolution (method)
  static AxeOfRevolution(theSurf: Adaptor3d_Surface): gp_Ax1;

  // Adaptor3d_HSurfaceTool.Direction (method)
  static Direction(theSurf: Adaptor3d_Surface): gp_Dir;

  // Adaptor3d_HSurfaceTool.BasisCurve (method)
  static BasisCurve(theSurf: Adaptor3d_Surface): Adaptor3d_Curve;

  // Adaptor3d_HSurfaceTool.BasisSurface (method)
  static BasisSurface(theSurf: Adaptor3d_Surface): Adaptor3d_Surface;

  // Adaptor3d_HSurfaceTool.OffsetValue (method)
  static OffsetValue(theSurf: Adaptor3d_Surface): number;

  // Adaptor3d_HSurfaceTool.IsSurfG1 (method)
  static IsSurfG1(theSurf: Adaptor3d_Surface, theAlongU: boolean, theAngTol?: number): boolean;

  // Adaptor3d_HSurfaceTool.NbSamplesU (method)
  static NbSamplesU(S: Adaptor3d_Surface): number;
  static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

  // Adaptor3d_HSurfaceTool.NbSamplesV (method)
  static NbSamplesV(S: Adaptor3d_Surface): number;
  static NbSamplesV(argNo0: Adaptor3d_Surface, v1: number, v2: number): number;

  // Adaptor3d_HSurfaceTool.delete (method)
  delete(): void;

  // Adaptor3d_HSurfaceTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_HVertex: declare class Adaptor3d_HVertex extends Standard_Transient

  // Adaptor3d_HVertex.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt2d, Ori: TopAbs_Orientation, Resolution: number);

  // Adaptor3d_HVertex.Value (method)
  Value(): gp_Pnt2d;

  // Adaptor3d_HVertex.Parameter (method)
  Parameter(C: Adaptor2d_Curve2d): number;

  // Adaptor3d_HVertex.Resolution (method)
  Resolution(C: Adaptor2d_Curve2d): number;

  // Adaptor3d_HVertex.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // Adaptor3d_HVertex.IsSame (method)
  IsSame(Other: Adaptor3d_HVertex): boolean;

  // Adaptor3d_HVertex.get_type_name (method)
  static get_type_name(): string;

  // Adaptor3d_HVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor3d_HVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor3d_HVertex.delete (method)
  delete(): void;

  // Adaptor3d_HVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_InterFunc: declare class Adaptor3d_InterFunc extends math_FunctionWithDerivative

  // Adaptor3d_InterFunc.constructor (constructor)
  constructor(C: Adaptor2d_Curve2d, FixVal: number, Fix: number);

  // Adaptor3d_InterFunc.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Adaptor3d_InterFunc.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Adaptor3d_InterFunc.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Adaptor3d_InterFunc.delete (method)
  delete(): void;

  // Adaptor3d_InterFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_IsoCurve: declare class Adaptor3d_IsoCurve extends Adaptor3d_Curve

  // Adaptor3d_IsoCurve.constructor (constructor)
  constructor();
  constructor(S: Adaptor3d_Surface);
  constructor(S: Adaptor3d_Surface, Iso: GeomAbs_IsoType, Param: number);
  constructor(S: Adaptor3d_Surface, Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number);

  // Adaptor3d_IsoCurve.get_type_name (method)
  static get_type_name(): string;

  // Adaptor3d_IsoCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor3d_IsoCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor3d_IsoCurve.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // Adaptor3d_IsoCurve.Load (method)
  Load(S: Adaptor3d_Surface): void;
  Load(Iso: GeomAbs_IsoType, Param: number): void;
  Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;

  // Adaptor3d_IsoCurve.Surface (method)
  Surface(): Adaptor3d_Surface;

  // Adaptor3d_IsoCurve.Iso (method)
  Iso(): GeomAbs_IsoType;

  // Adaptor3d_IsoCurve.Parameter (method)
  Parameter(): number;

  // Adaptor3d_IsoCurve.FirstParameter (method)
  FirstParameter(): number;

  // Adaptor3d_IsoCurve.LastParameter (method)
  LastParameter(): number;

  // Adaptor3d_IsoCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Adaptor3d_IsoCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Adaptor3d_IsoCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor3d_IsoCurve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // Adaptor3d_IsoCurve.IsClosed (method)
  IsClosed(): boolean;

  // Adaptor3d_IsoCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Adaptor3d_IsoCurve.Period (method)
  Period(): number;

  // Adaptor3d_IsoCurve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // Adaptor3d_IsoCurve.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // Adaptor3d_IsoCurve.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // Adaptor3d_IsoCurve.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // Adaptor3d_IsoCurve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // Adaptor3d_IsoCurve.Resolution (method)
  Resolution(R3d: number): number;

  // Adaptor3d_IsoCurve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // Adaptor3d_IsoCurve.Line (method)
  Line(): gp_Lin;

  // Adaptor3d_IsoCurve.Circle (method)
  Circle(): gp_Circ;

  // Adaptor3d_IsoCurve.Ellipse (method)
  Ellipse(): gp_Elips;

  // Adaptor3d_IsoCurve.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // Adaptor3d_IsoCurve.Parabola (method)
  Parabola(): gp_Parab;

  // Adaptor3d_IsoCurve.Degree (method)
  Degree(): number;

  // Adaptor3d_IsoCurve.IsRational (method)
  IsRational(): boolean;

  // Adaptor3d_IsoCurve.NbPoles (method)
  NbPoles(): number;

  // Adaptor3d_IsoCurve.NbKnots (method)
  NbKnots(): number;

  // Adaptor3d_IsoCurve.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // Adaptor3d_IsoCurve.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // Adaptor3d_IsoCurve.delete (method)
  delete(): void;

  // Adaptor3d_IsoCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_Surface: declare class Adaptor3d_Surface extends Standard_Transient

  // Adaptor3d_Surface.constructor (constructor)
  constructor();

  // Adaptor3d_Surface.get_type_name (method)
  static get_type_name(): string;

  // Adaptor3d_Surface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor3d_Surface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor3d_Surface.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Surface;

  // Adaptor3d_Surface.FirstUParameter (method)
  FirstUParameter(): number;

  // Adaptor3d_Surface.LastUParameter (method)
  LastUParameter(): number;

  // Adaptor3d_Surface.FirstVParameter (method)
  FirstVParameter(): number;

  // Adaptor3d_Surface.LastVParameter (method)
  LastVParameter(): number;

  // Adaptor3d_Surface.UContinuity (method)
  UContinuity(): GeomAbs_Shape;

  // Adaptor3d_Surface.VContinuity (method)
  VContinuity(): GeomAbs_Shape;

  // Adaptor3d_Surface.NbUIntervals (method)
  NbUIntervals(S: GeomAbs_Shape): number;

  // Adaptor3d_Surface.NbVIntervals (method)
  NbVIntervals(S: GeomAbs_Shape): number;

  // Adaptor3d_Surface.UIntervals (method)
  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor3d_Surface.VIntervals (method)
  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Adaptor3d_Surface.UTrim (method)
  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // Adaptor3d_Surface.VTrim (method)
  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // Adaptor3d_Surface.IsUClosed (method)
  IsUClosed(): boolean;

  // Adaptor3d_Surface.IsVClosed (method)
  IsVClosed(): boolean;

  // Adaptor3d_Surface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Adaptor3d_Surface.UPeriod (method)
  UPeriod(): number;

  // Adaptor3d_Surface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Adaptor3d_Surface.VPeriod (method)
  VPeriod(): number;

  // Adaptor3d_Surface.Value (method)
  Value(theU: number, theV: number): gp_Pnt;

  // Adaptor3d_Surface.D0 (method)
  D0(theU: number, theV: number, theP: gp_Pnt): void;

  // Adaptor3d_Surface.D1 (method)
  D1(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec): void;

  // Adaptor3d_Surface.D2 (method)
  D2(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec): void;

  // Adaptor3d_Surface.D3 (method)
  D3(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec, theD3U: gp_Vec, theD3V: gp_Vec, theD3UUV: gp_Vec, theD3UVV: gp_Vec): void;

  // Adaptor3d_Surface.DN (method)
  DN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

  // Adaptor3d_Surface.UResolution (method)
  UResolution(R3d: number): number;

  // Adaptor3d_Surface.VResolution (method)
  VResolution(R3d: number): number;

  // Adaptor3d_Surface.GetType (method)
  GetType(): GeomAbs_SurfaceType;

  // Adaptor3d_Surface.Plane (method)
  Plane(): gp_Pln;

  // Adaptor3d_Surface.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // Adaptor3d_Surface.Cone (method)
  Cone(): gp_Cone;

  // Adaptor3d_Surface.Sphere (method)
  Sphere(): gp_Sphere;

  // Adaptor3d_Surface.Torus (method)
  Torus(): gp_Torus;

  // Adaptor3d_Surface.UDegree (method)
  UDegree(): number;

  // Adaptor3d_Surface.NbUPoles (method)
  NbUPoles(): number;

  // Adaptor3d_Surface.VDegree (method)
  VDegree(): number;

  // Adaptor3d_Surface.NbVPoles (method)
  NbVPoles(): number;

  // Adaptor3d_Surface.NbUKnots (method)
  NbUKnots(): number;

  // Adaptor3d_Surface.NbVKnots (method)
  NbVKnots(): number;

  // Adaptor3d_Surface.IsURational (method)
  IsURational(): boolean;

  // Adaptor3d_Surface.IsVRational (method)
  IsVRational(): boolean;

  // Adaptor3d_Surface.Bezier (method)
  Bezier(): Geom_BezierSurface;

  // Adaptor3d_Surface.BSpline (method)
  BSpline(): Geom_BSplineSurface;

  // Adaptor3d_Surface.AxeOfRevolution (method)
  AxeOfRevolution(): gp_Ax1;

  // Adaptor3d_Surface.Direction (method)
  Direction(): gp_Dir;

  // Adaptor3d_Surface.BasisCurve (method)
  BasisCurve(): Adaptor3d_Curve;

  // Adaptor3d_Surface.BasisSurface (method)
  BasisSurface(): Adaptor3d_Surface;

  // Adaptor3d_Surface.OffsetValue (method)
  OffsetValue(): number;

  // Adaptor3d_Surface.EvalD0 (method)
  EvalD0(theU: number, theV: number): gp_Pnt;

  // Adaptor3d_Surface.EvalD1 (method)
  EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

  // Adaptor3d_Surface.EvalD2 (method)
  EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

  // Adaptor3d_Surface.EvalD3 (method)
  EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

  // Adaptor3d_Surface.EvalDN (method)
  EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

  // Adaptor3d_Surface.delete (method)
  delete(): void;

  // Adaptor3d_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Adaptor3d_TopolTool: declare class Adaptor3d_TopolTool extends Standard_Transient

  // Adaptor3d_TopolTool.constructor (constructor)
  constructor();
  constructor(Surface: Adaptor3d_Surface);

  // Adaptor3d_TopolTool.Initialize (method)
  Initialize(): void;
  Initialize(S: Adaptor3d_Surface): void;
  Initialize(Curve: Adaptor2d_Curve2d): void;

  // Adaptor3d_TopolTool.Init (method)
  Init(): void;

  // Adaptor3d_TopolTool.More (method)
  More(): boolean;

  // Adaptor3d_TopolTool.Value (method)
  Value(): Adaptor2d_Curve2d;

  // Adaptor3d_TopolTool.Next (method)
  Next(): void;

  // Adaptor3d_TopolTool.InitVertexIterator (method)
  InitVertexIterator(): void;

  // Adaptor3d_TopolTool.MoreVertex (method)
  MoreVertex(): boolean;

  // Adaptor3d_TopolTool.Vertex (method)
  Vertex(): Adaptor3d_HVertex;

  // Adaptor3d_TopolTool.NextVertex (method)
  NextVertex(): void;

  // Adaptor3d_TopolTool.Classify (method)
  Classify(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): TopAbs_State;

  // Adaptor3d_TopolTool.IsThePointOn (method)
  IsThePointOn(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): boolean;

  // Adaptor3d_TopolTool.Orientation (method)
  Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
  Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;

  // Adaptor3d_TopolTool.Identical (method)
  Identical(V1: Adaptor3d_HVertex, V2: Adaptor3d_HVertex): boolean;

  // Adaptor3d_TopolTool.Has3d (method)
  Has3d(): boolean;

  // Adaptor3d_TopolTool.Tol3d (method)
  Tol3d(C: Adaptor2d_Curve2d): number;
  Tol3d(V: Adaptor3d_HVertex): number;

  // Adaptor3d_TopolTool.Pnt (method)
  Pnt(V: Adaptor3d_HVertex): gp_Pnt;

  // Adaptor3d_TopolTool.ComputeSamplePoints (method)
  ComputeSamplePoints(): void;

  // Adaptor3d_TopolTool.NbSamplesU (method)
  NbSamplesU(): number;

  // Adaptor3d_TopolTool.NbSamplesV (method)
  NbSamplesV(): number;

  // Adaptor3d_TopolTool.NbSamples (method)
  NbSamples(): number;

  // Adaptor3d_TopolTool.UParameters (method)
  UParameters(theArray: NCollection_Array1_double): void;

  // Adaptor3d_TopolTool.VParameters (method)
  VParameters(theArray: NCollection_Array1_double): void;

  // Adaptor3d_TopolTool.SamplePoint (method)
  SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

  // Adaptor3d_TopolTool.DomainIsInfinite (method)
  DomainIsInfinite(): boolean;

  // Adaptor3d_TopolTool.SamplePnts (method)
  SamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

  // Adaptor3d_TopolTool.BSplSamplePnts (method)
  BSplSamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

  // Adaptor3d_TopolTool.IsUniformSampling (method)
  IsUniformSampling(): boolean;

  // Adaptor3d_TopolTool.GetConeApexParam (method)
  static GetConeApexParam(theC: gp_Cone, theU?: number, theV?: number): { theU: number; theV: number };

  // Adaptor3d_TopolTool.get_type_name (method)
  static get_type_name(): string;

  // Adaptor3d_TopolTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Adaptor3d_TopolTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // Adaptor3d_TopolTool.delete (method)
  delete(): void;

  // Adaptor3d_TopolTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
