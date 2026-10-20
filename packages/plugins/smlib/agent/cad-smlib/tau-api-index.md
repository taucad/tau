# @taucad/smlib tau API index

@taucad/smlib 0.1.0-beta.8 · 36 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## Types — `tau-api-types.md`

SmlibShape (type) [lines 5-6] — Anything an SMLib model can return for display
ShapeConfig (type) [lines 8-64] [9 members] — A shape with optional display and material metadata for rendering
  ShapeConfig.shape (property)
  ShapeConfig.name (property)
  ShapeConfig.strokeType (property) — Drawing stroke style for curves
  ShapeConfig.density (property) — Physical density in g/cm³, retained on the part for mass…
  ShapeConfig.color (property) — CSS color, converted from sRGB to linear glTF base color
  ShapeConfig.opacity (property)
  ShapeConfig.metalness (property)
  ShapeConfig.roughness (property)
  ShapeConfig.material (property)
Model (type) [lines 66-79] [4 members] — Model-level textures and images shared by the returned shapes
  Model.textures (property) — An array of textures
  Model.samplers (property) — An array of samplers
  Model.images (property)
  Model.shapes (property)
Material (type) [lines 81-224] [11 members] — Standard glTF 2.0 material properties, including the ratified physical material…
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
Image (type) [lines 226-237] [3 members] — An image encoded into a GLB's binary buffer
  Image.name (property)
  Image.mimeType (property)
  Image.data (property)
Resources (type) [lines 239-250] [3 members] — Shared image, texture and sampler resources referenced by standard glTF…
  Resources.textures (property) — An array of textures
  Resources.samplers (property) — An array of samplers
  Resources.images (property)
