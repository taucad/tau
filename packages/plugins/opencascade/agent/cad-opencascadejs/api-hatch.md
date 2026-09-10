# libcascade — Hatch

4 top-level symbols. Signatures are verbatim typescript.

// The Hatcher is an algorithm to compute cross hatchings in a 2d plane
Hatch_Hatcher: declare class Hatch_Hatcher

constructor

Tolerance(Tol: number): void;
Tolerance(): number;
Tolerance(Tol: number): void;
Tolerance(): number;

// Add a line <L> to be trimmed
AddLine(L: gp_Lin2d, T: Hatch_LineForm): void;
AddLine(D: gp_Dir2d, Dist: number): void;
AddLine(L: gp_Lin2d, T: Hatch_LineForm): void;
AddLine(D: gp_Dir2d, Dist: number): void;

// Add an infinite line parallel to the Y-axis at abciss <X>
AddXLine(X: number): void;

// Add an infinite line parallel to the X-axis at ordinate <Y>
AddYLine(Y: number): void;

// Trims the lines at intersections with <L>
Trim(L: gp_Lin2d, Index: number): void;
Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;
Trim(L: gp_Lin2d, Index: number): void;
Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;
Trim(L: gp_Lin2d, Index: number): void;
Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;

// Returns the total number of intervals on all the lines
NbIntervals(): number;
NbIntervals(I: number): number;
NbIntervals(): number;
NbIntervals(I: number): number;

// Returns the number of lines
NbLines(): number;

// Returns the line of index _._
Line(I: number): gp_Lin2d;

// Returns the type of the line of index _._
LineForm(I: number): Hatch_LineForm;

// Returns True if the line of index _has a constant X value._
IsXLine(I: number): boolean;

// Returns True if the line of index _has a constant Y value._
IsYLine(I: number): boolean;

// Returns the X or Y coordinate of the line of index _if it is a X or a Y line._
Coordinate(I: number): number;

// Returns the first parameter of interval <J> on line _._
Start(I: number, J: number): number;

// Returns the first Index and Par2 of interval <J> on line _._
StartIndex(I: number, J: number, Index?: number, Par2?: number): { Index: number; Par2: number };

// Returns the last parameter of interval <J> on line _._
End(I: number, J: number): number;

// Returns the last Index and Par2 of interval <J> on line _._
EndIndex(I: number, J: number, Index?: number, Par2?: number): { Index: number; Par2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a Line in the Hatcher
Hatch_Line: declare class Hatch_Line

constructor

// Insert a new intersection in the sorted list
AddIntersection(Par1: number, Start: boolean, Index: number, Par2: number, theToler: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Form of a trimmed line
Hatch_LineForm: typeof Hatch_LineForm[keyof typeof Hatch_LineForm]

// Stores an intersection on a line represented by
Hatch_Parameter: declare class Hatch_Parameter

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
