# libcascade — ShapeFix (2)

3 top-level symbols. Signatures are verbatim typescript.

ShapeFix_WireVertex: declare class ShapeFix_WireVertex

constructor

Init(sawv: ShapeAnalysis_WireVertex): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(sbwd: ShapeExtend_WireData, preci: number): void;
Init(sawv: ShapeAnalysis_WireVertex): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(sbwd: ShapeExtend_WireData, preci: number): void;
Init(sawv: ShapeAnalysis_WireVertex): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(sbwd: ShapeExtend_WireData, preci: number): void;

Analyzer(): ShapeAnalysis_WireVertex;

WireData(): ShapeExtend_WireData;

Wire(): TopoDS_Wire;

FixSame(): number;

Fix(): number;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Wireframe: declare class ShapeFix_Wireframe extends ShapeFix_Root

constructor

ClearStatuses(): void;

Load(shape: TopoDS_Shape): void;

FixWireGaps(): boolean;

FixSmallEdges(): boolean;

CheckSmallEdges(theSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theEdgeToFaces: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theFaceWithSmall: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theMultyEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

MergeSmallEdges(theSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theEdgeToFaces: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theFaceWithSmall: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theMultyEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theModeDrop: boolean, theLimitAngle: number): boolean;

StatusWireGaps(status: ShapeExtend_Status): boolean;

StatusSmallEdges(status: ShapeExtend_Status): boolean;

Shape(): TopoDS_Shape;

ModeDropSmallEdges(): boolean;

SetLimitAngle(theLimitAngle: number): void;

LimitAngle(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_SequenceOfWireSegment: NCollection_Sequence_ShapeFix_WireSegment
