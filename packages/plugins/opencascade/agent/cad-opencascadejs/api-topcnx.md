# libcascade — TopCnx

1 top-level symbols. Signatures are verbatim typescript.

TopCnx_EdgeFaceTransition: declare class TopCnx_EdgeFaceTransition

constructor

Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
Reset(Tgt: gp_Dir): void;
Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
Reset(Tgt: gp_Dir): void;

AddInterference(Tole: number, Tang: gp_Dir, Norm: gp_Dir, Curv: number, Or: TopAbs_Orientation, Tr: TopAbs_Orientation, BTr: TopAbs_Orientation): void;

Transition(): TopAbs_Orientation;

BoundaryTransition(): TopAbs_Orientation;

delete(): void;

[Symbol.dispose](): void;
