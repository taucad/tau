# libcascade — Intrv

3 top-level symbols. Signatures are verbatim typescript.

Intrv_Interval: declare class Intrv_Interval

constructor

Start(): number;

End(): number;

TolStart(): number;

TolEnd(): number;

Bounds(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

SetStart(Start: number, TolStart: number): void;

FuseAtStart(Start: number, TolStart: number): void;

CutAtStart(Start: number, TolStart: number): void;

SetEnd(End: number, TolEnd: number): void;

FuseAtEnd(End: number, TolEnd: number): void;

CutAtEnd(End: number, TolEnd: number): void;

IsProbablyEmpty(): boolean;

Position(Other: Intrv_Interval): Intrv_Position;

IsBefore(Other: Intrv_Interval): boolean;

IsAfter(Other: Intrv_Interval): boolean;

IsInside(Other: Intrv_Interval): boolean;

IsEnclosing(Other: Intrv_Interval): boolean;

IsJustEnclosingAtStart(Other: Intrv_Interval): boolean;

IsJustEnclosingAtEnd(Other: Intrv_Interval): boolean;

IsJustBefore(Other: Intrv_Interval): boolean;

IsJustAfter(Other: Intrv_Interval): boolean;

IsOverlappingAtStart(Other: Intrv_Interval): boolean;

IsOverlappingAtEnd(Other: Intrv_Interval): boolean;

IsJustOverlappingAtStart(Other: Intrv_Interval): boolean;

IsJustOverlappingAtEnd(Other: Intrv_Interval): boolean;

IsSimilar(Other: Intrv_Interval): boolean;

delete(): void;

[Symbol.dispose](): void;

Intrv_Intervals: declare class Intrv_Intervals

constructor

Intersect(Tool: Intrv_Interval): void;
Intersect(Tool: Intrv_Intervals): void;
Intersect(Tool: Intrv_Interval): void;
Intersect(Tool: Intrv_Intervals): void;

Subtract(Tool: Intrv_Interval): void;
Subtract(Tool: Intrv_Intervals): void;
Subtract(Tool: Intrv_Interval): void;
Subtract(Tool: Intrv_Intervals): void;

Unite(Tool: Intrv_Interval): void;
Unite(Tool: Intrv_Intervals): void;
Unite(Tool: Intrv_Interval): void;
Unite(Tool: Intrv_Intervals): void;

XUnite(Tool: Intrv_Interval): void;
XUnite(Tool: Intrv_Intervals): void;
XUnite(Tool: Intrv_Interval): void;
XUnite(Tool: Intrv_Intervals): void;

NbIntervals(): number;

Value(Index: number): Intrv_Interval;

delete(): void;

[Symbol.dispose](): void;

Intrv_Position: typeof Intrv_Position[keyof typeof Intrv_Position]
