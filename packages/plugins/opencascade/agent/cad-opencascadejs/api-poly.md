# libcascade — Poly

32 top-level symbols. Signatures are verbatim typescript.

Poly: declare class Poly

  // Poly.constructor (constructor)
  constructor();

  // Poly.Catenate (method)
  static Catenate(lstTri: NCollection_List_handle_Poly_Triangulation): Poly_Triangulation;

  // Poly.ComputeNormals (method)
  static ComputeNormals(Tri: Poly_Triangulation): void;

  // Poly.PointOnTriangle (method)
  static PointOnTriangle(P1: gp_XY, P2: gp_XY, P3: gp_XY, P: gp_XY, UV: gp_XY): number;

  // Poly.Intersect (method)
  static Intersect(theTri: Poly_Triangulation, theAxis: gp_Ax1, theIsClosest: boolean, theTriangle: Poly_Triangle, theDistance?: number): { returnValue: boolean; theDistance: number };

  // Poly.IntersectTriLine (method)
  static IntersectTriLine(theStart: gp_XYZ, theDir: gp_Dir, theV0: gp_XYZ, theV1: gp_XYZ, theV2: gp_XYZ, theParam?: number): { returnValue: number; theParam: number };

  // Poly.delete (method)
  delete(): void;

  // Poly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_ArrayOfNodes: declare class Poly_ArrayOfNodes

  // Poly_ArrayOfNodes.constructor (constructor)
  constructor();
  constructor(theLength: number);
  constructor(theOther: Poly_ArrayOfNodes);
  constructor(theBegin: gp_Pnt, theLength: number);

  // Poly_ArrayOfNodes.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // Poly_ArrayOfNodes.SetDoublePrecision (method)
  SetDoublePrecision(theIsDouble: boolean): void;

  // Poly_ArrayOfNodes.Assign (method)
  Assign(theOther: Poly_ArrayOfNodes): Poly_ArrayOfNodes;

  // Poly_ArrayOfNodes.Move (method)
  Move(theOther: Poly_ArrayOfNodes): Poly_ArrayOfNodes;

  // Poly_ArrayOfNodes.Value (method)
  Value(theIndex: number): gp_Pnt;

  // Poly_ArrayOfNodes.SetValue (method)
  SetValue(theIndex: number, theValue: gp_Pnt): void;

  // Poly_ArrayOfNodes.delete (method)
  delete(): void;

  // Poly_ArrayOfNodes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_ArrayOfUVNodes: declare class Poly_ArrayOfUVNodes

  // Poly_ArrayOfUVNodes.constructor (constructor)
  constructor();
  constructor(theLength: number);
  constructor(theOther: Poly_ArrayOfUVNodes);
  constructor(theBegin: gp_Pnt2d, theLength: number);

  // Poly_ArrayOfUVNodes.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // Poly_ArrayOfUVNodes.SetDoublePrecision (method)
  SetDoublePrecision(theIsDouble: boolean): void;

  // Poly_ArrayOfUVNodes.Assign (method)
  Assign(theOther: Poly_ArrayOfUVNodes): Poly_ArrayOfUVNodes;

  // Poly_ArrayOfUVNodes.Move (method)
  Move(theOther: Poly_ArrayOfUVNodes): Poly_ArrayOfUVNodes;

  // Poly_ArrayOfUVNodes.Value (method)
  Value(theIndex: number): gp_Pnt2d;

  // Poly_ArrayOfUVNodes.SetValue (method)
  SetValue(theIndex: number, theValue: gp_Pnt2d): void;

  // Poly_ArrayOfUVNodes.delete (method)
  delete(): void;

  // Poly_ArrayOfUVNodes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentLink: declare class Poly_CoherentLink

  // Poly_CoherentLink.constructor (constructor)
  constructor();
  constructor(iNode0: number, iNode1: number);
  constructor(theTri: Poly_CoherentTriangle, iSide: number);

  // Poly_CoherentLink.Node (method)
  Node(ind: number): number;

  // Poly_CoherentLink.OppositeNode (method)
  OppositeNode(ind: number): number;

  // Poly_CoherentLink.IsEmpty (method)
  IsEmpty(): boolean;

  // Poly_CoherentLink.Nullify (method)
  Nullify(): void;

  // Poly_CoherentLink.delete (method)
  delete(): void;

  // Poly_CoherentLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentNode: declare class Poly_CoherentNode extends gp_XYZ

  // Poly_CoherentNode.constructor (constructor)
  constructor();
  constructor(thePnt: gp_XYZ);

  // Poly_CoherentNode.SetUV (method)
  SetUV(theU: number, theV: number): void;

  // Poly_CoherentNode.GetU (method)
  GetU(): number;

  // Poly_CoherentNode.GetV (method)
  GetV(): number;

  // Poly_CoherentNode.SetNormal (method)
  SetNormal(theVector: gp_XYZ): void;

  // Poly_CoherentNode.HasNormal (method)
  HasNormal(): boolean;

  // Poly_CoherentNode.GetNormal (method)
  GetNormal(): gp_XYZ;

  // Poly_CoherentNode.SetIndex (method)
  SetIndex(theIndex: number): void;

  // Poly_CoherentNode.GetIndex (method)
  GetIndex(): number;

  // Poly_CoherentNode.IsFreeNode (method)
  IsFreeNode(): boolean;

  // Poly_CoherentNode.Clear (method)
  Clear(argNo0: NCollection_BaseAllocator): void;

  // Poly_CoherentNode.AddTriangle (method)
  AddTriangle(theTri: Poly_CoherentTriangle, theA: NCollection_BaseAllocator): void;

  // Poly_CoherentNode.RemoveTriangle (method)
  RemoveTriangle(theTri: Poly_CoherentTriangle, theA: NCollection_BaseAllocator): boolean;

  // Poly_CoherentNode.delete (method)
  delete(): void;

  // Poly_CoherentNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriPtr_Iterator: declare class Poly_CoherentTriPtr_Iterator

  // Poly_CoherentTriPtr_Iterator.constructor (constructor)
  constructor();

  // Poly_CoherentTriPtr_Iterator.First (method)
  First(): Poly_CoherentTriangle;

  // Poly_CoherentTriPtr_Iterator.More (method)
  More(): boolean;

  // Poly_CoherentTriPtr_Iterator.Next (method)
  Next(): void;

  // Poly_CoherentTriPtr_Iterator.Value (method)
  Value(): Poly_CoherentTriangle;

  // Poly_CoherentTriPtr_Iterator.ChangeValue (method)
  ChangeValue(): Poly_CoherentTriangle;

  // Poly_CoherentTriPtr_Iterator.delete (method)
  delete(): void;

  // Poly_CoherentTriPtr_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriangle: declare class Poly_CoherentTriangle

  // Poly_CoherentTriangle.constructor (constructor)
  constructor();
  constructor(iNode0: number, iNode1: number, iNode2: number);

  // Poly_CoherentTriangle.Node (method)
  Node(ind: number): number;

  // Poly_CoherentTriangle.IsEmpty (method)
  IsEmpty(): boolean;

  // Poly_CoherentTriangle.SetConnection (method)
  SetConnection(iConn: number, theTr: Poly_CoherentTriangle): boolean;
  SetConnection(theTri: Poly_CoherentTriangle): boolean;

  // Poly_CoherentTriangle.RemoveConnection (method)
  RemoveConnection(iConn: number): void;
  RemoveConnection(theTri: Poly_CoherentTriangle): boolean;

  // Poly_CoherentTriangle.NConnections (method)
  NConnections(): number;

  // Poly_CoherentTriangle.GetConnectedNode (method)
  GetConnectedNode(iConn: number): number;

  // Poly_CoherentTriangle.GetConnectedTri (method)
  GetConnectedTri(iConn: number): Poly_CoherentTriangle;

  // Poly_CoherentTriangle.GetLink (method)
  GetLink(iLink: number): Poly_CoherentLink;

  // Poly_CoherentTriangle.FindConnection (method)
  FindConnection(argNo0: Poly_CoherentTriangle): number;

  // Poly_CoherentTriangle.delete (method)
  delete(): void;

  // Poly_CoherentTriangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriangulation: declare class Poly_CoherentTriangulation extends Standard_Transient

  // Poly_CoherentTriangulation.constructor (constructor)
  constructor(theAlloc?: NCollection_BaseAllocator);
  constructor(theTriangulation: Poly_Triangulation, theAlloc?: NCollection_BaseAllocator);

  // Poly_CoherentTriangulation.GetTriangulation (method)
  GetTriangulation(): Poly_Triangulation;

  // Poly_CoherentTriangulation.RemoveDegenerated (method)
  RemoveDegenerated(theTol: number, pLstRemovedNode?: any): boolean;

  // Poly_CoherentTriangulation.GetFreeNodes (method)
  GetFreeNodes(lstNodes: NCollection_List_int): boolean;

  // Poly_CoherentTriangulation.MaxNode (method)
  MaxNode(): number;

  // Poly_CoherentTriangulation.MaxTriangle (method)
  MaxTriangle(): number;

  // Poly_CoherentTriangulation.SetDeflection (method)
  SetDeflection(theDefl: number): void;

  // Poly_CoherentTriangulation.Deflection (method)
  Deflection(): number;

  // Poly_CoherentTriangulation.SetNode (method)
  SetNode(thePnt: gp_XYZ, iN?: number): number;

  // Poly_CoherentTriangulation.Node (method)
  Node(i: number): Poly_CoherentNode;

  // Poly_CoherentTriangulation.ChangeNode (method)
  ChangeNode(i: number): Poly_CoherentNode;

  // Poly_CoherentTriangulation.NNodes (method)
  NNodes(): number;

  // Poly_CoherentTriangulation.Triangle (method)
  Triangle(i: number): Poly_CoherentTriangle;

  // Poly_CoherentTriangulation.NTriangles (method)
  NTriangles(): number;

  // Poly_CoherentTriangulation.NLinks (method)
  NLinks(): number;

  // Poly_CoherentTriangulation.RemoveTriangle (method)
  RemoveTriangle(theTr: Poly_CoherentTriangle): boolean;

  // Poly_CoherentTriangulation.RemoveLink (method)
  RemoveLink(theLink: Poly_CoherentLink): void;

  // Poly_CoherentTriangulation.AddTriangle (method)
  AddTriangle(iNode0: number, iNode1: number, iNode2: number): Poly_CoherentTriangle;

  // Poly_CoherentTriangulation.ReplaceNodes (method)
  ReplaceNodes(theTriangle: Poly_CoherentTriangle, iNode0: number, iNode1: number, iNode2: number): boolean;

  // Poly_CoherentTriangulation.AddLink (method)
  AddLink(theTri: Poly_CoherentTriangle, theConn: number): Poly_CoherentLink;

  // Poly_CoherentTriangulation.FindTriangle (method)
  FindTriangle(theLink: Poly_CoherentLink, pTri: [Poly_CoherentTriangle, Poly_CoherentTriangle]): boolean;

  // Poly_CoherentTriangulation.ComputeLinks (method)
  ComputeLinks(): number;

  // Poly_CoherentTriangulation.ClearLinks (method)
  ClearLinks(): void;

  // Poly_CoherentTriangulation.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // Poly_CoherentTriangulation.Clone (method)
  Clone(theAlloc: NCollection_BaseAllocator): Poly_CoherentTriangulation;

  // Poly_CoherentTriangulation.get_type_name (method)
  static get_type_name(): string;

  // Poly_CoherentTriangulation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_CoherentTriangulation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_CoherentTriangulation.delete (method)
  delete(): void;

  // Poly_CoherentTriangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfLink: declare class Poly_CoherentTriangulation_IteratorOfLink

  // Poly_CoherentTriangulation_IteratorOfLink.constructor (constructor)
  constructor(theTri: Poly_CoherentTriangulation);

  // Poly_CoherentTriangulation_IteratorOfLink.Next (method)
  Next(): void;

  // Poly_CoherentTriangulation_IteratorOfLink.delete (method)
  delete(): void;

  // Poly_CoherentTriangulation_IteratorOfLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfNode: declare class Poly_CoherentTriangulation_IteratorOfNode

  // Poly_CoherentTriangulation_IteratorOfNode.constructor (constructor)
  constructor(theTri: Poly_CoherentTriangulation);

  // Poly_CoherentTriangulation_IteratorOfNode.Next (method)
  Next(): void;

  // Poly_CoherentTriangulation_IteratorOfNode.delete (method)
  delete(): void;

  // Poly_CoherentTriangulation_IteratorOfNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfTriangle: declare class Poly_CoherentTriangulation_IteratorOfTriangle

  // Poly_CoherentTriangulation_IteratorOfTriangle.constructor (constructor)
  constructor(theTri: Poly_CoherentTriangulation);

  // Poly_CoherentTriangulation_IteratorOfTriangle.Next (method)
  Next(): void;

  // Poly_CoherentTriangulation_IteratorOfTriangle.delete (method)
  delete(): void;

  // Poly_CoherentTriangulation_IteratorOfTriangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_Connect: declare class Poly_Connect

  // Poly_Connect.constructor (constructor)
  constructor();
  constructor(theTriangulation: Poly_Triangulation);

  // Poly_Connect.Load (method)
  Load(theTriangulation: Poly_Triangulation): void;

  // Poly_Connect.Triangulation (method)
  Triangulation(): Poly_Triangulation;

  // Poly_Connect.Triangle (method)
  Triangle(N: number): number;

  // Poly_Connect.Triangles (method)
  Triangles(T: number, t1?: number, t2?: number, t3?: number): { t1: number; t2: number; t3: number };

  // Poly_Connect.Nodes (method)
  Nodes(T: number, n1?: number, n2?: number, n3?: number): { n1: number; n2: number; n3: number };

  // Poly_Connect.Initialize (method)
  Initialize(N: number): void;

  // Poly_Connect.More (method)
  More(): boolean;

  // Poly_Connect.Next (method)
  Next(): void;

  // Poly_Connect.Value (method)
  Value(): number;

  // Poly_Connect.delete (method)
  delete(): void;

  // Poly_Connect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops: declare class Poly_MakeLoops

  // Poly_MakeLoops.Reset (method)
  Reset(theHelper: Poly_MakeLoops_Helper, theAlloc?: NCollection_BaseAllocator): void;

  // Poly_MakeLoops.AddLink (method)
  AddLink(theLink: Poly_MakeLoops_Link): void;

  // Poly_MakeLoops.ReplaceLink (method)
  ReplaceLink(theLink: Poly_MakeLoops_Link, theNewLink: Poly_MakeLoops_Link): void;

  // Poly_MakeLoops.SetLinkOrientation (method)
  SetLinkOrientation(theLink: Poly_MakeLoops_Link, theOrient: Poly_MakeLoops_LinkFlag): Poly_MakeLoops_LinkFlag;

  // Poly_MakeLoops.FindLink (method)
  FindLink(theLink: Poly_MakeLoops_Link): Poly_MakeLoops_Link;

  // Poly_MakeLoops.Perform (method)
  Perform(): number;

  // Poly_MakeLoops.GetNbLoops (method)
  GetNbLoops(): number;

  // Poly_MakeLoops.GetLoop (method)
  GetLoop(theIndex: number): any;

  // Poly_MakeLoops.GetNbHanging (method)
  GetNbHanging(): number;

  // Poly_MakeLoops.GetHangingLinks (method)
  GetHangingLinks(theLinks: any): void;

  // Poly_MakeLoops.delete (method)
  delete(): void;

  // Poly_MakeLoops.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops_LinkFlag: typeof Poly_MakeLoops_LinkFlag[keyof typeof Poly_MakeLoops_LinkFlag]

  readonly LF_None: 'LF_None'

  readonly LF_Fwd: 'LF_Fwd'

  readonly LF_Rev: 'LF_Rev'

  readonly LF_Both: 'LF_Both'

  readonly LF_Reversed: 'LF_Reversed'

Poly_MakeLoops_ResultCode: typeof Poly_MakeLoops_ResultCode[keyof typeof Poly_MakeLoops_ResultCode]

  readonly RC_LoopsDone: 'RC_LoopsDone'

  readonly RC_HangingLinks: 'RC_HangingLinks'

  readonly RC_Failure: 'RC_Failure'

Poly_MakeLoops2D_Helper: declare class Poly_MakeLoops2D_Helper extends Poly_MakeLoops_Helper

  // Poly_MakeLoops2D_Helper.GetFirstTangent (method)
  GetFirstTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir2d): boolean;

  // Poly_MakeLoops2D_Helper.GetLastTangent (method)
  GetLastTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir2d): boolean;

  // Poly_MakeLoops2D_Helper.delete (method)
  delete(): void;

  // Poly_MakeLoops2D_Helper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops3D_Helper: declare class Poly_MakeLoops3D_Helper extends Poly_MakeLoops_Helper

  // Poly_MakeLoops3D_Helper.GetFirstTangent (method)
  GetFirstTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir): boolean;

  // Poly_MakeLoops3D_Helper.GetLastTangent (method)
  GetLastTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir): boolean;

  // Poly_MakeLoops3D_Helper.GetNormal (method)
  GetNormal(theNode: number, theDir: gp_Dir): boolean;

  // Poly_MakeLoops3D_Helper.delete (method)
  delete(): void;

  // Poly_MakeLoops3D_Helper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops_Hasher: declare class Poly_MakeLoops_Hasher

  // Poly_MakeLoops_Hasher.constructor (constructor)
  constructor();

  // Poly_MakeLoops_Hasher.delete (method)
  delete(): void;

  // Poly_MakeLoops_Hasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops_HeapOfInteger: declare class Poly_MakeLoops_HeapOfInteger

  // Poly_MakeLoops_HeapOfInteger.constructor (constructor)
  constructor(theNbPreAllocated?: number);

  // Poly_MakeLoops_HeapOfInteger.Clear (method)
  Clear(): void;

  // Poly_MakeLoops_HeapOfInteger.Add (method)
  Add(theValue: number): void;

  // Poly_MakeLoops_HeapOfInteger.Top (method)
  Top(): number;

  // Poly_MakeLoops_HeapOfInteger.Contains (method)
  Contains(theValue: number): boolean;

  // Poly_MakeLoops_HeapOfInteger.Remove (method)
  Remove(theValue: number): void;

  // Poly_MakeLoops_HeapOfInteger.IsEmpty (method)
  IsEmpty(): boolean;

  // Poly_MakeLoops_HeapOfInteger.delete (method)
  delete(): void;

  // Poly_MakeLoops_HeapOfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops_Helper: declare class Poly_MakeLoops_Helper

  // Poly_MakeLoops_Helper.GetAdjacentLinks (method)
  GetAdjacentLinks(theNode: number): any;

  // Poly_MakeLoops_Helper.OnAddLink (method)
  OnAddLink(argNo0: number, argNo1: Poly_MakeLoops_Link): void;

  // Poly_MakeLoops_Helper.delete (method)
  delete(): void;

  // Poly_MakeLoops_Helper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MakeLoops_Link: declare class Poly_MakeLoops_Link

  // Poly_MakeLoops_Link.constructor (constructor)
  constructor();
  constructor(theNode1: number, theNode2: number);

  node1: number

  node2: number

  flags: number

  // Poly_MakeLoops_Link.Reverse (method)
  Reverse(): void;

  // Poly_MakeLoops_Link.IsReversed (method)
  IsReversed(): boolean;

  // Poly_MakeLoops_Link.Nullify (method)
  Nullify(): void;

  // Poly_MakeLoops_Link.IsNull (method)
  IsNull(): boolean;

  // Poly_MakeLoops_Link.delete (method)
  delete(): void;

  // Poly_MakeLoops_Link.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_MergeNodesTool: declare class Poly_MergeNodesTool extends Standard_Transient

  // Poly_MergeNodesTool.constructor (constructor)
  constructor(theSmoothAngle: number, theMergeTolerance?: number, theNbFacets?: number);

  // Poly_MergeNodesTool.get_type_name (method)
  static get_type_name(): string;

  // Poly_MergeNodesTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_MergeNodesTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_MergeNodesTool.MergeNodes (method)
  static MergeNodes(theTris: Poly_Triangulation, theTrsf: gp_Trsf, theToReverse: boolean, theSmoothAngle: number, theMergeTolerance?: number, theToForce?: boolean): Poly_Triangulation;

  // Poly_MergeNodesTool.MergeTolerance (method)
  MergeTolerance(): number;

  // Poly_MergeNodesTool.SetMergeTolerance (method)
  SetMergeTolerance(theTolerance: number): void;

  // Poly_MergeNodesTool.MergeAngle (method)
  MergeAngle(): number;

  // Poly_MergeNodesTool.SetMergeAngle (method)
  SetMergeAngle(theAngleRad: number): void;

  // Poly_MergeNodesTool.ToMergeOpposite (method)
  ToMergeOpposite(): boolean;

  // Poly_MergeNodesTool.SetMergeOpposite (method)
  SetMergeOpposite(theToMerge: boolean): void;

  // Poly_MergeNodesTool.SetUnitFactor (method)
  SetUnitFactor(theUnitFactor: number): void;

  // Poly_MergeNodesTool.ToDropDegenerative (method)
  ToDropDegenerative(): boolean;

  // Poly_MergeNodesTool.SetDropDegenerative (method)
  SetDropDegenerative(theToDrop: boolean): void;

  // Poly_MergeNodesTool.ToMergeElems (method)
  ToMergeElems(): boolean;

  // Poly_MergeNodesTool.SetMergeElems (method)
  SetMergeElems(theToMerge: boolean): void;

  // Poly_MergeNodesTool.computeTriNormal (method)
  computeTriNormal(): [number, number, number];

  // Poly_MergeNodesTool.AddTriangulation (method)
  AddTriangulation(theTris: Poly_Triangulation, theTrsf?: gp_Trsf, theToReverse?: boolean): void;

  // Poly_MergeNodesTool.Result (method)
  Result(): Poly_Triangulation;

  // Poly_MergeNodesTool.AddTriangle (method)
  AddTriangle(theElemNodes: [gp_XYZ, gp_XYZ, gp_XYZ]): void;

  // Poly_MergeNodesTool.AddQuad (method)
  AddQuad(theElemNodes: [gp_XYZ, gp_XYZ, gp_XYZ, gp_XYZ]): void;

  // Poly_MergeNodesTool.AddElement (method)
  AddElement(theElemNodes: gp_XYZ, theNbNodes: number): void;

  // Poly_MergeNodesTool.ChangeElementNode (method)
  ChangeElementNode(theIndex: number): gp_XYZ;

  // Poly_MergeNodesTool.PushLastElement (method)
  PushLastElement(theNbNodes: number): void;

  // Poly_MergeNodesTool.PushLastTriangle (method)
  PushLastTriangle(): void;

  // Poly_MergeNodesTool.PushLastQuad (method)
  PushLastQuad(): void;

  // Poly_MergeNodesTool.ElementNodeIndex (method)
  ElementNodeIndex(theIndex: number): number;

  // Poly_MergeNodesTool.NbNodes (method)
  NbNodes(): number;

  // Poly_MergeNodesTool.NbElements (method)
  NbElements(): number;

  // Poly_MergeNodesTool.NbDegenerativeElems (method)
  NbDegenerativeElems(): number;

  // Poly_MergeNodesTool.NbMergedElems (method)
  NbMergedElems(): number;

  // Poly_MergeNodesTool.ChangeOutput (method)
  ChangeOutput(): Poly_Triangulation;

  // Poly_MergeNodesTool.delete (method)
  delete(): void;

  // Poly_MergeNodesTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_Polygon2D: declare class Poly_Polygon2D extends Standard_Transient

  // Poly_Polygon2D.constructor (constructor)
  constructor(theNbNodes: number);
  constructor(Nodes: NCollection_Array1_gp_Pnt2d);

  // Poly_Polygon2D.Copy (method)
  Copy(): Poly_Polygon2D;

  // Poly_Polygon2D.Deflection (method)
  Deflection(): number;
  Deflection(theDefl: number): void;

  // Poly_Polygon2D.NbNodes (method)
  NbNodes(): number;

  // Poly_Polygon2D.Nodes (method)
  Nodes(): NCollection_Array1_gp_Pnt2d;

  // Poly_Polygon2D.ChangeNodes (method)
  ChangeNodes(): NCollection_Array1_gp_Pnt2d;

  // Poly_Polygon2D.get_type_name (method)
  static get_type_name(): string;

  // Poly_Polygon2D.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_Polygon2D.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_Polygon2D.delete (method)
  delete(): void;

  // Poly_Polygon2D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_Polygon3D: declare class Poly_Polygon3D extends Standard_Transient

  // Poly_Polygon3D.constructor (constructor)
  constructor(Nodes: NCollection_Array1_gp_Pnt);
  constructor(theNbNodes: number, theHasParams: boolean);
  constructor(Nodes: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double);

  // Poly_Polygon3D.Copy (method)
  Copy(): Poly_Polygon3D;

  // Poly_Polygon3D.Deflection (method)
  Deflection(): number;
  Deflection(theDefl: number): void;

  // Poly_Polygon3D.NbNodes (method)
  NbNodes(): number;

  // Poly_Polygon3D.Nodes (method)
  Nodes(): NCollection_Array1_gp_Pnt;

  // Poly_Polygon3D.ChangeNodes (method)
  ChangeNodes(): NCollection_Array1_gp_Pnt;

  // Poly_Polygon3D.HasParameters (method)
  HasParameters(): boolean;

  // Poly_Polygon3D.Parameters (method)
  Parameters(): NCollection_Array1_double;

  // Poly_Polygon3D.ChangeParameters (method)
  ChangeParameters(): NCollection_Array1_double;

  // Poly_Polygon3D.get_type_name (method)
  static get_type_name(): string;

  // Poly_Polygon3D.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_Polygon3D.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_Polygon3D.delete (method)
  delete(): void;

  // Poly_Polygon3D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_PolygonOnTriangulation: declare class Poly_PolygonOnTriangulation extends Standard_Transient

  // Poly_PolygonOnTriangulation.constructor (constructor)
  constructor(Nodes: NCollection_Array1_int);
  constructor(theNbNodes: number, theHasParams: boolean);
  constructor(Nodes: NCollection_Array1_int, Parameters: NCollection_Array1_double);

  // Poly_PolygonOnTriangulation.get_type_name (method)
  static get_type_name(): string;

  // Poly_PolygonOnTriangulation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_PolygonOnTriangulation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_PolygonOnTriangulation.Copy (method)
  Copy(): Poly_PolygonOnTriangulation;

  // Poly_PolygonOnTriangulation.Deflection (method)
  Deflection(): number;
  Deflection(theDefl: number): void;

  // Poly_PolygonOnTriangulation.NbNodes (method)
  NbNodes(): number;

  // Poly_PolygonOnTriangulation.Node (method)
  Node(theIndex: number): number;

  // Poly_PolygonOnTriangulation.ChangeNodeArray (method)
  ChangeNodeArray(): NCollection_Array1_int;

  // Poly_PolygonOnTriangulation.SetNode (method)
  SetNode(theIndex: number, theNode: number): void;

  // Poly_PolygonOnTriangulation.HasParameters (method)
  HasParameters(): boolean;

  // Poly_PolygonOnTriangulation.Parameter (method)
  Parameter(theIndex: number): number;

  // Poly_PolygonOnTriangulation.SetParameter (method)
  SetParameter(theIndex: number, theValue: number): void;

  // Poly_PolygonOnTriangulation.ChangeParameterArray (method)
  ChangeParameterArray(): NCollection_Array1_double;

  // Poly_PolygonOnTriangulation.SetParameters (method)
  SetParameters(theParameters: NCollection_HArray1_double): void;

  // Poly_PolygonOnTriangulation.Nodes (method)
  Nodes(): NCollection_Array1_int;

  // Poly_PolygonOnTriangulation.Parameters (method)
  Parameters(): NCollection_HArray1_double;

  // DEPRECATED
  // Poly_PolygonOnTriangulation.ChangeNodes (method)
  ChangeNodes(): NCollection_Array1_int;

  // DEPRECATED
  // Poly_PolygonOnTriangulation.ChangeParameters (method)
  ChangeParameters(): NCollection_Array1_double;

  // Poly_PolygonOnTriangulation.delete (method)
  delete(): void;

  // Poly_PolygonOnTriangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_Triangle: declare class Poly_Triangle

  // Poly_Triangle.constructor (constructor)
  constructor();
  constructor(theN1: number, theN2: number, theN3: number);

  // Poly_Triangle.Set (method)
  Set(theN1: number, theN2: number, theN3: number): void;
  Set(theIndex: number, theNode: number): void;

  // Poly_Triangle.Get (method)
  Get(theN1?: number, theN2?: number, theN3?: number): { theN1: number; theN2: number; theN3: number };

  // Poly_Triangle.Value (method)
  Value(theIndex: number): number;

  // Poly_Triangle.ChangeValue (method)
  ChangeValue(theIndex: number): number;

  // Poly_Triangle.delete (method)
  delete(): void;

  // Poly_Triangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_Triangulation: declare class Poly_Triangulation extends Standard_Transient

  // Poly_Triangulation.constructor (constructor)
  constructor();
  constructor(theTriangulation: Poly_Triangulation);
  constructor(Nodes: NCollection_Array1_gp_Pnt, Triangles: NCollection_Array1_Poly_Triangle);
  constructor(Nodes: NCollection_Array1_gp_Pnt, UVNodes: NCollection_Array1_gp_Pnt2d, Triangles: NCollection_Array1_Poly_Triangle);
  constructor(theNbNodes: number, theNbTriangles: number, theHasUVNodes: boolean, theHasNormals?: boolean);

  // Poly_Triangulation.get_type_name (method)
  static get_type_name(): string;

  // Poly_Triangulation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_Triangulation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_Triangulation.Copy (method)
  Copy(): Poly_Triangulation;

  // Poly_Triangulation.Deflection (method)
  Deflection(): number;
  Deflection(theDeflection: number): void;

  // Poly_Triangulation.Parameters (method)
  Parameters(): Poly_TriangulationParameters;
  Parameters(theParams: Poly_TriangulationParameters): void;

  // Poly_Triangulation.Clear (method)
  Clear(): void;

  // Poly_Triangulation.HasGeometry (method)
  HasGeometry(): boolean;

  // Poly_Triangulation.NbNodes (method)
  NbNodes(): number;

  // Poly_Triangulation.NbTriangles (method)
  NbTriangles(): number;

  // Poly_Triangulation.HasUVNodes (method)
  HasUVNodes(): boolean;

  // Poly_Triangulation.HasNormals (method)
  HasNormals(): boolean;

  // Poly_Triangulation.Node (method)
  Node(theIndex: number): gp_Pnt;

  // Poly_Triangulation.SetNode (method)
  SetNode(theIndex: number, thePnt: gp_Pnt): void;

  // Poly_Triangulation.UVNode (method)
  UVNode(theIndex: number): gp_Pnt2d;

  // Poly_Triangulation.SetUVNode (method)
  SetUVNode(theIndex: number, thePnt: gp_Pnt2d): void;

  // Poly_Triangulation.Triangle (method)
  Triangle(theIndex: number): Poly_Triangle;

  // Poly_Triangulation.SetTriangle (method)
  SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;

  // Poly_Triangulation.Normal (method)
  Normal(theIndex: number): gp_Dir;

  // Poly_Triangulation.SetNormal (method)
  SetNormal(theIndex: number, theNormal: gp_Dir): void;

  // Poly_Triangulation.MeshPurpose (method)
  MeshPurpose(): number;

  // Poly_Triangulation.SetMeshPurpose (method)
  SetMeshPurpose(thePurpose: number): void;

  // Poly_Triangulation.CachedMinMax (method)
  CachedMinMax(): Bnd_Box;

  // Poly_Triangulation.SetCachedMinMax (method)
  SetCachedMinMax(theBox: Bnd_Box): void;

  // Poly_Triangulation.HasCachedMinMax (method)
  HasCachedMinMax(): boolean;

  // Poly_Triangulation.UpdateCachedMinMax (method)
  UpdateCachedMinMax(): void;

  // Poly_Triangulation.MinMax (method)
  MinMax(theBox: Bnd_Box, theTrsf: gp_Trsf, theIsAccurate: boolean): boolean;

  // Poly_Triangulation.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // Poly_Triangulation.SetDoublePrecision (method)
  SetDoublePrecision(theIsDouble: boolean): void;

  // Poly_Triangulation.ResizeNodes (method)
  ResizeNodes(theNbNodes: number, theToCopyOld: boolean): void;

  // Poly_Triangulation.ResizeTriangles (method)
  ResizeTriangles(theNbTriangles: number, theToCopyOld: boolean): void;

  // Poly_Triangulation.AddUVNodes (method)
  AddUVNodes(): void;

  // Poly_Triangulation.RemoveUVNodes (method)
  RemoveUVNodes(): void;

  // Poly_Triangulation.AddNormals (method)
  AddNormals(): void;

  // Poly_Triangulation.RemoveNormals (method)
  RemoveNormals(): void;

  // Poly_Triangulation.ComputeNormals (method)
  ComputeNormals(): void;

  // Poly_Triangulation.MapNodeArray (method)
  MapNodeArray(): NCollection_HArray1_gp_Pnt;

  // Poly_Triangulation.MapTriangleArray (method)
  MapTriangleArray(): NCollection_HArray1_Poly_Triangle;

  // Poly_Triangulation.MapUVNodeArray (method)
  MapUVNodeArray(): NCollection_HArray1_gp_Pnt2d;

  // Poly_Triangulation.MapNormalArray (method)
  MapNormalArray(): NCollection_HArray1_float;

  // Poly_Triangulation.InternalTriangles (method)
  InternalTriangles(): NCollection_Array1_Poly_Triangle;

  // Poly_Triangulation.InternalNodes (method)
  InternalNodes(): Poly_ArrayOfNodes;

  // Poly_Triangulation.InternalUVNodes (method)
  InternalUVNodes(): Poly_ArrayOfUVNodes;

  // Poly_Triangulation.InternalNormals (method)
  InternalNormals(): NCollection_Array1_NCollection_Vec3_float;

  // DEPRECATED
  // Poly_Triangulation.SetNormals (method)
  SetNormals(theNormals: NCollection_HArray1_float): void;

  // DEPRECATED
  // Poly_Triangulation.Triangles (method)
  Triangles(): NCollection_Array1_Poly_Triangle;

  // DEPRECATED
  // Poly_Triangulation.ChangeTriangles (method)
  ChangeTriangles(): NCollection_Array1_Poly_Triangle;

  // DEPRECATED
  // Poly_Triangulation.ChangeTriangle (method)
  ChangeTriangle(theIndex: number): Poly_Triangle;

  // Poly_Triangulation.NbDeferredNodes (method)
  NbDeferredNodes(): number;

  // Poly_Triangulation.NbDeferredTriangles (method)
  NbDeferredTriangles(): number;

  // Poly_Triangulation.HasDeferredData (method)
  HasDeferredData(): boolean;

  // Poly_Triangulation.UnloadDeferredData (method)
  UnloadDeferredData(): boolean;

  // Poly_Triangulation.delete (method)
  delete(): void;

  // Poly_Triangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_TriangulationParameters: declare class Poly_TriangulationParameters extends Standard_Transient

  // Poly_TriangulationParameters.constructor (constructor)
  constructor(theDeflection?: number, theAngle?: number, theMinSize?: number);

  // Poly_TriangulationParameters.Copy (method)
  Copy(): Poly_TriangulationParameters;

  // Poly_TriangulationParameters.HasDeflection (method)
  HasDeflection(): boolean;

  // Poly_TriangulationParameters.HasAngle (method)
  HasAngle(): boolean;

  // Poly_TriangulationParameters.HasMinSize (method)
  HasMinSize(): boolean;

  // Poly_TriangulationParameters.Deflection (method)
  Deflection(): number;

  // Poly_TriangulationParameters.Angle (method)
  Angle(): number;

  // Poly_TriangulationParameters.MinSize (method)
  MinSize(): number;

  // Poly_TriangulationParameters.get_type_name (method)
  static get_type_name(): string;

  // Poly_TriangulationParameters.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Poly_TriangulationParameters.DynamicType (method)
  DynamicType(): Standard_Type;

  // Poly_TriangulationParameters.delete (method)
  delete(): void;

  // Poly_TriangulationParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Poly_CoherentTriangulation_TwoIntegers: interface Poly_CoherentTriangulation_TwoIntegers

  myValue: [number, number]

Poly_Array1OfTriangle: NCollection_Array1_Poly_Triangle

Poly_HArray1OfTriangle: NCollection_HArray1_Poly_Triangle

Poly_ListOfTriangulation: NCollection_List_handle_Poly_Triangulation
