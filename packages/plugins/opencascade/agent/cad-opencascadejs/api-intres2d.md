# libcascade — IntRes2d

9 top-level symbols. Signatures are verbatim typescript.

IntRes2d_Domain: declare class IntRes2d_Domain

  constructor

  SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
  SetValues(): void;
  SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;
  SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
  SetValues(): void;
  SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;
  SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
  SetValues(): void;
  SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;

  SetEquivalentParameters(zero: number, period: number): void;

  HasFirstPoint(): boolean;

  FirstParameter(): number;

  FirstPoint(): gp_Pnt2d;

  FirstTolerance(): number;

  HasLastPoint(): boolean;

  LastParameter(): number;

  LastPoint(): gp_Pnt2d;

  LastTolerance(): number;

  IsClosed(): boolean;

  EquivalentParameters(zero?: number, zeroplusperiod?: number): { zero: number; zeroplusperiod: number };

  delete(): void;

  [Symbol.dispose](): void;

IntRes2d_Intersection: declare class IntRes2d_Intersection

  IsDone(): boolean;

  IsEmpty(): boolean;

  NbPoints(): number;

  Point(N: number): IntRes2d_IntersectionPoint;

  NbSegments(): number;

  Segment(N: number): IntRes2d_IntersectionSegment;

  SetReversedParameters(Reverseflag: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

IntRes2d_IntersectionPoint: declare class IntRes2d_IntersectionPoint

  constructor

  SetValues(P: gp_Pnt2d, Uc1: number, Uc2: number, Trans1: IntRes2d_Transition, Trans2: IntRes2d_Transition, ReversedFlag: boolean): void;

  Value(): gp_Pnt2d;

  ParamOnFirst(): number;

  ParamOnSecond(): number;

  TransitionOfFirst(): IntRes2d_Transition;

  TransitionOfSecond(): IntRes2d_Transition;

  delete(): void;

  [Symbol.dispose](): void;

IntRes2d_IntersectionSegment: declare class IntRes2d_IntersectionSegment

  constructor

  IsOpposite(): boolean;

  HasFirstPoint(): boolean;

  FirstPoint(): IntRes2d_IntersectionPoint;

  HasLastPoint(): boolean;

  LastPoint(): IntRes2d_IntersectionPoint;

  delete(): void;

  [Symbol.dispose](): void;

IntRes2d_Position: typeof IntRes2d_Position[keyof typeof IntRes2d_Position]

IntRes2d_Situation: typeof IntRes2d_Situation[keyof typeof IntRes2d_Situation]

IntRes2d_Transition: declare class IntRes2d_Transition

  constructor

  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
  SetValue(Pos: IntRes2d_Position): void;
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
  SetValue(Pos: IntRes2d_Position): void;
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
  SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
  SetValue(Pos: IntRes2d_Position): void;

  SetPosition(Pos: IntRes2d_Position): void;

  PositionOnCurve(): IntRes2d_Position;

  TransitionType(): IntRes2d_TypeTrans;

  IsTangent(): boolean;

  Situation(): IntRes2d_Situation;

  IsOpposite(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

IntRes2d_TypeTrans: typeof IntRes2d_TypeTrans[keyof typeof IntRes2d_TypeTrans]

IntRes2d_SequenceOfIntersectionPoint: NCollection_Sequence_IntRes2d_IntersectionPoint
