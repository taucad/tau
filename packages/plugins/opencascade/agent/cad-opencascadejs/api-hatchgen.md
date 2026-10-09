# libcascade — HatchGen

6 top-level symbols. Signatures are verbatim typescript.

HatchGen_Domain: declare class HatchGen_Domain

  // HatchGen_Domain.constructor (constructor)
  constructor();
  constructor(P1: HatchGen_PointOnHatching, P2: HatchGen_PointOnHatching);
  constructor(P: HatchGen_PointOnHatching, First: boolean);

  // HatchGen_Domain.SetPoints (method)
  SetPoints(P1: HatchGen_PointOnHatching, P2: HatchGen_PointOnHatching): void;
  SetPoints(): void;

  // HatchGen_Domain.SetFirstPoint (method)
  SetFirstPoint(P: HatchGen_PointOnHatching): void;
  SetFirstPoint(): void;

  // HatchGen_Domain.SetSecondPoint (method)
  SetSecondPoint(P: HatchGen_PointOnHatching): void;
  SetSecondPoint(): void;

  // HatchGen_Domain.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // HatchGen_Domain.FirstPoint (method)
  FirstPoint(): HatchGen_PointOnHatching;

  // HatchGen_Domain.HasSecondPoint (method)
  HasSecondPoint(): boolean;

  // HatchGen_Domain.SecondPoint (method)
  SecondPoint(): HatchGen_PointOnHatching;

  // HatchGen_Domain.Dump (method)
  Dump(Index?: number): void;

  // HatchGen_Domain.delete (method)
  delete(): void;

  // HatchGen_Domain.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HatchGen_ErrorStatus: typeof HatchGen_ErrorStatus[keyof typeof HatchGen_ErrorStatus]

  readonly HatchGen_NoProblem: 'HatchGen_NoProblem'

  readonly HatchGen_TrimFailure: 'HatchGen_TrimFailure'

  readonly HatchGen_TransitionFailure: 'HatchGen_TransitionFailure'

  readonly HatchGen_IncoherentParity: 'HatchGen_IncoherentParity'

  readonly HatchGen_IncompatibleStates: 'HatchGen_IncompatibleStates'

HatchGen_IntersectionPoint: declare class HatchGen_IntersectionPoint

  // HatchGen_IntersectionPoint.SetIndex (method)
  SetIndex(Index: number): void;

  // HatchGen_IntersectionPoint.Index (method)
  Index(): number;

  // HatchGen_IntersectionPoint.SetParameter (method)
  SetParameter(Parameter: number): void;

  // HatchGen_IntersectionPoint.Parameter (method)
  Parameter(): number;

  // HatchGen_IntersectionPoint.SetPosition (method)
  SetPosition(Position: TopAbs_Orientation): void;

  // HatchGen_IntersectionPoint.Position (method)
  Position(): TopAbs_Orientation;

  // HatchGen_IntersectionPoint.SetStateBefore (method)
  SetStateBefore(State: TopAbs_State): void;

  // HatchGen_IntersectionPoint.StateBefore (method)
  StateBefore(): TopAbs_State;

  // HatchGen_IntersectionPoint.SetStateAfter (method)
  SetStateAfter(State: TopAbs_State): void;

  // HatchGen_IntersectionPoint.StateAfter (method)
  StateAfter(): TopAbs_State;

  // HatchGen_IntersectionPoint.SetSegmentBeginning (method)
  SetSegmentBeginning(State?: boolean): void;

  // HatchGen_IntersectionPoint.SegmentBeginning (method)
  SegmentBeginning(): boolean;

  // HatchGen_IntersectionPoint.SetSegmentEnd (method)
  SetSegmentEnd(State?: boolean): void;

  // HatchGen_IntersectionPoint.SegmentEnd (method)
  SegmentEnd(): boolean;

  // HatchGen_IntersectionPoint.Dump (method)
  Dump(Index?: number): void;

  // HatchGen_IntersectionPoint.delete (method)
  delete(): void;

  // HatchGen_IntersectionPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HatchGen_IntersectionType: typeof HatchGen_IntersectionType[keyof typeof HatchGen_IntersectionType]

  readonly HatchGen_TRUE: 'HatchGen_TRUE'

  readonly HatchGen_TOUCH: 'HatchGen_TOUCH'

  readonly HatchGen_TANGENT: 'HatchGen_TANGENT'

  readonly HatchGen_UNDETERMINED: 'HatchGen_UNDETERMINED'

HatchGen_PointOnElement: declare class HatchGen_PointOnElement extends HatchGen_IntersectionPoint

  // HatchGen_PointOnElement.constructor (constructor)
  constructor();
  constructor(Point: IntRes2d_IntersectionPoint);

  // HatchGen_PointOnElement.SetIntersectionType (method)
  SetIntersectionType(Type: HatchGen_IntersectionType): void;

  // HatchGen_PointOnElement.IntersectionType (method)
  IntersectionType(): HatchGen_IntersectionType;

  // HatchGen_PointOnElement.IsIdentical (method)
  IsIdentical(Point: HatchGen_PointOnElement, Confusion: number): boolean;

  // HatchGen_PointOnElement.IsDifferent (method)
  IsDifferent(Point: HatchGen_PointOnElement, Confusion: number): boolean;

  // HatchGen_PointOnElement.Dump (method)
  Dump(Index?: number): void;

  // HatchGen_PointOnElement.delete (method)
  delete(): void;

  // HatchGen_PointOnElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HatchGen_PointOnHatching: declare class HatchGen_PointOnHatching extends HatchGen_IntersectionPoint

  // HatchGen_PointOnHatching.constructor (constructor)
  constructor();
  constructor(Point: IntRes2d_IntersectionPoint);

  // HatchGen_PointOnHatching.AddPoint (method)
  AddPoint(Point: HatchGen_PointOnElement, Confusion: number): void;

  // HatchGen_PointOnHatching.NbPoints (method)
  NbPoints(): number;

  // HatchGen_PointOnHatching.Point (method)
  Point(Index: number): HatchGen_PointOnElement;

  // HatchGen_PointOnHatching.RemPoint (method)
  RemPoint(Index: number): void;

  // HatchGen_PointOnHatching.ClrPoints (method)
  ClrPoints(): void;

  // HatchGen_PointOnHatching.IsLower (method)
  IsLower(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

  // HatchGen_PointOnHatching.IsEqual (method)
  IsEqual(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

  // HatchGen_PointOnHatching.IsGreater (method)
  IsGreater(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

  // HatchGen_PointOnHatching.Dump (method)
  Dump(Index?: number): void;

  // HatchGen_PointOnHatching.delete (method)
  delete(): void;

  // HatchGen_PointOnHatching.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
