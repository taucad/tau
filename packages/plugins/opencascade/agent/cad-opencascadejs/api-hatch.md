# libcascade — Hatch

4 top-level symbols. Signatures are verbatim typescript.

Hatch_Hatcher: declare class Hatch_Hatcher

  // Hatch_Hatcher.constructor (constructor)
  constructor(Tol: number, Oriented?: boolean);

  // Hatch_Hatcher.Tolerance (method)
  Tolerance(Tol: number): void;
  Tolerance(): number;

  // Hatch_Hatcher.AddLine (method)
  AddLine(L: gp_Lin2d, T: Hatch_LineForm): void;
  AddLine(D: gp_Dir2d, Dist: number): void;

  // Hatch_Hatcher.AddXLine (method)
  AddXLine(X: number): void;

  // Hatch_Hatcher.AddYLine (method)
  AddYLine(Y: number): void;

  // Hatch_Hatcher.Trim (method)
  Trim(L: gp_Lin2d, Index: number): void;
  Trim(L: gp_Lin2d, Start: number, End: number, Index: number): void;
  Trim(P1: gp_Pnt2d, P2: gp_Pnt2d, Index: number): void;

  // Hatch_Hatcher.NbIntervals (method)
  NbIntervals(): number;
  NbIntervals(I: number): number;

  // Hatch_Hatcher.NbLines (method)
  NbLines(): number;

  // Hatch_Hatcher.Line (method)
  Line(I: number): gp_Lin2d;

  // Hatch_Hatcher.LineForm (method)
  LineForm(I: number): Hatch_LineForm;

  // Hatch_Hatcher.IsXLine (method)
  IsXLine(I: number): boolean;

  // Hatch_Hatcher.IsYLine (method)
  IsYLine(I: number): boolean;

  // Hatch_Hatcher.Coordinate (method)
  Coordinate(I: number): number;

  // Hatch_Hatcher.Start (method)
  Start(I: number, J: number): number;

  // Hatch_Hatcher.StartIndex (method)
  StartIndex(I: number, J: number, Index?: number, Par2?: number): { Index: number; Par2: number };

  // Hatch_Hatcher.End (method)
  End(I: number, J: number): number;

  // Hatch_Hatcher.EndIndex (method)
  EndIndex(I: number, J: number, Index?: number, Par2?: number): { Index: number; Par2: number };

  // Hatch_Hatcher.delete (method)
  delete(): void;

  // Hatch_Hatcher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Hatch_Line: declare class Hatch_Line

  // Hatch_Line.constructor (constructor)
  constructor();
  constructor(L: gp_Lin2d, T: Hatch_LineForm);

  // Hatch_Line.AddIntersection (method)
  AddIntersection(Par1: number, Start: boolean, Index: number, Par2: number, theToler: number): void;

  // Hatch_Line.delete (method)
  delete(): void;

  // Hatch_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Hatch_LineForm: typeof Hatch_LineForm[keyof typeof Hatch_LineForm]

  readonly Hatch_XLINE: 'Hatch_XLINE'

  readonly Hatch_YLINE: 'Hatch_YLINE'

  readonly Hatch_ANYLINE: 'Hatch_ANYLINE'

Hatch_Parameter: declare class Hatch_Parameter

  // Hatch_Parameter.constructor (constructor)
  constructor();
  constructor(Par1: number, Start: boolean, Index?: number, Par2?: number);

  // Hatch_Parameter.delete (method)
  delete(): void;

  // Hatch_Parameter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
