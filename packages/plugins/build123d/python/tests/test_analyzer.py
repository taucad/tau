from __future__ import annotations

import ast
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

import analyzer


def model(fields: str = "width: float = 2.5", metadata: str = "") -> str:
    return f"""from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class Params:
    {fields}

{metadata}
"""


class AnalyzerTest(unittest.TestCase):
    def assert_issue(self, source: str, message: str) -> analyzer.AnalysisIssue:
        with self.assertRaisesRegex(analyzer.AnalysisIssue, message) as caught:
            analyzer.analyze_source(source)
        return caught.exception

    def test_supported_parameters_metadata_and_issue_shape(self) -> None:
        source = model(
            "enabled: bool = True\n    count: int = 2\n    ratio: float = -2\n    name: str = 'part'\n    mode: Literal['a', 'b'] = 'a'",
            "__tau__ = {'parameters': {'ratio': {'minimum': -3, 'maximum': 4, 'multipleOf': 1}, "
            "'name': {'minLength': 1, 'maxLength': 8, 'pattern': '^p', 'title': 'Name', "
            "'description': 'Display', 'examples': ['part'], 'enum': ['part']}}, "
            "'dependencies': ['profile.json']}",
        )
        result = analyzer.analyze_source(source)
        self.assertEqual(
            result["defaultParameters"],
            {"enabled": True, "count": 2, "ratio": -2, "name": "part", "mode": "a"},
        )
        self.assertEqual(result["dependencies"], ["profile.json"])
        self.assertEqual(result["jsonSchema"]["properties"]["mode"]["enum"], ["a", "b"])

        issue = analyzer.AnalysisIssue("bad", "CODE", 3, 4)
        self.assertEqual(issue.as_dict("main.py")["location"]["startColumn"], 4)

    def test_parse_limits_and_syntax(self) -> None:
        self.assertEqual(self.assert_issue("(", "was never closed").code, "PYTHON_SYNTAX")
        with patch.object(analyzer, "MAX_SOURCE_BYTES", 1):
            self.assertEqual(self.assert_issue(model(), "exceeds").code, "PYTHON_SOURCE_LIMIT")
        with patch.object(analyzer, "MAX_AST_NODES", 1):
            self.assertEqual(self.assert_issue(model(), "syntax tree").code, "PYTHON_AST_LIMIT")
        with patch.object(analyzer, "MAX_AST_DEPTH", 1):
            self.assertEqual(self.assert_issue(model(), "syntax tree").code, "PYTHON_AST_LIMIT")
        with patch("analyzer.ast.parse", side_effect=MemoryError):
            self.assertEqual(self.assert_issue(model(), "deeply nested").code, "PYTHON_AST_LIMIT")

    def test_literal_bounds_and_rejections(self) -> None:
        self.assertEqual(analyzer._literal(ast.parse("(+2, -3, None)", mode="eval").body), [2, -3, None])
        with patch.object(analyzer, "MAX_AST_DEPTH", 0):
            with self.assertRaisesRegex(analyzer.AnalysisIssue, "nesting"):
                analyzer._literal(ast.parse("[1]", mode="eval").body, 1)
        with patch.object(analyzer, "MAX_STRING_LENGTH", 1):
            with self.assertRaisesRegex(analyzer.AnalysisIssue, "String"):
                analyzer._literal(ast.Constant("xx"))
        with patch.object(analyzer, "MAX_COLLECTION_ITEMS", 1):
            with self.assertRaisesRegex(analyzer.AnalysisIssue, "Collection"):
                analyzer._literal(ast.parse("[1, 2]", mode="eval").body)
            with self.assertRaisesRegex(analyzer.AnalysisIssue, "Mapping"):
                analyzer._literal(ast.parse("{'a': 1, 'b': 2}", mode="eval").body)
        for expression, message in (
            ("...", "JSON scalar"),
            ("-True", "only for numbers"),
            ("{**{'a': 1}}", "unpacking"),
            ("{1: 2}", "keys must be strings"),
            ("value", "JSON-compatible"),
        ):
            with self.subTest(expression=expression), self.assertRaisesRegex(analyzer.AnalysisIssue, message):
                analyzer._literal(ast.parse(expression, mode="eval").body)

    def test_parameter_contract_rejections(self) -> None:
        cases = (
            ("class Params: pass", "exactly one"),
            (model("width: float"), "requires a default"),
            (model("value: bytes = b'x'"), "support bool"),
            (model("value: Literal[1, 'x'] = 1"), "one scalar type"),
            (model("value: Literal[()] = ()"), "require bool"),
            (model("width: float = True"), "does not match"),
            (model("mode: Literal['a'] = 'b'"), "not in its Literal"),
            (model("width: int = 1\n    width: int = 2"), "only once"),
            (model(metadata="__tau__: dict"), "requires a literal"),
            (model(metadata="__tau__ = []"), "must be a dictionary"),
            (model(metadata="__tau__ = {'other': 1}"), "Unsupported __tau__"),
            (model(metadata="__tau__ = {}\n__tau__ = {}"), "only once"),
            (model(metadata="__tau__ = {'parameters': []}"), "must be a dictionary"),
            (model(metadata="__tau__ = {'parameters': {'other': {}}}"), "unknown fields"),
            (model(metadata="__tau__ = {'parameters': {'width': []}}"), "must be a dictionary"),
            (model(metadata="__tau__ = {'parameters': {'width': {'other': 1}}}"), "Unsupported hints"),
            (model(metadata="__tau__ = {'dependencies': 'x'}"), "must be a list"),
            (model(metadata="__tau__ = {'dependencies': [1]}"), "must be a list"),
            (model(metadata="__tau__ = make_metadata()"), "JSON-compatible"),
        )
        for source, message in cases:
            with self.subTest(message=message):
                self.assert_issue(source, message)

    def test_hint_validation(self) -> None:
        cases = (
            ("{'title': 1}", "must be a string"),
            ("{'pattern': '^x'}", "requires a string"),
            ("{'minimum': 'x'}", "finite numeric"),
            ("{'minimum': 1.5}", "must be an integer"),
            ("{'multipleOf': 0}", "must be positive"),
            ("{'minLength': 1}", "requires a string"),
            ("{'enum': []}", "non-empty list"),
            ("{'examples': 'x'}", "must be a list"),
            ("{'examples': ['x']}", "must match"),
            ("{'enum': [2]}", "not in its hinted enum"),
            ("{'minimum': 2}", "violates minimum"),
            ("{'maximum': 0}", "violates maximum"),
            ("{'exclusiveMinimum': 1}", "violates exclusiveMinimum"),
            ("{'exclusiveMaximum': 1}", "violates exclusiveMaximum"),
            ("{'multipleOf': 2}", "violates multipleOf"),
        )
        for hint, message in cases:
            source = model("count: int = 1", f"__tau__ = {{'parameters': {{'count': {hint}}}}}")
            with self.subTest(hint=hint):
                self.assert_issue(source, message)

        string_cases = (
            ("{'pattern': '['}", "is invalid"),
            ("{'pattern': '^x'}", "violates pattern"),
            ("{'minLength': 2}", "violates minLength"),
            ("{'maxLength': 0}", "violates maxLength"),
        )
        for hint, message in string_cases:
            source = model("name: str = 'a'", f"__tau__ = {{'parameters': {{'name': {hint}}}}}")
            with self.subTest(hint=hint):
                self.assert_issue(source, message)

    def test_names_annotations_and_decorator_forms(self) -> None:
        self.assertEqual(analyzer._name(ast.parse("typing.Literal", mode="eval").body), "typing.Literal")
        self.assertIsNone(analyzer._name(ast.parse("pkg.typing.Literal", mode="eval").body))
        result = analyzer.analyze_source(
            "import dataclasses\nimport typing\n@dataclasses.dataclass(frozen=True)\nclass Params:\n"
            "    'ignored'\n    mode: typing.Literal[1, 2] = 1\n__tau__: dict = {}\n"
        )
        self.assertEqual(result["defaultParameters"], {"mode": 1})
        too_relative = ast.parse("from ...pkg import value").body[0]
        self.assertEqual(analyzer._module_candidates("main.py", too_relative), ([], True))

    def test_project_dependency_closure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pkg").mkdir()
            (root / "pkg" / "__init__.py").write_text("from . import child\n", encoding="utf-8")
            (root / "pkg" / "child.py").write_text("from .. import helper\n", encoding="utf-8")
            (root / "helper.py").write_text("import pkg.child\n", encoding="utf-8")
            (root / "asset.json").write_text("{}", encoding="utf-8")
            (root / "observed.py").write_text("value = 1\n", encoding="utf-8")
            (root / "main.py").write_text(
                model(metadata="__tau__ = {'dependencies': ['asset.json']}") + "\nfrom pkg import child\n",
                encoding="utf-8",
            )
            result = analyzer.analyze_project(root, "main.py", ["observed.py", "missing-observed.py"])
            self.assertEqual(
                result["resolved"],
                ["asset.json", "helper.py", "main.py", "observed.py", "pkg/__init__.py", "pkg/child.py"],
            )
            self.assertEqual(result["unresolved"], [])

            (root / "main.py").write_text(model() + "\nfrom .missing import value\n", encoding="utf-8")
            unresolved = analyzer.analyze_project(root, "main.py")
            self.assertEqual(unresolved["unresolved"], ["missing.py"])

    def test_dependency_path_and_dynamic_import_rejections(self) -> None:
        for path in ("", "../secret", "/absolute", "a\\b", "bad\0path"):
            with self.subTest(path=path), self.assertRaises(analyzer.AnalysisIssue):
                analyzer._canonical_relative(path)
        for expression in ("__import__('x')", "importlib.import_module('x')"):
            self.assertEqual(self.assert_issue(model() + f"\n{expression}\n", "Dynamic imports").code, "PYTHON_DYNAMIC_IMPORT")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(analyzer.AnalysisIssue, "does not exist"):
                analyzer.analyze_project(root, "missing.py")
            (root / "main.py").write_text(model(metadata="__tau__ = {'dependencies': ['missing.json']}"), encoding="utf-8")
            self.assertEqual(analyzer.analyze_project(root, "main.py")["unresolved"], ["missing.json"])


if __name__ == "__main__":
    unittest.main()
