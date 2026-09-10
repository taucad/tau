# libcascade — GeomBndLib (2)

5 top-level symbols. Signatures are verbatim typescript.

// Computes bounding box for a spherical surface ({@link Geom_SphericalSurface`Geom_SphericalSurface`})
GeomBndLib_Sphere: declare class GeomBndLib_Sphere

constructor

Geometry(): Geom_SphericalSurface;

// Compute bounding box for full sphere
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// For analytical surfaces, BoxOptimal is same as Box
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Variant-based dispatcher for 3D surface bounding box computation
GeomBndLib_Surface: declare class GeomBndLib_Surface

constructor

// Return detected surface type
GetType(): GeomAbs_SurfaceType;

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full surface
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Add bounding box for full surface
Add(theTol: number, theBox: Bnd_Box): void;
Add(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;
Add(theTol: number, theBox: Bnd_Box): void;
Add(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;
// theBox: Mutated in place

// Add precise bounding box for full surface
AddOptimal(theTol: number, theBox: Bnd_Box): void;
AddOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;
AddOptimal(theTol: number, theBox: Bnd_Box): void;
AddOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;
// theBox: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a surface of linear extrusion ({@link Geom_SurfaceOfLinearExtrusion`Geom_SurfaceOfLinearExtrusion`})
GeomBndLib_SurfaceOfExtrusion: declare class GeomBndLib_SurfaceOfExtrusion

constructor

Geometry(): Geom_SurfaceOfLinearExtrusion;

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box using tight basis curve bounds
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a surface of revolution ({@link Geom_SurfaceOfRevolution`Geom_SurfaceOfRevolution`})
GeomBndLib_SurfaceOfRevolution: declare class GeomBndLib_SurfaceOfRevolution

constructor

Geometry(): Geom_SurfaceOfRevolution;

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box using tight basis curve bounds
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a toroidal surface ({@link Geom_ToroidalSurface`Geom_ToroidalSurface`})
GeomBndLib_Torus: declare class GeomBndLib_Torus

constructor

Geometry(): Geom_ToroidalSurface;

// Compute bounding box for full torus
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box for torus patch using PSO + Powell optimization
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
