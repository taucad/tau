# libcascade — ElSLib

1 top-level symbols. Signatures are verbatim typescript.

// Provides functions for basic geometric computation on elementary surfaces
ElSLib: declare class ElSLib

constructor

// For elementary surfaces from the gp package (planes, cones, cylinders, spheres and tori), computes the point of parameters (U, V)
static Value(U: number, V: number, Pl: gp_Pln): gp_Pnt;
static Value(U: number, V: number, C: gp_Cone): gp_Pnt;
static Value(U: number, V: number, C: gp_Cylinder): gp_Pnt;
static Value(U: number, V: number, S: gp_Sphere): gp_Pnt;
static Value(U: number, V: number, T: gp_Torus): gp_Pnt;
static Value(U: number, V: number, Pl: gp_Pln): gp_Pnt;
static Value(U: number, V: number, C: gp_Cone): gp_Pnt;
static Value(U: number, V: number, C: gp_Cylinder): gp_Pnt;
static Value(U: number, V: number, S: gp_Sphere): gp_Pnt;
static Value(U: number, V: number, T: gp_Torus): gp_Pnt;
static Value(U: number, V: number, Pl: gp_Pln): gp_Pnt;
static Value(U: number, V: number, C: gp_Cone): gp_Pnt;
static Value(U: number, V: number, C: gp_Cylinder): gp_Pnt;
static Value(U: number, V: number, S: gp_Sphere): gp_Pnt;
static Value(U: number, V: number, T: gp_Torus): gp_Pnt;
static Value(U: number, V: number, Pl: gp_Pln): gp_Pnt;
static Value(U: number, V: number, C: gp_Cone): gp_Pnt;
static Value(U: number, V: number, C: gp_Cylinder): gp_Pnt;
static Value(U: number, V: number, S: gp_Sphere): gp_Pnt;
static Value(U: number, V: number, T: gp_Torus): gp_Pnt;
static Value(U: number, V: number, Pl: gp_Pln): gp_Pnt;
static Value(U: number, V: number, C: gp_Cone): gp_Pnt;
static Value(U: number, V: number, C: gp_Cylinder): gp_Pnt;
static Value(U: number, V: number, S: gp_Sphere): gp_Pnt;
static Value(U: number, V: number, T: gp_Torus): gp_Pnt;

// For elementary surfaces from the gp package (planes, cones, cylinders, spheres and tori), computes the derivative vector of order Nu and Nv in the u and v parametric directions respectively, at the point of parameters (U, V)
static DN(U: number, V: number, Pl: gp_Pln, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cone, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cylinder, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, S: gp_Sphere, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, T: gp_Torus, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, Pl: gp_Pln, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cone, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cylinder, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, S: gp_Sphere, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, T: gp_Torus, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, Pl: gp_Pln, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cone, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cylinder, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, S: gp_Sphere, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, T: gp_Torus, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, Pl: gp_Pln, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cone, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cylinder, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, S: gp_Sphere, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, T: gp_Torus, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, Pl: gp_Pln, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cone, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, C: gp_Cylinder, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, S: gp_Sphere, Nu: number, Nv: number): gp_Vec;
static DN(U: number, V: number, T: gp_Torus, Nu: number, Nv: number): gp_Vec;

// For elementary surfaces from the gp package (planes, cones, cylinders, spheres and tori), computes the point P of parameters (U, V).inline
static D0(U: number, V: number, Pl: gp_Pln, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cone, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cylinder, P: gp_Pnt): void;
static D0(U: number, V: number, S: gp_Sphere, P: gp_Pnt): void;
static D0(U: number, V: number, T: gp_Torus, P: gp_Pnt): void;
static D0(U: number, V: number, Pl: gp_Pln, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cone, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cylinder, P: gp_Pnt): void;
static D0(U: number, V: number, S: gp_Sphere, P: gp_Pnt): void;
static D0(U: number, V: number, T: gp_Torus, P: gp_Pnt): void;
static D0(U: number, V: number, Pl: gp_Pln, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cone, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cylinder, P: gp_Pnt): void;
static D0(U: number, V: number, S: gp_Sphere, P: gp_Pnt): void;
static D0(U: number, V: number, T: gp_Torus, P: gp_Pnt): void;
static D0(U: number, V: number, Pl: gp_Pln, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cone, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cylinder, P: gp_Pnt): void;
static D0(U: number, V: number, S: gp_Sphere, P: gp_Pnt): void;
static D0(U: number, V: number, T: gp_Torus, P: gp_Pnt): void;
static D0(U: number, V: number, Pl: gp_Pln, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cone, P: gp_Pnt): void;
static D0(U: number, V: number, C: gp_Cylinder, P: gp_Pnt): void;
static D0(U: number, V: number, S: gp_Sphere, P: gp_Pnt): void;
static D0(U: number, V: number, T: gp_Torus, P: gp_Pnt): void;
// P: Mutated in place

// For elementary surfaces from the gp package (planes, cones, cylinders, spheres and tori), computes
static D1(U: number, V: number, Pl: gp_Pln, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, Pl: gp_Pln, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, Pl: gp_Pln, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, Pl: gp_Pln, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, Pl: gp_Pln, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
static D1(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;
// P: Mutated in place
// Vu: Mutated in place
// Vv: Mutated in place

// For elementary surfaces from the gp package (cones, cylinders, spheres and tori), computes
static D2(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
static D2(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;
// P: Mutated in place
// Vu: Mutated in place
// Vv: Mutated in place
// Vuu: Mutated in place
// Vvv: Mutated in place
// Vuv: Mutated in place

// For elementary surfaces from the gp package (cones, cylinders, spheres and tori), computes
static D3(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cone, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, C: gp_Cylinder, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, S: gp_Sphere, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
static D3(U: number, V: number, T: gp_Torus, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
// P: Mutated in place
// Vu: Mutated in place
// Vv: Mutated in place
// Vuu: Mutated in place
// Vvv: Mutated in place
// Vuv: Mutated in place
// Vuuu: Mutated in place
// Vvvv: Mutated in place
// Vuuv: Mutated in place
// Vuvv: Mutated in place

static PlaneValue(U: number, V: number, Pos: gp_Ax3): gp_Pnt;

static CylinderValue(U: number, V: number, Pos: gp_Ax3, Radius: number): gp_Pnt;

static ConeValue(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number): gp_Pnt;

static SphereValue(U: number, V: number, Pos: gp_Ax3, Radius: number): gp_Pnt;

static TorusValue(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number): gp_Pnt;

static PlaneDN(U: number, V: number, Pos: gp_Ax3, Nu: number, Nv: number): gp_Vec;

static CylinderDN(U: number, V: number, Pos: gp_Ax3, Radius: number, Nu: number, Nv: number): gp_Vec;

static ConeDN(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, Nu: number, Nv: number): gp_Vec;

static SphereDN(U: number, V: number, Pos: gp_Ax3, Radius: number, Nu: number, Nv: number): gp_Vec;

static TorusDN(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, Nu: number, Nv: number): gp_Vec;

static PlaneD0(U: number, V: number, Pos: gp_Ax3, P: gp_Pnt): void;

static ConeD0(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt): void;

static CylinderD0(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt): void;

static SphereD0(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt): void;

static TorusD0(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt): void;

static PlaneD1(U: number, V: number, Pos: gp_Ax3, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static ConeD1(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static CylinderD1(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static SphereD1(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static TorusD1(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static ConeD2(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

static CylinderD2(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

static SphereD2(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

static TorusD2(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

static ConeD3(U: number, V: number, Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

static CylinderD3(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

static SphereD3(U: number, V: number, Pos: gp_Ax3, Radius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

// The following functions compute the parametric values corresponding to a given point on a elementary surface
static TorusD3(U: number, V: number, Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;
// P: Mutated in place
// Vu: Mutated in place
// Vv: Mutated in place
// Vuu: Mutated in place
// Vvv: Mutated in place
// Vuv: Mutated in place
// Vuuu: Mutated in place
// Vvvv: Mutated in place
// Vuuv: Mutated in place
// Vuvv: Mutated in place

// parametrization P (U, V) = Pl.Location() + U _ Pl.XDirection() + V _ Pl.YDirection() parametrization P (U, V) = Location + V _ ZDirection + Radius _ (std::cos(U) _ XDirection + Sin (U) _ YDirection) parametrization P (U, V) = Location + V _ ZDirection + (Radius + V _ Tan (SemiAngle)) _ (std::cos(U) _ XDirection + std::sin(U) _ YDirection) parametrization P (U, V) = Location + Radius _ Cos (V) _ (Cos (U) _ XDirection + Sin (U) _ YDirection) + Radius _ Sin (V) _ ZDirection parametrization P (U, V) = Location + (MajorRadius + MinorRadius _ std::cos(U)) _ (std::cos(V) _ XDirection - std::sin(V) _ YDirection) + MinorRadius _ std::sin(U) \* ZDirection
static Parameters(Pl: gp_Pln, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cylinder, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cone, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(S: gp_Sphere, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(T: gp_Torus, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(Pl: gp_Pln, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cylinder, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cone, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(S: gp_Sphere, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(T: gp_Torus, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(Pl: gp_Pln, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cylinder, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cone, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(S: gp_Sphere, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(T: gp_Torus, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(Pl: gp_Pln, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cylinder, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cone, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(S: gp_Sphere, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(T: gp_Torus, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(Pl: gp_Pln, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cylinder, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(C: gp_Cone, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(S: gp_Sphere, P: gp_Pnt, U: number, V: number): { U: number; V: number };
static Parameters(T: gp_Torus, P: gp_Pnt, U: number, V: number): { U: number; V: number };

// parametrization P (U, V) = Pl.Location() + U _ Pl.XDirection() + V _ Pl.YDirection()
static PlaneParameters(Pos: gp_Ax3, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

// parametrization P (U, V) = Location + V _ ZDirection + Radius _ (std::cos(U) _ XDirection + Sin (U) _ YDirection)
static CylinderParameters(Pos: gp_Ax3, Radius: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

// parametrization P (U, V) = Location + V _ ZDirection + (Radius + V _ Tan (SemiAngle)) _ (std::cos(U) _ XDirection + std::sin(U) \* YDirection)
static ConeParameters(Pos: gp_Ax3, Radius: number, SAngle: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

// parametrization P (U, V) = Location + Radius _ Cos (V) _ (Cos (U) _ XDirection + Sin (U) _ YDirection) + Radius _ Sin (V) _ ZDirection
static SphereParameters(Pos: gp_Ax3, Radius: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

// parametrization P (U, V) = Location + (MajorRadius + MinorRadius _ std::cos(U)) _ (std::cos(V) _ XDirection - std::sin(V) _ YDirection) + MinorRadius _ std::sin(U) _ ZDirection
static TorusParameters(Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

// compute the U Isoparametric {@link gp_Lin`gp_Lin`} of the plane
static PlaneUIso(Pos: gp_Ax3, U: number): gp_Lin;

// compute the U Isoparametric {@link gp_Lin`gp_Lin`} of the cylinder
static CylinderUIso(Pos: gp_Ax3, Radius: number, U: number): gp_Lin;

// compute the U Isoparametric {@link gp_Lin`gp_Lin`} of the cone
static ConeUIso(Pos: gp_Ax3, Radius: number, SAngle: number, U: number): gp_Lin;

// compute the U Isoparametric {@link gp_Circ`gp_Circ`} of the sphere, (the meridian is not trimmed)
static SphereUIso(Pos: gp_Ax3, Radius: number, U: number): gp_Circ;

// compute the U Isoparametric {@link gp_Circ`gp_Circ`} of the torus
static TorusUIso(Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, U: number): gp_Circ;

// compute the V Isoparametric {@link gp_Lin`gp_Lin`} of the plane
static PlaneVIso(Pos: gp_Ax3, V: number): gp_Lin;

// compute the V Isoparametric {@link gp_Circ`gp_Circ`} of the cylinder
static CylinderVIso(Pos: gp_Ax3, Radius: number, V: number): gp_Circ;

// compute the V Isoparametric {@link gp_Circ`gp_Circ`} of the cone
static ConeVIso(Pos: gp_Ax3, Radius: number, SAngle: number, V: number): gp_Circ;

// compute the V Isoparametric {@link gp_Circ`gp_Circ`} of the sphere, (the meridian is not trimmed)
static SphereVIso(Pos: gp_Ax3, Radius: number, V: number): gp_Circ;

// compute the V Isoparametric {@link gp_Circ`gp_Circ`} of the torus
static TorusVIso(Pos: gp_Ax3, MajorRadius: number, MinorRadius: number, V: number): gp_Circ;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
