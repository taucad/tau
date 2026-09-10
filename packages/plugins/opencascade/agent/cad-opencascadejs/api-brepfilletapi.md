# libcascade — BRepFilletAPI

3 top-level symbols. Signatures are verbatim typescript.

// Construction of fillets on the edges of a Shell
BRepFilletAPI_LocalOperation: declare class BRepFilletAPI_LocalOperation extends BRepBuilderAPI_MakeShape

// Adds a contour in the builder (builds a contour of tangent edges)
Add(E: TopoDS_Edge): void;

// Reset the contour of index IC, there is nomore information in the contour
ResetContour(IC: number): void;

// Number of contours
NbContours(): number;

// Returns the index of the contour containing the edge E, returns 0 if E doesn't belong to any contour
Contour(E: TopoDS_Edge): number;

// Number of Edges in the contour I
NbEdges(I: number): number;

// Returns the Edge J in the contour I
Edge(I: number, J: number): TopoDS_Edge;

// remove the contour containing the Edge E
Remove(E: TopoDS_Edge): void;

// returns the length the contour of index IC
Length(IC: number): number;

// Returns the first Vertex of the contour of index IC
FirstVertex(IC: number): TopoDS_Vertex;

// Returns the last Vertex of the contour of index IC
LastVertex(IC: number): TopoDS_Vertex;

// returns the abscissa of the vertex V on the contour of index IC
Abscissa(IC: number, V: TopoDS_Vertex): number;

// returns the relative abscissa([0.,1.]) of the vertex V on the contour of index IC
RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

// returns true if the contour of index IC is closed an tangent
ClosedAndTangent(IC: number): boolean;

// returns true if the contour of index IC is closed
Closed(IC: number): boolean;

// Reset all the fields updated by Build operation and leave the algorithm in the same state than before build call
Reset(): void;

Simulate(IC: number): void;

NbSurf(IC: number): number;

Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build chamfers on edges of a shell or solid
BRepFilletAPI_MakeChamfer: declare class BRepFilletAPI_MakeChamfer extends BRepFilletAPI_LocalOperation

constructor

// Adds edge E to the table of edges used by this algorithm to build chamfers, where the parameters of the chamfer must be set after the
Add(E: TopoDS_Edge): void;
Add(Dis: number, E: TopoDS_Edge): void;
Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
Add(E: TopoDS_Edge): void;
Add(Dis: number, E: TopoDS_Edge): void;
Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
Add(E: TopoDS_Edge): void;
Add(Dis: number, E: TopoDS_Edge): void;
Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;

// Sets the distances Dis1 and Dis2 which give the parameters of the chamfer along the contour of index IC generated using the Add function in the internal data structure of this algorithm
SetDist(Dis: number, IC: number, F: TopoDS_Face): void;

GetDist(IC: number, Dis?: number): { Dis: number };

// Sets the distances Dis1 and Dis2 which give the parameters of the chamfer along the contour of index IC generated using the Add function in the internal data structure of this algorithm
SetDists(Dis1: number, Dis2: number, IC: number, F: TopoDS_Face): void;

// Returns the distances Dis1 and Dis2 which give the parameters of the chamfer along the contour of index IC in the internal data structure of this algorithm
Dists(IC: number, Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

// Adds a fillet contour in the builder (builds a contour of tangent edges to <E> and sets the distance <Dis1> and angle <Angle> ( parameters of the chamfer ) )
AddDA(Dis: number, Angle: number, E: TopoDS_Edge, F: TopoDS_Face): void;

// set the distance <Dis> and <Angle> of the fillet contour of index <IC> in the DS with <Dis> on <F>
SetDistAngle(Dis: number, Angle: number, IC: number, F: TopoDS_Face): void;

// gives the distances <Dis> and <Angle> of the fillet contour of index <IC> in the DS
GetDistAngle(IC: number, Dis?: number, Angle?: number): { Dis: number; Angle: number };

// Sets the mode of chamfer
SetMode(theMode: ChFiDS_ChamfMode): void;

// return True if chamfer symmetric false else
IsSymetric(IC: number): boolean;

// return True if chamfer is made with two distances false else
IsTwoDistances(IC: number): boolean;

// return True if chamfer is made with distance and angle false else
IsDistanceAngle(IC: number): boolean;

// Erases the chamfer parameters on the contour of index IC in the internal data structure of this algorithm
ResetContour(IC: number): void;

// Returns the number of contours generated using the Add function in the internal data structure of this algorithm
NbContours(): number;

// Returns the index of the contour in the internal data structure of this algorithm, which contains the edge E of the shape
Contour(E: TopoDS_Edge): number;

// Returns the number of edges in the contour of index I in the internal data structure of this algorithm
NbEdges(I: number): number;

// Returns the edge of index J in the contour of index I in the internal data structure of this algorithm
Edge(I: number, J: number): TopoDS_Edge;

// Removes the contour in the internal data structure of this algorithm which contains the edge E of the shape
Remove(E: TopoDS_Edge): void;

// Returns the length of the contour of index IC in the internal data structure of this algorithm
Length(IC: number): number;

// Returns the first vertex of the contour of index IC in the internal data structure of this algorithm
FirstVertex(IC: number): TopoDS_Vertex;

// Returns the last vertex of the contour of index IC in the internal data structure of this algorithm
LastVertex(IC: number): TopoDS_Vertex;

// Returns the curvilinear abscissa of the vertex V on the contour of index IC in the internal data structure of this algorithm
Abscissa(IC: number, V: TopoDS_Vertex): number;

// Returns the relative curvilinear abscissa (i.e
RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

// eturns true if the contour of index IC in the internal data structure of this algorithm is closed and tangential at the point of closure
ClosedAndTangent(IC: number): boolean;

// Returns true if the contour of index IC in the internal data structure of this algorithm is closed
Closed(IC: number): boolean;

// Builds the chamfers on all the contours in the internal data structure of this algorithm and constructs the resulting shape
Build(theRange?: Message_ProgressRange): void;

// Reinitializes this algorithm, thus canceling the effects of the Build function
Reset(): void;

// Returns the internal filleting algorithm
Builder(): unknown;

// Returns the list of shapes generated from the shape <EorV>
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes modified from the shape <F>
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

Simulate(IC: number): void;

NbSurf(IC: number): number;

Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build fillets on the broken edges of a shell or solid
BRepFilletAPI_MakeFillet: declare class BRepFilletAPI_MakeFillet extends BRepFilletAPI_LocalOperation

constructor

SetParams(Tang: number, Tesp: number, T2d: number, TApp3d: number, TolApp2d: number, Fleche: number): void;

// Changes the parameters of continiuity InternalContinuity to produce fillet'surfaces with an continuity Ci (i=0,1 or 2)
SetContinuity(InternalContinuity: GeomAbs_Shape, AngularTolerance: number): void;

// Adds a fillet contour in the builder (builds a contour of tangent edges)
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(L: Law_Function, E: TopoDS_Edge): void;
Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
Add(R1: number, R2: number, E: TopoDS_Edge): void;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(L: Law_Function, E: TopoDS_Edge): void;
Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
Add(R1: number, R2: number, E: TopoDS_Edge): void;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(L: Law_Function, E: TopoDS_Edge): void;
Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
Add(R1: number, R2: number, E: TopoDS_Edge): void;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(L: Law_Function, E: TopoDS_Edge): void;
Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
Add(R1: number, R2: number, E: TopoDS_Edge): void;
Add(E: TopoDS_Edge): void;
Add(Radius: number, E: TopoDS_Edge): void;
Add(L: Law_Function, E: TopoDS_Edge): void;
Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
Add(R1: number, R2: number, E: TopoDS_Edge): void;

// Sets the parameters of the fillet along the contour of index IC generated using the Add function in the internal data structure of this algorithm, where Radius is the radius of the fillet
SetRadius(Radius: number, IC: number, IinC: number): void;
SetRadius(L: Law_Function, IC: number, IinC: number): void;
SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, IinC: number): void;
SetRadius(L: Law_Function, IC: number, IinC: number): void;
SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, IinC: number): void;
SetRadius(L: Law_Function, IC: number, IinC: number): void;
SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, IinC: number): void;
SetRadius(L: Law_Function, IC: number, IinC: number): void;
SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, IinC: number): void;
SetRadius(L: Law_Function, IC: number, IinC: number): void;
SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(R1: number, R2: number, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, IinC: number): void;
SetRadius(L: Law_Function, IC: number, IinC: number): void;
SetRadius(UandR: NCollection_Array1_gp_Pnt2d, IC: number, IinC: number): void;
SetRadius(Radius: number, IC: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, IC: number, V: TopoDS_Vertex): void;
SetRadius(R1: number, R2: number, IC: number, IinC: number): void;

// Erases the radius information on the contour of index IC in the internal data structure of this algorithm
ResetContour(IC: number): void;

// Returns true if the radius of the fillet along the contour of index IC in the internal data structure of this algorithm is constant, Warning False is returned if IC is outside the bounds of the table of contours or if E does not belong to the contour of index IC
IsConstant(IC: number): boolean;
IsConstant(IC: number, E: TopoDS_Edge): boolean;
IsConstant(IC: number): boolean;
IsConstant(IC: number, E: TopoDS_Edge): boolean;

// Returns the radius of the fillet along the contour of index IC in the internal data structure of this algorithm Warning
Radius(IC: number): number;
Radius(IC: number, E: TopoDS_Edge): number;
Radius(IC: number): number;
Radius(IC: number, E: TopoDS_Edge): number;

GetBounds(IC: number, E: TopoDS_Edge, F?: number, L?: number): { returnValue: boolean; F: number; L: number };

GetLaw(IC: number, E: TopoDS_Edge): Law_Function;

SetLaw(IC: number, E: TopoDS_Edge, L: Law_Function): void;

// Assigns FShape as the type of fillet shape built by this algorithm
SetFilletShape(FShape: ChFi3d_FilletShape): void;

// Returns the type of fillet shape built by this algorithm
GetFilletShape(): ChFi3d_FilletShape;

// Returns the number of contours generated using the Add function in the internal data structure of this algorithm
NbContours(): number;

// Returns the index of the contour in the internal data structure of this algorithm which contains the edge E of the shape
Contour(E: TopoDS_Edge): number;

// Returns the number of edges in the contour of index I in the internal data structure of this algorithm
NbEdges(I: number): number;

// Returns the edge of index J in the contour of index I in the internal data structure of this algorithm
Edge(I: number, J: number): TopoDS_Edge;

// Removes the contour in the internal data structure of this algorithm which contains the edge E of the shape
Remove(E: TopoDS_Edge): void;

// Returns the length of the contour of index IC in the internal data structure of this algorithm
Length(IC: number): number;

// Returns the first vertex of the contour of index IC in the internal data structure of this algorithm
FirstVertex(IC: number): TopoDS_Vertex;

// Returns the last vertex of the contour of index IC in the internal data structure of this algorithm
LastVertex(IC: number): TopoDS_Vertex;

// Returns the curvilinear abscissa of the vertex V on the contour of index IC in the internal data structure of this algorithm
Abscissa(IC: number, V: TopoDS_Vertex): number;

// Returns the relative curvilinear abscissa (i.e
RelativeAbscissa(IC: number, V: TopoDS_Vertex): number;

// Returns true if the contour of index IC in the internal data structure of this algorithm is closed and tangential at the point of closure
ClosedAndTangent(IC: number): boolean;

// Returns true if the contour of index IC in the internal data structure of this algorithm is closed
Closed(IC: number): boolean;

// Builds the fillets on all the contours in the internal data structure of this algorithm and constructs the resulting shape
Build(theRange?: Message_ProgressRange): void;

// Reinitializes this algorithm, thus canceling the effects of the Build function
Reset(): void;

// Returns the internal topology building algorithm
Builder(): unknown;

// Returns the list of shapes generated from the shape <EorV>
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes modified from the shape <F>
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

// returns the number of surfaces after the shape creation
NbSurfaces(): number;

// Return the faces created for surface _._
NewFaces(I: number): NCollection_List_TopoDS_Shape;

Simulate(IC: number): void;

NbSurf(IC: number): number;

Sect(IC: number, IS: number): NCollection_HArray1_ChFiDS_CircSection;

// Returns the number of contours where the computation of the fillet failed
NbFaultyContours(): number;

// for each I in [1.
FaultyContour(I: number): number;

// returns the number of surfaces which have been computed on the contour IC
NbComputedSurfaces(IC: number): number;

// returns the surface number IS concerning the contour IC
ComputedSurface(IC: number, IS: number): Geom_Surface;

// returns the number of vertices where the computation failed
NbFaultyVertices(): number;

// returns the vertex where the computation failed
FaultyVertex(IV: number): TopoDS_Vertex;

// returns true if a part of the result has been computed if the filling in a corner failed a shape with a hole is returned
HasResult(): boolean;

// if (`HasResult()`) returns the partial result
BadShape(): TopoDS_Shape;

// returns the status concerning the contour IC in case of error ChFiDS_Ok
StripeStatus(IC: number): ChFiDS_ErrorStatus;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
