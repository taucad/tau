# libcascade — MAT

14 top-level symbols. Signatures are verbatim typescript.

// An Arc is associated to each Bisecting of the mat
MAT_Arc: declare class MAT_Arc extends Standard_Transient

constructor

// Returns the index of <me> in Graph.theArcs
Index(): number;

// Returns the index associated of the geometric representation of <me>
GeomIndex(): number;

// Returns one of the BasicElt equidistant from <me>
FirstElement(): MAT_BasicElt;

// Returns the other BasicElt equidistant from <me>
SecondElement(): MAT_BasicElt;

// Returns one Node extremity of <me>
FirstNode(): MAT_Node;

// Returns the other Node extremity of <me>
SecondNode(): MAT_Node;

// An Arc has two Node, if <aNode> equals one Returns the other
TheOtherNode(aNode: MAT_Node): MAT_Node;

// Returns True if there is an arc linked to the Node <aNode> located on the side <aSide> of <me>
HasNeighbour(aNode: MAT_Node, aSide: MAT_Side): boolean;

// Returns the first arc linked to the Node <aNode> located on the side <aSide> of <me>
Neighbour(aNode: MAT_Node, aSide: MAT_Side): MAT_Arc;

SetIndex(anInteger: number): void;

SetGeomIndex(anInteger: number): void;

SetFirstElement(aBasicElt: MAT_BasicElt): void;

SetSecondElement(aBasicElt: MAT_BasicElt): void;

SetFirstNode(aNode: MAT_Node): void;

SetSecondNode(aNode: MAT_Node): void;

SetFirstArc(aSide: MAT_Side, anArc: MAT_Arc): void;

SetSecondArc(aSide: MAT_Side, anArc: MAT_Arc): void;

SetNeighbour(aSide: MAT_Side, aNode: MAT_Node, anArc: MAT_Arc): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A BasicELt is associated to each elementary constituent of the figure
MAT_BasicElt: declare class MAT_BasicElt extends Standard_Transient

constructor

// Return <startArcLeft> or <startArcRight> corresponding to <aSide>
StartArc(): MAT_Arc;

// Return <endArcLeft> or <endArcRight> corresponding to <aSide>
EndArc(): MAT_Arc;

// Return the <index> of <me> in Graph.TheBasicElts
Index(): number;

// Return the <GeomIndex> of <me>
GeomIndex(): number;

SetStartArc(anArc: MAT_Arc): void;

SetEndArc(anArc: MAT_Arc): void;

SetIndex(anInteger: number): void;

SetGeomIndex(anInteger: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT_Bisector: declare class MAT_Bisector extends Standard_Transient

constructor

AddBisector(abisector: MAT_Bisector): void;

List(): MAT_ListOfBisector;

FirstBisector(): MAT_Bisector;

LastBisector(): MAT_Bisector;

BisectorNumber(anumber: number): void;
BisectorNumber(): number;
BisectorNumber(anumber: number): void;
BisectorNumber(): number;

IndexNumber(anumber: number): void;
IndexNumber(): number;
IndexNumber(anumber: number): void;
IndexNumber(): number;

FirstEdge(anedge: MAT_Edge): void;
FirstEdge(): MAT_Edge;
FirstEdge(anedge: MAT_Edge): void;
FirstEdge(): MAT_Edge;

SecondEdge(anedge: MAT_Edge): void;
SecondEdge(): MAT_Edge;
SecondEdge(anedge: MAT_Edge): void;
SecondEdge(): MAT_Edge;

IssuePoint(apoint: number): void;
IssuePoint(): number;
IssuePoint(apoint: number): void;
IssuePoint(): number;

EndPoint(apoint: number): void;
EndPoint(): number;
EndPoint(apoint: number): void;
EndPoint(): number;

DistIssuePoint(areal: number): void;
DistIssuePoint(): number;
DistIssuePoint(areal: number): void;
DistIssuePoint(): number;

FirstVector(avector: number): void;
FirstVector(): number;
FirstVector(avector: number): void;
FirstVector(): number;

SecondVector(avector: number): void;
SecondVector(): number;
SecondVector(avector: number): void;
SecondVector(): number;

Sense(asense: number): void;
Sense(): number;
Sense(asense: number): void;
Sense(): number;

FirstParameter(aparameter: number): void;
FirstParameter(): number;
FirstParameter(aparameter: number): void;
FirstParameter(): number;

SecondParameter(aparameter: number): void;
SecondParameter(): number;
SecondParameter(aparameter: number): void;
SecondParameter(): number;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT_Edge: declare class MAT_Edge extends Standard_Transient

constructor

EdgeNumber(anumber: number): void;
EdgeNumber(): number;
EdgeNumber(anumber: number): void;
EdgeNumber(): number;

FirstBisector(abisector: MAT_Bisector): void;
FirstBisector(): MAT_Bisector;
FirstBisector(abisector: MAT_Bisector): void;
FirstBisector(): MAT_Bisector;

SecondBisector(abisector: MAT_Bisector): void;
SecondBisector(): MAT_Bisector;
SecondBisector(abisector: MAT_Bisector): void;
SecondBisector(): MAT_Bisector;

Distance(adistance: number): void;
Distance(): number;
Distance(adistance: number): void;
Distance(): number;

IntersectionPoint(apoint: number): void;
IntersectionPoint(): number;
IntersectionPoint(apoint: number): void;
IntersectionPoint(): number;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Class Graph permits the exploration of the {@link Bisector `Bisector`} Locus
MAT_Graph: declare class MAT_Graph extends Standard_Transient

constructor

// Construct <me> from the result of the method <CreateMat> of the class <MAT> from <MAT>
Perform(SemiInfinite: boolean, TheRoots: MAT_ListOfBisector, NbBasicElts: number, NbArcs: number): void;

// Return the Arc of index <Index> in <theArcs>
Arc(Index: number): MAT_Arc;

// Return the BasicElt of index <Index> in <theBasicElts>
BasicElt(Index: number): MAT_BasicElt;

// Return the Node of index <Index> in <theNodes>
Node(Index: number): MAT_Node;

// Return the number of arcs of <me>
NumberOfArcs(): number;

// Return the number of nodes of <me>
NumberOfNodes(): number;

// Return the number of basic elements of <me>
NumberOfBasicElts(): number;

// Return the number of infinites nodes of <me>
NumberOfInfiniteNodes(): number;

// Merge two BasicElts
FusionOfBasicElts(IndexElt1: number, IndexElt2: number, MergeArc1?: boolean, GeomIndexArc1?: number, GeomIndexArc2?: number, MergeArc2?: boolean, GeomIndexArc3?: number, GeomIndexArc4?: number): { MergeArc1: boolean; GeomIndexArc1: number; GeomIndexArc2: number; MergeArc2: boolean; GeomIndexArc3: number; GeomIndexArc4: number };

CompactArcs(): void;

CompactNodes(): void;

ChangeBasicElts(NewMap: NCollection_DataMap_int_handle_MAT_BasicElt): void;

ChangeBasicElt(Index: number): MAT_BasicElt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT_ListOfBisector: declare class MAT_ListOfBisector extends Standard_Transient

constructor

First(): void;

Last(): void;

Init(aniten: MAT_Bisector): void;

Next(): void;

Previous(): void;

More(): boolean;

Current(): MAT_Bisector;
Current(anitem: MAT_Bisector): void;
Current(): MAT_Bisector;
Current(anitem: MAT_Bisector): void;

FirstItem(): MAT_Bisector;

LastItem(): MAT_Bisector;

PreviousItem(): MAT_Bisector;

NextItem(): MAT_Bisector;

Number(): number;

Index(): number;

Brackets(anindex: number): MAT_Bisector;

Unlink(): void;

LinkBefore(anitem: MAT_Bisector): void;

LinkAfter(anitem: MAT_Bisector): void;

FrontAdd(anitem: MAT_Bisector): void;

BackAdd(anitem: MAT_Bisector): void;

Permute(): void;

Loop(): void;

IsEmpty(): boolean;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT_ListOfEdge: declare class MAT_ListOfEdge extends Standard_Transient

constructor

First(): void;

Last(): void;

Init(aniten: MAT_Edge): void;

Next(): void;

Previous(): void;

More(): boolean;

Current(): MAT_Edge;
Current(anitem: MAT_Edge): void;
Current(): MAT_Edge;
Current(anitem: MAT_Edge): void;

FirstItem(): MAT_Edge;

LastItem(): MAT_Edge;

PreviousItem(): MAT_Edge;

NextItem(): MAT_Edge;

Number(): number;

Index(): number;

Brackets(anindex: number): MAT_Edge;

Unlink(): void;

LinkBefore(anitem: MAT_Edge): void;

LinkAfter(anitem: MAT_Edge): void;

FrontAdd(anitem: MAT_Edge): void;

BackAdd(anitem: MAT_Edge): void;

Permute(): void;

Loop(): void;

IsEmpty(): boolean;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Node of Graph
MAT_Node: declare class MAT_Node extends Standard_Transient

constructor

// Returns the index associated of the geometric representation of <me>
GeomIndex(): number;

// Returns the index associated of the node
Index(): number;

// Returns in the Arcs linked to <me>
LinkedArcs(S: NCollection_Sequence_handle_MAT_Arc): void;
// S: Mutated in place

// Returns in the BasicElts equidistant to <me>
NearElts(S: NCollection_Sequence_handle_MAT_BasicElt): void;
// S: Mutated in place

Distance(): number;

// Returns True if <me> is a pending Node
PendingNode(): boolean;

// Returns True if <me> belongs to the figure
OnBasicElt(): boolean;

// Returns True if the distance of <me> is Infinite
Infinite(): boolean;

// Set the index associated of the node
SetIndex(anIndex: number): void;

SetLinkedArc(anArc: MAT_Arc): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition on the Left and the Right on the Fig
MAT_Side: typeof MAT_Side[keyof typeof MAT_Side]

MAT_TListNodeOfListOfBisector: declare class MAT_TListNodeOfListOfBisector extends Standard_Transient

constructor

GetItem(): MAT_Bisector;

Next(): MAT_TListNodeOfListOfBisector;
Next(atlistnode: MAT_TListNodeOfListOfBisector): void;
Next(): MAT_TListNodeOfListOfBisector;
Next(atlistnode: MAT_TListNodeOfListOfBisector): void;

Previous(): MAT_TListNodeOfListOfBisector;
Previous(atlistnode: MAT_TListNodeOfListOfBisector): void;
Previous(): MAT_TListNodeOfListOfBisector;
Previous(atlistnode: MAT_TListNodeOfListOfBisector): void;

SetItem(anitem: MAT_Bisector): void;

Dummy(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT_TListNodeOfListOfEdge: declare class MAT_TListNodeOfListOfEdge extends Standard_Transient

constructor

GetItem(): MAT_Edge;

Next(): MAT_TListNodeOfListOfEdge;
Next(atlistnode: MAT_TListNodeOfListOfEdge): void;
Next(): MAT_TListNodeOfListOfEdge;
Next(atlistnode: MAT_TListNodeOfListOfEdge): void;

Previous(): MAT_TListNodeOfListOfEdge;
Previous(atlistnode: MAT_TListNodeOfListOfEdge): void;
Previous(): MAT_TListNodeOfListOfEdge;
Previous(atlistnode: MAT_TListNodeOfListOfEdge): void;

SetItem(anitem: MAT_Edge): void;

Dummy(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// **Definition of Zone of Proximity of a BasicElt :**
MAT_Zone: declare class MAT_Zone extends Standard_Transient

constructor

// Compute the frontier of the Zone of proximity
Perform(aBasicElt: MAT_BasicElt): void;

// Return the number Of Arcs On the frontier of <me>
NumberOfArcs(): number;

// Return the Arc number <Index> on the frontier
ArcOnFrontier(Index: number): MAT_Arc;

// Return TRUE if <me> is not empty
NoEmptyZone(): boolean;

// Return TRUE if <me> is Limited
Limited(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MAT_SequenceOfArc: NCollection_Sequence_handle_MAT_Arc

MAT_SequenceOfBasicElt: NCollection_Sequence_handle_MAT_BasicElt
