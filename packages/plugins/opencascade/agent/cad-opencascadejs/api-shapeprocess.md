# libcascade — ShapeProcess

7 top-level symbols. Signatures are verbatim typescript.

ShapeProcess: declare class ShapeProcess

  constructor

  static RegisterOperator(name: string, op: ShapeProcess_Operator): boolean;

  static FindOperator(name: string): { returnValue: boolean; op: ShapeProcess_Operator; [Symbol.dispose](): void };

  static Perform(context: ShapeProcess_Context, seq: string, theProgress: Message_ProgressRange): boolean;
  static Perform(theContext: ShapeProcess_Context, theOperations: any, theProgress: Message_ProgressRange): boolean;
  static Perform(context: ShapeProcess_Context, seq: string, theProgress: Message_ProgressRange): boolean;
  static Perform(theContext: ShapeProcess_Context, theOperations: any, theProgress: Message_ProgressRange): boolean;

  static ToOperationFlag(theName: string): [ShapeProcess_Operation, boolean];

  delete(): void;

  [Symbol.dispose](): void;

ShapeProcess_Operation: typeof ShapeProcess_Operation[keyof typeof ShapeProcess_Operation]

ShapeProcess_Context: declare class ShapeProcess_Context extends Standard_Transient

  constructor

  Init(file: string, scope?: string): boolean;

  LoadResourceManager(file: string): Resource_Manager;

  ResourceManager(): Resource_Manager;

  SetScope(scope: string): void;

  UnSetScope(): void;

  IsParamSet(param: string): boolean;

  GetReal(param: string, val?: number): { returnValue: boolean; val: number };

  GetInteger(param: string, val?: number): { returnValue: boolean; val: number };

  GetBoolean(param: string, val?: boolean): { returnValue: boolean; val: boolean };

  GetString(param: string, val: TCollection_AsciiString): boolean;

  RealVal(param: string, def: number): number;

  IntegerVal(param: string, def: number): number;

  BooleanVal(param: string, def: boolean): boolean;

  StringVal(param: string, def: string): string;

  SetTraceLevel(tracelev: number): void;

  TraceLevel(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeProcess_OperLibrary: declare class ShapeProcess_OperLibrary

  constructor

  static Init(): void;

  static ApplyModifier(S: TopoDS_Shape, context: ShapeProcess_ShapeContext, M: BRepTools_Modification, map: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator, theMutableInput: boolean): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

ShapeProcess_Operator: declare class ShapeProcess_Operator extends Standard_Transient

  Perform(context: ShapeProcess_Context, theProgress?: Message_ProgressRange): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeProcess_ShapeContext: declare class ShapeProcess_ShapeContext extends ShapeProcess_Context

  constructor

  Init(S: TopoDS_Shape): void;
  Init(file: string, scope: string): boolean;
  Init(S: TopoDS_Shape): void;
  Init(file: string, scope: string): boolean;

  Shape(): TopoDS_Shape;

  Result(): TopoDS_Shape;

  Map(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  Messages(): ShapeExtend_MsgRegistrator;

  SetDetalisation(level: TopAbs_ShapeEnum): void;

  GetDetalisation(): TopAbs_ShapeEnum;

  SetResult(S: TopoDS_Shape): void;

  RecordModification(repl: ShapeBuild_ReShape): void;
  RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape): void;
  RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape): void;
  RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape): void;
  RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
  RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;

  AddMessage(S: TopoDS_Shape, msg: Message_Msg, gravity?: Message_Gravity): void;

  GetContinuity(param: string, val?: GeomAbs_Shape): { returnValue: boolean; val: GeomAbs_Shape };

  ContinuityVal(param: string, def: GeomAbs_Shape): GeomAbs_Shape;

  PrintStatistics(): void;

  SetNonManifold(theNonManifold: boolean): void;

  IsNonManifold(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeProcess_UOperator: declare class ShapeProcess_UOperator extends ShapeProcess_Operator

  constructor

  Perform(context: ShapeProcess_Context, theProgress?: Message_ProgressRange): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
