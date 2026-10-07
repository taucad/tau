# @taucad/picovoxel tau API index

@taucad/picovoxel 0.1.0-beta.0 · 30 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## Types — `tau-api-types.md`

PicovoxelPart (type) [3 members] — A delivered part's geometry, display name and standard glTF material
  PicovoxelPart.shape (property)
  PicovoxelPart.name (property)
  PicovoxelPart.material (property)
PicovoxelModel (type) [4 members] — A flat model with shared indexed images, textures and samplers
  PicovoxelModel.textures (property) — An array of textures
  PicovoxelModel.samplers (property) — An array of samplers
  PicovoxelModel.images (property)
  PicovoxelModel.shapes (property)
PicovoxelResult (type) — A PicoVoxel model's single part, flat list, or model with…
Material (type) [11 members] — Standard glTF 2.0 material properties, including the ratified physical material…
  Material.name (property) — The user-defined name of this object
  Material.pbrMetallicRoughness (property) — A set of parameter values that are used to define…
  Material.normalTexture (property) — The normal map texture
  Material.occlusionTexture (property) — The occlusion map texture
  Material.emissiveTexture (property) — The emissive map texture
  Material.emissiveFactor (property) — The RGB components of the emissive color of the material
  Material.alphaMode (property) — The alpha rendering mode of the material
  Material.alphaCutoff (property) — The alpha cutoff value of the material
  Material.doubleSided (property) — Specifies whether the material is double sided
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
