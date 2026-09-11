# libcascade — BRepMAT2d

3 top-level symbols. Signatures are verbatim typescript.

BRepMAT2d_BisectingLocus: declare class BRepMAT2d_BisectingLocus

constructor

Compute(anExplo: BRepMAT2d_Explorer, LineIndex: number, aSide: MAT_Side, aJoinType: GeomAbs_JoinType, IsOpenResult: boolean): void;

IsDone(): boolean;

Graph(): MAT_Graph;

NumberOfContours(): number;

NumberOfElts(IndLine: number): number;

NumberOfSections(IndLine: number, Index: number): number;

BasicElt(IndLine: number, Index: number): MAT_BasicElt;

GeomElt(aBasicElt: MAT_BasicElt): Geom2d_Geometry;
GeomElt(aNode: MAT_Node): gp_Pnt2d;
GeomElt(aBasicElt: MAT_BasicElt): Geom2d_Geometry;
GeomElt(aNode: MAT_Node): gp_Pnt2d;

GeomBis(anArc: MAT_Arc, Reverse?: boolean): { returnValue: Bisector_Bisec; Reverse: boolean; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

BRepMAT2d_Explorer: declare class BRepMAT2d_Explorer

constructor

Clear(): void;

Perform(aFace: TopoDS_Face): void;

NumberOfContours(): number;

NumberOfCurves(IndexContour: number): number;

Init(IndexContour: number): void;

More(): boolean;

Next(): void;

Value(): Geom2d_Curve;

Shape(): TopoDS_Shape;

Contour(IndexContour: number): NCollection_Sequence_handle_Geom2d_Curve;

IsModified(aShape: TopoDS_Shape): boolean;

ModifiedShape(aShape: TopoDS_Shape): TopoDS_Shape;

GetIsClosed(): NCollection_Sequence_bool;

delete(): void;

[Symbol.dispose](): void;

BRepMAT2d_LinkTopoBilo: declare class BRepMAT2d_LinkTopoBilo

constructor

Perform(Explo: BRepMAT2d_Explorer, BiLo: BRepMAT2d_BisectingLocus): void;

Init(S: TopoDS_Shape): void;

More(): boolean;

Next(): void;

Value(): MAT_BasicElt;

GeneratingShape(aBE: MAT_BasicElt): TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;
