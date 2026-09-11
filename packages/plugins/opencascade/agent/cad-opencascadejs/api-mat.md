# libcascade — MAT

14 top-level symbols. Signatures are verbatim typescript.

MAT_Arc: declare class MAT_Arc extends Standard_Transient

constructor

Index(): number;

GeomIndex(): number;

FirstElement(): MAT_BasicElt;

SecondElement(): MAT_BasicElt;

FirstNode(): MAT_Node;

SecondNode(): MAT_Node;

TheOtherNode(aNode: MAT_Node): MAT_Node;

HasNeighbour(aNode: MAT_Node, aSide: MAT_Side): boolean;

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

delete(): void;

[Symbol.dispose](): void;

MAT_BasicElt: declare class MAT_BasicElt extends Standard_Transient

constructor

StartArc(): MAT_Arc;

EndArc(): MAT_Arc;

Index(): number;

GeomIndex(): number;

SetStartArc(anArc: MAT_Arc): void;

SetEndArc(anArc: MAT_Arc): void;

SetIndex(anInteger: number): void;

SetGeomIndex(anInteger: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

MAT_Graph: declare class MAT_Graph extends Standard_Transient

constructor

Perform(SemiInfinite: boolean, TheRoots: MAT_ListOfBisector, NbBasicElts: number, NbArcs: number): void;

Arc(Index: number): MAT_Arc;

BasicElt(Index: number): MAT_BasicElt;

Node(Index: number): MAT_Node;

NumberOfArcs(): number;

NumberOfNodes(): number;

NumberOfBasicElts(): number;

NumberOfInfiniteNodes(): number;

FusionOfBasicElts(IndexElt1: number, IndexElt2: number, MergeArc1?: boolean, GeomIndexArc1?: number, GeomIndexArc2?: number, MergeArc2?: boolean, GeomIndexArc3?: number, GeomIndexArc4?: number): { MergeArc1: boolean; GeomIndexArc1: number; GeomIndexArc2: number; MergeArc2: boolean; GeomIndexArc3: number; GeomIndexArc4: number };

CompactArcs(): void;

CompactNodes(): void;

ChangeBasicElts(NewMap: NCollection_DataMap_int_handle_MAT_BasicElt): void;

ChangeBasicElt(Index: number): MAT_BasicElt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

MAT_Node: declare class MAT_Node extends Standard_Transient

constructor

GeomIndex(): number;

Index(): number;

LinkedArcs(S: NCollection_Sequence_handle_MAT_Arc): void;

NearElts(S: NCollection_Sequence_handle_MAT_BasicElt): void;

Distance(): number;

PendingNode(): boolean;

OnBasicElt(): boolean;

Infinite(): boolean;

SetIndex(anIndex: number): void;

SetLinkedArc(anArc: MAT_Arc): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

MAT_Zone: declare class MAT_Zone extends Standard_Transient

constructor

Perform(aBasicElt: MAT_BasicElt): void;

NumberOfArcs(): number;

ArcOnFrontier(Index: number): MAT_Arc;

NoEmptyZone(): boolean;

Limited(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

MAT_SequenceOfArc: NCollection_Sequence_handle_MAT_Arc

MAT_SequenceOfBasicElt: NCollection_Sequence_handle_MAT_BasicElt
