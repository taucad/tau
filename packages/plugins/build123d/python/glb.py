"""Small deterministic GLB writer for Build123d topology meshes."""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

import numpy

GLTF_TRIANGLES = 4
GLTF_LINES = 1


def _linear(channel: float) -> float:
    channel = min(1.0, max(0.0, channel))
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def _bounds(values: list[float]) -> tuple[list[float], list[float]]:
    if len(values) % 3:
        raise ValueError("Position arrays must contain XYZ triples")
    if not values:
        raise ValueError("Position arrays must not be empty")
    # Bounds come from the float32 values the accessor actually stores, as glTF 2.0 requires.
    axes = numpy.asarray(values, dtype=numpy.float32).reshape(-1, 3)
    if not numpy.isfinite(axes).all():
        raise ValueError("Position arrays must contain only finite values")
    return axes.min(axis=0).tolist(), axes.max(axis=0).tolist()


class _Buffer:
    def __init__(self) -> None:
        self.data = bytearray()
        self.views: list[dict[str, int]] = []

    def add(self, data: bytes, target: int | None = None) -> int:
        while len(self.data) % 4:
            self.data.append(0)
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        self.data.extend(data)
        return len(self.views) - 1


def _floats(values: list[float]) -> bytes:
    return numpy.asarray(values, dtype="<f4").tobytes()


def _uints(values: list[int]) -> bytes:
    indices = numpy.asarray(values, dtype=numpy.int64)
    if ((indices < 0) | (indices > 0xFFFF_FFFF)).any():
        raise ValueError("Indices must be unsigned 32-bit integers")
    return indices.astype("<u4").tobytes()


def validate_glb(payload: bytes) -> None:
    """Validate the container and every generated binary reference before publishing it."""

    if len(payload) < 28 or struct.unpack_from("<II", payload) != (0x46546C67, 2):
        raise ValueError("Generated GLB has an invalid header")
    if struct.unpack_from("<I", payload, 8)[0] != len(payload):
        raise ValueError("Generated GLB length does not match its header")
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    binary_header = 20 + json_length
    if json_type != 0x4E4F534A or binary_header + 8 > len(payload):
        raise ValueError("Generated GLB has invalid chunks")
    binary_length, binary_type = struct.unpack_from("<II", payload, binary_header)
    if binary_type != 0x004E4942 or binary_header + 8 + binary_length != len(payload):
        raise ValueError("Generated GLB has invalid chunks")
    document = json.loads(payload[20 : 20 + json_length])
    if document["buffers"][0]["byteLength"] > binary_length:
        raise ValueError("Generated GLB buffer exceeds its binary chunk")
    for view in document["bufferViews"]:
        if view.get("byteOffset", 0) + view["byteLength"] > document["buffers"][0]["byteLength"]:
            raise ValueError("Generated GLB buffer view is out of range")
    for accessor in document["accessors"]:
        if accessor["bufferView"] >= len(document["bufferViews"]):
            raise ValueError("Generated GLB accessor references an invalid buffer view")


def write_glb(
    path: Path,
    topology_components: list[dict[str, Any]],
    mesh_data: dict[str, dict[str, Any]],
    topology_metadata: dict[str, Any] | None = None,
) -> None:
    """Write meshes and their canonical TAU_cad_topology payload."""

    binary = _Buffer()
    accessors: list[dict[str, Any]] = []
    meshes: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    materials: list[dict[str, Any]] = []
    native_material_indices: dict[str, int] = {}
    resources: dict[str, Any] = {}
    extensions_used = {"TAU_cad_topology", "KHR_materials_unlit"}
    native_pbrs = {
        component_id: data["nativeMaterial"].pbr
        for component_id, data in mesh_data.items()
        if data.get("nativeMaterial") is not None and data["nativeMaterial"].pbr is not None
    }
    if native_pbrs:
        from threejs_materials import collect_gltf_textures

        # Collect once under unique occurrence IDs, never authored material names.
        # Upstream owns PBR conversion and texture deduplication. Tau owns the
        # surface association; generic node injection would also texture edges.
        collected = collect_gltf_textures(native_pbrs, binary=True)
        native = json.loads(collected.to_json())
        blob = collected.binary_blob() or b""
        view_indices = []
        for view in native.get("bufferViews", []):
            start = view.get("byteOffset", 0)
            view_indices.append(binary.add(blob[start : start + view["byteLength"]]))
        for image in native.get("images", []):
            image["bufferView"] = view_indices[image["bufferView"]]
        materials.extend(native["materials"])
        native_material_indices = {material["name"]: index for index, material in enumerate(materials)}
        resources = {key: native[key] for key in ("images", "textures", "samplers", "extensionsRequired") if key in native}
        extensions_used.update(native.get("extensionsUsed", []))

    def accessor(values: list[float] | list[int], kind: str) -> int:
        if kind in {"VEC2", "VEC3"}:
            view = binary.add(_floats(values), 34962)  # type: ignore[arg-type]
            item = {
                "bufferView": view,
                "componentType": 5126,
                "count": len(values) // (2 if kind == "VEC2" else 3),
                "type": kind,
            }
            if kind == "VEC3":
                minimum, maximum = _bounds(values)  # type: ignore[arg-type]
                item.update({"min": minimum, "max": maximum})
        else:
            view = binary.add(_uints(values), 34963)  # type: ignore[arg-type]
            item = {"bufferView": view, "componentType": 5125, "count": len(values), "type": "SCALAR"}
        accessors.append(item)
        return len(accessors) - 1

    for component in topology_components:
        data = mesh_data.get(component["id"])
        if data is None:
            continue
        node_index = len(nodes)
        mesh_index = len(meshes)
        component["nodeIndex"] = node_index
        component["meshIndex"] = mesh_index
        primitives: list[dict[str, Any]] = []
        color = data["color"]
        component["color"] = color
        surface_material = native_material_indices.get(component["id"])
        if surface_material is None:
            surface_material = len(materials)
            materials.append(
                {
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [_linear(color[0]), _linear(color[1]), _linear(color[2]), color[3]],
                        "metallicFactor": 0,
                        "roughnessFactor": 0.65,
                    },
                    "doubleSided": True,
                    "alphaMode": "BLEND" if color[3] < 1 else "OPAQUE",
                }
            )
        if data["indices"]:
            primitive_index = len(primitives)
            primitives.append(
                {
                    "attributes": {
                        "POSITION": accessor(data["positions"], "VEC3"),
                        "NORMAL": accessor(data["normals"], "VEC3"),
                        **({"TEXCOORD_0": accessor(data["uvs"], "VEC2")} if data.get("uvs") else {}),
                    },
                    "indices": accessor(data["indices"], "SCALAR"),
                    "material": surface_material,
                    "mode": GLTF_TRIANGLES,
                    "extras": {
                        "tauComponentId": component["id"],
                        "tauComponentKind": "body",
                        "tauComponentSelector": f"node/{node_index}/surface",
                        "faceGroups": data["faceGroups"],
                    },
                }
            )
            component["faceGroups"] = data["faceGroups"]
            component.setdefault("primitiveIndices", []).append(primitive_index)
            component.setdefault("primitiveRefs", []).append(
                {"nodeIndex": node_index, "meshIndex": mesh_index, "primitiveIndex": primitive_index}
            )
        if data["lineIndices"]:
            edge_material = len(materials)
            materials.append(
                {
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.02, 0.02, 0.02, 1],
                        "metallicFactor": 0,
                        "roughnessFactor": 1,
                    },
                    "extensions": {"KHR_materials_unlit": {}},
                }
            )
            primitive_index = len(primitives)
            primitives.append(
                {
                    "attributes": {"POSITION": accessor(data["lines"], "VEC3")},
                    "indices": accessor(data["lineIndices"], "SCALAR"),
                    "material": edge_material,
                    "mode": GLTF_LINES,
                    "extras": {
                        "tauComponentId": component["id"],
                        "tauComponentKind": "line",
                        "tauComponentSelector": f"node/{node_index}/edges",
                        "edgeGroups": data["edgeGroups"],
                    },
                }
            )
            component["edgeGroups"] = data["edgeGroups"]
            component.setdefault("primitiveIndices", []).append(primitive_index)
            component.setdefault("primitiveRefs", []).append(
                {"nodeIndex": node_index, "meshIndex": mesh_index, "primitiveIndex": primitive_index}
            )
        meshes.append({"name": component["name"], "primitives": primitives})
        nodes.append(
            {
                "name": component["name"],
                "mesh": mesh_index,
                "extras": {
                    "tauComponentId": component["id"],
                    "tauComponentKind": component["kind"],
                    "tauComponentSelector": component["selector"],
                },
            }
        )

    topology = json.dumps(
        {**(topology_metadata or {}), "schemaVersion": 1, "components": topology_components},
        separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    topology_view = binary.add(topology)
    document = {
        "asset": {"version": "2.0", "generator": "@taucad/build123d"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": binary.views,
        "buffers": [{"byteLength": len(binary.data)}],
        "extensionsUsed": sorted(extensions_used),
        **resources,
        "extensions": {
            "TAU_cad_topology": {
                "schemaVersion": 1,
                "encoding": "application/json",
                "topologyBufferView": topology_view,
            }
        },
    }
    json_data = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_data += b" " * (-len(json_data) % 4)
    binary.data.extend(b"\0" * (-len(binary.data) % 4))
    total_length = 12 + 8 + len(json_data) + 8 + len(binary.data)
    payload = b"".join(
        (
            struct.pack("<III", 0x46546C67, 2, total_length),
            struct.pack("<II", len(json_data), 0x4E4F534A),
            json_data,
            struct.pack("<II", len(binary.data), 0x004E4942),
            binary.data,
        )
    )
    validate_glb(payload)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)
