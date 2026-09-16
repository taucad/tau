# libcascade — Geom2dHatch

6 top-level symbols. Signatures are verbatim typescript.

Geom2dHatch_Classifier: declare class Geom2dHatch_Classifier

  constructor

  State(): TopAbs_State;

  Rejected(): boolean;

  NoWires(): boolean;

  Edge(): Geom2dAdaptor_Curve;

  EdgeParameter(): number;

  Position(): IntRes2d_Position;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dHatch_Element: declare class Geom2dHatch_Element

  constructor

  Curve(): Geom2dAdaptor_Curve;

  ChangeCurve(): Geom2dAdaptor_Curve;

  Orientation(Orientation: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;
  Orientation(Orientation: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dHatch_FClass2dOfClassifier: declare class Geom2dHatch_FClass2dOfClassifier

  constructor

  Reset(L: gp_Lin2d, P: number, Tol: number): void;

  Compare(E: Geom2dAdaptor_Curve, Or: TopAbs_Orientation): void;

  Parameter(): number;

  Intersector(): Geom2dHatch_Intersector;

  ClosestIntersection(): number;

  State(): TopAbs_State;

  IsHeadOrEnd(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dHatch_Hatcher: declare class Geom2dHatch_Hatcher

  constructor

  Intersector(Intersector: Geom2dHatch_Intersector): void;
  Intersector(): Geom2dHatch_Intersector;
  Intersector(Intersector: Geom2dHatch_Intersector): void;
  Intersector(): Geom2dHatch_Intersector;

  ChangeIntersector(): Geom2dHatch_Intersector;

  Confusion2d(Confusion: number): void;
  Confusion2d(): number;
  Confusion2d(Confusion: number): void;
  Confusion2d(): number;

  Confusion3d(Confusion: number): void;
  Confusion3d(): number;
  Confusion3d(Confusion: number): void;
  Confusion3d(): number;

  KeepPoints(Keep: boolean): void;
  KeepPoints(): boolean;
  KeepPoints(Keep: boolean): void;
  KeepPoints(): boolean;

  KeepSegments(Keep: boolean): void;
  KeepSegments(): boolean;
  KeepSegments(Keep: boolean): void;
  KeepSegments(): boolean;

  Clear(): void;

  ElementCurve(IndE: number): Geom2dAdaptor_Curve;

  AddElement(Curve: Geom2dAdaptor_Curve, Orientation: TopAbs_Orientation): number;
  AddElement(Curve: Geom2d_Curve, Orientation: TopAbs_Orientation): number;
  AddElement(Curve: Geom2dAdaptor_Curve, Orientation: TopAbs_Orientation): number;
  AddElement(Curve: Geom2d_Curve, Orientation: TopAbs_Orientation): number;

  RemElement(IndE: number): void;

  ClrElements(): void;

  HatchingCurve(IndH: number): Geom2dAdaptor_Curve;

  AddHatching(Curve: Geom2dAdaptor_Curve): number;

  RemHatching(IndH: number): void;

  ClrHatchings(): void;

  NbPoints(IndH: number): number;

  Point(IndH: number, IndP: number): HatchGen_PointOnHatching;

  Trim(): void;
  Trim(Curve: Geom2dAdaptor_Curve): number;
  Trim(IndH: number): void;
  Trim(): void;
  Trim(Curve: Geom2dAdaptor_Curve): number;
  Trim(IndH: number): void;
  Trim(): void;
  Trim(Curve: Geom2dAdaptor_Curve): number;
  Trim(IndH: number): void;

  ComputeDomains(): void;
  ComputeDomains(IndH: number): void;
  ComputeDomains(): void;
  ComputeDomains(IndH: number): void;

  TrimDone(IndH: number): boolean;

  TrimFailed(IndH: number): boolean;

  Status(IndH: number): HatchGen_ErrorStatus;

  NbDomains(IndH: number): number;

  Domain(IndH: number, IDom: number): HatchGen_Domain;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dHatch_Hatching: declare class Geom2dHatch_Hatching

  constructor

  Curve(): Geom2dAdaptor_Curve;

  ChangeCurve(): Geom2dAdaptor_Curve;

  TrimDone(Flag: boolean): void;
  TrimDone(): boolean;
  TrimDone(Flag: boolean): void;
  TrimDone(): boolean;

  TrimFailed(Flag: boolean): void;
  TrimFailed(): boolean;
  TrimFailed(Flag: boolean): void;
  TrimFailed(): boolean;

  IsDone(Flag: boolean): void;
  IsDone(): boolean;
  IsDone(Flag: boolean): void;
  IsDone(): boolean;

  Status(theStatus: HatchGen_ErrorStatus): void;
  Status(): HatchGen_ErrorStatus;
  Status(theStatus: HatchGen_ErrorStatus): void;
  Status(): HatchGen_ErrorStatus;

  AddPoint(Point: HatchGen_PointOnHatching, Confusion: number): void;

  NbPoints(): number;

  Point(Index: number): HatchGen_PointOnHatching;

  ChangePoint(Index: number): HatchGen_PointOnHatching;

  RemPoint(Index: number): void;

  ClrPoints(): void;

  AddDomain(Domain: HatchGen_Domain): void;

  NbDomains(): number;

  Domain(Index: number): HatchGen_Domain;

  RemDomain(Index: number): void;

  ClrDomains(): void;

  ClassificationPoint(): gp_Pnt2d;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dHatch_Intersector: declare class Geom2dHatch_Intersector extends Geom2dInt_GInter

  constructor

  ConfusionTolerance(): number;

  SetConfusionTolerance(Confusion: number): void;

  TangencyTolerance(): number;

  SetTangencyTolerance(Tangency: number): void;

  Intersect(C1: Geom2dAdaptor_Curve, C2: Geom2dAdaptor_Curve): void;

  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  LocalGeometry(E: Geom2dAdaptor_Curve, U: number, T: gp_Dir2d, N: gp_Dir2d, C?: number): { C: number };

  delete(): void;

  [Symbol.dispose](): void;
