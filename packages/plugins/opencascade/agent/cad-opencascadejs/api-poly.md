# libcascade — Poly

32 top-level symbols. Signatures are verbatim typescript.

Poly: declare class Poly

  constructor

  static Catenate(lstTri: NCollection_List_handle_Poly_Triangulation): Poly_Triangulation;

  static ComputeNormals(Tri: Poly_Triangulation): void;

  static PointOnTriangle(P1: gp_XY, P2: gp_XY, P3: gp_XY, P: gp_XY, UV: gp_XY): number;

  static Intersect(theTri: Poly_Triangulation, theAxis: gp_Ax1, theIsClosest: boolean, theTriangle: Poly_Triangle, theDistance?: number): { returnValue: boolean; theDistance: number };

  static IntersectTriLine(theStart: gp_XYZ, theDir: gp_Dir, theV0: gp_XYZ, theV1: gp_XYZ, theV2: gp_XYZ, theParam?: number): { returnValue: number; theParam: number };

  delete(): void;

  [Symbol.dispose](): void;

Poly_ArrayOfNodes: declare class Poly_ArrayOfNodes

  constructor

  IsDoublePrecision(): boolean;

  SetDoublePrecision(theIsDouble: boolean): void;

  Assign(theOther: Poly_ArrayOfNodes): Poly_ArrayOfNodes;

  Move(theOther: Poly_ArrayOfNodes): Poly_ArrayOfNodes;

  Value(theIndex: number): gp_Pnt;

  SetValue(theIndex: number, theValue: gp_Pnt): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_ArrayOfUVNodes: declare class Poly_ArrayOfUVNodes

  constructor

  IsDoublePrecision(): boolean;

  SetDoublePrecision(theIsDouble: boolean): void;

  Assign(theOther: Poly_ArrayOfUVNodes): Poly_ArrayOfUVNodes;

  Move(theOther: Poly_ArrayOfUVNodes): Poly_ArrayOfUVNodes;

  Value(theIndex: number): gp_Pnt2d;

  SetValue(theIndex: number, theValue: gp_Pnt2d): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentLink: declare class Poly_CoherentLink

  constructor

  Node(ind: number): number;

  OppositeNode(ind: number): number;

  IsEmpty(): boolean;

  Nullify(): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentNode: declare class Poly_CoherentNode extends gp_XYZ

  constructor

  SetUV(theU: number, theV: number): void;

  GetU(): number;

  GetV(): number;

  SetNormal(theVector: gp_XYZ): void;

  HasNormal(): boolean;

  GetNormal(): gp_XYZ;

  SetIndex(theIndex: number): void;

  GetIndex(): number;

  IsFreeNode(): boolean;

  Clear(argNo0: NCollection_BaseAllocator): void;

  AddTriangle(theTri: Poly_CoherentTriangle, theA: NCollection_BaseAllocator): void;

  RemoveTriangle(theTri: Poly_CoherentTriangle, theA: NCollection_BaseAllocator): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriPtr_Iterator: declare class Poly_CoherentTriPtr_Iterator

  constructor

  First(): Poly_CoherentTriangle;

  More(): boolean;

  Next(): void;

  Value(): Poly_CoherentTriangle;

  ChangeValue(): Poly_CoherentTriangle;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriangle: declare class Poly_CoherentTriangle

  constructor

  Node(ind: number): number;

  IsEmpty(): boolean;

  SetConnection(iConn: number, theTr: Poly_CoherentTriangle): boolean;
  SetConnection(theTri: Poly_CoherentTriangle): boolean;
  SetConnection(iConn: number, theTr: Poly_CoherentTriangle): boolean;
  SetConnection(theTri: Poly_CoherentTriangle): boolean;

  RemoveConnection(iConn: number): void;
  RemoveConnection(theTri: Poly_CoherentTriangle): boolean;
  RemoveConnection(iConn: number): void;
  RemoveConnection(theTri: Poly_CoherentTriangle): boolean;

  NConnections(): number;

  GetConnectedNode(iConn: number): number;

  GetConnectedTri(iConn: number): Poly_CoherentTriangle;

  GetLink(iLink: number): Poly_CoherentLink;

  FindConnection(argNo0: Poly_CoherentTriangle): number;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriangulation: declare class Poly_CoherentTriangulation extends Standard_Transient

  constructor

  GetTriangulation(): Poly_Triangulation;

  RemoveDegenerated(theTol: number, pLstRemovedNode?: any): boolean;

  GetFreeNodes(lstNodes: NCollection_List_int): boolean;

  MaxNode(): number;

  MaxTriangle(): number;

  SetDeflection(theDefl: number): void;

  Deflection(): number;

  SetNode(thePnt: gp_XYZ, iN?: number): number;

  Node(i: number): Poly_CoherentNode;

  ChangeNode(i: number): Poly_CoherentNode;

  NNodes(): number;

  Triangle(i: number): Poly_CoherentTriangle;

  NTriangles(): number;

  NLinks(): number;

  RemoveTriangle(theTr: Poly_CoherentTriangle): boolean;

  RemoveLink(theLink: Poly_CoherentLink): void;

  AddTriangle(iNode0: number, iNode1: number, iNode2: number): Poly_CoherentTriangle;

  ReplaceNodes(theTriangle: Poly_CoherentTriangle, iNode0: number, iNode1: number, iNode2: number): boolean;

  AddLink(theTri: Poly_CoherentTriangle, theConn: number): Poly_CoherentLink;

  FindTriangle(theLink: Poly_CoherentLink, pTri: [Poly_CoherentTriangle, Poly_CoherentTriangle]): boolean;

  ComputeLinks(): number;

  ClearLinks(): void;

  Allocator(): NCollection_BaseAllocator;

  Clone(theAlloc: NCollection_BaseAllocator): Poly_CoherentTriangulation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfLink: declare class Poly_CoherentTriangulation_IteratorOfLink

  constructor

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfNode: declare class Poly_CoherentTriangulation_IteratorOfNode

  constructor

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfTriangle: declare class Poly_CoherentTriangulation_IteratorOfTriangle

  constructor

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_Connect: declare class Poly_Connect

  constructor

  Load(theTriangulation: Poly_Triangulation): void;

  Triangulation(): Poly_Triangulation;

  Triangle(N: number): number;

  Triangles(T: number, t1?: number, t2?: number, t3?: number): { t1: number; t2: number; t3: number };

  Nodes(T: number, n1?: number, n2?: number, n3?: number): { n1: number; n2: number; n3: number };

  Initialize(N: number): void;

  More(): boolean;

  Next(): void;

  Value(): number;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops: declare class Poly_MakeLoops

  Reset(theHelper: Poly_MakeLoops_Helper, theAlloc?: NCollection_BaseAllocator): void;

  AddLink(theLink: Poly_MakeLoops_Link): void;

  ReplaceLink(theLink: Poly_MakeLoops_Link, theNewLink: Poly_MakeLoops_Link): void;

  SetLinkOrientation(theLink: Poly_MakeLoops_Link, theOrient: Poly_MakeLoops_LinkFlag): Poly_MakeLoops_LinkFlag;

  FindLink(theLink: Poly_MakeLoops_Link): Poly_MakeLoops_Link;

  Perform(): number;

  GetNbLoops(): number;

  GetLoop(theIndex: number): any;

  GetNbHanging(): number;

  GetHangingLinks(theLinks: any): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops_LinkFlag: typeof Poly_MakeLoops_LinkFlag[keyof typeof Poly_MakeLoops_LinkFlag]

Poly_MakeLoops_ResultCode: typeof Poly_MakeLoops_ResultCode[keyof typeof Poly_MakeLoops_ResultCode]

Poly_MakeLoops2D_Helper: declare class Poly_MakeLoops2D_Helper extends Poly_MakeLoops_Helper

  GetFirstTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir2d): boolean;

  GetLastTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir2d): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops3D_Helper: declare class Poly_MakeLoops3D_Helper extends Poly_MakeLoops_Helper

  GetFirstTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir): boolean;

  GetLastTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir): boolean;

  GetNormal(theNode: number, theDir: gp_Dir): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops_Hasher: declare class Poly_MakeLoops_Hasher

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops_HeapOfInteger: declare class Poly_MakeLoops_HeapOfInteger

  constructor

  Clear(): void;

  Add(theValue: number): void;

  Top(): number;

  Contains(theValue: number): boolean;

  Remove(theValue: number): void;

  IsEmpty(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops_Helper: declare class Poly_MakeLoops_Helper

  GetAdjacentLinks(theNode: number): any;

  OnAddLink(argNo0: number, argNo1: Poly_MakeLoops_Link): void;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MakeLoops_Link: declare class Poly_MakeLoops_Link

  constructor

  node1: number

  node2: number

  flags: number

  Reverse(): void;

  IsReversed(): boolean;

  Nullify(): void;

  IsNull(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Poly_MergeNodesTool: declare class Poly_MergeNodesTool extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static MergeNodes(theTris: Poly_Triangulation, theTrsf: gp_Trsf, theToReverse: boolean, theSmoothAngle: number, theMergeTolerance?: number, theToForce?: boolean): Poly_Triangulation;

  MergeTolerance(): number;

  SetMergeTolerance(theTolerance: number): void;

  MergeAngle(): number;

  SetMergeAngle(theAngleRad: number): void;

  ToMergeOpposite(): boolean;

  SetMergeOpposite(theToMerge: boolean): void;

  SetUnitFactor(theUnitFactor: number): void;

  ToDropDegenerative(): boolean;

  SetDropDegenerative(theToDrop: boolean): void;

  ToMergeElems(): boolean;

  SetMergeElems(theToMerge: boolean): void;

  computeTriNormal(): [number, number, number];

  AddTriangulation(theTris: Poly_Triangulation, theTrsf?: gp_Trsf, theToReverse?: boolean): void;

  Result(): Poly_Triangulation;

  AddTriangle(theElemNodes: [gp_XYZ, gp_XYZ, gp_XYZ]): void;

  AddQuad(theElemNodes: [gp_XYZ, gp_XYZ, gp_XYZ, gp_XYZ]): void;

  AddElement(theElemNodes: gp_XYZ, theNbNodes: number): void;

  ChangeElementNode(theIndex: number): gp_XYZ;

  PushLastElement(theNbNodes: number): void;

  PushLastTriangle(): void;

  PushLastQuad(): void;

  ElementNodeIndex(theIndex: number): number;

  NbNodes(): number;

  NbElements(): number;

  NbDegenerativeElems(): number;

  NbMergedElems(): number;

  ChangeOutput(): Poly_Triangulation;

  delete(): void;

  [Symbol.dispose](): void;

Poly_Polygon2D: declare class Poly_Polygon2D extends Standard_Transient

  constructor

  Copy(): Poly_Polygon2D;

  Deflection(): number;
  Deflection(theDefl: number): void;
  Deflection(): number;
  Deflection(theDefl: number): void;

  NbNodes(): number;

  Nodes(): NCollection_Array1_gp_Pnt2d;

  ChangeNodes(): NCollection_Array1_gp_Pnt2d;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Poly_Polygon3D: declare class Poly_Polygon3D extends Standard_Transient

  constructor

  Copy(): Poly_Polygon3D;

  Deflection(): number;
  Deflection(theDefl: number): void;
  Deflection(): number;
  Deflection(theDefl: number): void;

  NbNodes(): number;

  Nodes(): NCollection_Array1_gp_Pnt;

  ChangeNodes(): NCollection_Array1_gp_Pnt;

  HasParameters(): boolean;

  Parameters(): NCollection_Array1_double;

  ChangeParameters(): NCollection_Array1_double;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Poly_PolygonOnTriangulation: declare class Poly_PolygonOnTriangulation extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Copy(): Poly_PolygonOnTriangulation;

  Deflection(): number;
  Deflection(theDefl: number): void;
  Deflection(): number;
  Deflection(theDefl: number): void;

  NbNodes(): number;

  Node(theIndex: number): number;

  ChangeNodeArray(): NCollection_Array1_int;

  SetNode(theIndex: number, theNode: number): void;

  HasParameters(): boolean;

  Parameter(theIndex: number): number;

  SetParameter(theIndex: number, theValue: number): void;

  ChangeParameterArray(): NCollection_Array1_double;

  SetParameters(theParameters: NCollection_HArray1_double): void;

  Nodes(): NCollection_Array1_int;

  Parameters(): NCollection_HArray1_double;

  // DEPRECATED
  ChangeNodes(): NCollection_Array1_int;

  // DEPRECATED
  ChangeParameters(): NCollection_Array1_double;

  delete(): void;

  [Symbol.dispose](): void;

Poly_Triangle: declare class Poly_Triangle

  constructor

  Set(theN1: number, theN2: number, theN3: number): void;
  Set(theIndex: number, theNode: number): void;
  Set(theN1: number, theN2: number, theN3: number): void;
  Set(theIndex: number, theNode: number): void;

  Get(theN1?: number, theN2?: number, theN3?: number): { theN1: number; theN2: number; theN3: number };

  Value(theIndex: number): number;

  ChangeValue(theIndex: number): number;

  delete(): void;

  [Symbol.dispose](): void;

Poly_Triangulation: declare class Poly_Triangulation extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Copy(): Poly_Triangulation;

  Deflection(): number;
  Deflection(theDeflection: number): void;
  Deflection(): number;
  Deflection(theDeflection: number): void;

  Parameters(): Poly_TriangulationParameters;
  Parameters(theParams: Poly_TriangulationParameters): void;
  Parameters(): Poly_TriangulationParameters;
  Parameters(theParams: Poly_TriangulationParameters): void;

  Clear(): void;

  HasGeometry(): boolean;

  NbNodes(): number;

  NbTriangles(): number;

  HasUVNodes(): boolean;

  HasNormals(): boolean;

  Node(theIndex: number): gp_Pnt;

  SetNode(theIndex: number, thePnt: gp_Pnt): void;

  UVNode(theIndex: number): gp_Pnt2d;

  SetUVNode(theIndex: number, thePnt: gp_Pnt2d): void;

  Triangle(theIndex: number): Poly_Triangle;

  SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;

  Normal(theIndex: number): gp_Dir;

  SetNormal(theIndex: number, theNormal: gp_Dir): void;

  MeshPurpose(): number;

  SetMeshPurpose(thePurpose: number): void;

  CachedMinMax(): Bnd_Box;

  SetCachedMinMax(theBox: Bnd_Box): void;

  HasCachedMinMax(): boolean;

  UpdateCachedMinMax(): void;

  MinMax(theBox: Bnd_Box, theTrsf: gp_Trsf, theIsAccurate: boolean): boolean;

  IsDoublePrecision(): boolean;

  SetDoublePrecision(theIsDouble: boolean): void;

  ResizeNodes(theNbNodes: number, theToCopyOld: boolean): void;

  ResizeTriangles(theNbTriangles: number, theToCopyOld: boolean): void;

  AddUVNodes(): void;

  RemoveUVNodes(): void;

  AddNormals(): void;

  RemoveNormals(): void;

  ComputeNormals(): void;

  MapNodeArray(): NCollection_HArray1_gp_Pnt;

  MapTriangleArray(): NCollection_HArray1_Poly_Triangle;

  MapUVNodeArray(): NCollection_HArray1_gp_Pnt2d;

  MapNormalArray(): NCollection_HArray1_float;

  InternalTriangles(): NCollection_Array1_Poly_Triangle;

  InternalNodes(): Poly_ArrayOfNodes;

  InternalUVNodes(): Poly_ArrayOfUVNodes;

  InternalNormals(): NCollection_Array1_NCollection_Vec3_float;

  // DEPRECATED
  SetNormals(theNormals: NCollection_HArray1_float): void;

  // DEPRECATED
  Triangles(): NCollection_Array1_Poly_Triangle;

  // DEPRECATED
  ChangeTriangles(): NCollection_Array1_Poly_Triangle;

  // DEPRECATED
  ChangeTriangle(theIndex: number): Poly_Triangle;

  NbDeferredNodes(): number;

  NbDeferredTriangles(): number;

  HasDeferredData(): boolean;

  UnloadDeferredData(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Poly_TriangulationParameters: declare class Poly_TriangulationParameters extends Standard_Transient

  constructor

  Copy(): Poly_TriangulationParameters;

  HasDeflection(): boolean;

  HasAngle(): boolean;

  HasMinSize(): boolean;

  Deflection(): number;

  Angle(): number;

  MinSize(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Poly_CoherentTriangulation_TwoIntegers: interface Poly_CoherentTriangulation_TwoIntegers

  myValue: [number, number]

Poly_Array1OfTriangle: NCollection_Array1_Poly_Triangle

Poly_HArray1OfTriangle: NCollection_HArray1_Poly_Triangle

Poly_ListOfTriangulation: NCollection_List_handle_Poly_Triangulation
