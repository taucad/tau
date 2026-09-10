# libcascade — IntAna

5 top-level symbols. Signatures are verbatim typescript.

// Definition of a parametric Curve which is the result of the intersection between two quadrics
IntAna_Curve: declare class IntAna_Curve

constructor

// Sets the parameters used to compute Points and Derivative on the curve
SetCylinderQuadValues(Cylinder: gp_Cylinder, Qxx: number, Qyy: number, Qzz: number, Qxy: number, Qxz: number, Qyz: number, Qx: number, Qy: number, Qz: number, Q1: number, Tol: number, DomInf: number, DomSup: number, TwoZForATheta: boolean, ZIsPositive: boolean): void;

// Sets the parameters used to compute Points and Derivative on the curve
SetConeQuadValues(Cone: gp_Cone, Qxx: number, Qyy: number, Qzz: number, Qxy: number, Qxz: number, Qyz: number, Qx: number, Qy: number, Qz: number, Q1: number, Tol: number, DomInf: number, DomSup: number, TwoZForATheta: boolean, ZIsPositive: boolean): void;

// Returns TRUE if the curve is not infinite at the last parameter or at the first parameter of the domain
IsOpen(): boolean;

// Returns the parametric domain of the curve
Domain(theFirst?: number, theLast?: number): { theFirst: number; theLast: number };

// Returns TRUE if the function is constant
IsConstant(): boolean;

// Returns TRUE if the domain is open at the beginning
IsFirstOpen(): boolean;

// Returns TRUE if the domain is open at the end
IsLastOpen(): boolean;

// Returns the point at parameter Theta on the curve
Value(Theta: number): gp_Pnt;

// Returns the point and the first derivative at parameter Theta on the curve
D1u(Theta: number, P: gp_Pnt, V: gp_Vec): boolean;
// P: Mutated in place
// V: Mutated in place

// Tries to find the parameter of the point P on the curve
FindParameter(P: gp_Pnt, theParams: NCollection_List_double): void;
// theParams: Mutated in place

// If flag is True, the Curve is not defined at the first parameter of its domain
SetIsFirstOpen(Flag: boolean): void;

// If flag is True, the Curve is not defined at the first parameter of its domain
SetIsLastOpen(Flag: boolean): void;

// Trims this curve
SetDomain(theFirst: number, theLast: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Intersection between 3 planes
IntAna_Int3Pln: declare class IntAna_Int3Pln

constructor

// Determination of the intersection point between 3 planes
Perform(P1: gp_Pln, P2: gp_Pln, P3: gp_Pln): void;

// Returns True if the computation was successful
IsDone(): boolean;

// Returns TRUE if there is no intersection POINT
IsEmpty(): boolean;

// Returns the intersection point
Value(): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides the analytic intersection between a conic defined as an element of gp (Lin,Circ,Elips, Parab,Hypr) and a quadric as defined in the class Quadric from IntAna
IntAna_IntConicQuad: declare class IntAna_IntConicQuad

constructor

// Intersects a line and a quadric
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;
Perform(L: gp_Lin, Q: IntAna_Quadric): void;
Perform(C: gp_Circ, Q: IntAna_Quadric): void;
Perform(E: gp_Elips, Q: IntAna_Quadric): void;
Perform(P: gp_Parab, Q: IntAna_Quadric): void;
Perform(H: gp_Hypr, Q: IntAna_Quadric): void;
Perform(Pb: gp_Parab, P: gp_Pln, Tolang: number): void;
Perform(H: gp_Hypr, P: gp_Pln, Tolang: number): void;
Perform(C: gp_Circ, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(E: gp_Elips, P: gp_Pln, Tolang: number, Tol: number): void;
Perform(L: gp_Lin, P: gp_Pln, Tolang: number, Tol: number, Len: number): void;

// Returns TRUE if the creation completed
IsDone(): boolean;

// Returns TRUE if the conic is in the quadric
IsInQuadric(): boolean;

// Returns TRUE if the line is in a quadric which is parallel to the quadric
IsParallel(): boolean;

// Returns the number of intersection point
NbPoints(): number;

// Returns the point of range N
Point(N: number): gp_Pnt;

// Returns the parameter on the line of the intersection point of range N
ParamOnConic(N: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Intersection between a line and a torus
IntAna_IntLinTorus: declare class IntAna_IntLinTorus

constructor

// Intersects a line and a torus
Perform(L: gp_Lin, T: gp_Torus): void;

// Returns True if the computation was successful
IsDone(): boolean;

// Returns the number of intersection points
NbPoints(): number;

// Returns the intersection point of range Index
Value(Index: number): gp_Pnt;

// Returns the parameter on the line of the intersection point of range Index
ParamOnLine(Index: number): number;

// Returns the parameters on the torus of the intersection point of range Index
ParamOnTorus(Index: number, FI?: number, THETA?: number): { FI: number; THETA: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides the analytic intersection between a cylinder or a cone from gp and another quadric, as defined in the class Quadric from IntAna
IntAna_IntQuadQuad: declare class IntAna_IntQuadQuad

constructor

// Intersects a cylinder and a quadric
Perform(C: gp_Cylinder, Q: IntAna_Quadric, Tol: number): void;
Perform(C: gp_Cone, Q: IntAna_Quadric, Tol: number): void;
Perform(C: gp_Cylinder, Q: IntAna_Quadric, Tol: number): void;
Perform(C: gp_Cone, Q: IntAna_Quadric, Tol: number): void;

// Returns True if the computation was successful
IsDone(): boolean;

// Returns TRUE if the cylinder, the cone or the sphere is identical to the quadric
IdenticalElements(): boolean;

// Returns the number of curves solution
NbCurve(): number;

// Returns the curve of range N
Curve(N: number): IntAna_Curve;

// Returns the number of contact point
NbPnt(): number;

// Returns the point of range N
Point(N: number): gp_Pnt;

// Returns the parameters on the "explicit quadric" (i.e
Parameters(N: number, U1?: number, U2?: number): { U1: number; U2: number };

// Returns True if the Curve I shares its last bound with another curve
HasNextCurve(I: number): boolean;

// If HasNextCurve(I) returns True, this function returns the Index J of the curve which has a common bound with the curve I
NextCurve(I: number, theOpposite?: boolean): { returnValue: number; theOpposite: boolean };

// Returns True if the Curve I shares its first bound with another curve
HasPreviousCurve(I: number): boolean;

// if HasPreviousCurve(I) returns True, this function returns the Index J of the curve which has a common bound with the curve I
PreviousCurve(I: number, theOpposite?: boolean): { returnValue: number; theOpposite: boolean };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
