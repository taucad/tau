# kcl-std — std.types

33 top-level symbols. Signatures are verbatim kcl.

// Category: std.types
// The `any` type is the type of all possible values in KCL
any
// Example:
//   fn acceptAnything(@input: any) {
//     return true
//   }
//   
//   acceptAnything(42)
//   acceptAnything('hello')
//   acceptAnything(XY)
//   acceptAnything([0, 1, 2])

// Category: std.types
// The uninhabited type of computations that never complete normally
// Remarks: `never` has no values and is a subtype of every type. Use it as the return type of a function that always stops evaluation by raising an error. A function declared to return `never` produces a type error if it returns a value or reaches the end of its body.
// EXPERIMENTAL
never

// Category: std.types
// The type of the none (aka null) value
// Remarks: Note that this is not the empty type, i.e., a type which represents no values.
// EXPERIMENTAL
none

// Category: std.types
// A number
// Remarks: May be signed or unsigned, an integer or decimal value. KCL numbers always include units, e.g., the number `42` is always '42 mm' or '42 degrees', etc. it is never just '42'. The `number` type may or may not include units, if none are specified, then it is the type of any number. E.g., - `number`: the type of any numbers, - `number(mm)`: the type of numbers in millimeters, - `number(in)`: the type of numbers in inches, - `number(Length)`: the type of numbers in any length unit, - `number(deg)`: the type of numbers in degrees, - `number(Angle)`: the type of numbers in any angle unit, - `number(_)` or `number(Count)`: the type of unit-less numbers, representing a count of things, or a ratio, etc. For more information, see [numeric types](/docs/kcl-lang/numeric).
number

// Category: std.types
// A boolean value
// Remarks: `true` or `false`.
bool

// Category: std.types
// A sequence of characters
// Remarks: Strings may be delimited using either single or double quotes.
string
// Example:
//   "hello,"
//   'world!'

// Category: std.types
// Tags are used to give a name (tag) to a specific path
// Remarks: ### Tag Declaration The syntax for declaring a tag is `$myTag`. You would use it in the following way: ```js startSketchOn(XZ) |> startProfile(at = origin) |> angledLine(angle = 0, length = 191.26, tag = $rectangleSegmentA001) |> angledLine( angle = segAng(rectangleSegmentA001) - 90deg, length = 196.99, tag = $rectangleSegmentB001, ) |> angledLine( angle = segAng(rectangleSegmentA001), length = -segLen(rectangleSegmentA001), tag = $rectangleSegmentC001, ) |> line(endAbsolute = [profileStartX(%), profileStartY(%)]) |> close() ``` ### Tag Scope Tags are scoped globally if in the root context meaning in this example you can use the tag `rectangleSegmentA001` in any function or expression in the file. However if the code was written like this: ```js fn rect(origin) { return startSketchOn(XZ) |> startProfile(at = origin) |> angledLine(angle = 0, length = 191.26, tag = $rectangleSegmentA001) |> angledLine( angle = segAng(rectangleSegmentA001) - 90, length = 196.99, tag = $rectangleSegmentB001 ) |> angledLine( angle = segAng(rectangleSegmentA001), length = -segLen(rectangleSegmentA001), tag = $rectangleSegmentC001 ) |> line(endAbsolute = [profileStartX(%), profileStartY(%)]) |> close() } rect(origin = [0, 0]) rect(origin = [20, 0]) ``` Those tags would only be available in the `rect` function and not globally. However you likely want to use those tags somewhere outside the `rect` function. Tags are accessible through the sketch group they are declared in. For example the following code works. ```js fn rect(origin) { return startSketchOn(XZ) |> startProfile(at = origin) |> angledLine(angle = 0, length = 191.26, tag = $rectangleSegmentA001) |> angledLine( angle = segAng(rectangleSegmentA001) - 90deg, length = 196.99, tag = $rectangleSegmentB001, ) |> angledLine( angle = segAng(rectangleSegmentA001), length = -segLen(rectangleSegmentA001), tag = $rectangleSegmentC001, ) |> line(endAbsolute = [profileStartX(%), profileStartY(%)]) |> close() } rect(origin = [0, 0]) myRect = rect(origin = [20, 0]) myRect |> extrude(length = 10) |> fillet(radius = 0.5, tags = [myRect.tags.rectangleSegmentA001]) ``` See how we use the tag `rectangleSegmentA001` in the `fillet` function outside the `rect` function. This is because the `rect` function is returning the sketch group that contains the tags.
TagDecl

// Category: std.types
// A tag which references a line, arc, or other edge in a sketch or an edge of a solid
// Remarks: Created by using a tag declarator (see the docs for `TagDecl`). Can be used where an `Edge` is required. If a line in a sketch is tagged and then the sketch is extruded, the tag is a `TaggedEdge` before extrusion and a `TaggedFace` after extrusion.
TaggedEdge

// Category: std.types
// A tag which references a face of a solid, including the distinguished tags `START` and `END`
// Remarks: Created by using a tag declarator (see the docs for `TagDecl`). If a line in a sketch is tagged and then the sketch is extruded, the tag is a `TaggedEdge` before extrusion and a `TaggedFace` after extrusion.
TaggedFace

// Category: std.types
// Represents geometry which is defined using some other CAD system and imported into KCL
// Remarks: `ImportedGeometry` is distinct from `Solid`, and there is no conversion between them. An import can be positioned and styled, but not modelled against.
ImportedGeometry

// Category: std.types
// The type of any function in KCL
fn

// Category: std.types
// An abstract plane
// Remarks: A plane has a position and orientation in space defined by its origin and axes. A plane is abstract in the sense that it is not part of the objects being drawn. A plane can be used to sketch on. A plane can be created in several ways: - you can use one of the default planes, e.g., `XY`. - you can use `offsetPlane` to create a new plane offset from an existing one, e.g., `offsetPlane(XY, offset = 150)`. - you can use negation to create a plane from an existing one which is identical but has an opposite normal e.g., `-XY`. - you can define an entirely custom plane, e.g., ```js myXY = { origin = { x = 0, y = 0, z = 0 }, xAxis = { x = 1, y = 0, z = 0 }, yAxis = { x = 0, y = 1, z = 0 }, } ``` Any object with appropriate `origin`, `xAxis`, and `yAxis` fields can be used as a plane. The plane's Z axis (i.e. which way is "up") will be the cross product X x Y. In other words, KCL planes follow the right-hand rule.
Plane

// Category: std.types
// A segment in a sketch created in a sketch block
// Remarks: See the [solver module](/docs/kcl-std/modules/std-solver) for functions that create segments and the [region function](/docs/kcl-std/functions/std-sketch-region) for examples using segments to create a region that can be extruded.
// EXPERIMENTAL
Segment

// Category: std.types
// A sketch is a collection of paths
// Remarks: When you define a sketch to a variable like: ```js mySketch = startSketchOn(XY) |> startProfile(at = [-12, 12]) |> line(end = [24, 0]) |> line(end = [0, -24]) |> line(end = [-24, 0]) |> close() ``` The `mySketch` variable will be an executed `Sketch` object. Executed being past tense, because the engine has already executed the commands to create the sketch. The previous sketch commands will never be executed again, in this case. If you would like to encapsulate the commands to create the sketch any time you call it, you can use a function. ```js fn createSketch() { return startSketchOn(XY) |> startProfile(at = [-12, 12]) |> line(end = [24, 0]) |> line(end = [0, -24]) |> line(end = [-24, 0]) |> close() } ``` Now, every time you call `createSketch()`, the commands will be executed and a new sketch will be created. When you assign the result of `createSketch()` to a variable (`mySketch = createSketch()`), you are assigning the executed sketch to that variable. Meaning that the sketch `mySketch` will not be executed again. You can still execute _new_ commands on the sketch like `extrude`, `revolve`, `loft`, etc. and the sketch will be updated.
Sketch

// Category: std.types
// A solid is a collection of extruded surfaces
// Remarks: When you define a solid to a variable like: ```js myPart = startSketchOn(XY) |> startProfile(at = [-12, 12]) |> line(end = [24, 0]) |> line(end = [0, -24]) |> line(end = [-24, 0]) |> close() |> extrude(length = 6) ``` The `myPart` variable will be an executed `Solid` object. Executed being past tense, because the engine has already executed the commands to create the solid. The previous solid commands will never be executed again, in this case. If you would like to encapsulate the commands to create the solid any time you call it, you can use a function. ```js fn createPart() { return startSketchOn(XY) |> startProfile(at = [-12, 12]) |> line(end = [24, 0]) |> line(end = [0, -24]) |> line(end = [-24, 0]) |> close() |> extrude(length = 6) } ``` Now, every time you call `createPart()`, the commands will be executed and a new solid will be created. When you assign the result of `createPart()` to a variable (`myPart = createPart()`), you are assigning the executed solid to that variable. Meaning that the solid `myPart` will not be executed again. You can still execute _new_ commands on the solid like `shell`, `fillet`, `chamfer`, etc. and the solid will be updated.
Solid

// Category: std.types
// A face of a solid
Face

// Category: std.types
// A helix
// Remarks: A helix can be created by the [`helix` function](/docs/kcl-std/functions/std-helix).
Helix

// Category: std.types
// An edge of a solid
Edge

// Category: std.types
// A [bounded edge](/docs/kcl-std/functions/std-sketch-getBoundedEdge) of a solid
BoundedEdge

// Category: std.types
// A point in two dimensional space
// Remarks: `Point2d` is an alias for a two-element array of [number](/docs/kcl-std/types/std-types-number)s. To write a value with type `Point2d`, use an array, e.g., `[0, 0]` or `[5.0, 3.14]`.
Point2d: type Point2d = [number(Length); 2]

// Category: std.types
// A point in three dimensional space
// Remarks: `Point3d` is an alias for a three-element array of [number](/docs/kcl-std/types/std-types-number)s. To write a value with type `Point3d`, use an array, e.g., `[0, 0, 0]` or `[5.0, 3.14, 6.8]`.
Point3d: type Point3d = [number(Length); 3]

// Category: std.types
// An abstract and infinite line in 2d space
// Remarks: The `X`, `Y`, and `Z` axes are defined in the standard library. You can define custom axes by using an object with origin and direction properties. The 2D version of the X axis could be defined like: ```js xAxis2d = { origin = [0, 0], direction = [1, 0], } ``` The number components of the origin and direction must be usable as lengths. A 3D axis can be used in contexts that require a 2D axis. The Z component is ignored.
Axis2d

// Category: std.types
// An abstract and infinite line in 3d space
// Remarks: The `X`, `Y`, and `Z` axes are defined in the standard library. You can define custom axes by using an object with origin and direction properties. The 3D X axis is defined similar to the following: ```js xAxis = { origin = [0, 0, 0], direction = [1, 0, 0], } ``` The number components of the origin and direction must be usable as lengths. A 3D axis can be used in contexts that require a 2D axis. The Z component is ignored.
Axis3d

// Category: std.types
// A GD&T annotation created by one of the [`gdt` functions](/docs/kcl-std/modules/std-gdt)
GdtAnnotation

// Category: std.types
mm: type mm = number(mm)

// Category: std.types
cm: type cm = number(cm)

// Category: std.types
m: type m = number(m)

// Category: std.types
in: type in = number(in)

// Category: std.types
ft: type ft = number(ft)

// Category: std.types
yd: type yd = number(yd)

// Category: std.types
rad: type rad = number(rad)

// Category: std.types
deg: type deg = number(deg)

// Category: std.types
// KCL types
// Remarks: Types can (optionally) be used to describe a function's arguments and returned value. They are checked when a program runs and can help avoid errors. They are also useful to help document what a function does.
types
