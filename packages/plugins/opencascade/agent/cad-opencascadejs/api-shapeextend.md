# libcascade — ShapeExtend

10 top-level symbols. Signatures are verbatim typescript.

ShapeExtend: declare class ShapeExtend

  // ShapeExtend.constructor (constructor)
  constructor();

  // ShapeExtend.Init (method)
  static Init(): void;

  // ShapeExtend.EncodeStatus (method)
  static EncodeStatus(status: ShapeExtend_Status): number;

  // ShapeExtend.DecodeStatus (method)
  static DecodeStatus(flag: number, status: ShapeExtend_Status): boolean;

  // ShapeExtend.delete (method)
  delete(): void;

  // ShapeExtend.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_BasicMsgRegistrator: declare class ShapeExtend_BasicMsgRegistrator extends Standard_Transient

  // ShapeExtend_BasicMsgRegistrator.constructor (constructor)
  constructor();

  // ShapeExtend_BasicMsgRegistrator.Send (method)
  Send(message: Message_Msg, gravity: Message_Gravity): void;
  Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
  Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;

  // ShapeExtend_BasicMsgRegistrator.get_type_name (method)
  static get_type_name(): string;

  // ShapeExtend_BasicMsgRegistrator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeExtend_BasicMsgRegistrator.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeExtend_BasicMsgRegistrator.delete (method)
  delete(): void;

  // ShapeExtend_BasicMsgRegistrator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_ComplexCurve: declare class ShapeExtend_ComplexCurve extends Geom_Curve

  // ShapeExtend_ComplexCurve.NbCurves (method)
  NbCurves(): number;

  // ShapeExtend_ComplexCurve.Curve (method)
  Curve(index: number): Geom_Curve;

  // ShapeExtend_ComplexCurve.LocateParameter (method)
  LocateParameter(U: number, UOut: number): { returnValue: number; UOut: number };

  // ShapeExtend_ComplexCurve.LocalToGlobal (method)
  LocalToGlobal(index: number, Ulocal: number): number;

  // ShapeExtend_ComplexCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // ShapeExtend_ComplexCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // ShapeExtend_ComplexCurve.FirstParameter (method)
  FirstParameter(): number;

  // ShapeExtend_ComplexCurve.LastParameter (method)
  LastParameter(): number;

  // ShapeExtend_ComplexCurve.IsClosed (method)
  IsClosed(): boolean;

  // ShapeExtend_ComplexCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // ShapeExtend_ComplexCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // ShapeExtend_ComplexCurve.IsCN (method)
  IsCN(N: number): boolean;

  // ShapeExtend_ComplexCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // ShapeExtend_ComplexCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // ShapeExtend_ComplexCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // ShapeExtend_ComplexCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // ShapeExtend_ComplexCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // ShapeExtend_ComplexCurve.GetScaleFactor (method)
  GetScaleFactor(ind: number): number;

  // ShapeExtend_ComplexCurve.CheckConnectivity (method)
  CheckConnectivity(Preci: number): boolean;

  // ShapeExtend_ComplexCurve.get_type_name (method)
  static get_type_name(): string;

  // ShapeExtend_ComplexCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeExtend_ComplexCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeExtend_ComplexCurve.delete (method)
  delete(): void;

  // ShapeExtend_ComplexCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_CompositeSurface: declare class ShapeExtend_CompositeSurface extends Geom_Surface

  // ShapeExtend_CompositeSurface.constructor (constructor)
  constructor();
  constructor(GridSurf: NCollection_HArray2_handle_Geom_Surface, param?: ShapeExtend_Parametrisation);
  constructor(GridSurf: NCollection_HArray2_handle_Geom_Surface, UJoints: NCollection_Array1_double, VJoints: NCollection_Array1_double);

  // ShapeExtend_CompositeSurface.Init (method)
  Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, param: ShapeExtend_Parametrisation): boolean;
  Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, UJoints: NCollection_Array1_double, VJoints: NCollection_Array1_double): boolean;

  // ShapeExtend_CompositeSurface.NbUPatches (method)
  NbUPatches(): number;

  // ShapeExtend_CompositeSurface.NbVPatches (method)
  NbVPatches(): number;

  // ShapeExtend_CompositeSurface.Patch (method)
  Patch(pnt: gp_Pnt2d): Geom_Surface;
  Patch(i: number, j: number): Geom_Surface;
  Patch(U: number, V: number): Geom_Surface;

  // ShapeExtend_CompositeSurface.Patches (method)
  Patches(): NCollection_HArray2_handle_Geom_Surface;

  // ShapeExtend_CompositeSurface.UJointValues (method)
  UJointValues(): NCollection_HArray1_double;

  // ShapeExtend_CompositeSurface.VJointValues (method)
  VJointValues(): NCollection_HArray1_double;

  // ShapeExtend_CompositeSurface.UJointValue (method)
  UJointValue(i: number): number;

  // ShapeExtend_CompositeSurface.VJointValue (method)
  VJointValue(j: number): number;

  // ShapeExtend_CompositeSurface.SetUJointValues (method)
  SetUJointValues(UJoints: NCollection_Array1_double): boolean;

  // ShapeExtend_CompositeSurface.SetVJointValues (method)
  SetVJointValues(VJoints: NCollection_Array1_double): boolean;

  // ShapeExtend_CompositeSurface.SetUFirstValue (method)
  SetUFirstValue(UFirst: number): void;

  // ShapeExtend_CompositeSurface.SetVFirstValue (method)
  SetVFirstValue(VFirst: number): void;

  // ShapeExtend_CompositeSurface.LocateUParameter (method)
  LocateUParameter(U: number): number;

  // ShapeExtend_CompositeSurface.LocateVParameter (method)
  LocateVParameter(V: number): number;

  // ShapeExtend_CompositeSurface.LocateUVPoint (method)
  LocateUVPoint(pnt: gp_Pnt2d, i?: number, j?: number): { i: number; j: number };

  // ShapeExtend_CompositeSurface.ULocalToGlobal (method)
  ULocalToGlobal(i: number, j: number, u: number): number;

  // ShapeExtend_CompositeSurface.VLocalToGlobal (method)
  VLocalToGlobal(i: number, j: number, v: number): number;

  // ShapeExtend_CompositeSurface.LocalToGlobal (method)
  LocalToGlobal(i: number, j: number, uv: gp_Pnt2d): gp_Pnt2d;

  // ShapeExtend_CompositeSurface.UGlobalToLocal (method)
  UGlobalToLocal(i: number, j: number, U: number): number;

  // ShapeExtend_CompositeSurface.VGlobalToLocal (method)
  VGlobalToLocal(i: number, j: number, V: number): number;

  // ShapeExtend_CompositeSurface.GlobalToLocal (method)
  GlobalToLocal(i: number, j: number, UV: gp_Pnt2d): gp_Pnt2d;

  // ShapeExtend_CompositeSurface.GlobalToLocalTransformation (method)
  GlobalToLocalTransformation(i: number, j: number, uFact: number, Trsf: gp_Trsf2d): { returnValue: boolean; uFact: number };

  // ShapeExtend_CompositeSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // ShapeExtend_CompositeSurface.Copy (method)
  Copy(): Geom_Geometry;

  // ShapeExtend_CompositeSurface.UReverse (method)
  UReverse(): void;

  // ShapeExtend_CompositeSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // ShapeExtend_CompositeSurface.VReverse (method)
  VReverse(): void;

  // ShapeExtend_CompositeSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // ShapeExtend_CompositeSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // ShapeExtend_CompositeSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // ShapeExtend_CompositeSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // ShapeExtend_CompositeSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // ShapeExtend_CompositeSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // ShapeExtend_CompositeSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // ShapeExtend_CompositeSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // ShapeExtend_CompositeSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // ShapeExtend_CompositeSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // ShapeExtend_CompositeSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // ShapeExtend_CompositeSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // ShapeExtend_CompositeSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // ShapeExtend_CompositeSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // ShapeExtend_CompositeSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // ShapeExtend_CompositeSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // ShapeExtend_CompositeSurface.Value (method)
  Value(pnt: gp_Pnt2d): gp_Pnt;
  Value(U: number, V: number): gp_Pnt;

  // ShapeExtend_CompositeSurface.ComputeJointValues (method)
  ComputeJointValues(param?: ShapeExtend_Parametrisation): void;

  // ShapeExtend_CompositeSurface.CheckConnectivity (method)
  CheckConnectivity(prec: number): boolean;

  // ShapeExtend_CompositeSurface.get_type_name (method)
  static get_type_name(): string;

  // ShapeExtend_CompositeSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeExtend_CompositeSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeExtend_CompositeSurface.delete (method)
  delete(): void;

  // ShapeExtend_CompositeSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_Explorer: declare class ShapeExtend_Explorer

  // ShapeExtend_Explorer.constructor (constructor)
  constructor();

  // ShapeExtend_Explorer.CompoundFromSeq (method)
  CompoundFromSeq(seqval: NCollection_HSequence_TopoDS_Shape): TopoDS_Shape;

  // ShapeExtend_Explorer.SeqFromCompound (method)
  SeqFromCompound(comp: TopoDS_Shape, expcomp: boolean): NCollection_HSequence_TopoDS_Shape;

  // ShapeExtend_Explorer.ListFromSeq (method)
  ListFromSeq(seqval: NCollection_HSequence_TopoDS_Shape, lisval: NCollection_List_TopoDS_Shape, clear: boolean): void;

  // ShapeExtend_Explorer.SeqFromList (method)
  SeqFromList(lisval: NCollection_List_TopoDS_Shape): NCollection_HSequence_TopoDS_Shape;

  // ShapeExtend_Explorer.ShapeType (method)
  ShapeType(shape: TopoDS_Shape, compound: boolean): TopAbs_ShapeEnum;

  // ShapeExtend_Explorer.SortedCompound (method)
  SortedCompound(shape: TopoDS_Shape, type_: TopAbs_ShapeEnum, explore: boolean, compound: boolean): TopoDS_Shape;

  // ShapeExtend_Explorer.DispatchList (method)
  DispatchList(list: NCollection_HSequence_TopoDS_Shape): { vertices: NCollection_HSequence_TopoDS_Shape; edges: NCollection_HSequence_TopoDS_Shape; wires: NCollection_HSequence_TopoDS_Shape; faces: NCollection_HSequence_TopoDS_Shape; shells: NCollection_HSequence_TopoDS_Shape; solids: NCollection_HSequence_TopoDS_Shape; compsols: NCollection_HSequence_TopoDS_Shape; compounds: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

  // ShapeExtend_Explorer.delete (method)
  delete(): void;

  // ShapeExtend_Explorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_MsgRegistrator: declare class ShapeExtend_MsgRegistrator extends ShapeExtend_BasicMsgRegistrator

  // ShapeExtend_MsgRegistrator.constructor (constructor)
  constructor();

  // ShapeExtend_MsgRegistrator.Send (method)
  Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
  Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
  Send(message: Message_Msg, gravity: Message_Gravity): void;

  // ShapeExtend_MsgRegistrator.MapTransient (method)
  MapTransient(): NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg;

  // ShapeExtend_MsgRegistrator.MapShape (method)
  MapShape(): NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher;

  // ShapeExtend_MsgRegistrator.get_type_name (method)
  static get_type_name(): string;

  // ShapeExtend_MsgRegistrator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeExtend_MsgRegistrator.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeExtend_MsgRegistrator.delete (method)
  delete(): void;

  // ShapeExtend_MsgRegistrator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_Parametrisation: typeof ShapeExtend_Parametrisation[keyof typeof ShapeExtend_Parametrisation]

  readonly ShapeExtend_Natural: 'ShapeExtend_Natural'

  readonly ShapeExtend_Uniform: 'ShapeExtend_Uniform'

  readonly ShapeExtend_Unitary: 'ShapeExtend_Unitary'

ShapeExtend_Status: typeof ShapeExtend_Status[keyof typeof ShapeExtend_Status]

  readonly ShapeExtend_OK: 'ShapeExtend_OK'

  readonly ShapeExtend_DONE1: 'ShapeExtend_DONE1'

  readonly ShapeExtend_DONE2: 'ShapeExtend_DONE2'

  readonly ShapeExtend_DONE3: 'ShapeExtend_DONE3'

  readonly ShapeExtend_DONE4: 'ShapeExtend_DONE4'

  readonly ShapeExtend_DONE5: 'ShapeExtend_DONE5'

  readonly ShapeExtend_DONE6: 'ShapeExtend_DONE6'

  readonly ShapeExtend_DONE7: 'ShapeExtend_DONE7'

  readonly ShapeExtend_DONE8: 'ShapeExtend_DONE8'

  readonly ShapeExtend_DONE: 'ShapeExtend_DONE'

  readonly ShapeExtend_FAIL1: 'ShapeExtend_FAIL1'

  readonly ShapeExtend_FAIL2: 'ShapeExtend_FAIL2'

  readonly ShapeExtend_FAIL3: 'ShapeExtend_FAIL3'

  readonly ShapeExtend_FAIL4: 'ShapeExtend_FAIL4'

  readonly ShapeExtend_FAIL5: 'ShapeExtend_FAIL5'

  readonly ShapeExtend_FAIL6: 'ShapeExtend_FAIL6'

  readonly ShapeExtend_FAIL7: 'ShapeExtend_FAIL7'

  readonly ShapeExtend_FAIL8: 'ShapeExtend_FAIL8'

  readonly ShapeExtend_FAIL: 'ShapeExtend_FAIL'

ShapeExtend_WireData: declare class ShapeExtend_WireData extends Standard_Transient

  // ShapeExtend_WireData.constructor (constructor)
  constructor();
  constructor(wire: TopoDS_Wire, chained?: boolean, theManifoldMode?: boolean);

  // ShapeExtend_WireData.Init (method)
  Init(other: ShapeExtend_WireData): void;
  Init(wire: TopoDS_Wire, chained: boolean, theManifoldMode: boolean): boolean;

  // ShapeExtend_WireData.Clear (method)
  Clear(): void;

  // ShapeExtend_WireData.ComputeSeams (method)
  ComputeSeams(enforce?: boolean): void;

  // ShapeExtend_WireData.SetLast (method)
  SetLast(num: number): void;

  // ShapeExtend_WireData.SetDegeneratedLast (method)
  SetDegeneratedLast(): void;

  // ShapeExtend_WireData.Add (method)
  Add(edge: TopoDS_Edge, atnum: number): void;
  Add(wire: TopoDS_Wire, atnum: number): void;
  Add(wire: ShapeExtend_WireData, atnum: number): void;
  Add(shape: TopoDS_Shape, atnum: number): void;

  // ShapeExtend_WireData.AddOriented (method)
  AddOriented(edge: TopoDS_Edge, mode: number): void;
  AddOriented(wire: TopoDS_Wire, mode: number): void;
  AddOriented(shape: TopoDS_Shape, mode: number): void;

  // ShapeExtend_WireData.Remove (method)
  Remove(num?: number): void;

  // ShapeExtend_WireData.Set (method)
  Set(edge: TopoDS_Edge, num?: number): void;

  // ShapeExtend_WireData.Reverse (method)
  Reverse(): void;
  Reverse(face: TopoDS_Face): void;

  // ShapeExtend_WireData.NbEdges (method)
  NbEdges(): number;

  // ShapeExtend_WireData.NbNonManifoldEdges (method)
  NbNonManifoldEdges(): number;

  // ShapeExtend_WireData.NonmanifoldEdge (method)
  NonmanifoldEdge(num: number): TopoDS_Edge;

  // ShapeExtend_WireData.NonmanifoldEdges (method)
  NonmanifoldEdges(): NCollection_HSequence_TopoDS_Shape;

  // ShapeExtend_WireData.ManifoldMode (method)
  ManifoldMode(): boolean;

  // ShapeExtend_WireData.Edge (method)
  Edge(num: number): TopoDS_Edge;

  // ShapeExtend_WireData.Index (method)
  Index(edge: TopoDS_Edge): number;

  // ShapeExtend_WireData.IsSeam (method)
  IsSeam(num: number): boolean;

  // ShapeExtend_WireData.Wire (method)
  Wire(): TopoDS_Wire;

  // ShapeExtend_WireData.WireAPIMake (method)
  WireAPIMake(): TopoDS_Wire;

  // ShapeExtend_WireData.get_type_name (method)
  static get_type_name(): string;

  // ShapeExtend_WireData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeExtend_WireData.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeExtend_WireData.delete (method)
  delete(): void;

  // ShapeExtend_WireData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeExtend_DataMapOfShapeListOfMsg: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher
