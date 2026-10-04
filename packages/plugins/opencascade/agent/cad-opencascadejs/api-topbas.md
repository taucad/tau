# libcascade — TopBas

1 top-level symbols. Signatures are verbatim typescript.

TopBas_TestInterference: declare class TopBas_TestInterference

  // TopBas_TestInterference.constructor (constructor)
  constructor();
  constructor(Inters: number, Bound: number, Orient: TopAbs_Orientation, Trans: TopAbs_Orientation, BTrans: TopAbs_Orientation);

  // TopBas_TestInterference.Intersection (method)
  Intersection(I: number): void;
  Intersection(): number;

  // TopBas_TestInterference.Boundary (method)
  Boundary(B: number): void;
  Boundary(): number;

  // TopBas_TestInterference.Orientation (method)
  Orientation(O: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  // TopBas_TestInterference.Transition (method)
  Transition(Tr: TopAbs_Orientation): void;
  Transition(): TopAbs_Orientation;

  // TopBas_TestInterference.BoundaryTransition (method)
  BoundaryTransition(BTr: TopAbs_Orientation): void;
  BoundaryTransition(): TopAbs_Orientation;

  // TopBas_TestInterference.ChangeIntersection (method)
  ChangeIntersection(): number;

  // TopBas_TestInterference.ChangeBoundary (method)
  ChangeBoundary(): number;

  // TopBas_TestInterference.delete (method)
  delete(): void;

  // TopBas_TestInterference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
