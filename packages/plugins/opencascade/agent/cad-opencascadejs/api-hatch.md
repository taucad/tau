# libcascade — Hatch

4 top-level symbols. Signatures are verbatim typescript.

Hatch_Hatcher: declare class Hatch_Hatcher

constructor

Tolerance(Tol: number): void;
Tolerance(): number;
Tolerance(Tol: number): void;
Tolerance(): number;

AddLine(L: gp_Lin2d, T: Hatch_LineForm): void;
AddLine(D: gp_Dir2d, Dist: number): void;
AddLine(L: gp_Lin2d, T: Hatch_LineForm): void;
AddLine(D: gp_Dir2d, Dist: number): void;

AddXLine(X: number): void;

AddYLine(Y: number): void;

Trim(L: gp_Lin2d, Index: number): void;
Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;
Trim(L: gp_Lin2d, Index: number): void;
Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;
Trim(L: gp_Lin2d, Index: number): void;
Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;

NbIntervals(): number;
NbIntervals(I: number): number;
NbIntervals(): number;
NbIntervals(I: number): number;

NbLines(): number;

Line(I: number): gp_Lin2d;

LineForm(I: number): Hatch_LineForm;

IsXLine(I: number): boolean;

IsYLine(I: number): boolean;

Coordinate(I: number): number;

Start(I: number, J: number): number;

StartIndex(I: number, J: number, Index?: number, Par2?: number): { Index: number; Par2: number };

End(I: number, J: number): number;

EndIndex(I: number, J: number, Index?: number, Par2?: number): { Index: number; Par2: number };

delete(): void;

[Symbol.dispose](): void;

Hatch_Line: declare class Hatch_Line

constructor

AddIntersection(Par1: number, Start: boolean, Index: number, Par2: number, theToler: number): void;

delete(): void;

[Symbol.dispose](): void;

Hatch_LineForm: typeof Hatch_LineForm[keyof typeof Hatch_LineForm]

Hatch_Parameter: declare class Hatch_Parameter

constructor

delete(): void;

[Symbol.dispose](): void;
