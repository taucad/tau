# libcascade — Sweep

3 top-level symbols. Signatures are verbatim typescript.

Sweep_NumShape: declare class Sweep_NumShape

constructor

Init(Index: number, Type: TopAbs_ShapeEnum, Closed?: boolean, BegInf?: boolean, EndInf?: boolean): void;

Index(): number;

Type(): TopAbs_ShapeEnum;

Closed(): boolean;

BegInfinite(): boolean;

EndInfinite(): boolean;

Orientation(): TopAbs_Orientation;

delete(): void;

[Symbol.dispose](): void;

Sweep_NumShapeIterator: declare class Sweep_NumShapeIterator

constructor

Init(aShape: Sweep_NumShape): void;

More(): boolean;

Next(): void;

Value(): Sweep_NumShape;

Orientation(): TopAbs_Orientation;

delete(): void;

[Symbol.dispose](): void;

Sweep_NumShapeTool: declare class Sweep_NumShapeTool

constructor

NbShapes(): number;

Index(aShape: Sweep_NumShape): number;

Shape(anIndex: number): Sweep_NumShape;

Type(aShape: Sweep_NumShape): TopAbs_ShapeEnum;

Orientation(aShape: Sweep_NumShape): TopAbs_Orientation;

HasFirstVertex(): boolean;

HasLastVertex(): boolean;

FirstVertex(): Sweep_NumShape;

LastVertex(): Sweep_NumShape;

delete(): void;

[Symbol.dispose](): void;
