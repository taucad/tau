# libcascade — BndLib (2)

3 top-level symbols. Signatures are verbatim typescript.

// Computes the bounding box for a curve in 2d
BndLib_Add2dCurve: declare class BndLib_Add2dCurve

constructor

// Adds to the bounding box B the curve C B is then enlarged by the tolerance value Tol
static Add(C: Adaptor2d_Curve2d, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, Tol: number, Box: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, Tol: number, Box: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, Tol: number, Box: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, Tol: number, Box: Bnd_Box2d): void;
static Add(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
static Add(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
// B: Mutated in place

// Adds to the bounding box B the part of curve C B is then enlarged by the tolerance value Tol
static AddOptimal(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;
// B: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the bounding box for a curve in 3d
BndLib_Add3dCurve: declare class BndLib_Add3dCurve

constructor

// Adds to the bounding box B the curve C B is then enlarged by the tolerance value Tol
static Add(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static Add(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;
static Add(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static Add(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;
// B: Mutated in place

// Adds to the bounding box B the curve C These methods use more precise algorithms for building bnd box then methods Add(...)
static AddOptimal(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static AddOptimal(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;
static AddOptimal(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static AddOptimal(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;
// B: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// computes the box from a surface Functions to add a surface to a bounding box
BndLib_AddSurface: declare class BndLib_AddSurface

constructor

// Adds to the bounding box B the surface S B is then enlarged by the tolerance value Tol
static Add(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static Add(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
static Add(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static Add(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
// B: Mutated in place

// Adds the surface S to the bounding box B
static AddOptimal(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static AddOptimal(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
static AddOptimal(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static AddOptimal(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
// B: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
