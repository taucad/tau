# libcascade — Intrv

3 top-level symbols. Signatures are verbatim typescript.

// **----------\*\*** Other **_--_ IsBefore \***---------\* IsJustBefore **_--------------_ IsOverlappingAtStart \***-----------------------\* IsJustEnclosingAtEnd **_----------------------------------_ IsEnclosing \***---\* IsJustOverlappingAtStart **_------------_ IsSimilar \***-----------------------\* IsJustEnclosingAtStart **_-_ IsInside \***-----\* IsJustOverlappingAtEnd **_----------------_ IsOverlappingAtEnd \***-------\* IsJustAfter _\*\*--_ IsAfter
Intrv_Interval: declare class Intrv_Interval

constructor

Start(): number;

End(): number;

TolStart(): number;

TolEnd(): number;

Bounds(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

SetStart(Start: number, TolStart: number): void;

// \***\*+\*\***-------------------> Old one \***\*+\*\***-----------------------> New one to fuse <<< <<< \***\*+\*\***-----------------------> result
FuseAtStart(Start: number, TolStart: number): void;

// \***\*+\*\***----------> Old one <---------**+** Tool for cutting \***\*+\*\***----------> result
CutAtStart(Start: number, TolStart: number): void;

SetEnd(End: number, TolEnd: number): void;

// <--------------------\***\*+\*\*** Old one <----------------**+** New one to fuse <--------------------\***\*+\*\*** result
FuseAtEnd(End: number, TolEnd: number): void;

// <----\***\*+\*\*** Old one **+**-----> Tool for cutting <<< <<< <----\***\*+\*\*** result
CutAtEnd(End: number, TolEnd: number): void;

// True if myStart+myTolStart > myEnd-myTolEnd or if myEnd+myTolEnd > myStart-myTolStart
IsProbablyEmpty(): boolean;

// True if me is Before Other **----------\*\*** Other **_----_ Before \***-----------\* JustBefore **_----------------_ OverlappingAtStart \***-------------------------\* JustEnclosingAtEnd **_------------------------------------_ Enclosing \***---\* JustOverlappingAtStart **_------------_ Similar \***-----------------------\* JustEnclosingAtStart **_-_ Inside \***-----\* JustOverlappingAtEnd **_----------------_ OverlappingAtEnd \***-------\* JustAfter _\*\*--_ After
Position(Other: Intrv_Interval): Intrv_Position;

// True if me is Before Other **\*---------------** me **----------\*\*** Other
IsBefore(Other: Intrv_Interval): boolean;

// True if me is After Other **----------\*\*** me **\*---------------** Other
IsAfter(Other: Intrv_Interval): boolean;

// True if me is Inside Other **----------\*\*** me **\*-------------------------** Other
IsInside(Other: Intrv_Interval): boolean;

// True if me is Enclosing Other **\*---------------------------\*\*** me **\*-----------------** Other
IsEnclosing(Other: Intrv_Interval): boolean;

// True if me is just Enclosing Other at start **\*--------------------------\*\*** me **\*-----------------** Other
IsJustEnclosingAtStart(Other: Intrv_Interval): boolean;

// True if me is just Enclosing Other at End **\*---------------------------\*\*** me **\*----------------\*\*** Other
IsJustEnclosingAtEnd(Other: Intrv_Interval): boolean;

// True if me is just before Other **\*-------\*\*** me **\*----------** Other
IsJustBefore(Other: Intrv_Interval): boolean;

// True if me is just after Other \***\*------\*\*** me **\*----------** Other
IsJustAfter(Other: Intrv_Interval): boolean;

// True if me is overlapping Other at start **_--------------_** me **\*----------** Other
IsOverlappingAtStart(Other: Intrv_Interval): boolean;

// True if me is overlapping Other at end **\*----------** me **_--------------_** Other
IsOverlappingAtEnd(Other: Intrv_Interval): boolean;

// True if me is just overlapping Other at start **_----------_** me **\*-----------------------** Other
IsJustOverlappingAtStart(Other: Intrv_Interval): boolean;

// True if me is just overlapping Other at end **_----------_ me \***-----------------------\*\* Other
IsJustOverlappingAtEnd(Other: Intrv_Interval): boolean;

// True if me and Other have the same bounds \*---------------**_ me _**----------------\*\* Other
IsSimilar(Other: Intrv_Interval): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class Intervals is a sorted sequence of non overlapping Real Intervals
Intrv_Intervals: declare class Intrv_Intervals

constructor

// Intersects the intervals with the interval <Tool>
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Intrv_Position: typeof Intrv_Position[keyof typeof Intrv_Position]
