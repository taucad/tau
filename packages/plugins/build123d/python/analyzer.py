"""Bounded, non-executing analysis for Tau's Build123d authoring contract."""

from __future__ import annotations

import ast
import math
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

MAX_SOURCE_BYTES = 1_048_576
MAX_AST_NODES = 50_000
MAX_AST_DEPTH = 100
MAX_COLLECTION_ITEMS = 1_000
MAX_STRING_LENGTH = 65_536

SCALAR_TYPES = {"bool": bool, "int": int, "float": float, "str": str}
HINT_KEYS = {
    "title",
    "description",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "enum",
    "examples",
}


@dataclass
class AnalysisIssue(Exception):
    """Structured source error returned across the process protocol."""

    message: str
    code: str
    line: int = 1
    column: int = 1

    def as_dict(self, file_name: str) -> dict[str, Any]:
        return {
            "message": self.message,
            "code": self.code,
            "type": "syntax",
            "severity": "error",
            "location": {
                "fileName": file_name,
                "startLineNumber": self.line,
                "startColumn": self.column,
            },
        }


def _issue(node: ast.AST | None, message: str, code: str = "PYTHON_ANALYSIS") -> AnalysisIssue:
    return AnalysisIssue(message, code, getattr(node, "lineno", 1), getattr(node, "col_offset", 0) + 1)


def _parse(source: str) -> ast.Module:
    if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise AnalysisIssue(f"Python source exceeds {MAX_SOURCE_BYTES} bytes", "PYTHON_SOURCE_LIMIT")
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        raise AnalysisIssue(error.msg, "PYTHON_SYNTAX", error.lineno or 1, error.offset or 1) from error
    except (MemoryError, RecursionError) as error:
        raise AnalysisIssue("Python source is too deeply nested", "PYTHON_AST_LIMIT") from error

    count = 0
    stack: list[tuple[ast.AST, int]] = [(tree, 0)]
    while stack:
        node, depth = stack.pop()
        count += 1
        if count > MAX_AST_NODES or depth > MAX_AST_DEPTH:
            raise _issue(node, "Python syntax tree exceeds analysis limits", "PYTHON_AST_LIMIT")
        stack.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
    return tree


def _literal(node: ast.AST, depth: int = 0) -> Any:
    if depth > MAX_AST_DEPTH:
        raise _issue(node, "Literal exceeds nesting limit", "PYTHON_LITERAL_LIMIT")
    if isinstance(node, ast.Constant):
        if not isinstance(node.value, (str, int, float, bool, type(None))):
            raise _issue(node, "Only JSON scalar literals are supported")
        if isinstance(node.value, str) and len(node.value) > MAX_STRING_LENGTH:
            raise _issue(node, "String literal exceeds analysis limit", "PYTHON_LITERAL_LIMIT")
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _literal(node.operand, depth + 1)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise _issue(node, "Unary signs are supported only for numbers")
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, (ast.List, ast.Tuple)):
        if len(node.elts) > MAX_COLLECTION_ITEMS:
            raise _issue(node, "Collection literal exceeds analysis limit", "PYTHON_LITERAL_LIMIT")
        return [_literal(item, depth + 1) for item in node.elts]
    if isinstance(node, ast.Dict):
        if len(node.keys) > MAX_COLLECTION_ITEMS:
            raise _issue(node, "Mapping literal exceeds analysis limit", "PYTHON_LITERAL_LIMIT")
        result: dict[str, Any] = {}
        for key_node, value_node in zip(node.keys, node.values, strict=True):
            if key_node is None:
                raise _issue(node, "Dictionary unpacking is not supported")
            key = _literal(key_node, depth + 1)
            if not isinstance(key, str):
                raise _issue(key_node, "Metadata dictionary keys must be strings")
            result[key] = _literal(value_node, depth + 1)
        return result
    raise _issue(node, "Only JSON-compatible literals are supported")


def _name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return f"{node.value.id}.{node.attr}"
    return None


def _is_frozen_dataclass(node: ast.ClassDef) -> bool:
    return any(
        isinstance(decorator, ast.Call)
        and _name(decorator.func) in {"dataclass", "dataclasses.dataclass"}
        and any(
            keyword.arg == "frozen"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value is True
            for keyword in decorator.keywords
        )
        for decorator in node.decorator_list
    )


def _annotation(node: ast.AST) -> tuple[str, list[Any] | None]:
    name = _name(node)
    if name in SCALAR_TYPES:
        return name, None
    if isinstance(node, ast.Subscript) and _name(node.value) in {"Literal", "typing.Literal"}:
        values = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
        literals = [_literal(value) for value in values]
        if not literals or any(type(value) not in SCALAR_TYPES.values() for value in literals):
            raise _issue(node, "Literal parameters require bool, int, float, or string values")
        first_type = type(literals[0])
        if any(type(value) is not first_type for value in literals):
            raise _issue(node, "Literal parameter values must have one scalar type")
        return next(name for name, value_type in SCALAR_TYPES.items() if value_type is first_type), literals
    raise _issue(node, "Parameters support bool, int, float, str, and Literal annotations")


def _matches_type(value: Any, type_name: str) -> bool:
    expected = SCALAR_TYPES[type_name]
    if expected is float:
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return type(value) is expected


def _validate_hint(name: str, field: dict[str, Any], hint: dict[str, Any]) -> None:
    type_name = field["type"]
    for key in ("title", "description", "pattern"):
        if key in hint and not isinstance(hint[key], str):
            raise AnalysisIssue(f"Parameter hint '{name}.{key}' must be a string", "PYTHON_PARAMETERS")
    if "pattern" in hint:
        if type_name != "string":
            raise AnalysisIssue(f"Parameter hint '{name}.pattern' requires a string parameter", "PYTHON_PARAMETERS")
        try:
            re.compile(hint["pattern"])
        except re.error as error:
            raise AnalysisIssue(f"Parameter hint '{name}.pattern' is invalid: {error}", "PYTHON_PARAMETERS") from error
    for key in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"):
        if key not in hint:
            continue
        value = hint[key]
        if type_name not in {"integer", "number"} or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise AnalysisIssue(f"Parameter hint '{name}.{key}' requires a finite numeric parameter and value", "PYTHON_PARAMETERS")
        if type_name == "integer" and not isinstance(value, int):
            raise AnalysisIssue(f"Parameter hint '{name}.{key}' must be an integer", "PYTHON_PARAMETERS")
        if key == "multipleOf" and value <= 0:
            raise AnalysisIssue(f"Parameter hint '{name}.multipleOf' must be positive", "PYTHON_PARAMETERS")
    for key in ("minLength", "maxLength"):
        if key in hint and (type_name != "string" or type(hint[key]) is not int or hint[key] < 0):
            raise AnalysisIssue(f"Parameter hint '{name}.{key}' requires a string parameter and a non-negative integer", "PYTHON_PARAMETERS")
    for key in ("enum", "examples"):
        if key not in hint:
            continue
        values = hint[key]
        if not isinstance(values, list) or (key == "enum" and not values):
            raise AnalysisIssue(f"Parameter hint '{name}.{key}' must be a {'non-empty ' if key == 'enum' else ''}list", "PYTHON_PARAMETERS")
        scalar_type = {"boolean": "bool", "integer": "int", "number": "float", "string": "str"}[type_name]
        if any(not _matches_type(value, scalar_type) for value in values):
            raise AnalysisIssue(f"Parameter hint '{name}.{key}' values must match the parameter type", "PYTHON_PARAMETERS")
    candidate = {**field, **hint}
    default = candidate["default"]
    if "enum" in candidate and default not in candidate["enum"]:
        raise AnalysisIssue(f"Default for '{name}' is not in its hinted enum", "PYTHON_PARAMETERS")
    for key, valid in (
        ("minimum", lambda value, bound: value >= bound),
        ("maximum", lambda value, bound: value <= bound),
        ("exclusiveMinimum", lambda value, bound: value > bound),
        ("exclusiveMaximum", lambda value, bound: value < bound),
    ):
        if key in candidate and not valid(default, candidate[key]):
            raise AnalysisIssue(f"Default for '{name}' violates {key}", "PYTHON_PARAMETERS")
    if "multipleOf" in candidate and not math.isclose(default % candidate["multipleOf"], 0.0, abs_tol=1e-12):
        raise AnalysisIssue(f"Default for '{name}' violates multipleOf", "PYTHON_PARAMETERS")
    if "minLength" in candidate and len(default) < candidate["minLength"]:
        raise AnalysisIssue(f"Default for '{name}' violates minLength", "PYTHON_PARAMETERS")
    if "maxLength" in candidate and len(default) > candidate["maxLength"]:
        raise AnalysisIssue(f"Default for '{name}' violates maxLength", "PYTHON_PARAMETERS")
    if "pattern" in candidate and re.search(candidate["pattern"], default) is None:
        raise AnalysisIssue(f"Default for '{name}' violates pattern", "PYTHON_PARAMETERS")


def _metadata(tree: ast.Module) -> dict[str, Any]:
    values: list[ast.AST] = []
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "__tau__" for target in node.targets):
            values.append(node.value)
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "__tau__":
            if node.value is None:
                raise _issue(node, "__tau__ requires a literal value")
            values.append(node.value)
    if len(values) > 1:
        raise _issue(values[1], "Define __tau__ only once")
    if not values:
        return {}
    value = _literal(values[0])
    if not isinstance(value, dict):
        raise _issue(values[0], "__tau__ must be a dictionary")
    unknown = set(value) - {"parameters", "dependencies"}
    if unknown:
        raise _issue(values[0], f"Unsupported __tau__ keys: {', '.join(sorted(unknown))}")
    return value


def _parameters(tree: ast.Module, metadata: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    classes = [
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "Params" and _is_frozen_dataclass(node)
    ]
    if len(classes) != 1:
        raise AnalysisIssue(
            "Define exactly one top-level @dataclass(frozen=True) named Params",
            "PYTHON_PARAMETERS",
        )
    fields: dict[str, Any] = {}
    defaults: dict[str, Any] = {}
    for statement in classes[0].body:
        if not isinstance(statement, ast.AnnAssign) or not isinstance(statement.target, ast.Name):
            continue
        if statement.value is None:
            raise _issue(statement, f"Parameter '{statement.target.id}' requires a default")
        type_name, choices = _annotation(statement.annotation)
        if statement.target.id in fields:
            raise _issue(statement, f"Define parameter '{statement.target.id}' only once")
        default = _literal(statement.value)
        if not _matches_type(default, type_name):
            raise _issue(statement.value, f"Default for '{statement.target.id}' does not match {type_name}")
        if choices is not None and default not in choices:
            raise _issue(statement.value, f"Default for '{statement.target.id}' is not in its Literal choices")
        field_schema: dict[str, Any] = {
            "type": {"bool": "boolean", "int": "integer", "float": "number", "str": "string"}[type_name],
            "default": default,
        }
        if choices is not None:
            field_schema["enum"] = choices
        fields[statement.target.id] = field_schema
        defaults[statement.target.id] = default

    hints = metadata.get("parameters", {})
    if not isinstance(hints, dict):
        raise AnalysisIssue("__tau__.parameters must be a dictionary", "PYTHON_PARAMETERS")
    unknown_fields = set(hints) - set(fields)
    if unknown_fields:
        raise AnalysisIssue(f"Parameter hints reference unknown fields: {', '.join(sorted(unknown_fields))}", "PYTHON_PARAMETERS")
    for name, hint in hints.items():
        if not isinstance(hint, dict):
            raise AnalysisIssue(f"Parameter hint '{name}' must be a dictionary", "PYTHON_PARAMETERS")
        unknown_hints = set(hint) - HINT_KEYS
        if unknown_hints:
            raise AnalysisIssue(f"Unsupported hints for '{name}': {', '.join(sorted(unknown_hints))}", "PYTHON_PARAMETERS")
        _validate_hint(name, fields[name], hint)
        fields[name].update(hint)

    return defaults, {"type": "object", "properties": fields, "additionalProperties": False}


def _imports(tree: ast.Module) -> list[ast.Import | ast.ImportFrom]:
    imports = [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]
    dynamic_import = next(
        (
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call) and _name(node.func) in {"__import__", "importlib.import_module"}
        ),
        None,
    )
    if dynamic_import is not None:
        raise _issue(
            dynamic_import,
            "Dynamic imports are unsupported; use static imports and __tau__.dependencies",
            "PYTHON_DYNAMIC_IMPORT",
        )
    return imports


def analyze_source(source: str) -> dict[str, Any]:
    """Return parameters and import nodes without executing source."""

    tree = _parse(source)
    metadata = _metadata(tree)
    defaults, schema = _parameters(tree, metadata)
    dependencies = metadata.get("dependencies", [])
    if not isinstance(dependencies, list) or any(not isinstance(path, str) for path in dependencies):
        raise AnalysisIssue("__tau__.dependencies must be a list of paths", "PYTHON_DEPENDENCIES")
    return {"defaultParameters": defaults, "jsonSchema": schema, "dependencies": dependencies, "imports": _imports(tree)}


def _canonical_relative(path: str) -> str:
    candidate = PurePosixPath(path)
    if not path or "\0" in path or candidate.is_absolute() or ".." in candidate.parts or "\\" in path:
        raise AnalysisIssue(f"Dependency path is not project-relative: {path!r}", "PYTHON_DEPENDENCIES")
    return candidate.as_posix()


def _module_candidates(current: str, node: ast.Import | ast.ImportFrom) -> tuple[list[str], bool]:
    current_path = PurePosixPath(current)
    if isinstance(node, ast.Import):
        names = [alias.name for alias in node.names]
        base: tuple[str, ...] = ()
        relative = False
    else:
        package = current_path.parent.parts if current_path.name != "__init__.py" else current_path.parent.parts
        if node.level > len(package) + 1:
            return [], True
        base = package[: len(package) - max(node.level - 1, 0)] if node.level else ()
        module = tuple(node.module.split(".")) if node.module else ()
        names = [
            name
            for alias in node.names
            for name in ([".".join(module), ".".join((*module, alias.name))] if module else [alias.name])
        ]
        relative = node.level > 0

    candidates: list[str] = []
    for name in names:
        parts = (*base, *name.split("."))
        for index in range(1, len(parts)):
            candidates.append(PurePosixPath(*parts[:index], "__init__.py").as_posix())
        candidates.extend((PurePosixPath(*parts).with_suffix(".py").as_posix(), PurePosixPath(*parts, "__init__.py").as_posix()))
    return list(dict.fromkeys(candidates)), relative


def analyze_project(workspace: Path, entry_path: str, observed: list[str] | None = None) -> dict[str, Any]:
    """Analyze one project entry and its statically resolvable local imports."""

    entry = _canonical_relative(entry_path)
    pending = [entry]
    resolved: set[str] = set()
    unresolved: set[str] = set()
    entry_analysis: dict[str, Any] | None = None
    while pending:
        relative_path = pending.pop()
        if relative_path in resolved:
            continue
        absolute = workspace / relative_path
        if not absolute.is_file():
            unresolved.add(relative_path)
            continue
        resolved.add(relative_path)
        source = absolute.read_text(encoding="utf-8")
        analysis = analyze_source(source) if relative_path == entry else {"imports": _imports(_parse(source))}
        if relative_path == entry:
            entry_analysis = analysis
            for dependency in analysis["dependencies"]:
                canonical = _canonical_relative(dependency)
                if (workspace / canonical).is_file():
                    resolved.add(canonical)
                else:
                    unresolved.add(canonical)
        for import_node in analysis["imports"]:
            candidates, relative = _module_candidates(relative_path, import_node)
            found = [candidate for candidate in candidates if (workspace / candidate).is_file()]
            pending.extend(found)
            if relative and not found:
                unresolved.add(candidates[0] if candidates else relative_path)

    if entry_analysis is None:
        raise AnalysisIssue(f"Entry file does not exist: {entry}", "PYTHON_DEPENDENCIES")
    for path in observed or []:
        canonical = _canonical_relative(path)
        if (workspace / canonical).is_file():
            resolved.add(canonical)
    return {
        "defaultParameters": entry_analysis["defaultParameters"],
        "jsonSchema": entry_analysis["jsonSchema"],
        "resolved": sorted(resolved),
        "unresolved": sorted(unresolved),
    }
