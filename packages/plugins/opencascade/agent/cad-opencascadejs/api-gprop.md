# libcascade — GProp

11 top-level symbols. Signatures are verbatim typescript.

GProp: declare class GProp

  // GProp.constructor (constructor)
  constructor();

  // GProp.HOperator (method)
  static HOperator(G: gp_Pnt, Q: gp_Pnt, Mass: number, Operator: gp_Mat): void;

  // GProp.delete (method)
  delete(): void;

  // GProp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_CelGProps: declare class GProp_CelGProps extends GProp_GProps

  // GProp_CelGProps.constructor (constructor)
  constructor();
  constructor(C: gp_Circ, CLocation: gp_Pnt);
  constructor(C: gp_Circ, U1: number, U2: number, CLocation: gp_Pnt);
  constructor(C: gp_Lin, U1: number, U2: number, CLocation: gp_Pnt);

  // GProp_CelGProps.SetLocation (method)
  SetLocation(CLocation: gp_Pnt): void;

  // GProp_CelGProps.Perform (method)
  Perform(C: gp_Circ, U1: number, U2: number): void;
  Perform(C: gp_Lin, U1: number, U2: number): void;

  // GProp_CelGProps.delete (method)
  delete(): void;

  // GProp_CelGProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_GProps: declare class GProp_GProps

  // GProp_GProps.constructor (constructor)
  constructor();
  constructor(SystemLocation: gp_Pnt);

  // GProp_GProps.Add (method)
  Add(Item: GProp_GProps, Density?: number): void;

  // GProp_GProps.Mass (method)
  Mass(): number;

  // GProp_GProps.CentreOfMass (method)
  CentreOfMass(): gp_Pnt;

  // GProp_GProps.MatrixOfInertia (method)
  MatrixOfInertia(): gp_Mat;

  // GProp_GProps.StaticMoments (method)
  StaticMoments(Ix?: number, Iy?: number, Iz?: number): { Ix: number; Iy: number; Iz: number };

  // GProp_GProps.MomentOfInertia (method)
  MomentOfInertia(A: gp_Ax1): number;

  // GProp_GProps.PrincipalProperties (method)
  PrincipalProperties(): GProp_PrincipalProps;

  // GProp_GProps.RadiusOfGyration (method)
  RadiusOfGyration(A: gp_Ax1): number;

  // GProp_GProps.delete (method)
  delete(): void;

  // GProp_GProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_PEquation: declare class GProp_PEquation

  // GProp_PEquation.constructor (constructor)
  constructor(thePnts: NCollection_Array1_gp_Pnt, theTol: number);

  // GProp_PEquation.GetType (method)
  GetType(): GProp_PEquation_Type;

  // GProp_PEquation.IsPlanar (method)
  IsPlanar(): boolean;

  // GProp_PEquation.IsLinear (method)
  IsLinear(): boolean;

  // GProp_PEquation.IsPoint (method)
  IsPoint(): boolean;

  // GProp_PEquation.IsSpace (method)
  IsSpace(): boolean;

  // GProp_PEquation.Plane (method)
  Plane(): gp_Pln;

  // GProp_PEquation.Line (method)
  Line(): gp_Lin;

  // GProp_PEquation.Point (method)
  Point(): gp_Pnt;

  // GProp_PEquation.Box (method)
  Box(theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

  // GProp_PEquation.Barycentre (method)
  Barycentre(): gp_Pnt;

  // GProp_PEquation.PrincipalAxis (method)
  PrincipalAxis(theIndex: number): gp_Vec;

  // GProp_PEquation.Extent (method)
  Extent(theIndex: number): number;

  // GProp_PEquation.delete (method)
  delete(): void;

  // GProp_PEquation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_PEquation_Type: typeof GProp_PEquation_Type[keyof typeof GProp_PEquation_Type]

  readonly None: 'None'

  readonly Point: 'Point'

  readonly Line: 'Line'

  readonly Plane: 'Plane'

  readonly Space: 'Space'

GProp_PGProps: declare class GProp_PGProps extends GProp_GProps

  // GProp_PGProps.constructor (constructor)
  constructor();
  constructor(thePnts: NCollection_Array1_gp_Pnt);
  constructor(thePnts: NCollection_Array2_gp_Pnt);
  constructor(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double);
  constructor(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double);

  // GProp_PGProps.AddPoint (method)
  AddPoint(thePnt: gp_Pnt): void;
  AddPoint(thePnt: gp_Pnt, theDensity: number): void;

  // GProp_PGProps.Barycentre (method)
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };

  // GProp_PGProps.delete (method)
  delete(): void;

  // GProp_PGProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_PrincipalProps: declare class GProp_PrincipalProps

  // GProp_PrincipalProps.constructor (constructor)
  constructor();

  // GProp_PrincipalProps.HasSymmetryAxis (method)
  HasSymmetryAxis(): boolean;
  HasSymmetryAxis(aTol: number): boolean;

  // GProp_PrincipalProps.HasSymmetryPoint (method)
  HasSymmetryPoint(): boolean;
  HasSymmetryPoint(aTol: number): boolean;

  // GProp_PrincipalProps.Moments (method)
  Moments(Ixx?: number, Iyy?: number, Izz?: number): { Ixx: number; Iyy: number; Izz: number };

  // GProp_PrincipalProps.FirstAxisOfInertia (method)
  FirstAxisOfInertia(): gp_Vec;

  // GProp_PrincipalProps.SecondAxisOfInertia (method)
  SecondAxisOfInertia(): gp_Vec;

  // GProp_PrincipalProps.ThirdAxisOfInertia (method)
  ThirdAxisOfInertia(): gp_Vec;

  // GProp_PrincipalProps.RadiusOfGyration (method)
  RadiusOfGyration(Rxx?: number, Ryy?: number, Rzz?: number): { Rxx: number; Ryy: number; Rzz: number };

  // GProp_PrincipalProps.delete (method)
  delete(): void;

  // GProp_PrincipalProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_SelGProps: declare class GProp_SelGProps extends GProp_GProps

  // GProp_SelGProps.constructor (constructor)
  constructor();
  constructor(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number, SLocation: gp_Pnt);
  constructor(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number, SLocation: gp_Pnt);
  constructor(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number, SLocation: gp_Pnt);
  constructor(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number, SLocation: gp_Pnt);

  // GProp_SelGProps.SetLocation (method)
  SetLocation(SLocation: gp_Pnt): void;

  // GProp_SelGProps.Perform (method)
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;

  // GProp_SelGProps.delete (method)
  delete(): void;

  // GProp_SelGProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_UndefinedAxis: declare class GProp_UndefinedAxis extends Standard_DomainError

  // GProp_UndefinedAxis.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // GProp_UndefinedAxis.ExceptionType (method)
  ExceptionType(): string;

  // GProp_UndefinedAxis.delete (method)
  delete(): void;

  // GProp_UndefinedAxis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GProp_ValueType: typeof GProp_ValueType[keyof typeof GProp_ValueType]

  readonly GProp_Mass: 'GProp_Mass'

  readonly GProp_CenterMassX: 'GProp_CenterMassX'

  readonly GProp_CenterMassY: 'GProp_CenterMassY'

  readonly GProp_CenterMassZ: 'GProp_CenterMassZ'

  readonly GProp_InertiaXX: 'GProp_InertiaXX'

  readonly GProp_InertiaYY: 'GProp_InertiaYY'

  readonly GProp_InertiaZZ: 'GProp_InertiaZZ'

  readonly GProp_InertiaXY: 'GProp_InertiaXY'

  readonly GProp_InertiaXZ: 'GProp_InertiaXZ'

  readonly GProp_InertiaYZ: 'GProp_InertiaYZ'

  readonly GProp_Unknown: 'GProp_Unknown'

GProp_VelGProps: declare class GProp_VelGProps extends GProp_GProps

  // GProp_VelGProps.constructor (constructor)
  constructor();
  constructor(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number, VLocation: gp_Pnt);
  constructor(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number, VLocation: gp_Pnt);
  constructor(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number, VLocation: gp_Pnt);
  constructor(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number, VLocation: gp_Pnt);

  // GProp_VelGProps.SetLocation (method)
  SetLocation(VLocation: gp_Pnt): void;

  // GProp_VelGProps.Perform (method)
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;

  // GProp_VelGProps.delete (method)
  delete(): void;

  // GProp_VelGProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
