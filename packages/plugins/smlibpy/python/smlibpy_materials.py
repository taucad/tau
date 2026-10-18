"""Normalize what an SMLibPy model returns into named shapes with appearance, and the model's glTF resources.

The contract is the SMLib kernel's (`@taucad/smlib/model`) in Python: a body, a `ShapeConfig` dict, a list of
either, or a `Model` dict `{"shapes": [...], "images": [...], "textures": [...], "samplers": [...]}`. Materials are
plain glTF 2.0 material dicts; the TypeScript kernel validates them and the resources with the shared GLB material
contract before it writes any GLB.
"""

from __future__ import annotations

import json
import math
from typing import Any

CONFIG_KEYS = frozenset({"shape", "name", "color", "opacity", "metalness", "roughness", "material"})
LEGACY_APPEARANCE = ("color", "opacity", "metalness", "roughness")
RESOURCE_KEYS = ("images", "textures", "samplers")
IMAGE_TYPES = frozenset({"image/png", "image/jpeg", "image/webp"})
SHAPE_TYPES = "a Part, Shell, Sketch, Face, Mesh, Edge or Wire"


def plain_json(value: Any, label: str) -> Any:
    """Prove a value is finite plain JSON, the form the TypeScript kernel reads, and return it."""

    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError) as error:
        raise TypeError(f"{label} must be plain JSON data: {error}") from error


def _unit_interval(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"{label} must be a number from 0 to 1")
    return float(value)


def _color(value: Any, label: str) -> str:
    from smlibpy.colors import to_hex

    try:
        return to_hex(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label}: {error}") from error


def is_display_shape(value: Any) -> bool:
    """Whether `value` is something the kernel can display: a body, a face, a mesh or a curve, not a vertex."""

    from smlibpy import Mesh, Shape, Vertex

    return isinstance(value, Mesh) or (isinstance(value, Shape) and not isinstance(value, Vertex))


def _flatten(output: Any) -> list[Any]:
    if output is None:
        return []
    if is_display_shape(output) or isinstance(output, dict):
        return [output]
    if isinstance(output, (list, tuple)):
        return [item for entry in output for item in _flatten(entry)]
    raise TypeError(f"main(params) must return None, {SHAPE_TYPES}, a ShapeConfig dict, a Model dict or a list of them")


def _config(item: Any, index: int) -> dict[str, Any]:
    """One returned item as a normalized config: the shape, its authored name and its appearance."""

    config = item if isinstance(item, dict) else {"shape": item}
    unknown = sorted(set(config) - CONFIG_KEYS)
    if unknown:
        raise TypeError(f"ShapeConfig at index {index} has unknown keys: {', '.join(unknown)}")
    shape = config.get("shape")
    if not is_display_shape(shape):
        raise TypeError(f"ShapeConfig at index {index} needs a 'shape' that is {SHAPE_TYPES}")
    name = config.get("name", getattr(shape, "name", None))
    if name is not None and (not isinstance(name, str) or not name.strip()):
        raise TypeError(f"ShapeConfig at index {index} has a name that is not a non-empty string")
    normalized: dict[str, Any] = {"shape": shape, "name": name.strip() if name else None}
    if "material" in config:
        mixed = [key for key in LEGACY_APPEARANCE if key in config]
        if mixed:
            raise TypeError(f"ShapeConfig at index {index} mixes 'material' with {', '.join(mixed)}; use one or the other")
        if not isinstance(config["material"], dict):
            raise TypeError(f"ShapeConfig at index {index} has a 'material' that is not a glTF material dict")
        normalized["material"] = plain_json(config["material"], f"ShapeConfig {index} material")
        return normalized
    color = config.get("color", getattr(shape, "color", None))
    if color is not None:
        normalized["color"] = _color(color, f"ShapeConfig {index} color")
    for key in ("opacity", "metalness", "roughness"):
        if key in config:
            normalized[key] = _unit_interval(config[key], f"ShapeConfig {index} {key}")
    return normalized


def _resources(model: dict[str, Any]) -> dict[str, Any]:
    """A model's glTF images, textures and samplers; image bytes stay bytes for the mesh bundle."""

    resources: dict[str, Any] = {}
    for key in RESOURCE_KEYS:
        if key in model and not isinstance(model[key], list):
            raise TypeError(f"Model {key} must be a list")
    for index, image in enumerate(model.get("images", [])):
        if not isinstance(image, dict) or not isinstance(image.get("data"), (bytes, bytearray)):
            raise TypeError(f"Model image {index} needs encoded 'data' bytes")
        if image.get("mimeType") not in IMAGE_TYPES:
            raise ValueError(f"Model image {index} mimeType must be one of {', '.join(sorted(IMAGE_TYPES))}")
        resources.setdefault("images", []).append(
            {**plain_json({key: value for key, value in image.items() if key != "data"}, f"Model image {index}"), "data": bytes(image["data"])}
        )
    for key in ("textures", "samplers"):
        if key in model:
            resources[key] = plain_json(model[key], f"Model {key}")
    return resources


def normalize_output(output: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Normalize `main(params)`'s return value into ordered shape configs and the model's glTF resources."""

    if isinstance(output, dict) and "shapes" in output:
        unknown = sorted(set(output) - {"shapes", *RESOURCE_KEYS})
        if unknown:
            raise TypeError(f"Model has unknown keys: {', '.join(unknown)}")
        if not isinstance(output["shapes"], (list, tuple)):
            raise TypeError("Model shapes must be a list of shape configurations")
        return [_config(item, index) for index, item in enumerate(_flatten(list(output["shapes"])))], _resources(output)
    return [_config(item, index) for index, item in enumerate(_flatten(output))], {}
