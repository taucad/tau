# libcascade — BRepFeat

13 top-level symbols. Signatures are verbatim typescript.

BRepFeat_Builder: declare class BRepFeat_Builder extends BOPAlgo_BOP

constructor

Clear(): void;

Init(theShape: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;

SetOperation(theFuse: number): void;
SetOperation(theFuse: number, theFlag: boolean): void;
SetOperation(theOperation: BOPAlgo_Operation): void;
SetOperation(theFuse: number): void;
SetOperation(theFuse: number, theFlag: boolean): void;
SetOperation(theOperation: BOPAlgo_Operation): void;
SetOperation(theFuse: number): void;
SetOperation(theFuse: number, theFlag: boolean): void;
SetOperation(theOperation: BOPAlgo_Operation): void;

PartsOfTool(theLT: NCollection_List_TopoDS_Shape): void;

KeepParts(theIm: NCollection_List_TopoDS_Shape): void;

KeepPart(theS: TopoDS_Shape): void;

PerformResult(theRange?: Message_ProgressRange): void;

RebuildFaces(): void;

RebuildEdge(theE: TopoDS_Shape, theF: TopoDS_Face, theME: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, aLEIm: NCollection_List_TopoDS_Shape): void;

CheckSolidImages(): void;

FillRemoved(): void;
FillRemoved(theS: TopoDS_Shape, theM: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;
FillRemoved(): void;
FillRemoved(theS: TopoDS_Shape, theM: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_Form: declare class BRepFeat_Form extends BRepBuilderAPI_MakeShape

Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

IsDeleted(S: TopoDS_Shape): boolean;

FirstShape(): NCollection_List_TopoDS_Shape;

LastShape(): NCollection_List_TopoDS_Shape;

NewEdges(): NCollection_List_TopoDS_Shape;

TgtEdges(): NCollection_List_TopoDS_Shape;

BasisShapeValid(): void;

GeneratedShapeValid(): void;

ShapeFromValid(): void;

ShapeUntilValid(): void;

GluedFacesValid(): void;

SketchFaceValid(): void;

PerfSelectionValid(): void;

Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

CurrentStatusError(): BRepFeat_StatusError;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_Gluer: declare class BRepFeat_Gluer extends BRepBuilderAPI_MakeShape

constructor

Init(Snew: TopoDS_Shape, Sbase: TopoDS_Shape): void;

Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;
Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;

OpeType(): LocOpe_Operation;

BasisShape(): TopoDS_Shape;

GluedShape(): TopoDS_Shape;

Build(theRange?: Message_ProgressRange): void;

IsDeleted(S: TopoDS_Shape): boolean;

Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_MakeCylindricalHole: declare class BRepFeat_MakeCylindricalHole extends BRepFeat_Builder

constructor

Init(Axis: gp_Ax1): void;
Init(S: TopoDS_Shape, Axis: gp_Ax1): void;
Init(theShape: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;
Init(Axis: gp_Ax1): void;
Init(S: TopoDS_Shape, Axis: gp_Ax1): void;
Init(theShape: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;
Init(Axis: gp_Ax1): void;
Init(S: TopoDS_Shape, Axis: gp_Ax1): void;
Init(theShape: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;
Init(Axis: gp_Ax1): void;
Init(S: TopoDS_Shape, Axis: gp_Ax1): void;
Init(theShape: TopoDS_Shape): void;
Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;

Perform(Radius: number): void;
Perform(Radius: number, PFrom: number, PTo: number, WithControl: boolean): void;
Perform(theRange: Message_ProgressRange): void;
Perform(Radius: number): void;
Perform(Radius: number, PFrom: number, PTo: number, WithControl: boolean): void;
Perform(theRange: Message_ProgressRange): void;
Perform(Radius: number): void;
Perform(Radius: number, PFrom: number, PTo: number, WithControl: boolean): void;
Perform(theRange: Message_ProgressRange): void;

PerformThruNext(Radius: number, WithControl?: boolean): void;

PerformUntilEnd(Radius: number, WithControl?: boolean): void;

PerformBlind(Radius: number, Length: number, WithControl?: boolean): void;

Status(): BRepFeat_Status;

Build(): void;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_MakeDPrism: declare class BRepFeat_MakeDPrism extends BRepFeat_Form

constructor

Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Face, Skface: TopoDS_Face, Angle: number, Fuse: number, Modify: boolean): void;

Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

Perform(Height: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(Height: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(Height: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

PerformUntilEnd(): void;

PerformFromEnd(FUntil: TopoDS_Shape): void;

PerformThruAll(): void;

PerformUntilHeight(Until: TopoDS_Shape, Height: number): void;

Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

BossEdges(sig: number): void;

TopEdges(): NCollection_List_TopoDS_Shape;

LatEdges(): NCollection_List_TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_MakePipe: declare class BRepFeat_MakePipe extends BRepFeat_Form

constructor

Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Spine: TopoDS_Wire, Fuse: number, Modify: boolean): void;

Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

Perform(): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_MakePrism: declare class BRepFeat_MakePrism extends BRepFeat_Form

constructor

Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Direction: gp_Dir, Fuse: number, Modify: boolean): void;

Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

Perform(Length: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(Length: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(Length: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

PerformUntilEnd(): void;

PerformFromEnd(FUntil: TopoDS_Shape): void;

PerformThruAll(): void;

PerformUntilHeight(Until: TopoDS_Shape, Length: number): void;

Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_MakeRevol: declare class BRepFeat_MakeRevol extends BRepFeat_Form

constructor

Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Axis: gp_Ax1, Fuse: number, Modify: boolean): void;

Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

Perform(Angle: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(Angle: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;
Perform(Angle: number): void;
Perform(Until: TopoDS_Shape): void;
Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

PerformThruAll(): void;

PerformUntilAngle(Until: TopoDS_Shape, Angle: number): void;

Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

BarycCurve(): Geom_Curve;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_PerfSelection: typeof BRepFeat_PerfSelection[keyof typeof BRepFeat_PerfSelection]

BRepFeat_RibSlot: declare class BRepFeat_RibSlot extends BRepBuilderAPI_MakeShape

IsDeleted(S: TopoDS_Shape): boolean;

Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

FirstShape(): NCollection_List_TopoDS_Shape;

LastShape(): NCollection_List_TopoDS_Shape;

FacesForDraft(): NCollection_List_TopoDS_Shape;

NewEdges(): NCollection_List_TopoDS_Shape;

TgtEdges(): NCollection_List_TopoDS_Shape;

static IntPar(C: Geom_Curve, P: gp_Pnt): number;

static ChoiceOfFaces(faces: NCollection_List_TopoDS_Shape, cc: Geom_Curve, par: number, bnd: number, Pln: Geom_Plane): TopoDS_Face;

CurrentStatusError(): BRepFeat_StatusError;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_SplitShape: declare class BRepFeat_SplitShape extends BRepBuilderAPI_MakeShape

constructor

Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;
Add(W: TopoDS_Wire, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, F: TopoDS_Face): void;
Add(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, EOn: TopoDS_Edge): void;
Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;
Add(W: TopoDS_Wire, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, F: TopoDS_Face): void;
Add(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, EOn: TopoDS_Edge): void;
Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;
Add(W: TopoDS_Wire, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, F: TopoDS_Face): void;
Add(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, EOn: TopoDS_Edge): void;
Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;
Add(W: TopoDS_Wire, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, F: TopoDS_Face): void;
Add(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, EOn: TopoDS_Edge): void;
Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;
Add(W: TopoDS_Wire, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, F: TopoDS_Face): void;
Add(Comp: TopoDS_Compound, F: TopoDS_Face): void;
Add(E: TopoDS_Edge, EOn: TopoDS_Edge): void;

Init(S: TopoDS_Shape): void;

SetCheckInterior(ToCheckInterior: boolean): void;

DirectLeft(): NCollection_List_TopoDS_Shape;

Left(): NCollection_List_TopoDS_Shape;

Right(): NCollection_List_TopoDS_Shape;

Build(theRange?: Message_ProgressRange): void;

IsDeleted(S: TopoDS_Shape): boolean;

Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

BRepFeat_Status: typeof BRepFeat_Status[keyof typeof BRepFeat_Status]

BRepFeat_StatusError: typeof BRepFeat_StatusError[keyof typeof BRepFeat_StatusError]
