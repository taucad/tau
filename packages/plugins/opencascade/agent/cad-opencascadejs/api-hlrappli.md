# libcascade — HLRAppli

1 top-level symbols. Signatures are verbatim typescript.

// This class builds reflect lines on a shape according to the axes of view defined by user
HLRAppli_ReflectLines: declare class HLRAppli_ReflectLines

constructor

// Sets the normal to the plane of visualisation, the coordinates of the view point and the coordinates of the vertical direction vector
SetAxes(Nx: number, Ny: number, Nz: number, XAt: number, YAt: number, ZAt: number, XUp: number, YUp: number, ZUp: number): void;

Perform(): void;

// returns resulting compound of reflect lines represented by edges in 3d
GetResult(): TopoDS_Shape;

// returns resulting compound of lines of specified type and visibility represented by edges in 3d or 2d
GetCompoundOf3dEdges(type\_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
