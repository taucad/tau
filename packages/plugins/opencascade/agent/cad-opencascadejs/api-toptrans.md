# libcascade — TopTrans

2 top-level symbols. Signatures are verbatim typescript.

TopTrans_CurveTransition: declare class TopTrans_CurveTransition

  // TopTrans_CurveTransition.constructor (constructor)
  constructor();

  // TopTrans_CurveTransition.Reset (method)
  Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
  Reset(Tgt: gp_Dir): void;

  // TopTrans_CurveTransition.Compare (method)
  Compare(Tole: number, Tang: gp_Dir, Norm: gp_Dir, Curv: number, S: TopAbs_Orientation, Or: TopAbs_Orientation): void;

  // TopTrans_CurveTransition.StateBefore (method)
  StateBefore(): TopAbs_State;

  // TopTrans_CurveTransition.StateAfter (method)
  StateAfter(): TopAbs_State;

  // TopTrans_CurveTransition.delete (method)
  delete(): void;

  // TopTrans_CurveTransition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopTrans_SurfaceTransition: declare class TopTrans_SurfaceTransition

  // TopTrans_SurfaceTransition.constructor (constructor)
  constructor();

  // TopTrans_SurfaceTransition.Reset (method)
  Reset(Tgt: gp_Dir, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number): void;
  Reset(Tgt: gp_Dir, Norm: gp_Dir): void;

  // TopTrans_SurfaceTransition.Compare (method)
  Compare(Tole: number, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
  Compare(Tole: number, Norm: gp_Dir, S: TopAbs_Orientation, O: TopAbs_Orientation): void;

  // TopTrans_SurfaceTransition.StateBefore (method)
  StateBefore(): TopAbs_State;

  // TopTrans_SurfaceTransition.StateAfter (method)
  StateAfter(): TopAbs_State;

  // TopTrans_SurfaceTransition.GetBefore (method)
  static GetBefore(Tran: TopAbs_Orientation): TopAbs_State;

  // TopTrans_SurfaceTransition.GetAfter (method)
  static GetAfter(Tran: TopAbs_Orientation): TopAbs_State;

  // TopTrans_SurfaceTransition.delete (method)
  delete(): void;

  // TopTrans_SurfaceTransition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
