# libcascade — ElSLib

1 top-level symbols. Signatures are verbatim typescript.

ElSLib: declare class ElSLib

  // ElSLib.constructor (constructor)
  constructor();

  // ElSLib.Value (method)
  static Value(U: number, V: number, Pl: gp_Pln): gp_Pnt;
  static Value(U: number, V: number, C: gp_Cone): gp_Pnt;
  static Value(U: number, V: number, C: gp_Cylinder): gp_Pnt;
  static Value(U: number, V: number, S: gp_Sphere): gp_Pnt;
  static Value(U: number, V: number, T: gp_Torus): gp_Pnt;

  // ElSLib.DN (method)
  static DN(U: number, V: number, Pl: gp_Pln, Nu: number, Nv: number): gp_Vec;
  static DN(U: number, V: number, C: gp_Cone, Nu: number, Nv: number): gp_Vec;
  static DN(U: number, V: number, C: gp_Cylinder, Nu: number, Nv: number): gp_Vec;
  static DN(U: number, V: number, S: gp_Sphere, Nu: number, Nv: number): gp_Vec;
  static DN(U: number, V: number, T: gp_Torus, Nu: number, Nv: number): gp_Vec;

  // ElSLib.D0 (method)
  static D0(U: number, V: number, Pl: gp_Pln, P: gp_Pnt): void;
  static D0(U: number, V: number, C: gp_Cone, P: gp_Pnt): void;
  static D0(U: number, V: number, C: gp_Cylinder, P: gp_Pnt): void;
  static D0(U: number, V: number, S: gp_Sphere, P: gp_Pnt): void;
  static D0(U: number, V: number, T: gp_Torus, P: gp_Pnt): void;

  // ElSLib.D1 (method)
  static D1(U: number, V: number, Pl: gp_Pln, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
  static D1(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
  static D1(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
  static D1(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
  static D1(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // ElSLib.D2 (method)
  static D2(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
  static D2(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
  static D2(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
  static D2(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

  // ElSLib.D3 (method)
  static D3(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
  static D3(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
  static D3(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
  static D3(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

  // ElSLib.PlaneValue (method)
  static PlaneValue(U: number, V: number, Pos: gp_Ax3): gp_Pnt;

  // ElSLib.CylinderValue (method)
  static CylinderValue(U: number, V: number, Pos: gp_Ax3, Radius: number): gp_Pnt;

  // ElSLib.ConeValue (method)
  static ConeValue(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number): gp_Pnt;

  // ElSLib.SphereValue (method)
  static SphereValue(U: number, V: number, Pos: gp_Ax3, Radius: number): gp_Pnt;

  // ElSLib.TorusValue (method)
  static TorusValue(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number): gp_Pnt;

  // ElSLib.PlaneDN (method)
  static PlaneDN(U: number, V: number, Pos: gp_Ax3, Nu: number, Nv: number): gp_Vec;

  // ElSLib.CylinderDN (method)
  static CylinderDN(U: number, V: number, Pos: gp_Ax3, Radius: number, Nu: number, Nv: number): gp_Vec;

  // ElSLib.ConeDN (method)
  static ConeDN(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, Nu: number, Nv: number): gp_Vec;

  // ElSLib.SphereDN (method)
  static SphereDN(U: number, V: number, Pos: gp_Ax3, Radius: number, Nu: number, Nv: number): gp_Vec;

  // ElSLib.TorusDN (method)
  static TorusDN(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, Nu: number, Nv: number): gp_Vec;

  // ElSLib.PlaneD0 (method)
  static PlaneD0(U: number, V: number, Pos: gp_Ax3, P: gp_Pnt): void;

  // ElSLib.ConeD0 (method)
  static ConeD0(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt): void;

  // ElSLib.CylinderD0 (method)
  static CylinderD0(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt): void;

  // ElSLib.SphereD0 (method)
  static SphereD0(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt): void;

  // ElSLib.TorusD0 (method)
  static TorusD0(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt): void;

  // ElSLib.PlaneD1 (method)
  static PlaneD1(U: number, V: number, Pos: gp_Ax3, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // ElSLib.ConeD1 (method)
  static ConeD1(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // ElSLib.CylinderD1 (method)
  static CylinderD1(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // ElSLib.SphereD1 (method)
  static SphereD1(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // ElSLib.TorusD1 (method)
  static TorusD1(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // ElSLib.ConeD2 (method)
  static ConeD2(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

  // ElSLib.CylinderD2 (method)
  static CylinderD2(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

  // ElSLib.SphereD2 (method)
  static SphereD2(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

  // ElSLib.TorusD2 (method)
  static TorusD2(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

  // ElSLib.ConeD3 (method)
  static ConeD3(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

  // ElSLib.CylinderD3 (method)
  static CylinderD3(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

  // ElSLib.SphereD3 (method)
  static SphereD3(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

  // ElSLib.TorusD3 (method)
  static TorusD3(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

  // ElSLib.Parameters (method)
  static Parameters(Pl: gp_Pln, P: gp_Pnt, U: number, V: number): { U: number; V: number };
  static Parameters(C: gp_Cylinder, P: gp_Pnt, U: number, V: number): { U: number; V: number };
  static Parameters(C: gp_Cone, P: gp_Pnt, U: number, V: number): { U: number; V: number };
  static Parameters(S: gp_Sphere, P: gp_Pnt, U: number, V: number): { U: number; V: number };
  static Parameters(T: gp_Torus, P: gp_Pnt, U: number, V: number): { U: number; V: number };

  // ElSLib.PlaneParameters (method)
  static PlaneParameters(Pos: gp_Ax3, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  // ElSLib.CylinderParameters (method)
  static CylinderParameters(Pos: gp_Ax3, Radius: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  // ElSLib.ConeParameters (method)
  static ConeParameters(Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  // ElSLib.SphereParameters (method)
  static SphereParameters(Pos: gp_Ax3, Radius: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  // ElSLib.TorusParameters (method)
  static TorusParameters(Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

  // ElSLib.PlaneUIso (method)
  static PlaneUIso(Pos: gp_Ax3, U: number): gp_Lin;

  // ElSLib.CylinderUIso (method)
  static CylinderUIso(Pos: gp_Ax3, Radius: number, U: number): gp_Lin;

  // ElSLib.ConeUIso (method)
  static ConeUIso(Pos: gp_Ax3, Radius: number, SAngle: number, U: number): gp_Lin;

  // ElSLib.SphereUIso (method)
  static SphereUIso(Pos: gp_Ax3, Radius: number, U: number): gp_Circ;

  // ElSLib.TorusUIso (method)
  static TorusUIso(Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, U: number): gp_Circ;

  // ElSLib.PlaneVIso (method)
  static PlaneVIso(Pos: gp_Ax3, V: number): gp_Lin;

  // ElSLib.CylinderVIso (method)
  static CylinderVIso(Pos: gp_Ax3, Radius: number, V: number): gp_Circ;

  // ElSLib.ConeVIso (method)
  static ConeVIso(Pos: gp_Ax3, Radius: number, SAngle: number, V: number): gp_Circ;

  // ElSLib.SphereVIso (method)
  static SphereVIso(Pos: gp_Ax3, Radius: number, V: number): gp_Circ;

  // ElSLib.TorusVIso (method)
  static TorusVIso(Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, V: number): gp_Circ;

  // ElSLib.delete (method)
  delete(): void;

  // ElSLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
