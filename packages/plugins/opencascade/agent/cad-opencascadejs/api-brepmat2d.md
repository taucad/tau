# libcascade — BRepMAT2d

3 top-level symbols. Signatures are verbatim typescript.

// BisectingLocus generates and contains the Bisecting_Locus of a set of lines from Geom2d, defined by <ExploSet>
BRepMAT2d_BisectingLocus: declare class BRepMAT2d_BisectingLocus

constructor

// Computation of the Bisector_Locus in a set of Lines defined in <anExplo>
Compute(anExplo: BRepMAT2d_Explorer, LineIndex: number, aSide: MAT_Side, aJoinType: GeomAbs_JoinType, IsOpenResult: boolean): void;
// anExplo: Mutated in place

// Returns True if Compute has succeeded
IsDone(): boolean;

// Returns <theGraph> of <me>
Graph(): MAT_Graph;

// Returns the number of contours
NumberOfContours(): number;

// Returns the number of BasicElts on the line <IndLine>
NumberOfElts(IndLine: number): number;

// Returns the number of sections of a curve
NumberOfSections(IndLine: number, Index: number): number;

// Returns the BasicElts located at the position <Index> on the contour designed by <IndLine>
BasicElt(IndLine: number, Index: number): MAT_BasicElt;

// Returns the geometry linked to the <BasicElt>
GeomElt(aBasicElt: MAT_BasicElt): Geom2d_Geometry;
GeomElt(aNode: MAT_Node): gp_Pnt2d;
GeomElt(aBasicElt: MAT_BasicElt): Geom2d_Geometry;
GeomElt(aNode: MAT_Node): gp_Pnt2d;

// Returns the geometry of type <Bissec> linked to the arc <ARC>
GeomBis(anArc: MAT_Arc, Reverse?: boolean): { returnValue: Bisector_Bisec; Reverse: boolean; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Construct an explorer from wires, face, set of curves from Geom2d to compute the bisecting Locus
BRepMAT2d_Explorer: declare class BRepMAT2d_Explorer

constructor

// Clear the contents of <me>
Clear(): void;

Perform(aFace: TopoDS_Face): void;

// Returns the Number of contours
NumberOfContours(): number;

// Returns the Number of Curves in the Contour number <IndexContour>
NumberOfCurves(IndexContour: number): number;

// Initialisation of an Iterator on the curves of the Contour number <IndexContour>
Init(IndexContour: number): void;

// Return False if there is no more curves on the Contour initialised by the method Init
More(): boolean;

// Move to the next curve of the current Contour
Next(): void;

// Returns the current curve on the current Contour
Value(): Geom2d_Curve;

Shape(): TopoDS_Shape;

Contour(IndexContour: number): NCollection_Sequence_handle_Geom2d_Curve;

IsModified(aShape: TopoDS_Shape): boolean;

// If the shape is not modified, returns the shape itself
ModifiedShape(aShape: TopoDS_Shape): TopoDS_Shape;

GetIsClosed(): NCollection_Sequence_bool;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Constructs links between the Wire or the Face of the explorer and the BasicElts contained in the bisecting locus
BRepMAT2d_LinkTopoBilo: declare class BRepMAT2d_LinkTopoBilo

constructor

// Constructs the links Between S and BiLo
Perform(Explo: BRepMAT2d_Explorer, BiLo: BRepMAT2d_BisectingLocus): void;

// Initialise the Iterator on is an edge or a vertex of the initial wire or face
Init(S: TopoDS_Shape): void;

// Returns True if there is a current BasicElt
More(): boolean;

// Proceed to the next BasicElt
Next(): void;

// Returns the current BasicElt
Value(): MAT_BasicElt;

// Returns the Shape linked to <aBE>
GeneratingShape(aBE: MAT_BasicElt): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
