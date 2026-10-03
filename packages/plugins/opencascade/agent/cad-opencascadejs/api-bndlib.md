# libcascade — BndLib

4 top-level symbols. Signatures are verbatim typescript.

BndLib: declare class BndLib

  // BndLib.constructor (constructor)
  constructor();

  // BndLib.Add (method)
  static Add(C: gp_Circ, Tol: number, B: Bnd_Box): void;
  static Add(C: gp_Circ2d, Tol: number, B: Bnd_Box2d): void;
  static Add(C: gp_Elips, Tol: number, B: Bnd_Box): void;
  static Add(C: gp_Elips2d, Tol: number, B: Bnd_Box2d): void;
  static Add(S: gp_Sphere, Tol: number, B: Bnd_Box): void;
  static Add(P: gp_Torus, Tol: number, B: Bnd_Box): void;
  static Add(L: gp_Lin, P1: number, P2: number, Tol: number, B: Bnd_Box): void;
  static Add(L: gp_Lin2d, P1: number, P2: number, Tol: number, B: Bnd_Box2d): void;
  static Add(C: gp_Circ, P1: number, P2: number, Tol: number, B: Bnd_Box): void;
  static Add(C: gp_Circ2d, P1: number, P2: number, Tol: number, B: Bnd_Box2d): void;
  static Add(C: gp_Elips, P1: number, P2: number, Tol: number, B: Bnd_Box): void;
  static Add(C: gp_Elips2d, P1: number, P2: number, Tol: number, B: Bnd_Box2d): void;
  static Add(P: gp_Parab, P1: number, P2: number, Tol: number, B: Bnd_Box): void;
  static Add(P: gp_Parab2d, P1: number, P2: number, Tol: number, B: Bnd_Box2d): void;
  static Add(H: gp_Hypr, P1: number, P2: number, Tol: number, B: Bnd_Box): void;
  static Add(H: gp_Hypr2d, P1: number, P2: number, Tol: number, B: Bnd_Box2d): void;
  static Add(S: gp_Cylinder, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
  static Add(S: gp_Cone, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
  static Add(S: gp_Cylinder, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
  static Add(S: gp_Cone, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
  static Add(S: gp_Sphere, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
  static Add(P: gp_Torus, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;

  // BndLib.delete (method)
  delete(): void;

  // BndLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BndLib_Add2dCurve: declare class BndLib_Add2dCurve

  // BndLib_Add2dCurve.constructor (constructor)
  constructor();

  // BndLib_Add2dCurve.Add (method)
  static Add(C: Adaptor2d_Curve2d, Tol: number, B: Bnd_Box2d): void;
  static Add(C: Geom2d_Curve, Tol: number, Box: Bnd_Box2d): void;
  static Add(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
  static Add(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;

  // BndLib_Add2dCurve.AddOptimal (method)
  static AddOptimal(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;

  // BndLib_Add2dCurve.delete (method)
  delete(): void;

  // BndLib_Add2dCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BndLib_Add3dCurve: declare class BndLib_Add3dCurve

  // BndLib_Add3dCurve.constructor (constructor)
  constructor();

  // BndLib_Add3dCurve.Add (method)
  static Add(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
  static Add(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;

  // BndLib_Add3dCurve.AddOptimal (method)
  static AddOptimal(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
  static AddOptimal(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;

  // BndLib_Add3dCurve.delete (method)
  delete(): void;

  // BndLib_Add3dCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BndLib_AddSurface: declare class BndLib_AddSurface

  // BndLib_AddSurface.constructor (constructor)
  constructor();

  // BndLib_AddSurface.Add (method)
  static Add(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
  static Add(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;

  // BndLib_AddSurface.AddOptimal (method)
  static AddOptimal(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
  static AddOptimal(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;

  // BndLib_AddSurface.delete (method)
  delete(): void;

  // BndLib_AddSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
