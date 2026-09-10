# libcascade — ProjLib

7 top-level symbols. Signatures are verbatim typescript.

// The {@link ProjLib`ProjLib`} package first provides projection of curves on a plane along a given Direction
ProjLib: declare class ProjLib

constructor

static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;
static Project(Pl: gp_Pln, P: gp_Pnt): gp_Pnt2d;
static Project(Pl: gp_Pln, L: gp_Lin): gp_Lin2d;
static Project(Pl: gp_Pln, C: gp_Circ): gp_Circ2d;
static Project(Pl: gp_Pln, E: gp_Elips): gp_Elips2d;
static Project(Pl: gp_Pln, P: gp_Parab): gp_Parab2d;
static Project(Pl: gp_Pln, H: gp_Hypr): gp_Hypr2d;
static Project(Cy: gp_Cylinder, P: gp_Pnt): gp_Pnt2d;
static Project(Cy: gp_Cylinder, L: gp_Lin): gp_Lin2d;
static Project(Cy: gp_Cylinder, Ci: gp_Circ): gp_Lin2d;
static Project(Co: gp_Cone, P: gp_Pnt): gp_Pnt2d;
static Project(Co: gp_Cone, L: gp_Lin): gp_Lin2d;
static Project(Co: gp_Cone, Ci: gp_Circ): gp_Lin2d;
static Project(Sp: gp_Sphere, P: gp_Pnt): gp_Pnt2d;
static Project(Sp: gp_Sphere, Ci: gp_Circ): gp_Lin2d;
static Project(To: gp_Torus, P: gp_Pnt): gp_Pnt2d;
static Project(To: gp_Torus, Ci: gp_Circ): gp_Lin2d;

// Make empty P-Curve <aC> of relevant to <PC> type
static MakePCurveOfType(PC: ProjLib_ProjectedCurve): { aC: Geom2d_Curve; [Symbol.dispose](): void };

// Returns "true" if surface is analytical, that is it can be Plane, Cylinder, Cone, Sphere, Torus
static IsAnaSurf(theAS: Adaptor3d_Surface): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ProjLib_CompProjectedCurve: declare class ProjLib_CompProjectedCurve extends Adaptor2d_Curve2d

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

// computes a set of projected point and determine the continuous parts of the projected curves
Init(): void;

// Performs projecting for given curve
Perform(): void;

// Set the parameter, which defines 3d tolerance of approximation
SetTol3d(theTol3d: number): void;

// Set the parameter, which defines curve continuity
SetContinuity(theContinuity: GeomAbs_Shape): void;

// Set max possible degree of result BSpline curve2d, which is got by approximation
SetMaxDegree(theMaxDegree: number): void;

// Set the parameter, which defines maximal value of parametric intervals the projected curve can be cut for approximation
SetMaxSeg(theMaxSeg: number): void;

// Set the parameter, which defines necessity of 2d results
SetProj2d(theProj2d: boolean): void;

// Set the parameter, which defines necessity of 3d results
SetProj3d(theProj3d: boolean): void;

// Changes the surface
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor3d_Curve): void;
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor3d_Curve): void;

GetSurface(): Adaptor3d_Surface;

GetCurve(): Adaptor3d_Curve;

GetTolerance(TolU?: number, TolV?: number): { TolU: number; TolV: number };

// returns the number of continuous part of the projected curve
NbCurves(): number;

// returns the bounds of the continuous part corresponding to Index
Bounds(Index: number, Udeb?: number, Ufin?: number): { Udeb: number; Ufin: number };

// returns True if part of projection with number Index is a single point and writes its coordinates in P
IsSinglePnt(Index: number, P: gp_Pnt2d): boolean;
// P: Mutated in place

// returns True if part of projection with number Index is an u-isoparametric curve of input surface
IsUIso(Index: number, U?: number): { returnValue: boolean; U: number };

// returns True if part of projection with number Index is an v-isoparametric curve of input surface
IsVIso(Index: number, V?: number): { returnValue: boolean; V: number };

// Computes the point of parameter U on the curve
Value(U: number): gp_Pnt2d;

// Computes the point of parameter U on the curve
D0(U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
// P: Mutated in place
// V: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
DN(U: number, N: number): gp_Vec2d;

// Returns the first parameter of the curve C which has a projection on S
FirstParameter(): number;

// Returns the last parameter of the curve C which has a projection on S
LastParameter(): number;

// Returns the Continuity used in the approximation
Continuity(): GeomAbs_Shape;

// Returns the number of intervals which define an S continuous part of the projected curve
NbIntervals(S: GeomAbs_Shape): number;

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(FirstParam: number, LastParam: number, Tol: number): Adaptor2d_Curve2d;

// Returns the parameters corresponding to S discontinuities
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// returns the maximum distance between curve to project and surface
MaxDistance(Index: number): number;

GetSequence(): NCollection_HSequence_handle_NCollection_HSequence_gp_Pnt;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

// Returns true if result of projecting of the curve interval with number Index is point
ResultIsPoint(theIndex: number): boolean;

// Returns the error of approximation of U parameter 2d-curve as a result projecting of the curve interval with number Index
GetResult2dUApproxError(theIndex: number): number;

// Returns the error of approximation of V parameter 2d-curve as a result projecting of the curve interval with number Index
GetResult2dVApproxError(theIndex: number): number;

// Returns the error of approximation of 3d-curve as a result projecting of the curve interval with number Index
GetResult3dApproxError(theIndex: number): number;

// Returns the resulting 2d-curve of projecting of the curve interval with number Index
GetResult2dC(theIndex: number): Geom2d_Curve;

// Returns the resulting 3d-curve of projecting of the curve interval with number Index
GetResult3dC(theIndex: number): Geom_Curve;

// Returns the resulting 2d-point of projecting of the curve interval with number Index
GetResult2dP(theIndex: number): gp_Pnt2d;

// Returns the resulting 3d-point of projecting of the curve interval with number Index
GetResult3dP(theIndex: number): gp_Pnt;

// Returns the parameter, which defines necessity of only 2d results
GetProj2d(): boolean;

// Returns the parameter, which defines necessity of only 3d results
GetProj3d(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximate the projection of a 3d curve on an analytic surface and stores the result in Approx
ProjLib_ComputeApprox: declare class ProjLib_ComputeApprox

constructor

// Performs projecting
Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;

// Set tolerance of approximation
SetTolerance(theTolerance: number): void;

// Set min and max possible degree of result BSpline curve2d, which is got by approximation
SetDegree(theDegMin: number, theDegMax: number): void;

// Set the parameter, which defines maximal value of parametric intervals the projected curve can be cut for approximation
SetMaxSegments(theMaxSegments: number): void;

// Set the parameter, which defines type of boundary condition between segments during approximation
SetBndPnt(theBndPnt: AppParCurves_Constraint): void;

BSpline(): Geom2d_BSplineCurve;

Bezier(): Geom2d_BezierCurve;

// returns the reached Tolerance
Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximate the projection of a 3d curve on an polar surface and stores the result in Approx
ProjLib_ComputeApproxOnPolarSurface: declare class ProjLib_ComputeApproxOnPolarSurface

constructor

// Set min and max possible degree of result BSpline curve2d, which is got by approximation
SetDegree(theDegMin: number, theDegMax: number): void;

// Set the parameter, which defines maximal value of parametric intervals the projected curve can be cut for approximation
SetMaxSegments(theMaxSegments: number): void;

// Set the parameter, which defines type of boundary condition between segments during approximation
SetBndPnt(theBndPnt: AppParCurves_Constraint): void;

// Set the parameter, which defines maximal possible distance between projected curve and surface
SetMaxDist(theMaxDist: number): void;

// Set the tolerance used to project the curve on the surface
SetTolerance(theTolerance: number): void;

// Method, which performs projecting, using default values of parameters or they must be set by corresponding methods before using
Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;
Perform(InitCurve2d: Adaptor2d_Curve2d, C: Adaptor3d_Curve, S: Adaptor3d_Surface): Geom2d_BSplineCurve;
Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;
Perform(InitCurve2d: Adaptor2d_Curve2d, C: Adaptor3d_Curve, S: Adaptor3d_Surface): Geom2d_BSplineCurve;

// Builds initial 2d curve as BSpline with degree = 1 using Extrema algorithm
BuildInitialCurve2d(Curve: Adaptor3d_Curve, S: Adaptor3d_Surface): Adaptor2d_Curve2d;

// Method, which performs projecting
ProjectUsingInitialCurve2d(Curve: Adaptor3d_Curve, S: Adaptor3d_Surface, InitCurve2d: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

// Returns result curve 2d
BSpline(): Geom2d_BSplineCurve;

// Returns second 2d curve
Curve2d(): Geom2d_Curve;

IsDone(): boolean;

// returns the reached Tolerance
Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Projects elementary curves on a cone
ProjLib_Cone: declare class ProjLib_Cone extends ProjLib_Projector

constructor

Init(Co: gp_Cone): void;

Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Projects elementary curves on a cylinder
ProjLib_Cylinder: declare class ProjLib_Cylinder extends ProjLib_Projector

constructor

Init(Cyl: gp_Cylinder): void;

Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Projects elementary curves on a plane
ProjLib_Plane: declare class ProjLib_Plane extends ProjLib_Projector

constructor

Init(Pl: gp_Pln): void;

Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;
Project(L: gp_Lin): void;
Project(C: gp_Circ): void;
Project(E: gp_Elips): void;
Project(P: gp_Parab): void;
Project(H: gp_Hypr): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
