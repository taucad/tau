# @taucad/replicad authoring API index

@taucad/replicad 0.1.0-beta.0 · 19 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Types — `tau-api-types.md`

ShapeConfig (type) — A shape with optional display and material metadata for rendering
Model (type) — Model-level textures and images shared by the returned BRep shapes
Material (type) — Standard glTF 2.0 material properties, including the ratified physical material…
Image (type) — An image encoded into a GLB's binary buffer
Resources (type) — Shared image, texture and sampler resources referenced by standard glTF…
FaceDeclaration (type) — Named face selector declaration resolved by the Tau Replicad kernel…
AxisDeclaration (type) — Named cylindrical or conical axis selector declaration resolved from a…
DatumDeclaration (type) — Named orthonormal datum frame declaration exported as an AP242 placement
GroupDeclaration (type) — Named group of face and axis declarations
InterfaceDeclaration (type) — Replicad interface annotation declaration accepted by Tau's STEP exporter
InterfaceDeclarations (type) — Map of interface names to annotation declarations

## Functions — `tau-api-functions.md`

face (function) — Declare a named face selected from a Replicad `FaceFinder`
axis (function) — Declare a named cylindrical or conical axis selected from a…
frame (function) — Declare a named coordinate frame exported as AP242 supplemental geometry
datum (function) — Declare a named coordinate frame exported as AP242 supplemental geometry
group (function) — Declare a named group of face and axis annotations
isValidInterfaceName (function) — Return whether a candidate interface path is valid for STEP…
isValidAuthoringKey (function) — Return whether a candidate top-level authoring key can appear in…

## Constants — `tau-api-constants.md`

INTERFACE_NAME_REGEX (constant) — Supported GeoSpec interface name grammar
