from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from smlibpy import Box, Line, Mesh, Vertex

from smlibpy_materials import is_display_shape, normalize_output, plain_json


class PlainJsonTest(unittest.TestCase):
    def test_round_trips_plain_data_and_refuses_the_rest(self) -> None:
        self.assertEqual(plain_json({"a": (1, 2)}, "value"), {"a": [1, 2]})
        with self.assertRaisesRegex(TypeError, "value must be plain JSON"):
            plain_json({"a": object()}, "value")
        with self.assertRaisesRegex(TypeError, "value must be plain JSON"):
            plain_json({"a": math.nan}, "value")


class DisplayShapeTest(unittest.TestCase):
    def test_bodies_meshes_and_curves_display_but_vertices_do_not(self) -> None:
        self.assertTrue(is_display_shape(Box(1, 1, 1)))
        self.assertTrue(is_display_shape(Line((0, 0, 0), (1, 0, 0))))
        self.assertTrue(is_display_shape(Mesh([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])))
        self.assertFalse(is_display_shape(Vertex(0, 0, 0)))
        self.assertFalse(is_display_shape("box"))


class NormalizeOutputTest(unittest.TestCase):
    def test_flattens_bodies_configs_and_lists(self) -> None:
        box = Box(1, 2, 3)
        self.assertEqual(normalize_output(None), ([], {}))
        configs, resources = normalize_output([box, (box.named(" lid ").colored("red"), None), {"shape": box}])
        self.assertEqual(resources, {})
        self.assertEqual([config["name"] for config in configs], [None, "lid", None])
        self.assertEqual(configs[1]["color"], "#ff0000")
        self.assertNotIn("color", configs[0])

    def test_reads_legacy_appearance(self) -> None:
        [config], _ = normalize_output(
            {"shape": Box(1, 1, 1), "name": "Body", "color": (0, 0, 1), "opacity": 0.5, "metalness": 1, "roughness": 0}
        )
        self.assertEqual(config["name"], "Body")
        self.assertEqual(config["color"], "#0000ff")
        self.assertEqual((config["opacity"], config["metalness"], config["roughness"]), (0.5, 1.0, 0.0))

    def test_reads_a_material(self) -> None:
        material = {"pbrMetallicRoughness": {"baseColorFactor": [1, 0, 0, 1]}}
        [config], _ = normalize_output({"shape": Box(1, 1, 1).colored("blue"), "material": material})
        self.assertEqual(config["material"], material)
        self.assertNotIn("color", config)

    def test_refuses_malformed_configs(self) -> None:
        box = Box(1, 1, 1)
        cases = [
            (42, TypeError, "must return None"),
            ({"shape": box, "colour": "red"}, TypeError, "unknown keys: colour"),
            ({"shape": Vertex(0, 0, 0)}, TypeError, "needs a 'shape'"),
            ({"shape": box, "name": 3}, TypeError, "name that is not a non-empty string"),
            ({"shape": box, "name": "  "}, TypeError, "name that is not a non-empty string"),
            ({"shape": box, "material": {}, "color": "red"}, TypeError, "mixes 'material' with color"),
            ({"shape": box, "material": "steel"}, TypeError, "not a glTF material dict"),
            ({"shape": box, "color": "no-such-color"}, ValueError, "ShapeConfig 0 color"),
            ({"shape": box, "opacity": True}, ValueError, "opacity must be a number from 0 to 1"),
            ({"shape": box, "opacity": "1"}, ValueError, "opacity must be a number"),
            ({"shape": box, "metalness": math.inf}, ValueError, "metalness must be a number"),
            ({"shape": box, "roughness": 2}, ValueError, "roughness must be a number"),
        ]
        for output, error, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(error, message):
                normalize_output(output)

    def test_reads_a_model_with_resources(self) -> None:
        configs, resources = normalize_output(
            {
                "shapes": (Box(1, 1, 1), [Box(2, 2, 2)]),
                "images": [{"name": "grain", "mimeType": "image/png", "data": bytearray(b"png")}],
                "textures": [{"source": 0, "sampler": 0}],
                "samplers": [{"magFilter": 9729}],
            }
        )
        self.assertEqual(len(configs), 2)
        self.assertEqual(resources["images"], [{"name": "grain", "mimeType": "image/png", "data": b"png"}])
        self.assertEqual(resources["textures"], [{"source": 0, "sampler": 0}])
        self.assertEqual(resources["samplers"], [{"magFilter": 9729}])
        self.assertEqual(normalize_output({"shapes": []}), ([], {}))

    def test_refuses_malformed_models(self) -> None:
        cases = [
            ({"shapes": [], "meshes": []}, TypeError, "Model has unknown keys: meshes"),
            ({"shapes": Box(1, 1, 1)}, TypeError, "Model shapes must be a list"),
            ({"shapes": [], "images": {}}, TypeError, "Model images must be a list"),
            ({"shapes": [], "images": ["png"]}, TypeError, "needs encoded 'data' bytes"),
            ({"shapes": [], "images": [{"data": "png"}]}, TypeError, "needs encoded 'data' bytes"),
            ({"shapes": [], "images": [{"data": b"x", "mimeType": "image/gif"}]}, ValueError, "mimeType must be one of"),
        ]
        for output, error, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(error, message):
                normalize_output(output)


if __name__ == "__main__":
    unittest.main()
