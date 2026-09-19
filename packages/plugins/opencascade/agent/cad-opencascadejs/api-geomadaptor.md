# libcascade — GeomAdaptor

15 top-level symbols. Signatures are verbatim typescript.

GeomAdaptor: declare class GeomAdaptor

  constructor

  static MakeCurve(C: Adaptor3d_Curve): Geom_Curve;

  static MakeSurface(theS: Adaptor3d_Surface, theTrimFlag?: boolean): Geom_Surface;

  delete(): void;

  [Symbol.dispose](): void;

GeomAdaptor_Curve: declare class GeomAdaptor_Curve extends Adaptor3d_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Curve;

  Reset(): void;

  Load(theCurve: Geom_Curve): void;
  Load(theCurve: Geom_Curve, theUFirst: number, theULast: number): void;
  Load(theCurve: Geom_Curve): void;
  Load(theCurve: Geom_Curve, theUFirst: number, theULast: number): void;

  Curve(): Geom_Curve;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  Ellipse(): gp_Elips;

  Hyperbola(): gp_Hypr;

  Parabola(): gp_Parab;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  Bezier(): Geom_BezierCurve;

  BSpline(): Geom_BSplineCurve;

  OffsetCurve(): Geom_OffsetCurve;

  EvalD0(theU: number): gp_Pnt;

  EvalD1(theU: number): Geom_Curve_ResD1;

  EvalD2(theU: number): Geom_Curve_ResD2;

  EvalD3(theU: number): Geom_Curve_ResD3;

  EvalDN(theU: number, theN: number): gp_Vec;

  delete(): void;

  [Symbol.dispose](): void;

GeomAdaptor_Surface: declare class GeomAdaptor_Surface extends Adaptor3d_Surface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Surface;

  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

  Surface(): Geom_Surface;

  FirstUParameter(): number;

  LastUParameter(): number;

  FirstVParameter(): number;

  LastVParameter(): number;

  Bounds(theU1?: number, theU2?: number, theV1?: number, theV2?: number): { theU1: number; theU2: number; theV1: number; theV2: number };

  ToleranceU(): number;

  ToleranceV(): number;

  UContinuity(): GeomAbs_Shape;

  VContinuity(): GeomAbs_Shape;

  NbUIntervals(S: GeomAbs_Shape): number;

  NbVIntervals(S: GeomAbs_Shape): number;

  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

  EvalD0(theU: number, theV: number): gp_Pnt;

  EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

  EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

  EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

  EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

  UResolution(R3d: number): number;

  VResolution(R3d: number): number;

  GetType(): GeomAbs_SurfaceType;

  Plane(): gp_Pln;

  Cylinder(): gp_Cylinder;

  Cone(): gp_Cone;

  Sphere(): gp_Sphere;

  Torus(): gp_Torus;

  UDegree(): number;

  NbUPoles(): number;

  VDegree(): number;

  NbVPoles(): number;

  NbUKnots(): number;

  NbVKnots(): number;

  IsURational(): boolean;

  IsVRational(): boolean;

  Bezier(): Geom_BezierSurface;

  BSpline(): Geom_BSplineSurface;

  AxeOfRevolution(): gp_Ax1;

  Direction(): gp_Dir;

  BasisCurve(): Adaptor3d_Curve;

  BasisSurface(): Adaptor3d_Surface;

  OffsetValue(): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomAdaptor_SurfaceOfLinearExtrusion: declare class GeomAdaptor_SurfaceOfLinearExtrusion extends GeomAdaptor_Surface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Surface;

  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Dir): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Dir): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Dir): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Dir): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

  FirstUParameter(): number;

  LastUParameter(): number;

  FirstVParameter(): number;

  LastVParameter(): number;

  UContinuity(): GeomAbs_Shape;

  VContinuity(): GeomAbs_Shape;

  NbUIntervals(S: GeomAbs_Shape): number;

  NbVIntervals(S: GeomAbs_Shape): number;

  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

  UResolution(R3d: number): number;

  VResolution(R3d: number): number;

  GetType(): GeomAbs_SurfaceType;

  Plane(): gp_Pln;

  Cylinder(): gp_Cylinder;

  Cone(): gp_Cone;

  Sphere(): gp_Sphere;

  Torus(): gp_Torus;

  UDegree(): number;

  NbUPoles(): number;

  IsURational(): boolean;

  IsVRational(): boolean;

  Bezier(): Geom_BezierSurface;

  BSpline(): Geom_BSplineSurface;

  AxeOfRevolution(): gp_Ax1;

  Direction(): gp_Dir;

  BasisCurve(): Adaptor3d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

GeomAdaptor_SurfaceOfRevolution: declare class GeomAdaptor_SurfaceOfRevolution extends GeomAdaptor_Surface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Surface;

  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Ax1): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Ax1): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Ax1): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;
  Load(C: Adaptor3d_Curve): void;
  Load(V: gp_Ax1): void;
  Load(theSurf: Geom_Surface): void;
  Load(theSurf: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTolU: number, theTolV: number): void;

  AxeOfRevolution(): gp_Ax1;

  FirstUParameter(): number;

  LastUParameter(): number;

  FirstVParameter(): number;

  LastVParameter(): number;

  UContinuity(): GeomAbs_Shape;

  VContinuity(): GeomAbs_Shape;

  NbUIntervals(S: GeomAbs_Shape): number;

  NbVIntervals(S: GeomAbs_Shape): number;

  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

  UResolution(R3d: number): number;

  VResolution(R3d: number): number;

  GetType(): GeomAbs_SurfaceType;

  Plane(): gp_Pln;

  Cylinder(): gp_Cylinder;

  Cone(): gp_Cone;

  Sphere(): gp_Sphere;

  Torus(): gp_Torus;

  VDegree(): number;

  NbVPoles(): number;

  NbVKnots(): number;

  IsURational(): boolean;

  IsVRational(): boolean;

  Bezier(): Geom_BezierSurface;

  BSpline(): Geom_BSplineSurface;

  Axis(): gp_Ax3;

  BasisCurve(): Adaptor3d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

GeomAdaptor_TransformedCurve: declare class GeomAdaptor_TransformedCurve extends Adaptor3d_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Curve;

  Load(theCurve: Geom_Curve): void;
  Load(theCurve: Geom_Curve, theFirst: number, theLast: number): void;
  Load(theCurve: Geom_Curve): void;
  Load(theCurve: Geom_Curve, theFirst: number, theLast: number): void;

  LoadCurveOnSurface(theConSurf: Adaptor3d_CurveOnSurface): void;

  SetTrsf(theTrsf: gp_Trsf): void;

  Trsf(): gp_Trsf;

  Is3DCurve(): boolean;

  IsCurveOnSurface(): boolean;

  Curve(): GeomAdaptor_Curve;

  ChangeCurve(): GeomAdaptor_Curve;

  CurveOnSurface(): Adaptor3d_CurveOnSurface;

  GeomCurve(): Geom_Curve;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  EvalD0(theU: number): gp_Pnt;

  EvalD1(theU: number): Geom_Curve_ResD1;

  EvalD2(theU: number): Geom_Curve_ResD2;

  EvalD3(theU: number): Geom_Curve_ResD3;

  EvalDN(theU: number, theN: number): gp_Vec;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  Ellipse(): gp_Elips;

  Hyperbola(): gp_Hypr;

  Parabola(): gp_Parab;

  Degree(): number;

  IsRational(): boolean;

  NbPoles(): number;

  NbKnots(): number;

  Bezier(): Geom_BezierCurve;

  BSpline(): Geom_BSplineCurve;

  OffsetCurve(): Geom_OffsetCurve;

  delete(): void;

  [Symbol.dispose](): void;

GeomAdaptor_TransformedSurface: declare class GeomAdaptor_TransformedSurface extends Adaptor3d_Surface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Surface;

  Load(theSurface: Geom_Surface, theTrsf: gp_Trsf): void;
  Load(theSurface: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTrsf: gp_Trsf, theTolU: number, theTolV: number): void;
  Load(theSurface: Geom_Surface, theTrsf: gp_Trsf): void;
  Load(theSurface: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTrsf: gp_Trsf, theTolU: number, theTolV: number): void;

  SetTrsf(theTrsf: gp_Trsf): void;

  HasTrsf(): boolean;

  Trsf(): gp_Trsf;

  Surface(): GeomAdaptor_Surface;

  // DEPRECATED
  AdaptorSurfaceOriginal(): GeomAdaptor_Surface;

  AdaptorSurfaceTransformed(): GeomAdaptor_Surface;

  GeomSurfaceOriginal(): Geom_Surface;

  GeomSurfaceTransformed(): Geom_Surface;

  // DEPRECATED
  GeomSurface(): Geom_Surface;

  FirstUParameter(): number;

  LastUParameter(): number;

  FirstVParameter(): number;

  LastVParameter(): number;

  UContinuity(): GeomAbs_Shape;

  VContinuity(): GeomAbs_Shape;

  NbUIntervals(S: GeomAbs_Shape): number;

  NbVIntervals(S: GeomAbs_Shape): number;

  UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

  ToleranceU(): number;

  ToleranceV(): number;

  EvalD0(theU: number, theV: number): gp_Pnt;

  EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

  EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

  EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

  EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

  UResolution(R3d: number): number;

  VResolution(R3d: number): number;

  GetType(): GeomAbs_SurfaceType;

  Plane(): gp_Pln;

  Cylinder(): gp_Cylinder;

  Cone(): gp_Cone;

  Sphere(): gp_Sphere;

  Torus(): gp_Torus;

  UDegree(): number;

  NbUPoles(): number;

  VDegree(): number;

  NbVPoles(): number;

  NbUKnots(): number;

  NbVKnots(): number;

  IsURational(): boolean;

  IsVRational(): boolean;

  Bezier(): Geom_BezierSurface;

  BSpline(): Geom_BSplineSurface;

  AxeOfRevolution(): gp_Ax1;

  Direction(): gp_Dir;

  BasisCurve(): Adaptor3d_Curve;

  BasisSurface(): Adaptor3d_Surface;

  OffsetValue(): number;

  delete(): void;

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
