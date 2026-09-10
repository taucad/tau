# libcascade — TopTrans

2 top-level symbols. Signatures are verbatim typescript.

// This algorithm is used to compute the transition of a Curve intersecting a curvilinear boundary
TopTrans_CurveTransition: declare class TopTrans_CurveTransition

constructor

// Initialize a Transition with the local description of a Curve
Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
Reset(Tgt: gp_Dir): void;
Reset(Tgt: gp_Dir, Norm: gp_Dir, Curv: number): void;
Reset(Tgt: gp_Dir): void;

// Add a curve element to the boundary
Compare(Tole: number, Tang: gp_Dir, Norm: gp_Dir, Curv: number, S: TopAbs_Orientation, Or: TopAbs_Orientation): void;

// returns the state of the curve before the intersection, this is the position relative to the boundary of a point very close to the intersection on the negative side of the tangent
StateBefore(): TopAbs_State;

// returns the state of the curve after the intersection, this is the position relative to the boundary of a point very close to the intersection on the positive side of the tangent
StateAfter(): TopAbs_State;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm is used to compute the transition of a 3D surface intersecting a topological surfacic boundary on a 3D curve ( intersection curve )
TopTrans_SurfaceTransition: declare class TopTrans_SurfaceTransition

constructor

// Initialize a Surface Transition with the local description of the intersection curve and of the reference surface
Reset(Tgt: gp_Dir, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number): void;
Reset(Tgt: gp_Dir, Norm: gp_Dir): void;
Reset(Tgt: gp_Dir, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number): void;
Reset(Tgt: gp_Dir, Norm: gp_Dir): void;

// Add a face element to the boundary
Compare(Tole: number, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
Compare(Tole: number, Norm: gp_Dir, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
Compare(Tole: number, Norm: gp_Dir, MaxD: gp_Dir, MinD: gp_Dir, MaxCurv: number, MinCurv: number, S: TopAbs_Orientation, O: TopAbs_Orientation): void;
Compare(Tole: number, Norm: gp_Dir, S: TopAbs_Orientation, O: TopAbs_Orientation): void;

// Returns the state of the reference surface before the interference, this is the position relative to the surface of a point very close to the intersection on the negative side of the tangent
StateBefore(): TopAbs_State;

// Returns the state of the reference surface after interference, this is the position relative to the surface of a point very close to the intersection on the positive side of the tangent
StateAfter(): TopAbs_State;

static GetBefore(Tran: TopAbs_Orientation): TopAbs_State;

static GetAfter(Tran: TopAbs_Orientation): TopAbs_State;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
