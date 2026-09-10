# libcascade — IntSurf

16 top-level symbols. Signatures are verbatim typescript.

// This package provides resources for all the packages concerning the intersection between surfaces
IntSurf: declare class IntSurf

constructor

// Computes the transition of the intersection point between the two lines
static MakeTransition(TgFirst: gp_Vec, TgSecond: gp_Vec, Normal: gp_Dir, TFirst: IntSurf_Transition, TSecond: IntSurf_Transition): void;
// TFirst: Mutated in place
// TSecond: Mutated in place

// Fills theArrOfPeriod array by the period values of theFirstSurf and theSecondSurf
static SetPeriod(theFirstSurf: Adaptor3d_Surface, theSecondSurf: Adaptor3d_Surface, theArrOfPeriod: [number, number, number, number]): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// creation d 'un couple de 2 entiers
IntSurf_Couple: declare class IntSurf_Couple

constructor

// returns the first element
First(): number;

// returns the Second element
Second(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of a point solution of the intersection between an implicit an a parametrised surface
IntSurf_InteriorPoint: declare class IntSurf_InteriorPoint

constructor

SetValue(P: gp_Pnt, U: number, V: number, Direc: gp_Vec, Direc2d: gp_Vec2d): void;

// Returns the 3d coordinates of the interior point
Value(): gp_Pnt;

// Returns the parameters of the interior point on the parametric surface
Parameters(U?: number, V?: number): { U: number; V: number };

// Returns the first parameter of the interior point on the parametric surface
UParameter(): number;

// Returns the second parameter of the interior point on the parametric surface
VParameter(): number;

// Returns the tangent at the intersection in 3d space associated to the interior point
Direction(): gp_Vec;

// Returns the tangent at the intersection in the parametric space of the parametric surface
Direction2d(): gp_Vec2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a tool on the "interior point" that can be used to instantiates the Walking algorithms (see package IntWalk)
IntSurf_InteriorPointTool: declare class IntSurf_InteriorPointTool

constructor

// Returns the 3d coordinates of the starting point
static Value3d(PStart: IntSurf_InteriorPoint): gp_Pnt;

// Returns the <U,V> parameters which are associated with
static Value2d(PStart: IntSurf_InteriorPoint, U?: number, V?: number): { U: number; V: number };

// returns the tangent at the intersection in 3d space associated to
static Direction3d(PStart: IntSurf_InteriorPoint): gp_Vec;

// returns the tangent at the intersection in the parametric space of the parametrized surface.This tangent is associated to the value2d
static Direction2d(PStart: IntSurf_InteriorPoint): gp_Dir2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntSurf_LineOn2S: declare class IntSurf_LineOn2S extends Standard_Transient

constructor

// Adds a point in the line
Add(P: IntSurf_PntOn2S): void;

// Returns the number of points in the line
NbPoints(): number;

// Returns the point of range Index in the line
Value(Index: number): IntSurf_PntOn2S;
Value(Index: number, P: IntSurf_PntOn2S): void;
Value(Index: number): IntSurf_PntOn2S;
Value(Index: number, P: IntSurf_PntOn2S): void;

// Reverses the order of points of the line
Reverse(): void;

// Keeps in <me> the points 1 to Index-1, and returns the items Index to the end
Split(Index: number): IntSurf_LineOn2S;

// Sets the 3D point of the Index-th PntOn2S
SetPoint(Index: number, thePnt: gp_Pnt): void;

// Sets the parametric coordinates on one of the surfaces of the point of range Index in the line
SetUV(Index: number, OnFirst: boolean, U: number, V: number): void;

Clear(): void;

InsertBefore(I: number, P: IntSurf_PntOn2S): void;

RemovePoint(I: number): void;

// Returns TRUE if theP is out of the box built from the points on 1st surface
IsOutSurf1Box(theP: gp_Pnt2d): boolean;

// Returns TRUE if theP is out of the box built from the points on 2nd surface
IsOutSurf2Box(theP: gp_Pnt2d): boolean;

// Returns TRUE if theP is out of the box built from 3D-points
IsOutBox(theP: gp_Pnt): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntSurf_PathPoint: declare class IntSurf_PathPoint

constructor

SetValue(P: gp_Pnt, U: number, V: number): void;

AddUV(U: number, V: number): void;

SetDirections(V: gp_Vec, D: gp_Dir2d): void;

SetTangency(Tang: boolean): void;

SetPassing(Pass: boolean): void;

Value(): gp_Pnt;

Value2d(U?: number, V?: number): { U: number; V: number };

IsPassingPnt(): boolean;

IsTangent(): boolean;

Direction3d(): gp_Vec;

Direction2d(): gp_Dir2d;

Multiplicity(): number;

Parameters(Index: number, U?: number, V?: number): { U: number; V: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntSurf_PathPointTool: declare class IntSurf_PathPointTool

constructor

// Returns the 3d coordinates of the starting point
static Value3d(PStart: IntSurf_PathPoint): gp_Pnt;

// Returns the <U, V> parameters which are associated with
static Value2d(PStart: IntSurf_PathPoint, U?: number, V?: number): { U: number; V: number };

// Returns True if the point is a point on a non-oriented arc, which means that the intersection line does not stop at such a point but just go through such a point
static IsPassingPnt(PStart: IntSurf_PathPoint): boolean;

// Returns True if the surfaces are tangent at this point
static IsTangent(PStart: IntSurf_PathPoint): boolean;

// returns the tangent at the intersection in 3d space associated to
static Direction3d(PStart: IntSurf_PathPoint): gp_Vec;

// returns the tangent at the intersection in the parametric space of the parametrized surface.This tangent is associated to the value2d la tangente a un sens signifiant (indique le sens de chemin ement) an exception is raised if IsTangent is true
static Direction2d(PStart: IntSurf_PathPoint): gp_Dir2d;

// Returns the multiplicity of the point i-e the number of auxillar parameters associated to the point which the principal parameters are given by Value2d
static Multiplicity(PStart: IntSurf_PathPoint): number;

// Parametric coordinates associated to the multiplicity
static Parameters(PStart: IntSurf_PathPoint, Mult: number, U?: number, V?: number): { U: number; V: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines the geometric information for an intersection point between 2 surfaces
IntSurf_PntOn2S: declare class IntSurf_PntOn2S

constructor

// Sets the value of the point in 3d space
SetValue(Pt: gp_Pnt): void;
SetValue(OnFirst: boolean, U: number, V: number): void;
SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
SetValue(U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt): void;
SetValue(OnFirst: boolean, U: number, V: number): void;
SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
SetValue(U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt): void;
SetValue(OnFirst: boolean, U: number, V: number): void;
SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
SetValue(U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt): void;
SetValue(OnFirst: boolean, U: number, V: number): void;
SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
SetValue(U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt): void;
SetValue(OnFirst: boolean, U: number, V: number): void;
SetValue(Pt: gp_Pnt, OnFirst: boolean, U: number, V: number): void;
SetValue(U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt: gp_Pnt, U1: number, V1: number, U2: number, V2: number): void;

// Returns the point in 3d space
Value(): gp_Pnt;

// Returns the point in 2d space of one of the surfaces
ValueOnSurface(OnFirst: boolean): gp_Pnt2d;

// Returns the parameters of the point on the first surface
ParametersOnS1(U1?: number, V1?: number): { U1: number; V1: number };

// Returns the parameters of the point on the second surface
ParametersOnS2(U2?: number, V2?: number): { U2: number; V2: number };

// Returns the parameters of the point in the parametric space of one of the surface
ParametersOnSurface(OnFirst: boolean, U?: number, V?: number): { U: number; V: number };

// Returns the parameters of the point on both surfaces
Parameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

// Returns TRUE if 2D- and 3D-coordinates of theOterPoint are equal to corresponding coordinates of me (with given tolerance)
IsSame(theOtherPoint: IntSurf_PntOn2S, theTol3D?: number, theTol2D?: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntSurf_Quadric: declare class IntSurf_Quadric

constructor

SetValue(P: gp_Pln): void;
SetValue(C: gp_Cylinder): void;
SetValue(S: gp_Sphere): void;
SetValue(C: gp_Cone): void;
SetValue(T: gp_Torus): void;
SetValue(P: gp_Pln): void;
SetValue(C: gp_Cylinder): void;
SetValue(S: gp_Sphere): void;
SetValue(C: gp_Cone): void;
SetValue(T: gp_Torus): void;
SetValue(P: gp_Pln): void;
SetValue(C: gp_Cylinder): void;
SetValue(S: gp_Sphere): void;
SetValue(C: gp_Cone): void;
SetValue(T: gp_Torus): void;
SetValue(P: gp_Pln): void;
SetValue(C: gp_Cylinder): void;
SetValue(S: gp_Sphere): void;
SetValue(C: gp_Cone): void;
SetValue(T: gp_Torus): void;
SetValue(P: gp_Pln): void;
SetValue(C: gp_Cylinder): void;
SetValue(S: gp_Sphere): void;
SetValue(C: gp_Cone): void;
SetValue(T: gp_Torus): void;

Distance(P: gp_Pnt): number;

Gradient(P: gp_Pnt): gp_Vec;

ValAndGrad(P: gp_Pnt, Dist: number, Grad: gp_Vec): { Dist: number };

TypeQuadric(): GeomAbs_SurfaceType;

Plane(): gp_Pln;

Sphere(): gp_Sphere;

Cylinder(): gp_Cylinder;

Cone(): gp_Cone;

Torus(): gp_Torus;

Value(U: number, V: number): gp_Pnt;

D1(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

DN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

Normale(U: number, V: number): gp_Vec;
Normale(P: gp_Pnt): gp_Vec;
Normale(U: number, V: number): gp_Vec;
Normale(P: gp_Pnt): gp_Vec;

Parameters(P: gp_Pnt, U?: number, V?: number): { U: number; V: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a tool on a quadric that can be used to instantiates the Walking algorithms (see package IntWalk) with a Quadric from {@link IntSurf`IntSurf`} as implicit surface
IntSurf_QuadricTool: declare class IntSurf_QuadricTool

constructor

// Returns the value of the function
static Value(Quad: IntSurf_Quadric, X: number, Y: number, Z: number): number;

// Returns the gradient of the function
static Gradient(Quad: IntSurf_Quadric, X: number, Y: number, Z: number, V: gp_Vec): void;
// V: Mutated in place

// Returns the value and the gradient
static ValueAndGradient(Quad: IntSurf_Quadric, X: number, Y: number, Z: number, Val: number, Grad: gp_Vec): { Val: number };
// Grad: Mutated in place

// returns the tolerance of the zero of the implicit function
static Tolerance(Quad: IntSurf_Quadric): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntSurf_Situation: typeof IntSurf_Situation[keyof typeof IntSurf_Situation]

// Definition of the transition at the intersection between an intersection line and a restriction curve on a surface
IntSurf_Transition: declare class IntSurf_Transition

constructor

// Set the values of an IN or OUT transition
SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
SetValue(): void;
SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
SetValue(): void;
SetValue(Tangent: boolean, Type: IntSurf_TypeTrans): void;
SetValue(Tangent: boolean, Situ: IntSurf_Situation, Oppos: boolean): void;
SetValue(): void;

// Returns the type of Transition (in/out/touch/undecided) for the arc given by value
TransitionType(): IntSurf_TypeTrans;

// Returns TRUE if the point is tangent to the arc given by Value
IsTangent(): boolean;

// Returns a significant value if TransitionType returns TOUCH
Situation(): IntSurf_Situation;

// returns a significant value if TransitionType returns TOUCH
IsOpposite(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntSurf_TypeTrans: typeof IntSurf_TypeTrans[keyof typeof IntSurf_TypeTrans]

IntSurf_ListOfPntOn2S: NCollection_List_IntSurf_PntOn2S

IntSurf_SequenceOfInteriorPoint: NCollection_Sequence_IntSurf_InteriorPoint

IntSurf_SequenceOfPathPoint: NCollection_Sequence_IntSurf_PathPoint
