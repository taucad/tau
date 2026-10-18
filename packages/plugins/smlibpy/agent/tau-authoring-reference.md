# Tau SMLibPy model authoring reference

Read this when authoring a smlibpy model for Tau, especially when the request mentions **appearance, glTF, PBR, materials, textures, glass, metal, fabric or emissive parts**. Geometry operations come from `smlibpy` and its `api-index.md`; the return contract below is plain Python data, the same `Model`, `ShapeConfig` and `Material` contract as the SMLib WebAssembly kernel's `@taucad/smlib/model`.

## Return contract

`main(params)` may return:

- a body or curve: `Part`, `Shell`, `Sketch`, `Face`, `Mesh`, or `Edge`/`Wire`;
- a `ShapeConfig` dict: `{"shape", "name"?, "color"?, "opacity"?, "metalness"?, "roughness"?}` or `{"shape", "name"?, "material"}`;
- a list or tuple of either, flattened in order;
- a `Model` dict `{"shapes": [...], "images"?: [...], "textures"?: [...], "samplers"?: [...]}`;
- `None` or an empty list for no geometry.

A `Vertex`, an unknown config key or an unsupported object fails with a message naming the index. A body's own `.named(name)` and `.colored(color)` fill a config's missing `name` and `color`, so `Box(10, 10, 10).named("Block").colored("steelblue")` needs no config. Use a unique, stable `name` for assemblies and kinematics; duplicate names are made unique with a suffix. When a request involves actual motion, keep parts separate and also define `mechanism` as described in `kinematics-reference.md`; it is a module-level function or dict, not a key of the `Model`.

The legacy appearance path uses a CSS or hex `color` (sRGB, converted to linear glTF), `opacity`, `metalness` and `roughness`, each from 0 to 1. The physical path uses **one** `material` dict. Mixing `material` with any legacy field raises. Choose `material` for real glTF effects; keep the scalar path for simple parts.

```python
from dataclasses import dataclass

from smlibpy import Cylinder, Plane, Polygon, Z


@dataclass(frozen=True)
class Params:
    radius: float = 12.0
    height: float = 24.0
    roughness: float = 0.28
    clearcoat: float = 0.3


def main(p: Params):
    brushed_metal = {
        "name": "Brushed aluminum",
        "pbrMetallicRoughness": {"baseColorFactor": [0.58, 0.63, 0.68, 1], "metallicFactor": 1, "roughnessFactor": p.roughness},
        "extensions": {
            "KHR_materials_anisotropy": {"anisotropyStrength": 0.75, "anisotropyRotation": 0},
            "KHR_materials_clearcoat": {"clearcoatFactor": p.clearcoat, "clearcoatRoughnessFactor": 0.12},
        },
    }
    cap = (Plane.XZ * Polygon((0, 0), (p.radius - 2, 0), (p.radius - 2, 3), (0, 3))).revolve(Z)
    return [
        {"name": "Housing", "shape": Cylinder(p.radius, p.height), "material": brushed_metal},
        {"name": "Cap", "shape": cap.translate(0, 0, p.height / 2), "color": "#1f2933", "roughness": 0.6},
    ]
```

## Standard material fields

A material is a glTF 2.0 material dict, validated by Tau's shared GLB material contract. Color factors are **linear** values in `[0, 1]`; a CSS hex value cannot be pasted into `baseColorFactor` without sRGB conversion. Set metallic and roughness factors deliberately: glTF defaults both to `1`, so an omitted metallic factor does not mean plastic. Use `metallicFactor: 0` for a dielectric and `1` for a fully metallic finish.

| Field                                                                | Purpose                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `name`, `extras`                                                     | Human material name and JSON metadata.                                                  |
| `pbrMetallicRoughness.baseColorFactor`                               | `[r, g, b, alpha]` linear color.                                                        |
| `pbrMetallicRoughness.metallicFactor`, `.roughnessFactor`            | Metallic/roughness factors in `[0, 1]`.                                                 |
| `pbrMetallicRoughness.baseColorTexture`, `.metallicRoughnessTexture` | Indexed texture maps. The latter uses green for roughness and blue for metallic.        |
| `normalTexture` (`index`, optional `scale`)                          | Tangent-space normal map.                                                               |
| `occlusionTexture` (`index`, optional `strength`)                    | Occlusion map.                                                                          |
| `emissiveFactor`, `emissiveTexture`                                  | Linear RGB emission and optional map.                                                   |
| `alphaMode`, `alphaCutoff`, `doubleSided`                            | `OPAQUE`, `MASK`, or `BLEND`; cutoff applies to `MASK`; double-sided surface rendering. |

The `extensions` dict admits the eleven ratified effects with typed fields: `KHR_materials_anisotropy` (brushed or spun metal; rotation in radians), `KHR_materials_clearcoat` (varnish, lacquer), `KHR_materials_dispersion`, `KHR_materials_emissive_strength` (pair with `emissiveFactor`), `KHR_materials_ior`, `KHR_materials_iridescence` (thickness in nanometres), `KHR_materials_sheen` (cloth), `KHR_materials_specular`, `KHR_materials_transmission` (glass), `KHR_materials_unlit` (`{}`; conflicts with anisotropy) and `KHR_materials_volume` (tinted volume; combine with transmission). Use them where they convey an intended physical finish.

For glass, build actual closed or hollow geometry where thickness matters (`part.shell(thickness, openings)` hollows a solid) and combine transmission, IOR and volume; `alphaMode: "BLEND"` is ordinary alpha compositing, not transmission. `KHR_materials_volume.thicknessFactor` and `.attenuationDistance` are authored in **metres**, even though smlibpy dimensions are millimetres; the glTF export converts them to the output length unit.

## Texture and image resources

Return a `Model` dict when materials refer to textures. An image is `{"name"?, "mimeType": "image/png" | "image/jpeg" | "image/webp", "data": bytes}` with **encoded** image bytes; read them from a project file declared in `__tau__["dependencies"]`, or embed them. A material map holds `{"index": texture_index, "texCoord"?: 0, "extensions"?: {"KHR_texture_transform": {"offset", "rotation", "scale"}}}`. `textures[index]` points at `images[source]` and optionally `samplers[sampler]`.

```python
import base64
from dataclasses import dataclass

from smlibpy import Box

# A 2 × 2 checker PNG; a real model reads encoded bytes from a project file.
CHECKER_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGM4ceKEhoYGAxADWQAnbgWhFdxUoAAAAABJRU5ErkJggg=="
)


@dataclass(frozen=True)
class Params:
    width: float = 60.0
    height: float = 40.0
    repeat: float = 6.0


def main(p: Params):
    return {
        "images": [{"name": "Checker", "mimeType": "image/png", "data": CHECKER_PNG}],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 10497, "wrapT": 10497}],
        "shapes": [
            {
                "name": "Textured panel",
                "shape": Box(p.width, p.height, 4),
                "material": {
                    "pbrMetallicRoughness": {
                        "baseColorTexture": {"index": 0, "extensions": {"KHR_texture_transform": {"scale": [p.repeat, p.repeat]}}},
                        "metallicFactor": 0,
                        "roughnessFactor": 0.7,
                    }
                },
            }
        ],
    }
```

Texture indices are zero-based and must resolve to supplied resources. When a material needs a map or anisotropy, the kernel supplies `TEXCOORD_0` and tangent frames from **six axis-aligned box projections** over the shape's bounds: maps tile evenly on flat, box-like faces and stretch or seam on curved ones. Scale and rotate them with `KHR_texture_transform`. Wrapping accepts `33071`, `33648`, `10497`; magnification `9728` or `9729`; minification `9728`, `9729` or `9984`–`9987`. Tau rejects missing references, unsupported sampler values, nonfinite values, invalid colors and illegal alpha modes; read the render or export issue and fix the input.

## Export fidelity

STEP export writes each body as a named product with its legacy `color`; it does not carry physical `material` appearance, and meshes and curves are not exported to STEP. glTF/GLB carry names, colors, the full material, textures and, with `content: { includeTopology: true }`, the mechanism; STL carries triangles only. Validate the deliverable format the user asked for and inspect the Tau viewer for appearance.
