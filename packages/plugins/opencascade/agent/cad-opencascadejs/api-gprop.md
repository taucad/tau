# libcascade — GProp

11 top-level symbols. Signatures are verbatim typescript.

GProp: declare class GProp

  constructor

  static HOperator(G: gp_Pnt, Q: gp_Pnt, Mass: number, Operator: gp_Mat): void;

  delete(): void;

  [Symbol.dispose](): void;

GProp_CelGProps: declare class GProp_CelGProps extends GProp_GProps

  constructor

  SetLocation(CLocation: gp_Pnt): void;

  Perform(C: gp_Circ, U1: number, U2: number): void;
  Perform(C: gp_Lin, U1: number, U2: number): void;
  Perform(C: gp_Circ, U1: number, U2: number): void;
  Perform(C: gp_Lin, U1: number, U2: number): void;

  delete(): void;

  [Symbol.dispose](): void;

GProp_GProps: declare class GProp_GProps

  constructor

  Add(Item: GProp_GProps, Density?: number): void;

  Mass(): number;

  CentreOfMass(): gp_Pnt;

  MatrixOfInertia(): gp_Mat;

  StaticMoments(Ix?: number, Iy?: number, Iz?: number): { Ix: number; Iy: number; Iz: number };

  MomentOfInertia(A: gp_Ax1): number;

  PrincipalProperties(): GProp_PrincipalProps;

  RadiusOfGyration(A: gp_Ax1): number;

  delete(): void;

  [Symbol.dispose](): void;

GProp_PEquation: declare class GProp_PEquation

  constructor

  GetType(): GProp_PEquation_Type;

  IsPlanar(): boolean;

  IsLinear(): boolean;

  IsPoint(): boolean;

  IsSpace(): boolean;

  Plane(): gp_Pln;

  Line(): gp_Lin;

  Point(): gp_Pnt;

  Box(theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

  Barycentre(): gp_Pnt;

  PrincipalAxis(theIndex: number): gp_Vec;

  Extent(theIndex: number): number;

  delete(): void;

  [Symbol.dispose](): void;

GProp_PEquation_Type: typeof GProp_PEquation_Type[keyof typeof GProp_PEquation_Type]

GProp_PGProps: declare class GProp_PGProps extends GProp_GProps

  constructor

  AddPoint(thePnt: gp_Pnt): void;
  AddPoint(thePnt: gp_Pnt, theDensity: number): void;
  AddPoint(thePnt: gp_Pnt): void;
  AddPoint(thePnt: gp_Pnt, theDensity: number): void;

  static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
  static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
  static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };

  delete(): void;

  [Symbol.dispose](): void;

GProp_PrincipalProps: declare class GProp_PrincipalProps

  constructor

  HasSymmetryAxis(): boolean;
  HasSymmetryAxis(aTol: number): boolean;
  HasSymmetryAxis(): boolean;
  HasSymmetryAxis(aTol: number): boolean;

  HasSymmetryPoint(): boolean;
  HasSymmetryPoint(aTol: number): boolean;
  HasSymmetryPoint(): boolean;
  HasSymmetryPoint(aTol: number): boolean;

  Moments(Ixx?: number, Iyy?: number, Izz?: number): { Ixx: number; Iyy: number; Izz: number };

  FirstAxisOfInertia(): gp_Vec;

  SecondAxisOfInertia(): gp_Vec;

  ThirdAxisOfInertia(): gp_Vec;

  RadiusOfGyration(Rxx?: number, Ryy?: number, Rzz?: number): { Rxx: number; Ryy: number; Rzz: number };

  delete(): void;

  [Symbol.dispose](): void;

GProp_SelGProps: declare class GProp_SelGProps extends GProp_GProps

  constructor

  SetLocation(SLocation: gp_Pnt): void;

  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;

  delete(): void;

  [Symbol.dispose](): void;

GProp_UndefinedAxis: declare class GProp_UndefinedAxis extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

GProp_ValueType: typeof GProp_ValueType[keyof typeof GProp_ValueType]

GProp_VelGProps: declare class GProp_VelGProps extends GProp_GProps

  constructor

  SetLocation(VLocation: gp_Pnt): void;

  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
  Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
  Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;

  delete(): void;

  [Symbol.dispose](): void;
