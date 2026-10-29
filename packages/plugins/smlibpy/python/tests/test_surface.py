"""The surface Tau ships on top of the pinned smlibpy: every documented symbol, skill snippet and example, and the
library features models build with, run on the bundled wheel without deprecated calls."""

from __future__ import annotations

import importlib
import importlib.metadata
import inspect
import json
import re
import sys
import tempfile
import threading
import unittest
import warnings
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

PYTHON_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = PYTHON_ROOT.parent
SKILL_ROOT = PACKAGE_ROOT / "agent"
EXAMPLES_ROOT = PACKAGE_ROOT.parents[2] / "libs" / "tau-examples" / "src" / "kernels" / "smlibpy"
sys.path.insert(0, str(PYTHON_ROOT))

import numpy
import smlibpy
from smlibpy import (
    Align,
    Axis,
    Box,
    Circle,
    Cone,
    Cylinder,
    GridLocations,
    Line,
    Location,
    Mesh,
    Part,
    Plane,
    Polygon,
    Polyline,
    PolarLocations,
    Pos,
    Rectangle,
    Rot,
    Sketch,
    Sphere,
    Spline,
    Torus,
    Vector,
    X,
    Y,
    Z,
    export_step,
    export_stl,
    import_step,
    load,
    loft,
    save,
    sweep,
    tessellate,
)

import worker
from tau_kernel.protocol import Artifacts, WorkerContext

PINNED = re.search(r"^smlibpy==(\S+)$", (PYTHON_ROOT / "requirements.in").read_text(), re.MULTILINE)


@contextmanager
def strict() -> Iterator[None]:
    """Turn the deprecations smlibpy raises for renamed keywords into errors, so nothing Tau ships relies on them."""

    with warnings.catch_warnings():
        warnings.simplefilter("error", DeprecationWarning)
        warnings.simplefilter("error", FutureWarning)
        yield


class Project:
    """A worker over a temporary copy of a project's files."""

    def __init__(self, files: dict[str, bytes]) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="tau-smlibpy-surface-")
        root = Path(self.directory.name)
        workspace, artifacts = root / "workspace", root / "artifacts"
        workspace.mkdir()
        artifacts.mkdir()
        for name, data in files.items():
            (workspace / name).parent.mkdir(parents=True, exist_ok=True)
            (workspace / name).write_bytes(data)
        self.worker = worker.Worker(WorkerContext(workspace.resolve(), Artifacts(artifacts), threading.Event()))

    def __enter__(self) -> Project:
        return self

    def __exit__(self, *_: object) -> None:
        self.directory.cleanup()

    def run(self, case: unittest.TestCase, entry: str = "main.py") -> dict[str, Any]:
        """Analyze, build, measure, mesh and export the entry, checking each answer; the mesh bundle's header."""

        analysis = self.worker.dispatch("analyze", {"entryPath": entry})
        case.assertIsInstance(analysis["defaultParameters"], dict)
        handle = self.worker.dispatch("build", {"entryPath": entry})["handleId"]
        case.assertGreater(self.worker.dispatch("measure", {"handleId": handle})["diagonal"], 0)
        meshed = self.worker.dispatch("mesh", {"handleId": handle, "linearTolerance": 0.1, "angularTolerance": 15})
        case.assertGreater(meshed["triangles"], 0)
        data = Path(meshed["artifactPath"]).read_bytes()
        case.assertEqual(data[:8], worker.BUNDLE_MAGIC)
        header = json.loads(data[12 : 12 + int.from_bytes(data[8:12], "little")])
        for shape in header["shapes"]:
            groups = shape["faces"]["faceGroups"]
            # `triangles` is the [offset, length] of its little-endian uint32 indices in the bundle's body.
            case.assertEqual(sum(group["count"] for group in groups), shape["faces"]["triangles"][1] // 4)
        step = self.worker.dispatch("export", {"handleId": handle, "format": "step"})
        case.assertIn("ISO-10303-21", Path(step["artifactPath"]).read_text())
        stl = self.worker.dispatch(
            "export", {"handleId": handle, "format": "stl", "linearTolerance": 0.1, "angularTolerance": 15}
        )
        case.assertEqual(stl["byteLength"], Path(stl["artifactPath"]).stat().st_size)
        case.assertEqual(self.worker.dispatch("release", {"handleId": handle}), {})
        return header


def snippets() -> list[tuple[str, str]]:
    """Every complete model (a fenced Python block with `def main`) in the kernel's agent skill files."""

    found = []
    for path in sorted(SKILL_ROOT.rglob("*.md")):
        for index, block in enumerate(re.findall(r"```python\n(.*?)```", path.read_text(), re.DOTALL)):
            if "def main" in block:
                found.append((f"{path.relative_to(SKILL_ROOT)}#{index}", block))
    return found


def documented_symbols() -> list[str]:
    """Every qualified name the generated API index lists."""

    index = (SKILL_ROOT / "cad-smlibpy" / "api-index.md").read_text()
    return re.findall(r"^\s*(smlibpy(?:\.\w+)+) \(", index, re.MULTILINE)


def resolve(name: str) -> Any:
    """The object a qualified name names: the longest importable module prefix, then its attributes."""

    parts = name.split(".")
    for split in range(len(parts), 0, -1):
        try:
            value = importlib.import_module(".".join(parts[:split]))
        except ImportError:
            continue
        for attribute in parts[split:]:
            value = getattr(value, attribute)
        return value
    raise ImportError(name)


class PinTest(unittest.TestCase):
    def test_the_bundled_wheel_is_the_pinned_one(self) -> None:
        self.assertIsNotNone(PINNED)
        self.assertEqual(importlib.metadata.version("smlibpy"), PINNED[1])

    def test_the_api_index_describes_the_pinned_wheel(self) -> None:
        index = (SKILL_ROOT / "cad-smlibpy" / "api-index.md").read_text()
        self.assertIn(f"smlibpy {PINNED[1]} ·", index)


class DocumentedSurfaceTest(unittest.TestCase):
    def test_every_documented_symbol_resolves(self) -> None:
        symbols = documented_symbols()
        self.assertGreater(len(symbols), 400)
        missing = []
        for name in symbols:
            try:
                resolve(name)
            except (AttributeError, ImportError):
                missing.append(name)
        self.assertEqual(missing, [])

    def test_every_documented_callable_has_a_signature(self) -> None:
        for name in documented_symbols():
            value = resolve(name)
            if callable(value) and not inspect.isclass(value):
                with self.subTest(name):
                    inspect.signature(value)

    def test_every_skill_model_builds(self) -> None:
        found = snippets()
        self.assertGreaterEqual(len(found), 4)
        for name, source in found:
            with self.subTest(name), strict(), Project({"main.py": source.encode()}) as project:
                project.run(self)


class ExamplesTest(unittest.TestCase):
    def test_every_example_builds_meshes_and_exports(self) -> None:
        examples = sorted(path for path in EXAMPLES_ROOT.iterdir() if (path / "main.py").is_file())
        self.assertGreaterEqual(len(examples), 3)
        for example in examples:
            files = {str(path.relative_to(example)): path.read_bytes() for path in example.rglob("*") if path.is_file()}
            with self.subTest(example.name), strict(), Project(files) as project:
                header = project.run(self)
                self.assertGreater(len(header["shapes"]), 0)


class LibrarySurfaceTest(unittest.TestCase):
    """The library features models build with, each checked against a known measure."""

    def setUp(self) -> None:
        self.enterContext(strict())

    def test_primitives(self) -> None:
        self.assertAlmostEqual(Box(2, 3, 4).volume, 24, places=6)
        self.assertAlmostEqual(Cylinder(1, 2).volume, 2 * numpy.pi, places=4)
        self.assertAlmostEqual(Sphere(1).volume, 4 / 3 * numpy.pi, places=4)
        self.assertAlmostEqual(Cone(1, 0, 3).volume, numpy.pi, places=4)
        self.assertAlmostEqual(Torus(3, 1).volume, 2 * numpy.pi**2 * 3, places=3)
        standing = Box(2, 2, 2, align=(Align.CENTER, Align.CENTER, Align.MIN))
        self.assertAlmostEqual(standing.bbox().min.z, 0, places=6)

    def test_sketches_and_features(self) -> None:
        plate = Rectangle(40, 20, fillet=2) - Circle(4)
        self.assertIsInstance(plate, Sketch)
        self.assertAlmostEqual(plate.extrude(5).volume, plate.area * 5, places=3)
        self.assertAlmostEqual(Rectangle(10, 10).extrude(5, both=True).bbox().size.z, 10, places=6)
        triangle = Polygon((0, 0), (4, 0), (0, 3))
        self.assertAlmostEqual(triangle.area, 6, places=6)
        ring = (Plane.XZ * Pos(10, 0) * Rectangle(2, 4)).revolve(Z)
        self.assertAlmostEqual(ring.volume, 2 * numpy.pi * 10 * 8, places=2)
        lofted = loft([Circle(5), Plane.XY.offset(10) * Circle(5)])
        self.assertAlmostEqual(lofted.volume, numpy.pi * 25 * 10, places=1)
        path = Spline((0, 0, 0), (0, 5, 10), (0, 0, 20))
        swept = sweep(Circle(1), path)
        self.assertGreater(swept.volume, numpy.pi * 20)
        self.assertGreater(Polyline((0, 0), (5, 0), (5, 5)).length, 9.99)
        self.assertAlmostEqual(Line((0, 0, 0), (3, 4, 0)).length, 5, places=6)

    def test_booleans_edits_and_selectors(self) -> None:
        box = Box(10, 10, 10)
        self.assertAlmostEqual((box - Cylinder(2, 12)).volume, 1000 - numpy.pi * 4 * 10, places=2)
        self.assertAlmostEqual((box + Pos(5, 0, 0) * Box(10, 10, 10)).volume, 1500, places=3)
        self.assertAlmostEqual((box & Pos(5, 0, 0) * Box(10, 10, 10)).volume, 500, places=3)
        self.assertEqual(len(box.edges().parallel_to(Z)), 4)
        self.assertEqual(len(box.faces().top()), 1)
        self.assertEqual(len(box.edges().group_by(Z)[-1]), 4)
        rounded = box.fillet(box.edges().parallel_to(Z), 2)
        self.assertLess(rounded.volume, 1000)
        self.assertTrue(rounded.is_valid())
        chamfered = box.chamfer(box.edges().group_by(Z)[-1], 1)
        self.assertAlmostEqual(chamfered.volume, 1000 - 4 * 10 * 0.5 + 4 / 3, places=3)
        hollow = box.shell(1, box.faces().top())
        self.assertAlmostEqual(hollow.volume, 1000 - 8 * 8 * 9, places=2)

    def test_placement(self) -> None:
        box = Box(1, 1, 1)
        self.assertAlmostEqual((Pos(5, 0, 0) * box).center().x, 5, places=6)
        self.assertAlmostEqual(box.translate(0, 3, 0).center().y, 3, places=6)
        self.assertAlmostEqual((Rot(0, 0, 90) * Pos(1, 0, 0) * box).center().y, 1, places=6)
        self.assertAlmostEqual(box.translate(2, 0, 0).mirror(Plane.YZ).center().x, -2, places=6)
        self.assertEqual(len(GridLocations(5, 5, 3, 2) * box), 6)
        self.assertEqual(len(PolarLocations(10, 6) * box), 6)
        self.assertAlmostEqual(Vector(3, 4, 0).length, 5)
        self.assertAlmostEqual(Location((1, 2, 3)).position.z, 3)
        self.assertTrue(Axis.Z.is_parallel(Axis((1, 1, 1), (0, 0, 2))))
        self.assertEqual((X.direction.x, Y.direction.y), (1, 1))
        self.assertEqual(box.named("Cube").name, "Cube")

    def test_meshes(self) -> None:
        sphere = tessellate(Sphere(5), 0.01, 10)
        self.assertIsInstance(sphere, Mesh)
        self.assertAlmostEqual(sphere.volume / (4 / 3 * numpy.pi * 125), 1, delta=0.005)
        self.assertTrue(sphere.is_closed())
        moved = sphere.translate(10, 0, 0)
        self.assertAlmostEqual(moved.center().x, 10, places=3)

    def test_files(self) -> None:
        part = (Box(10, 10, 10) - Cylinder(2, 12)).named("Block")
        with tempfile.TemporaryDirectory(prefix="tau-smlibpy-files-") as directory:
            root = Path(directory)
            save(part, root / "part.smb")
            loaded = load(root / "part.smb")
            self.assertIsInstance(loaded, Part)
            self.assertAlmostEqual(loaded.volume, part.volume, places=6)
            export_step(part, root / "part.step")
            imported = import_step(root / "part.step")
            bodies = imported if isinstance(imported, list) else [imported]
            self.assertAlmostEqual(sum(body.volume for body in bodies), part.volume, places=3)
            export_stl(part, root / "part.stl", tolerance=0.1)
            self.assertGreater((root / "part.stl").stat().st_size, 84)

    def test_errors_are_specific(self) -> None:
        box = Box(10, 10, 10)
        with self.assertRaises(smlibpy.ModelingError):
            box.fillet(box.edges(), 20)


if __name__ == "__main__":
    unittest.main()
