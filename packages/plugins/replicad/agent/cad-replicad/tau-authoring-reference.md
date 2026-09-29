# Tau Replicad model authoring reference

Read this when authoring a Replicad model for Tau, especially when the request mentions **appearance, glTF, PBR, materials, textures, glass, metal, fabric, emissive parts, STEP interfaces, mass, or moving parts**. Geometry operations come from `replicad` and its `api-index.md`; the Tau return contract comes from `@taucad/replicad/model` and `tau-api-index.md`. These are different modules. In particular, the `ShapeConfig` in the upstream geometry index is **not** Tau's returned shape configuration.

## Return contract and imports

`main(params)` may return a Replicad shape, a Tau `ShapeConfig`, an array of either, or a `Model` envelope. Import Tau types with `import type` because `@taucad/replicad/model` supplies declarations, not runtime functions. Import actual modeling functions from `replicad` and interface helpers from `@taucad/replicad/annotations`.

```typescript
import { makeCylinder } from 'replicad';
import type { Material, Model } from '@taucad/replicad/model';

export const defaultParams = { roughness: 0.28, clearcoat: 0.3 };

export default function main(p = defaultParams): Model {
  const brushedMetal: Material = {
    name: 'Brushed aluminum',
    pbrMetallicRoughness: {
      baseColorFactor: [0.58, 0.63, 0.68, 1],
      metallicFactor: 1,
      roughnessFactor: p.roughness,
    },
    extensions: {
      KHR_materials_anisotropy: { anisotropyStrength: 0.75, anisotropyRotation: 0 },
      KHR_materials_clearcoat: { clearcoatFactor: p.clearcoat, clearcoatRoughnessFactor: 0.12 },
    },
  };
  return {
    shapes: [{ name: 'Housing', shape: makeCylinder(12, 24), material: brushedMetal, density: 2.7 }],
  };
}
```

Each `ShapeConfig` has `shape`, optional `name`, `strokeType`, `density` (g/cm³ for STEP mass), and `interfaces`. `strokeType` selects SVG line patterns (`dots`/`dashes`) for 2D export; it is not a glTF surface finish. Use a unique stable `name` for assemblies, STEP interfaces and kinematics. When a request involves actual motion, keep parts separate and also export `mechanism` as described in `kinematics-reference.md`; it is a named module export, not a property of `Model`.

An optional `export const defaultName = 'Part name'` labels geometry returned without an explicit shape `name`. Name each shape directly when assembly identity, interfaces or moving links matter.

The legacy appearance path uses CSS `color` (sRGB, converted to linear glTF), `opacity`, `metalness`, and `roughness` directly on a shape config. The physical path uses **one** `material: Material` property. Mixing `material` with any legacy appearance field is a type error and a runtime error. Choose `material` for requests involving real glTF effects; keep the scalar path for simple existing models.

## Standard material fields

`Material` is Tau's `GlbMaterial`, based on glTF 2.0's material JSON. Color factors are **linear** values in `[0, 1]`; CSS hex values cannot be pasted into `baseColorFactor` without sRGB conversion. Numeric settings should follow the real requested finish and be exposed through `defaultParams` when the user needs to tune them.

Set metallic and roughness factors deliberately: glTF defaults both to `1`, so an omitted metallic factor does not mean plastic. Use `metallicFactor: 0` for a dielectric and `1` for a fully metallic finish.

| Field                                                                | Purpose                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `name`, `extras`                                                     | Human material name and JSON metadata.                                                  |
| `pbrMetallicRoughness.baseColorFactor`                               | `[r, g, b, alpha]` linear color.                                                        |
| `pbrMetallicRoughness.metallicFactor`, `.roughnessFactor`            | Metallic/roughness factors in `[0, 1]`; defaults are glTF's values when omitted.        |
| `pbrMetallicRoughness.baseColorTexture`, `.metallicRoughnessTexture` | Indexed texture maps. The latter uses green for roughness and blue for metallic.        |
| `normalTexture` (`index`, optional `scale`)                          | Tangent-space normal map.                                                               |
| `occlusionTexture` (`index`, optional `strength`)                    | Occlusion map.                                                                          |
| `emissiveFactor`, `emissiveTexture`                                  | Linear RGB emission and optional map.                                                   |
| `alphaMode`, `alphaCutoff`, `doubleSided`                            | `OPAQUE`, `MASK`, or `BLEND`; cutoff applies to `MASK`; double-sided surface rendering. |

For `Material.extensions`, the following **eleven** ratified effects have typed fields and are admitted by the material pipeline. Use them where they convey an intended physical finish, rather than adding every effect to every part.

| Extension                         | Typed fields                                                                                                                                             | Typical use                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `KHR_materials_anisotropy`        | `anisotropyStrength`, `anisotropyRotation` (radians), `anisotropyTexture`                                                                                | Brushed or spun metal.                                   |
| `KHR_materials_clearcoat`         | `clearcoatFactor`, `clearcoatRoughnessFactor`, `clearcoatTexture`, `clearcoatRoughnessTexture`, `clearcoatNormalTexture`                                 | Varnish, lacquer, glazing.                               |
| `KHR_materials_dispersion`        | `dispersion`                                                                                                                                             | Chromatic separation in transmissive glass.              |
| `KHR_materials_emissive_strength` | `emissiveStrength`                                                                                                                                       | Bright emitting surfaces; pair with `emissiveFactor`.    |
| `KHR_materials_ior`               | `ior`                                                                                                                                                    | Dielectric index of refraction.                          |
| `KHR_materials_iridescence`       | `iridescenceFactor`, `iridescenceIor`, `iridescenceThicknessMinimum`, `iridescenceThicknessMaximum`, `iridescenceTexture`, `iridescenceThicknessTexture` | Thin-film color shifts. Thickness values are nanometres. |
| `KHR_materials_sheen`             | `sheenColorFactor`, `sheenRoughnessFactor`, `sheenColorTexture`, `sheenRoughnessTexture`                                                                 | Cloth and velvet.                                        |
| `KHR_materials_specular`          | `specularFactor`, `specularColorFactor`, `specularTexture`, `specularColorTexture`                                                                       | Dielectric highlight control.                            |
| `KHR_materials_transmission`      | `transmissionFactor`, `transmissionTexture`                                                                                                              | Glass and other light-transmitting solids.               |
| `KHR_materials_unlit`             | `{}`                                                                                                                                                     | Flat, unshaded graphics or indicator surfaces.           |
| `KHR_materials_volume`            | `thicknessFactor`, `thicknessTexture`, `attenuationDistance`, `attenuationColor`                                                                         | Absorbing/tinted volume; combine with transmission.      |

For glass, build actual separate closed or hollow BRep geometry where thickness matters. `KHR_materials_transmission` with `KHR_materials_ior` and `KHR_materials_volume` can express refractive, tinted glass; `alphaMode: 'BLEND'` is ordinary alpha compositing and does not substitute for transmission. `KHR_materials_unlit` conflicts with anisotropy. `KHR_materials_volume.thicknessFactor` and `.attenuationDistance` are authored in **metres**, even when BRep dimensions are in millimetres; the Replicad glTF export converts them to the selected output length unit.

## Texture and image resources

Return a `Model` envelope when materials refer to textures. `Model = { shapes: ShapeConfig[], images?, textures?, samplers? }`. `Image` is `{ name?, mimeType: 'image/png' | 'image/jpeg' | 'image/webp', data: Uint8Array }`; supply **encoded** image bytes. A material map holds `{ index: textureIndex, texCoord?: 0, extensions?: { KHR_texture_transform?: { offset?, rotation?, scale?, texCoord? } } }`, plus `scale` for normals or `strength` for occlusion. `textures[index]` points at `images[source]` and optionally `samplers[sampler]`; WebP uses `textures[index].extensions.EXT_texture_webp.source` instead of ordinary `source`. See `tau-api-index.md` for the exact exported `Model`, `Image`, `Resources`, and `Material` signatures; the glTF texture/sampler fields are inherited from `@gltf-transform/core`.

```typescript
// `pngBytes` must contain the actual encoded PNG file bytes.
const textured: Model = {
  images: [{ name: 'Albedo', mimeType: 'image/png', data: pngBytes }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  shapes: [
    {
      name: 'Textured panel',
      shape: panel,
      material: {
        pbrMetallicRoughness: { baseColorTexture: { index: 0, texCoord: 0 }, metallicFactor: 0, roughnessFactor: 0.7 },
      },
    },
  ],
};
```

Texture indices are zero-based and must resolve to supplied resources. The Replicad tessellator supplies `TEXCOORD_0` and tangent frames from native BRep surface parameterization when a material needs a map or anisotropy. Do not request `TEXCOORD_1` without mesh data that actually has it. A texture transform can offset, scale, rotate (radians), or select an available UV set. Wrapping accepts `33071` (clamp), `33648` (mirror), `10497` (repeat); magnification accepts `9728` (nearest) or `9729` (linear); minification accepts `9728`, `9729`, or mipmap modes `9984`–`9987`.

The kernel rejects missing texture/image references, unsupported sampler values, missing UV sets, nonfinite values, invalid colors, illegal alpha modes, positive anisotropy without a tangent frame or normal texture, and inconsistent iridescence thickness bounds. Read the actual render/export issue and fix the input instead of discarding the material. Arbitrary extension keys may survive in glTF data, but only the typed, implemented set above is a supported physical-rendering promise.

## Named STEP interfaces and export fidelity

`@taucad/replicad/annotations` exports `face(selector)`, `axis(selector)`, `frame({ origin, xAxis?, zAxis? })`, and `group([faceOrAxis, ...])`. It also exports `InterfaceDeclaration`, `InterfaceDeclarations`, `FaceDeclaration`, `AxisDeclaration`, `DatumDeclaration`, `GroupDeclaration`, `INTERFACE_NAME_REGEX`, `isValidInterfaceName`, and `isValidAuthoringKey`. `datum` remains an alias of `frame` but is deprecated. Put declarations under a **named** shape's `interfaces` map; choose valid, stable keys such as `mountFace` or `motor.shaft`.

```typescript
import { axis, face, frame, group } from '@taucad/replicad/annotations';

const part = {
  name: 'Bracket',
  shape: bracket,
  interfaces: {
    mounting: face((f) => f.inPlane('XY', 0)),
    bore: axis((f) => f.ofSurfaceType('CYLINDRE')),
    origin: frame({ origin: [0, 0, 0] }),
    connections: group([face((f) => f.inPlane('XY', 0))]),
  },
};
```

The STEP/AP242 exporter carries named products, interfaces and density. Its appearance channel uses base color/alpha and metallic/roughness factors; texture maps, transmission, coat, sheen, dispersion and the other glTF optical effects remain glTF appearance. Density is physical mass metadata, not an appearance control. Validate STEP or GLB output for the requested deliverable, and inspect the Tau viewer for visual appearance. For moving assemblies, also follow `kinematics-reference.md` and play the authored animation in the Kinematics pane.
