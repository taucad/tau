# libcascade — IGESSolid

41 top-level symbols. Signatures are verbatim typescript.

IGESSolid: declare class IGESSolid

constructor

static Init(): void;

static Protocol(): IGESSolid_Protocol;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Block: declare class IGESSolid_Block extends IGESData_IGESEntity

constructor

Init(aSize: gp_XYZ, aCorner: gp_XYZ, aXAxis: gp_XYZ, aZAxis: gp_XYZ): void;

Size(): gp_XYZ;

XLength(): number;

YLength(): number;

ZLength(): number;

Corner(): gp_Pnt;

TransformedCorner(): gp_Pnt;

XAxis(): gp_Dir;

TransformedXAxis(): gp_Dir;

YAxis(): gp_Dir;

TransformedYAxis(): gp_Dir;

ZAxis(): gp_Dir;

TransformedZAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_BooleanTree: declare class IGESSolid_BooleanTree extends IGESData_IGESEntity

constructor

Init(operands: NCollection_HArray1_handle_IGESData_IGESEntity, operations: NCollection_HArray1_int): void;

Length(): number;

IsOperand(Index: number): boolean;

Operand(Index: number): IGESData_IGESEntity;

Operation(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ConeFrustum: declare class IGESSolid_ConeFrustum extends IGESData_IGESEntity

constructor

Init(Ht: number, R1: number, R2: number, Center: gp_XYZ, anAxis: gp_XYZ): void;

Height(): number;

LargerRadius(): number;

SmallerRadius(): number;

FaceCenter(): gp_Pnt;

TransformedFaceCenter(): gp_Pnt;

Axis(): gp_Dir;

TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ConicalSurface: declare class IGESSolid_ConicalSurface extends IGESData_IGESEntity

constructor

Init(aLocation: IGESGeom_Point, anAxis: IGESGeom_Direction, aRadius: number, anAngle: number, aRefdir: IGESGeom_Direction): void;

LocationPoint(): IGESGeom_Point;

Axis(): IGESGeom_Direction;

Radius(): number;

SemiAngle(): number;

ReferenceDir(): IGESGeom_Direction;

IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Cylinder: declare class IGESSolid_Cylinder extends IGESData_IGESEntity

constructor

Init(aHeight: number, aRadius: number, aCenter: gp_XYZ, anAxis: gp_XYZ): void;

Height(): number;

Radius(): number;

FaceCenter(): gp_Pnt;

TransformedFaceCenter(): gp_Pnt;

Axis(): gp_Dir;

TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_CylindricalSurface: declare class IGESSolid_CylindricalSurface extends IGESData_IGESEntity

constructor

Init(aLocation: IGESGeom_Point, anAxis: IGESGeom_Direction, aRadius: number, aRefdir: IGESGeom_Direction): void;

LocationPoint(): IGESGeom_Point;

Axis(): IGESGeom_Direction;

Radius(): number;

IsParametrised(): boolean;

ReferenceDir(): IGESGeom_Direction;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_EdgeList: declare class IGESSolid_EdgeList extends IGESData_IGESEntity

constructor

Init(curves: NCollection_HArray1_handle_IGESData_IGESEntity, startVertexList: NCollection_HArray1_handle_IGESSolid_VertexList, startVertexIndex: NCollection_HArray1_int, endVertexList: NCollection_HArray1_handle_IGESSolid_VertexList, endVertexIndex: NCollection_HArray1_int): void;

NbEdges(): number;

Curve(num: number): IGESData_IGESEntity;

StartVertexList(num: number): IGESSolid_VertexList;

StartVertexIndex(num: number): number;

EndVertexList(num: number): IGESSolid_VertexList;

EndVertexIndex(num: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Ellipsoid: declare class IGESSolid_Ellipsoid extends IGESData_IGESEntity

constructor

Init(aSize: gp_XYZ, aCenter: gp_XYZ, anXAxis: gp_XYZ, anZAxis: gp_XYZ): void;

Size(): gp_XYZ;

XLength(): number;

YLength(): number;

ZLength(): number;

Center(): gp_Pnt;

TransformedCenter(): gp_Pnt;

XAxis(): gp_Dir;

TransformedXAxis(): gp_Dir;

YAxis(): gp_Dir;

TransformedYAxis(): gp_Dir;

ZAxis(): gp_Dir;

TransformedZAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Face: declare class IGESSolid_Face extends IGESData_IGESEntity

constructor

Init(aSurface: IGESData_IGESEntity, outerLoopFlag: boolean, loops: NCollection_HArray1_handle_IGESSolid_Loop): void;

Surface(): IGESData_IGESEntity;

NbLoops(): number;

HasOuterLoop(): boolean;

Loop(Index: number): IGESSolid_Loop;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_GeneralModule: declare class IGESSolid_GeneralModule extends IGESData_GeneralModule

constructor

DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Loop: declare class IGESSolid_Loop extends IGESData_IGESEntity

constructor

Init(types: NCollection_HArray1_int, edges: NCollection_HArray1_handle_IGESData_IGESEntity, index: NCollection_HArray1_int, orient: NCollection_HArray1_int, nbParameterCurves: NCollection_HArray1_int, isoparametricFlags: IGESBasic_HArray1OfHArray1OfInteger, curves: IGESBasic_HArray1OfHArray1OfIGESEntity): void;

IsBound(): boolean;

SetBound(bound: boolean): void;

NbEdges(): number;

EdgeType(Index: number): number;

Edge(Index: number): IGESData_IGESEntity;

Orientation(Index: number): boolean;

NbParameterCurves(Index: number): number;

IsIsoparametric(EdgeIndex: number, CurveIndex: number): boolean;

ParametricCurve(EdgeIndex: number, CurveIndex: number): IGESData_IGESEntity;

ListIndex(num: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ManifoldSolid: declare class IGESSolid_ManifoldSolid extends IGESData_IGESEntity

constructor

Init(aShell: IGESSolid_Shell, shellflag: boolean, voidShells: NCollection_HArray1_handle_IGESSolid_Shell, voidShellFlags: NCollection_HArray1_int): void;

Shell(): IGESSolid_Shell;

OrientationFlag(): boolean;

NbVoidShells(): number;

VoidShell(Index: number): IGESSolid_Shell;

VoidOrientationFlag(Index: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_PlaneSurface: declare class IGESSolid_PlaneSurface extends IGESData_IGESEntity

constructor

Init(aLocation: IGESGeom_Point, aNormal: IGESGeom_Direction, refdir: IGESGeom_Direction): void;

LocationPoint(): IGESGeom_Point;

Normal(): IGESGeom_Direction;

ReferenceDir(): IGESGeom_Direction;

IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Protocol: declare class IGESSolid_Protocol extends IGESData_Protocol

constructor

NbResources(): number;

Resource(num: number): Interface_Protocol;

TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ReadWriteModule: declare class IGESSolid_ReadWriteModule extends IGESData_ReadWriteModule

constructor

CaseIGES(typenum: number, formnum: number): number;

WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_RightAngularWedge: declare class IGESSolid_RightAngularWedge extends IGESData_IGESEntity

constructor

Init(aSize: gp_XYZ, lowX: number, aCorner: gp_XYZ, anXAxis: gp_XYZ, anZAxis: gp_XYZ): void;

Size(): gp_XYZ;

XBigLength(): number;

XSmallLength(): number;

YLength(): number;

ZLength(): number;

Corner(): gp_Pnt;

TransformedCorner(): gp_Pnt;

XAxis(): gp_Dir;

TransformedXAxis(): gp_Dir;

YAxis(): gp_Dir;

TransformedYAxis(): gp_Dir;

ZAxis(): gp_Dir;

TransformedZAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SelectedComponent: declare class IGESSolid_SelectedComponent extends IGESData_IGESEntity

constructor

Init(anEntity: IGESSolid_BooleanTree, selectPnt: gp_XYZ): void;

Component(): IGESSolid_BooleanTree;

SelectPoint(): gp_Pnt;

TransformedSelectPoint(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Shell: declare class IGESSolid_Shell extends IGESData_IGESEntity

constructor

Init(allFaces: NCollection_HArray1_handle_IGESSolid_Face, allOrient: NCollection_HArray1_int): void;

IsClosed(): boolean;

SetClosed(closed: boolean): void;

NbFaces(): number;

Face(Index: number): IGESSolid_Face;

Orientation(Index: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SolidAssembly: declare class IGESSolid_SolidAssembly extends IGESData_IGESEntity

constructor

Init(allItems: NCollection_HArray1_handle_IGESData_IGESEntity, allMatrices: NCollection_HArray1_handle_IGESGeom_TransformationMatrix): void;

HasBrep(): boolean;

SetBrep(hasbrep: boolean): void;

NbItems(): number;

Item(Index: number): IGESData_IGESEntity;

TransfMatrix(Index: number): IGESGeom_TransformationMatrix;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SolidInstance: declare class IGESSolid_SolidInstance extends IGESData_IGESEntity

constructor

Init(anEntity: IGESData_IGESEntity): void;

IsBrep(): boolean;

SetBrep(brep: boolean): void;

Entity(): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SolidOfLinearExtrusion: declare class IGESSolid_SolidOfLinearExtrusion extends IGESData_IGESEntity

constructor

Init(aCurve: IGESData_IGESEntity, aLength: number, aDirection: gp_XYZ): void;

Curve(): IGESData_IGESEntity;

ExtrusionLength(): number;

ExtrusionDirection(): gp_Dir;

TransformedExtrusionDirection(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SolidOfRevolution: declare class IGESSolid_SolidOfRevolution extends IGESData_IGESEntity

constructor

Init(aCurve: IGESData_IGESEntity, aFract: number, aAxisPnt: gp_XYZ, aDirection: gp_XYZ): void;

SetClosedToAxis(mode: boolean): void;

IsClosedToAxis(): boolean;

Curve(): IGESData_IGESEntity;

Fraction(): number;

AxisPoint(): gp_Pnt;

TransformedAxisPoint(): gp_Pnt;

Axis(): gp_Dir;

TransformedAxis(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SpecificModule: declare class IGESSolid_SpecificModule extends IGESData_SpecificModule

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_Sphere: declare class IGESSolid_Sphere extends IGESData_IGESEntity

constructor

Init(aRadius: number, aCenter: gp_XYZ): void;

Radius(): number;

Center(): gp_Pnt;

TransformedCenter(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_SphericalSurface: declare class IGESSolid_SphericalSurface extends IGESData_IGESEntity

constructor

Init(aCenter: IGESGeom_Point, aRadius: number, anAxis: IGESGeom_Direction, aRefdir: IGESGeom_Direction): void;

Center(): IGESGeom_Point;

TransformedCenter(): gp_Pnt;

Radius(): number;

Axis(): IGESGeom_Direction;

ReferenceDir(): IGESGeom_Direction;

IsParametrised(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolBlock: declare class IGESSolid_ToolBlock

constructor

WriteOwnParams(ent: IGESSolid_Block, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Block): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Block, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Block, entto: IGESSolid_Block, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolBooleanTree: declare class IGESSolid_ToolBooleanTree

constructor

WriteOwnParams(ent: IGESSolid_BooleanTree, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_BooleanTree): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_BooleanTree, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_BooleanTree, entto: IGESSolid_BooleanTree, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolConeFrustum: declare class IGESSolid_ToolConeFrustum

constructor

WriteOwnParams(ent: IGESSolid_ConeFrustum, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_ConeFrustum): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_ConeFrustum, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_ConeFrustum, entto: IGESSolid_ConeFrustum, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolConicalSurface: declare class IGESSolid_ToolConicalSurface

constructor

WriteOwnParams(ent: IGESSolid_ConicalSurface, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_ConicalSurface): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_ConicalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_ConicalSurface, entto: IGESSolid_ConicalSurface, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolCylinder: declare class IGESSolid_ToolCylinder

constructor

WriteOwnParams(ent: IGESSolid_Cylinder, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Cylinder): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Cylinder, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Cylinder, entto: IGESSolid_Cylinder, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolCylindricalSurface: declare class IGESSolid_ToolCylindricalSurface

constructor

WriteOwnParams(ent: IGESSolid_CylindricalSurface, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_CylindricalSurface): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_CylindricalSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_CylindricalSurface, entto: IGESSolid_CylindricalSurface, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolEdgeList: declare class IGESSolid_ToolEdgeList

constructor

WriteOwnParams(ent: IGESSolid_EdgeList, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_EdgeList): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_EdgeList, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_EdgeList, entto: IGESSolid_EdgeList, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolEllipsoid: declare class IGESSolid_ToolEllipsoid

constructor

WriteOwnParams(ent: IGESSolid_Ellipsoid, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Ellipsoid): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Ellipsoid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Ellipsoid, entto: IGESSolid_Ellipsoid, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolFace: declare class IGESSolid_ToolFace

constructor

WriteOwnParams(ent: IGESSolid_Face, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Face): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Face, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Face, entto: IGESSolid_Face, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolLoop: declare class IGESSolid_ToolLoop

constructor

WriteOwnParams(ent: IGESSolid_Loop, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Loop): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Loop, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Loop, entto: IGESSolid_Loop, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolManifoldSolid: declare class IGESSolid_ToolManifoldSolid

constructor

WriteOwnParams(ent: IGESSolid_ManifoldSolid, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_ManifoldSolid): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_ManifoldSolid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_ManifoldSolid, entto: IGESSolid_ManifoldSolid, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolPlaneSurface: declare class IGESSolid_ToolPlaneSurface

constructor

WriteOwnParams(ent: IGESSolid_PlaneSurface, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_PlaneSurface): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_PlaneSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_PlaneSurface, entto: IGESSolid_PlaneSurface, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolRightAngularWedge: declare class IGESSolid_ToolRightAngularWedge

constructor

WriteOwnParams(ent: IGESSolid_RightAngularWedge, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_RightAngularWedge): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_RightAngularWedge, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_RightAngularWedge, entto: IGESSolid_RightAngularWedge, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolSelectedComponent: declare class IGESSolid_ToolSelectedComponent

constructor

WriteOwnParams(ent: IGESSolid_SelectedComponent, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_SelectedComponent): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_SelectedComponent, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_SelectedComponent, entto: IGESSolid_SelectedComponent, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESSolid_ToolShell: declare class IGESSolid_ToolShell

constructor

WriteOwnParams(ent: IGESSolid_Shell, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESSolid_Shell): IGESData_DirChecker;

OwnCheck(ent: IGESSolid_Shell, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESSolid_Shell, entto: IGESSolid_Shell, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;
