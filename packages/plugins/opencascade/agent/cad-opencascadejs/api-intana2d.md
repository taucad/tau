# libcascade — IntAna2d

3 top-level symbols. Signatures are verbatim typescript.

// Implementation of the analytical intersection between
IntAna2d_AnaIntersection: declare class IntAna2d_AnaIntersection

constructor

// Intersection between two lines
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;
Perform(L1: gp_Lin2d, L2: gp_Lin2d): void;
Perform(C1: gp_Circ2d, C2: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: gp_Circ2d): void;
Perform(L: gp_Lin2d, C: IntAna2d_Conic): void;
Perform(C: gp_Circ2d, Co: IntAna2d_Conic): void;
Perform(E: gp_Elips2d, C: IntAna2d_Conic): void;
Perform(P: gp_Parab2d, C: IntAna2d_Conic): void;
Perform(H: gp_Hypr2d, C: IntAna2d_Conic): void;

// Returns TRUE if the computation was successful
IsDone(): boolean;

// Returns TRUE when there is no intersection, i-e
IsEmpty(): boolean;

// For the intersection between an element of gp and a conic known by an implicit equation, the result will be TRUE if the element of gp verifies the implicit equation
IdenticalElements(): boolean;

// For the intersection between two Lin2d or two Circ2d, the function returns TRUE if the elements are parallel
ParallelElements(): boolean;

// returns the number of IntPoint between the 2 curves
NbPoints(): number;

// returns the intersection point of range N
Point(N: number): IntAna2d_IntPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of a conic by its implicit quadaratic equation
IntAna2d_Conic: declare class IntAna2d_Conic

constructor

// value of the function F at the point X,Y
Value(X: number, Y: number): number;

// returns the value of the gradient of F at the point X,Y
Grad(X: number, Y: number): gp_XY;

// Returns the value of the function and its gradient at the point X,Y
ValAndGrad(X: number, Y: number, Val: number, Grd: gp_XY): { Val: number };
// Grd: Mutated in place

// returns the coefficients of the polynomial equation which defines the conic
Coefficients(A?: number, B?: number, C?: number, D?: number, E?: number, F?: number): { A: number; B: number; C: number; D: number; E: number; F: number };

// Returns the coefficients of the polynomial equation ( written in the natural coordinates system ) A x x + B y y + 2 C x y + 2 D x + 2 E y + F in the local coordinates system defined by Axis
NewCoefficients(A: number, B: number, C: number, D: number, E: number, F: number, Axis: gp_Ax2d): { A: number; B: number; C: number; D: number; E: number; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Geometrical intersection between two 2d elements
IntAna2d_IntPoint: declare class IntAna2d_IntPoint

constructor

// Set the values for a "non-implicit" point
SetValue(X: number, Y: number, U1: number, U2: number): void;
SetValue(X: number, Y: number, U1: number): void;
SetValue(X: number, Y: number, U1: number, U2: number): void;
SetValue(X: number, Y: number, U1: number): void;

// Returns the geometric point
Value(): gp_Pnt2d;

// Returns True if the second curve is implicit
SecondIsImplicit(): boolean;

// Returns the parameter on the first element
ParamOnFirst(): number;

// Returns the parameter on the second element
ParamOnSecond(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
