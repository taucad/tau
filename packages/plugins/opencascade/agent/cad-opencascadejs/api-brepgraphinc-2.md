# libcascade — BRepGraphInc (2)

1 top-level symbols. Signatures are verbatim typescript.

// Central backend storage container for the incidence-table topology model
BRepGraphInc_Storage: declare class BRepGraphInc_Storage

constructor

// Return the allocator used for backend storage
Allocator(): NCollection_BaseAllocator;

// Return products not referenced by any active occurrence
RootProductIds(): BRepGraph_ProductId[];

// Return products not referenced by any active occurrence
ChangeRootProductIds(): BRepGraph_ProductId[];

// Return nodes accumulated during deferred invalidation
DeferredModified(): BRepGraph_NodeId[];

// Return nodes accumulated during deferred invalidation
ChangeDeferredModified(): BRepGraph_NodeId[];

// Return refs accumulated during deferred invalidation
DeferredRefModified(): BRepGraph_RefId[];

// Return refs accumulated during deferred invalidation
ChangeDeferredRefModified(): BRepGraph_RefId[];

// Return true when the graph contains no topology definitions
IsEmpty(): boolean;

// Return the next UID counter for a given node kind
NextNodeUIDCounter(theKind: BRepGraph_NodeId_Kind): number;

// Override the next UID counter for a given node kind
SetNextNodeUIDCounter(theKind: BRepGraph_NodeId_Kind, theCounter: number): void;

// Return the next UID counter for a given reference kind
NextRefUIDCounter(theKind: BRepGraph_RefId_Kind): number;

// Override the next UID counter for a given reference kind
SetNextRefUIDCounter(theKind: BRepGraph_RefId_Kind, theCounter: number): void;

// Allocate a node UID
AllocateNodeUID(theNodeId: BRepGraph_NodeId): BRepGraph_UID;

// Allocate a reference UID
AllocateRefUID(theRefId: BRepGraph_RefId): BRepGraph_RefUID;

// Return the current graph generation used by VersionStamp staleness checks
Generation(): number;

// Override the current graph generation
SetGeneration(theGeneration: number): void;

// Increment the graph generation after a structural mutation batch
IncrementGeneration(): void;

// Return the stable graph instance GUID
GraphGUID(): Standard_GUID;

// Override the stable graph instance GUID
SetGraphGUID(theGuid: Standard_GUID): void;

// Return whether invalidation is currently deferred
DeferredMode(): boolean;

// Enable or disable deferred invalidation mode
SetDeferredMode(theEnabled: boolean): void;

// Return the current propagation wave id used to avoid revisiting parents
PropagationWave(): number;

// Increment the propagation wave and return the new value
AdvancePropagationWave(): number;

// Increment the propagation wave without reading it back
IncrementPropagationWave(): void;

// Return the recursion depth of the active RemoveSubgraph cascade
RemoveSubgraphDepth(): number;

// Enter one nested RemoveSubgraph scope
IncrementRemoveSubgraphDepth(): void;

// Leave one nested RemoveSubgraph scope
DecrementRemoveSubgraphDepth(): void;

// Returns the total number of vertex entities (including removed)
NbVertices(): number;

// Returns the total number of edge entities (including removed)
NbEdges(): number;

// Returns the total number of coedge entities (including removed)
NbCoEdges(): number;

// Returns the total number of wire entities (including removed)
NbWires(): number;

// Returns the total number of face entities (including removed)
NbFaces(): number;

// Returns the total number of shell entities (including removed)
NbShells(): number;

// Returns the total number of solid entities (including removed)
NbSolids(): number;

// Returns the total number of compound entities (including removed)
NbCompounds(): number;

// Returns the total number of compsolid entities (including removed)
NbCompSolids(): number;

// Returns the total number of product entities (including removed)
NbProducts(): number;

// Returns the total number of occurrence entities (including removed)
NbOccurrences(): number;

// Returns the total number of shell reference entries (including removed)
NbShellRefs(): number;

// Returns the total number of face reference entries (including removed)
NbFaceRefs(): number;

// Returns the total number of wire reference entries (including removed)
NbWireRefs(): number;

// Returns the total number of vertex reference entries (including removed)
NbVertexRefs(): number;

// Returns the total number of solid reference entries (including removed)
NbSolidRefs(): number;

// Returns the total number of child reference entries (including removed)
NbChildRefs(): number;

// Returns the total number of occurrence reference entries (including removed)
NbOccurrenceRefs(): number;

// Returns the number of active vertex entities (excluding removed)
NbActiveVertices(): number;

// Returns the number of active edge entities (excluding removed)
NbActiveEdges(): number;

// Returns the number of active coedge entities (excluding removed)
NbActiveCoEdges(): number;

// Returns the number of active wire entities (excluding removed)
NbActiveWires(): number;

// Returns the number of active face entities (excluding removed)
NbActiveFaces(): number;

// Returns the number of active shell entities (excluding removed)
NbActiveShells(): number;

// Returns the number of active solid entities (excluding removed)
NbActiveSolids(): number;

// Returns the number of active compound entities (excluding removed)
NbActiveCompounds(): number;

// Returns the number of active compsolid entities (excluding removed)
NbActiveCompSolids(): number;

// Returns the number of active product entities (excluding removed)
NbActiveProducts(): number;

// Returns the number of active occurrence entities (excluding removed)
NbActiveOccurrences(): number;

// Returns the number of active shell reference entries (excluding removed)
NbActiveShellRefs(): number;

// Returns the number of active face reference entries (excluding removed)
NbActiveFaceRefs(): number;

// Returns the number of active wire reference entries (excluding removed)
NbActiveWireRefs(): number;

// Returns the number of active vertex reference entries (excluding removed)
NbActiveVertexRefs(): number;

// Returns the number of active solid reference entries (excluding removed)
NbActiveSolidRefs(): number;

// Returns the number of active child reference entries (excluding removed)
NbActiveChildRefs(): number;

// Returns the number of active occurrence reference entries (excluding removed)
NbActiveOccurrenceRefs(): number;

// Mark an entity node as removed and decrement its active counter once
MarkRemoved(theNodeId: BRepGraph_NodeId): boolean;
MarkRemoved(theRepId: BRepGraph_RepId): boolean;
MarkRemoved(theNodeId: BRepGraph_NodeId): boolean;
MarkRemoved(theRepId: BRepGraph_RepId): boolean;
// theNodeId: typed entity id

// Mark a reference entry as removed and decrement its active counter once
MarkRemovedRef(theRefId: BRepGraph_RefId): boolean;
// theRefId: typed reference id

// Returns the number of edge 3D curve use records
NbEdgeCurves3D(): number;

// Returns the number of edge 3D polygon use records
NbEdgePolygons3D(): number;

// Returns the number of coedge 2D curve use records
NbCoEdgeCurves2D(): number;

// Returns the number of coedge 2D polygon use records
NbCoEdgePolygons2D(): number;

// Returns the number of coedge polygon-on-triangulation use records
NbCoEdgePolygonsOnTri(): number;

// Returns the number of face surface use records
NbFaceSurfaces(): number;

// Returns the number of face triangulation use records
NbFaceTriangulations(): number;

// Returns the number of active (parent-valid) edge 3D curve use records
NbActiveEdgeCurves3D(): number;

// Returns the number of active (parent-valid) coedge 2D curve use records
NbActiveCoEdgeCurves2D(): number;

// Returns the number of active (parent-valid) face surface use records
NbActiveFaceSurfaces(): number;

// Returns the number of active (parent-valid) face triangulation use records
NbActiveFaceTriangulations(): number;

// Returns the number of active (parent-valid) edge 3D polygon use records
NbActiveEdgePolygons3D(): number;

// Returns the number of active (parent-valid) coedge 2D polygon use records
NbActiveCoEdgePolygons2D(): number;

// Returns the number of active (parent-valid) coedge polygon-on-triangulation use records
NbActiveCoEdgePolygonsOnTri(): number;

// Returns the edge 3D curve use at the given id
EdgeCurve3DRep(theId: BRepGraph_EdgeCurve3DRepId): BRepGraphInc_EdgeCurve3DRep;

// Returns a mutable reference to the edge 3D curve use at the given id
ChangeEdgeCurve3DRep(theId: BRepGraph_EdgeCurve3DRepId): BRepGraphInc_EdgeCurve3DRep;

// Returns the edge 3D polygon use at the given id
EdgePolygon3DRep(theId: BRepGraph_EdgePolygon3DRepId): BRepGraphInc_EdgePolygon3DRep;

// Returns a mutable reference to the edge 3D polygon use at the given id
ChangeEdgePolygon3DRep(theId: BRepGraph_EdgePolygon3DRepId): BRepGraphInc_EdgePolygon3DRep;

// Returns the coedge 2D curve use at the given id
CoEdgeCurve2DRep(theId: BRepGraph_CoEdgeCurve2DRepId): BRepGraphInc_CoEdgeCurve2DRep;

// Returns a mutable reference to the coedge 2D curve use at the given id
ChangeCoEdgeCurve2DRep(theId: BRepGraph_CoEdgeCurve2DRepId): BRepGraphInc_CoEdgeCurve2DRep;

// Returns the coedge 2D polygon use at the given id
CoEdgePolygon2DRep(theId: BRepGraph_CoEdgePolygon2DRepId): BRepGraphInc_CoEdgePolygon2DRep;

// Returns a mutable reference to the coedge 2D polygon use at the given id
ChangeCoEdgePolygon2DRep(theId: BRepGraph_CoEdgePolygon2DRepId): BRepGraphInc_CoEdgePolygon2DRep;

// Returns the coedge polygon-on-triangulation use at the given id
CoEdgePolygonOnTriRep(theId: BRepGraph_CoEdgePolygonOnTriRepId): BRepGraphInc_CoEdgePolygonOnTriRep;

// Returns a mutable reference to the coedge polygon-on-triangulation use at the given id
ChangeCoEdgePolygonOnTriRep(theId: BRepGraph_CoEdgePolygonOnTriRepId): BRepGraphInc_CoEdgePolygonOnTriRep;

// Returns the face surface use at the given id
FaceSurfaceRep(theId: BRepGraph_FaceSurfaceRepId): BRepGraphInc_FaceSurfaceRep;

// Returns a mutable reference to the face surface use at the given id
ChangeFaceSurfaceRep(theId: BRepGraph_FaceSurfaceRepId): BRepGraphInc_FaceSurfaceRep;

// Returns the face triangulation use at the given id
FaceTriangulationRep(theId: BRepGraph_FaceTriangulationRepId): BRepGraphInc_FaceTriangulationRep;

// Returns a mutable reference to the face triangulation use at the given id
ChangeFaceTriangulationRep(theId: BRepGraph_FaceTriangulationRepId): BRepGraphInc_FaceTriangulationRep;

// Appends a new edge 3D curve use record and returns its id
AppendEdgeCurve3DRep(): BRepGraph_EdgeCurve3DRepId;

// Appends a new edge 3D polygon use record and returns its id
AppendEdgePolygon3DRep(): BRepGraph_EdgePolygon3DRepId;

// Appends a new coedge 2D curve use record and returns its id
AppendCoEdgeCurve2DRep(): BRepGraph_CoEdgeCurve2DRepId;

// Appends a new coedge 2D polygon use record and returns its id
AppendCoEdgePolygon2DRep(): BRepGraph_CoEdgePolygon2DRepId;

// Appends a new coedge polygon-on-triangulation use record and returns its id
AppendCoEdgePolygonOnTriRep(): BRepGraph_CoEdgePolygonOnTriRepId;

// Appends a new face surface use record and returns its id
AppendFaceSurfaceRep(): BRepGraph_FaceSurfaceRepId;

// Appends a new face triangulation use record and returns its id
AppendFaceTriangulationRep(): BRepGraph_FaceTriangulationRepId;

// Set or clear the soft-removal flag for a representation-use record
SetRemoved(theRepId: BRepGraph_RepId, theVal: boolean): void;
// theRepId: typed use id
// theVal: true to mark removed, false to mark active

// Returns the vertex entity at the given typed id
Vertex(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;
// theVertex: typed vertex id

// Returns the edge entity at the given typed id
Edge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;
// theEdge: typed edge id

// Returns the coedge entity at the given typed id
CoEdge(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;
// theCoEdge: typed coedge id

// Returns the wire entity at the given typed id
Wire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;
// theWire: typed wire id

// Returns the face entity at the given typed id
Face(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;
// theFace: typed face id

// Returns the shell entity at the given typed id
Shell(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;
// theShell: typed shell id

// Returns the solid entity at the given typed id
Solid(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;
// theSolid: typed solid id

// Returns the compound entity at the given typed id
Compound(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;
// theCompound: typed compound id

// Returns the compsolid entity at the given typed id
CompSolid(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;
// theCompSolid: typed comp-solid id

// Returns the product entity at the given typed id
Product(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;
// theProduct: typed product id

// Returns the occurrence entity at the given typed id
Occurrence(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;
// theOccurrence: typed occurrence id

// Returns the shell reference entry at the given typed id
ShellRef(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

// Returns the face reference entry at the given typed id
FaceRef(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

// Returns the wire reference entry at the given typed id
WireRef(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

// Returns the vertex reference entry at the given typed id
VertexRef(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

// Returns the solid reference entry at the given typed id
SolidRef(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

// Returns the child reference entry at the given typed id
ChildRef(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

// Returns the occurrence reference entry at the given typed id
OccurrenceRef(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

// Returns a mutable reference to the vertex entity at the given typed id
ChangeVertex(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;
// theVertex: typed vertex id

// Returns a mutable reference to the edge entity at the given typed id
ChangeEdge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;
// theEdge: typed edge id

// Returns a mutable reference to the coedge entity at the given typed id
ChangeCoEdge(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;
// theCoEdge: typed coedge id

// Returns a mutable reference to the wire entity at the given typed id
ChangeWire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;
// theWire: typed wire id

// Returns a mutable reference to the face entity at the given typed id
ChangeFace(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;
// theFace: typed face id

// Returns a mutable reference to the shell entity at the given typed id
ChangeShell(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;
// theShell: typed shell id

// Returns a mutable reference to the solid entity at the given typed id
ChangeSolid(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;
// theSolid: typed solid id

// Returns a mutable reference to the compound entity at the given typed id
ChangeCompound(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;
// theCompound: typed compound id

// Returns a mutable reference to the compsolid entity at the given typed id
ChangeCompSolid(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;
// theCompSolid: typed comp-solid id

// Returns a mutable reference to the product entity at the given typed id
ChangeProduct(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;
// theProduct: typed product id

// Returns a mutable reference to the occurrence entity at the given typed id
ChangeOccurrence(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;
// theOccurrence: typed occurrence id

// Returns a mutable reference to the shell reference entry at the given typed id
ChangeShellRef(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

// Returns a mutable reference to the face reference entry at the given typed id
ChangeFaceRef(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

// Returns a mutable reference to the wire reference entry at the given typed id
ChangeWireRef(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

// Returns a mutable reference to the vertex reference entry at the given typed id
ChangeVertexRef(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

// Returns a mutable reference to the solid reference entry at the given typed id
ChangeSolidRef(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

// Returns a mutable reference to the child reference entry at the given typed id
ChangeChildRef(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

// Returns a mutable reference to the occurrence reference entry at the given typed id
ChangeOccurrenceRef(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

// Return the face relations for a given face identifier
FaceRelations(theId: BRepGraph_FaceId): BRepGraphInc_FaceRelations;
// theId: face identifier

// Return the wire relations for a given wire identifier
WireRelations(theId: BRepGraph_WireId): BRepGraphInc_WireRelations;
// theId: wire identifier

// Return the edge relations for a given edge identifier
EdgeRelations(theId: BRepGraph_EdgeId): BRepGraphInc_EdgeRelations;
// theId: edge identifier

// Return the shell relations for a given shell identifier
ShellRelations(theId: BRepGraph_ShellId): BRepGraphInc_ShellRelations;
// theId: shell identifier

// Return the solid relations for a given solid identifier
SolidRelations(theId: BRepGraph_SolidId): BRepGraphInc_SolidRelations;
// theId: solid identifier

// Return the compound relations for a given compound identifier
CompoundRelations(theId: BRepGraph_CompoundId): BRepGraphInc_CompoundRelations;
// theId: compound identifier

// Return the compsolid relations for a given compsolid identifier
CompSolidRelations(theId: BRepGraph_CompSolidId): BRepGraphInc_CompSolidRelations;
// theId: compsolid identifier

// Return the vertex relations for a given vertex identifier
VertexRelations(theId: BRepGraph_VertexId): BRepGraphInc_VertexRelations;
// theId: vertex identifier

// Return the product relations for a given product identifier
ProductRelations(theId: BRepGraph_ProductId): BRepGraphInc_ProductRelations;
// theId: product identifier

// Return the occurrence relations for a given occurrence identifier
OccurrenceRelations(theId: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceRelations;
// theId: occurrence identifier

// Return the compound child reference identifiers that point to a given node
CompoundRefsOfNode(theNode: BRepGraph_NodeId): BRepGraph_ChildRefId[];
// theNode: node identifier

// Return the occurrence reference identifiers that point to a given node
OccurrenceRefsOfNode(theNode: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];
// theNode: node identifier

// Appends a new vertex entity and returns its typed id
AppendVertex(): BRepGraph_VertexId;

// Appends a new edge entity and returns its typed id
AppendEdge(): BRepGraph_EdgeId;

// Appends a new coedge entity and returns its typed id
AppendCoEdge(): BRepGraph_CoEdgeId;

// Appends a new wire entity and returns its typed id
AppendWire(): BRepGraph_WireId;

// Appends a new face entity and returns its typed id
AppendFace(): BRepGraph_FaceId;

// Appends a new shell entity and returns its typed id
AppendShell(): BRepGraph_ShellId;

// Appends a new solid entity and returns its typed id
AppendSolid(): BRepGraph_SolidId;

// Appends a new compound entity and returns its typed id
AppendCompound(): BRepGraph_CompoundId;

// Appends a new compsolid entity and returns its typed id
AppendCompSolid(): BRepGraph_CompSolidId;

// Appends a new product entity and returns its typed id
AppendProduct(): BRepGraph_ProductId;

// Appends a new occurrence entity and returns its typed id
AppendOccurrence(): BRepGraph_OccurrenceId;

// Appends a new shell reference entry and returns its typed id
AppendShellRef(): BRepGraph_ShellRefId;

// Appends a new face reference entry and returns its typed id
AppendFaceRef(): BRepGraph_FaceRefId;

// Appends a new wire reference entry and returns its typed id
AppendWireRef(): BRepGraph_WireRefId;

// Appends a new vertex reference entry and returns its typed id
AppendVertexRef(): BRepGraph_VertexRefId;

// Appends a new solid reference entry and returns its typed id
AppendSolidRef(): BRepGraph_SolidRefId;

// Appends a new child reference entry and returns its typed id
AppendChildRef(): BRepGraph_ChildRefId;

// Appends a new occurrence reference entry and returns its typed id
AppendOccurrenceRef(): BRepGraph_OccurrenceRefId;

// Create a coedge use record binding an edge to a wire within a face context
CreateCoEdgeUse(theParentWireId: BRepGraph_WireId, theChildEdgeId: BRepGraph_EdgeId, theFaceId: BRepGraph_FaceId, theOrientation: BRepGraphInc_ParityOrientation): BRepGraph_CoEdgeId;
// theParentWireId: owning wire identifier
// theChildEdgeId: referenced edge identifier
// theFaceId: face context identifier
// theOrientation: orientation of the coedge

// Attach an edge to a vertex by creating a vertex reference
AttachEdgeToVertex(theEdgeId: BRepGraph_EdgeId, theVertexId: BRepGraph_VertexId): void;
// theEdgeId: edge identifier
// theVertexId: vertex identifier

// Attach a wire to a face by creating a wire reference
AttachWireToFace(theParentFaceId: BRepGraph_FaceId, theChildWireId: BRepGraph_WireId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_WireRefId;
// theParentFaceId: parent face identifier
// theChildWireId: child wire identifier
// theOrientation: orientation within parent

// Attach a face to a shell by creating a face reference
AttachFaceToShell(theParentShellId: BRepGraph_ShellId, theChildFaceId: BRepGraph_FaceId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_FaceRefId;
// theParentShellId: parent shell identifier
// theChildFaceId: child face identifier
// theOrientation: orientation within parent

// Attach a shell to a solid by creating a shell reference
AttachShellToSolid(theParentSolidId: BRepGraph_SolidId, theChildShellId: BRepGraph_ShellId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_ShellRefId;
// theParentSolidId: parent solid identifier
// theChildShellId: child shell identifier
// theOrientation: orientation within parent

// Attach a solid to a compsolid by creating a solid reference
AttachSolidToCompSolid(theParentCompSolidId: BRepGraph_CompSolidId, theChildSolidId: BRepGraph_SolidId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_SolidRefId;
// theParentCompSolidId: parent compsolid identifier
// theChildSolidId: child solid identifier
// theOrientation: orientation within parent

// Attach a child node to a compound by creating a child reference
AttachChildToCompound(theParentCompoundId: BRepGraph_CompoundId, theChildNodeId: BRepGraph_NodeId, theLocation?: TopLoc_Location, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_ChildRefId;
// theParentCompoundId: parent compound identifier
// theChildNodeId: child node identifier
// theLocation: optional location transformation
// theOrientation: orientation within parent

// Attach an occurrence to a product by creating an occurrence reference
AttachOccurrenceToProduct(theParentProductId: BRepGraph_ProductId, theChildOccurrenceId: BRepGraph_OccurrenceId, theLocation?: TopLoc_Location): BRepGraph_OccurrenceRefId;
// theParentProductId: parent product identifier
// theChildOccurrenceId: child occurrence identifier
// theLocation: optional location transformation

// Detach a coedge use from its parent wire
DetachCoEdgeUse(theParentWireId: BRepGraph_WireId, theCoEdgeId: BRepGraph_CoEdgeId): boolean;
// theParentWireId: owning wire identifier
// theCoEdgeId: coedge identifier to detach

// Replace a single coedge with a pair of new coedges in a wire
ReplaceCoEdgeUseWithPair(theParentWireId: BRepGraph_WireId, theOldCoEdgeId: BRepGraph_CoEdgeId, theNewFirstCoEdgeId: BRepGraph_CoEdgeId, theNewSecondCoEdgeId: BRepGraph_CoEdgeId): boolean;
// theParentWireId: owning wire identifier
// theOldCoEdgeId: coedge to replace
// theNewFirstCoEdgeId: first replacement coedge
// theNewSecondCoEdgeId: second replacement coedge

// Detach a wire reference from its parent face
DetachWireFromFace(theParentFaceId: BRepGraph_FaceId, theRefId: BRepGraph_WireRefId): boolean;
// theParentFaceId: parent face identifier
// theRefId: wire reference identifier to detach

// Detach a face reference from its parent shell
DetachFaceFromShell(theParentShellId: BRepGraph_ShellId, theRefId: BRepGraph_FaceRefId): boolean;
// theParentShellId: parent shell identifier
// theRefId: face reference identifier to detach

// Detach a shell reference from its parent solid
DetachShellFromSolid(theParentSolidId: BRepGraph_SolidId, theRefId: BRepGraph_ShellRefId): boolean;
// theParentSolidId: parent solid identifier
// theRefId: shell reference identifier to detach

// Detach a solid reference from its parent compsolid
DetachSolidFromCompSolid(theParentCompSolidId: BRepGraph_CompSolidId, theRefId: BRepGraph_SolidRefId): boolean;
// theParentCompSolidId: parent compsolid identifier
// theRefId: solid reference identifier to detach

// Detach a child reference from its parent compound
DetachChildFromCompound(theParentCompoundId: BRepGraph_CompoundId, theRefId: BRepGraph_ChildRefId): boolean;
// theParentCompoundId: parent compound identifier
// theRefId: child reference identifier to detach

// Detach an occurrence reference from its parent product
DetachOccurrenceFromProduct(theParentProductId: BRepGraph_ProductId, theRefId: BRepGraph_OccurrenceRefId): boolean;
// theParentProductId: parent product identifier
// theRefId: occurrence reference identifier to detach

// Rebind the child node of an occurrence to a new node
RebindOccurrenceChild(theOccurrence: BRepGraph_OccurrenceId, theOldChild: BRepGraph_NodeId, theNewChild: BRepGraph_NodeId): void;
// theOccurrence: occurrence identifier
// theOldChild: old child node identifier
// theNewChild: new child node identifier

// Rebind vertex edge references from one vertex to another, excluding a specific ref
RebindVertexEdge(theOldVertex: BRepGraph_VertexId, theNewVertex: BRepGraph_VertexId, theEdge: BRepGraph_EdgeId, theExcludingRef: BRepGraph_VertexRefId): void;
// theOldVertex: old vertex identifier
// theNewVertex: new vertex identifier
// theEdge: edge identifier
// theExcludingRef: reference identifier to exclude from rebinding

// Rebind a vertex reference to point to a new vertex
RebindVertexRef(theRefId: BRepGraph_VertexRefId, theOldVertex: BRepGraph_VertexId, theNewVertex: BRepGraph_VertexId): void;
// theRefId: vertex reference identifier
// theOldVertex: old vertex identifier
// theNewVertex: new vertex identifier

// Rebind a coedge to reference a different edge
RebindCoEdgeEdge(theCoEdge: BRepGraph_CoEdgeId, theOldEdge: BRepGraph_EdgeId, theNewEdge: BRepGraph_EdgeId): void;
// theCoEdge: coedge identifier
// theOldEdge: old edge identifier
// theNewEdge: new edge identifier

// Rebind a wire reference to point to a new wire
RebindWireRef(theRefId: BRepGraph_WireRefId, theOldWire: BRepGraph_WireId, theNewWire: BRepGraph_WireId): void;
// theRefId: wire reference identifier
// theOldWire: old wire identifier
// theNewWire: new wire identifier

// Rebind a face reference to point to a new face
RebindFaceRef(theRefId: BRepGraph_FaceRefId, theOldFace: BRepGraph_FaceId, theNewFace: BRepGraph_FaceId): void;
// theRefId: face reference identifier
// theOldFace: old face identifier
// theNewFace: new face identifier

// Rebind a shell reference to point to a new shell
RebindShellRef(theRefId: BRepGraph_ShellRefId, theOldShell: BRepGraph_ShellId, theNewShell: BRepGraph_ShellId): void;
// theRefId: shell reference identifier
// theOldShell: old shell identifier
// theNewShell: new shell identifier

// Rebind a solid reference to point to a new solid
RebindSolidRef(theRefId: BRepGraph_SolidRefId, theOldSolid: BRepGraph_SolidId, theNewSolid: BRepGraph_SolidId): void;
// theRefId: solid reference identifier
// theOldSolid: old solid identifier
// theNewSolid: new solid identifier

// Rebind a child reference to point to a new child node
RebindChildRef(theRefId: BRepGraph_ChildRefId, theOldChild: BRepGraph_NodeId, theNewChild: BRepGraph_NodeId): void;
// theRefId: child reference identifier
// theOldChild: old child node identifier
// theNewChild: new child node identifier

// Rebind an occurrence reference to point to a new occurrence
RebindOccurrenceRef(theRefId: BRepGraph_OccurrenceRefId, theOldOccurrence: BRepGraph_OccurrenceId, theNewOccurrence: BRepGraph_OccurrenceId): void;
// theRefId: occurrence reference identifier
// theOldOccurrence: old occurrence identifier
// theNewOccurrence: new occurrence identifier

// Reverse the order of coedges in a wire
ReverseWireCoEdges(theWireId: BRepGraph_WireId): void;
// theWireId: wire identifier

// Replace the coedge list of a wire with a new set
SetWireCoEdges(theWireId: BRepGraph_WireId, theCoEdgeIds: NCollection_Array1_BRepGraph_CoEdgeId): void;
// theWireId: wire identifier
// theCoEdgeIds: new coedge identifiers

// Replace the wire reference list of a face with a new set
SetFaceWireRefs(theFaceId: BRepGraph_FaceId, theWireRefIds: NCollection_Array1_BRepGraph_WireRefId): void;
// theFaceId: face identifier
// theWireRefIds: new wire reference identifiers

// Replace the face reference list of a shell with a new set
SetShellFaceRefs(theShellId: BRepGraph_ShellId, theFaceRefIds: NCollection_Array1_BRepGraph_FaceRefId): void;
// theShellId: shell identifier
// theFaceRefIds: new face reference identifiers

// Replace the shell reference list of a solid with a new set
SetSolidShellRefs(theSolidId: BRepGraph_SolidId, theShellRefIds: NCollection_Array1_BRepGraph_ShellRefId): void;
// theSolidId: solid identifier
// theShellRefIds: new shell reference identifiers

// Replace the solid reference list of a compsolid with a new set
SetCompSolidSolidRefs(theCompSolidId: BRepGraph_CompSolidId, theSolidRefIds: NCollection_Array1_BRepGraph_SolidRefId): void;
// theCompSolidId: compsolid identifier
// theSolidRefIds: new solid reference identifiers

// Replace the child reference list of a compound with a new set
SetCompoundChildRefs(theCompoundId: BRepGraph_CompoundId, theChildRefIds: NCollection_Array1_BRepGraph_ChildRefId): void;
// theCompoundId: compound identifier
// theChildRefIds: new child reference identifiers

// Replace the occurrence reference list of a product with a new set
SetProductOccurrenceRefs(theProductId: BRepGraph_ProductId, theOccurrenceRefIds: NCollection_Array1_BRepGraph_OccurrenceRefId): void;
// theProductId: product identifier
// theOccurrenceRefIds: new occurrence reference identifiers

// Return the BaseRef portion of any ref entry by generic RefId
BaseRef(theRefId: BRepGraph_RefId): BRepGraphInc_BaseRef;
// theRefId: generic reference identifier

// Return the mutable BaseRef portion of any ref entry by generic RefId
ChangeBaseRef(theRefId: BRepGraph_RefId): BRepGraphInc_BaseRef;
// theRefId: generic reference identifier

// Resolve an active node UID through storage reverse maps
FindNodeIdByUID(theUID: BRepGraph_UID): BRepGraph_NodeId;

// Resolve an active reference UID through storage reverse maps
FindRefIdByUID(theUID: BRepGraph_RefUID): BRepGraph_RefId;

// Returns the node id bound to the given shape definition key, or invalid if not bound
FindDefinitionByShape(theShape: TopoDS_Shape): BRepGraph_NodeId;

// Returns true if the given shape definition key is bound to a node
HasShapeBinding(theShape: TopoDS_Shape): boolean;

// Set or update the shape-to-node binding
SetDefinitionShapeBinding(theShape: TopoDS_Shape, theNodeId: BRepGraph_NodeId): void;

// Remove the shape-to-node binding only if it points to the expected node
RemoveDefinitionShapeBinding(theShape: TopoDS_Shape, theExpectedNodeId: BRepGraph_NodeId): boolean;

// Back-reference to the construction-time `TopoDS_Shape` key a node was built from
FindOriginal(theNodeId: BRepGraph_NodeId): TopoDS_Shape;

// Returns true if the given node id has an original shape binding
HasOriginal(theNodeId: BRepGraph_NodeId): boolean;

// Binds the given node id to its construction-time shape key
BindOriginal(theNodeId: BRepGraph_NodeId, theShape: TopoDS_Shape): void;

// Removes the original shape binding for the given node id
UnBindOriginal(theNodeId: BRepGraph_NodeId): void;

// Copy shape-to-NodeId and Original shape bindings from another storage
CopyShapeBindingsFrom(theSource: BRepGraphInc_Storage): void;

// Return the generation-validated node-to-shape reconstruction cache
CurrentShapes(): any;

// Return the mutable generation-validated node-to-shape reconstruction cache
ChangeCurrentShapes(): any;

// Return the mutex protecting the reconstruction cache
CurrentShapesMutex(): unknown;

// Clear the generation-validated shape reconstruction cache
ClearCurrentShapes(): void;

// Remove one entry from the generation-validated shape reconstruction cache
UnbindCurrentShape(theNode: BRepGraph_NodeId): void;

// Clear deferred invalidation queues and release their batch allocator
ClearDeferredQueues(): void;

// Clear all storage
Clear(): void;

// Prepare fixed-size destination ranges for indexed load
PrepareForLoad(theCounts: BRepGraphInc_Load_Counts): void;
// theCounts: final per-section slot counts

// Override active-slot counters after a trusted indexed load path
SetActiveCounts(theCounts: BRepGraphInc_Load_Counts): void;
// theCounts: trusted active per-section counts

// Build a Counts struct from current allocated slot counts
Counts(): BRepGraphInc_Load_Counts;

// Build a Counts struct from current active (non-removed) counts
ActiveCounts(): BRepGraphInc_Load_Counts;

// Recount active-slot counters from current `IsRemoved` flags without rebuilding indexes
RecountActiveCounts(): void;

// Rebuild centralized relation tables from entity and reference endpoints
RebuildDerivedRelations(): void;

// Rebuild relation maps after a trusted load already restored active counts
RebuildDerivedRelationsPreservingActiveCounts(): void;

// Bulk-copy all RemovedFlags bit-planes from theSource
CopyRemovedFlagsFrom(theSource: BRepGraphInc_Storage): void;

// Debug
ValidateRelations(): boolean;

// Verify coedge ordering consistency for a specific wire
ValidateWireCoEdgeOrder(theWireId: BRepGraph_WireId): boolean;
// theWireId: wire identifier

// Verify coedge ordering consistency for all wires
ValidateWireCoEdgeOrders(): boolean;

// Canonicalize the coedge ordering of a wire and report the achieved order quality
CanonicalizeWireCoEdgeOrderStatus(theWireId: BRepGraph_WireId): BRepGraphInc_Storage_WireCoEdgeOrderStatus;
// theWireId: wire identifier

// Canonicalize the coedge ordering of a wire to a consistent form
CanonicalizeWireCoEdgeOrder(theWireId: BRepGraph_WireId): boolean;
// theWireId: wire identifier

// Rebuild UID reverse indexes (UID->NodeId, RefUID->RefId) from the current UID vectors
RebuildUIDReverseIndexes(): void;

// Mark UID reverse indexes stale after bulk UID-vector replacement
MarkUIDReverseIndexesDirty(): void;

// Lazily rebuild the node UID reverse index if it is stale
EnsureUIDReverseIndex(): void;

// Lazily rebuild the reference UID reverse index if it is stale
EnsureRefUIDReverseIndex(): void;

// Copy all forward/reverse relation vectors directly from theSource
CopyDerivedRelationsFrom(theSource: BRepGraphInc_Storage): void;

// Return true if the node identified by the given generic NodeId has a parent compound
HasCompoundParent(theNode: BRepGraph_NodeId): boolean;
// theNode: generic node identifier

// Return true if the node identified by the given generic NodeId has a parent occurrence
HasOccurrenceParent(theNode: BRepGraph_NodeId): boolean;
// theNode: generic node identifier

// Return true if the entity identified by the given typed ID has an active MutGuard
IsGuarded(theId: BRepGraph_ItemId): boolean;
// theId: typed entity identifier

// Register an active MutGuard on the entity identified by the given typed ID
SetGuarded(theId: BRepGraph_ItemId): void;
// theId: typed entity identifier

// Deregister an active MutGuard from the entity identified by the given typed ID
ClearGuarded(theId: BRepGraph_ItemId): void;
// theId: typed entity identifier

// Return true if any entity in any store has an active MutGuard
HasAnyGuard(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
