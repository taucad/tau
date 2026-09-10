# libcascade — GeomTools

4 top-level symbols. Signatures are verbatim typescript.

// The {@link GeomTools`GeomTools`} package provides utilities for Geometry
GeomTools: declare class GeomTools

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a set of Curves from Geom2d
GeomTools_Curve2dSet: declare class GeomTools_Curve2dSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Curve in the set and returns its index
Add(C: Geom2d_Curve): number;

// Returns the Curve of index _._
Curve2d(I: number): Geom2d_Curve;

// Returns the index of <L>
Index(C: Geom2d_Curve): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a set of Curves from Geom
GeomTools_CurveSet: declare class GeomTools_CurveSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Curve in the set and returns its index
Add(C: Geom_Curve): number;

// Returns the Curve of index _._
Curve(I: number): Geom_Curve;

// Returns the index of <L>
Index(C: Geom_Curve): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a set of Surfaces from Geom
GeomTools_SurfaceSet: declare class GeomTools_SurfaceSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Surface in the set and returns its index
Add(S: Geom_Surface): number;

// Returns the Surface of index _._
Surface(I: number): Geom_Surface;

// Returns the index of <L>
Index(S: Geom_Surface): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
