# libcascade — BRepCheck

11 top-level symbols. Signatures are verbatim typescript.

BRepCheck: declare class BRepCheck

  constructor

  static Add(List: NCollection_List_BRepCheck_Status, Stat: BRepCheck_Status): void;

  static SelfIntersection(W: TopoDS_Wire, F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

  static PrecCurve(aAC3D: Adaptor3d_Curve): number;

  static PrecSurface(aAHSurf: Adaptor3d_Surface): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Analyzer: declare class BRepCheck_Analyzer

  constructor

  Init(S: TopoDS_Shape, GeomControls?: boolean): void;

  SetExactMethod(theIsExact: boolean): void;

  IsExactMethod(): boolean;

  SetParallel(theIsParallel: boolean): void;

  IsParallel(): boolean;

  IsValid(S: TopoDS_Shape): boolean;
  IsValid(): boolean;
  IsValid(S: TopoDS_Shape): boolean;
  IsValid(): boolean;

  Result(theSubS: TopoDS_Shape): BRepCheck_Result;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Edge: declare class BRepCheck_Edge extends BRepCheck_Result

  constructor

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;
  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;

  Tolerance(): number;

  SetStatus(theStatus: BRepCheck_Status): void;

  SetExactMethod(theIsExact: boolean): void;

  IsExactMethod(): boolean;

  CheckPolygonOnTriangulation(theEdge: TopoDS_Edge): BRepCheck_Status;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Face: declare class BRepCheck_Face extends BRepCheck_Result

  constructor

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  IntersectWires(Update?: boolean): BRepCheck_Status;

  ClassifyWires(Update?: boolean): BRepCheck_Status;

  OrientationOfWires(Update?: boolean): BRepCheck_Status;

  SetUnorientable(): void;

  SetStatus(theStatus: BRepCheck_Status): void;

  IsUnorientable(): boolean;

  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;
  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Result: declare class BRepCheck_Result extends Standard_Transient

  Init(S: TopoDS_Shape): void;

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  SetFailStatus(S: TopoDS_Shape): void;

  Status(): NCollection_List_BRepCheck_Status;

  IsMinimum(): boolean;

  IsBlind(): boolean;

  InitContextIterator(): void;

  MoreShapeInContext(): boolean;

  ContextualShape(): TopoDS_Shape;

  StatusOnShape(): NCollection_List_BRepCheck_Status;
  StatusOnShape(theShape: TopoDS_Shape): NCollection_List_BRepCheck_Status;
  StatusOnShape(): NCollection_List_BRepCheck_Status;
  StatusOnShape(theShape: TopoDS_Shape): NCollection_List_BRepCheck_Status;

  NextShapeInContext(): void;

  SetParallel(theIsParallel: boolean): void;

  IsParallel(): boolean;

  IsStatusOnShape(theShape: TopoDS_Shape): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Shell: declare class BRepCheck_Shell extends BRepCheck_Result

  constructor

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  Closed(Update?: boolean): BRepCheck_Status;

  Orientation(Update?: boolean): BRepCheck_Status;

  SetUnorientable(): void;

  IsUnorientable(): boolean;

  NbConnectedSet(theSets: NCollection_List_TopoDS_Shape): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Solid: declare class BRepCheck_Solid extends BRepCheck_Result

  constructor

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Status: typeof BRepCheck_Status[keyof typeof BRepCheck_Status]

BRepCheck_Vertex: declare class BRepCheck_Vertex extends BRepCheck_Result

  constructor

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  Tolerance(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_Wire: declare class BRepCheck_Wire extends BRepCheck_Result

  constructor

  InContext(ContextShape: TopoDS_Shape): void;

  Minimum(): void;

  Blind(): void;

  Closed(Update?: boolean): BRepCheck_Status;

  Closed2d(F: TopoDS_Face, Update?: boolean): BRepCheck_Status;

  Orientation(F: TopoDS_Face, Update?: boolean): BRepCheck_Status;

  SelfIntersect(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, Update: boolean): BRepCheck_Status;

  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;
  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;

  SetStatus(theStatus: BRepCheck_Status): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepCheck_ListOfStatus: NCollection_List_BRepCheck_Status
