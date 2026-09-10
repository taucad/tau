# libcascade — GccInt

8 top-level symbols. Signatures are verbatim typescript.

// Describes a circle as a bisecting curve between two 2D geometric objects (such as circles or points)
GccInt_BCirc: declare class GccInt_BCirc extends GccInt_Bisec

constructor

// Returns a 2D circle which is the geometry of this bisecting curve
Circle(): gp_Circ2d;

// Returns GccInt_Cir, which is the type of any {@link GccInt_BCirc`GccInt_BCirc`} bisecting curve
ArcType(): GccInt_IType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an ellipse as a bisecting curve between two 2D geometric objects (such as circles or points)
GccInt_BElips: declare class GccInt_BElips extends GccInt_Bisec

constructor

// Returns a 2D ellipse which is the geometry of this bisecting curve
Ellipse(): gp_Elips2d;

// Returns GccInt_Ell, which is the type of any {@link GccInt_BElips`GccInt_BElips`} bisecting curve
ArcType(): GccInt_IType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a hyperbola as a bisecting curve between two 2D geometric objects (such as circles or points)
GccInt_BHyper: declare class GccInt_BHyper extends GccInt_Bisec

constructor

// Returns a 2D hyperbola which is the geometry of this bisecting curve
Hyperbola(): gp_Hypr2d;

// Returns GccInt_Hpr, which is the type of any {@link GccInt_BHyper`GccInt_BHyper`} bisecting curve
ArcType(): GccInt_IType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a line as a bisecting curve between two 2D geometric objects (such as lines, circles or points)
GccInt_BLine: declare class GccInt_BLine extends GccInt_Bisec

constructor

// Returns a 2D line which is the geometry of this bisecting line
Line(): gp_Lin2d;

// Returns GccInt_Lin, which is the type of any {@link GccInt_BLine`GccInt_BLine`} bisecting line
ArcType(): GccInt_IType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a parabola as a bisecting curve between two 2D geometric objects (such as lines, circles or points)
GccInt_BParab: declare class GccInt_BParab extends GccInt_Bisec

constructor

// Returns a 2D parabola which is the geometry of this bisecting curve
Parabola(): gp_Parab2d;

// Returns GccInt_Par, which is the type of any {@link GccInt_BParab`GccInt_BParab`} bisecting curve
ArcType(): GccInt_IType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a point as a bisecting object between two 2D geometric objects
GccInt_BPoint: declare class GccInt_BPoint extends GccInt_Bisec

constructor

// Returns a 2D point which is the geometry of this bisecting object
Point(): gp_Pnt2d;

// Returns GccInt_Pnt, which is the type of any {@link GccInt_BPoint`GccInt_BPoint`} bisecting object
ArcType(): GccInt_IType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The deferred class {@link GccInt_Bisec`GccInt_Bisec`} is the root class for elementary bisecting loci between two simple geometric objects (i.e
GccInt_Bisec: declare class GccInt_Bisec extends Standard_Transient

// Returns the type of bisecting object (line, circle, parabola, hyperbola, ellipse, point)
ArcType(): GccInt_IType;

// Returns the bisecting line when ArcType returns Pnt
Point(): gp_Pnt2d;

// Returns the bisecting line when ArcType returns Lin
Line(): gp_Lin2d;

// Returns the bisecting line when ArcType returns Cir
Circle(): gp_Circ2d;

// Returns the bisecting line when ArcType returns Hpr
Hyperbola(): gp_Hypr2d;

// Returns the bisecting line when ArcType returns Par
Parabola(): gp_Parab2d;

// Returns the bisecting line when ArcType returns Ell
Ellipse(): gp_Elips2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GccInt_IType: typeof GccInt_IType[keyof typeof GccInt_IType]
