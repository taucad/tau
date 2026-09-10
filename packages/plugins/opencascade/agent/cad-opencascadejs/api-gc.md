# libcascade — GC

33 top-level symbols. Signatures are verbatim typescript.

// Implements construction algorithms for an arc of circle in 3D space
GC_MakeArcOfCircle: declare class GC_MakeArcOfCircle extends GC_Root

constructor

// Returns the constructed arc of circle
Value(): Geom_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for arcs of circles in the plane
GC_MakeArcOfCircle2d: declare class GC_MakeArcOfCircle2d extends GC_Root

constructor

// Returns the constructed arc of circle
Value(): Geom2d_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for ellipse arcs in 3D space
GC_MakeArcOfEllipse: declare class GC_MakeArcOfEllipse extends GC_Root

constructor

// Returns the constructed arc of ellipse
Value(): Geom_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for arcs of ellipses in the plane
GC_MakeArcOfEllipse2d: declare class GC_MakeArcOfEllipse2d extends GC_Root

constructor

// Returns the constructed arc of ellipse
Value(): Geom2d_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for hyperbola arcs in 3D space
GC_MakeArcOfHyperbola: declare class GC_MakeArcOfHyperbola extends GC_Root

constructor

// Returns the constructed arc of hyperbola
Value(): Geom_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for arcs of hyperbolas in the plane
GC_MakeArcOfHyperbola2d: declare class GC_MakeArcOfHyperbola2d extends GC_Root

constructor

// Returns the constructed arc of hyperbola
Value(): Geom2d_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for parabola arcs in 3D space
GC_MakeArcOfParabola: declare class GC_MakeArcOfParabola extends GC_Root

constructor

// Returns the constructed arc of parabola
Value(): Geom_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for arcs of parabolas in the plane
GC_MakeArcOfParabola2d: declare class GC_MakeArcOfParabola2d extends GC_Root

constructor

// Returns the constructed arc of parabola
Value(): Geom2d_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for circles in 3D space
GC_MakeCircle: declare class GC_MakeCircle extends GC_Root

constructor

// Returns the constructed circle
Value(): Geom_Circle;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for circles in the plane
GC_MakeCircle2d: declare class GC_MakeCircle2d extends GC_Root

constructor

// Returns the constructed circle
Value(): Geom2d_Circle;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for conical surfaces
GC_MakeConicalSurface: declare class GC_MakeConicalSurface extends GC_Root

constructor

// Returns the constructed cone
Value(): Geom_ConicalSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for cylindrical surfaces
GC_MakeCylindricalSurface: declare class GC_MakeCylindricalSurface extends GC_Root

constructor

// Returns the constructed cylinder
Value(): Geom_CylindricalSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for ellipses in 3D space
GC_MakeEllipse: declare class GC_MakeEllipse extends GC_Root

constructor

// Returns the constructed ellipse
Value(): Geom_Ellipse;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for ellipses in the plane
GC_MakeEllipse2d: declare class GC_MakeEllipse2d extends GC_Root

constructor

// Returns the constructed ellipse
Value(): Geom2d_Ellipse;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for hyperbolas in 3D space
GC_MakeHyperbola: declare class GC_MakeHyperbola extends GC_Root

constructor

// Returns the constructed hyperbola
Value(): Geom_Hyperbola;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for hyperbolas in the plane
GC_MakeHyperbola2d: declare class GC_MakeHyperbola2d extends GC_Root

constructor

// Returns the constructed hyperbola
Value(): Geom2d_Hyperbola;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the following algorithms used to create a Line from Geom
GC_MakeLine: declare class GC_MakeLine extends GC_Root

constructor

// Returns the constructed line
Value(): Geom_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for lines in the plane
GC_MakeLine2d: declare class GC_MakeLine2d extends GC_Root

constructor

// Returns the constructed line
Value(): Geom2d_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a symmetrical transformation in 3D space about a point, axis or plane
GC_MakeMirror: declare class GC_MakeMirror

constructor

// Returns the constructed transformation
Value(): Geom_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for symmetric transformations in 2D space about a point, axis, or line
GC_MakeMirror2d: declare class GC_MakeMirror2d

constructor

// Returns the constructed transformation
Value(): Geom2d_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for parabolas in the plane
GC_MakeParabola2d: declare class GC_MakeParabola2d extends GC_Root

constructor

// Returns the constructed parabola
Value(): Geom2d_Parabola;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for planes in 3D space
GC_MakePlane: declare class GC_MakePlane extends GC_Root

constructor

// Returns the constructed plane
Value(): Geom_Plane;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a rotation in 3D space
GC_MakeRotation: declare class GC_MakeRotation

constructor

// Returns the constructed transformation
Value(): Geom_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for rotations in 2D space
GC_MakeRotation2d: declare class GC_MakeRotation2d

constructor

// Returns the constructed transformation
Value(): Geom2d_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction of a scaling transformation in 3D space
GC_MakeScale: declare class GC_MakeScale

constructor

// Returns the constructed transformation
Value(): Geom_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for scaling transformations in 2D space
GC_MakeScale2d: declare class GC_MakeScale2d

constructor

// Returns the constructed transformation
Value(): Geom2d_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for line segments in 3D space
GC_MakeSegment: declare class GC_MakeSegment extends GC_Root

constructor

// Returns the constructed line segment
Value(): Geom_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for line segments in the plane
GC_MakeSegment2d: declare class GC_MakeSegment2d extends GC_Root

constructor

// Returns the constructed line segment
Value(): Geom2d_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a translation in 3D space
GC_MakeTranslation: declare class GC_MakeTranslation

constructor

// Returns the constructed transformation
Value(): Geom_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for translations in 2D space
GC_MakeTranslation2d: declare class GC_MakeTranslation2d

constructor

// Returns the constructed transformation
Value(): Geom2d_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for trimmed cones
GC_MakeTrimmedCone: declare class GC_MakeTrimmedCone extends GC_Root

constructor

// Returns the constructed trimmed cone
Value(): Geom_RectangularTrimmedSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for trimmed cylinders
GC_MakeTrimmedCylinder: declare class GC_MakeTrimmedCylinder extends GC_Root

constructor

// Returns the constructed trimmed cylinder
Value(): Geom_RectangularTrimmedSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides common status services for GC builders reporting construction errors
GC_Root: declare class GC_Root

constructor

// Returns true if the construction is successful
IsDone(): boolean;

// Returns true if the construction has failed
IsError(): boolean;

// Returns the status of the construction
Status(): gce_ErrorType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
