# libcascade — AppBlend

1 top-level symbols. Signatures are verbatim typescript.

AppBlend_Approx: declare class AppBlend_Approx

IsDone(): boolean;

SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

UDegree(): number;

VDegree(): number;

SurfPoles(): NCollection_Array2_gp_Pnt;

SurfWeights(): NCollection_Array2_double;

SurfUKnots(): NCollection_Array1_double;

SurfVKnots(): NCollection_Array1_double;

SurfUMults(): NCollection_Array1_int;

SurfVMults(): NCollection_Array1_int;

NbCurves2d(): number;

Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

Curves2dDegree(): number;

Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

Curves2dKnots(): NCollection_Array1_double;

Curves2dMults(): NCollection_Array1_int;

TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

TolCurveOnSurf(Index: number): number;

delete(): void;

[Symbol.dispose](): void;
