# Tau SMLib model authoring reference

Read this when authoring an SMLib model for Tau, especially when the request mentions **appearance, glTF, PBR, materials, textures, glass, metal, fabric, emissive parts, mass, 2D drawings, or moving parts**. Geometry operations come from `@classcad/smlibwasm` and its `api-index.md`; the Tau return contract comes from `@taucad/smlib/model` and `tau-api-index.md`. These are different modules: `@taucad/smlib/model` supplies declarations only, so import from it with `import type`.

## Return contract and imports

`main(params)` may return:

- a body or curve: `Part`, `Shell`, `Sketch`, `Face`, `Mesh`, or `Edge`/`Wire` for the drawing view;
- a `ShapeConfig` (`{ shape, name?, color?, opacity?, metalness?, roughness?, density?, strokeType? }` or `{ shape, name?, density?, material }`);
- an array or `ShapeList` of either, flattened in order;
- a `Model` envelope `{ shapes: ShapeConfig[], images?, textures?, samplers? }`.

`main(smlib, params)` with two declared parameters receives the `@classcad/smlibwasm` namespace first. `Vertex` values and unsupported objects fail with a message naming the index.

```typescript
import { Cylinder, Plane, Polygon, Z } from '@classcad/smlibwasm';
import type { Material, Model } from '@taucad/smlib/model';

export const defaultParams = {
  radius: 12,
  height: 24,
  roughness: 0.28,
  clearcoat: 0.3,
};

export default function main(p = defaultParams): Model {
  const brushedMetal: Material = {
    name: 'Brushed aluminum',
    pbrMetallicRoughness: {
      baseColorFactor: [0.58, 0.63, 0.68, 1],
      metallicFactor: 1,
      roughnessFactor: p.roughness,
    },
    extensions: {
      KHR_materials_anisotropy: {
        anisotropyStrength: 0.75,
        anisotropyRotation: 0,
      },
      KHR_materials_clearcoat: {
        clearcoatFactor: p.clearcoat,
        clearcoatRoughnessFactor: 0.12,
      },
    },
  };
  const cap = Plane.XZ.mul(Polygon([0, 0], [p.radius - 2, 0], [p.radius - 2, 3], [0, 3])).revolve(Z);
  return {
    shapes: [
      {
        name: 'Housing',
        shape: Cylinder(p.radius, p.height),
        material: brushedMetal,
        density: 2.7,
      },
      {
        name: 'Cap',
        shape: cap.translate(0, 0, p.height / 2),
        color: '#1f2933',
        roughness: 0.6,
      },
    ],
  };
}
```

Each `ShapeConfig` has `shape`, an optional `name`, `strokeType` (`'dashes'` or `'dots'` for drawing curves), and `density` (g/cm³, kept on the part for mass evidence). Use a unique stable `name` for assemblies and kinematics; duplicate names are made unique with a suffix. A body's own `.named(name)` and `.colored(color)` values fill a config's missing `name` and `color`, so `Box(10, 10, 10).named('Block').colored('steelblue')` needs no config at all. `export const defaultName = 'Part name'` labels geometry returned without any name. When a request involves actual motion, keep parts separate and also export `mechanism` as described in `kinematics-reference.md`; it is a named module export, not a property of `Model`.

The legacy appearance path uses CSS `color` (sRGB, converted to linear glTF), `opacity`, `metalness`, and `roughness` on a shape config. The physical path uses **one** `material: Material` property. Mixing `material` with any legacy appearance field is a type error and a runtime error. Choose `material` for requests involving real glTF effects; keep the scalar path for simple parts.

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

For glass, build actual separate closed or hollow B-rep geometry where thickness matters (`part.shell(thickness, openings)` hollows a solid). `KHR_materials_transmission` with `KHR_materials_ior` and `KHR_materials_volume` can express refractive, tinted glass; `alphaMode: 'BLEND'` is ordinary alpha compositing and does not substitute for transmission. `KHR_materials_unlit` conflicts with anisotropy. `KHR_materials_volume.thicknessFactor` and `.attenuationDistance` are authored in **metres**, even though SMLib dimensions are millimetres; the glTF export converts them to the selected output length unit.

## Texture and image resources

Return a `Model` envelope when materials refer to textures. `Image` is `{ name?, mimeType: 'image/png' | 'image/jpeg' | 'image/webp', data: Uint8Array }`; supply **encoded** image bytes. A material map holds `{ index: textureIndex, texCoord?: 0, extensions?: { KHR_texture_transform?: { offset?, rotation?, scale?, texCoord? } } }`, plus `scale` for normals or `strength` for occlusion. `textures[index]` points at `images[source]` and optionally `samplers[sampler]`; WebP uses `textures[index].extensions.EXT_texture_webp.source` instead of ordinary `source`. See `tau-api-index.md` for the exact exported `Model`, `Image`, `Resources`, and `Material` signatures.

```typescript
import { Box } from '@classcad/smlibwasm';
import type { Model } from '@taucad/smlib/model';

// A 2 × 2 checker PNG; real models load encoded bytes from a project file or generate them.
const checkerPng = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGM4ceKEhoYGAxADWQAnbgWhFdxUoAAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0),
);

export const defaultParams = { width: 60, height: 40, repeat: 6 };

export default function main(p = defaultParams): Model {
  return {
    images: [{ name: 'Checker', mimeType: 'image/png', data: checkerPng }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }],
    shapes: [
      {
        name: 'Textured panel',
        shape: Box(p.width, p.height, 4),
        material: {
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              extensions: {
                KHR_texture_transform: { scale: [p.repeat, p.repeat] },
              },
            },
            metallicFactor: 0,
            roughnessFactor: 0.7,
          },
        },
      },
    ],
  };
}
```

Texture indices are zero-based and must resolve to supplied resources. SMLib exposes no surface parameterization for a meshed face, so when a material needs a map or anisotropy the kernel supplies `TEXCOORD_0` and tangent frames from **six axis-aligned box projections** over the shape's bounds: maps tile evenly on flat, box-like faces and stretch or seam on curved ones. Scale and rotate them with `KHR_texture_transform`; do not expect a texture to follow a cylinder's circumference. Do not request `TEXCOORD_1`. Wrapping accepts `33071` (clamp), `33648` (mirror), `10497` (repeat); magnification accepts `9728` (nearest) or `9729` (linear); minification accepts `9728`, `9729`, or mipmap modes `9984`–`9987`.

The kernel rejects missing texture/image references, unsupported sampler values, nonfinite values, invalid colors, illegal alpha modes and inconsistent iridescence thickness bounds. Read the actual render/export issue and fix the input instead of discarding the material. Arbitrary extension keys may survive in glTF data, but only the typed set above is a supported physical-rendering promise.

## Drawings

Return `Edge` or `Wire` curves (`Line`, `Polyline`, `CenterArc`, `Spline`, `sketch.outerWire()`, `part.edges()` items, …) to get the **Drawing** view: an SVG of the curves projected on the model's XY plane, Y up, in millimetres. `color` sets the stroke and `strokeType: 'dashes' | 'dots'` its pattern. Each uniquely named curve config is also a drawing instance. Curves render only in the drawing view; bodies render in the model view.

```typescript
import { CenterArc, Polyline } from '@classcad/smlibwasm';
import type { ShapeConfig } from '@taucad/smlib/model';

export const defaultParams = { width: 60, height: 30 };

export default function main(p = defaultParams): ShapeConfig[] {
  return [
    {
      name: 'Outline',
      shape: Polyline([0, 0], [p.width, 0], [p.width, p.height], [0, p.height], { close: true }),
    },
    {
      name: 'Center mark',
      shape: CenterArc([p.width / 2, p.height / 2], 5, 0, 360),
      strokeType: 'dashes',
    },
  ];
}
```

## Export fidelity

STEP (AP214) export writes each body as a named product with the legacy `color` (a config's `color` or the body's `.colored()` value); it does not carry `density`, physical `material` appearance, or named interfaces, and meshes cannot be exported to STEP. SMLib has no equivalent of Replicad's `@taucad/replicad/annotations`, so do not promise STEP interfaces or PMI. glTF/GLB carry the full material, textures and the mechanism; STL carries triangles only. Validate the deliverable format the user asked for, and inspect the Tau viewer for visual appearance. For moving assemblies, also follow `kinematics-reference.md` and play the authored animation in the Kinematics pane.
