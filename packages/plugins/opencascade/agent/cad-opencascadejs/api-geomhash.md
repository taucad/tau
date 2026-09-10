# libcascade — GeomHash

6 top-level symbols. Signatures are verbatim typescript.

// Polymorphic hasher for {@link Geom_Curve `Geom_Curve`} using RTTI dispatch
GeomHash_CurveHasher: declare class GeomHash_CurveHasher

constructor

CompTolerance: number

HashTolerance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomHash_Polygon2DHasher: declare class GeomHash_Polygon2DHasher

constructor

CompTolerance: number

HashTolerance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomHash_Polygon3DHasher: declare class GeomHash_Polygon3DHasher

constructor

CompTolerance: number

HashTolerance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomHash_PolygonOnTriHasher: declare class GeomHash_PolygonOnTriHasher

constructor

CompTolerance: number

HashTolerance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Polymorphic hasher for {@link Geom_Surface `Geom_Surface`} using RTTI dispatch
GeomHash_SurfaceHasher: declare class GeomHash_SurfaceHasher

constructor

CompTolerance: number

HashTolerance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomHash_TriangulationHasher: declare class GeomHash_TriangulationHasher

constructor

CompTolerance: number

HashTolerance: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
