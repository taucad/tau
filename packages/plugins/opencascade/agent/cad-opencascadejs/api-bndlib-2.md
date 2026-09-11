# libcascade — BndLib (2)

3 top-level symbols. Signatures are verbatim typescript.

BndLib_Add2dCurve: declare class BndLib_Add2dCurve

constructor

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

static AddOptimal(C: Geom2d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box2d): void;

delete(): void;

[Symbol.dispose](): void;

BndLib_Add3dCurve: declare class BndLib_Add3dCurve

constructor

static Add(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static Add(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;
static Add(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static Add(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;

static AddOptimal(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static AddOptimal(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;
static AddOptimal(C: Adaptor3d_Curve, Tol: number, B: Bnd_Box): void;
static AddOptimal(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number, B: Bnd_Box): void;

delete(): void;

[Symbol.dispose](): void;

BndLib_AddSurface: declare class BndLib_AddSurface

constructor

static Add(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static Add(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
static Add(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static Add(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;

static AddOptimal(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static AddOptimal(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;
static AddOptimal(S: Adaptor3d_Surface, Tol: number, B: Bnd_Box): void;
static AddOptimal(S: Adaptor3d_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Tol: number, B: Bnd_Box): void;

delete(): void;

[Symbol.dispose](): void;
