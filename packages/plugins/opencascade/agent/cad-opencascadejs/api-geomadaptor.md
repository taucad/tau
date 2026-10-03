# libcascade — GeomAdaptor

15 top-level symbols. Signatures are verbatim typescript.

GeomAdaptor: declare class GeomAdaptor

  // GeomAdaptor.constructor (constructor)
  constructor();

  // GeomAdaptor.MakeCurve (method)
  static MakeCurve(C: Adaptor3d_Curve): Geom_Curve;

  // GeomAdaptor.MakeSurface (method)
  static MakeSurface(theS: Adaptor3d_Surface, theTrimFlag?: boolean): Geom_Surface;

  // GeomAdaptor.delete (method)
  delete(): void;

  // GeomAdaptor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_Curve: declare class GeomAdaptor_Curve extends Adaptor3d_Curve

  // GeomAdaptor_Curve.constructor (constructor)
  constructor();
  constructor(theCurve: Geom_Curve);
  constructor(theCurve: Geom_Curve, theUFirst: number, theULast: number);

  // GeomAdaptor_Curve.get_type_name (method)
  static get_type_name(): string;

  // GeomAdaptor_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomAdaptor_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomAdaptor_Curve.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // GeomAdaptor_Curve.Reset (method)
  Reset(): void;

  // GeomAdaptor_Curve.Load (method)
  Load(theCurve: Geom_Curve): void;
  Load(theCurve: Geom_Curve, theUFirst: number, theULast: number): void;

  // GeomAdaptor_Curve.Curve (method)
  Curve(): Geom_Curve;

  // GeomAdaptor_Curve.FirstParameter (method)
  FirstParameter(): number;

  // GeomAdaptor_Curve.LastParameter (method)
  LastParameter(): number;

  // GeomAdaptor_Curve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomAdaptor_Curve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_Curve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_Curve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // GeomAdaptor_Curve.IsClosed (method)
  IsClosed(): boolean;

  // GeomAdaptor_Curve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomAdaptor_Curve.Period (method)
  Period(): number;

  // GeomAdaptor_Curve.Resolution (method)
  Resolution(R3d: number): number;

  // GeomAdaptor_Curve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // GeomAdaptor_Curve.Line (method)
  Line(): gp_Lin;

  // GeomAdaptor_Curve.Circle (method)
  Circle(): gp_Circ;

  // GeomAdaptor_Curve.Ellipse (method)
  Ellipse(): gp_Elips;

  // GeomAdaptor_Curve.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // GeomAdaptor_Curve.Parabola (method)
  Parabola(): gp_Parab;

  // GeomAdaptor_Curve.Degree (method)
  Degree(): number;

  // GeomAdaptor_Curve.IsRational (method)
  IsRational(): boolean;

  // GeomAdaptor_Curve.NbPoles (method)
  NbPoles(): number;

  // GeomAdaptor_Curve.NbKnots (method)
  NbKnots(): number;

  // GeomAdaptor_Curve.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // GeomAdaptor_Curve.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // GeomAdaptor_Curve.OffsetCurve (method)
  OffsetCurve(): Geom_OffsetCurve;

  // GeomAdaptor_Curve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // GeomAdaptor_Curve.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // GeomAdaptor_Curve.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // GeomAdaptor_Curve.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // GeomAdaptor_Curve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // GeomAdaptor_Curve.delete (method)
  delete(): void;

  // GeomAdaptor_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_Surface: declare class GeomAdaptor_Surface extends Adaptor3d_Surface

  // GeomAdaptor_Surface.constructor (constructor)
  constructor();
  constructor(theSurf: Geom_Surface);
  constructor(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU?: number, theTolV?: number);

  // GeomAdaptor_Surface.get_type_name (method)
  static get_type_name(): string;

  // GeomAdaptor_Surface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomAdaptor_Surface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomAdaptor_Surface.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Surface;

  // GeomAdaptor_Surface.Load (method)
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

  // GeomAdaptor_Surface.Surface (method)
  Surface(): Geom_Surface;

  // GeomAdaptor_Surface.FirstUParameter (method)
  FirstUParameter(): number;

  // GeomAdaptor_Surface.LastUParameter (method)
  LastUParameter(): number;

  // GeomAdaptor_Surface.FirstVParameter (method)
  FirstVParameter(): number;

  // GeomAdaptor_Surface.LastVParameter (method)
  LastVParameter(): number;

  // GeomAdaptor_Surface.Bounds (method)
  Bounds(theU1?: number, theU2?: number, theV1?: number, theV2?: number): { theU1: number; theU2: number; theV1: number; theV2: number };

  // GeomAdaptor_Surface.ToleranceU (method)
  ToleranceU(): number;

  // GeomAdaptor_Surface.ToleranceV (method)
  ToleranceV(): number;

  // GeomAdaptor_Surface.UContinuity (method)
  UContinuity(): GeomAbs_Shape;

  // GeomAdaptor_Surface.VContinuity (method)
  VContinuity(): GeomAbs_Shape;

  // GeomAdaptor_Surface.NbUIntervals (method)
  NbUIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_Surface.NbVIntervals (method)
  NbVIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_Surface.UIntervals (method)
  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_Surface.VIntervals (method)
  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_Surface.UTrim (method)
  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_Surface.VTrim (method)
  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_Surface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomAdaptor_Surface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomAdaptor_Surface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomAdaptor_Surface.UPeriod (method)
  UPeriod(): number;

  // GeomAdaptor_Surface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomAdaptor_Surface.VPeriod (method)
  VPeriod(): number;

  // GeomAdaptor_Surface.EvalD0 (method)
  EvalD0(theU: number, theV: number): gp_Pnt;

  // GeomAdaptor_Surface.EvalD1 (method)
  EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

  // GeomAdaptor_Surface.EvalD2 (method)
  EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

  // GeomAdaptor_Surface.EvalD3 (method)
  EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

  // GeomAdaptor_Surface.EvalDN (method)
  EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

  // GeomAdaptor_Surface.UResolution (method)
  UResolution(R3d: number): number;

  // GeomAdaptor_Surface.VResolution (method)
  VResolution(R3d: number): number;

  // GeomAdaptor_Surface.GetType (method)
  GetType(): GeomAbs_SurfaceType;

  // GeomAdaptor_Surface.Plane (method)
  Plane(): gp_Pln;

  // GeomAdaptor_Surface.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // GeomAdaptor_Surface.Cone (method)
  Cone(): gp_Cone;

  // GeomAdaptor_Surface.Sphere (method)
  Sphere(): gp_Sphere;

  // GeomAdaptor_Surface.Torus (method)
  Torus(): gp_Torus;

  // GeomAdaptor_Surface.UDegree (method)
  UDegree(): number;

  // GeomAdaptor_Surface.NbUPoles (method)
  NbUPoles(): number;

  // GeomAdaptor_Surface.VDegree (method)
  VDegree(): number;

  // GeomAdaptor_Surface.NbVPoles (method)
  NbVPoles(): number;

  // GeomAdaptor_Surface.NbUKnots (method)
  NbUKnots(): number;

  // GeomAdaptor_Surface.NbVKnots (method)
  NbVKnots(): number;

  // GeomAdaptor_Surface.IsURational (method)
  IsURational(): boolean;

  // GeomAdaptor_Surface.IsVRational (method)
  IsVRational(): boolean;

  // GeomAdaptor_Surface.Bezier (method)
  Bezier(): Geom_BezierSurface;

  // GeomAdaptor_Surface.BSpline (method)
  BSpline(): Geom_BSplineSurface;

  // GeomAdaptor_Surface.AxeOfRevolution (method)
  AxeOfRevolution(): gp_Ax1;

  // GeomAdaptor_Surface.Direction (method)
  Direction(): gp_Dir;

  // GeomAdaptor_Surface.BasisCurve (method)
  BasisCurve(): Adaptor3d_Curve;

  // GeomAdaptor_Surface.BasisSurface (method)
  BasisSurface(): Adaptor3d_Surface;

  // GeomAdaptor_Surface.OffsetValue (method)
  OffsetValue(): number;

  // GeomAdaptor_Surface.delete (method)
  delete(): void;

  // GeomAdaptor_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_SurfaceOfLinearExtrusion: declare class GeomAdaptor_SurfaceOfLinearExtrusion extends GeomAdaptor_Surface

  // GeomAdaptor_SurfaceOfLinearExtrusion.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve);
  constructor(C: Adaptor3d_Curve, V: gp_Dir);

  // GeomAdaptor_SurfaceOfLinearExtrusion.get_type_name (method)
  static get_type_name(): string;

  // GeomAdaptor_SurfaceOfLinearExtrusion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomAdaptor_SurfaceOfLinearExtrusion.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomAdaptor_SurfaceOfLinearExtrusion.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Surface;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Load (method)
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Dir): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

  // GeomAdaptor_SurfaceOfLinearExtrusion.FirstUParameter (method)
  FirstUParameter(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.LastUParameter (method)
  LastUParameter(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.FirstVParameter (method)
  FirstVParameter(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.LastVParameter (method)
  LastVParameter(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.UContinuity (method)
  UContinuity(): GeomAbs_Shape;

  // GeomAdaptor_SurfaceOfLinearExtrusion.VContinuity (method)
  VContinuity(): GeomAbs_Shape;

  // GeomAdaptor_SurfaceOfLinearExtrusion.NbUIntervals (method)
  NbUIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.NbVIntervals (method)
  NbVIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.UIntervals (method)
  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_SurfaceOfLinearExtrusion.VIntervals (method)
  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_SurfaceOfLinearExtrusion.UTrim (method)
  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_SurfaceOfLinearExtrusion.VTrim (method)
  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_SurfaceOfLinearExtrusion.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomAdaptor_SurfaceOfLinearExtrusion.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomAdaptor_SurfaceOfLinearExtrusion.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomAdaptor_SurfaceOfLinearExtrusion.UPeriod (method)
  UPeriod(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomAdaptor_SurfaceOfLinearExtrusion.VPeriod (method)
  VPeriod(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.UResolution (method)
  UResolution(R3d: number): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.VResolution (method)
  VResolution(R3d: number): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.GetType (method)
  GetType(): GeomAbs_SurfaceType;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Plane (method)
  Plane(): gp_Pln;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Cone (method)
  Cone(): gp_Cone;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Sphere (method)
  Sphere(): gp_Sphere;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Torus (method)
  Torus(): gp_Torus;

  // GeomAdaptor_SurfaceOfLinearExtrusion.UDegree (method)
  UDegree(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.NbUPoles (method)
  NbUPoles(): number;

  // GeomAdaptor_SurfaceOfLinearExtrusion.IsURational (method)
  IsURational(): boolean;

  // GeomAdaptor_SurfaceOfLinearExtrusion.IsVRational (method)
  IsVRational(): boolean;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Bezier (method)
  Bezier(): Geom_BezierSurface;

  // GeomAdaptor_SurfaceOfLinearExtrusion.BSpline (method)
  BSpline(): Geom_BSplineSurface;

  // GeomAdaptor_SurfaceOfLinearExtrusion.AxeOfRevolution (method)
  AxeOfRevolution(): gp_Ax1;

  // GeomAdaptor_SurfaceOfLinearExtrusion.Direction (method)
  Direction(): gp_Dir;

  // GeomAdaptor_SurfaceOfLinearExtrusion.BasisCurve (method)
  BasisCurve(): Adaptor3d_Curve;

  // GeomAdaptor_SurfaceOfLinearExtrusion.delete (method)
  delete(): void;

  // GeomAdaptor_SurfaceOfLinearExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_SurfaceOfRevolution: declare class GeomAdaptor_SurfaceOfRevolution extends GeomAdaptor_Surface

  // GeomAdaptor_SurfaceOfRevolution.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve);
  constructor(C: Adaptor3d_Curve, V: gp_Ax1);

  // GeomAdaptor_SurfaceOfRevolution.get_type_name (method)
  static get_type_name(): string;

  // GeomAdaptor_SurfaceOfRevolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomAdaptor_SurfaceOfRevolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomAdaptor_SurfaceOfRevolution.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Surface;

  // GeomAdaptor_SurfaceOfRevolution.Load (method)
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Ax1): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

  // GeomAdaptor_SurfaceOfRevolution.AxeOfRevolution (method)
  AxeOfRevolution(): gp_Ax1;

  // GeomAdaptor_SurfaceOfRevolution.FirstUParameter (method)
  FirstUParameter(): number;

  // GeomAdaptor_SurfaceOfRevolution.LastUParameter (method)
  LastUParameter(): number;

  // GeomAdaptor_SurfaceOfRevolution.FirstVParameter (method)
  FirstVParameter(): number;

  // GeomAdaptor_SurfaceOfRevolution.LastVParameter (method)
  LastVParameter(): number;

  // GeomAdaptor_SurfaceOfRevolution.UContinuity (method)
  UContinuity(): GeomAbs_Shape;

  // GeomAdaptor_SurfaceOfRevolution.VContinuity (method)
  VContinuity(): GeomAbs_Shape;

  // GeomAdaptor_SurfaceOfRevolution.NbUIntervals (method)
  NbUIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_SurfaceOfRevolution.NbVIntervals (method)
  NbVIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_SurfaceOfRevolution.UIntervals (method)
  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_SurfaceOfRevolution.VIntervals (method)
  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_SurfaceOfRevolution.UTrim (method)
  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_SurfaceOfRevolution.VTrim (method)
  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_SurfaceOfRevolution.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomAdaptor_SurfaceOfRevolution.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomAdaptor_SurfaceOfRevolution.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomAdaptor_SurfaceOfRevolution.UPeriod (method)
  UPeriod(): number;

  // GeomAdaptor_SurfaceOfRevolution.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomAdaptor_SurfaceOfRevolution.VPeriod (method)
  VPeriod(): number;

  // GeomAdaptor_SurfaceOfRevolution.UResolution (method)
  UResolution(R3d: number): number;

  // GeomAdaptor_SurfaceOfRevolution.VResolution (method)
  VResolution(R3d: number): number;

  // GeomAdaptor_SurfaceOfRevolution.GetType (method)
  GetType(): GeomAbs_SurfaceType;

  // GeomAdaptor_SurfaceOfRevolution.Plane (method)
  Plane(): gp_Pln;

  // GeomAdaptor_SurfaceOfRevolution.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // GeomAdaptor_SurfaceOfRevolution.Cone (method)
  Cone(): gp_Cone;

  // GeomAdaptor_SurfaceOfRevolution.Sphere (method)
  Sphere(): gp_Sphere;

  // GeomAdaptor_SurfaceOfRevolution.Torus (method)
  Torus(): gp_Torus;

  // GeomAdaptor_SurfaceOfRevolution.VDegree (method)
  VDegree(): number;

  // GeomAdaptor_SurfaceOfRevolution.NbVPoles (method)
  NbVPoles(): number;

  // GeomAdaptor_SurfaceOfRevolution.NbVKnots (method)
  NbVKnots(): number;

  // GeomAdaptor_SurfaceOfRevolution.IsURational (method)
  IsURational(): boolean;

  // GeomAdaptor_SurfaceOfRevolution.IsVRational (method)
  IsVRational(): boolean;

  // GeomAdaptor_SurfaceOfRevolution.Bezier (method)
  Bezier(): Geom_BezierSurface;

  // GeomAdaptor_SurfaceOfRevolution.BSpline (method)
  BSpline(): Geom_BSplineSurface;

  // GeomAdaptor_SurfaceOfRevolution.Axis (method)
  Axis(): gp_Ax3;

  // GeomAdaptor_SurfaceOfRevolution.BasisCurve (method)
  BasisCurve(): Adaptor3d_Curve;

  // GeomAdaptor_SurfaceOfRevolution.delete (method)
  delete(): void;

  // GeomAdaptor_SurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_TransformedCurve: declare class GeomAdaptor_TransformedCurve extends Adaptor3d_Curve

  // GeomAdaptor_TransformedCurve.constructor (constructor)
  constructor();
  constructor(theCurve: Geom_Curve, theTrsf: gp_Trsf);
  constructor(theCurve: Geom_Curve, theFirst: number, theLast: number, theTrsf: gp_Trsf);

  // GeomAdaptor_TransformedCurve.get_type_name (method)
  static get_type_name(): string;

  // GeomAdaptor_TransformedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomAdaptor_TransformedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomAdaptor_TransformedCurve.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // GeomAdaptor_TransformedCurve.Load (method)
  Load(theCurve: Geom_Curve): void;
  Load(theCurve: Geom_Curve, theFirst: number, theLast: number): void;

  // GeomAdaptor_TransformedCurve.LoadCurveOnSurface (method)
  LoadCurveOnSurface(theConSurf: Adaptor3d_CurveOnSurface): void;

  // GeomAdaptor_TransformedCurve.SetTrsf (method)
  SetTrsf(theTrsf: gp_Trsf): void;

  // GeomAdaptor_TransformedCurve.Trsf (method)
  Trsf(): gp_Trsf;

  // GeomAdaptor_TransformedCurve.Is3DCurve (method)
  Is3DCurve(): boolean;

  // GeomAdaptor_TransformedCurve.IsCurveOnSurface (method)
  IsCurveOnSurface(): boolean;

  // GeomAdaptor_TransformedCurve.Curve (method)
  Curve(): GeomAdaptor_Curve;

  // GeomAdaptor_TransformedCurve.ChangeCurve (method)
  ChangeCurve(): GeomAdaptor_Curve;

  // GeomAdaptor_TransformedCurve.CurveOnSurface (method)
  CurveOnSurface(): Adaptor3d_CurveOnSurface;

  // GeomAdaptor_TransformedCurve.GeomCurve (method)
  GeomCurve(): Geom_Curve;

  // GeomAdaptor_TransformedCurve.FirstParameter (method)
  FirstParameter(): number;

  // GeomAdaptor_TransformedCurve.LastParameter (method)
  LastParameter(): number;

  // GeomAdaptor_TransformedCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomAdaptor_TransformedCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_TransformedCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_TransformedCurve.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // GeomAdaptor_TransformedCurve.IsClosed (method)
  IsClosed(): boolean;

  // GeomAdaptor_TransformedCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomAdaptor_TransformedCurve.Period (method)
  Period(): number;

  // GeomAdaptor_TransformedCurve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // GeomAdaptor_TransformedCurve.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // GeomAdaptor_TransformedCurve.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // GeomAdaptor_TransformedCurve.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // GeomAdaptor_TransformedCurve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // GeomAdaptor_TransformedCurve.Resolution (method)
  Resolution(R3d: number): number;

  // GeomAdaptor_TransformedCurve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // GeomAdaptor_TransformedCurve.Line (method)
  Line(): gp_Lin;

  // GeomAdaptor_TransformedCurve.Circle (method)
  Circle(): gp_Circ;

  // GeomAdaptor_TransformedCurve.Ellipse (method)
  Ellipse(): gp_Elips;

  // GeomAdaptor_TransformedCurve.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // GeomAdaptor_TransformedCurve.Parabola (method)
  Parabola(): gp_Parab;

  // GeomAdaptor_TransformedCurve.Degree (method)
  Degree(): number;

  // GeomAdaptor_TransformedCurve.IsRational (method)
  IsRational(): boolean;

  // GeomAdaptor_TransformedCurve.NbPoles (method)
  NbPoles(): number;

  // GeomAdaptor_TransformedCurve.NbKnots (method)
  NbKnots(): number;

  // GeomAdaptor_TransformedCurve.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // GeomAdaptor_TransformedCurve.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // GeomAdaptor_TransformedCurve.OffsetCurve (method)
  OffsetCurve(): Geom_OffsetCurve;

  // GeomAdaptor_TransformedCurve.delete (method)
  delete(): void;

  // GeomAdaptor_TransformedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_TransformedSurface: declare class GeomAdaptor_TransformedSurface extends Adaptor3d_Surface

  // GeomAdaptor_TransformedSurface.constructor (constructor)
  constructor();
  constructor(theSurface: Geom_Surface, theTrsf: gp_Trsf);
  constructor(theSurface: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTrsf: gp_Trsf, theTolU?: number, theTolV?: number);

  // GeomAdaptor_TransformedSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomAdaptor_TransformedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomAdaptor_TransformedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomAdaptor_TransformedSurface.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Surface;

  // GeomAdaptor_TransformedSurface.Load (method)
  Load(theSurface: Geom_Surface, theTrsf: gp_Trsf): void;
  Load(theSurface: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTrsf: gp_Trsf, theTolU: number, theTolV: number): void;

  // GeomAdaptor_TransformedSurface.SetTrsf (method)
  SetTrsf(theTrsf: gp_Trsf): void;

  // GeomAdaptor_TransformedSurface.HasTrsf (method)
  HasTrsf(): boolean;

  // GeomAdaptor_TransformedSurface.Trsf (method)
  Trsf(): gp_Trsf;

  // GeomAdaptor_TransformedSurface.Surface (method)
  Surface(): GeomAdaptor_Surface;

  // DEPRECATED
  // GeomAdaptor_TransformedSurface.AdaptorSurfaceOriginal (method)
  AdaptorSurfaceOriginal(): GeomAdaptor_Surface;

  // GeomAdaptor_TransformedSurface.AdaptorSurfaceTransformed (method)
  AdaptorSurfaceTransformed(): GeomAdaptor_Surface;

  // GeomAdaptor_TransformedSurface.GeomSurfaceOriginal (method)
  GeomSurfaceOriginal(): Geom_Surface;

  // GeomAdaptor_TransformedSurface.GeomSurfaceTransformed (method)
  GeomSurfaceTransformed(): Geom_Surface;

  // DEPRECATED
  // GeomAdaptor_TransformedSurface.GeomSurface (method)
  GeomSurface(): Geom_Surface;

  // GeomAdaptor_TransformedSurface.FirstUParameter (method)
  FirstUParameter(): number;

  // GeomAdaptor_TransformedSurface.LastUParameter (method)
  LastUParameter(): number;

  // GeomAdaptor_TransformedSurface.FirstVParameter (method)
  FirstVParameter(): number;

  // GeomAdaptor_TransformedSurface.LastVParameter (method)
  LastVParameter(): number;

  // GeomAdaptor_TransformedSurface.UContinuity (method)
  UContinuity(): GeomAbs_Shape;

  // GeomAdaptor_TransformedSurface.VContinuity (method)
  VContinuity(): GeomAbs_Shape;

  // GeomAdaptor_TransformedSurface.NbUIntervals (method)
  NbUIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_TransformedSurface.NbVIntervals (method)
  NbVIntervals(S: GeomAbs_Shape): number;

  // GeomAdaptor_TransformedSurface.UIntervals (method)
  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_TransformedSurface.VIntervals (method)
  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomAdaptor_TransformedSurface.UTrim (method)
  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_TransformedSurface.VTrim (method)
  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // GeomAdaptor_TransformedSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomAdaptor_TransformedSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomAdaptor_TransformedSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomAdaptor_TransformedSurface.UPeriod (method)
  UPeriod(): number;

  // GeomAdaptor_TransformedSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomAdaptor_TransformedSurface.VPeriod (method)
  VPeriod(): number;

  // GeomAdaptor_TransformedSurface.ToleranceU (method)
  ToleranceU(): number;

  // GeomAdaptor_TransformedSurface.ToleranceV (method)
  ToleranceV(): number;

  // GeomAdaptor_TransformedSurface.EvalD0 (method)
  EvalD0(theU: number, theV: number): gp_Pnt;

  // GeomAdaptor_TransformedSurface.EvalD1 (method)
  EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

  // GeomAdaptor_TransformedSurface.EvalD2 (method)
  EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

  // GeomAdaptor_TransformedSurface.EvalD3 (method)
  EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

  // GeomAdaptor_TransformedSurface.EvalDN (method)
  EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

  // GeomAdaptor_TransformedSurface.UResolution (method)
  UResolution(R3d: number): number;

  // GeomAdaptor_TransformedSurface.VResolution (method)
  VResolution(R3d: number): number;

  // GeomAdaptor_TransformedSurface.GetType (method)
  GetType(): GeomAbs_SurfaceType;

  // GeomAdaptor_TransformedSurface.Plane (method)
  Plane(): gp_Pln;

  // GeomAdaptor_TransformedSurface.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // GeomAdaptor_TransformedSurface.Cone (method)
  Cone(): gp_Cone;

  // GeomAdaptor_TransformedSurface.Sphere (method)
  Sphere(): gp_Sphere;

  // GeomAdaptor_TransformedSurface.Torus (method)
  Torus(): gp_Torus;

  // GeomAdaptor_TransformedSurface.UDegree (method)
  UDegree(): number;

  // GeomAdaptor_TransformedSurface.NbUPoles (method)
  NbUPoles(): number;

  // GeomAdaptor_TransformedSurface.VDegree (method)
  VDegree(): number;

  // GeomAdaptor_TransformedSurface.NbVPoles (method)
  NbVPoles(): number;

  // GeomAdaptor_TransformedSurface.NbUKnots (method)
  NbUKnots(): number;

  // GeomAdaptor_TransformedSurface.NbVKnots (method)
  NbVKnots(): number;

  // GeomAdaptor_TransformedSurface.IsURational (method)
  IsURational(): boolean;

  // GeomAdaptor_TransformedSurface.IsVRational (method)
  IsVRational(): boolean;

  // GeomAdaptor_TransformedSurface.Bezier (method)
  Bezier(): Geom_BezierSurface;

  // GeomAdaptor_TransformedSurface.BSpline (method)
  BSpline(): Geom_BSplineSurface;

  // GeomAdaptor_TransformedSurface.AxeOfRevolution (method)
  AxeOfRevolution(): gp_Ax1;

  // GeomAdaptor_TransformedSurface.Direction (method)
  Direction(): gp_Dir;

  // GeomAdaptor_TransformedSurface.BasisCurve (method)
  BasisCurve(): Adaptor3d_Curve;

  // GeomAdaptor_TransformedSurface.BasisSurface (method)
  BasisSurface(): Adaptor3d_Surface;

  // GeomAdaptor_TransformedSurface.OffsetValue (method)
  OffsetValue(): number;

  // GeomAdaptor_TransformedSurface.delete (method)
  delete(): void;

  // GeomAdaptor_TransformedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAdaptor_Curve_OffsetData: interface GeomAdaptor_Curve_OffsetData

  BasisAdaptor: GeomAdaptor_Curve

  Offset: number

  Direction: gp_Dir

  EvalRep: GeomEval_RepCurveDesc_Base

GeomAdaptor_Curve_BezierData: interface GeomAdaptor_Curve_BezierData

  Curve: Geom_BezierCurve

  Cache: BSplCLib_Cache

  EvalRep: GeomEval_RepCurveDesc_Base

GeomAdaptor_Curve_BSplineData: interface GeomAdaptor_Curve_BSplineData

  Curve: Geom_BSplineCurve

  Cache: BSplCLib_Cache

  EvalRep: GeomEval_RepCurveDesc_Base

GeomAdaptor_Surface_ExtrusionData: interface GeomAdaptor_Surface_ExtrusionData

  BasisCurve: Adaptor3d_Curve

  Direction: gp_XYZ

  EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_RevolutionData: interface GeomAdaptor_Surface_RevolutionData

  BasisCurve: Adaptor3d_Curve

  Axis: gp_Ax1

  EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_OffsetData: interface GeomAdaptor_Surface_OffsetData

  BasisAdaptor: GeomAdaptor_Surface

  EquivalentAdaptor: GeomAdaptor_Surface

  OffsetSurface: Geom_OffsetSurface

  Offset: number

  EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_BezierData: interface GeomAdaptor_Surface_BezierData

  Surface: Geom_BezierSurface

  Cache: BSplSLib_Cache

  EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_BSplineData: interface GeomAdaptor_Surface_BSplineData

  Surface: Geom_BSplineSurface

  Cache: BSplSLib_Cache

  EvalRep: GeomEval_RepSurfaceDesc_Base
