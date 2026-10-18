from __future__ import annotations

import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from tau_kernel import model
from tau_kernel.analyzer import ParameterSchemaIdentity

IDENTITY = ParameterSchemaIdentity(id="urn:taucad:test:parameters", name="TestParameters")

MODEL = """from dataclasses import dataclass

@dataclass(frozen=True)
class Params:
    width: float = 2.0

def main(params: Params):
    return {"width": params.width}
"""

HELPER_MODEL = """from dataclasses import dataclass

import helper

@dataclass(frozen=True)
class Params:
    depth: float = 3.0

def main(params: Params):
    return helper.WIDTH
"""


def load(root: Path, parameters: object = None) -> model.LoadedEntry:
    with model.load_entry(
        root, "main.py", {} if parameters is None else parameters, identity=IDENTITY, module_prefix="_tau_test_"
    ) as entry:
        return entry


class ModelTest(unittest.TestCase):
    def test_project_modules_and_eviction(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            root = parent / "workspace"
            root.mkdir()
            (root / "package").mkdir()
            (root / "real").mkdir()
            (root / "link").symlink_to(root / "real", target_is_directory=True)
            sibling = parent / "workspace-sibling"
            sibling.mkdir()
            known = frozenset(sys.modules)
            module_paths = {
                "tau_test_project": root / "module.py",
                "tau_test_package": root / "package" / "module.py",
                "tau_test_linked": root / "link" / "module.py",
                "tau_test_sibling": sibling / "module.py",
            }
            loaded_modules = []
            for name, path in module_paths.items():
                path.write_text("VALUE = 1\n", encoding="utf-8")
                spec = importlib.util.spec_from_file_location(name, path)
                assert spec is not None and spec.loader is not None
                module = importlib.util.module_from_spec(spec)
                sys.modules[name] = module
                spec.loader.exec_module(module)
                loaded_modules.append(module)
            project_module, package_module, linked_module, sibling_module = loaded_modules
            native_module = types.ModuleType("tau_test_native")
            native_module.__file__ = str(root / "module.so")
            no_file = types.ModuleType("tau_test_none")
            relative_module = types.ModuleType("tau_test_relative")
            relative_module.__file__ = "relative.py"
            dot_py_module = types.ModuleType("tau_test_dot_py")
            dot_py_module.__file__ = str(root / ".py")
            modules = (
                project_module,
                package_module,
                linked_module,
                sibling_module,
                native_module,
                no_file,
                relative_module,
                dot_py_module,
            )
            for module in modules:
                sys.modules[module.__name__] = module
            try:
                model._record_project_modules(root, known)
                self.assertEqual(
                    dict(model._LOADED_PROJECT_MODULES),
                    {
                        project_module.__name__: "module.py",
                        package_module.__name__: "package/module.py",
                        linked_module.__name__: "link/module.py",
                    },
                )
                # Modules already loaded when the build started are never the build's own imports.
                model._record_project_modules(root, frozenset(sys.modules))
                self.assertEqual(dict(model._LOADED_PROJECT_MODULES), {})

                model._record_project_modules(root, known)
                with patch("tau_kernel.model.importlib.invalidate_caches") as invalidate:
                    model.evict_project_modules()
                    invalidate.assert_called_once()
                self.assertEqual(dict(model._LOADED_PROJECT_MODULES), {})
                self.assertNotIn(project_module.__name__, sys.modules)
                self.assertNotIn(package_module.__name__, sys.modules)
                self.assertNotIn(linked_module.__name__, sys.modules)
                self.assertIn(sibling_module.__name__, sys.modules)
            finally:
                model._LOADED_PROJECT_MODULES.clear()
                for module in modules:
                    sys.modules.pop(module.__name__, None)

    def test_parameter_validation(self) -> None:
        schema = {
            "properties": {
                "enabled": {"type": "boolean", "default": True},
                "count": {"type": "integer", "default": 2, "minimum": 1, "maximum": 3, "multipleOf": 1},
                "ratio": {"type": "number", "default": 1.5, "exclusiveMinimum": 0, "exclusiveMaximum": 2},
                "name": {"type": "string", "default": "part", "enum": ["part"], "minLength": 1, "maxLength": 5, "pattern": "^p"},
            }
        }
        self.assertEqual(model.validate_parameters({"count": 3}, schema)["count"], 3)
        cases = (
            ([], "object"),
            ({"other": 1}, "Unknown"),
            ({"enabled": 1}, "must be boolean"),
            ({"count": True}, "must be integer"),
            ({"ratio": float("inf")}, "must be number"),
            ({"name": "other"}, "one of"),
            ({"count": 0}, "minimum"),
            ({"count": 4}, "maximum"),
            ({"ratio": 0}, "exclusiveMinimum"),
            ({"ratio": 2}, "exclusiveMaximum"),
            ({"name": "partsx"}, "one of"),
        )
        for value, message in cases:
            with self.subTest(value=value), self.assertRaisesRegex((TypeError, ValueError), message):
                model.validate_parameters(value, schema)
        string_schema = {
            "properties": {"name": {"type": "string", "default": "a", "minLength": 1, "maxLength": 1, "pattern": "^a"}}
        }
        with self.assertRaisesRegex(ValueError, "minLength"):
            model.validate_parameters({"name": ""}, string_schema)
        with self.assertRaisesRegex(ValueError, "maxLength"):
            model.validate_parameters({"name": "aa"}, string_schema)
        with self.assertRaisesRegex(ValueError, "pattern"):
            model.validate_parameters({"name": "b"}, string_schema)
        multiple_schema = {"properties": {"count": {"type": "integer", "default": 2, "multipleOf": 2}}}
        with self.assertRaisesRegex(ValueError, "multipleOf"):
            model.validate_parameters({"count": 3}, multiple_schema)


    def test_load_entry_runs_main_with_validated_parameters(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entry = root / "main.py"
            entry.write_text(MODEL, encoding="utf-8")
            with model.load_entry(root, "main.py", {"width": 5}, identity=IDENTITY, module_prefix="_tau_test_") as loaded:
                self.assertEqual(loaded.result, {"width": 5})
                self.assertTrue(loaded.module.__name__.startswith("_tau_test_"))
                self.assertIn(loaded.module.__name__, sys.modules)
                self.assertEqual(loaded.analysis["declaration"]["schema"]["$id"], IDENTITY.id)
                self.assertEqual(loaded.dependencies, [])
            self.assertNotIn(loaded.module.__name__, sys.modules)
            self.assertEqual(loaded.dependencies, ["main.py"])

            cases = (
                (MODEL.replace("def main", "async def main"), "Async"),
                (MODEL.replace("def main(params: Params):", "not_main = 1\ndef other(params: Params):"), "callable main"),
                (MODEL.replace("@dataclass(frozen=True)", "@dataclass"), "frozen"),
            )
            for source, message in cases:
                entry.write_text(source, encoding="utf-8")
                with self.subTest(message=message), self.assertRaisesRegex(Exception, message):
                    load(root)
            entry.write_text(MODEL, encoding="utf-8")
            with self.assertRaisesRegex(TypeError, "Unknown parameters"):
                load(root, {"depth": 1})

            with (
                patch("tau_kernel.model.importlib.util.spec_from_file_location", return_value=None),
                self.assertRaisesRegex(RuntimeError, "Unable"),
            ):
                load(root)

            analysis = {"jsonSchema": {"properties": {}}, "defaultParameters": {}, "resolved": [], "unresolved": []}
            for source, message in (
                ("Params = 1\ndef main(params): return 1\n", "dataclass"),
                ("from dataclasses import dataclass\n@dataclass\nclass Params: pass\ndef main(params): return 1\n", "frozen"),
            ):
                entry.write_text(source, encoding="utf-8")
                with (
                    self.subTest(message=message),
                    patch("tau_kernel.model.analyze_project", return_value=analysis),
                    self.assertRaisesRegex(TypeError, message),
                ):
                    load(root)

    def test_project_module_memo_is_invalidated_by_an_edited_dependency(self) -> None:
        """W14: the per-interpreter memo evicts the modules the previous build imported, failed builds included."""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            helper = root / "helper.py"
            entry = root / "main.py"
            helper.write_text("WIDTH = 2.0\n", encoding="utf-8")
            entry.write_text(HELPER_MODEL, encoding="utf-8")
            sys.path.insert(0, str(root))
            try:
                # Workers run as `python -I -B`; without that, edits inside one mtime tick would be served from a
                # stale __pycache__ entry instead of from the memo.
                with patch.object(sys, "dont_write_bytecode", True):
                    loaded = load(root)
                    self.assertEqual(loaded.dependencies, ["helper.py", "main.py"])
                    self.assertEqual(loaded.result, 2.0)

                    # A build that imports the dependency and then fails still records it for the next eviction.
                    helper.write_text("WIDTH = 7.0\n", encoding="utf-8")
                    entry.write_text(
                        HELPER_MODEL.replace("return helper", "raise ValueError('boom')\n    return helper"),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(ValueError, "boom"):
                        load(root)

                    helper.write_text("WIDTH = 9.0\n", encoding="utf-8")
                    entry.write_text(HELPER_MODEL, encoding="utf-8")
                    loaded = load(root)
                    self.assertEqual(loaded.result, 9.0)
                    self.assertEqual(loaded.dependencies, ["helper.py", "main.py"])
            finally:
                sys.path.remove(str(root))
                model.evict_project_modules()


if __name__ == "__main__":
    unittest.main()
