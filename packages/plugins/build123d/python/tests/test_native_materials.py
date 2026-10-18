"""Native Build123D material and UV regression checks against emitted GLB bytes."""

from __future__ import annotations

import base64
import io
import json
import math
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bd_materials import FinishedMaterial, metals, wood
from build123d import Box, Compound, Cylinder, Location, export_step, import_step
from PIL import Image
from threejs_materials import PbrMaps, PbrProperties, PbrValues

from tau_kernel.glb import write_glb
from native_materials import material_dependencies, tessellate_surface


def checker(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (2, 2), color)
    image.putpixel((0, 0), (255, 255, 255))
    image.putpixel((1, 1), (255, 255, 255))
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def material(source: str, directory: Path | None = None) -> FinishedMaterial:
    pbr = PbrProperties(
        "same-id", "same-name", "test", "", "CC0",
        values=PbrValues(metalness=0.3, roughness=0.4),
        maps=PbrMaps(color=source), maps_dir=directory,
        texture_repeat=(2, 3), texture_rotation=30,
    )
    return FinishedMaterial(metals.aluminum().material, pbr=pbr)


def data_uri(payload: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(payload).decode()


class NativeMaterialTest(unittest.TestCase):
    def test_native_step_preserves_hierarchy_and_color_fallback_without_claiming_textures(self) -> None:
        housing = Box(10, 20, 30)
        housing.label = "Oak housing"
        housing.material = wood.oak()
        rotor = Cylinder(3, 10).moved(Location((20, 0, 0)))
        rotor.label = "Metal rotor"
        rotor.material = metals.aluminum()
        module = Compound(children=[housing, rotor], label="Module")
        assembly = Compound(children=[module], label="Assembly")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "assembly.step"
            self.assertTrue(export_step(assembly, path))
            restored = import_step(path)
        leaves = [node for node in restored.descendants if not node.children]
        # Native import_step sanitizes spaces in labels; retain that native contract.
        self.assertCountEqual([node.label for node in leaves], ["Oak_housing", "Metal_rotor"])
        self.assertEqual(len(restored.solids()), 2)
        self.assertEqual(restored.children[0].label, "Module")
        for original in (housing, rotor):
            imported = next(node for node in leaves if node.label == original.label.replace(" ", "_"))
            self.assertAlmostEqual(imported.volume, original.volume, places=5)
            for actual, expected in zip(imported.color, original.color):
                self.assertAlmostEqual(actual, expected, places=5)
            self.assertIsNone(imported.material)

    def test_native_face_uvs_normals_and_exact_face_ranges(self) -> None:
        for shape in (Box(10, 20, 30), Cylinder(10, 20).moved(Location((10, 20, 30), (30, 20, 10)))):
            data = tessellate_surface(shape, 0.1, 0.1)
            self.assertEqual(len(data["positions"]), len(data["normals"]))
            self.assertEqual(len(data["uvs"]) // 2, len(data["positions"]) // 3)
            self.assertTrue(all(0 <= value <= 1 for value in data["uvs"]))
            self.assertEqual(len(data["faceGroups"]), len(shape.faces()))
            self.assertEqual(sum(group["count"] for group in data["faceGroups"]), len(data["indices"]))
            self.assertTrue(all(math.isclose(math.hypot(*data["normals"][index:index+3]), 1, abs_tol=1e-6)
                                for index in range(0, len(data["normals"]), 3)))
            self.assertLess(max(data["indices"]), len(data["positions"]) // 3)

        # Independent geometric oracle: a cylinder rotated 90 degrees about X
        # has its axis along world Y, hence glTF Z. Its side normals are radial
        # in glTF XY and its cap normals point along glTF Z.
        moved = Cylinder(10, 20).moved(Location((10, 20, 30), (90, 0, 0)))
        data = tessellate_surface(moved, 0.1, 0.1)
        center = (0.01, 0.03, -0.02)
        for index in range(0, len(data["positions"]), 3):
            point = data["positions"][index:index+3]
            normal = data["normals"][index:index+3]
            radial = (point[0] - center[0], point[1] - center[1])
            if abs(normal[2]) > 0.5:
                expected = (0, 0, math.copysign(1, point[2] - center[2]))
            else:
                length = math.hypot(*radial)
                expected = (radial[0] / length, radial[1] / length, 0)
            self.assertGreater(sum(actual * target for actual, target in zip(normal, expected)), math.cos(0.1))
        for offset in range(0, len(data["indices"]), 3):
            triangle = [data["indices"][offset + vertex] * 3 for vertex in range(3)]
            points = [data["positions"][index:index+3] for index in triangle]
            a = [points[1][axis] - points[0][axis] for axis in range(3)]
            b = [points[2][axis] - points[0][axis] for axis in range(3)]
            cross = (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
            normal = data["normals"][triangle[0]:triangle[0]+3]
            self.assertGreater(sum(value * direction for value, direction in zip(cross, normal)), 0)

    def test_mixed_textures_repeated_occurrences_edges_and_embedded_resources(self) -> None:
        red, blue = checker((255, 0, 0)), checker((0, 0, 255))
        shape = Box(10, 10, 10)
        red_material = material(data_uri(red))
        blue_material = material(data_uri(blue))
        components = [{"id": f"part:{index}", "name": "same-name", "kind": "part", "selector": f"node/{index}"}
                      for index in range(4)]
        components[0]["interfaces"] = [{"id": "shaft"}]
        meshes = {}
        for component, native in zip(components, (None, red_material, blue_material, red_material)):
            meshes[component["id"]] = {
                **tessellate_surface(shape, 0.1, 0.1),
                "lines": [0, 0, 0, 0.01, 0, 0], "lineIndices": [0, 1],
                "edgeGroups": [{"start": 0, "count": 2, "edgeId": 1}],
                "color": (0, 1, 0, 1), "nativeMaterial": native,
            }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.glb"
            write_glb(path, components, meshes, {"mechanismDiagnostics": [{"code": "test"}]}, generator="@taucad/build123d")
            payload = path.read_bytes()
        length = struct.unpack_from("<I", payload, 12)[0]
        doc = json.loads(payload[20:20+length])
        binary = payload[28+length:]
        surface_materials = []
        for mesh in doc["meshes"]:
            surface, edge = mesh["primitives"]
            self.assertEqual(surface["mode"], 4)
            self.assertIn("TEXCOORD_0", surface["attributes"])
            self.assertEqual(edge["mode"], 1)
            self.assertNotIn("TEXCOORD_0", edge["attributes"])
            edge_material = doc["materials"][edge["material"]]
            self.assertEqual(edge_material["extensions"], {"KHR_materials_unlit": {}})
            self.assertNotIn("baseColorTexture", edge_material["pbrMetallicRoughness"])
            surface_materials.append(doc["materials"][surface["material"]])
        self.assertEqual(surface_materials[0]["pbrMetallicRoughness"]["baseColorFactor"], [0, 1, 0, 1])
        self.assertNotIn("baseColorTexture", surface_materials[0]["pbrMetallicRoughness"])
        textures = [entry["pbrMetallicRoughness"]["baseColorTexture"]["index"] for entry in surface_materials[1:]]
        self.assertNotEqual(textures[0], textures[1])
        self.assertEqual(textures[0], textures[2])
        self.assertIn("KHR_texture_transform", doc["extensionsUsed"])
        self.assertEqual(len(doc["images"]), 2)
        image_bytes = []
        for image in doc["images"]:
            self.assertNotIn("uri", image)
            view = doc["bufferViews"][image["bufferView"]]
            image_bytes.append(binary[view["byteOffset"]:view["byteOffset"]+view["byteLength"]])
        self.assertCountEqual(image_bytes, [red, blue])
        view = doc["bufferViews"][doc["extensions"]["TAU_cad_topology"]["topologyBufferView"]]
        topology = json.loads(binary[view["byteOffset"]:view["byteOffset"]+view["byteLength"]])
        self.assertEqual(topology["components"][0]["interfaces"], [{"id": "shaft"}])
        self.assertEqual(topology["mechanismDiagnostics"], [{"code": "test"}])

    def test_project_texture_dependencies_and_image_only_changes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "checker.png"
            image.write_bytes(checker((255, 0, 0)))
            shape = Box(10, 10, 10)
            shapes = (Compound(children=[shape]),)
            shape.material = material(image.name, root)
            # Native PBR objects are mutable after assignment; without maps_dir
            # upstream texture collection silently omits a file-backed map.
            shape.material.pbr.maps_dir = None
            with self.assertRaisesRegex(ValueError, "maps_dir=Path"):
                material_dependencies(shapes, root, [image.name])
            shape.material.pbr.maps_dir = root
            with self.assertRaisesRegex(ValueError, "__tau__.dependencies"):
                material_dependencies(shapes, root, [])
            self.assertEqual(material_dependencies(shapes, root, [image.name]), [image.name])
            first = shape.material.pbr.to_dict()["textures"]["color"]
            image.write_bytes(checker((0, 0, 255)))
            self.assertNotEqual(first, shape.material.pbr.to_dict()["textures"]["color"])
            image.unlink()
            with self.assertRaisesRegex(ValueError, "does not exist"):
                material_dependencies(shapes, root, [image.name])
            shape.material.pbr.maps.color = "https://example.test/image.png"
            with self.assertRaisesRegex(ValueError, "embedded data"):
                material_dependencies(shapes, root, [])
            shape.material.pbr.maps.color = "../escape.png"
            with self.assertRaisesRegex(ValueError, "inside the project"):
                material_dependencies(shapes, root, [])
            shape.material = material(data_uri(checker((0, 0, 0))))
            self.assertEqual(material_dependencies(shapes, root, []), [])
            shape.material = None
            self.assertEqual(material_dependencies(shapes, root, []), [])
            shape.material = wood.oak()
            self.assertEqual(material_dependencies(shapes, root, []), [])
