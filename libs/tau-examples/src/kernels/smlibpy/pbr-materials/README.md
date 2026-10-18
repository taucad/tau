# PBR materials — SMLibPy

An original Tau example (Apache-2.0): five finishes on one plinth, the Python port of the SMLib WebAssembly `pbr-materials` example.

- Lacquered wood: `KHR_materials_clearcoat`.
- Brushed aluminium: `KHR_materials_anisotropy`, which needs the box UVs and tangents Tau projects.
- Tinted glass: `KHR_materials_transmission`, `KHR_materials_ior` and `KHR_materials_volume`, with volume distances in metres.
- Glowing acrylic: `emissiveFactor` and `KHR_materials_emissive_strength`.
- Checker: a PNG image, texture and sampler returned beside the shapes, scaled with `KHR_texture_transform`.

`main` returns a model dict (`shapes`, `images`, `textures`, `samplers`). Each material is a plain glTF 2.0 material dict; the plinth uses the `color` and `roughness` shorthand. Tau validates the materials and writes them to GLB and glTF; STEP and STL carry geometry only. Expected cost: light.
