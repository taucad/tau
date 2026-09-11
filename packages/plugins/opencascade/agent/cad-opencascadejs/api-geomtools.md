# libcascade — GeomTools

4 top-level symbols. Signatures are verbatim typescript.

GeomTools: declare class GeomTools

constructor

delete(): void;

[Symbol.dispose](): void;

GeomTools_Curve2dSet: declare class GeomTools_Curve2dSet

constructor

Clear(): void;

Add(C: Geom2d_Curve): number;

Curve2d(I: number): Geom2d_Curve;

Index(C: Geom2d_Curve): number;

delete(): void;

[Symbol.dispose](): void;

GeomTools_CurveSet: declare class GeomTools_CurveSet

constructor

Clear(): void;

Add(C: Geom_Curve): number;

Curve(I: number): Geom_Curve;

Index(C: Geom_Curve): number;

delete(): void;

[Symbol.dispose](): void;

GeomTools_SurfaceSet: declare class GeomTools_SurfaceSet

constructor

Clear(): void;

Add(S: Geom_Surface): number;

Surface(I: number): Geom_Surface;

Index(S: Geom_Surface): number;

delete(): void;

[Symbol.dispose](): void;
