# libcascade — TopCnx

1 top-level symbols. Signatures are verbatim typescript.

// TheEdgeFaceTransition is an algorithm to compute the cumulated transition for interferences on an edge
TopCnx_EdgeFaceTransition: declare class TopCnx_EdgeFaceTransition

constructor

// Initialize the algorithm with the local description of the edge
Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
Reset(Tgt: gp_Dir): void;
Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
Reset(Tgt: gp_Dir): void;

// Add a curve element to the boundary
AddInterference(Tole: number, Tang: gp_Dir, Norm: gp_Dir, Curv: number, Or: TopAbs_Orientation, Tr: TopAbs_Orientation, BTr: TopAbs_Orientation): void;

// Returns the current cumulated transition
Transition(): TopAbs_Orientation;

// Returns the current cumulated BoundaryTransition
BoundaryTransition(): TopAbs_Orientation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
