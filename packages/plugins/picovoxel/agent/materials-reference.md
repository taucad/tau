# PicoVoxel materials

Attach a standard glTF material to the final `{ shape, name?, material? }` descriptor.
Import `Material`, `Image`, `Resources`, `PicovoxelPart`, `PicovoxelModel` and
`PicovoxelResult` with `import type` from `@taucad/picovoxel`. Geometry operations
continue to use raw `Mesh` and `Voxels`; material descriptors are return metadata.
Raw shapes and flat mixed arrays remain valid and use Tau's default CAD material.
Omitted `material` retains the legacy CAD appearance; explicit `material: {}` uses
standard glTF defaults. Author changes before return apply; later mutations cannot
change the captured snapshot.

```ts
import type { Pico } from 'picovoxel';
import type { PicovoxelModel } from '@taucad/picovoxel';

export function coatedHousing(pico: Pico, png: Uint8Array<ArrayBuffer>): PicovoxelModel {
  return {
    images: [{ name: 'Finish', mimeType: 'image/png', data: png }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729 }],
    shapes: [
      {
        shape: pico.createVoxels({ shape: 'sphere', radius: 10 }),
        name: 'Coated housing',
        material: {
          pbrMetallicRoughness: {
            metallicFactor: 0.8,
            roughnessFactor: 0.4,
            baseColorTexture: {
              index: 0,
              extensions: {
                KHR_texture_transform: { scale: [4, 4], rotation: Math.PI / 4 },
              },
            },
          },
          extensions: {
            KHR_materials_clearcoat: {
              clearcoatFactor: 0.7,
              clearcoatRoughnessFactor: 0.15,
            },
          },
        },
      },
    ],
  };
}
```

Resources belong to the model envelope: texture indexes reference its `textures`,
which reference `images` and optional `samplers`. Supply nonempty encoded PNG,
JPEG or WebP bytes, not a URI or pixel array. WebP uses
`{ extensions: { EXT_texture_webp: { source: imageIndex } } }` on the texture;
PNG/JPEG use `source`. Keep imported project assets in the runtime filesystem
when loading them so dependency tracking sees changes. Tau owns a deep snapshot
of the resources and materials before disposing the author session.

Use linear glTF color factors. Geometry coordinates and `voxelSize` are
millimetres, volume thickness/attenuation distances are metres, texture and
anisotropy rotations are radians, and iridescence thickness is nanometres.
Metallic/roughness, clearcoat, transmission, anisotropy and occlusion strength
are in [0, 1]. IOR is at least 1. Emissive strength and dispersion are nonnegative.
Omit attenuation distance for infinite reach; finite supplied distances must be
positive. Invalid factors, resource indexes, sampler values and UV sets fail
with an authoring diagnostic; only UV0 is provided.

All 17 texture slots are supported:

| Material scope               | Texture fields                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base                         | `pbrMetallicRoughness.baseColorTexture`, `pbrMetallicRoughness.metallicRoughnessTexture`, `normalTexture`, `occlusionTexture`, `emissiveTexture` |
| `KHR_materials_clearcoat`    | `clearcoatTexture`, `clearcoatRoughnessTexture`, `clearcoatNormalTexture`                                                                        |
| `KHR_materials_transmission` | `transmissionTexture`                                                                                                                            |
| `KHR_materials_volume`       | `thicknessTexture`                                                                                                                               |
| `KHR_materials_specular`     | `specularTexture`, `specularColorTexture`                                                                                                        |
| `KHR_materials_sheen`        | `sheenColorTexture`, `sheenRoughnessTexture`                                                                                                     |
| `KHR_materials_iridescence`  | `iridescenceTexture`, `iridescenceThicknessTexture`                                                                                              |
| `KHR_materials_anisotropy`   | `anisotropyTexture`                                                                                                                              |

Each texture info supports `index`, optional `texCoord: 0`, and
`KHR_texture_transform` (`offset`, `scale`, `rotation`, optional `texCoord: 0`).
Normal slots support `scale`; occlusion supports `strength`. In addition to the
mapped extensions above, factor-only `KHR_materials_ior`,
`KHR_materials_emissive_strength`, `KHR_materials_dispersion` and
`KHR_materials_unlit` complete the 11 supported material extensions.

Tau supplies normalized six-chart box UV0 on the final returned geometry, then
computes tangent directions and handedness from those UV derivatives while
retaining source smooth normals. UV seams may duplicate render vertices; source
triangle order and geometry do not change. This is render mapping, not an unwrap
API. Independently tessellated fast/exact meshes can have different UV phase.

The viewer's fast preview preserves appearance. Exact GLB and single-file JSON
glTF preserve materials, names and embedded image bytes. Material-preserving
GLB/glTF exports refuse `lane: 'fast'`; leave the default exact lane. STL carries
geometry only. Do not call upstream `Mesh.toGlb()` to export these descriptors:
that bypasses Tau's material/resources path.
