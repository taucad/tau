# libcascade — Intrv

3 top-level symbols. Signatures are verbatim typescript.

Intrv_Interval: declare class Intrv_Interval

  // Intrv_Interval.constructor (constructor)
  constructor();
  constructor(Start: number, End: number);
  constructor(Start: number, TolStart: number, End: number, TolEnd: number);

  // Intrv_Interval.Start (method)
  Start(): number;

  // Intrv_Interval.End (method)
  End(): number;

  // Intrv_Interval.TolStart (method)
  TolStart(): number;

  // Intrv_Interval.TolEnd (method)
  TolEnd(): number;

  // Intrv_Interval.Bounds (method)
  Bounds(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

  // Intrv_Interval.SetStart (method)
  SetStart(Start: number, TolStart: number): void;

  // Intrv_Interval.FuseAtStart (method)
  FuseAtStart(Start: number, TolStart: number): void;

  // Intrv_Interval.CutAtStart (method)
  CutAtStart(Start: number, TolStart: number): void;

  // Intrv_Interval.SetEnd (method)
  SetEnd(End: number, TolEnd: number): void;

  // Intrv_Interval.FuseAtEnd (method)
  FuseAtEnd(End: number, TolEnd: number): void;

  // Intrv_Interval.CutAtEnd (method)
  CutAtEnd(End: number, TolEnd: number): void;

  // Intrv_Interval.IsProbablyEmpty (method)
  IsProbablyEmpty(): boolean;

  // Intrv_Interval.Position (method)
  Position(Other: Intrv_Interval): Intrv_Position;

  // Intrv_Interval.IsBefore (method)
  IsBefore(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsAfter (method)
  IsAfter(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsInside (method)
  IsInside(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsEnclosing (method)
  IsEnclosing(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsJustEnclosingAtStart (method)
  IsJustEnclosingAtStart(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsJustEnclosingAtEnd (method)
  IsJustEnclosingAtEnd(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsJustBefore (method)
  IsJustBefore(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsJustAfter (method)
  IsJustAfter(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsOverlappingAtStart (method)
  IsOverlappingAtStart(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsOverlappingAtEnd (method)
  IsOverlappingAtEnd(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsJustOverlappingAtStart (method)
  IsJustOverlappingAtStart(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsJustOverlappingAtEnd (method)
  IsJustOverlappingAtEnd(Other: Intrv_Interval): boolean;

  // Intrv_Interval.IsSimilar (method)
  IsSimilar(Other: Intrv_Interval): boolean;

  // Intrv_Interval.delete (method)
  delete(): void;

  // Intrv_Interval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intrv_Intervals: declare class Intrv_Intervals

  // Intrv_Intervals.constructor (constructor)
  constructor();
  constructor(Int: Intrv_Interval);

  // Intrv_Intervals.Intersect (method)
  Intersect(Tool: Intrv_Interval): void;
  Intersect(Tool: Intrv_Intervals): void;

  // Intrv_Intervals.Subtract (method)
  Subtract(Tool: Intrv_Interval): void;
  Subtract(Tool: Intrv_Intervals): void;

  // Intrv_Intervals.Unite (method)
  Unite(Tool: Intrv_Interval): void;
  Unite(Tool: Intrv_Intervals): void;

  // Intrv_Intervals.XUnite (method)
  XUnite(Tool: Intrv_Interval): void;
  XUnite(Tool: Intrv_Intervals): void;

  // Intrv_Intervals.NbIntervals (method)
  NbIntervals(): number;

  // Intrv_Intervals.Value (method)
  Value(Index: number): Intrv_Interval;

  // Intrv_Intervals.delete (method)
  delete(): void;

  // Intrv_Intervals.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Intrv_Position: typeof Intrv_Position[keyof typeof Intrv_Position]

  readonly Intrv_Before: 'Intrv_Before'

  readonly Intrv_JustBefore: 'Intrv_JustBefore'

  readonly Intrv_OverlappingAtStart: 'Intrv_OverlappingAtStart'

  readonly Intrv_JustEnclosingAtEnd: 'Intrv_JustEnclosingAtEnd'

  readonly Intrv_Enclosing: 'Intrv_Enclosing'

  readonly Intrv_JustOverlappingAtStart: 'Intrv_JustOverlappingAtStart'

  readonly Intrv_Similar: 'Intrv_Similar'

  readonly Intrv_JustEnclosingAtStart: 'Intrv_JustEnclosingAtStart'

  readonly Intrv_Inside: 'Intrv_Inside'

  readonly Intrv_JustOverlappingAtEnd: 'Intrv_JustOverlappingAtEnd'

  readonly Intrv_OverlappingAtEnd: 'Intrv_OverlappingAtEnd'

  readonly Intrv_JustAfter: 'Intrv_JustAfter'

  readonly Intrv_After: 'Intrv_After'
