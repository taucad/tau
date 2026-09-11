# libcascade — BRepApprox (2)

3 top-level symbols. Signatures are verbatim typescript.

BRepApprox_TheMultiLineToolOfApprox: declare class BRepApprox_TheMultiLineToolOfApprox

constructor

static FirstPoint(ML: BRepApprox_TheMultiLineOfApprox): number;

static LastPoint(ML: BRepApprox_TheMultiLineOfApprox): number;

static NbP2d(ML: BRepApprox_TheMultiLineOfApprox): number;

static NbP3d(ML: BRepApprox_TheMultiLineOfApprox): number;

static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

static MakeMLBetween(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number, NbPMin: number): BRepApprox_TheMultiLineOfApprox;

static MakeMLOneMorePoint(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number, indbad: number, OtherLine: BRepApprox_TheMultiLineOfApprox): boolean;

static WhatStatus(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number): Approx_Status;

static Dump(ML: BRepApprox_TheMultiLineOfApprox): void;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_ThePrmPrmSvSurfacesOfApprox: declare class BRepApprox_ThePrmPrmSvSurfacesOfApprox extends ApproxInt_SvSurfaces

constructor

Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox: declare class BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox extends math_FunctionSetWithDerivatives

constructor

Set(PS: BRepAdaptor_Surface): void;
Set(Tolerance: number): void;
Set(PS: BRepAdaptor_Surface): void;
Set(Tolerance: number): void;

SetImplicitSurface(IS: IntSurf_Quadric): void;

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Root(): number;

Tolerance(): number;

Point(): gp_Pnt;

IsTangent(): boolean;

Direction3d(): gp_Vec;

Direction2d(): gp_Dir2d;

PSurface(): BRepAdaptor_Surface;

ISurface(): IntSurf_Quadric;

delete(): void;

[Symbol.dispose](): void;
