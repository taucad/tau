# libcascade — TopCnx

1 top-level symbols. Signatures are verbatim typescript.

TopCnx_EdgeFaceTransition: declare class TopCnx_EdgeFaceTransition

  // TopCnx_EdgeFaceTransition.constructor (constructor)
  constructor();

  // TopCnx_EdgeFaceTransition.Reset (method)
  Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
  Reset(Tgt: gp_Dir): void;

  // TopCnx_EdgeFaceTransition.AddInterference (method)
  AddInterference(Tole: number, Tang: gp_Dir, Norm: gp_Dir, Curv: number, Or: TopAbs_Orientation, Tr: TopAbs_Orientation, BTr: TopAbs_Orientation): void;

  // TopCnx_EdgeFaceTransition.Transition (method)
  Transition(): TopAbs_Orientation;

  // TopCnx_EdgeFaceTransition.BoundaryTransition (method)
  BoundaryTransition(): TopAbs_Orientation;

  // TopCnx_EdgeFaceTransition.delete (method)
  delete(): void;

  // TopCnx_EdgeFaceTransition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
