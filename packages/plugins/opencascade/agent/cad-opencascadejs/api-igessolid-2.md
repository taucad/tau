# libcascade — IGESSolid (2)

30 top-level symbols. Signatures are verbatim typescript.

// defines SolidInstance, Type <430> Form Number <0> in package {@link IGESSolid`IGESSolid`} This provides a mechanism for replicating a solid representation
IGESSolid_SolidInstance: declare class IGESSolid_SolidInstance extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SolidInstance
Init(anEntity: IGESData_IGESEntity): void;

// Tells if a SolidInstance is for a BREP Default is False
IsBrep(): boolean;

// Sets or unsets the Brep status (FormNumber = 1 else 0)
SetBrep(brep: boolean): void;

// returns the solid entity
Entity(): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SolidOfLinearExtrusion, Type <164> Form Number <0> in package {@link IGESSolid`IGESSolid`} Solid of linear extrusion is defined by translating an area determined by a planar curve
IGESSolid_SolidOfLinearExtrusion: declare class IGESSolid_SolidOfLinearExtrusion extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SolidOfLinearExtrusion
Init(aCurve: IGESData_IGESEntity, aLength: number, aDirection: gp_XYZ): void;

// returns the planar curve that is to be translated
Curve(): IGESData_IGESEntity;

// returns the Extrusion Length
ExtrusionLength(): number;

// returns the Extrusion direction
ExtrusionDirection(): gp_Dir;

// returns ExtrusionDirection after applying TransformationMatrix
TransformedExtrusionDirection(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SolidOfRevolution, Type <162> Form Number <0,1> in package {@link IGESSolid`IGESSolid`} This entity is defined by revolving the area determined by a planar curve about a specified axis through a given fraction of full rotation
IGESSolid_SolidOfRevolution: declare class IGESSolid_SolidOfRevolution extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SolidOfRevolution
Init(aCurve: IGESData_IGESEntity, aFract: number, aAxisPnt: gp_XYZ, aDirection: gp_XYZ): void;

// Sets the Curve to be by default, Closed to Axis (Form 0) if <mode> is True, Closed to Itself (Form 1) else
SetClosedToAxis(mode: boolean): void;

// Returns True if Form Number = 0 if Form no is 0, then the curve is closed to axis if 1, the curve is closed to itself
IsClosedToAxis(): boolean;

// returns the curve entity that is to be revolved
Curve(): IGESData_IGESEntity;

// returns the fraction of full rotation that the curve is to be rotated
Fraction(): number;

// returns the point on the axis
AxisPoint(): gp_Pnt;

// returns the point on the axis after applying Trans.Matrix
TransformedAxisPoint(): gp_Pnt;

// returns the direction of the axis
Axis(): gp_Dir;

// returns the direction of the axis after applying TransformationMatrix
TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESSolid_SpecificModule: declare class IGESSolid_SpecificModule extends IGESData_SpecificModule

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Sphere, Type <158> Form Number <0> in package {@link IGESSolid`IGESSolid`} This defines a sphere with a center and radius
IGESSolid_Sphere: declare class IGESSolid_Sphere extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Sphere
Init(aRadius: number, aCenter: gp_XYZ): void;

// returns the radius of the sphere
Radius(): number;

// returns the center of the sphere
Center(): gp_Pnt;

// returns the center of the sphere after applying TransformationMatrix
TransformedCenter(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SphericalSurface, Type <196> Form Number <0,1> in package {@link IGESSolid`IGESSolid`} Spherical surface is defined by a center and radius
IGESSolid_SphericalSurface: declare class IGESSolid_SphericalSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SphericalSurface
Init(aCenter: IGESGeom_Point, aRadius: number, anAxis: IGESGeom_Direction, aRefdir: IGESGeom_Direction): void;

// returns the center of the spherical surface
Center(): IGESGeom_Point;

// returns the center of the spherical surface after applying TransformationMatrix
TransformedCenter(): gp_Pnt;

// returns the radius of the spherical surface
Radius(): number;

// returns the direction of the axis (Parametrised surface) Null is returned if the surface is not parametrised
Axis(): IGESGeom_Direction;

// returns the reference direction (Parametrised surface) Null is returned if the surface is not parametrised
ReferenceDir(): IGESGeom_Direction;

// Returns True if the surface is parametrised, else False
IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Block
IGESSolid_ToolBlock: declare class IGESSolid_ToolBlock

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Block, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Block): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Block, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Block, entto: IGESSolid_Block, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a BooleanTree
IGESSolid_ToolBooleanTree: declare class IGESSolid_ToolBooleanTree

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_BooleanTree, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_BooleanTree): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_BooleanTree, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_BooleanTree, entto: IGESSolid_BooleanTree, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ConeFrustum
IGESSolid_ToolConeFrustum: declare class IGESSolid_ToolConeFrustum

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_ConeFrustum, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_ConeFrustum): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_ConeFrustum, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_ConeFrustum, entto: IGESSolid_ConeFrustum, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ConicalSurface
IGESSolid_ToolConicalSurface: declare class IGESSolid_ToolConicalSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_ConicalSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_ConicalSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_ConicalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_ConicalSurface, entto: IGESSolid_ConicalSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Cylinder
IGESSolid_ToolCylinder: declare class IGESSolid_ToolCylinder

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Cylinder, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Cylinder): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Cylinder, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Cylinder, entto: IGESSolid_Cylinder, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CylindricalSurface
IGESSolid_ToolCylindricalSurface: declare class IGESSolid_ToolCylindricalSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_CylindricalSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_CylindricalSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_CylindricalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_CylindricalSurface, entto: IGESSolid_CylindricalSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a EdgeList
IGESSolid_ToolEdgeList: declare class IGESSolid_ToolEdgeList

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_EdgeList, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_EdgeList): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_EdgeList, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_EdgeList, entto: IGESSolid_EdgeList, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Ellipsoid
IGESSolid_ToolEllipsoid: declare class IGESSolid_ToolEllipsoid

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Ellipsoid, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Ellipsoid): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Ellipsoid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Ellipsoid, entto: IGESSolid_Ellipsoid, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Face
IGESSolid_ToolFace: declare class IGESSolid_ToolFace

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Face, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Face): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Face, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Face, entto: IGESSolid_Face, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Loop
IGESSolid_ToolLoop: declare class IGESSolid_ToolLoop

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Loop, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Loop): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Loop, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Loop, entto: IGESSolid_Loop, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ManifoldSolid
IGESSolid_ToolManifoldSolid: declare class IGESSolid_ToolManifoldSolid

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_ManifoldSolid, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_ManifoldSolid): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_ManifoldSolid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_ManifoldSolid, entto: IGESSolid_ManifoldSolid, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PlaneSurface
IGESSolid_ToolPlaneSurface: declare class IGESSolid_ToolPlaneSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_PlaneSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_PlaneSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_PlaneSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_PlaneSurface, entto: IGESSolid_PlaneSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a RightAngularWedge
IGESSolid_ToolRightAngularWedge: declare class IGESSolid_ToolRightAngularWedge

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_RightAngularWedge, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_RightAngularWedge): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_RightAngularWedge, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_RightAngularWedge, entto: IGESSolid_RightAngularWedge, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SelectedComponent
IGESSolid_ToolSelectedComponent: declare class IGESSolid_ToolSelectedComponent

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_SelectedComponent, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_SelectedComponent): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_SelectedComponent, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_SelectedComponent, entto: IGESSolid_SelectedComponent, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Shell
IGESSolid_ToolShell: declare class IGESSolid_ToolShell

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Shell, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Shell): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Shell, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Shell, entto: IGESSolid_Shell, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SolidAssembly
IGESSolid_ToolSolidAssembly: declare class IGESSolid_ToolSolidAssembly

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_SolidAssembly, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_SolidAssembly): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_SolidAssembly, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_SolidAssembly, entto: IGESSolid_SolidAssembly, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SolidInstance
IGESSolid_ToolSolidInstance: declare class IGESSolid_ToolSolidInstance

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_SolidInstance, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_SolidInstance): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_SolidInstance, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_SolidInstance, entto: IGESSolid_SolidInstance, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SolidOfLinearExtrusion
IGESSolid_ToolSolidOfLinearExtrusion: declare class IGESSolid_ToolSolidOfLinearExtrusion

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_SolidOfLinearExtrusion, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_SolidOfLinearExtrusion): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_SolidOfLinearExtrusion, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_SolidOfLinearExtrusion, entto: IGESSolid_SolidOfLinearExtrusion, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SolidOfRevolution
IGESSolid_ToolSolidOfRevolution: declare class IGESSolid_ToolSolidOfRevolution

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_SolidOfRevolution, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_SolidOfRevolution): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_SolidOfRevolution, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_SolidOfRevolution, entto: IGESSolid_SolidOfRevolution, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Sphere
IGESSolid_ToolSphere: declare class IGESSolid_ToolSphere

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Sphere, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Sphere): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Sphere, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Sphere, entto: IGESSolid_Sphere, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SphericalSurface
IGESSolid_ToolSphericalSurface: declare class IGESSolid_ToolSphericalSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_SphericalSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_SphericalSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_SphericalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_SphericalSurface, entto: IGESSolid_SphericalSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ToroidalSurface
IGESSolid_ToolToroidalSurface: declare class IGESSolid_ToolToroidalSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_ToroidalSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_ToroidalSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_ToroidalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_ToroidalSurface, entto: IGESSolid_ToroidalSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Torus
IGESSolid_ToolTorus: declare class IGESSolid_ToolTorus

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_Torus, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_Torus): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_Torus, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_Torus, entto: IGESSolid_Torus, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a VertexList
IGESSolid_ToolVertexList: declare class IGESSolid_ToolVertexList

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESSolid_VertexList, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESSolid_VertexList): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESSolid_VertexList, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESSolid_VertexList, entto: IGESSolid_VertexList, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
