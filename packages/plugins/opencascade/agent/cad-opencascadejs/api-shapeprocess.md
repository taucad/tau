# libcascade — ShapeProcess

7 top-level symbols. Signatures are verbatim typescript.

ShapeProcess: declare class ShapeProcess

  // ShapeProcess.constructor (constructor)
  constructor();

  // ShapeProcess.RegisterOperator (method)
  static RegisterOperator(name: string, op: ShapeProcess_Operator): boolean;

  // ShapeProcess.FindOperator (method)
  static FindOperator(name: string): { returnValue: boolean; op: ShapeProcess_Operator; [Symbol.dispose](): void };

  // ShapeProcess.Perform (method)
  static Perform(context: ShapeProcess_Context, seq: string, theProgress: Message_ProgressRange): boolean;
  static Perform(theContext: ShapeProcess_Context, theOperations: any, theProgress: Message_ProgressRange): boolean;

  // ShapeProcess.ToOperationFlag (method)
  static ToOperationFlag(theName: string): [ShapeProcess_Operation, boolean];

  // ShapeProcess.delete (method)
  delete(): void;

  // ShapeProcess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeProcess_Operation: typeof ShapeProcess_Operation[keyof typeof ShapeProcess_Operation]

  readonly First: 'First'

  readonly DirectFaces: 'DirectFaces'

  readonly SameParameter: 'SameParameter'

  readonly SetTolerance: 'SetTolerance'

  readonly SplitAngle: 'SplitAngle'

  readonly BSplineRestriction: 'BSplineRestriction'

  readonly ElementaryToRevolution: 'ElementaryToRevolution'

  readonly SweptToElementary: 'SweptToElementary'

  readonly SurfaceToBSpline: 'SurfaceToBSpline'

  readonly ToBezier: 'ToBezier'

  readonly SplitContinuity: 'SplitContinuity'

  readonly SplitClosedFaces: 'SplitClosedFaces'

  readonly FixWireGaps: 'FixWireGaps'

  readonly FixFaceSize: 'FixFaceSize'

  readonly DropSmallSolids: 'DropSmallSolids'

  readonly DropSmallEdges: 'DropSmallEdges'

  readonly FixShape: 'FixShape'

  readonly SplitClosedEdges: 'SplitClosedEdges'

  readonly SplitCommonVertex: 'SplitCommonVertex'

  readonly Last: 'Last'

ShapeProcess_Context: declare class ShapeProcess_Context extends Standard_Transient

  // ShapeProcess_Context.constructor (constructor)
  constructor();
  constructor(file: string, scope?: string);

  // ShapeProcess_Context.Init (method)
  Init(file: string, scope?: string): boolean;

  // ShapeProcess_Context.LoadResourceManager (method)
  LoadResourceManager(file: string): Resource_Manager;

  // ShapeProcess_Context.ResourceManager (method)
  ResourceManager(): Resource_Manager;

  // ShapeProcess_Context.SetScope (method)
  SetScope(scope: string): void;

  // ShapeProcess_Context.UnSetScope (method)
  UnSetScope(): void;

  // ShapeProcess_Context.IsParamSet (method)
  IsParamSet(param: string): boolean;

  // ShapeProcess_Context.GetReal (method)
  GetReal(param: string, val?: number): { returnValue: boolean; val: number };

  // ShapeProcess_Context.GetInteger (method)
  GetInteger(param: string, val?: number): { returnValue: boolean; val: number };

  // ShapeProcess_Context.GetBoolean (method)
  GetBoolean(param: string, val?: boolean): { returnValue: boolean; val: boolean };

  // ShapeProcess_Context.GetString (method)
  GetString(param: string, val: TCollection_AsciiString): boolean;

  // ShapeProcess_Context.RealVal (method)
  RealVal(param: string, def: number): number;

  // ShapeProcess_Context.IntegerVal (method)
  IntegerVal(param: string, def: number): number;

  // ShapeProcess_Context.BooleanVal (method)
  BooleanVal(param: string, def: boolean): boolean;

  // ShapeProcess_Context.StringVal (method)
  StringVal(param: string, def: string): string;

  // ShapeProcess_Context.SetTraceLevel (method)
  SetTraceLevel(tracelev: number): void;

  // ShapeProcess_Context.TraceLevel (method)
  TraceLevel(): number;

  // ShapeProcess_Context.get_type_name (method)
  static get_type_name(): string;

  // ShapeProcess_Context.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeProcess_Context.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeProcess_Context.delete (method)
  delete(): void;

  // ShapeProcess_Context.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeProcess_OperLibrary: declare class ShapeProcess_OperLibrary

  // ShapeProcess_OperLibrary.constructor (constructor)
  constructor();

  // ShapeProcess_OperLibrary.Init (method)
  static Init(): void;

  // ShapeProcess_OperLibrary.ApplyModifier (method)
  static ApplyModifier(S: TopoDS_Shape, context: ShapeProcess_ShapeContext, M: BRepTools_Modification, map: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator, theMutableInput: boolean): TopoDS_Shape;

  // ShapeProcess_OperLibrary.delete (method)
  delete(): void;

  // ShapeProcess_OperLibrary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeProcess_Operator: declare class ShapeProcess_Operator extends Standard_Transient

  // ShapeProcess_Operator.Perform (method)
  Perform(context: ShapeProcess_Context, theProgress?: Message_ProgressRange): boolean;

  // ShapeProcess_Operator.get_type_name (method)
  static get_type_name(): string;

  // ShapeProcess_Operator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeProcess_Operator.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeProcess_Operator.delete (method)
  delete(): void;

  // ShapeProcess_Operator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeProcess_ShapeContext: declare class ShapeProcess_ShapeContext extends ShapeProcess_Context

  // ShapeProcess_ShapeContext.constructor (constructor)
  constructor(file: string, seq?: string);
  constructor(S: TopoDS_Shape, file: string, seq?: string);

  // ShapeProcess_ShapeContext.Init (method)
  Init(S: TopoDS_Shape): void;
  Init(file: string, scope: string): boolean;

  // ShapeProcess_ShapeContext.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeProcess_ShapeContext.Result (method)
  Result(): TopoDS_Shape;

  // ShapeProcess_ShapeContext.Map (method)
  Map(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  // ShapeProcess_ShapeContext.Messages (method)
  Messages(): ShapeExtend_MsgRegistrator;

  // ShapeProcess_ShapeContext.SetDetalisation (method)
  SetDetalisation(level: TopAbs_ShapeEnum): void;

  // ShapeProcess_ShapeContext.GetDetalisation (method)
  GetDetalisation(): TopAbs_ShapeEnum;

  // ShapeProcess_ShapeContext.SetResult (method)
  SetResult(S: TopoDS_Shape): void;

  // ShapeProcess_ShapeContext.RecordModification (method)
  RecordModification(repl: ShapeBuild_ReShape): void;
  RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;

  // ShapeProcess_ShapeContext.AddMessage (method)
  AddMessage(S: TopoDS_Shape, msg: Message_Msg, gravity?: Message_Gravity): void;

  // ShapeProcess_ShapeContext.GetContinuity (method)
  GetContinuity(param: string, val?: GeomAbs_Shape): { returnValue: boolean; val: GeomAbs_Shape };

  // ShapeProcess_ShapeContext.ContinuityVal (method)
  ContinuityVal(param: string, def: GeomAbs_Shape): GeomAbs_Shape;

  // ShapeProcess_ShapeContext.PrintStatistics (method)
  PrintStatistics(): void;

  // ShapeProcess_ShapeContext.SetNonManifold (method)
  SetNonManifold(theNonManifold: boolean): void;

  // ShapeProcess_ShapeContext.IsNonManifold (method)
  IsNonManifold(): boolean;

  // ShapeProcess_ShapeContext.get_type_name (method)
  static get_type_name(): string;

  // ShapeProcess_ShapeContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeProcess_ShapeContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeProcess_ShapeContext.delete (method)
  delete(): void;

  // ShapeProcess_ShapeContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeProcess_UOperator: declare class ShapeProcess_UOperator extends ShapeProcess_Operator

  // ShapeProcess_UOperator.constructor (constructor)
  constructor(func: ((arg0: ShapeProcess_Context, arg1: Message_ProgressRange) => boolean));

  // ShapeProcess_UOperator.Perform (method)
  Perform(context: ShapeProcess_Context, theProgress?: Message_ProgressRange): boolean;

  // ShapeProcess_UOperator.get_type_name (method)
  static get_type_name(): string;

  // ShapeProcess_UOperator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeProcess_UOperator.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeProcess_UOperator.delete (method)
  delete(): void;

  // ShapeProcess_UOperator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
