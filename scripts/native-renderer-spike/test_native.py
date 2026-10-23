"""CPU admission regressions; no GPU or filesystem authority is needed."""

import json
import struct
import unittest
import numpy as np
from native import decode, camera


def fixture(change=None):
    binary = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype="<f4").tobytes()
    doc = {
        "asset": {"version": "2.0"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "material": 0}]}],
        "materials": [
            {
                "extensions": {"KHR_materials_unlit": {}},
                "pbrMetallicRoughness": {"baseColorFactor": [0.1, 0.5, 0.8, 1]},
            }
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [{"buffer": 0, "byteLength": len(binary)}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"}
        ],
    }
    if change:
        change(doc)
    raw = json.dumps(doc).encode()
    raw += b" " * (-len(raw) % 4)
    return (
        struct.pack(
            "<IIIII", 0x46546C67, 2, 28 + len(raw) + len(binary), len(raw), 0x4E4F534A
        )
        + raw
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary,
        binary,
    )


class AdmissionTest(unittest.TestCase):
    def test_transformed_geometry_and_color(self):
        data, _ = fixture(lambda d: d["nodes"][0].update(translation=[1, 2, 3]))
        vertices, ranges = decode(data, {})
        np.testing.assert_allclose(vertices[:, :3], [[1, 2, 3], [2, 2, 3], [1, 3, 3]])
        np.testing.assert_allclose(vertices[0, 3:], [0.1, 0.5, 0.8, 1])
        self.assertEqual(ranges, [(0, 3)])

    def test_external_buffer(self):
        data, binary = fixture(lambda d: d["buffers"][0].update(uri="part.bin"))
        vertices, _ = decode(data, {"part.bin": binary})
        np.testing.assert_array_equal(
            vertices[:, :3], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]
        )
        with self.assertRaises(KeyError):
            decode(data, {})

    def test_cycle_is_refused(self):
        data, _ = fixture(lambda d: d["nodes"][0].update(children=[0]))
        with self.assertRaisesRegex(ValueError, "node graph"):
            decode(data, {})

    def test_negative_reference_is_refused(self):
        data, _ = fixture(lambda d: d["scenes"][0].update(nodes=[-1]))
        with self.assertRaisesRegex(ValueError, "Invalid glTF index"):
            decode(data, {})

    def test_accessor_overrun(self):
        data, _ = fixture(lambda d: d["accessors"][0].update(count=4))
        with self.assertRaisesRegex(ValueError, "bounds"):
            decode(data, {})

    def test_decoded_budget(self):
        data, _ = fixture(lambda d: d["accessors"][0].update(count=10000000))
        with self.assertRaisesRegex(ValueError, "budget"):
            decode(data, {})

    def test_unsupported_pbr_falls_back(self):
        data, _ = fixture(lambda d: d["materials"][0].update(extensions={}))
        with self.assertRaisesRegex(ValueError, "Unsupported material"):
            decode(data, {})

    def test_required_extension_fails_closed(self):
        data, _ = fixture(lambda d: d.update(extensionsRequired=["unknown"]))
        with self.assertRaisesRegex(ValueError, "Unsupported native profile"):
            decode(data, {})

    def test_no_silent_reflection(self):
        data, _ = fixture(lambda d: d["nodes"][0].update(scale=[-1, 1, 1]))
        with self.assertRaisesRegex(ValueError, "transform"):
            decode(data, {})

    def test_invalid_glb_header(self):
        data, _ = fixture()
        with self.assertRaisesRegex(ValueError, "Invalid GLB"):
            decode(data[:-4], {})

    def test_camera_target_is_centered(self):
        for angle in [0, 0.4, 1, 3]:
            point = camera(angle) @ np.array([0, 0, 0, 1])
            np.testing.assert_allclose(point[:2] / point[3], [0, 0], atol=1e-7)
            self.assertGreater(point[2] / point[3], 0)
            self.assertLess(point[2] / point[3], 1)


if __name__ == "__main__":
    unittest.main()
