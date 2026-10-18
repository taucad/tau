# PBR materials showcase

An original Tau example (Apache-2.0) showing standard glTF materials on SMLib bodies. `main` returns a `Model` envelope whose shape configurations each carry a glTF `material`:

| Part               | Material                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| Plinth             | Rough dielectric slate                                                 |
| Brushed steel      | Metal with `KHR_materials_anisotropy` (`brushStrength`)                |
| Clear-coated paint | Red paint under `KHR_materials_clearcoat` (`clearcoat`)                |
| Glass              | `KHR_materials_transmission`, `KHR_materials_ior` (`glassIor`), volume |
| Polished gold      | Low-roughness metal                                                    |
| Velvet             | `KHR_materials_sheen`                                                  |
| Glowing ring       | Emissive with `KHR_materials_emissive_strength` (`glowStrength`)       |

Color factors are linear and `KHR_materials_volume` distances are metres, as glTF defines them. Geometry uses millimetres, Z-up; `spacing` sets the grid pitch on the plinth. Materials reach the viewer and the GLB/glTF exports; STL and STEP carry geometry only. Expected cost: light.
