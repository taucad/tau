# libcascade — IntAna (2)

3 top-level symbols. Signatures are verbatim typescript.

// Geometric intersections between two natural quadrics (Sphere , Cylinder , Cone , Pln from gp)
IntAna_QuadQuadGeo: declare class IntAna_QuadQuadGeo

constructor

// Intersects a plane and a sphere
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;
Perform(P: gp_Pln, S: gp_Sphere): void;
Perform(Cyl1: gp_Cylinder, Cyl2: gp_Cylinder, Tol: number): void;
Perform(Cyl: gp_Cylinder, Sph: gp_Sphere, Tol: number): void;
Perform(Cyl: gp_Cylinder, Con: gp_Cone, Tol: number): void;
Perform(Sph1: gp_Sphere, Sph2: gp_Sphere, Tol: number): void;
Perform(Sph: gp_Sphere, Con: gp_Cone, Tol: number): void;
Perform(Con1: gp_Cone, Con2: gp_Cone, Tol: number): void;
Perform(Pln: gp_Pln, Tor: gp_Torus, Tol: number): void;
Perform(Cyl: gp_Cylinder, Tor: gp_Torus, Tol: number): void;
Perform(Con: gp_Cone, Tor: gp_Torus, Tol: number): void;
Perform(Sph: gp_Sphere, Tor: gp_Torus, Tol: number): void;
Perform(Tor1: gp_Torus, Tor2: gp_Torus, Tol: number): void;
Perform(P1: gp_Pln, P2: gp_Pln, TolAng: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cone, Tolang: number, Tol: number): void;
Perform(P: gp_Pln, C: gp_Cylinder, Tolang: number, Tol: number, H: number): void;

// Returns true if the computation was successful
IsDone(): boolean;

// Returns the type of intersection
TypeInter(): IntAna_ResultType;

// Returns the number of intersections
NbSolutions(): number;

// Returns the point solution of range Num
Point(Num: number): gp_Pnt;

// Returns the line solution of range Num
Line(Num: number): gp_Lin;

// Returns the circle solution of range Num
Circle(Num: number): gp_Circ;

// Returns the ellipse solution of range Num
Ellipse(Num: number): gp_Elips;

// Returns the parabola solution of range Num
Parabola(Num: number): gp_Parab;

// Returns the hyperbola solution of range Num
Hyperbola(Num: number): gp_Hypr;

HasCommonGen(): boolean;

PChar(): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a description of Quadrics by their Coefficients in natural coordinate system
IntAna_Quadric: declare class IntAna_Quadric

constructor

// Initializes the quadric with a Pln
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;
SetQuadric(P: gp_Pln): void;
SetQuadric(Sph: gp_Sphere): void;
SetQuadric(Con: gp_Cone): void;
SetQuadric(Cyl: gp_Cylinder): void;

// Returns the coefficients of the polynomial equation which define the quadric
Coefficients(xCXX?: number, xCYY?: number, xCZZ?: number, xCXY?: number, xCXZ?: number, xCYZ?: number, xCX?: number, xCY?: number, xCZ?: number, xCCte?: number): { xCXX: number; xCYY: number; xCZZ: number; xCXY: number; xCXZ: number; xCYZ: number; xCX: number; xCY: number; xCZ: number; xCCte: number };

// Returns the coefficients of the polynomial equation ( written in the natural coordinates system ) in the local coordinates system defined by Axis
NewCoefficients(xCXX: number, xCYY: number, xCZZ: number, xCXY: number, xCXZ: number, xCYZ: number, xCX: number, xCY: number, xCZ: number, xCCte: number, Axis: gp_Ax3): { xCXX: number; xCYY: number; xCZZ: number; xCXY: number; xCXZ: number; xCYZ: number; xCX: number; xCY: number; xCZ: number; xCCte: number };

// Returns the list of special points (with singularities)
SpecialPoints(): NCollection_List_gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntAna_ResultType: typeof IntAna_ResultType[keyof typeof IntAna_ResultType]
