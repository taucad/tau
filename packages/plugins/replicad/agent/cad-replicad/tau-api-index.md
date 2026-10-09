# @taucad/replicad tau API index

@taucad/replicad 0.1.0-beta.0 · 61 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## Types — `tau-api-types.md`

ShapeConfig (type) [10 members] — A shape with optional display and material metadata for rendering
  ShapeConfig.shape (property)
  ShapeConfig.name (property)
  ShapeConfig.strokeType (property)
  ShapeConfig.density (property) — Physical density in g/cm³ for STEP mass computation
  ShapeConfig.interfaces (property)
  ShapeConfig.color (property) — CSS color, converted from sRGB to linear glTF base color
  ShapeConfig.opacity (property)
  ShapeConfig.metalness (property)
  ShapeConfig.roughness (property)
  ShapeConfig.material (property)
Model (type) [4 members] — Model-level textures and images shared by the returned BRep shapes
  Model.textures (property) — An array of textures
  Model.samplers (property) — An array of samplers
  Model.images (property)
  Model.shapes (property)
Material (type) [11 members] — Standard glTF 2.0 material properties, including the ratified physical material…
  Material.pbrMetallicRoughness (property) — A set of parameter values that are used to define…
  Material.normalTexture (property) — The normal map texture
  Material.occlusionTexture (property) — The occlusion map texture
  Material.emissiveTexture (property) — The emissive map texture
  Material.emissiveFactor (property) — The RGB components of the emissive color of the material
  Material.alphaMode (property) — The alpha rendering mode of the material
  Material.alphaCutoff (property) — The alpha cutoff value of the material
  Material.doubleSided (property) — Specifies whether the material is double sided
  Material.name (property) — The user-defined name of this object
  Material.extras (property)
  Material.extensions (property)
Image (type) [3 members] — An image encoded into a GLB's binary buffer
  Image.name (property)
  Image.mimeType (property)
  Image.data (property)
Resources (type) [3 members] — Shared image, texture and sampler resources referenced by standard glTF…
  Resources.textures (property) — An array of textures
  Resources.samplers (property) — An array of samplers
  Resources.images (property)
FaceDeclaration (type) [2 members] — Named face selector declaration resolved by the Tau Replicad kernel…
  FaceDeclaration.kind (property)
  FaceDeclaration.select (property)
AxisDeclaration (type) [2 members] — Named cylindrical or conical axis selector declaration resolved from a…
  AxisDeclaration.kind (property)
  AxisDeclaration.select (property)
DatumDeclaration (type) [4 members] — Named orthonormal datum frame declaration exported as an AP242 placement
  DatumDeclaration.kind (property)
  DatumDeclaration.origin (property)
  DatumDeclaration.xAxis (property)
  DatumDeclaration.zAxis (property)
GroupDeclaration (type) [2 members] — Named group of face and axis declarations
  GroupDeclaration.kind (property)
  GroupDeclaration.members (property)
InterfaceDeclaration (type) [1 members] — Replicad interface annotation declaration accepted by Tau's STEP exporter
  InterfaceDeclaration.kind (property)
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
