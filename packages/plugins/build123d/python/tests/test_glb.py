from __future__ import annotations

import json
import math
import struct
import sys
import tempfile
import unittest
from pathlib import Path

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

import glb


def component() -> dict[str, object]:
    return {
        "id": "component:node-0",
        "name": "Shape 1",
        "kind": "part",
        "selector": "node/0",
        "capabilities": {"hasPreciseTopology": True, "exports": []},
    }


def mesh(*, triangles: bool = True, lines: bool = True) -> dict[str, object]:
    return {
        "positions": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0] if triangles else [],
        "normals": [0.0, 0.0, 1.0] * 3 if triangles else [],
        "indices": [0, 1, 2] if triangles else [],
        "faceGroups": [{"start": 0, "count": 3, "faceId": 1}] if triangles else [],
        "lines": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0] if lines else [],
        "lineIndices": [0, 1] if lines else [],
        "edgeGroups": [{"start": 0, "count": 2, "edgeId": 1}] if lines else [],
        "color": (1.2, -1.0, 0.5, 0.5),
    }


def document(payload: bytes) -> dict[str, object]:
    json_length = struct.unpack_from("<I", payload, 12)[0]
    return json.loads(payload[20 : 20 + json_length])


class GlbTest(unittest.TestCase):
    def test_numeric_helpers(self) -> None:
        self.assertEqual(glb._linear(-1), 0)
        self.assertAlmostEqual(glb._linear(1), 1)
        self.assertAlmostEqual(glb._linear(0.5), ((0.5 + 0.055) / 1.055) ** 2.4)
        self.assertEqual(glb._bounds([0, 1, 2, -1, 3, 1]), ([-1, 1, 1], [0, 3, 2]))
        for values, message in (([1.0], "triples"), ([], "empty"), ([0.0, math.inf, 0.0], "finite")):
            with self.subTest(values=values), self.assertRaisesRegex(ValueError, message):
                glb._bounds(values)
        self.assertEqual(glb._floats([1.0]), struct.pack("<f", 1.0))
        self.assertEqual(glb._uints([0, 0xFFFF_FFFF]), struct.pack("<2I", 0, 0xFFFF_FFFF))
        for value in (-1, 0x1_0000_0000):
            with self.assertRaisesRegex(ValueError, "unsigned"):
                glb._uints([value])

    def test_buffer_alignment_and_targets(self) -> None:
        buffer = glb._Buffer()
        self.assertEqual(buffer.add(b"x"), 0)
        self.assertEqual(buffer.add(b"yz", 34962), 1)
        self.assertEqual(buffer.views[0], {"buffer": 0, "byteOffset": 0, "byteLength": 1})
        self.assertEqual(buffer.views[1]["byteOffset"], 4)
        self.assertEqual(buffer.views[1]["target"], 34962)

    def test_write_surface_edges_and_topology(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.glb"
            topology = [component(), {**component(), "id": "component:missing", "name": "No mesh"}]
            glb.write_glb(path, topology, {"component:node-0": mesh()})
            payload = path.read_bytes()
            glb.validate_glb(payload)
            parsed = document(payload)
            self.assertEqual(parsed["asset"]["generator"], "@taucad/build123d")
            self.assertNotIn("name", parsed["scenes"][0])
            self.assertTrue(all("name" not in material for material in parsed["materials"]))
            self.assertEqual(parsed["nodes"][0]["name"], parsed["meshes"][0]["name"])
            self.assertEqual(topology[0]["primitiveIndices"], [0, 1])
            self.assertEqual(topology[0]["color"], (1.2, -1.0, 0.5, 0.5))

            glb.write_glb(path, [component()], {"component:node-0": mesh(lines=False)})
            self.assertEqual(len(document(path.read_bytes())["meshes"][0]["primitives"]), 1)
            glb.write_glb(path, [component()], {"component:node-0": mesh(triangles=False)})
            self.assertEqual(document(path.read_bytes())["meshes"][0]["primitives"][0]["mode"], glb.GLTF_LINES)

    def test_validator_rejects_each_container_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.glb"
            glb.write_glb(path, [component()], {"component:node-0": mesh()})
            valid = path.read_bytes()

        mutations: list[tuple[bytearray, str]] = []
        mutations.append((bytearray(valid[:20]), "header"))
        wrong_header = bytearray(valid)
        struct.pack_into("<I", wrong_header, 0, 0)
        mutations.append((wrong_header, "header"))
        wrong_length = bytearray(valid)
        struct.pack_into("<I", wrong_length, 8, len(valid) - 1)
        mutations.append((wrong_length, "length"))
        wrong_json_type = bytearray(valid)
        struct.pack_into("<I", wrong_json_type, 16, 0)
        mutations.append((wrong_json_type, "chunks"))
        json_length = struct.unpack_from("<I", valid, 12)[0]
        binary_header = 20 + json_length
        wrong_binary_type = bytearray(valid)
        struct.pack_into("<I", wrong_binary_type, binary_header + 4, 0)
        mutations.append((wrong_binary_type, "chunks"))
        for payload, message in mutations:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                glb.validate_glb(bytes(payload))

        parsed = document(valid)
        parsed["buffers"][0]["byteLength"] = 10**9
        self._assert_document_error(valid, parsed, "buffer exceeds")
        parsed = document(valid)
        parsed["bufferViews"][0]["byteLength"] = 10**9
        self._assert_document_error(valid, parsed, "view is out")
        parsed = document(valid)
        parsed["accessors"][0]["bufferView"] = 10**9
        self._assert_document_error(valid, parsed, "accessor")

    def _assert_document_error(self, valid: bytes, parsed: dict[str, object], message: str) -> None:
        old_length = struct.unpack_from("<I", valid, 12)[0]
        encoded = json.dumps(parsed, separators=(",", ":")).encode()
        encoded += b" " * (-len(encoded) % 4)
        binary_header = 20 + old_length
        binary = valid[binary_header + 8 :]
        payload = b"".join(
            (
                struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(binary)),
                struct.pack("<II", len(encoded), 0x4E4F534A),
                encoded,
                struct.pack("<II", len(binary), 0x004E4942),
                binary,
            )
        )
        with self.assertRaisesRegex(ValueError, message):
            glb.validate_glb(payload)


if __name__ == "__main__":
    unittest.main()
