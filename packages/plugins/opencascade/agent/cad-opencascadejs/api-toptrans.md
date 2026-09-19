# libcascade — TopTrans

2 top-level symbols. Signatures are verbatim typescript.

TopTrans_CurveTransition: declare class TopTrans_CurveTransition

  constructor

  Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
  Reset(Tgt: gp_Dir): void;
  Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
  Reset(Tgt: gp_Dir): void;

  Compare(Tole: number, Tang: gp_Dir, Norm: gp_Dir, Curv: number, S: TopAbs_Orientation, Or: TopAbs_Orientation): void;

  StateBefore(): TopAbs_State;

  StateAfter(): TopAbs_State;

  delete(): void;

  [Symbol.dispose](): void;

TopTrans_SurfaceTransition: declare class TopTrans_SurfaceTransition

  constructor

  Reset(Tgt: gp_Dir, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number): void;
  Reset(Tgt: gp_Dir, Norm: gp_Dir): void;
  Reset(Tgt: gp_Dir, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number): void;
  Reset(Tgt: gp_Dir, Norm: gp_Dir): void;

  Compare(Tole: number, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
  Compare(Tole: number, Norm: gp_Dir, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
  Compare(Tole: number, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
  Compare(Tole: number, Norm: gp_Dir, S: TopAbs_Orientation, O: TopAbs_Orientation): void;

  StateBefore(): TopAbs_State;

  StateAfter(): TopAbs_State;

  static GetBefore(Tran: TopAbs_Orientation): TopAbs_State;

  static GetAfter(Tran: TopAbs_Orientation): TopAbs_State;

  delete(): void;

  [Symbol.dispose](): void;
