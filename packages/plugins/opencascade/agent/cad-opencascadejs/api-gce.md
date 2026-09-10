# libcascade — gce

25 top-level symbols. Signatures are verbatim typescript.

// Defines status codes returned by `gce` construction algorithms
gce_ErrorType: typeof gce_ErrorType[keyof typeof gce_ErrorType]

// This class implements construction algorithms for `gp_Circ`
gce_MakeCirc: declare class gce_MakeCirc extends gce_Root

constructor

// Returns the constructed circle
Value(): gp_Circ;

// Alias for `Value()` returning a copy
Operator(): gp_Circ;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Circ2d`
gce_MakeCirc2d: declare class gce_MakeCirc2d extends gce_Root

constructor

// Returns the constructed circle
Value(): gp_Circ2d;

// Alias for `Value()` returning a copy
Operator(): gp_Circ2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Cone`
gce_MakeCone: declare class gce_MakeCone extends gce_Root

constructor

// Returns the constructed cone
Value(): gp_Cone;

// Alias for `Value()` returning a copy
Operator(): gp_Cone;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Cylinder`
gce_MakeCylinder: declare class gce_MakeCylinder extends gce_Root

constructor

// Returns the constructed cylinder
Value(): gp_Cylinder;

// Alias for `Value()` returning a copy
Operator(): gp_Cylinder;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Dir`
gce_MakeDir: declare class gce_MakeDir extends gce_Root

constructor

// Returns the constructed unit vector
Value(): gp_Dir;

// Alias for `Value()` returning a copy
Operator(): gp_Dir;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Dir2d`
gce_MakeDir2d: declare class gce_MakeDir2d extends gce_Root

constructor

// Returns the constructed unit vector
Value(): gp_Dir2d;

// Alias for `Value()` returning a copy
Operator(): gp_Dir2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Elips`
gce_MakeElips: declare class gce_MakeElips extends gce_Root

constructor

// Returns the constructed ellipse
Value(): gp_Elips;

// Alias for `Value()` returning a copy
Operator(): gp_Elips;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Elips2d`
gce_MakeElips2d: declare class gce_MakeElips2d extends gce_Root

constructor

// Returns the constructed ellipse
Value(): gp_Elips2d;

// Alias for `Value()` returning a copy
Operator(): gp_Elips2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Hypr`
gce_MakeHypr: declare class gce_MakeHypr extends gce_Root

constructor

// Returns the constructed hyperbola
Value(): gp_Hypr;

// Alias for `Value()` returning a copy
Operator(): gp_Hypr;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Hypr2d`
gce_MakeHypr2d: declare class gce_MakeHypr2d extends gce_Root

constructor

// Returns the constructed hyperbola
Value(): gp_Hypr2d;

// Alias for `Value()` returning a copy
Operator(): gp_Hypr2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Lin`
gce_MakeLin: declare class gce_MakeLin extends gce_Root

constructor

// Returns the constructed line
Value(): gp_Lin;

// Alias for `Value()` returning a copy
Operator(): gp_Lin;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Lin2d`
gce_MakeLin2d: declare class gce_MakeLin2d extends gce_Root

constructor

// Returns the constructed line
Value(): gp_Lin2d;

// Alias for `Value()` returning a copy
Operator(): gp_Lin2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a symmetrical transformation in 3D space about a point, axis or plane
gce_MakeMirror: declare class gce_MakeMirror

constructor

// Returns the constructed transformation
Value(): gp_Trsf;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a symmetrical transformation in 2D space about a point or axis
gce_MakeMirror2d: declare class gce_MakeMirror2d

constructor

// Returns the constructed transformation
Value(): gp_Trsf2d;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for `gp_Parab`
gce_MakeParab: declare class gce_MakeParab extends gce_Root

constructor

// Returns the constructed parabola
Value(): gp_Parab;

// Alias for `Value()` returning a copy
Operator(): gp_Parab;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements construction algorithms for `gp_Parab2d`
gce_MakeParab2d: declare class gce_MakeParab2d extends gce_Root

constructor

// Returns the constructed parabola
Value(): gp_Parab2d;

// Alias for `Value()` returning a copy
Operator(): gp_Parab2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements construction algorithms for `gp_Pln`
gce_MakePln: declare class gce_MakePln extends gce_Root

constructor

// Returns the constructed plane
Value(): gp_Pln;

// Alias for `Value()` returning a copy
Operator(): gp_Pln;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a rotation in 3D space
gce_MakeRotation: declare class gce_MakeRotation

constructor

// Returns the constructed transformation
Value(): gp_Trsf;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements an elementary construction algorithm for a rotation in 2D space
gce_MakeRotation2d: declare class gce_MakeRotation2d

constructor

// Returns the constructed transformation
Value(): gp_Trsf2d;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements an elementary construction algorithm for a scaling transformation in 3D space
gce_MakeScale: declare class gce_MakeScale

constructor

// Returns the constructed transformation
Value(): gp_Trsf;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements an elementary construction algorithm for a scaling transformation in 2D space
gce_MakeScale2d: declare class gce_MakeScale2d

constructor

// Returns the constructed transformation
Value(): gp_Trsf2d;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a translation in 3D space
gce_MakeTranslation: declare class gce_MakeTranslation

constructor

// Returns the constructed transformation
Value(): gp_Trsf;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements elementary construction algorithms for a translation in 2D space
gce_MakeTranslation2d: declare class gce_MakeTranslation2d

constructor

// Returns the constructed transformation
Value(): gp_Trsf2d;

// Alias for `Value()` returning a copy
Operator(): gp_Trsf2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides common status services for all `gce` construction classes
gce_Root: declare class gce_Root

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
