# libcascade — Geom2dHatch

6 top-level symbols. Signatures are verbatim typescript.

Geom2dHatch_Classifier: declare class Geom2dHatch_Classifier

  // Geom2dHatch_Classifier.constructor (constructor)
  constructor();

  // Geom2dHatch_Classifier.State (method)
  State(): TopAbs_State;

  // Geom2dHatch_Classifier.Rejected (method)
  Rejected(): boolean;

  // Geom2dHatch_Classifier.NoWires (method)
  NoWires(): boolean;

  // Geom2dHatch_Classifier.Edge (method)
  Edge(): Geom2dAdaptor_Curve;

  // Geom2dHatch_Classifier.EdgeParameter (method)
  EdgeParameter(): number;

  // Geom2dHatch_Classifier.Position (method)
  Position(): IntRes2d_Position;

  // Geom2dHatch_Classifier.delete (method)
  delete(): void;

  // Geom2dHatch_Classifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dHatch_Element: declare class Geom2dHatch_Element

  // Geom2dHatch_Element.constructor (constructor)
  constructor();
  constructor(Curve: Geom2dAdaptor_Curve, Orientation?: TopAbs_Orientation);

  // Geom2dHatch_Element.Curve (method)
  Curve(): Geom2dAdaptor_Curve;

  // Geom2dHatch_Element.ChangeCurve (method)
  ChangeCurve(): Geom2dAdaptor_Curve;

  // Geom2dHatch_Element.Orientation (method)
  Orientation(Orientation: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  // Geom2dHatch_Element.delete (method)
  delete(): void;

  // Geom2dHatch_Element.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dHatch_FClass2dOfClassifier: declare class Geom2dHatch_FClass2dOfClassifier

  // Geom2dHatch_FClass2dOfClassifier.constructor (constructor)
  constructor();

  // Geom2dHatch_FClass2dOfClassifier.Reset (method)
  Reset(L: gp_Lin2d, P: number, Tol: number): void;

  // Geom2dHatch_FClass2dOfClassifier.Compare (method)
  Compare(E: Geom2dAdaptor_Curve, Or: TopAbs_Orientation): void;

  // Geom2dHatch_FClass2dOfClassifier.Parameter (method)
  Parameter(): number;

  // Geom2dHatch_FClass2dOfClassifier.Intersector (method)
  Intersector(): Geom2dHatch_Intersector;

  // Geom2dHatch_FClass2dOfClassifier.ClosestIntersection (method)
  ClosestIntersection(): number;

  // Geom2dHatch_FClass2dOfClassifier.State (method)
  State(): TopAbs_State;

  // Geom2dHatch_FClass2dOfClassifier.IsHeadOrEnd (method)
  IsHeadOrEnd(): boolean;

  // Geom2dHatch_FClass2dOfClassifier.delete (method)
  delete(): void;

  // Geom2dHatch_FClass2dOfClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dHatch_Hatcher: declare class Geom2dHatch_Hatcher

  // Geom2dHatch_Hatcher.constructor (constructor)
  constructor(Intersector: Geom2dHatch_Intersector, Confusion2d: number, Confusion3d: number, KeepPnt?: boolean, KeepSeg?: boolean);

  // Geom2dHatch_Hatcher.Intersector (method)
  Intersector(Intersector: Geom2dHatch_Intersector): void;
  Intersector(): Geom2dHatch_Intersector;

  // Geom2dHatch_Hatcher.ChangeIntersector (method)
  ChangeIntersector(): Geom2dHatch_Intersector;

  // Geom2dHatch_Hatcher.Confusion2d (method)
  Confusion2d(Confusion: number): void;
  Confusion2d(): number;

  // Geom2dHatch_Hatcher.Confusion3d (method)
  Confusion3d(Confusion: number): void;
  Confusion3d(): number;

  // Geom2dHatch_Hatcher.KeepPoints (method)
  KeepPoints(Keep: boolean): void;
  KeepPoints(): boolean;

  // Geom2dHatch_Hatcher.KeepSegments (method)
  KeepSegments(Keep: boolean): void;
  KeepSegments(): boolean;

  // Geom2dHatch_Hatcher.Clear (method)
  Clear(): void;

  // Geom2dHatch_Hatcher.ElementCurve (method)
  ElementCurve(IndE: number): Geom2dAdaptor_Curve;

  // Geom2dHatch_Hatcher.AddElement (method)
  AddElement(Curve: Geom2dAdaptor_Curve, Orientation: TopAbs_Orientation): number;
  AddElement(Curve: Geom2d_Curve, Orientation: TopAbs_Orientation): number;

  // Geom2dHatch_Hatcher.RemElement (method)
  RemElement(IndE: number): void;

  // Geom2dHatch_Hatcher.ClrElements (method)
  ClrElements(): void;

  // Geom2dHatch_Hatcher.HatchingCurve (method)
  HatchingCurve(IndH: number): Geom2dAdaptor_Curve;

  // Geom2dHatch_Hatcher.AddHatching (method)
  AddHatching(Curve: Geom2dAdaptor_Curve): number;

  // Geom2dHatch_Hatcher.RemHatching (method)
  RemHatching(IndH: number): void;

  // Geom2dHatch_Hatcher.ClrHatchings (method)
  ClrHatchings(): void;

  // Geom2dHatch_Hatcher.NbPoints (method)
  NbPoints(IndH: number): number;

  // Geom2dHatch_Hatcher.Point (method)
  Point(IndH: number, IndP: number): HatchGen_PointOnHatching;

  // Geom2dHatch_Hatcher.Trim (method)
  Trim(): void;
  Trim(Curve: Geom2dAdaptor_Curve): number;
  Trim(IndH: number): void;

  // Geom2dHatch_Hatcher.ComputeDomains (method)
  ComputeDomains(): void;
  ComputeDomains(IndH: number): void;

  // Geom2dHatch_Hatcher.TrimDone (method)
  TrimDone(IndH: number): boolean;

  // Geom2dHatch_Hatcher.TrimFailed (method)
  TrimFailed(IndH: number): boolean;

  // Geom2dHatch_Hatcher.Status (method)
  Status(IndH: number): HatchGen_ErrorStatus;

  // Geom2dHatch_Hatcher.NbDomains (method)
  NbDomains(IndH: number): number;

  // Geom2dHatch_Hatcher.Domain (method)
  Domain(IndH: number, IDom: number): HatchGen_Domain;

  // Geom2dHatch_Hatcher.Dump (method)
  Dump(): void;

  // Geom2dHatch_Hatcher.delete (method)
  delete(): void;

  // Geom2dHatch_Hatcher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dHatch_Hatching: declare class Geom2dHatch_Hatching

  // Geom2dHatch_Hatching.constructor (constructor)
  constructor();
  constructor(Curve: Geom2dAdaptor_Curve);

  // Geom2dHatch_Hatching.Curve (method)
  Curve(): Geom2dAdaptor_Curve;

  // Geom2dHatch_Hatching.ChangeCurve (method)
  ChangeCurve(): Geom2dAdaptor_Curve;

  // Geom2dHatch_Hatching.TrimDone (method)
  TrimDone(Flag: boolean): void;
  TrimDone(): boolean;

  // Geom2dHatch_Hatching.TrimFailed (method)
  TrimFailed(Flag: boolean): void;
  TrimFailed(): boolean;

  // Geom2dHatch_Hatching.IsDone (method)
  IsDone(Flag: boolean): void;
  IsDone(): boolean;

  // Geom2dHatch_Hatching.Status (method)
  Status(theStatus: HatchGen_ErrorStatus): void;
  Status(): HatchGen_ErrorStatus;

  // Geom2dHatch_Hatching.AddPoint (method)
  AddPoint(Point: HatchGen_PointOnHatching, Confusion: number): void;

  // Geom2dHatch_Hatching.NbPoints (method)
  NbPoints(): number;

  // Geom2dHatch_Hatching.Point (method)
  Point(Index: number): HatchGen_PointOnHatching;

  // Geom2dHatch_Hatching.ChangePoint (method)
  ChangePoint(Index: number): HatchGen_PointOnHatching;

  // Geom2dHatch_Hatching.RemPoint (method)
  RemPoint(Index: number): void;

  // Geom2dHatch_Hatching.ClrPoints (method)
  ClrPoints(): void;

  // Geom2dHatch_Hatching.AddDomain (method)
  AddDomain(Domain: HatchGen_Domain): void;

  // Geom2dHatch_Hatching.NbDomains (method)
  NbDomains(): number;

  // Geom2dHatch_Hatching.Domain (method)
  Domain(Index: number): HatchGen_Domain;

  // Geom2dHatch_Hatching.RemDomain (method)
  RemDomain(Index: number): void;

  // Geom2dHatch_Hatching.ClrDomains (method)
  ClrDomains(): void;

  // Geom2dHatch_Hatching.ClassificationPoint (method)
  ClassificationPoint(): gp_Pnt2d;

  // Geom2dHatch_Hatching.delete (method)
  delete(): void;

  // Geom2dHatch_Hatching.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dHatch_Intersector: declare class Geom2dHatch_Intersector extends Geom2dInt_GInter

  // Geom2dHatch_Intersector.constructor (constructor)
  constructor();
  constructor(Confusion: number, Tangency: number);

  // Geom2dHatch_Intersector.ConfusionTolerance (method)
  ConfusionTolerance(): number;

  // Geom2dHatch_Intersector.SetConfusionTolerance (method)
  SetConfusionTolerance(Confusion: number): void;

  // Geom2dHatch_Intersector.TangencyTolerance (method)
  TangencyTolerance(): number;

  // Geom2dHatch_Intersector.SetTangencyTolerance (method)
  SetTangencyTolerance(Tangency: number): void;

  // Geom2dHatch_Intersector.Intersect (method)
  Intersect(C1: Geom2dAdaptor_Curve, C2: Geom2dAdaptor_Curve): void;

  // Geom2dHatch_Intersector.Perform (method)
  Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
  Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

  // Geom2dHatch_Intersector.LocalGeometry (method)
  LocalGeometry(E: Geom2dAdaptor_Curve, U: number, T: gp_Dir2d, N: gp_Dir2d, C?: number): { C: number };

  // Geom2dHatch_Intersector.delete (method)
  delete(): void;

  // Geom2dHatch_Intersector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
