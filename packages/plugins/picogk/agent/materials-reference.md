# PicoGK physical materials

Read this when authoring PicoGK appearance, palettes, PBR, textures, glass, brushed metal, coatings, fabric or emission in Tau Desktop. Use the public types in `PicoGK` and `Viewer.SetGroupMaterial(int groupId, Material material)` inside `Library.Go`. Look up signatures in `api-index.md`; this file explains their authoring contract.

## Assign and reuse a palette

```csharp
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    var copper = new Material {
        Name = "Copper", Color = new("B87333"), Metallic = 1, Roughness = .28f
    };
    var brushedCopper = copper with {
        Name = "Brushed copper",
        Anisotropy = new MaterialAnisotropy { Strength = .7f, Rotation = .25f }
    };
    viewer.SetGroupMaterial(10, copper);
    viewer.SetGroupMaterial(11, brushedCopper);
    viewer.Add(Voxels.voxSphere(Vector3.Zero, 10f), "Copper gasket", nGroupID: 10);
    viewer.Add(Voxels.voxSphere(new Vector3(30, 0, 0), 10f), "Brushed housing", nGroupID: 11);
});
```

Use ordinary local records or variables for a reusable palette; `with` creates a variant. The final material assigned to a group applies to its surviving visible geometry, including geometry added earlier. Group IDs scope appearance and transforms; they are not material IDs or assembly hierarchy. `Material.Name` labels the appearance without renaming parts. Preserve stable component names for selection and mechanisms.

`SetGroupMaterial` snapshots the material values and copies image bytes synchronously. Mutating a source byte array afterward does not change that assignment; call it again to assign new content. `Remove`, visibility and scene clearing keep their normal final-scene behavior.

The unchanged legacy API remains valid:

```csharp
using PicoGK;

Library.Go(1f, () => {
    Library.oViewer().SetGroupMaterial(10, new ColorFloat("B87333"), 1f, .28f);
});
```

## Factors and units

A newly constructed `Material` is white, nonmetallic, roughness `.35f`, double-sided, black emissive and emissive strength `1`. Omitted alpha mode selects opaque or blend from `Color` alpha. Legacy models retain their existing defaults.

`ColorFloat` RGB values use PicoGK's sRGB authoring convention and are converted to linear glTF once; alpha is linear coverage. Numeric material factors are validated, not clamped. Choose factors for the requested finish rather than enabling every effect. Visual metalness, roughness or a name such as "Steel" does not declare density, alloy grade, heat treatment or manufacturing qualification.

| Material property                                 | Meaning                                                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Color`, `Metallic`, `Roughness`                  | Base color and metallic/roughness factors in `[0, 1]`. Use metallic `0` for dielectrics and `1` for bare metals.                                                                 |
| `NormalTexture`, `NormalScale`                    | Tangent-space normal detail and scale.                                                                                                                                           |
| `OcclusionTexture`, `OcclusionStrength`           | Ambient occlusion and strength in `[0, 1]`.                                                                                                                                      |
| `Emissive`, `EmissiveStrength`, `EmissiveTexture` | Emission color, nonnegative strength and optional color map.                                                                                                                     |
| `AlphaMode`, `AlphaCutoff`, `DoubleSided`         | `Opaque`, `Mask` or `Blend`; cutoff in `[0, 1]` applies to mask. Alpha blending is ordinary transparency.                                                                        |
| `Anisotropy`                                      | Brushed/spun direction: strength in `[0, 1]`, rotation in radians, optional direction/strength map.                                                                              |
| `Clearcoat`                                       | Coating factor/roughness in `[0, 1]` and optional coat/roughness/normal maps; use for an actual coating.                                                                         |
| `Ior`, `Dispersion`                               | Dielectric refractive index and nonnegative dispersion; dispersion accompanies transmission.                                                                                     |
| `Iridescence`                                     | Thin-film factor, IOR, thickness range and optional maps; thickness is nanometres.                                                                                               |
| `Sheen`                                           | Fabric color/roughness and optional maps.                                                                                                                                        |
| `Specular`                                        | Dielectric highlight factor/color and optional maps.                                                                                                                             |
| `Transmission`                                    | Light transmission factor in `[0, 1]` and optional map; use for glass with IOR and volume.                                                                                       |
| `Volume`                                          | Thickness and attenuation distance in **metres**, even when geometry is millimetres; attenuation color and optional thickness map. Omit attenuation distance for no attenuation. |
| `Unlit`                                           | Flat unshaded appearance; cannot combine with anisotropy.                                                                                                                        |

These fields cover core glTF PBR and eleven implemented extensions: anisotropy, clearcoat, dispersion, emissive strength, IOR, iridescence, sheen, specular, transmission, unlit and volume. There is no arbitrary vendor-extension or generic `extras` authoring promise.

## Encoded images and texture maps

Supply complete encoded PNG, JPEG or WebP bytes. `MaterialImage.Data` is an encoded image, not raw pixels, a filename or a URL. Read project assets through the existing filesystem boundary; assigning a material does not fetch network resources. Reuse a `MaterialImage` or `MaterialTexture` descriptor across slots/materials; Tau assigns glTF resource indices.

This self-contained example embeds a small PNG. Replace its bytes with the intended project image for actual surface detail.

```csharp
using System;
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    var image = new MaterialImage {
        Name = "Panel albedo", Format = MaterialImageFormat.Png,
        Data = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=")
    };
    var texture = new MaterialTexture {
        Image = image,
        Sampler = new MaterialSampler {
            WrapS = MaterialWrap.Repeat, WrapT = MaterialWrap.Repeat,
            MagFilter = MaterialMagFilter.Linear,
            MinFilter = MaterialMinFilter.LinearMipmapLinear
        },
        Transform = new MaterialTextureTransform {
            Offset = new Vector2(.1f, .2f), Scale = new Vector2(2, 2), Rotation = .25f
        }
    };
    var viewer = Library.oViewer();
    viewer.SetGroupMaterial(1, new Material { ColorTexture = texture, Roughness = .7f });
    viewer.Add(Voxels.voxSphere(Vector3.Zero, 10f), "Textured panel", nGroupID: 1);
});
```

Image bytes remain encoded without color conversion. Base-color, emissive, sheen-color and specular-color maps use glTF sRGB interpretation; normal/numeric maps contain linear data. Texture transforms use UV offset/scale and radians for rotation. Sampler defaults repeat in both directions; optional filters use glTF defaults when omitted. Wrap options are `ClampToEdge`, `MirroredRepeat`, `Repeat`; filters are `Nearest`, `Linear` and the four named mipmap minification modes.

| Texture slot                                      | Channels                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `ColorTexture`                                    | RGB base color; A coverage. Multiplies `Color`.                     |
| `MetallicRoughnessTexture`                        | G roughness, B metallic. Multiplies the corresponding factors.      |
| `NormalTexture`, `Clearcoat.NormalTexture`        | RGB tangent-space normal; scale changes XY detail.                  |
| `OcclusionTexture`                                | R ambient occlusion.                                                |
| `EmissiveTexture`                                 | RGB emission.                                                       |
| `Anisotropy.Texture`                              | RG direction mapped to `[-1, 1]`, B strength.                       |
| `Clearcoat.Texture`, `.RoughnessTexture`          | R coating factor, G coating roughness respectively.                 |
| `Iridescence.Texture`, `.ThicknessTexture`        | R factor, G film thickness within the authored bounds respectively. |
| `Sheen.ColorTexture`, `.RoughnessTexture`         | RGB color, A roughness respectively.                                |
| `Specular.Texture`, `.ColorTexture`               | A factor, RGB color respectively.                                   |
| `Transmission.Texture`, `Volume.ThicknessTexture` | R transmission, G thickness respectively.                           |

## Mapping, recovery and export

PicoGK generates UV0 by deterministic box projection over each captured geometry's model-space bounds. A triangle's dominant normal axis chooses its chart; chart boundaries split render vertices without changing surface triangles. Tangent frames accompany maps or anisotropy. Group transforms retain texture phase. This produces visible seams and per-object normalized texture scale; it is not native BRep parametrization or an artistic unwrap. The typed API exposes UV0 only.

`MaterialImage.Data` is required and init-only. Omit `Format` to infer PNG, JPEG or WebP from the complete encoded image; its default is `MaterialImageFormat.Auto` (-1). Explicit Png (0), Jpeg (1) and WebP (2) values must match the image bytes. Record `with` copies share the input array until material assignment takes its owned snapshot.

Inspect `get_kernel_result` after material edits. Fix the reported group and field: supply finite/range-valid factors, valid enum values, non-null required image/texture data, a matching supported encoded format, and ordered iridescence thickness bounds. Use positive attenuation distance or omit it. Textures and anisotropy require a surface; remove them from polyline groups or assign that intended appearance to surface geometry. Preserve the intended material when recovering from an error.

Check the browser viewer for the requested appearance, including seams, alpha, texture orientation and coatings. GLB/glTF preserve the supported material contract and image resources through the shared pipeline. STL is geometry-only; VDB and native geometry exports do not imply material preservation. Shared image/thumbnail rendering depends on its selected backend. The current nanoraster 0.5.7 path supports embedded maps and standard physical materials; both a native textured witness and factor-only engine captured successfully on Apple M2 Pro Metal. Check the target backend's encoded-image, size and refraction limits rather than assuming browser-identical pixels. Factor-only polylines retain their existing behavior and shared line-rendering limits.
