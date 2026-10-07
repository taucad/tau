# libcascade — Geom (2)

16 top-level symbols. Signatures are verbatim typescript.

Geom_Circle: declare class Geom_Circle extends Geom_Conic

  // Geom_Circle.constructor (constructor)
  constructor(C: gp_Circ);
  constructor(A2: gp_Ax2, Radius: number);

  // Geom_Circle.SetCirc (method)
  SetCirc(C: gp_Circ): void;

  // Geom_Circle.SetRadius (method)
  SetRadius(R: number): void;

  // Geom_Circle.Circ (method)
  Circ(): gp_Circ;

  // Geom_Circle.Radius (method)
  Radius(): number;

  // Geom_Circle.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Circle.Eccentricity (method)
  Eccentricity(): number;

  // Geom_Circle.FirstParameter (method)
  FirstParameter(): number;

  // Geom_Circle.LastParameter (method)
  LastParameter(): number;

  // Geom_Circle.IsClosed (method)
  IsClosed(): boolean;

  // Geom_Circle.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_Circle.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_Circle.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_Circle.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_Circle.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_Circle.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_Circle.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Circle.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Circle.get_type_name (method)
  static get_type_name(): string;

  // Geom_Circle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Circle.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Circle.delete (method)
  delete(): void;

  // Geom_Circle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Conic: declare class Geom_Conic extends Geom_Curve

  // Geom_Conic.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // Geom_Conic.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // Geom_Conic.SetPosition (method)
  SetPosition(theA2: gp_Ax2): void;

  // Geom_Conic.Axis (method)
  Axis(): gp_Ax1;

  // Geom_Conic.Location (method)
  Location(): gp_Pnt;

  // Geom_Conic.Position (method)
  Position(): gp_Ax2;

  // Geom_Conic.Eccentricity (method)
  Eccentricity(): number;

  // Geom_Conic.XAxis (method)
  XAxis(): gp_Ax1;

  // Geom_Conic.YAxis (method)
  YAxis(): gp_Ax1;

  // Geom_Conic.Reverse (method)
  Reverse(): void;

  // Geom_Conic.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Conic.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_Conic.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_Conic.get_type_name (method)
  static get_type_name(): string;

  // Geom_Conic.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Conic.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Conic.delete (method)
  delete(): void;

  // Geom_Conic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_ConicalSurface: declare class Geom_ConicalSurface extends Geom_ElementarySurface

  // Geom_ConicalSurface.constructor (constructor)
  constructor(C: gp_Cone);
  constructor(A3: gp_Ax3, Ang: number, Radius: number);

  // Geom_ConicalSurface.SetCone (method)
  SetCone(C: gp_Cone): void;

  // Geom_ConicalSurface.SetRadius (method)
  SetRadius(R: number): void;

  // Geom_ConicalSurface.SetSemiAngle (method)
  SetSemiAngle(Ang: number): void;

  // Geom_ConicalSurface.Cone (method)
  Cone(): gp_Cone;

  // Geom_ConicalSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_ConicalSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_ConicalSurface.VReverse (method)
  VReverse(): void;

  // Geom_ConicalSurface.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_ConicalSurface.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_ConicalSurface.Apex (method)
  Apex(): gp_Pnt;

  // Geom_ConicalSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_ConicalSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // Geom_ConicalSurface.RefRadius (method)
  RefRadius(): number;

  // Geom_ConicalSurface.SemiAngle (method)
  SemiAngle(): number;

  // Geom_ConicalSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_ConicalSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_ConicalSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_ConicalSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_ConicalSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_ConicalSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_ConicalSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_ConicalSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_ConicalSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_ConicalSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_ConicalSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_ConicalSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_ConicalSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_ConicalSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_ConicalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_ConicalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_ConicalSurface.delete (method)
  delete(): void;

  // Geom_ConicalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Curve: declare class Geom_Curve extends Geom_Geometry

  // Geom_Curve.Reverse (method)
  Reverse(): void;

  // Geom_Curve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Curve.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf): number;

  // Geom_Curve.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): number;

  // Geom_Curve.Reversed (method)
  Reversed(): Geom_Curve;

  // Geom_Curve.FirstParameter (method)
  FirstParameter(): number;

  // Geom_Curve.LastParameter (method)
  LastParameter(): number;

  // Geom_Curve.IsClosed (method)
  IsClosed(): boolean;

  // Geom_Curve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_Curve.Period (method)
  Period(): number;

  // Geom_Curve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_Curve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_Curve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_Curve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_Curve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_Curve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_Curve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_Curve.D0 (method)
  D0(U: number, P: gp_Pnt): void;

  // Geom_Curve.D1 (method)
  D1(U: number, P: gp_Pnt, V1: gp_Vec): void;

  // Geom_Curve.D2 (method)
  D2(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // Geom_Curve.D3 (method)
  D3(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  // Geom_Curve.DN (method)
  DN(U: number, N: number): gp_Vec;

  // Geom_Curve.Value (method)
  Value(U: number): gp_Pnt;

  // Geom_Curve.get_type_name (method)
  static get_type_name(): string;

  // Geom_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Curve.delete (method)
  delete(): void;

  // Geom_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_CylindricalSurface: declare class Geom_CylindricalSurface extends Geom_ElementarySurface

  // Geom_CylindricalSurface.constructor (constructor)
  constructor(C: gp_Cylinder);
  constructor(A3: gp_Ax3, Radius: number);

  // Geom_CylindricalSurface.SetCylinder (method)
  SetCylinder(C: gp_Cylinder): void;

  // Geom_CylindricalSurface.SetRadius (method)
  SetRadius(R: number): void;

  // Geom_CylindricalSurface.Cylinder (method)
  Cylinder(): gp_Cylinder;

  // Geom_CylindricalSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_CylindricalSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_CylindricalSurface.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_CylindricalSurface.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_CylindricalSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_CylindricalSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // Geom_CylindricalSurface.Radius (method)
  Radius(): number;

  // Geom_CylindricalSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_CylindricalSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_CylindricalSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_CylindricalSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_CylindricalSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_CylindricalSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_CylindricalSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_CylindricalSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_CylindricalSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_CylindricalSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_CylindricalSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_CylindricalSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_CylindricalSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_CylindricalSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_CylindricalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_CylindricalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_CylindricalSurface.delete (method)
  delete(): void;

  // Geom_CylindricalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Direction: declare class Geom_Direction extends Geom_Vector

  // Geom_Direction.constructor (constructor)
  constructor(V: gp_Dir);
  constructor(X: number, Y: number, Z: number);

  // Geom_Direction.SetCoord (method)
  SetCoord(X: number, Y: number, Z: number): void;

  // Geom_Direction.SetDir (method)
  SetDir(V: gp_Dir): void;

  // Geom_Direction.SetX (method)
  SetX(X: number): void;

  // Geom_Direction.SetY (method)
  SetY(Y: number): void;

  // Geom_Direction.SetZ (method)
  SetZ(Z: number): void;

  // Geom_Direction.Dir (method)
  Dir(): gp_Dir;

  // Geom_Direction.Magnitude (method)
  Magnitude(): number;

  // Geom_Direction.SquareMagnitude (method)
  SquareMagnitude(): number;

  // Geom_Direction.Cross (method)
  Cross(Other: Geom_Vector): void;

  // Geom_Direction.CrossCross (method)
  CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

  // Geom_Direction.Crossed (method)
  Crossed(Other: Geom_Vector): Geom_Vector;

  // Geom_Direction.CrossCrossed (method)
  CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

  // Geom_Direction.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Direction.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Direction.get_type_name (method)
  static get_type_name(): string;

  // Geom_Direction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Direction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Direction.delete (method)
  delete(): void;

  // Geom_Direction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_ElementarySurface: declare class Geom_ElementarySurface extends Geom_Surface

  // Geom_ElementarySurface.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // Geom_ElementarySurface.SetLocation (method)
  SetLocation(theLoc: gp_Pnt): void;

  // Geom_ElementarySurface.SetPosition (method)
  SetPosition(theAx3: gp_Ax3): void;

  // Geom_ElementarySurface.Axis (method)
  Axis(): gp_Ax1;

  // Geom_ElementarySurface.Location (method)
  Location(): gp_Pnt;

  // Geom_ElementarySurface.Position (method)
  Position(): gp_Ax3;

  // Geom_ElementarySurface.UReverse (method)
  UReverse(): void;

  // Geom_ElementarySurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_ElementarySurface.VReverse (method)
  VReverse(): void;

  // Geom_ElementarySurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_ElementarySurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_ElementarySurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_ElementarySurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_ElementarySurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_ElementarySurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_ElementarySurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_ElementarySurface.delete (method)
  delete(): void;

  // Geom_ElementarySurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Ellipse: declare class Geom_Ellipse extends Geom_Conic

  // Geom_Ellipse.constructor (constructor)
  constructor(E: gp_Elips);
  constructor(A2: gp_Ax2, MajorRadius: number, MinorRadius: number);

  // Geom_Ellipse.SetElips (method)
  SetElips(E: gp_Elips): void;

  // Geom_Ellipse.SetMajorRadius (method)
  SetMajorRadius(MajorRadius: number): void;

  // Geom_Ellipse.SetMinorRadius (method)
  SetMinorRadius(MinorRadius: number): void;

  // Geom_Ellipse.Elips (method)
  Elips(): gp_Elips;

  // Geom_Ellipse.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Ellipse.Directrix1 (method)
  Directrix1(): gp_Ax1;

  // Geom_Ellipse.Directrix2 (method)
  Directrix2(): gp_Ax1;

  // Geom_Ellipse.Eccentricity (method)
  Eccentricity(): number;

  // Geom_Ellipse.Focal (method)
  Focal(): number;

  // Geom_Ellipse.Focus1 (method)
  Focus1(): gp_Pnt;

  // Geom_Ellipse.Focus2 (method)
  Focus2(): gp_Pnt;

  // Geom_Ellipse.MajorRadius (method)
  MajorRadius(): number;

  // Geom_Ellipse.MinorRadius (method)
  MinorRadius(): number;

  // Geom_Ellipse.Parameter (method)
  Parameter(): number;

  // Geom_Ellipse.FirstParameter (method)
  FirstParameter(): number;

  // Geom_Ellipse.LastParameter (method)
  LastParameter(): number;

  // Geom_Ellipse.IsClosed (method)
  IsClosed(): boolean;

  // Geom_Ellipse.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_Ellipse.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_Ellipse.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_Ellipse.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_Ellipse.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_Ellipse.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_Ellipse.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Ellipse.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Ellipse.get_type_name (method)
  static get_type_name(): string;

  // Geom_Ellipse.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Ellipse.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Ellipse.delete (method)
  delete(): void;

  // Geom_Ellipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Geometry: declare class Geom_Geometry extends Standard_Transient

  // Geom_Geometry.Mirror (method)
  Mirror(P: gp_Pnt): void;
  Mirror(A1: gp_Ax1): void;
  Mirror(A2: gp_Ax2): void;

  // Geom_Geometry.Rotate (method)
  Rotate(A1: gp_Ax1, Ang: number): void;

  // Geom_Geometry.Scale (method)
  Scale(P: gp_Pnt, S: number): void;

  // Geom_Geometry.Translate (method)
  Translate(V: gp_Vec): void;
  Translate(P1: gp_Pnt, P2: gp_Pnt): void;

  // Geom_Geometry.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Geometry.Mirrored (method)
  Mirrored(P: gp_Pnt): Geom_Geometry;
  Mirrored(A1: gp_Ax1): Geom_Geometry;
  Mirrored(A2: gp_Ax2): Geom_Geometry;

  // Geom_Geometry.Rotated (method)
  Rotated(A1: gp_Ax1, Ang: number): Geom_Geometry;

  // Geom_Geometry.Scaled (method)
  Scaled(P: gp_Pnt, S: number): Geom_Geometry;

  // Geom_Geometry.Transformed (method)
  Transformed(T: gp_Trsf): Geom_Geometry;

  // Geom_Geometry.Translated (method)
  Translated(V: gp_Vec): Geom_Geometry;
  Translated(P1: gp_Pnt, P2: gp_Pnt): Geom_Geometry;

  // Geom_Geometry.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Geometry.get_type_name (method)
  static get_type_name(): string;

  // Geom_Geometry.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Geometry.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Geometry.delete (method)
  delete(): void;

  // Geom_Geometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Hyperbola: declare class Geom_Hyperbola extends Geom_Conic

  // Geom_Hyperbola.constructor (constructor)
  constructor(H: gp_Hypr);
  constructor(A2: gp_Ax2, MajorRadius: number, MinorRadius: number);

  // Geom_Hyperbola.SetHypr (method)
  SetHypr(H: gp_Hypr): void;

  // Geom_Hyperbola.SetMajorRadius (method)
  SetMajorRadius(MajorRadius: number): void;

  // Geom_Hyperbola.SetMinorRadius (method)
  SetMinorRadius(MinorRadius: number): void;

  // Geom_Hyperbola.Hypr (method)
  Hypr(): gp_Hypr;

  // Geom_Hyperbola.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Hyperbola.FirstParameter (method)
  FirstParameter(): number;

  // Geom_Hyperbola.LastParameter (method)
  LastParameter(): number;

  // Geom_Hyperbola.IsClosed (method)
  IsClosed(): boolean;

  // Geom_Hyperbola.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_Hyperbola.Asymptote1 (method)
  Asymptote1(): gp_Ax1;

  // Geom_Hyperbola.Asymptote2 (method)
  Asymptote2(): gp_Ax1;

  // Geom_Hyperbola.ConjugateBranch1 (method)
  ConjugateBranch1(): gp_Hypr;

  // Geom_Hyperbola.ConjugateBranch2 (method)
  ConjugateBranch2(): gp_Hypr;

  // Geom_Hyperbola.Directrix1 (method)
  Directrix1(): gp_Ax1;

  // Geom_Hyperbola.Directrix2 (method)
  Directrix2(): gp_Ax1;

  // Geom_Hyperbola.Eccentricity (method)
  Eccentricity(): number;

  // Geom_Hyperbola.Focal (method)
  Focal(): number;

  // Geom_Hyperbola.Focus1 (method)
  Focus1(): gp_Pnt;

  // Geom_Hyperbola.Focus2 (method)
  Focus2(): gp_Pnt;

  // Geom_Hyperbola.MajorRadius (method)
  MajorRadius(): number;

  // Geom_Hyperbola.MinorRadius (method)
  MinorRadius(): number;

  // Geom_Hyperbola.OtherBranch (method)
  OtherBranch(): gp_Hypr;

  // Geom_Hyperbola.Parameter (method)
  Parameter(): number;

  // Geom_Hyperbola.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_Hyperbola.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_Hyperbola.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_Hyperbola.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_Hyperbola.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_Hyperbola.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Hyperbola.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Hyperbola.get_type_name (method)
  static get_type_name(): string;

  // Geom_Hyperbola.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Hyperbola.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Hyperbola.delete (method)
  delete(): void;

  // Geom_Hyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Line: declare class Geom_Line extends Geom_Curve

  // Geom_Line.constructor (constructor)
  constructor(A1: gp_Ax1);
  constructor(L: gp_Lin);
  constructor(P: gp_Pnt, V: gp_Dir);

  // Geom_Line.SetLin (method)
  SetLin(L: gp_Lin): void;

  // Geom_Line.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_Line.SetLocation (method)
  SetLocation(P: gp_Pnt): void;

  // Geom_Line.SetPosition (method)
  SetPosition(A1: gp_Ax1): void;

  // Geom_Line.Lin (method)
  Lin(): gp_Lin;

  // Geom_Line.Position (method)
  Position(): gp_Ax1;

  // Geom_Line.Reverse (method)
  Reverse(): void;

  // Geom_Line.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Line.FirstParameter (method)
  FirstParameter(): number;

  // Geom_Line.LastParameter (method)
  LastParameter(): number;

  // Geom_Line.IsClosed (method)
  IsClosed(): boolean;

  // Geom_Line.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_Line.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_Line.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_Line.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_Line.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_Line.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_Line.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_Line.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_Line.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Line.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf): number;

  // Geom_Line.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): number;

  // Geom_Line.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Line.get_type_name (method)
  static get_type_name(): string;

  // Geom_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Line.delete (method)
  delete(): void;

  // Geom_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_OffsetCurve: declare class Geom_OffsetCurve extends Geom_Curve

  // Geom_OffsetCurve.constructor (constructor)
  constructor(theOther: Geom_OffsetCurve);
  constructor(C: Geom_Curve, Offset: number, V: gp_Dir, isNotCheckC0?: boolean);

  // Geom_OffsetCurve.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_OffsetCurve.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepCurveDesc_Base;

  // Geom_OffsetCurve.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

  // Geom_OffsetCurve.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_OffsetCurve.Reverse (method)
  Reverse(): void;

  // Geom_OffsetCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_OffsetCurve.SetBasisCurve (method)
  SetBasisCurve(C: Geom_Curve, isNotCheckC0?: boolean): void;

  // Geom_OffsetCurve.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_OffsetCurve.SetOffsetValue (method)
  SetOffsetValue(D: number): void;

  // Geom_OffsetCurve.BasisCurve (method)
  BasisCurve(): Geom_Curve;

  // Geom_OffsetCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_OffsetCurve.Direction (method)
  Direction(): gp_Dir;

  // Geom_OffsetCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_OffsetCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_OffsetCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_OffsetCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_OffsetCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_OffsetCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom_OffsetCurve.LastParameter (method)
  LastParameter(): number;

  // Geom_OffsetCurve.Offset (method)
  Offset(): number;

  // Geom_OffsetCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom_OffsetCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_OffsetCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_OffsetCurve.Period (method)
  Period(): number;

  // Geom_OffsetCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_OffsetCurve.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf): number;

  // Geom_OffsetCurve.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): number;

  // Geom_OffsetCurve.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_OffsetCurve.GetBasisCurveContinuity (method)
  GetBasisCurveContinuity(): GeomAbs_Shape;

  // Geom_OffsetCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom_OffsetCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_OffsetCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_OffsetCurve.delete (method)
  delete(): void;

  // Geom_OffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_OffsetSurface: declare class Geom_OffsetSurface extends Geom_Surface

  // Geom_OffsetSurface.constructor (constructor)
  constructor(theOther: Geom_OffsetSurface);
  constructor(S: Geom_Surface, Offset: number, isNotCheckC0?: boolean);

  // Geom_OffsetSurface.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_OffsetSurface.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  // Geom_OffsetSurface.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  // Geom_OffsetSurface.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_OffsetSurface.SetBasisSurface (method)
  SetBasisSurface(S: Geom_Surface, isNotCheckC0?: boolean): void;

  // Geom_OffsetSurface.SetOffsetValue (method)
  SetOffsetValue(D: number): void;

  // Geom_OffsetSurface.Offset (method)
  Offset(): number;

  // Geom_OffsetSurface.BasisSurface (method)
  BasisSurface(): Geom_Surface;

  // Geom_OffsetSurface.UReverse (method)
  UReverse(): void;

  // Geom_OffsetSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_OffsetSurface.VReverse (method)
  VReverse(): void;

  // Geom_OffsetSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_OffsetSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_OffsetSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_OffsetSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_OffsetSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_OffsetSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_OffsetSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_OffsetSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_OffsetSurface.UPeriod (method)
  UPeriod(): number;

  // Geom_OffsetSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_OffsetSurface.VPeriod (method)
  VPeriod(): number;

  // Geom_OffsetSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_OffsetSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_OffsetSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_OffsetSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_OffsetSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_OffsetSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_OffsetSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_OffsetSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_OffsetSurface.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_OffsetSurface.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_OffsetSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_OffsetSurface.Surface (method)
  Surface(): Geom_Surface;

  // Geom_OffsetSurface.UOsculatingSurface (method)
  UOsculatingSurface(U: number, V: number, IsOpposite?: boolean): { returnValue: boolean; IsOpposite: boolean; UOsculSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

  // Geom_OffsetSurface.VOsculatingSurface (method)
  VOsculatingSurface(U: number, V: number, IsOpposite?: boolean): { returnValue: boolean; IsOpposite: boolean; VOsculSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

  // Geom_OffsetSurface.GetBasisSurfContinuity (method)
  GetBasisSurfContinuity(): GeomAbs_Shape;

  // Geom_OffsetSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_OffsetSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_OffsetSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_OffsetSurface.delete (method)
  delete(): void;

  // Geom_OffsetSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Parabola: declare class Geom_Parabola extends Geom_Conic

  // Geom_Parabola.constructor (constructor)
  constructor(Prb: gp_Parab);
  constructor(A2: gp_Ax2, Focal: number);
  constructor(D: gp_Ax1, F: gp_Pnt);

  // Geom_Parabola.SetFocal (method)
  SetFocal(Focal: number): void;

  // Geom_Parabola.SetParab (method)
  SetParab(Prb: gp_Parab): void;

  // Geom_Parabola.Parab (method)
  Parab(): gp_Parab;

  // Geom_Parabola.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_Parabola.FirstParameter (method)
  FirstParameter(): number;

  // Geom_Parabola.LastParameter (method)
  LastParameter(): number;

  // Geom_Parabola.IsClosed (method)
  IsClosed(): boolean;

  // Geom_Parabola.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_Parabola.Directrix (method)
  Directrix(): gp_Ax1;

  // Geom_Parabola.Eccentricity (method)
  Eccentricity(): number;

  // Geom_Parabola.Focus (method)
  Focus(): gp_Pnt;

  // Geom_Parabola.Focal (method)
  Focal(): number;

  // Geom_Parabola.Parameter (method)
  Parameter(): number;

  // Geom_Parabola.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_Parabola.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_Parabola.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_Parabola.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_Parabola.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_Parabola.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Parabola.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf): number;

  // Geom_Parabola.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): number;

  // Geom_Parabola.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Parabola.get_type_name (method)
  static get_type_name(): string;

  // Geom_Parabola.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Parabola.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Parabola.delete (method)
  delete(): void;

  // Geom_Parabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Plane: declare class Geom_Plane extends Geom_ElementarySurface

  // Geom_Plane.constructor (constructor)
  constructor(A3: gp_Ax3);
  constructor(Pl: gp_Pln);
  constructor(P: gp_Pnt, V: gp_Dir);
  constructor(A: number, B: number, C: number, D: number);

  // Geom_Plane.SetPln (method)
  SetPln(Pl: gp_Pln): void;

  // Geom_Plane.Pln (method)
  Pln(): gp_Pln;

  // Geom_Plane.UReverse (method)
  UReverse(): void;

  // Geom_Plane.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_Plane.VReverse (method)
  VReverse(): void;

  // Geom_Plane.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_Plane.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_Plane.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_Plane.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_Plane.Coefficients (method)
  Coefficients(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

  // Geom_Plane.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_Plane.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_Plane.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_Plane.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_Plane.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_Plane.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_Plane.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_Plane.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_Plane.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_Plane.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_Plane.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_Plane.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_Plane.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_Plane.get_type_name (method)
  static get_type_name(): string;

  // Geom_Plane.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Plane.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Plane.delete (method)
  delete(): void;

  // Geom_Plane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Point: declare class Geom_Point extends Geom_Geometry

  // Geom_Point.Coord (method)
  Coord(X: number, Y: number, Z: number): { X: number; Y: number; Z: number };

  // Geom_Point.Pnt (method)
  Pnt(): gp_Pnt;

  // Geom_Point.X (method)
  X(): number;

  // Geom_Point.Y (method)
  Y(): number;

  // Geom_Point.Z (method)
  Z(): number;

  // Geom_Point.Distance (method)
  Distance(Other: Geom_Point): number;

  // Geom_Point.SquareDistance (method)
  SquareDistance(Other: Geom_Point): number;

  // Geom_Point.get_type_name (method)
  static get_type_name(): string;

  // Geom_Point.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Point.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Point.delete (method)
  delete(): void;

  // Geom_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
