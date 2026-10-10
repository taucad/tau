# libcascade — MAT

14 top-level symbols. Signatures are verbatim typescript.

MAT_Arc: declare class MAT_Arc extends Standard_Transient

  // MAT_Arc.constructor (constructor)
  constructor(ArcIndex: number, GeomIndex: number, FirstElement: MAT_BasicElt, SecondElement: MAT_BasicElt);

  // MAT_Arc.Index (method)
  Index(): number;

  // MAT_Arc.GeomIndex (method)
  GeomIndex(): number;

  // MAT_Arc.FirstElement (method)
  FirstElement(): MAT_BasicElt;

  // MAT_Arc.SecondElement (method)
  SecondElement(): MAT_BasicElt;

  // MAT_Arc.FirstNode (method)
  FirstNode(): MAT_Node;

  // MAT_Arc.SecondNode (method)
  SecondNode(): MAT_Node;

  // MAT_Arc.TheOtherNode (method)
  TheOtherNode(aNode: MAT_Node): MAT_Node;

  // MAT_Arc.HasNeighbour (method)
  HasNeighbour(aNode: MAT_Node, aSide: MAT_Side): boolean;

  // MAT_Arc.Neighbour (method)
  Neighbour(aNode: MAT_Node, aSide: MAT_Side): MAT_Arc;

  // MAT_Arc.SetIndex (method)
  SetIndex(anInteger: number): void;

  // MAT_Arc.SetGeomIndex (method)
  SetGeomIndex(anInteger: number): void;

  // MAT_Arc.SetFirstElement (method)
  SetFirstElement(aBasicElt: MAT_BasicElt): void;

  // MAT_Arc.SetSecondElement (method)
  SetSecondElement(aBasicElt: MAT_BasicElt): void;

  // MAT_Arc.SetFirstNode (method)
  SetFirstNode(aNode: MAT_Node): void;

  // MAT_Arc.SetSecondNode (method)
  SetSecondNode(aNode: MAT_Node): void;

  // MAT_Arc.SetFirstArc (method)
  SetFirstArc(aSide: MAT_Side, anArc: MAT_Arc): void;

  // MAT_Arc.SetSecondArc (method)
  SetSecondArc(aSide: MAT_Side, anArc: MAT_Arc): void;

  // MAT_Arc.SetNeighbour (method)
  SetNeighbour(aSide: MAT_Side, aNode: MAT_Node, anArc: MAT_Arc): void;

  // MAT_Arc.get_type_name (method)
  static get_type_name(): string;

  // MAT_Arc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_Arc.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_Arc.delete (method)
  delete(): void;

  // MAT_Arc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_BasicElt: declare class MAT_BasicElt extends Standard_Transient

  // MAT_BasicElt.constructor (constructor)
  constructor(anInteger: number);

  // MAT_BasicElt.StartArc (method)
  StartArc(): MAT_Arc;

  // MAT_BasicElt.EndArc (method)
  EndArc(): MAT_Arc;

  // MAT_BasicElt.Index (method)
  Index(): number;

  // MAT_BasicElt.GeomIndex (method)
  GeomIndex(): number;

  // MAT_BasicElt.SetStartArc (method)
  SetStartArc(anArc: MAT_Arc): void;

  // MAT_BasicElt.SetEndArc (method)
  SetEndArc(anArc: MAT_Arc): void;

  // MAT_BasicElt.SetIndex (method)
  SetIndex(anInteger: number): void;

  // MAT_BasicElt.SetGeomIndex (method)
  SetGeomIndex(anInteger: number): void;

  // MAT_BasicElt.get_type_name (method)
  static get_type_name(): string;

  // MAT_BasicElt.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_BasicElt.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_BasicElt.delete (method)
  delete(): void;

  // MAT_BasicElt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_Bisector: declare class MAT_Bisector extends Standard_Transient

  // MAT_Bisector.constructor (constructor)
  constructor();

  // MAT_Bisector.AddBisector (method)
  AddBisector(abisector: MAT_Bisector): void;

  // MAT_Bisector.List (method)
  List(): MAT_ListOfBisector;

  // MAT_Bisector.FirstBisector (method)
  FirstBisector(): MAT_Bisector;

  // MAT_Bisector.LastBisector (method)
  LastBisector(): MAT_Bisector;

  // MAT_Bisector.BisectorNumber (method)
  BisectorNumber(anumber: number): void;
  BisectorNumber(): number;

  // MAT_Bisector.IndexNumber (method)
  IndexNumber(anumber: number): void;
  IndexNumber(): number;

  // MAT_Bisector.FirstEdge (method)
  FirstEdge(anedge: MAT_Edge): void;
  FirstEdge(): MAT_Edge;

  // MAT_Bisector.SecondEdge (method)
  SecondEdge(anedge: MAT_Edge): void;
  SecondEdge(): MAT_Edge;

  // MAT_Bisector.IssuePoint (method)
  IssuePoint(apoint: number): void;
  IssuePoint(): number;

  // MAT_Bisector.EndPoint (method)
  EndPoint(apoint: number): void;
  EndPoint(): number;

  // MAT_Bisector.DistIssuePoint (method)
  DistIssuePoint(areal: number): void;
  DistIssuePoint(): number;

  // MAT_Bisector.FirstVector (method)
  FirstVector(avector: number): void;
  FirstVector(): number;

  // MAT_Bisector.SecondVector (method)
  SecondVector(avector: number): void;
  SecondVector(): number;

  // MAT_Bisector.Sense (method)
  Sense(asense: number): void;
  Sense(): number;

  // MAT_Bisector.FirstParameter (method)
  FirstParameter(aparameter: number): void;
  FirstParameter(): number;

  // MAT_Bisector.SecondParameter (method)
  SecondParameter(aparameter: number): void;
  SecondParameter(): number;

  // MAT_Bisector.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // MAT_Bisector.get_type_name (method)
  static get_type_name(): string;

  // MAT_Bisector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_Bisector.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_Bisector.delete (method)
  delete(): void;

  // MAT_Bisector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_Edge: declare class MAT_Edge extends Standard_Transient

  // MAT_Edge.constructor (constructor)
  constructor();

  // MAT_Edge.EdgeNumber (method)
  EdgeNumber(anumber: number): void;
  EdgeNumber(): number;

  // MAT_Edge.FirstBisector (method)
  FirstBisector(abisector: MAT_Bisector): void;
  FirstBisector(): MAT_Bisector;

  // MAT_Edge.SecondBisector (method)
  SecondBisector(abisector: MAT_Bisector): void;
  SecondBisector(): MAT_Bisector;

  // MAT_Edge.Distance (method)
  Distance(adistance: number): void;
  Distance(): number;

  // MAT_Edge.IntersectionPoint (method)
  IntersectionPoint(apoint: number): void;
  IntersectionPoint(): number;

  // MAT_Edge.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // MAT_Edge.get_type_name (method)
  static get_type_name(): string;

  // MAT_Edge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_Edge.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_Edge.delete (method)
  delete(): void;

  // MAT_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_Graph: declare class MAT_Graph extends Standard_Transient

  // MAT_Graph.constructor (constructor)
  constructor();

  // MAT_Graph.Perform (method)
  Perform(SemiInfinite: boolean, TheRoots: MAT_ListOfBisector, NbBasicElts: number, NbArcs: number): void;

  // MAT_Graph.Arc (method)
  Arc(Index: number): MAT_Arc;

  // MAT_Graph.BasicElt (method)
  BasicElt(Index: number): MAT_BasicElt;

  // MAT_Graph.Node (method)
  Node(Index: number): MAT_Node;

  // MAT_Graph.NumberOfArcs (method)
  NumberOfArcs(): number;

  // MAT_Graph.NumberOfNodes (method)
  NumberOfNodes(): number;

  // MAT_Graph.NumberOfBasicElts (method)
  NumberOfBasicElts(): number;

  // MAT_Graph.NumberOfInfiniteNodes (method)
  NumberOfInfiniteNodes(): number;

  // MAT_Graph.FusionOfBasicElts (method)
  FusionOfBasicElts(IndexElt1: number, IndexElt2: number, MergeArc1?: boolean, GeomIndexArc1?: number, GeomIndexArc2?: number, MergeArc2?: boolean, GeomIndexArc3?: number, GeomIndexArc4?: number): { MergeArc1: boolean; GeomIndexArc1: number; GeomIndexArc2: number; MergeArc2: boolean; GeomIndexArc3: number; GeomIndexArc4: number };

  // MAT_Graph.CompactArcs (method)
  CompactArcs(): void;

  // MAT_Graph.CompactNodes (method)
  CompactNodes(): void;

  // MAT_Graph.ChangeBasicElts (method)
  ChangeBasicElts(NewMap: NCollection_DataMap_int_handle_MAT_BasicElt): void;

  // MAT_Graph.ChangeBasicElt (method)
  ChangeBasicElt(Index: number): MAT_BasicElt;

  // MAT_Graph.get_type_name (method)
  static get_type_name(): string;

  // MAT_Graph.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_Graph.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_Graph.delete (method)
  delete(): void;

  // MAT_Graph.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_ListOfBisector: declare class MAT_ListOfBisector extends Standard_Transient

  // MAT_ListOfBisector.constructor (constructor)
  constructor();

  // MAT_ListOfBisector.First (method)
  First(): void;

  // MAT_ListOfBisector.Last (method)
  Last(): void;

  // MAT_ListOfBisector.Init (method)
  Init(aniten: MAT_Bisector): void;

  // MAT_ListOfBisector.Next (method)
  Next(): void;

  // MAT_ListOfBisector.Previous (method)
  Previous(): void;

  // MAT_ListOfBisector.More (method)
  More(): boolean;

  // MAT_ListOfBisector.Current (method)
  Current(): MAT_Bisector;
  Current(anitem: MAT_Bisector): void;

  // MAT_ListOfBisector.FirstItem (method)
  FirstItem(): MAT_Bisector;

  // MAT_ListOfBisector.LastItem (method)
  LastItem(): MAT_Bisector;

  // MAT_ListOfBisector.PreviousItem (method)
  PreviousItem(): MAT_Bisector;

  // MAT_ListOfBisector.NextItem (method)
  NextItem(): MAT_Bisector;

  // MAT_ListOfBisector.Number (method)
  Number(): number;

  // MAT_ListOfBisector.Index (method)
  Index(): number;

  // MAT_ListOfBisector.Brackets (method)
  Brackets(anindex: number): MAT_Bisector;

  // MAT_ListOfBisector.Unlink (method)
  Unlink(): void;

  // MAT_ListOfBisector.LinkBefore (method)
  LinkBefore(anitem: MAT_Bisector): void;

  // MAT_ListOfBisector.LinkAfter (method)
  LinkAfter(anitem: MAT_Bisector): void;

  // MAT_ListOfBisector.FrontAdd (method)
  FrontAdd(anitem: MAT_Bisector): void;

  // MAT_ListOfBisector.BackAdd (method)
  BackAdd(anitem: MAT_Bisector): void;

  // MAT_ListOfBisector.Permute (method)
  Permute(): void;

  // MAT_ListOfBisector.Loop (method)
  Loop(): void;

  // MAT_ListOfBisector.IsEmpty (method)
  IsEmpty(): boolean;

  // MAT_ListOfBisector.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // MAT_ListOfBisector.get_type_name (method)
  static get_type_name(): string;

  // MAT_ListOfBisector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_ListOfBisector.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_ListOfBisector.delete (method)
  delete(): void;

  // MAT_ListOfBisector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_ListOfEdge: declare class MAT_ListOfEdge extends Standard_Transient

  // MAT_ListOfEdge.constructor (constructor)
  constructor();

  // MAT_ListOfEdge.First (method)
  First(): void;

  // MAT_ListOfEdge.Last (method)
  Last(): void;

  // MAT_ListOfEdge.Init (method)
  Init(aniten: MAT_Edge): void;

  // MAT_ListOfEdge.Next (method)
  Next(): void;

  // MAT_ListOfEdge.Previous (method)
  Previous(): void;

  // MAT_ListOfEdge.More (method)
  More(): boolean;

  // MAT_ListOfEdge.Current (method)
  Current(): MAT_Edge;
  Current(anitem: MAT_Edge): void;

  // MAT_ListOfEdge.FirstItem (method)
  FirstItem(): MAT_Edge;

  // MAT_ListOfEdge.LastItem (method)
  LastItem(): MAT_Edge;

  // MAT_ListOfEdge.PreviousItem (method)
  PreviousItem(): MAT_Edge;

  // MAT_ListOfEdge.NextItem (method)
  NextItem(): MAT_Edge;

  // MAT_ListOfEdge.Number (method)
  Number(): number;

  // MAT_ListOfEdge.Index (method)
  Index(): number;

  // MAT_ListOfEdge.Brackets (method)
  Brackets(anindex: number): MAT_Edge;

  // MAT_ListOfEdge.Unlink (method)
  Unlink(): void;

  // MAT_ListOfEdge.LinkBefore (method)
  LinkBefore(anitem: MAT_Edge): void;

  // MAT_ListOfEdge.LinkAfter (method)
  LinkAfter(anitem: MAT_Edge): void;

  // MAT_ListOfEdge.FrontAdd (method)
  FrontAdd(anitem: MAT_Edge): void;

  // MAT_ListOfEdge.BackAdd (method)
  BackAdd(anitem: MAT_Edge): void;

  // MAT_ListOfEdge.Permute (method)
  Permute(): void;

  // MAT_ListOfEdge.Loop (method)
  Loop(): void;

  // MAT_ListOfEdge.IsEmpty (method)
  IsEmpty(): boolean;

  // MAT_ListOfEdge.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // MAT_ListOfEdge.get_type_name (method)
  static get_type_name(): string;

  // MAT_ListOfEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_ListOfEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_ListOfEdge.delete (method)
  delete(): void;

  // MAT_ListOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_Node: declare class MAT_Node extends Standard_Transient

  // MAT_Node.constructor (constructor)
  constructor(GeomIndex: number, LinkedArc: MAT_Arc, Distance: number);

  // MAT_Node.GeomIndex (method)
  GeomIndex(): number;

  // MAT_Node.Index (method)
  Index(): number;

  // MAT_Node.LinkedArcs (method)
  LinkedArcs(S: NCollection_Sequence_handle_MAT_Arc): void;

  // MAT_Node.NearElts (method)
  NearElts(S: NCollection_Sequence_handle_MAT_BasicElt): void;

  // MAT_Node.Distance (method)
  Distance(): number;

  // MAT_Node.PendingNode (method)
  PendingNode(): boolean;

  // MAT_Node.OnBasicElt (method)
  OnBasicElt(): boolean;

  // MAT_Node.Infinite (method)
  Infinite(): boolean;

  // MAT_Node.SetIndex (method)
  SetIndex(anIndex: number): void;

  // MAT_Node.SetLinkedArc (method)
  SetLinkedArc(anArc: MAT_Arc): void;

  // MAT_Node.get_type_name (method)
  static get_type_name(): string;

  // MAT_Node.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_Node.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_Node.delete (method)
  delete(): void;

  // MAT_Node.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_Side: typeof MAT_Side[keyof typeof MAT_Side]

  readonly MAT_Left: 'MAT_Left'

  readonly MAT_Right: 'MAT_Right'

MAT_TListNodeOfListOfBisector: declare class MAT_TListNodeOfListOfBisector extends Standard_Transient

  // MAT_TListNodeOfListOfBisector.constructor (constructor)
  constructor();
  constructor(anitem: MAT_Bisector);

  // MAT_TListNodeOfListOfBisector.GetItem (method)
  GetItem(): MAT_Bisector;

  // MAT_TListNodeOfListOfBisector.Next (method)
  Next(): MAT_TListNodeOfListOfBisector;
  Next(atlistnode: MAT_TListNodeOfListOfBisector): void;

  // MAT_TListNodeOfListOfBisector.Previous (method)
  Previous(): MAT_TListNodeOfListOfBisector;
  Previous(atlistnode: MAT_TListNodeOfListOfBisector): void;

  // MAT_TListNodeOfListOfBisector.SetItem (method)
  SetItem(anitem: MAT_Bisector): void;

  // MAT_TListNodeOfListOfBisector.Dummy (method)
  Dummy(): void;

  // MAT_TListNodeOfListOfBisector.get_type_name (method)
  static get_type_name(): string;

  // MAT_TListNodeOfListOfBisector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_TListNodeOfListOfBisector.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_TListNodeOfListOfBisector.delete (method)
  delete(): void;

  // MAT_TListNodeOfListOfBisector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_TListNodeOfListOfEdge: declare class MAT_TListNodeOfListOfEdge extends Standard_Transient

  // MAT_TListNodeOfListOfEdge.constructor (constructor)
  constructor();
  constructor(anitem: MAT_Edge);

  // MAT_TListNodeOfListOfEdge.GetItem (method)
  GetItem(): MAT_Edge;

  // MAT_TListNodeOfListOfEdge.Next (method)
  Next(): MAT_TListNodeOfListOfEdge;
  Next(atlistnode: MAT_TListNodeOfListOfEdge): void;

  // MAT_TListNodeOfListOfEdge.Previous (method)
  Previous(): MAT_TListNodeOfListOfEdge;
  Previous(atlistnode: MAT_TListNodeOfListOfEdge): void;

  // MAT_TListNodeOfListOfEdge.SetItem (method)
  SetItem(anitem: MAT_Edge): void;

  // MAT_TListNodeOfListOfEdge.Dummy (method)
  Dummy(): void;

  // MAT_TListNodeOfListOfEdge.get_type_name (method)
  static get_type_name(): string;

  // MAT_TListNodeOfListOfEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_TListNodeOfListOfEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_TListNodeOfListOfEdge.delete (method)
  delete(): void;

  // MAT_TListNodeOfListOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_Zone: declare class MAT_Zone extends Standard_Transient

  // MAT_Zone.constructor (constructor)
  constructor();
  constructor(aBasicElt: MAT_BasicElt);

  // MAT_Zone.Perform (method)
  Perform(aBasicElt: MAT_BasicElt): void;

  // MAT_Zone.NumberOfArcs (method)
  NumberOfArcs(): number;

  // MAT_Zone.ArcOnFrontier (method)
  ArcOnFrontier(Index: number): MAT_Arc;

  // MAT_Zone.NoEmptyZone (method)
  NoEmptyZone(): boolean;

  // MAT_Zone.Limited (method)
  Limited(): boolean;

  // MAT_Zone.get_type_name (method)
  static get_type_name(): string;

  // MAT_Zone.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // MAT_Zone.DynamicType (method)
  DynamicType(): Standard_Type;

  // MAT_Zone.delete (method)
  delete(): void;

  // MAT_Zone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MAT_SequenceOfArc: NCollection_Sequence_handle_MAT_Arc

MAT_SequenceOfBasicElt: NCollection_Sequence_handle_MAT_BasicElt
