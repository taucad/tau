# libcascade — IntRes2d

9 top-level symbols. Signatures are verbatim typescript.

IntRes2d_Domain: declare class IntRes2d_Domain

  // IntRes2d_Domain.constructor (constructor)
  constructor();
  constructor(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean);
  constructor(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number);

  // IntRes2d_Domain.SetValues (method)
  SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
  SetValues(): void;
  SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;

  // IntRes2d_Domain.SetEquivalentParameters (method)
  SetEquivalentParameters(zero: number, period: number): void;

  // IntRes2d_Domain.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntRes2d_Domain.FirstParameter (method)
  FirstParameter(): number;

  // IntRes2d_Domain.FirstPoint (method)
  FirstPoint(): gp_Pnt2d;

  // IntRes2d_Domain.FirstTolerance (method)
  FirstTolerance(): number;

  // IntRes2d_Domain.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntRes2d_Domain.LastParameter (method)
  LastParameter(): number;

  // IntRes2d_Domain.LastPoint (method)
  LastPoint(): gp_Pnt2d;

  // IntRes2d_Domain.LastTolerance (method)
  LastTolerance(): number;

  // IntRes2d_Domain.IsClosed (method)
  IsClosed(): boolean;

  // IntRes2d_Domain.EquivalentParameters (method)
  EquivalentParameters(zero?: number, zeroplusperiod?: number): { zero: number; zeroplusperiod: number };

  // IntRes2d_Domain.delete (method)
  delete(): void;

  // IntRes2d_Domain.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntRes2d_Intersection: declare class IntRes2d_Intersection

  // IntRes2d_Intersection.IsDone (method)
  IsDone(): boolean;

  // IntRes2d_Intersection.IsEmpty (method)
  IsEmpty(): boolean;

  // IntRes2d_Intersection.NbPoints (method)
  NbPoints(): number;

  // IntRes2d_Intersection.Point (method)
  Point(N: number): IntRes2d_IntersectionPoint;

  // IntRes2d_Intersection.NbSegments (method)
  NbSegments(): number;

  // IntRes2d_Intersection.Segment (method)
  Segment(N: number): IntRes2d_IntersectionSegment;

  // IntRes2d_Intersection.SetReversedParameters (method)
  SetReversedParameters(Reverseflag: boolean): void;

  // IntRes2d_Intersection.delete (method)
  delete(): void;

  // IntRes2d_Intersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntRes2d_IntersectionPoint: declare class IntRes2d_IntersectionPoint

  // IntRes2d_IntersectionPoint.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt2d, Uc1: number, Uc2: number, Trans1: IntRes2d_Transition, Trans2: IntRes2d_Transition, ReversedFlag: boolean);

  // IntRes2d_IntersectionPoint.SetValues (method)
  SetValues(P: gp_Pnt2d, Uc1: number, Uc2: number, Trans1: IntRes2d_Transition, Trans2: IntRes2d_Transition, ReversedFlag: boolean): void;

  // IntRes2d_IntersectionPoint.Value (method)
  Value(): gp_Pnt2d;

  // IntRes2d_IntersectionPoint.ParamOnFirst (method)
  ParamOnFirst(): number;

  // IntRes2d_IntersectionPoint.ParamOnSecond (method)
  ParamOnSecond(): number;

  // IntRes2d_IntersectionPoint.TransitionOfFirst (method)
  TransitionOfFirst(): IntRes2d_Transition;

  // IntRes2d_IntersectionPoint.TransitionOfSecond (method)
  TransitionOfSecond(): IntRes2d_Transition;

  // IntRes2d_IntersectionPoint.delete (method)
  delete(): void;

  // IntRes2d_IntersectionPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntRes2d_IntersectionSegment: declare class IntRes2d_IntersectionSegment

  // IntRes2d_IntersectionSegment.constructor (constructor)
  constructor();
  constructor(Oppos: boolean);
  constructor(P1: IntRes2d_IntersectionPoint, P2: IntRes2d_IntersectionPoint, Oppos: boolean, ReverseFlag: boolean);
  constructor(P: IntRes2d_IntersectionPoint, First: boolean, Oppos: boolean, ReverseFlag: boolean);

  // IntRes2d_IntersectionSegment.IsOpposite (method)
  IsOpposite(): boolean;

  // IntRes2d_IntersectionSegment.HasFirstPoint (method)
  HasFirstPoint(): boolean;

  // IntRes2d_IntersectionSegment.FirstPoint (method)
  FirstPoint(): IntRes2d_IntersectionPoint;

  // IntRes2d_IntersectionSegment.HasLastPoint (method)
  HasLastPoint(): boolean;

  // IntRes2d_IntersectionSegment.LastPoint (method)
  LastPoint(): IntRes2d_IntersectionPoint;

  // IntRes2d_IntersectionSegment.delete (method)
  delete(): void;

  // IntRes2d_IntersectionSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntRes2d_Position: typeof IntRes2d_Position[keyof typeof IntRes2d_Position]

  readonly IntRes2d_Head: 'IntRes2d_Head'

  readonly IntRes2d_Middle: 'IntRes2d_Middle'

  readonly IntRes2d_End: 'IntRes2d_End'

IntRes2d_Situation: typeof IntRes2d_Situation[keyof typeof IntRes2d_Situation]

  readonly IntRes2d_Inside: 'IntRes2d_Inside'

  readonly IntRes2d_Outside: 'IntRes2d_Outside'

  readonly IntRes2d_Unknown: 'IntRes2d_Unknown'

IntRes2d_Transition: declare class IntRes2d_Transition

  // IntRes2d_Transition.constructor (constructor)
  constructor();
  constructor(Pos: IntRes2d_Position);
  constructor(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans);
  constructor(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean);

  // IntRes2d_Transition.SetValue (method)
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
  SetValue(Pos: IntRes2d_Position): void;

  // IntRes2d_Transition.SetPosition (method)
  SetPosition(Pos: IntRes2d_Position): void;

  // IntRes2d_Transition.PositionOnCurve (method)
  PositionOnCurve(): IntRes2d_Position;

  // IntRes2d_Transition.TransitionType (method)
  TransitionType(): IntRes2d_TypeTrans;

  // IntRes2d_Transition.IsTangent (method)
  IsTangent(): boolean;

  // IntRes2d_Transition.Situation (method)
  Situation(): IntRes2d_Situation;

  // IntRes2d_Transition.IsOpposite (method)
  IsOpposite(): boolean;

  // IntRes2d_Transition.delete (method)
  delete(): void;

  // IntRes2d_Transition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntRes2d_TypeTrans: typeof IntRes2d_TypeTrans[keyof typeof IntRes2d_TypeTrans]

  readonly IntRes2d_In: 'IntRes2d_In'

  readonly IntRes2d_Out: 'IntRes2d_Out'

  readonly IntRes2d_Touch: 'IntRes2d_Touch'

  readonly IntRes2d_Undecided: 'IntRes2d_Undecided'

IntRes2d_SequenceOfIntersectionPoint: NCollection_Sequence_IntRes2d_IntersectionPoint
