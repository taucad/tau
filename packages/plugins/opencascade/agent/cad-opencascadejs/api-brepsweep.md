# libcascade — BRepSweep

9 top-level symbols. Signatures are verbatim typescript.

BRepSweep_Builder: declare class BRepSweep_Builder

constructor

Builder(): BRep_Builder;

MakeCompound(aCompound: TopoDS_Shape): void;

MakeCompSolid(aCompSolid: TopoDS_Shape): void;

MakeSolid(aSolid: TopoDS_Shape): void;

MakeShell(aShell: TopoDS_Shape): void;

MakeWire(aWire: TopoDS_Shape): void;

Add(aShape1: TopoDS_Shape, aShape2: TopoDS_Shape, Orient: TopAbs_Orientation): void;
Add(aShape1: TopoDS_Shape, aShape2: TopoDS_Shape): void;
Add(aShape1: TopoDS_Shape, aShape2: TopoDS_Shape, Orient: TopAbs_Orientation): void;
Add(aShape1: TopoDS_Shape, aShape2: TopoDS_Shape): void;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Iterator: declare class BRepSweep_Iterator

constructor

Init(aShape: TopoDS_Shape): void;

More(): boolean;

Next(): void;

Value(): TopoDS_Shape;

Orientation(): TopAbs_Orientation;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_NumLinearRegularSweep: declare class BRepSweep_NumLinearRegularSweep

MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

DirectSolid(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopAbs_Orientation;

GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

SplitShell(aNewShape: TopoDS_Shape): TopoDS_Shape;

SetContinuity(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): void;

HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

IsInvariant(aGenS: TopoDS_Shape): boolean;

Shape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;
Shape(): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;
Shape(): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;
Shape(): TopoDS_Shape;

IsUsed(aGenS: TopoDS_Shape): boolean;

GenIsUsed(theS: TopoDS_Shape): boolean;

FirstShape(): TopoDS_Shape;
FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;
FirstShape(): TopoDS_Shape;
FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;

LastShape(): TopoDS_Shape;
LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;
LastShape(): TopoDS_Shape;
LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;

Closed(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Prism: declare class BRepSweep_Prism

constructor

Shape(): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;
Shape(): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;

FirstShape(): TopoDS_Shape;
FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;
FirstShape(): TopoDS_Shape;
FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;

LastShape(): TopoDS_Shape;
LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;
LastShape(): TopoDS_Shape;
LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;

Vec(): gp_Vec;

IsUsed(aGenS: TopoDS_Shape): boolean;

GenIsUsed(theS: TopoDS_Shape): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Revol: declare class BRepSweep_Revol

constructor

Shape(): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;
Shape(): TopoDS_Shape;
Shape(aGenS: TopoDS_Shape): TopoDS_Shape;

FirstShape(): TopoDS_Shape;
FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;
FirstShape(): TopoDS_Shape;
FirstShape(aGenS: TopoDS_Shape): TopoDS_Shape;

LastShape(): TopoDS_Shape;
LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;
LastShape(): TopoDS_Shape;
LastShape(aGenS: TopoDS_Shape): TopoDS_Shape;

Axe(): gp_Ax1;

Angle(): number;

IsUsed(aGenS: TopoDS_Shape): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Rotation: declare class BRepSweep_Rotation extends BRepSweep_Trsf

constructor

MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

DirectSolid(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopAbs_Orientation;

GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

SplitShell(aNewShape: TopoDS_Shape): TopoDS_Shape;

HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

IsInvariant(aGenS: TopoDS_Shape): boolean;

Axe(): gp_Ax1;

Angle(): number;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Tool: declare class BRepSweep_Tool

constructor

NbShapes(): number;

Index(aShape: TopoDS_Shape): number;

Shape(anIndex: number): TopoDS_Shape;

Type(aShape: TopoDS_Shape): TopAbs_ShapeEnum;

Orientation(aShape: TopoDS_Shape): TopAbs_Orientation;

SetOrientation(aShape: TopoDS_Shape, Or: TopAbs_Orientation): void;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Translation: declare class BRepSweep_Translation extends BRepSweep_Trsf

constructor

MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

DirectSolid(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopAbs_Orientation;

GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

IsInvariant(aGenS: TopoDS_Shape): boolean;

Vec(): gp_Vec;

delete(): void;

[Symbol.dispose](): void;

BRepSweep_Trsf: declare class BRepSweep_Trsf extends BRepSweep_NumLinearRegularSweep

Init(): void;

Process(aGenS: TopoDS_Shape, aDirV: Sweep_NumShape): boolean;

MakeEmptyVertex(aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

MakeEmptyDirectingEdge(aGenV: TopoDS_Shape, aDirE: Sweep_NumShape): TopoDS_Shape;

MakeEmptyGeneratingEdge(aGenE: TopoDS_Shape, aDirV: Sweep_NumShape): TopoDS_Shape;

SetParameters(aNewFace: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenF: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

SetDirectingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape): void;

SetGeneratingParameter(aNewEdge: TopoDS_Shape, aNewVertex: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirV: Sweep_NumShape): void;

MakeEmptyFace(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): TopoDS_Shape;

SetPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenF: TopoDS_Shape, aGenE: TopoDS_Shape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetGeneratingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aDirE: Sweep_NumShape, aDirV: Sweep_NumShape, orien: TopAbs_Orientation): void;

SetDirectingPCurve(aNewFace: TopoDS_Shape, aNewEdge: TopoDS_Shape, aGenE: TopoDS_Shape, aGenV: TopoDS_Shape, aDirE: Sweep_NumShape, orien: TopAbs_Orientation): void;

GGDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

GDDShapeIsToAdd(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aDirS: Sweep_NumShape, aSubDirS: Sweep_NumShape): boolean;

SeparatedWires(aNewShape: TopoDS_Shape, aNewSubShape: TopoDS_Shape, aGenS: TopoDS_Shape, aSubGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

HasShape(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): boolean;

IsInvariant(aGenS: TopoDS_Shape): boolean;

SetContinuity(aGenS: TopoDS_Shape, aDirS: Sweep_NumShape): void;

delete(): void;

[Symbol.dispose](): void;
