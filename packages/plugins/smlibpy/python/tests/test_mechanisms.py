from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from smlibpy_mechanisms import read_mechanism

SOURCE = {"links": [{"name": "Base"}, {"name": "Lid"}], "connections": []}


def module(**attributes: object) -> types.ModuleType:
    namespace = types.ModuleType("model")
    namespace.__dict__.update(attributes)
    return namespace


class ReadMechanismTest(unittest.TestCase):
    def test_absent_or_empty_declarations_read_as_none(self) -> None:
        self.assertIsNone(read_mechanism(module(), None))
        self.assertIsNone(read_mechanism(module(mechanism=None), None))
        self.assertIsNone(read_mechanism(module(mechanism=lambda _params: None), None))

    def test_reads_a_dict_or_a_function_of_the_parameters(self) -> None:
        self.assertEqual(read_mechanism(module(mechanism=SOURCE), None), SOURCE)
        received: list[object] = []

        def mechanism(params: object) -> dict[str, object]:
            received.append(params)
            return {**SOURCE, "angle": (0, 90)}

        self.assertEqual(read_mechanism(module(mechanism=mechanism), "params")["angle"], [0, 90])
        self.assertEqual(received, ["params"])

    def test_refuses_coroutines_and_non_dicts(self) -> None:
        async def mechanism(_params: object) -> dict[str, object]:
            return SOURCE

        with self.assertRaisesRegex(TypeError, "not a coroutine"):
            read_mechanism(module(mechanism=mechanism), None)
        with self.assertRaisesRegex(TypeError, "must be a MechanismSource dict"):
            read_mechanism(module(mechanism=[SOURCE]), None)
        with self.assertRaisesRegex(TypeError, "mechanism must be plain JSON"):
            read_mechanism(module(mechanism={"links": object()}), None)


if __name__ == "__main__":
    unittest.main()
