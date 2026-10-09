# libcascade — IntAna

8 top-level symbols. Signatures are verbatim typescript.

IntAna_Curve: declare class IntAna_Curve

  // IntAna_Curve.constructor (constructor)
  constructor();

  // IntAna_Curve.SetCylinderQuadValues (method)
  SetCylinderQuadValues(Cylinder: gp_Cylinder, Qxx: number, Qyy: number, Qzz: number, Qxy: number, Qxz: number, Qyz: number, Qx: number, Qy: number, Qz: number, Q1: number, Tol: number, DomInf: number, DomSup: number, TwoZForATheta: boolean, ZIsPositive: boolean): void;

  // IntAna_Curve.SetConeQuadValues (method)
  SetConeQuadValues(Cone: gp_Cone, Qxx: number, Qyy: number, Qzz: number, Qxy: number, Qxz: number, Qyz: number, Qx: number, Qy: number, Qz: number, Q1: number, Tol: number, DomInf: number, DomSup: number, TwoZForATheta: boolean, ZIsPositive: boolean): void;

  // IntAna_Curve.IsOpen (method)
  IsOpen(): boolean;

  // IntAna_Curve.Domain (method)
  Domain(theFirst?: number, theLast?: number): { theFirst: number; theLast: number };

  // IntAna_Curve.IsConstant (method)
  IsConstant(): boolean;

  // IntAna_Curve.IsFirstOpen (method)
  IsFirstOpen(): boolean;

  // IntAna_Curve.IsLastOpen (method)
  IsLastOpen(): boolean;

  // IntAna_Curve.Value (method)
  Value(Theta: number): gp_Pnt;

  // IntAna_Curve.D1u (method)
  D1u(Theta: number, P: gp_Pnt, V: gp_Vec): boolean;

  // IntAna_Curve.FindParameter (method)
  FindParameter(P: gp_Pnt, theParams: NCollection_List_double): void;

  // IntAna_Curve.SetIsFirstOpen (method)
  SetIsFirstOpen(Flag: boolean): void;

  // IntAna_Curve.SetIsLastOpen (method)
  SetIsLastOpen(Flag: boolean): void;

  // IntAna_Curve.SetDomain (method)
  SetDomain(theFirst: number, theLast: number): void;

  // IntAna_Curve.delete (method)
  delete(): void;

  // IntAna_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_Int3Pln: declare class IntAna_Int3Pln

  // IntAna_Int3Pln.constructor (constructor)
  constructor();
  constructor(P1: gp_Pln, P2: gp_Pln, P3: gp_Pln);

  // IntAna_Int3Pln.Perform (method)
  Perform(P1: gp_Pln, P2: gp_Pln, P3: gp_Pln): void;

  // IntAna_Int3Pln.IsDone (method)
  IsDone(): boolean;

  // IntAna_Int3Pln.IsEmpty (method)
  IsEmpty(): boolean;

  // IntAna_Int3Pln.Value (method)
  Value(): gp_Pnt;

  // IntAna_Int3Pln.delete (method)
  delete(): void;

  // IntAna_Int3Pln.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_IntConicQuad: declare class IntAna_IntConicQuad

  // IntAna_IntConicQuad.constructor (constructor)
  constructor();
  constructor(L: gp_Lin, Q: IntAna_Quadric);
  constructor(C: gp_Circ, Q: IntAna_Quadric);
  constructor(E: gp_Elips, Q: IntAna_Quadric);
  constructor(P: gp_Parab, Q: IntAna_Quadric);
  constructor(H: gp_Hypr, Q: IntAna_Quadric);
  constructor(Pb: gp_Parab, P: gp_Pln, Tolang: number);
  constructor(H: gp_Hypr, P: gp_Pln, Tolang: number);
  constructor(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number);
  constructor(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number);
  constructor(L: gp_Lin, P: gp_Pln, Tolang: number, Tol?: number, Len?: number);

  // IntAna_IntConicQuad.Perform (method)
  Perform(L: gp_Lin, Q: IntAna_Quadric): void;
  Perform(C: gp_Circ, Q: IntAna_Quadric): void;
  Perform(E: gp_Elips, Q: IntAna_Quadric): void;
  Perform(P: gp_Parab, Q: IntAna_Quadric): void;
  Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
  Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
  Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
  Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
  Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
  Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;

  // IntAna_IntConicQuad.IsDone (method)
  IsDone(): boolean;

  // IntAna_IntConicQuad.IsInQuadric (method)
  IsInQuadric(): boolean;

  // IntAna_IntConicQuad.IsParallel (method)
  IsParallel(): boolean;

  // IntAna_IntConicQuad.NbPoints (method)
  NbPoints(): number;

  // IntAna_IntConicQuad.Point (method)
  Point(N: number): gp_Pnt;

  // IntAna_IntConicQuad.ParamOnConic (method)
  ParamOnConic(N: number): number;

  // IntAna_IntConicQuad.delete (method)
  delete(): void;

  // IntAna_IntConicQuad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_IntLinTorus: declare class IntAna_IntLinTorus

  // IntAna_IntLinTorus.constructor (constructor)
  constructor();
  constructor(L: gp_Lin, T: gp_Torus);

  // IntAna_IntLinTorus.Perform (method)
  Perform(L: gp_Lin, T: gp_Torus): void;

  // IntAna_IntLinTorus.IsDone (method)
  IsDone(): boolean;

  // IntAna_IntLinTorus.NbPoints (method)
  NbPoints(): number;

  // IntAna_IntLinTorus.Value (method)
  Value(Index: number): gp_Pnt;

  // IntAna_IntLinTorus.ParamOnLine (method)
  ParamOnLine(Index: number): number;

  // IntAna_IntLinTorus.ParamOnTorus (method)
  ParamOnTorus(Index: number, FI?: number, THETA?: number): { FI: number; THETA: number };

  // IntAna_IntLinTorus.delete (method)
  delete(): void;

  // IntAna_IntLinTorus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_IntQuadQuad: declare class IntAna_IntQuadQuad

  // IntAna_IntQuadQuad.constructor (constructor)
  constructor();
  constructor(C: gp_Cylinder, Q: IntAna_Quadric, Tol: number);
  constructor(C: gp_Cone, Q: IntAna_Quadric, Tol: number);

  // IntAna_IntQuadQuad.Perform (method)
  Perform(C: gp_Cylinder, Q: IntAna_Quadric, Tol: number): void;
  Perform(C: gp_Cone, Q: IntAna_Quadric, Tol: number): void;

  // IntAna_IntQuadQuad.IsDone (method)
  IsDone(): boolean;

  // IntAna_IntQuadQuad.IdenticalElements (method)
  IdenticalElements(): boolean;

  // IntAna_IntQuadQuad.NbCurve (method)
  NbCurve(): number;

  // IntAna_IntQuadQuad.Curve (method)
  Curve(N: number): IntAna_Curve;

  // IntAna_IntQuadQuad.NbPnt (method)
  NbPnt(): number;

  // IntAna_IntQuadQuad.Point (method)
  Point(N: number): gp_Pnt;

  // IntAna_IntQuadQuad.Parameters (method)
  Parameters(N: number, U1?: number, U2?: number): { U1: number; U2: number };

  // IntAna_IntQuadQuad.HasNextCurve (method)
  HasNextCurve(I: number): boolean;

  // IntAna_IntQuadQuad.NextCurve (method)
  NextCurve(I: number, theOpposite?: boolean): { returnValue: number; theOpposite: boolean };

  // IntAna_IntQuadQuad.HasPreviousCurve (method)
  HasPreviousCurve(I: number): boolean;

  // IntAna_IntQuadQuad.PreviousCurve (method)
  PreviousCurve(I: number, theOpposite?: boolean): { returnValue: number; theOpposite: boolean };

  // IntAna_IntQuadQuad.delete (method)
  delete(): void;

  // IntAna_IntQuadQuad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_QuadQuadGeo: declare class IntAna_QuadQuadGeo

  // IntAna_QuadQuadGeo.constructor (constructor)
  constructor();
  constructor(P: gp_Pln, S: gp_Sphere);
  constructor(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number);
  constructor(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number);
  constructor(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number);
  constructor(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number);
  constructor(Sph: gp_Sphere, Con: gp_Cone, Tol: number);
  constructor(Con1: gp_Cone, Con2: gp_Cone, Tol: number);
  constructor(Pln: gp_Pln, Tor: gp_Torus, Tol: number);
  constructor(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number);
  constructor(Con: gp_Cone, Tor: gp_Torus, Tol: number);
  constructor(Sph: gp_Sphere, Tor: gp_Torus, Tol: number);
  constructor(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number);
  constructor(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number);
  constructor(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number);
  constructor(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H?: number);

  // IntAna_QuadQuadGeo.Perform (method)
  Perform(P: gp_Pln, S: gp_Sphere): void;
  Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
  Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
  Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
  Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
  Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
  Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
  Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
  Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
  Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
  Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
  Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
  Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
  Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
  Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;

  // IntAna_QuadQuadGeo.IsDone (method)
  IsDone(): boolean;

  // IntAna_QuadQuadGeo.TypeInter (method)
  TypeInter(): IntAna_ResultType;

  // IntAna_QuadQuadGeo.NbSolutions (method)
  NbSolutions(): number;

  // IntAna_QuadQuadGeo.Point (method)
  Point(Num: number): gp_Pnt;

  // IntAna_QuadQuadGeo.Line (method)
  Line(Num: number): gp_Lin;

  // IntAna_QuadQuadGeo.Circle (method)
  Circle(Num: number): gp_Circ;

  // IntAna_QuadQuadGeo.Ellipse (method)
  Ellipse(Num: number): gp_Elips;

  // IntAna_QuadQuadGeo.Parabola (method)
  Parabola(Num: number): gp_Parab;

  // IntAna_QuadQuadGeo.Hyperbola (method)
  Hyperbola(Num: number): gp_Hypr;

  // IntAna_QuadQuadGeo.HasCommonGen (method)
  HasCommonGen(): boolean;

  // IntAna_QuadQuadGeo.PChar (method)
  PChar(): gp_Pnt;

  // IntAna_QuadQuadGeo.delete (method)
  delete(): void;

  // IntAna_QuadQuadGeo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_Quadric: declare class IntAna_Quadric

  // IntAna_Quadric.constructor (constructor)
  constructor();
  constructor(P: gp_Pln);
  constructor(Sph: gp_Sphere);
  constructor(Cyl: gp_Cylinder);
  constructor(Cone: gp_Cone);

  // IntAna_Quadric.SetQuadric (method)
  SetQuadric(P: gp_Pln): void;
  SetQuadric(Sph: gp_Sphere): void;
  SetQuadric(Con: gp_Cone): void;
  SetQuadric(Cyl: gp_Cylinder): void;

  // IntAna_Quadric.Coefficients (method)
  Coefficients(xCXX?: number, xCYY?: number, xCZZ?: number, xCXY?: number, xCXZ?: number, xCYZ?: number, xCX?: number, xCY?: number, xCZ?: number, xCCte?: number): { xCXX: number; xCYY: number; xCZZ: number; xCXY: number; xCXZ: number; xCYZ: number; xCX: number; xCY: number; xCZ: number; xCCte: number };

  // IntAna_Quadric.NewCoefficients (method)
  NewCoefficients(xCXX: number, xCYY: number, xCZZ: number, xCXY: number, xCXZ: number, xCYZ: number, xCX: number, xCY: number, xCZ: number, xCCte: number, Axis: gp_Ax3): { xCXX: number; xCYY: number; xCZZ: number; xCXY: number; xCXZ: number; xCYZ: number; xCX: number; xCY: number; xCZ: number; xCCte: number };

  // IntAna_Quadric.SpecialPoints (method)
  SpecialPoints(): NCollection_List_gp_Pnt;

  // IntAna_Quadric.delete (method)
  delete(): void;

  // IntAna_Quadric.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntAna_ResultType: typeof IntAna_ResultType[keyof typeof IntAna_ResultType]

  readonly IntAna_Point: 'IntAna_Point'

  readonly IntAna_Line: 'IntAna_Line'

  readonly IntAna_Circle: 'IntAna_Circle'

  readonly IntAna_PointAndCircle: 'IntAna_PointAndCircle'

  readonly IntAna_Ellipse: 'IntAna_Ellipse'

  readonly IntAna_Parabola: 'IntAna_Parabola'

  readonly IntAna_Hyperbola: 'IntAna_Hyperbola'

  readonly IntAna_Empty: 'IntAna_Empty'

  readonly IntAna_Same: 'IntAna_Same'

  readonly IntAna_NoGeometricSolution: 'IntAna_NoGeometricSolution'
