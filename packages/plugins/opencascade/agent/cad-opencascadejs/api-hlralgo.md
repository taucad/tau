# libcascade — HLRAlgo

34 top-level symbols. Signatures are verbatim typescript.

HLRAlgo: declare class HLRAlgo

  // HLRAlgo.constructor (constructor)
  constructor();

  // HLRAlgo.UpdateMinMax (method)
  static UpdateMinMax(x: number, y: number, z: number, Min: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], Max: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): void;

  // HLRAlgo.EnlargeMinMax (method)
  static EnlargeMinMax(tol: number, Min: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], Max: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): void;

  // HLRAlgo.InitMinMax (method)
  static InitMinMax(Big: number, Min: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], Max: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): void;

  // HLRAlgo.EncodeMinMax (method)
  static EncodeMinMax(Min: HLRAlgo_EdgesBlock_MinMaxIndices, Max: HLRAlgo_EdgesBlock_MinMaxIndices, MinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRAlgo.SizeBox (method)
  static SizeBox(Min: HLRAlgo_EdgesBlock_MinMaxIndices, Max: HLRAlgo_EdgesBlock_MinMaxIndices): number;

  // HLRAlgo.DecodeMinMax (method)
  static DecodeMinMax(MinMax: HLRAlgo_EdgesBlock_MinMaxIndices, Min: HLRAlgo_EdgesBlock_MinMaxIndices, Max: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRAlgo.CopyMinMax (method)
  static CopyMinMax(IMin: HLRAlgo_EdgesBlock_MinMaxIndices, IMax: HLRAlgo_EdgesBlock_MinMaxIndices, OMin: HLRAlgo_EdgesBlock_MinMaxIndices, OMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRAlgo.AddMinMax (method)
  static AddMinMax(IMin: HLRAlgo_EdgesBlock_MinMaxIndices, IMax: HLRAlgo_EdgesBlock_MinMaxIndices, OMin: HLRAlgo_EdgesBlock_MinMaxIndices, OMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRAlgo.delete (method)
  delete(): void;

  // HLRAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_BiPoint: declare class HLRAlgo_BiPoint

  // HLRAlgo_BiPoint.constructor (constructor)
  constructor();
  constructor(X1: number, Y1: number, Z1: number, X2: number, Y2: number, Z2: number, XT1: number, YT1: number, ZT1: number, XT2: number, YT2: number, ZT2: number, Index: number, flag: number);
  constructor(X1: number, Y1: number, Z1: number, X2: number, Y2: number, Z2: number, XT1: number, YT1: number, ZT1: number, XT2: number, YT2: number, ZT2: number, Index: number, reg1: boolean, regn: boolean, outl: boolean, intl: boolean);
  constructor(X1: number, Y1: number, Z1: number, X2: number, Y2: number, Z2: number, XT1: number, YT1: number, ZT1: number, XT2: number, YT2: number, ZT2: number, Index: number, i1: number, i1p1: number, i1p2: number, flag: number);
  constructor(X1: number, Y1: number, Z1: number, X2: number, Y2: number, Z2: number, XT1: number, YT1: number, ZT1: number, XT2: number, YT2: number, ZT2: number, Index: number, i1: number, i1p1: number, i1p2: number, reg1: boolean, regn: boolean, outl: boolean, intl: boolean);
  constructor(X1: number, Y1: number, Z1: number, X2: number, Y2: number, Z2: number, XT1: number, YT1: number, ZT1: number, XT2: number, YT2: number, ZT2: number, Index: number, i1: number, i1p1: number, i1p2: number, i2: number, i2p1: number, i2p2: number, flag: number);
  constructor(X1: number, Y1: number, Z1: number, X2: number, Y2: number, Z2: number, XT1: number, YT1: number, ZT1: number, XT2: number, YT2: number, ZT2: number, Index: number, i1: number, i1p1: number, i1p2: number, i2: number, i2p1: number, i2p2: number, reg1: boolean, regn: boolean, outl: boolean, intl: boolean);

  // HLRAlgo_BiPoint.Rg1Line (method)
  Rg1Line(): boolean;
  Rg1Line(B: boolean): void;

  // HLRAlgo_BiPoint.RgNLine (method)
  RgNLine(): boolean;
  RgNLine(B: boolean): void;

  // HLRAlgo_BiPoint.OutLine (method)
  OutLine(): boolean;
  OutLine(B: boolean): void;

  // HLRAlgo_BiPoint.IntLine (method)
  IntLine(): boolean;
  IntLine(B: boolean): void;

  // HLRAlgo_BiPoint.Hidden (method)
  Hidden(): boolean;
  Hidden(B: boolean): void;

  // HLRAlgo_BiPoint.Indices (method)
  Indices(): HLRAlgo_BiPoint_IndicesT;

  // HLRAlgo_BiPoint.Points (method)
  Points(): HLRAlgo_BiPoint_PointsT;

  // HLRAlgo_BiPoint.delete (method)
  delete(): void;

  // HLRAlgo_BiPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_BiPoint_PointsT: declare class HLRAlgo_BiPoint_PointsT

  // HLRAlgo_BiPoint_PointsT.constructor (constructor)
  constructor();

  Pnt1: gp_XYZ

  Pnt2: gp_XYZ

  PntP1: gp_XYZ

  PntP2: gp_XYZ

  // HLRAlgo_BiPoint_PointsT.PntP12D (method)
  PntP12D(): gp_XY;

  // HLRAlgo_BiPoint_PointsT.PntP22D (method)
  PntP22D(): gp_XY;

  // HLRAlgo_BiPoint_PointsT.delete (method)
  delete(): void;

  // HLRAlgo_BiPoint_PointsT.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_EdgeIterator: declare class HLRAlgo_EdgeIterator

  // HLRAlgo_EdgeIterator.constructor (constructor)
  constructor();

  // HLRAlgo_EdgeIterator.InitHidden (method)
  InitHidden(status: HLRAlgo_EdgeStatus): void;

  // HLRAlgo_EdgeIterator.MoreHidden (method)
  MoreHidden(): boolean;

  // HLRAlgo_EdgeIterator.NextHidden (method)
  NextHidden(): void;

  // HLRAlgo_EdgeIterator.Hidden (method)
  Hidden(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

  // HLRAlgo_EdgeIterator.InitVisible (method)
  InitVisible(status: HLRAlgo_EdgeStatus): void;

  // HLRAlgo_EdgeIterator.MoreVisible (method)
  MoreVisible(): boolean;

  // HLRAlgo_EdgeIterator.NextVisible (method)
  NextVisible(): void;

  // HLRAlgo_EdgeIterator.Visible (method)
  Visible(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

  // HLRAlgo_EdgeIterator.delete (method)
  delete(): void;

  // HLRAlgo_EdgeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_EdgeStatus: declare class HLRAlgo_EdgeStatus

  // HLRAlgo_EdgeStatus.constructor (constructor)
  constructor();
  constructor(Start: number, TolStart: number, End: number, TolEnd: number);

  // HLRAlgo_EdgeStatus.Initialize (method)
  Initialize(Start: number, TolStart: number, End: number, TolEnd: number): void;

  // HLRAlgo_EdgeStatus.Bounds (method)
  Bounds(theStart?: number, theTolStart?: number, theEnd?: number, theTolEnd?: number): { theStart: number; theTolStart: number; theEnd: number; theTolEnd: number };

  // HLRAlgo_EdgeStatus.NbVisiblePart (method)
  NbVisiblePart(): number;

  // HLRAlgo_EdgeStatus.VisiblePart (method)
  VisiblePart(Index: number, Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

  // HLRAlgo_EdgeStatus.Hide (method)
  Hide(Start: number, TolStart: number, End: number, TolEnd: number, OnFace: boolean, OnBoundary: boolean): void;

  // HLRAlgo_EdgeStatus.HideAll (method)
  HideAll(): void;

  // HLRAlgo_EdgeStatus.ShowAll (method)
  ShowAll(): void;

  // HLRAlgo_EdgeStatus.AllHidden (method)
  AllHidden(): boolean;
  AllHidden(B: boolean): void;

  // HLRAlgo_EdgeStatus.AllVisible (method)
  AllVisible(): boolean;
  AllVisible(B: boolean): void;

  // HLRAlgo_EdgeStatus.delete (method)
  delete(): void;

  // HLRAlgo_EdgeStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_EdgesBlock: declare class HLRAlgo_EdgesBlock extends Standard_Transient

  // HLRAlgo_EdgesBlock.constructor (constructor)
  constructor(NbEdges: number);

  // HLRAlgo_EdgesBlock.NbEdges (method)
  NbEdges(): number;

  // HLRAlgo_EdgesBlock.Edge (method)
  Edge(I: number, EI: number): void;
  Edge(I: number): number;

  // HLRAlgo_EdgesBlock.Orientation (method)
  Orientation(I: number, Or: TopAbs_Orientation): void;
  Orientation(I: number): TopAbs_Orientation;

  // HLRAlgo_EdgesBlock.OutLine (method)
  OutLine(I: number): boolean;
  OutLine(I: number, B: boolean): void;

  // HLRAlgo_EdgesBlock.Internal (method)
  Internal(I: number): boolean;
  Internal(I: number, B: boolean): void;

  // HLRAlgo_EdgesBlock.Double (method)
  Double(I: number): boolean;
  Double(I: number, B: boolean): void;

  // HLRAlgo_EdgesBlock.IsoLine (method)
  IsoLine(I: number): boolean;
  IsoLine(I: number, B: boolean): void;

  // HLRAlgo_EdgesBlock.UpdateMinMax (method)
  UpdateMinMax(TotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRAlgo_EdgesBlock.MinMax (method)
  MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

  // HLRAlgo_EdgesBlock.get_type_name (method)
  static get_type_name(): string;

  // HLRAlgo_EdgesBlock.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRAlgo_EdgesBlock.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRAlgo_EdgesBlock.delete (method)
  delete(): void;

  // HLRAlgo_EdgesBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_EdgesBlock_MinMaxIndices: declare class HLRAlgo_EdgesBlock_MinMaxIndices

  // HLRAlgo_EdgesBlock_MinMaxIndices.constructor (constructor)
  constructor();

  // HLRAlgo_EdgesBlock_MinMaxIndices.Minimize (method)
  Minimize(theMinMaxIndices: HLRAlgo_EdgesBlock_MinMaxIndices): HLRAlgo_EdgesBlock_MinMaxIndices;

  // HLRAlgo_EdgesBlock_MinMaxIndices.Maximize (method)
  Maximize(theMinMaxIndices: HLRAlgo_EdgesBlock_MinMaxIndices): HLRAlgo_EdgesBlock_MinMaxIndices;

  // HLRAlgo_EdgesBlock_MinMaxIndices.delete (method)
  delete(): void;

  // HLRAlgo_EdgesBlock_MinMaxIndices.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_Interference: declare class HLRAlgo_Interference

  // HLRAlgo_Interference.constructor (constructor)
  constructor();

  // HLRAlgo_Interference.Intersection (method)
  Intersection(I: HLRAlgo_Intersection): void;
  Intersection(): HLRAlgo_Intersection;

  // HLRAlgo_Interference.Orientation (method)
  Orientation(O: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  // HLRAlgo_Interference.Transition (method)
  Transition(Tr: TopAbs_Orientation): void;
  Transition(): TopAbs_Orientation;

  // HLRAlgo_Interference.BoundaryTransition (method)
  BoundaryTransition(BTr: TopAbs_Orientation): void;
  BoundaryTransition(): TopAbs_Orientation;

  // HLRAlgo_Interference.ChangeIntersection (method)
  ChangeIntersection(): HLRAlgo_Intersection;

  // HLRAlgo_Interference.delete (method)
  delete(): void;

  // HLRAlgo_Interference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_Intersection: declare class HLRAlgo_Intersection

  // HLRAlgo_Intersection.constructor (constructor)
  constructor();
  constructor(Ori: TopAbs_Orientation, Lev: number, SegInd: number, Ind: number, P: number, Tol: number, S: TopAbs_State);

  // HLRAlgo_Intersection.Orientation (method)
  Orientation(Ori: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  // HLRAlgo_Intersection.Level (method)
  Level(Lev: number): void;
  Level(): number;

  // HLRAlgo_Intersection.SegIndex (method)
  SegIndex(SegInd: number): void;
  SegIndex(): number;

  // HLRAlgo_Intersection.Index (method)
  Index(Ind: number): void;
  Index(): number;

  // HLRAlgo_Intersection.Parameter (method)
  Parameter(P: number): void;
  Parameter(): number;

  // HLRAlgo_Intersection.Tolerance (method)
  Tolerance(T: number): void;
  Tolerance(): number;

  // HLRAlgo_Intersection.State (method)
  State(S: TopAbs_State): void;
  State(): TopAbs_State;

  // HLRAlgo_Intersection.delete (method)
  delete(): void;

  // HLRAlgo_Intersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_PolyAlgo: declare class HLRAlgo_PolyAlgo extends Standard_Transient

  // HLRAlgo_PolyAlgo.constructor (constructor)
  constructor();

  // HLRAlgo_PolyAlgo.Init (method)
  Init(theNbShells: number): void;

  // HLRAlgo_PolyAlgo.PolyShell (method)
  PolyShell(): NCollection_Array1_handle_HLRAlgo_PolyShellData;

  // HLRAlgo_PolyAlgo.ChangePolyShell (method)
  ChangePolyShell(): NCollection_Array1_handle_HLRAlgo_PolyShellData;

  // HLRAlgo_PolyAlgo.Clear (method)
  Clear(): void;

  // HLRAlgo_PolyAlgo.Update (method)
  Update(): void;

  // HLRAlgo_PolyAlgo.InitHide (method)
  InitHide(): void;

  // HLRAlgo_PolyAlgo.MoreHide (method)
  MoreHide(): boolean;

  // HLRAlgo_PolyAlgo.NextHide (method)
  NextHide(): void;

  // HLRAlgo_PolyAlgo.Hide (method)
  Hide(status: HLRAlgo_EdgeStatus, Index?: number, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; Index: number; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

  // HLRAlgo_PolyAlgo.InitShow (method)
  InitShow(): void;

  // HLRAlgo_PolyAlgo.MoreShow (method)
  MoreShow(): boolean;

  // HLRAlgo_PolyAlgo.NextShow (method)
  NextShow(): void;

  // HLRAlgo_PolyAlgo.Show (method)
  Show(Index?: number, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; Index: number; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

  // HLRAlgo_PolyAlgo.get_type_name (method)
  static get_type_name(): string;

  // HLRAlgo_PolyAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRAlgo_PolyAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRAlgo_PolyAlgo.delete (method)
  delete(): void;

  // HLRAlgo_PolyAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_PolyData: declare class HLRAlgo_PolyData extends Standard_Transient

  // HLRAlgo_PolyData.constructor (constructor)
  constructor();

  // HLRAlgo_PolyData.HNodes (method)
  HNodes(HNodes: NCollection_HArray1_gp_XYZ): void;

  // HLRAlgo_PolyData.HTData (method)
  HTData(HTData: NCollection_HArray1_HLRAlgo_TriangleData): void;

  // HLRAlgo_PolyData.HPHDat (method)
  HPHDat(HPHDat: NCollection_HArray1_HLRAlgo_PolyHidingData): void;

  // HLRAlgo_PolyData.FaceIndex (method)
  FaceIndex(I: number): void;
  FaceIndex(): number;

  // HLRAlgo_PolyData.Nodes (method)
  Nodes(): NCollection_Array1_gp_XYZ;

  // HLRAlgo_PolyData.TData (method)
  TData(): NCollection_Array1_HLRAlgo_TriangleData;

  // HLRAlgo_PolyData.PHDat (method)
  PHDat(): NCollection_Array1_HLRAlgo_PolyHidingData;

  // HLRAlgo_PolyData.UpdateGlobalMinMax (method)
  UpdateGlobalMinMax(theBox: Bnd_Box): void;

  // HLRAlgo_PolyData.Hiding (method)
  Hiding(): boolean;

  // HLRAlgo_PolyData.HideByPolyData (method)
  HideByPolyData(thePoints: HLRAlgo_BiPoint_PointsT, theTriangle: HLRAlgo_PolyData_Triangle, theIndices: HLRAlgo_BiPoint_IndicesT, HidingShell: boolean, status: HLRAlgo_EdgeStatus): void;

  // HLRAlgo_PolyData.Indices (method)
  Indices(): HLRAlgo_PolyData_FaceIndices;

  // HLRAlgo_PolyData.get_type_name (method)
  static get_type_name(): string;

  // HLRAlgo_PolyData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRAlgo_PolyData.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRAlgo_PolyData.delete (method)
  delete(): void;

  // HLRAlgo_PolyData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_PolyHidingData: declare class HLRAlgo_PolyHidingData

  // HLRAlgo_PolyHidingData.constructor (constructor)
  constructor();

  // HLRAlgo_PolyHidingData.Set (method)
  Set(Index: number, Minim: number, Maxim: number, A: number, B: number, C: number, D: number): void;

  // HLRAlgo_PolyHidingData.Indices (method)
  Indices(): HLRAlgo_PolyHidingData_TriangleIndices;

  // HLRAlgo_PolyHidingData.Plane (method)
  Plane(): HLRAlgo_PolyHidingData_PlaneT;

  // HLRAlgo_PolyHidingData.delete (method)
  delete(): void;

  // HLRAlgo_PolyHidingData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_PolyInternalNode: declare class HLRAlgo_PolyInternalNode extends Standard_Transient

  // HLRAlgo_PolyInternalNode.constructor (constructor)
  constructor();

  // HLRAlgo_PolyInternalNode.Indices (method)
  Indices(): HLRAlgo_PolyInternalNode_NodeIndices;

  // HLRAlgo_PolyInternalNode.Data (method)
  Data(): HLRAlgo_PolyInternalNode_NodeData;

  // HLRAlgo_PolyInternalNode.get_type_name (method)
  static get_type_name(): string;

  // HLRAlgo_PolyInternalNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRAlgo_PolyInternalNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRAlgo_PolyInternalNode.delete (method)
  delete(): void;

  // HLRAlgo_PolyInternalNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_PolyInternalSegment: declare class HLRAlgo_PolyInternalSegment

  // HLRAlgo_PolyInternalSegment.constructor (constructor)
  constructor();

  LstSg1: number

  LstSg2: number

  NxtSg1: number

  NxtSg2: number

  Conex1: number

  Conex2: number

  // HLRAlgo_PolyInternalSegment.delete (method)
  delete(): void;

  // HLRAlgo_PolyInternalSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_PolyMask: typeof HLRAlgo_PolyMask[keyof typeof HLRAlgo_PolyMask]

  readonly HLRAlgo_PolyMask_EMskOutLin1: 'HLRAlgo_PolyMask_EMskOutLin1'

  readonly HLRAlgo_PolyMask_EMskOutLin2: 'HLRAlgo_PolyMask_EMskOutLin2'

  readonly HLRAlgo_PolyMask_EMskOutLin3: 'HLRAlgo_PolyMask_EMskOutLin3'

  readonly HLRAlgo_PolyMask_EMskGrALin1: 'HLRAlgo_PolyMask_EMskGrALin1'

  readonly HLRAlgo_PolyMask_EMskGrALin2: 'HLRAlgo_PolyMask_EMskGrALin2'

  readonly HLRAlgo_PolyMask_EMskGrALin3: 'HLRAlgo_PolyMask_EMskGrALin3'

  readonly HLRAlgo_PolyMask_FMskBack: 'HLRAlgo_PolyMask_FMskBack'

  readonly HLRAlgo_PolyMask_FMskSide: 'HLRAlgo_PolyMask_FMskSide'

  readonly HLRAlgo_PolyMask_FMskHiding: 'HLRAlgo_PolyMask_FMskHiding'

  readonly HLRAlgo_PolyMask_FMskFlat: 'HLRAlgo_PolyMask_FMskFlat'

  readonly HLRAlgo_PolyMask_FMskOnOutL: 'HLRAlgo_PolyMask_FMskOnOutL'

  readonly HLRAlgo_PolyMask_FMskOrBack: 'HLRAlgo_PolyMask_FMskOrBack'

  readonly HLRAlgo_PolyMask_FMskFrBack: 'HLRAlgo_PolyMask_FMskFrBack'

HLRAlgo_PolyShellData: declare class HLRAlgo_PolyShellData extends Standard_Transient

  // HLRAlgo_PolyShellData.constructor (constructor)
  constructor(nbFace: number);

  // HLRAlgo_PolyShellData.UpdateGlobalMinMax (method)
  UpdateGlobalMinMax(theBox: Bnd_Box): void;

  // HLRAlgo_PolyShellData.UpdateHiding (method)
  UpdateHiding(nbHiding: number): void;

  // HLRAlgo_PolyShellData.Hiding (method)
  Hiding(): boolean;

  // HLRAlgo_PolyShellData.PolyData (method)
  PolyData(): NCollection_Array1_handle_HLRAlgo_PolyData;

  // HLRAlgo_PolyShellData.HidingPolyData (method)
  HidingPolyData(): NCollection_Array1_handle_HLRAlgo_PolyData;

  // HLRAlgo_PolyShellData.Edges (method)
  Edges(): NCollection_List_HLRAlgo_BiPoint;

  // HLRAlgo_PolyShellData.Indices (method)
  Indices(): HLRAlgo_PolyShellData_ShellIndices;

  // HLRAlgo_PolyShellData.get_type_name (method)
  static get_type_name(): string;

  // HLRAlgo_PolyShellData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRAlgo_PolyShellData.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRAlgo_PolyShellData.delete (method)
  delete(): void;

  // HLRAlgo_PolyShellData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_Projector: declare class HLRAlgo_Projector

  // HLRAlgo_Projector.constructor (constructor)
  constructor();
  constructor(CS: gp_Ax2);
  constructor(CS: gp_Ax2, Focus: number);
  constructor(T: gp_Trsf, Persp: boolean, Focus: number);
  constructor(T: gp_Trsf, Persp: boolean, Focus: number, v1: gp_Vec2d, v2: gp_Vec2d, v3: gp_Vec2d);

  // HLRAlgo_Projector.Set (method)
  Set(T: gp_Trsf, Persp: boolean, Focus: number): void;

  // HLRAlgo_Projector.Directions (method)
  Directions(D1: gp_Vec2d, D2: gp_Vec2d, D3: gp_Vec2d): void;

  // HLRAlgo_Projector.Scaled (method)
  Scaled(On?: boolean): void;

  // HLRAlgo_Projector.Perspective (method)
  Perspective(): boolean;

  // HLRAlgo_Projector.Transformation (method)
  Transformation(): gp_Trsf;

  // HLRAlgo_Projector.InvertedTransformation (method)
  InvertedTransformation(): gp_Trsf;

  // HLRAlgo_Projector.FullTransformation (method)
  FullTransformation(): gp_Trsf;

  // HLRAlgo_Projector.Focus (method)
  Focus(): number;

  // HLRAlgo_Projector.Transform (method)
  Transform(D: gp_Vec): void;
  Transform(Pnt: gp_Pnt): void;

  // HLRAlgo_Projector.Project (method)
  Project(P: gp_Pnt, Pout: gp_Pnt2d): void;
  Project(P: gp_Pnt, X: number, Y: number, Z: number): { X: number; Y: number; Z: number };
  Project(P: gp_Pnt, D1: gp_Vec, Pout: gp_Pnt2d, D1out: gp_Vec2d): void;

  // HLRAlgo_Projector.Shoot (method)
  Shoot(X: number, Y: number): gp_Lin;

  // HLRAlgo_Projector.delete (method)
  delete(): void;

  // HLRAlgo_Projector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_TriangleData: declare class HLRAlgo_TriangleData

  // HLRAlgo_TriangleData.constructor (constructor)
  constructor();

  Node1: number

  Node2: number

  Node3: number

  Flags: number

  // HLRAlgo_TriangleData.delete (method)
  delete(): void;

  // HLRAlgo_TriangleData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_WiresBlock: declare class HLRAlgo_WiresBlock extends Standard_Transient

  // HLRAlgo_WiresBlock.constructor (constructor)
  constructor(NbWires: number);

  // HLRAlgo_WiresBlock.NbWires (method)
  NbWires(): number;

  // HLRAlgo_WiresBlock.Set (method)
  Set(I: number, W: HLRAlgo_EdgesBlock): void;

  // HLRAlgo_WiresBlock.Wire (method)
  Wire(I: number): HLRAlgo_EdgesBlock;

  // HLRAlgo_WiresBlock.UpdateMinMax (method)
  UpdateMinMax(theMinMaxes: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRAlgo_WiresBlock.MinMax (method)
  MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

  // HLRAlgo_WiresBlock.get_type_name (method)
  static get_type_name(): string;

  // HLRAlgo_WiresBlock.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HLRAlgo_WiresBlock.DynamicType (method)
  DynamicType(): Standard_Type;

  // HLRAlgo_WiresBlock.delete (method)
  delete(): void;

  // HLRAlgo_WiresBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRAlgo_BiPoint_IndicesT: interface HLRAlgo_BiPoint_IndicesT

  ShapeIndex: number

  FaceConex1: number

  Face1Pt1: number

  Face1Pt2: number

  FaceConex2: number

  Face2Pt1: number

  Face2Pt2: number

  MinSeg: number

  MaxSeg: number

  SegFlags: number

HLRAlgo_PolyData_FaceIndices: interface HLRAlgo_PolyData_FaceIndices

  Index: number

  Min: number

  Max: number

HLRAlgo_PolyData_Triangle: interface HLRAlgo_PolyData_Triangle

  V1: gp_XY

  V2: gp_XY

  V3: gp_XY

  Param: number

  TolParam: number

  TolAng: number

  Tolerance: number

HLRAlgo_PolyHidingData_TriangleIndices: interface HLRAlgo_PolyHidingData_TriangleIndices

  Index: number

  Min: number

  Max: number

HLRAlgo_PolyHidingData_PlaneT: interface HLRAlgo_PolyHidingData_PlaneT

  Normal: gp_XYZ

  D: number

HLRAlgo_PolyInternalNode_NodeIndices: interface HLRAlgo_PolyInternalNode_NodeIndices

  NdSg: number

  Flag: number

  Edg1: number

  Edg2: number

HLRAlgo_PolyInternalNode_NodeData: interface HLRAlgo_PolyInternalNode_NodeData

  Point: gp_XYZ

  Normal: gp_XYZ

  UV: gp_XY

  PCu1: number

  PCu2: number

  Scal: number

HLRAlgo_PolyShellData_ShellIndices: interface HLRAlgo_PolyShellData_ShellIndices

  Min: number

  Max: number

HLRAlgo_Array1OfPHDat: NCollection_Array1_HLRAlgo_PolyHidingData

HLRAlgo_Array1OfTData: NCollection_Array1_HLRAlgo_TriangleData

HLRAlgo_HArray1OfPHDat: NCollection_HArray1_HLRAlgo_PolyHidingData

HLRAlgo_HArray1OfTData: NCollection_HArray1_HLRAlgo_TriangleData

HLRAlgo_InterferenceList: NCollection_List_HLRAlgo_Interference

HLRAlgo_ListIteratorOfInterferenceList: NCollection_TListIterator_HLRAlgo_Interference

HLRAlgo_ListOfBPoint: NCollection_List_HLRAlgo_BiPoint
