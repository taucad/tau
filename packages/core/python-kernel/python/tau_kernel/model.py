"""Run a project's `main(params)` entry once per build, with its parameters validated and its modules fresh."""

from __future__ import annotations

import asyncio
import dataclasses
import importlib
import importlib.util
import math
import os
import re
import sys
import types
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from tau_kernel.analyzer import ParameterSchemaIdentity, analyze_project

_LOADED_PROJECT_MODULES: dict[str, str] = {}
"""Project modules the previous build imported, as module name -> project-relative path.

Memoised for the life of the interpreter so no build walks `sys.modules` (2,803 entries, 0.5 ms
per walk). Every build evicts exactly these names and then re-records what it actually imported,
so an edited project module is always dropped before it is re-imported. Only `load_entry` puts
project modules into `sys.modules`, which is what makes the memo complete.
"""


def _record_project_modules(workspace: Path, known: frozenset[str]) -> None:
    """Refresh the memo from the modules imported since `known` was captured. `workspace` is resolved."""

    prefix = os.path.join(str(workspace), "")
    _LOADED_PROJECT_MODULES.clear()
    for name in sys.modules.keys() - known:
        file_name = getattr(sys.modules[name], "__file__", None)
        if not isinstance(file_name, str):
            continue
        if not os.path.isabs(file_name):
            file_name = os.path.abspath(file_name)
        if file_name.startswith(prefix) and file_name.endswith(".py") and os.path.basename(file_name) != ".py":
            _LOADED_PROJECT_MODULES[name] = os.path.relpath(file_name, workspace).replace(os.sep, "/")


def evict_project_modules() -> None:
    """Drop the project modules the previous build imported, so the next build imports their current source."""

    for name in _LOADED_PROJECT_MODULES:
        sys.modules.pop(name, None)
    _LOADED_PROJECT_MODULES.clear()
    importlib.invalidate_caches()


def validate_parameters(parameters: Any, schema: dict[str, Any]) -> dict[str, Any]:
    """Merge `parameters` over the analyzer's defaults and check each against its JSON Schema field."""

    if not isinstance(parameters, dict):
        raise TypeError("Parameters must be an object")
    properties = schema["properties"]
    unknown = set(parameters) - set(properties)
    if unknown:
        raise TypeError(f"Unknown parameters: {', '.join(sorted(unknown))}")
    validated = {name: definition["default"] for name, definition in properties.items()}
    validated.update(parameters)
    for name, value in validated.items():
        definition = properties[name]
        expected = definition["type"]
        valid = {
            "boolean": type(value) is bool,
            "integer": type(value) is int,
            "number": isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value),
            "string": isinstance(value, str),
        }[expected]
        if not valid:
            raise TypeError(f"Parameter '{name}' must be {expected}")
        if "enum" in definition and value not in definition["enum"]:
            raise ValueError(f"Parameter '{name}' must be one of {definition['enum']}")
        for key, comparison in (
            ("minimum", lambda left, right: left >= right),
            ("maximum", lambda left, right: left <= right),
            ("exclusiveMinimum", lambda left, right: left > right),
            ("exclusiveMaximum", lambda left, right: left < right),
        ):
            if key in definition and not comparison(value, definition[key]):
                raise ValueError(f"Parameter '{name}' violates {key}")
        if "minLength" in definition and len(value) < definition["minLength"]:
            raise ValueError(f"Parameter '{name}' violates minLength")
        if "maxLength" in definition and len(value) > definition["maxLength"]:
            raise ValueError(f"Parameter '{name}' violates maxLength")
        if "pattern" in definition and re.search(definition["pattern"], value) is None:
            raise ValueError(f"Parameter '{name}' violates pattern")
        if "multipleOf" in definition and not math.isclose(value % definition["multipleOf"], 0.0, abs_tol=1e-12):
            raise ValueError(f"Parameter '{name}' violates multipleOf")
    return validated


@dataclasses.dataclass
class LoadedEntry:
    """One executed entry: its module, what `main(params)` returned and the analysis it ran under.

    `dependencies` holds the project modules the build imported, project-relative; it is filled when the
    `load_entry` block exits, failed builds included.
    """

    module: types.ModuleType
    result: Any
    analysis: dict[str, Any]
    dependencies: list[str] = dataclasses.field(default_factory=list)


@contextmanager
def load_entry(
    workspace: Path,
    entry_path: str,
    parameters: Any,
    *,
    identity: ParameterSchemaIdentity,
    module_prefix: str,
) -> Iterator[LoadedEntry]:
    """Import the entry under a fresh module name and call `main(Params(**parameters))`.

    The kernel converts `result` into its own objects inside the block; the entry module leaves `sys.modules`
    when the block exits, and the project modules it imported are recorded for the next build's eviction.
    """

    workspace = workspace.resolve()
    analysis = analyze_project(workspace, entry_path, identity=identity)
    validated = validate_parameters(parameters, analysis["jsonSchema"])
    evict_project_modules()
    known = frozenset(sys.modules)
    entry = workspace / entry_path
    module_name = f"{module_prefix}{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, entry)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Python entry: {entry_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    loaded: LoadedEntry | None = None
    try:
        spec.loader.exec_module(module)
        params_type = getattr(module, "Params", None)
        main = getattr(module, "main", None)
        if not isinstance(params_type, type) or not dataclasses.is_dataclass(params_type):
            raise TypeError("Params must be a dataclass")
        if not params_type.__dataclass_params__.frozen:
            raise TypeError("Params must be a frozen dataclass")
        if not callable(main):
            raise TypeError("Define a callable main(params) function")
        result = main(params_type(**validated))
        if asyncio.iscoroutine(result):
            result.close()
            raise TypeError("Async main functions are not supported")
        loaded = LoadedEntry(module=module, result=result, analysis=analysis)
        yield loaded
    finally:
        _record_project_modules(workspace, known)
        sys.modules.pop(module_name, None)
        if loaded is not None:
            loaded.dependencies = sorted(set(_LOADED_PROJECT_MODULES.values()))
