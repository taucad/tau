# @taucad/picovoxel authoring API index

@taucad/picovoxel 0.1.0-beta.0 · 30 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Types — `tau-api-types.md`

PicovoxelPart (type) [3 members] — A delivered part's geometry, display name and standard glTF material [id: typescript:PicovoxelPart]
  PicovoxelPart.shape (property) [id: typescript:PicovoxelPart.shape]
  PicovoxelPart.name (property) [id: typescript:PicovoxelPart.name]
  PicovoxelPart.material (property) [id: typescript:PicovoxelPart.material]
PicovoxelModel (type) [4 members] — A flat model with shared indexed images, textures and samplers [id: typescript:PicovoxelModel]
  PicovoxelModel.textures (property) — An array of textures [id: typescript:PicovoxelModel.textures]
  PicovoxelModel.samplers (property) — An array of samplers [id: typescript:PicovoxelModel.samplers]
  PicovoxelModel.images (property) [id: typescript:PicovoxelModel.images]
  PicovoxelModel.shapes (property) [id: typescript:PicovoxelModel.shapes]
PicovoxelResult (type) — A PicoVoxel model's single part, flat list, or model with… [id: typescript:PicovoxelResult]
Material (type) [11 members] — Standard glTF 2.0 material properties, including the ratified physical material… [id: typescript:Material]
  Material.name (property) — The user-defined name of this object [id: typescript:Material.name]
  Material.pbrMetallicRoughness (property) — A set of parameter values that are used to define… [id: typescript:Material.pbrMetallicRoughness]
  Material.normalTexture (property) — The normal map texture [id: typescript:Material.normalTexture]
  Material.occlusionTexture (property) — The occlusion map texture [id: typescript:Material.occlusionTexture]
  Material.emissiveTexture (property) — The emissive map texture [id: typescript:Material.emissiveTexture]
  Material.emissiveFactor (property) — The RGB components of the emissive color of the material [id: typescript:Material.emissiveFactor]
  Material.alphaMode (property) — The alpha rendering mode of the material [id: typescript:Material.alphaMode]
  Material.alphaCutoff (property) — The alpha cutoff value of the material [id: typescript:Material.alphaCutoff]
  Material.doubleSided (property) — Specifies whether the material is double sided [id: typescript:Material.doubleSided]
  Material.extras (property) [id: typescript:Material.extras]
  Material.extensions (property) [id: typescript:Material.extensions]
Image (type) [3 members] — An image encoded into a GLB's binary buffer [id: typescript:Image]
  Image.name (property) [id: typescript:Image.name]
  Image.mimeType (property) [id: typescript:Image.mimeType]
  Image.data (property) [id: typescript:Image.data]
Resources (type) [3 members] — Shared image, texture and sampler resources referenced by standard glTF… [id: typescript:Resources]
  Resources.textures (property) — An array of textures [id: typescript:Resources.textures]
  Resources.samplers (property) — An array of samplers [id: typescript:Resources.samplers]
  Resources.images (property) [id: typescript:Resources.images]
