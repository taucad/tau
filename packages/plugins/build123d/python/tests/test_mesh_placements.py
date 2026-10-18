"""Geometry-level placement oracles independent of the mesh bake implementation."""
from __future__ import annotations

from itertools import product
from pathlib import Path
import sys
import unittest

import numpy as np
from build123d import Box, Compound, Location
from OCP.gp import gp_Dir, gp_Pnt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker


class MeshPlacementTest(unittest.TestCase):
    def test_nested_occurrences_preserve_surface_edge_and_normal_placements(self) -> None:
        leaf_location = Location((3, 4, 5), (20, 30, 40))
        module_location = Location((48, -12, 7), (5, 14, 90))
        root_location = Location((-31, 9, 17), (-32, 19, 45))
        leaf = Box(12, 18, 24).located(leaf_location)
        module = Compound(children=[leaf]).located(module_location)
        assembly = Compound(children=[module]).located(root_location)
        leaf = assembly.children[0].children[0]
        exact_before = worker._brep_bytes(leaf)

        # Native root-to-leaf composition supplies the independent world oracle.
        expected = (root_location * module_location * leaf_location).wrapped.Transformation()
        points = [gp_Pnt(x, y, z).Transformed(expected) for x, y, z in product((-6, 6), (-9, 9), (-12, 12))]
        corners = np.array([(point.X() / 1000, point.Z() / 1000, -point.Y() / 1000) for point in points])
        normal_directions = []
        for axis in range(3):
            for sign in (-1, 1):
                normal = [0, 0, 0]
                normal[axis] = sign
                direction = gp_Dir(*normal).Transformed(expected)
                normal_directions.append((direction.X(), direction.Z(), -direction.Y()))
        normals = np.array(normal_directions)

        for linear_tolerance, angular_tolerance in ((0.05, 0.1), (0.25, 0.5)):
            mesh = worker._mesh_shape(leaf, linear_tolerance, angular_tolerance)
            for attribute in ("positions", "lines"):
                with self.subTest(attribute=attribute):
                    actual = np.array(mesh[attribute]).reshape(-1, 3)
                    distances = np.linalg.norm(actual[:, None, :] - corners[None, :, :], axis=2)
                    self.assertLess(float(distances.min(axis=1).max()), 1e-10)
                    self.assertEqual(set(distances.argmin(axis=1)), set(range(8)))
            actual_normals = np.array(mesh["normals"]).reshape(-1, 3)
            normal_errors = np.linalg.norm(actual_normals[:, None, :] - normals[None, :, :], axis=2)
            self.assertLess(float(normal_errors.min(axis=1).max()), 1e-10)
            self.assertEqual(set(normal_errors.argmin(axis=1)), set(range(6)))
            self.assertEqual(worker._brep_bytes(leaf), exact_before, "meshing changed the retained native BRep")
            self.assertEqual(leaf.location, leaf_location)


if __name__ == "__main__":
    unittest.main()
