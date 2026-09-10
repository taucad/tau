# libcascade — IGESConvGeom

2 top-level symbols. Signatures are verbatim typescript.

// This package is intended to gather geometric conversion which are not immediate but can be used for several purposes
IGESConvGeom: declare class IGESConvGeom

constructor

// basic tool to build curves from {@link IGESGeom `IGESGeom`} (arrays of points, Transformations, evaluation of points in a datum) Converts a SplineCurve from IGES to a BSplineCurve from CasCade <epscoef> gives tolerance to consider coefficient to be nul <epsgeom> gives tolerance to consider poles to be equal The returned value is a status with these possible values
static SplineCurveFromIGES(igesent: IGESGeom_SplineCurve, epscoef: number, epsgeom: number): { returnValue: number; result: Geom_BSplineCurve; [Symbol.dispose](): void };

// Tries to increase curve continuity with tolerance <epsgeom> <continuity> is the new desired continuity, can be 1 or 2 (more than 2 is considered as 2)
static IncreaseCurveContinuity(curve: Geom_BSplineCurve, epsgeom: number, continuity: number): number;
static IncreaseCurveContinuity(curve: Geom2d_BSplineCurve, epsgeom: number, continuity: number): number;
static IncreaseCurveContinuity(curve: Geom_BSplineCurve, epsgeom: number, continuity: number): number;
static IncreaseCurveContinuity(curve: Geom2d_BSplineCurve, epsgeom: number, continuity: number): number;

// Converts a SplineSurface from IGES to a BSplineSurface from CasCade <epscoef> gives tolerance to consider coefficient to be nul <epsgeom> gives tolerance to consider poles to be equal The returned value is a status with these possible values
static SplineSurfaceFromIGES(igesent: IGESGeom_SplineSurface, epscoef: number, epsgeom: number): { returnValue: number; result: Geom_BSplineSurface; [Symbol.dispose](): void };

// Tries to increase Surface continuity with tolerance <epsgeom> <continuity> is the new desired continuity, can be 1 or 2 (more than 2 is considered as 2)
static IncreaseSurfaceContinuity(surface: Geom_BSplineSurface, epsgeom: number, continuity?: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides some useful basic tools to build {@link IGESGeom `IGESGeom`} curves, especially
IGESConvGeom_GeomBuilder: declare class IGESConvGeom_GeomBuilder

constructor

// Clears list of Points/Vectors and data about Transformation
Clear(): void;

// Adds a XY (Z=0) to the list of points
AddXY(val: gp_XY): void;

// Adds a XYZ to the list of points
AddXYZ(val: gp_XYZ): void;

// Adds a Vector part to the list of points
AddVec(val: gp_XYZ): void;

// Returns the count of already recorded points
NbPoints(): number;

// Returns a point given its rank (if added as XY, Z will be 0)
Point(num: number): gp_XYZ;

// Makes a CopiousData with the list of recorded Points/Vectors according to <datatype>, which must be 1,2 or 3 If <polyline> is given True, the CopiousData is coded as a Polyline, but <datatype> must not be 3 <datatype> = 1
MakeCopiousData(datatype: number, polyline?: boolean): IGESGeom_CopiousData;

// Returns the Position in which the method EvalXYZ will evaluate a XYZ
Position(): gp_Trsf;

// Sets final position from an already defined Trsf
SetPosition(pos: gp_Trsf): void;
SetPosition(pos: gp_Ax3): void;
SetPosition(pos: gp_Ax2): void;
SetPosition(pos: gp_Ax1): void;
SetPosition(pos: gp_Trsf): void;
SetPosition(pos: gp_Ax3): void;
SetPosition(pos: gp_Ax2): void;
SetPosition(pos: gp_Ax1): void;
SetPosition(pos: gp_Trsf): void;
SetPosition(pos: gp_Ax3): void;
SetPosition(pos: gp_Ax2): void;
SetPosition(pos: gp_Ax1): void;
SetPosition(pos: gp_Trsf): void;
SetPosition(pos: gp_Ax3): void;
SetPosition(pos: gp_Ax2): void;
SetPosition(pos: gp_Ax1): void;

// Returns True if the Position is Identity
IsIdentity(): boolean;

// Returns True if the Position is a Translation only Remark
IsTranslation(): boolean;

// Returns True if the Position corresponds to a Z-Displacement, i.e
IsZOnly(): boolean;

// Evaluates a XYZ value in the Position already defined
EvalXYZ(val: gp_XYZ, X?: number, Y?: number, Z?: number): { X: number; Y: number; Z: number };

// Returns the IGES Transformation which corresponds to the Position
MakeTransformation(unit?: number): IGESGeom_TransformationMatrix;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
