"""Edge lines are written only when the caller asks for `includeEdges`, and then exactly as before."""
from __future__ import annotations

import json
import math
import struct
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

import worker
from build123d import Box, Cylinder, Line
from tau_kernel.glb import GLTF_LINES, write_glb
from tau_kernel.protocol import Artifacts, WorkerContext

# `_mesh_arrays` line output captured on the unchanged worker, at 0.05 mm and 20 degrees.
BASELINE = json.loads((Path(__file__).parent / "fixtures" / "edge_lines_baseline.json").read_text())
LINE_KEYS = ("lines", "lineIndices", "edgeGroups")


def shapes():
    return (("box", Box(2, 3, 4)), ("cylinder", Cylinder(1, 2)))


def gltf_json(payload: bytes) -> dict:
    (length,) = struct.unpack_from("<I", payload, 12)
    return json.loads(payload[20 : 20 + length])


def line_primitives(document: dict) -> list[dict]:
    return [
        primitive
        for mesh in document["meshes"]
        for primitive in mesh["primitives"]
        if primitive["mode"] == GLTF_LINES
    ]


class IncludeEdgesTest(unittest.TestCase):
    def test_without_edges_skips_sampling_and_returns_no_lines(self) -> None:
        for _name, shape in shapes():
            located, _triangles = worker._triangulate(shape, 0.05, math.radians(20))
            with patch.object(worker, "_edge_points", side_effect=AssertionError("edges were sampled")):
                mesh = worker._mesh_arrays(shape, located, 0.05, math.radians(20), include_edges=False)
                default = worker._mesh_shape(shape, 0.05, math.radians(20))
            for key in LINE_KEYS:
                self.assertEqual(mesh[key], [])
                self.assertEqual(default[key], [])
            self.assertTrue(mesh["indices"])

    def assert_baseline(self, mesh: dict, name: str) -> None:
        # Topology is exact; positions differ in the last bit across platforms' math libraries.
        self.assertEqual(mesh["lineIndices"], BASELINE[name]["lineIndices"])
        self.assertEqual(mesh["edgeGroups"], BASELINE[name]["edgeGroups"])
        self.assertEqual(len(mesh["lines"]), len(BASELINE[name]["lines"]))
        for value, expected in zip(mesh["lines"], BASELINE[name]["lines"]):
            self.assertAlmostEqual(value, expected, delta=1e-12)

    def test_with_edges_returns_the_unchanged_lines(self) -> None:
        for name, shape in shapes():
            located, _triangles = worker._triangulate(shape, 0.05, math.radians(20))
            self.assert_baseline(
                worker._mesh_arrays(shape, located, 0.05, math.radians(20), include_edges=True), name
            )
            self.assert_baseline(worker._mesh_shape(shape, 0.05, math.radians(20), include_edges=True), name)

    def test_glb_without_lines_has_no_line_primitive_or_edge_material(self) -> None:
        components, meshes = worker._topology((Box(2, 3, 4),), 0.05, math.radians(20))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.glb"
            write_glb(path, components, meshes, generator="@taucad/build123d")
            document = gltf_json(path.read_bytes())
        self.assertEqual(line_primitives(document), [])
        self.assertEqual(len(document["materials"]), 1)
        self.assertNotIn("edgeGroups", components[0])

    def test_a_part_without_faces_keeps_its_edges_as_its_geometry(self) -> None:
        # A wire has no surface: without its lines the GLB would carry a mesh with no primitives,
        # which glTF forbids, and the part would vanish from the view.
        components, meshes = worker._topology((Line((0, 0, 0), (10, 0, 0)),), 0.05, math.radians(20))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.glb"
            write_glb(path, components, meshes, generator="@taucad/build123d")
            document = gltf_json(path.read_bytes())
        self.assertEqual([len(mesh["primitives"]) for mesh in document["meshes"]], [1])
        self.assertEqual(len(line_primitives(document)), 1)

    def test_mesh_request_writes_lines_only_when_asked(self) -> None:
        model = (
            "from dataclasses import dataclass\nfrom build123d import Box\n\n"
            "@dataclass(frozen=True)\nclass Params:\n    width: float = 2.0\n\n"
            "def main(params: Params):\n    return Box(params.width, 3, 4)\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (root / "main.py").write_text(model, encoding="utf-8")
            runtime = worker.Worker(WorkerContext(root.resolve(), Artifacts(artifacts), threading.Event()))
            handle = runtime.dispatch("build", {"entryPath": "main.py", "parameters": {}})["handleId"]
            request = {"handleId": handle, "linearTolerance": 0.05, "angularTolerance": 20}
            counts = {}
            for label, extra in (("absent", {}), ("false", {"includeEdges": False}), ("true", {"includeEdges": True})):
                answer = runtime.dispatch("mesh", {**request, **extra})
                document = gltf_json(Path(answer["artifactPath"]).read_bytes())
                counts[label] = [len(primitive["extras"]["edgeGroups"]) for primitive in line_primitives(document)]
        self.assertEqual(counts, {"absent": [], "false": [], "true": [12]})


if __name__ == "__main__":
    unittest.main()
