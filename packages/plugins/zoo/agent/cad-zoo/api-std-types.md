# kcl-std — std.types

30 top-level symbols. Signatures are verbatim kcl.

// The `any` type is the type of all possible values in KCL
any

// The type of the none (aka null) value
// EXPERIMENTAL
none

// A number
number

// A boolean value
bool

// A sequence of characters
string

// Tags are used to give a name (tag) to a specific path
TagDecl

// A tag which references a line, arc, or other edge in a sketch or an edge of a solid
TaggedEdge

// A tag which references a face of a solid, including the distinguished tags `START` and `END`
TaggedFace

// Represents geometry which is defined using some other CAD system and imported into KCL
ImportedGeometry

// The type of any function in KCL
fn

// An abstract plane
Plane

// A sketch is a collection of paths
Sketch

// A solid is a collection of extruded surfaces
Solid

// A face of a solid
Face

// A helix
Helix

// An edge of a solid
Edge

// A point in two dimensional space
Point2d: type Point2d = [number(Length); 2]

// A point in three dimensional space
Point3d: type Point3d = [number(Length); 3]

// An abstract and infinite line in 2d space
Axis2d

// An abstract and infinite line in 3d space
Axis3d

// A GD&T annotation
// EXPERIMENTAL
GdtAnnotation

mm: type mm = number(mm)

cm: type cm = number(cm)

m: type m = number(m)

in: type in = number(in)

ft: type ft = number(ft)

yd: type yd = number(yd)

rad: type rad = number(rad)

deg: type deg = number(deg)

// KCL types
types
