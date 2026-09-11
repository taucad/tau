# libcascade — ShapeExtend

10 top-level symbols. Signatures are verbatim typescript.

ShapeExtend: declare class ShapeExtend

constructor

static Init(): void;

static EncodeStatus(status: ShapeExtend_Status): number;

static DecodeStatus(flag: number, status: ShapeExtend_Status): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_BasicMsgRegistrator: declare class ShapeExtend_BasicMsgRegistrator extends Standard_Transient

constructor

Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_ComplexCurve: declare class ShapeExtend_ComplexCurve extends Geom_Curve

NbCurves(): number;

Curve(index: number): Geom_Curve;

LocateParameter(U: number, UOut: number): { returnValue: number; UOut: number };

LocalToGlobal(index: number, Ulocal: number): number;

Transform(T: gp_Trsf): void;

ReversedParameter(U: number): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

EvalD0(U: number): gp_Pnt;

EvalD1(U: number): Geom_Curve_ResD1;

EvalD2(U: number): Geom_Curve_ResD2;

EvalD3(U: number): Geom_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec;

GetScaleFactor(ind: number): number;

CheckConnectivity(Preci: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_CompositeSurface: declare class ShapeExtend_CompositeSurface extends Geom_Surface

constructor

Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, param: ShapeExtend_Parametrisation): boolean;
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, UJoints: NCollection_Array1_double, VJoints: NCollection_Array1_double): boolean;
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, param: ShapeExtend_Parametrisation): boolean;
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, UJoints: NCollection_Array1_double, VJoints: NCollection_Array1_double): boolean;

NbUPatches(): number;

NbVPatches(): number;

Patch(pnt: gp_Pnt2d): Geom_Surface;
Patch(i: number, j: number): Geom_Surface;
Patch(U: number, V: number): Geom_Surface;
Patch(pnt: gp_Pnt2d): Geom_Surface;
Patch(i: number, j: number): Geom_Surface;
Patch(U: number, V: number): Geom_Surface;
Patch(pnt: gp_Pnt2d): Geom_Surface;
Patch(i: number, j: number): Geom_Surface;
Patch(U: number, V: number): Geom_Surface;

Patches(): NCollection_HArray2_handle_Geom_Surface;

UJointValues(): NCollection_HArray1_double;

VJointValues(): NCollection_HArray1_double;

UJointValue(i: number): number;

VJointValue(j: number): number;

SetUJointValues(UJoints: NCollection_Array1_double): boolean;

SetVJointValues(VJoints: NCollection_Array1_double): boolean;

SetUFirstValue(UFirst: number): void;

SetVFirstValue(VFirst: number): void;

LocateUParameter(U: number): number;

LocateVParameter(V: number): number;

LocateUVPoint(pnt: gp_Pnt2d, i?: number, j?: number): { i: number; j: number };

ULocalToGlobal(i: number, j: number, u: number): number;

VLocalToGlobal(i: number, j: number, v: number): number;

LocalToGlobal(i: number, j: number, uv: gp_Pnt2d): gp_Pnt2d;

UGlobalToLocal(i: number, j: number, U: number): number;

VGlobalToLocal(i: number, j: number, V: number): number;

GlobalToLocal(i: number, j: number, UV: gp_Pnt2d): gp_Pnt2d;

GlobalToLocalTransformation(i: number, j: number, uFact: number, Trsf: gp_Trsf2d): { returnValue: boolean; uFact: number };

Transform(T: gp_Trsf): void;

Copy(): Geom_Geometry;

UReverse(): void;

UReversedParameter(U: number): number;

VReverse(): void;

VReversedParameter(V: number): number;

Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

IsVPeriodic(): boolean;

UIso(U: number): Geom_Curve;

VIso(V: number): Geom_Curve;

Continuity(): GeomAbs_Shape;

IsCNu(N: number): boolean;

IsCNv(N: number): boolean;

EvalD0(U: number, V: number): gp_Pnt;

EvalD1(U: number, V: number): Geom_Surface_ResD1;

EvalD2(U: number, V: number): Geom_Surface_ResD2;

EvalD3(U: number, V: number): Geom_Surface_ResD3;

EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

Value(pnt: gp_Pnt2d): gp_Pnt;
Value(U: number, V: number): gp_Pnt;
Value(pnt: gp_Pnt2d): gp_Pnt;
Value(U: number, V: number): gp_Pnt;

ComputeJointValues(param?: ShapeExtend_Parametrisation): void;

CheckConnectivity(prec: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_Explorer: declare class ShapeExtend_Explorer

constructor

CompoundFromSeq(seqval: NCollection_HSequence_TopoDS_Shape): TopoDS_Shape;

SeqFromCompound(comp: TopoDS_Shape, expcomp: boolean): NCollection_HSequence_TopoDS_Shape;

ListFromSeq(seqval: NCollection_HSequence_TopoDS_Shape, lisval: NCollection_List_TopoDS_Shape, clear: boolean): void;

SeqFromList(lisval: NCollection_List_TopoDS_Shape): NCollection_HSequence_TopoDS_Shape;

ShapeType(shape: TopoDS_Shape, compound: boolean): TopAbs_ShapeEnum;

SortedCompound(shape: TopoDS*Shape, type*: TopAbs_ShapeEnum, explore: boolean, compound: boolean): TopoDS_Shape;

DispatchList(list: NCollection_HSequence_TopoDS_Shape): { vertices: NCollection_HSequence_TopoDS_Shape; edges: NCollection_HSequence_TopoDS_Shape; wires: NCollection_HSequence_TopoDS_Shape; faces: NCollection_HSequence_TopoDS_Shape; shells: NCollection_HSequence_TopoDS_Shape; solids: NCollection_HSequence_TopoDS_Shape; compsols: NCollection_HSequence_TopoDS_Shape; compounds: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_MsgRegistrator: declare class ShapeExtend_MsgRegistrator extends ShapeExtend_BasicMsgRegistrator

constructor

Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;

MapTransient(): NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg;

MapShape(): NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_Parametrisation: typeof ShapeExtend_Parametrisation[keyof typeof ShapeExtend_Parametrisation]

ShapeExtend_Status: typeof ShapeExtend_Status[keyof typeof ShapeExtend_Status]

ShapeExtend_WireData: declare class ShapeExtend_WireData extends Standard_Transient

constructor

Init(other: ShapeExtend_WireData): void;
Init(wire: TopoDS_Wire, chained: boolean, theManifoldMode: boolean): boolean;
Init(other: ShapeExtend_WireData): void;
Init(wire: TopoDS_Wire, chained: boolean, theManifoldMode: boolean): boolean;

Clear(): void;

ComputeSeams(enforce?: boolean): void;

SetLast(num: number): void;

SetDegeneratedLast(): void;

Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;

AddOriented(edge: TopoDS_Edge, mode: number): void;
AddOriented(wire: TopoDS_Wire, mode: number): void;
AddOriented(shape: TopoDS_Shape, mode: number): void;
AddOriented(edge: TopoDS_Edge, mode: number): void;
AddOriented(wire: TopoDS_Wire, mode: number): void;
AddOriented(shape: TopoDS_Shape, mode: number): void;
AddOriented(edge: TopoDS_Edge, mode: number): void;
AddOriented(wire: TopoDS_Wire, mode: number): void;
AddOriented(shape: TopoDS_Shape, mode: number): void;

Remove(num?: number): void;

Set(edge: TopoDS_Edge, num?: number): void;

Reverse(): void;
Reverse(face: TopoDS_Face): void;
Reverse(): void;
Reverse(face: TopoDS_Face): void;

NbEdges(): number;

NbNonManifoldEdges(): number;

NonmanifoldEdge(num: number): TopoDS_Edge;

NonmanifoldEdges(): NCollection_HSequence_TopoDS_Shape;

ManifoldMode(): boolean;

Edge(num: number): TopoDS_Edge;

Index(edge: TopoDS_Edge): number;

IsSeam(num: number): boolean;

Wire(): TopoDS_Wire;

WireAPIMake(): TopoDS_Wire;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeExtend_DataMapOfShapeListOfMsg: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher
