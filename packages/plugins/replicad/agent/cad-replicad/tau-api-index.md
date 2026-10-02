# @taucad/replicad authoring API index

@taucad/replicad 0.1.0-beta.0 · 19 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Types — `tau-api-types.md`

ShapeConfig (type) — A shape with optional display and material metadata for rendering [id: typescript:ShapeConfig]
Model (type) — Model-level textures and images shared by the returned BRep shapes [id: typescript:Model]
Material (type) — Standard glTF 2.0 material properties, including the ratified physical material… [id: typescript:Material]
Image (type) — An image encoded into a GLB's binary buffer [id: typescript:Image]
Resources (type) — Shared image, texture and sampler resources referenced by standard glTF… [id: typescript:Resources]
FaceDeclaration (type) — Named face selector declaration resolved by the Tau Replicad kernel… [id: typescript:FaceDeclaration]
AxisDeclaration (type) — Named cylindrical or conical axis selector declaration resolved from a… [id: typescript:AxisDeclaration]
DatumDeclaration (type) — Named orthonormal datum frame declaration exported as an AP242 placement [id: typescript:DatumDeclaration]
GroupDeclaration (type) — Named group of face and axis declarations [id: typescript:GroupDeclaration]
InterfaceDeclaration (type) — Replicad interface annotation declaration accepted by Tau's STEP exporter [id: typescript:InterfaceDeclaration]
InterfaceDeclarations (type) — Map of interface names to annotation declarations [id: typescript:InterfaceDeclarations]

## Functions — `tau-api-functions.md`

face (function) — Declare a named face selected from a Replicad `FaceFinder` [id: typescript:face]
axis (function) — Declare a named cylindrical or conical axis selected from a… [id: typescript:axis]
frame (function) — Declare a named coordinate frame exported as AP242 supplemental geometry [id: typescript:frame]
datum (function) — Declare a named coordinate frame exported as AP242 supplemental geometry [id: typescript:datum]
group (function) — Declare a named group of face and axis annotations [id: typescript:group]
isValidInterfaceName (function) — Return whether a candidate interface path is valid for STEP… [id: typescript:isValidInterfaceName]
isValidAuthoringKey (function) — Return whether a candidate top-level authoring key can appear in… [id: typescript:isValidAuthoringKey]

## Constants — `tau-api-constants.md`

INTERFACE_NAME_REGEX (constant) — Supported GeoSpec interface name grammar [id: typescript:INTERFACE_NAME_REGEX]
