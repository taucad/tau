# libcascade — TopBas

1 top-level symbols. Signatures are verbatim typescript.

TopBas_TestInterference: declare class TopBas_TestInterference

constructor

Intersection(I: number): void;
Intersection(): number;
Intersection(I: number): void;
Intersection(): number;

Boundary(B: number): void;
Boundary(): number;
Boundary(B: number): void;
Boundary(): number;

Orientation(O: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;
Orientation(O: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;

Transition(Tr: TopAbs_Orientation): void;
Transition(): TopAbs_Orientation;
Transition(Tr: TopAbs_Orientation): void;
Transition(): TopAbs_Orientation;

BoundaryTransition(BTr: TopAbs_Orientation): void;
BoundaryTransition(): TopAbs_Orientation;
BoundaryTransition(BTr: TopAbs_Orientation): void;
BoundaryTransition(): TopAbs_Orientation;

ChangeIntersection(): number;

ChangeBoundary(): number;

delete(): void;

[Symbol.dispose](): void;
