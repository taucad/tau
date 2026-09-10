# libcascade — IFGraph

11 top-level symbols. Signatures are verbatim typescript.

// this class gives content of the CONNECTED COMPONENT(S) which include specific Entity(ies)
IFGraph_AllConnected: declare class IFGraph_AllConnected extends Interface_GraphContent

// adds an entity and its Connected ones to the list (allows to cumulate all Entities Connected by some ones) Note that if "ent" is in the already computed list,, no entity will be added, but if "ent" is not already in the list, a new Connected Component will be cumulated
GetFromEntity(ent: Standard_Transient): void;

// Allows to restart on a new data set
ResetData(): void;

// does the specific evaluation (Connected entities atall levels)
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class determines all Entities shared by some specific ones, at any level (those which will be lead in a Transfer for instance)
IFGraph_AllShared: declare class IFGraph_AllShared extends Interface_GraphContent

// adds an entity and its shared ones to the list (allows to cumulate all Entities shared by some ones)
GetFromEntity(ent: Standard_Transient): void;

// Allows to restart on a new data set
ResetData(): void;

// does the specific evaluation (shared entities atall levels)
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class gives entities which are Articulation points in a whole Model or in a sub-part An Articulation Point divides the graph in two (or more) disconnected sub-graphs Identifying Articulation Points allows improving efficiency of splitting a set of Entities into sub-sets
IFGraph_Articulations: declare class IFGraph_Articulations extends Interface_GraphContent

// adds an entity and its shared ones to the list
GetFromEntity(ent: Standard_Transient): void;

// Allows to restart on a new data set
ResetData(): void;

// Evaluates the list of Articulation points
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class evaluates effect of two compared sub-parts
IFGraph_Compare: declare class IFGraph_Compare extends Interface_GraphContent

// adds an entity and its shared ones to the list
GetFromEntity(ent: Standard_Transient, first: boolean): void;

// merges the second list into the first one, hence the second list is empty
Merge(): void;

// Removes the contents of second list
RemoveSecond(): void;

// Keeps only Common part, sets it as First list and clears second list
KeepCommon(): void;

// Allows to restart on a new data set
ResetData(): void;

// Recomputes result of comparing to sub-parts
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// determines Connected Components in a Graph
IFGraph_ConnectedComponants: declare class IFGraph_ConnectedComponants extends IFGraph_SubPartsIterator

// does the computation
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class evaluates effect of cumulated sub-parts
IFGraph_Cumulate: declare class IFGraph_Cumulate extends Interface_GraphContent

// adds an entity and its shared ones to the list
GetFromEntity(ent: Standard_Transient): void;

// Allows to restart on a new data set
ResetData(): void;

// Evaluates the result of cumulation
Evaluate(): void;

// returns number of times an Entity has been counted (0 means forgotten, more than 1 means overlap, 1 is normal)
NbTimes(ent: Standard_Transient): number;

// Returns the highest number of times recorded for every Entity (0 means empty, 1 means no overlap)
HighestNbTimes(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// determines strong components in a graph which are Cycles
IFGraph_Cycles: declare class IFGraph_Cycles extends IFGraph_SubPartsIterator

constructor

// does the computation
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class gives entities which are Source of entities of a sub-part, but are not contained by this sub-part
IFGraph_ExternalSources: declare class IFGraph_ExternalSources extends Interface_GraphContent

// adds an entity and its shared ones to the list
GetFromEntity(ent: Standard_Transient): void;

// Allows to restart on a new data set
ResetData(): void;

// Evaluates external sources of a set of entities
Evaluate(): void;

// Returns True if no External Source are found It means that we have a "root" set (performs an Evaluation as necessary)
IsEmpty(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// determines strong components in a graph which are Roots
IFGraph_SCRoots: declare class IFGraph_SCRoots extends IFGraph_StrongComponants

constructor

// does the computation
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// determines strong components of a graph, that is isolated entities (single components) or loops
IFGraph_StrongComponants: declare class IFGraph_StrongComponants extends IFGraph_SubPartsIterator

// does the computation
Evaluate(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines general form for graph classes of which result is not a single iteration on Entities, but a nested one
IFGraph_SubPartsIterator: declare class IFGraph_SubPartsIterator

// Returns the Model with which this Iterator was created
Model(): Interface_InterfaceModel;

// Adds an empty part and sets it to receive entities
AddPart(): void;

// Returns count of registered parts
NbParts(): number;

// Returns numero of part which currently receives entities (0 at load time)
PartNum(): number;

// Sets SubPartIterator to get Entities (by GetFromEntity & GetFromIter) into load status, to be analysed later
SetLoad(): void;

// Sets numero of receiving part to a new value Error if not in range (1-NbParts)
SetPartNum(num: number): void;

// Adds an Entity
GetFromEntity(ent: Standard_Transient, shared: boolean): void;

// Erases data (parts, entities)
Reset(): void;

// Called by Clear, this method allows evaluation just before iteration
Evaluate(): void;

// Returns entities which where loaded (not set into a sub-part)
Loaded(): Interface_GraphContent;

// Returns True if an Entity is loaded (either set into a sub-part or not)
IsLoaded(ent: Standard_Transient): boolean;

// Returns True if an Entity is Present in a sub-part
IsInPart(ent: Standard_Transient): boolean;

// Returns number of the sub-part in which an Entity has been set if it is not in a sub-part (or not loaded at all), Returns 0
EntityPartNum(ent: Standard_Transient): number;

// Sets iteration to its beginning
Start(): void;

// Returns True if there are more sub-parts to iterate on Note
More(): boolean;

// Sets iteration to the next sub-part if there is not, IsSingle-Entities will raises an exception
Next(): void;

// Returns True if current sub-part is single (has only one Entity) Error if there is no sub-part to iterate now
IsSingle(): boolean;

// Returns the first entity of current sub-part, that is for a Single one, the only one it contains Error
FirstEntity(): Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
