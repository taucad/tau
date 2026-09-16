# libcascade — HatchGen

6 top-level symbols. Signatures are verbatim typescript.

HatchGen_Domain: declare class HatchGen_Domain

  constructor

  SetPoints(P1: HatchGen_PointOnHatching, P2: HatchGen_PointOnHatching): void;
  SetPoints(): void;
  SetPoints(P1: HatchGen_PointOnHatching, P2: HatchGen_PointOnHatching): void;
  SetPoints(): void;

  SetFirstPoint(P: HatchGen_PointOnHatching): void;
  SetFirstPoint(): void;
  SetFirstPoint(P: HatchGen_PointOnHatching): void;
  SetFirstPoint(): void;

  SetSecondPoint(P: HatchGen_PointOnHatching): void;
  SetSecondPoint(): void;
  SetSecondPoint(P: HatchGen_PointOnHatching): void;
  SetSecondPoint(): void;

  HasFirstPoint(): boolean;

  FirstPoint(): HatchGen_PointOnHatching;

  HasSecondPoint(): boolean;

  SecondPoint(): HatchGen_PointOnHatching;

  Dump(Index?: number): void;

  delete(): void;

  [Symbol.dispose](): void;

HatchGen_ErrorStatus: typeof HatchGen_ErrorStatus[keyof typeof HatchGen_ErrorStatus]

HatchGen_IntersectionPoint: declare class HatchGen_IntersectionPoint

  SetIndex(Index: number): void;

  Index(): number;

  SetParameter(Parameter: number): void;

  Parameter(): number;

  SetPosition(Position: TopAbs_Orientation): void;

  Position(): TopAbs_Orientation;

  SetStateBefore(State: TopAbs_State): void;

  StateBefore(): TopAbs_State;

  SetStateAfter(State: TopAbs_State): void;

  StateAfter(): TopAbs_State;

  SetSegmentBeginning(State?: boolean): void;

  SegmentBeginning(): boolean;

  SetSegmentEnd(State?: boolean): void;

  SegmentEnd(): boolean;

  Dump(Index?: number): void;

  delete(): void;

  [Symbol.dispose](): void;

HatchGen_IntersectionType: typeof HatchGen_IntersectionType[keyof typeof HatchGen_IntersectionType]

HatchGen_PointOnElement: declare class HatchGen_PointOnElement extends HatchGen_IntersectionPoint

  constructor

  SetIntersectionType(Type: HatchGen_IntersectionType): void;

  IntersectionType(): HatchGen_IntersectionType;

  IsIdentical(Point: HatchGen_PointOnElement, Confusion: number): boolean;

  IsDifferent(Point: HatchGen_PointOnElement, Confusion: number): boolean;

  Dump(Index?: number): void;

  delete(): void;

  [Symbol.dispose](): void;

HatchGen_PointOnHatching: declare class HatchGen_PointOnHatching extends HatchGen_IntersectionPoint

  constructor

  AddPoint(Point: HatchGen_PointOnElement, Confusion: number): void;

  NbPoints(): number;

  Point(Index: number): HatchGen_PointOnElement;

  RemPoint(Index: number): void;

  ClrPoints(): void;

  IsLower(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

  IsEqual(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

  IsGreater(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

  Dump(Index?: number): void;

  delete(): void;

  [Symbol.dispose](): void;
