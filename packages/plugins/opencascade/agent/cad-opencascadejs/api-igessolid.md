# libcascade — IGESSolid

20 top-level symbols. Signatures are verbatim typescript.

// This package consists of B-Rep and CSG Solid entities
IGESSolid: declare class IGESSolid

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESSolid_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Block, Type <150> Form Number <0> in package {@link IGESSolid`IGESSolid`} The Block is a rectangular parallelopiped, defined with one vertex at (X1, Y1, Z1) and three edges lying along the local +X, +Y, +Z axes
IGESSolid_Block: declare class IGESSolid_Block extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Block
Init(aSize: gp_XYZ, aCorner: gp_XYZ, aXAxis: gp_XYZ, aZAxis: gp_XYZ): void;

// returns the size of the block
Size(): gp_XYZ;

// returns the length of the Block along the local X-direction
XLength(): number;

// returns the length of the Block along the local Y-direction
YLength(): number;

// returns the length of the Block along the local Z-direction
ZLength(): number;

// returns the corner point coordinates of the Block
Corner(): gp_Pnt;

// returns the corner point coordinates of the Block after applying the TransformationMatrix
TransformedCorner(): gp_Pnt;

// returns the direction defining the local X-axis
XAxis(): gp_Dir;

// returns the direction defining the local X-axis after applying TransformationMatrix
TransformedXAxis(): gp_Dir;

// returns the direction defining the local Y-axis it is the cross product of ZAxis and XAxis
YAxis(): gp_Dir;

// returns the direction defining the local Y-axis after applying TransformationMatrix
TransformedYAxis(): gp_Dir;

// returns the direction defining the local X-axis
ZAxis(): gp_Dir;

// returns the direction defining the local Z-axis after applying TransformationMatrix
TransformedZAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines BooleanTree, Type <180> Form Number <0> in package {@link IGESSolid`IGESSolid`} The Boolean tree describes a binary tree structure composed of regularized Boolean operations and operands, in post-order notation
IGESSolid_BooleanTree: declare class IGESSolid_BooleanTree extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class BooleanTree
Init(operands: NCollection_HArray1_handle_IGESData_IGESEntity, operations: NCollection_HArray1_int): void;

// returns the length of the post-order list
Length(): number;

// returns True if Index'th value in the post-order list is an Operand
IsOperand(Index: number): boolean;

// returns the Index'th value in the post-order list only if it is an operand else returns NULL raises exception if Index < 1 or Index > `Length()`
Operand(Index: number): IGESData_IGESEntity;

// returns the Index'th value in the post-order list only if it is an operation else returns 0 raises exception if Index < 1 or Index > `Length()`
Operation(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ConeFrustum, Type <156> Form Number <0> in package {@link IGESSolid`IGESSolid`} The Cone Frustum is defined by the center of the larger circular face of the frustum, its radius, a unit vector in the axis direction, a height in this direction and a second circular face with radius which is lesser than the first face
IGESSolid_ConeFrustum: declare class IGESSolid_ConeFrustum extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ConeFrustum
Init(Ht: number, R1: number, R2: number, Center: gp_XYZ, anAxis: gp_XYZ): void;

// returns the height of the cone frustum
Height(): number;

// returns the radius of the larger face of the cone frustum
LargerRadius(): number;

// returns the radius of the second face of the cone frustum
SmallerRadius(): number;

// returns the center of the larger face of the cone frustum
FaceCenter(): gp_Pnt;

// returns the center of the larger face of the cone frustum after applying TransformationMatrix
TransformedFaceCenter(): gp_Pnt;

// returns the direction of the axis of the cone frustum
Axis(): gp_Dir;

// returns the direction of the axis of the cone frustum after applying TransformationMatrix
TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ConicalSurface, Type <194> Form Number <0,1> in package {@link IGESSolid`IGESSolid`} The right circular conical surface is defined by a point on the axis on the cone, the direction of the axis of the cone, the radius of the cone at the axis point and the cone semi-angle
IGESSolid_ConicalSurface: declare class IGESSolid_ConicalSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ConicalSurface
Init(aLocation: IGESGeom_Point, anAxis: IGESGeom_Direction, aRadius: number, anAngle: number, aRefdir: IGESGeom_Direction): void;

// returns the location of the point on the axis
LocationPoint(): IGESGeom_Point;

// returns the direction of the axis
Axis(): IGESGeom_Direction;

// returns the radius at the axis point
Radius(): number;

// returns the semi-angle value
SemiAngle(): number;

// returns the reference direction of the conical surface in case of parametrised surface
ReferenceDir(): IGESGeom_Direction;

// returns True if Form no is 1 else false
IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Cylinder, Type <154> Form Number <0> in package {@link IGESSolid`IGESSolid`} This defines a solid cylinder
IGESSolid_Cylinder: declare class IGESSolid_Cylinder extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Cylinder
Init(aHeight: number, aRadius: number, aCenter: gp_XYZ, anAxis: gp_XYZ): void;

// returns the cylinder height
Height(): number;

// returns the cylinder radius
Radius(): number;

// returns the first face center coordinates
FaceCenter(): gp_Pnt;

// returns the first face center after applying TransformationMatrix
TransformedFaceCenter(): gp_Pnt;

// returns the vector in axis direction
Axis(): gp_Dir;

// returns the vector in axis direction after applying TransformationMatrix
TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines CylindricalSurface, Type <192> Form Number <0,1> in package {@link IGESSolid`IGESSolid`}
IGESSolid_CylindricalSurface: declare class IGESSolid_CylindricalSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CylindricalSurface
Init(aLocation: IGESGeom_Point, anAxis: IGESGeom_Direction, aRadius: number, aRefdir: IGESGeom_Direction): void;

// returns the point on the axis
LocationPoint(): IGESGeom_Point;

// returns the direction on the axis
Axis(): IGESGeom_Direction;

// returns the radius at the axis point
Radius(): number;

// returns whether the surface is parametrised or not
IsParametrised(): boolean;

// returns the reference direction only for parametrised surface else returns NULL
ReferenceDir(): IGESGeom_Direction;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines EdgeList, Type <504> Form <1> in package {@link IGESSolid`IGESSolid`} EdgeList is defined as a segment joining two vertices It contains one or more edge tuples
IGESSolid_EdgeList: declare class IGESSolid_EdgeList extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class EdgeList
Init(curves: NCollection_HArray1_handle_IGESData_IGESEntity, startVertexList: NCollection_HArray1_handle_IGESSolid_VertexList, startVertexIndex: NCollection_HArray1_int, endVertexList: NCollection_HArray1_handle_IGESSolid_VertexList, endVertexIndex: NCollection_HArray1_int): void;

// returns the number of edges in the edge list
NbEdges(): number;

// returns the num'th model space curve raises Exception if num <= 0 or num > `NbEdges()`
Curve(num: number): IGESData_IGESEntity;

// returns the num'th start vertex list raises Exception if num <= 0 or num > `NbEdges()`
StartVertexList(num: number): IGESSolid_VertexList;

// returns the index of num'th start vertex in the corresponding start vertex list raises Exception if num <= 0 or num > `NbEdges()`
StartVertexIndex(num: number): number;

// returns the num'th end vertex list raises Exception if num <= 0 or num > `NbEdges()`
EndVertexList(num: number): IGESSolid_VertexList;

// returns the index of num'th end vertex in the corresponding end vertex list raises Exception if num <= 0 or num > `NbEdges()`
EndVertexIndex(num: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Ellipsoid, Type <168> Form Number <0> in package {@link IGESSolid`IGESSolid`} The ellipsoid is a solid bounded by the surface defined by
IGESSolid_Ellipsoid: declare class IGESSolid_Ellipsoid extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Ellipsoid
Init(aSize: gp_XYZ, aCenter: gp_XYZ, anXAxis: gp_XYZ, anZAxis: gp_XYZ): void;

// returns the size
Size(): gp_XYZ;

// returns the length in the local X-direction
XLength(): number;

// returns the length in the local Y-direction
YLength(): number;

// returns the length in the local Z-direction
ZLength(): number;

// returns the center of the ellipsoid
Center(): gp_Pnt;

// returns the center of the ellipsoid after applying TransformationMatrix
TransformedCenter(): gp_Pnt;

// returns the vector corresponding to the local X-direction
XAxis(): gp_Dir;

// returns the vector corresponding to the local X-direction after applying TransformationMatrix
TransformedXAxis(): gp_Dir;

// returns the vector corresponding to the local Y-direction which is got by taking cross product of ZAxis and XAxis
YAxis(): gp_Dir;

// returns the vector corresponding to the local Y-direction (which is got by taking cross product of ZAxis and XAxis) after applying TransformationMatrix
TransformedYAxis(): gp_Dir;

// returns the vector corresponding to the local Z-direction
ZAxis(): gp_Dir;

// returns the vector corresponding to the local Z-direction after applying TransformationMatrix
TransformedZAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Face, Type <510> Form Number <1> in package {@link IGESSolid`IGESSolid`} Face entity is a bound (partial) which has finite area
IGESSolid_Face: declare class IGESSolid_Face extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Face
Init(aSurface: IGESData_IGESEntity, outerLoopFlag: boolean, loops: NCollection_HArray1_handle_IGESSolid_Loop): void;

// returns the underlying surface of the face
Surface(): IGESData_IGESEntity;

// returns the number of the loops bounding the face
NbLoops(): number;

// checks whether there is an outer loop or not
HasOuterLoop(): boolean;

// returns the Index'th loop that bounds the face raises exception if Index < 0 or Index >= NbLoops
Loop(Index: number): IGESSolid_Loop;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESSolid`IGESSolid`} (specific part) This Services comprise
IGESSolid_GeneralModule: declare class IGESSolid_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity Shape for all
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Loop, Type <508> Form Number <1> in package {@link IGESSolid`IGESSolid`} A Loop entity specifies a bound of a face
IGESSolid_Loop: declare class IGESSolid_Loop extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Loop
Init(types: NCollection_HArray1_int, edges: NCollection_HArray1_handle_IGESData_IGESEntity, index: NCollection_HArray1_int, orient: NCollection_HArray1_int, nbParameterCurves: NCollection_HArray1_int, isoparametricFlags: IGESBasic_HArray1OfHArray1OfInteger, curves: IGESBasic_HArray1OfHArray1OfIGESEntity): void;

// Tells if a Loop is a Bound (FN 1) else it is free (FN 0)
IsBound(): boolean;

// Sets or Unset the Bound Status (from Form Number) Default is True
SetBound(bound: boolean): void;

// returns the number of edge tuples
NbEdges(): number;

// returns the type of Index'th edge (0 = Edge, 1 = Vertex) raises exception if Index <= 0 or Index > `NbEdges()`
EdgeType(Index: number): number;

// return the EdgeList or VertexList corresponding to the Index raises exception if Index <= 0 or Index > `NbEdges()`
Edge(Index: number): IGESData_IGESEntity;

// returns the orientation flag corresponding to Index'th edge raises exception if Index <= 0 or Index > `NbEdges()`
Orientation(Index: number): boolean;

// return the number of parameter space curves associated with Index'th Edge raises exception if Index <= 0 or Index > `NbEdges()`
NbParameterCurves(Index: number): number;

IsIsoparametric(EdgeIndex: number, CurveIndex: number): boolean;

// returns the CurveIndex'th parameter space curve associated with EdgeIndex'th edge raises exception if EdgeIndex <= 0 or EdgeIndex > `NbEdges()` or if CurveIndex <= 0 or CurveIndex > NbParameterCurves(EdgeIndex)
ParametricCurve(EdgeIndex: number, CurveIndex: number): IGESData_IGESEntity;

// raises exception If num <= 0 or num > `NbEdges()`
ListIndex(num: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ManifoldSolid, Type <186> Form Number <0> in package {@link IGESSolid`IGESSolid`} A manifold solid is a bounded, closed, and finite volume in three dimensional Euclidean space
IGESSolid_ManifoldSolid: declare class IGESSolid_ManifoldSolid extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ManifoldSolid
Init(aShell: IGESSolid_Shell, shellflag: boolean, voidShells: NCollection_HArray1_handle_IGESSolid_Shell, voidShellFlags: NCollection_HArray1_int): void;

// returns the Shell entity which is being referred
Shell(): IGESSolid_Shell;

// returns the orientation flag of the shell
OrientationFlag(): boolean;

// returns the number of void shells
NbVoidShells(): number;

// returns Index'th void shell
VoidShell(Index: number): IGESSolid_Shell;

// returns Index'th orientation flag
VoidOrientationFlag(Index: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines PlaneSurface, Type <190> Form Number <0,1> in package {@link IGESSolid`IGESSolid`} A plane surface entity is defined by a point on the surface and a normal to it
IGESSolid_PlaneSurface: declare class IGESSolid_PlaneSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class PlaneSurface
Init(aLocation: IGESGeom_Point, aNormal: IGESGeom_Direction, refdir: IGESGeom_Direction): void;

// returns the point on the surface
LocationPoint(): IGESGeom_Point;

// returns the normal to the surface
Normal(): IGESGeom_Direction;

// returns the reference direction (for parameterised curve) returns NULL for unparameterised curve
ReferenceDir(): IGESGeom_Direction;

// returns True if parameterised, else False
IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESSolid`IGESSolid`}
IGESSolid_Protocol: declare class IGESSolid_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Solid File Access Module for {@link IGESSolid`IGESSolid`} (specific parts) Specific actions concern
IGESSolid_ReadWriteModule: declare class IGESSolid_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESSolid`IGESSolid`}
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines RightAngularWedge, Type <152> Form Number <0> in package {@link IGESSolid`IGESSolid`} A right angular wedge is a triangular/trapezoidal prism
IGESSolid_RightAngularWedge: declare class IGESSolid_RightAngularWedge extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class RightAngularWedge
Init(aSize: gp_XYZ, lowX: number, aCorner: gp_XYZ, anXAxis: gp_XYZ, anZAxis: gp_XYZ): void;

// returns the size
Size(): gp_XYZ;

// returns the length along the local X-axis
XBigLength(): number;

// returns the smaller length along the local X-direction at Y=LY
XSmallLength(): number;

// returns the length along the local Y-axis
YLength(): number;

// returns the length along the local Z-axis
ZLength(): number;

// returns the corner point coordinates
Corner(): gp_Pnt;

// returns the corner point coordinates after applying TransformationMatrix
TransformedCorner(): gp_Pnt;

// returns the direction defining the local X-axis
XAxis(): gp_Dir;

// returns the direction defining the local X-axis after applying the TransformationMatrix
TransformedXAxis(): gp_Dir;

// returns the direction defining the local Y-axis it is got by taking the cross product of ZAxis and XAxis
YAxis(): gp_Dir;

// returns the direction defining the local Y-axis after applying the TransformationMatrix
TransformedYAxis(): gp_Dir;

// returns the direction defining the local Z-axis
ZAxis(): gp_Dir;

// returns the direction defining the local Z-axis after applying the TransformationMatrix
TransformedZAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SelectedComponent, Type <182> Form Number <0> in package {@link IGESSolid`IGESSolid`} The Selected Component entity provides a means of selecting one component of a disjoint CSG solid
IGESSolid_SelectedComponent: declare class IGESSolid_SelectedComponent extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SelectedComponent
Init(anEntity: IGESSolid_BooleanTree, selectPnt: gp_XYZ): void;

// returns the Boolean tree entity
Component(): IGESSolid_BooleanTree;

// returns the point on/in the selected component
SelectPoint(): gp_Pnt;

// returns the point on/in the selected component after applying TransformationMatrix
TransformedSelectPoint(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Shell, Type <514> Form Number <1> in package {@link IGESSolid`IGESSolid`} Shell entity is a connected entity of dimensionality 2 which divides R3 into two arcwise connected open subsets, one of which is finite
IGESSolid_Shell: declare class IGESSolid_Shell extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Shell
Init(allFaces: NCollection_HArray1_handle_IGESSolid_Face, allOrient: NCollection_HArray1_int): void;

// Tells if a Shell is Closed, i.e
IsClosed(): boolean;

// Sets or Unsets the Closed status (FormNumber = 1 else 2)
SetClosed(closed: boolean): void;

// returns the number of the face entities in the shell
NbFaces(): number;

// returns the Index'th face entity of the shell raises exception if Index <= 0 or Index > `NbFaces()`
Face(Index: number): IGESSolid_Face;

// returns the orientation of Index'th face w.r.t the direction of the underlying surface raises exception if Index <= 0 or Index > `NbFaces()`
Orientation(Index: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SolidAssembly, Type <184> Form <0> in package {@link IGESSolid`IGESSolid`} Solid assembly is a collection of items which possess a shared fixed geometric relationship
IGESSolid_SolidAssembly: declare class IGESSolid_SolidAssembly extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SolidAssembly
Init(allItems: NCollection_HArray1_handle_IGESData_IGESEntity, allMatrices: NCollection_HArray1_handle_IGESGeom_TransformationMatrix): void;

// Tells if at least one item is a Brep, from FormNumber
HasBrep(): boolean;

// Sets or Unsets the status "HasBrep" from FormNumber Default is False
SetBrep(hasbrep: boolean): void;

// returns the number of items in the collection
NbItems(): number;

// returns the Index'th item raises exception if Index <= 0 or Index > `NbItems()`
Item(Index: number): IGESData_IGESEntity;

// returns the transformation matrix of the Index'th item raises exception if Index <= 0 or Index > `NbItems()`
TransfMatrix(Index: number): IGESGeom_TransformationMatrix;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
