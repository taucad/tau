"""Independent surface-boundary checks for exported BRep edge polylines."""
from __future__ import annotations

from collections import Counter
import importlib.util
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker
from build123d import Compound, Cone, Cylinder, Edge, Face, Location, Sphere, Wire


def segment(first, second):
    return tuple(sorted((tuple(round(x, 12) for x in first), tuple(round(x, 12) for x in second))))


def boundary_segments(mesh):
    """Recover boundaries from emitted triangles, without reading OCCT edge polygons."""
    points = [tuple(mesh['positions'][i:i + 3]) for i in range(0, len(mesh['positions']), 3)]
    boundary = set()
    for face in mesh['faceGroups']:
        counts = Counter()
        indices = mesh['indices'][face['start']:face['start'] + face['count']]
        for i in range(0, len(indices), 3):
            a, b, c = indices[i:i + 3]
            for edge in ((a, b), (b, c), (c, a)):
                counts[tuple(sorted(edge))] += 1
        boundary.update(segment(points[a], points[b]) for (a, b), count in counts.items() if count == 1)
    return boundary


def line_segments(mesh):
    points = [tuple(mesh['lines'][i:i + 3]) for i in range(0, len(mesh['lines']), 3)]
    return [segment(points[a], points[b]) for a, b in zip(mesh['lineIndices'][::2], mesh['lineIndices'][1::2])]


def carrier():
    path = Path(__file__).resolve().parents[5] / 'libs/tau-examples/src/kernels/build123d/planetary-gear-system/main.py'
    spec = importlib.util.spec_from_file_location('edge_carrier_fixture', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    f = 14
    front = module.carrier_plate(48).translate((0, 0, f + 3)).fuse(
        module.chamfer(module.cylinder(15, 18, f + 8), 0.6, f + 26)
    )
    return front.fillet(1, [edge for edge in module.edges_at(front, f + 8)
                            if abs(edge.length - 2 * math.pi * 15) < 1e-4])


class EdgeTessellationTest(unittest.TestCase):
    def assert_aligned(self, shape, linear, angular):
        mesh = worker._mesh_shape(shape, linear, angular)
        segments = line_segments(mesh)
        boundary = boundary_segments(mesh)
        self.assertTrue(segments)
        self.assertTrue(all(edge in boundary for edge in segments),
                        f'{sum(edge not in boundary for edge in segments)}/{len(segments)} edge segments miss triangle boundaries')
        self.assertEqual([group['edgeId'] for group in mesh['edgeGroups']], list(range(1, len(shape.edges()) + 1)))
        self.assertTrue(all(group['count'] > 0 for group in mesh['edgeGroups']), 'retain native seams and all BRep edges')
        return mesh

    def test_curved_edges_share_surface_boundary_segments_at_each_tolerance(self):
        for shape in (Cylinder(15, 18), carrier()):
            for linear, degrees in ((0.02, 20), (0.02, 5), (0.1, 40)):
                with self.subTest(shape=type(shape).__name__, linear=linear, degrees=degrees):
                    self.assert_aligned(shape, linear, math.radians(degrees))

    def test_nested_locations_apply_once_to_surface_and_edge_samples(self):
        shape = Cylinder(15, 18).moved(Location((5, -7, 11), (13, 27, 41)))
        module = Compound(children=[shape]).moved(Location((-31, 19, 23), (17, 29, 61)))
        Compound(children=[module]).locate(Location((91, -43, 67), (11, 7, 19)))
        native_location = shape.global_location
        mesh = self.assert_aligned(shape, 0.02, math.radians(9))
        points = [tuple(mesh['positions'][i:i + 3]) for i in range(0, len(mesh['positions']), 3)]
        # Surface/edge agreement alone could mask both paths applying placement twice.
        expected = worker._point(native_location.position)
        midpoint = tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3))
        self.assertLess(math.dist(midpoint, expected), 0.0001)
        self.assertEqual(shape.global_location, native_location)

    def test_free_circle_fallback_obeys_angular_and_linear_deflection(self):
        circle = Edge.make_circle(15).moved(Location((7, -9, 13), (17, 31, 43)))
        coarse = worker._mesh_shape(circle, 0.2, math.radians(40))
        fine = worker._mesh_shape(circle, 0.2, math.radians(5))
        self.assertEqual(fine['positions'], [])
        self.assertGreater(len(fine['lineIndices']), len(coarse['lineIndices']))
        self.assertEqual(fine['edgeGroups'][0]['edgeId'], 1)
        for mesh, degrees in ((coarse, 40), (fine, 5)):
            for first, second in line_segments(mesh):
                chord = math.dist(first, second) * 1000
                self.assertLessEqual(2 * math.asin(chord / 30), math.radians(degrees) + 1e-8)
                self.assertLessEqual(15 - math.sqrt(225 - chord * chord / 4), 0.2 + 1e-8)

    def test_pole_edges_keep_valid_native_groups(self):
        for shape in (Sphere(15), Cone(15, 0, 18)):
            with self.subTest(shape=type(shape).__name__):
                mesh = self.assert_aligned(shape, 0.02, math.radians(12))
                self.assertTrue(all(math.isfinite(value) for value in mesh['lines']))
                self.assertTrue(all(index < len(mesh['lines']) // 3 for index in mesh['lineIndices']))

    def test_unmeshed_face_and_missing_polygon_retain_native_curve_fallback(self):
        from OCP.BRep import BRep_Builder, BRep_Tool
        from OCP.TopLoc import TopLoc_Location
        face = Face(Wire.make_circle(15))
        # A legitimate BRep face need not have any display triangulation yet.
        unmeshed = worker._edge_points(face, 0.2, math.radians(5))
        self.assertEqual(len(unmeshed), 1)
        located, _ = worker._triangulate(face, 0.2, math.radians(40))
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(located.faces()[0].wrapped, location)
        # OCCT supports a face mesh whose edge polygon is absent. Remove only
        # that cache entry, preserving the real analytic edge and surface mesh.
        edge = located.edges()[0]
        BRep_Builder().UpdateEdge(edge.wrapped, None, triangulation, location)
        coarse = worker._edge_points(located, 0.2, math.radians(40))
        fine = worker._edge_points(located, 0.2, math.radians(5))
        self.assertGreater(len(fine[0]), len(coarse[0]))
        self.assertEqual([worker._point(p) for p in fine[0]], [worker._point(p) for p in unmeshed[0]])
        self.assertTrue(all(abs(p.length - 15) < 1e-8 for p in fine[0]))

    def test_budget_retry_rebuilds_edges_from_the_admitted_surface(self):
        shape = Cylinder(15, 18)
        with self.assertRaises(worker._OverBudget):
            worker._topology((shape,), 0.001, math.radians(5), 1)
        _, meshes = worker._topology((shape,), 0.04, math.radians(24), 10000)
        self.assertEqual(len(meshes), 1)
        mesh = next(iter(meshes.values()))
        self.assertTrue(all(edge in boundary_segments(mesh) for edge in line_segments(mesh)))
        from OCP.BRep import BRep_Tool
        from OCP.TopLoc import TopLoc_Location
        self.assertTrue(all(BRep_Tool.Triangulation_s(face.wrapped, TopLoc_Location()) is None for face in shape.faces()))
