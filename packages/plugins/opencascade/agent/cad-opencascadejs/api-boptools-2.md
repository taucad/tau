# libcascade — BOPTools (2)

6 top-level symbols. Signatures are verbatim typescript.

// The class contains handy static functions dealing with the topology This is the copy of BOPTools_AlgoTools3D.cdl file
BOPTools_AlgoTools3D: declare class BOPTools_AlgoTools3D

constructor

// Makes the edge <theESplit> seam edge for the face <theFace> basing on the surface properties (U and V periods) Makes the split edge <theESplit> seam edge for the face <theFace> basing on the positions of 2d curves of the original edge <theEOrigin>
static DoSplitSEAMOnFace(theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
static DoSplitSEAMOnFace(theEOrigin: TopoDS_Edge, theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
static DoSplitSEAMOnFace(theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;
static DoSplitSEAMOnFace(theEOrigin: TopoDS_Edge, theESplit: TopoDS_Edge, theFace: TopoDS_Face): boolean;

// Computes normal to the face <aF> for the point on the edge <aE> at parameter <aT>
static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aD: gp_Dir, theContext: IntTools_Context): void;
static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aD: gp_Dir, theContext: IntTools_Context): void;
static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aD: gp_Dir, theContext: IntTools_Context): void;
static GetNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aD: gp_Dir, theContext: IntTools_Context): void;
// aD: Mutated in place

// Returns 1 if scalar product aNF1\* aNF2>0
static SenseFlag(aNF1: gp_Dir, aNF2: gp_Dir): number;

// Compute normal <aD> to surface <aS> in point (U,V) Returns TRUE if directions aD1U, aD1V coincide
static GetNormalToSurface(aS: Geom_Surface, U: number, V: number, aD: gp_Dir): boolean;
// aD: Mutated in place

// Computes normal to the face <aF> for the 3D-point that belongs to the edge <aE> at parameter <aT>
static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;
static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;
static GetApproxNormalToFaceOnEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aPx: gp_Pnt, aD: gp_Dir, theContext: IntTools_Context): boolean;
static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aP: gp_Pnt, aDNF: gp_Dir, aDt2D: number): boolean;
static GetApproxNormalToFaceOnEdge(theE: TopoDS_Edge, theF: TopoDS_Face, aT: number, aDt2D: number, aP: gp_Pnt, aDNF: gp_Dir, theContext: IntTools_Context): boolean;
// aPx: Mutated in place
// aD: Mutated in place

// Compute the point <aPx>, (<aP2D>) that is near to the edge <aE> at arbitrary parameter towards to the material of the face <aF>
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
static PointNearEdge(aE: TopoDS_Edge, aF: TopoDS_Face, aT: number, aDt2D: number, aP2D: gp_Pnt2d, aPx: gp_Pnt, theContext: IntTools_Context): number;
// aP2D: Mutated in place
// aPx: Mutated in place

// Returns simple step value that is used in 2D-computations = 1.e-5
static MinStepIn2d(): number;

// Returns TRUE if the shape <aS> does not contain geometry information (e.g
static IsEmptyShape(aS: TopoDS_Shape): boolean;

// Get the edge <aER> from the face <aF> that is the same as the edge <aE>
static OrientEdgeOnFace(aE: TopoDS_Edge, aF: TopoDS_Face, aER: TopoDS_Edge): void;
// aER: Mutated in place

// Computes arbitrary point <theP> inside the face <theF>
static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;
static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;
static PointInFace(theF: TopoDS_Face, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
static PointInFace(theF: TopoDS_Face, theE: TopoDS_Edge, theT: number, theDt2D: number, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context): number;
static PointInFace(theF: TopoDS_Face, theL: Geom2d_Curve, theP: gp_Pnt, theP2D: gp_Pnt2d, theContext: IntTools_Context, theDt2D: number): number;
// theP: Mutated in place
// theP2D: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPTools_ConnexityBlock: declare class BOPTools_ConnexityBlock

constructor

Shapes(): NCollection_List_TopoDS_Shape;

ChangeShapes(): NCollection_List_TopoDS_Shape;

SetRegular(theFlag: boolean): void;

IsRegular(): boolean;

Loops(): NCollection_List_TopoDS_Shape;

ChangeLoops(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPTools_CoupleOfShape: declare class BOPTools_CoupleOfShape

constructor

SetShape1(theShape: TopoDS_Shape): void;

Shape1(): TopoDS_Shape;

SetShape2(theShape: TopoDS_Shape): void;

Shape2(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPTools_Set: declare class BOPTools_Set

constructor

Assign(Other: BOPTools_Set): BOPTools_Set;

Shape(): TopoDS_Shape;

Add(theS: TopoDS_Shape, theType: TopAbs_ShapeEnum): void;

NbShapes(): number;

IsEqual(aOther: BOPTools_Set): boolean;

GetSum(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPTools_ListOfConnexityBlock: NCollection_List_BOPTools_ConnexityBlock

BOPTools_ListOfCoupleOfShape: NCollection_List_BOPTools_CoupleOfShape
