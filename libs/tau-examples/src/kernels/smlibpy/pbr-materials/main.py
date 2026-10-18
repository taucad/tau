"""Five finishes on one plinth: lacquered wood, brushed aluminium, tinted glass, glowing acrylic and a checker texture.

The materials are plain glTF 2.0 material dicts, the same `Material` contract as the SMLib WebAssembly kernel. Tau
validates them, projects box UVs where a texture or anisotropy needs them and writes them to the GLB.
"""

import base64
from dataclasses import dataclass

from smlibpy import Align, Box, Cylinder, Pos, Sphere

STANDING = (Align.CENTER, Align.CENTER, Align.MIN)
# A 2 × 2 checker PNG; a real model reads encoded bytes from a project file.
CHECKER_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGM4ceKEhoYGAxADWQAnbgWhFdxUoAAAAABJRU5ErkJggg=="
)


@dataclass(frozen=True)
class Params:
    size: float = 24.0
    spacing: float = 34.0
    roughness: float = 0.3
    checker_repeat: float = 4.0


def main(params: Params):
    if params.size <= 0 or params.spacing <= params.size:
        raise ValueError("size must be positive and spacing larger than size.")
    if not 0 <= params.roughness <= 1:
        raise ValueError("roughness must be from 0 to 1.")
    s, d = params.size, params.spacing
    plinth = Box(d * 5 + 10, d + 10, 4, align=(Align.CENTER, Align.CENTER, Align.MAX))
    lid = Box(s, s, s, align=STANDING)
    lid = lid.fillet(lid.edges(), s / 8)
    return {
        "images": [{"name": "Checker", "mimeType": "image/png", "data": CHECKER_PNG}],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 10497, "wrapT": 10497}],
        "shapes": [
            {"name": "Plinth", "shape": plinth, "color": "#2b2f36", "roughness": 0.8},
            {
                "name": "Lacquered wood",
                "shape": Pos(-2 * d, 0, 0) * lid,
                "material": {
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.23, 0.11, 0.05, 1],
                        "metallicFactor": 0,
                        "roughnessFactor": 0.55,
                    },
                    "extensions": {"KHR_materials_clearcoat": {"clearcoatFactor": 0.8, "clearcoatRoughnessFactor": 0.1}},
                },
            },
            {
                "name": "Brushed aluminium",
                "shape": Pos(-d, 0, 0) * Cylinder(s / 2, s, align=STANDING),
                "material": {
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.58, 0.63, 0.68, 1],
                        "metallicFactor": 1,
                        "roughnessFactor": params.roughness,
                    },
                    "extensions": {"KHR_materials_anisotropy": {"anisotropyStrength": 0.75, "anisotropyRotation": 0}},
                },
            },
            {
                "name": "Tinted glass",
                "shape": Pos(0, 0, s / 2) * Sphere(s / 2),
                "material": {
                    "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.05},
                    "extensions": {
                        "KHR_materials_transmission": {"transmissionFactor": 1},
                        "KHR_materials_ior": {"ior": 1.5},
                        # Volume distances are metres, whatever the model's millimetres.
                        "KHR_materials_volume": {
                            "thicknessFactor": s / 1000,
                            "attenuationDistance": 0.05,
                            "attenuationColor": [0.6, 0.85, 0.75],
                        },
                    },
                },
            },
            {
                "name": "Glowing acrylic",
                "shape": Pos(d, 0, 0) * Box(s, s / 3, s, align=STANDING),
                "material": {
                    "pbrMetallicRoughness": {"baseColorFactor": [0.1, 0.4, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.4},
                    "emissiveFactor": [0.1, 0.4, 1],
                    "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 4}},
                },
            },
            {
                "name": "Checker",
                "shape": Pos(2 * d, 0, 0) * Box(s, s, s, align=STANDING),
                "material": {
                    "pbrMetallicRoughness": {
                        "baseColorTexture": {
                            "index": 0,
                            "extensions": {
                                "KHR_texture_transform": {"scale": [params.checker_repeat, params.checker_repeat]}
                            },
                        },
                        "metallicFactor": 0,
                        "roughnessFactor": 0.7,
                    }
                },
            },
        ],
    }
