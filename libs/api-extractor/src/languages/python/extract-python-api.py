"""Emit one Python package's public API surface as JSON on stdout.

Run by Tau's vendored CPython with ``-I`` (see ``extract-python-api.ts``). The
live objects answer what exists; the module's ``ast`` answers what the source
said, because ``repr(Align.CENTER)`` is ``<Align.CENTER>`` and a default value
has to read back as source text.

Usage: ``python3 -I extract-python-api.py <package>``
"""

from __future__ import annotations

import ast
import enum
import functools
import importlib
import importlib.metadata
import inspect
import json
import re
import sys
import types
import typing
from pathlib import Path
from typing import Any

# Kinds keyed by how the object presents itself. Modules re-exported by a star
# import (os, sys, json, ...) are not the package's API and are dropped.
_DUNDER_KEPT = {"__init__"}

_SECTION = re.compile(
    r"^(Args|Arguments|Parameters|Returns|Yields|Raises|Attributes|Example|Examples|Note|Notes|Warning|Warnings|See Also)\s*:$"
)
# Greedy `(.*)` so a parenthesised type such as `Sequence(float)` still ends at
# the colon that introduces the description.
_ARG = re.compile(r"^(\*{0,2}\w+)\s*(?:\((.*)\))?\s*:\s*(.*)$")
# pybind11 embeds `Name(self: T, x: int = 0) -> R` as the first docstring line.
_PYBIND_SIGNATURE = re.compile(r"^(?:\d+\.\s*)?(\w+)\((.*)\)(?:\s*->\s*(.+))?$")


def _sections(doc: str) -> tuple[list[str], dict[str, list[str]]]:
    """Split a Google-style docstring into its preamble and named sections."""
    preamble: list[str] = []
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in doc.splitlines():
        match = _SECTION.match(line.strip()) if line[:1] not in (" ", "\t") else None
        if match:
            current = match.group(1)
            sections.setdefault(current, [])
        elif current is None:
            preamble.append(line)
        else:
            sections[current].append(line)
    return preamble, sections


def _arg_descriptions(lines: list[str]) -> dict[str, str]:
    """Map parameter name to prose from the body of an ``Args:`` section."""
    base = min((len(line) - len(line.lstrip()) for line in lines if line.strip()), default=0)
    result: dict[str, str] = {}
    name: str | None = None
    buffer: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        match = _ARG.match(line.strip()) if len(line) - len(line.lstrip()) <= base else None
        if match:
            if name is not None:
                result[name] = " ".join(buffer).strip()
            name, buffer = match.group(1).lstrip("*"), [match.group(3)]
        else:
            buffer.append(line.strip())
    if name is not None:
        result[name] = " ".join(buffer).strip()
    return result


def _docs(obj: Any) -> tuple[dict[str, Any], dict[str, str]]:
    """Return the entry's docs payload plus per-parameter descriptions."""
    doc = inspect.getdoc(obj)
    if not doc:
        return {}, {}
    preamble, sections = _sections(doc)
    summary = next((line.strip() for line in preamble if line.strip()), "")
    body = "\n".join(preamble).strip()
    remainder = body[len(summary) :].strip() if body.startswith(summary) else body
    for title, lines in sections.items():
        if title in {"Args", "Arguments", "Parameters", "Raises"}:
            continue
        remainder = f"{remainder}\n\n{title}:\n" + "\n".join(lines).rstrip()
    throws = [line.strip() for line in sections.get("Raises", []) if line.strip()]
    payload: dict[str, Any] = {}
    if summary:
        payload["summary"] = summary
    if remainder.strip():
        payload["remarks"] = remainder.strip()
    if throws:
        payload["throws"] = throws
    args: dict[str, str] = {}
    for title in ("Args", "Arguments", "Parameters"):
        args.update(_arg_descriptions(sections.get(title, [])))
    return payload, args


@functools.lru_cache(maxsize=None)
def _definitions(path: str) -> dict[int, ast.FunctionDef | ast.AsyncFunctionDef]:
    """Index a module's function definitions by every line they can start on.

    ``code.co_firstlineno`` points at the first decorator, ``node.lineno`` at the
    ``def``; keying both makes the lookup exact without re-deriving qualnames.
    """
    try:
        tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    except (OSError, SyntaxError, ValueError, RecursionError):
        return {}
    found: dict[int, ast.FunctionDef | ast.AsyncFunctionDef] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            found[node.lineno] = node
            for decorator in node.decorator_list:
                found.setdefault(decorator.lineno, node)
    return found


def _source_node(function: Any) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    # `warnings.deprecated` and friends put their wrapper's code object in the
    # way; unwrapped, the lookup lands on the function `signature` describes.
    function = inspect.unwrap(function)
    code = getattr(function, "__code__", None)
    path = inspect.getsourcefile(function) if code is not None else None
    return _definitions(path).get(code.co_firstlineno) if path else None


def _source_text(node: ast.FunctionDef | ast.AsyncFunctionDef | None) -> tuple[dict[str, str], dict[str, str]]:
    """Source-text defaults and annotations, keyed by parameter name."""
    if node is None:
        return {}, {}
    arguments = node.args
    positional = [*arguments.posonlyargs, *arguments.args]
    defaults = {
        argument.arg: ast.unparse(default)
        for argument, default in zip(reversed(positional), reversed(arguments.defaults))
    }
    defaults.update(
        {
            argument.arg: ast.unparse(default)
            for argument, default in zip(arguments.kwonlyargs, arguments.kw_defaults)
            if default is not None
        }
    )
    every = [*positional, *arguments.kwonlyargs, arguments.vararg, arguments.kwarg]
    annotations = {
        argument.arg: ast.unparse(argument.annotation)
        for argument in every
        if argument is not None and argument.annotation is not None
    }
    return defaults, annotations


def _default_text(value: Any) -> str:
    """A default the AST could not supply, rendered so it still reads as source.

    `repr(Align.CENTER)` is `<Align.CENTER>`. Anything else whose repr is a
    `<...>` placeholder gets a constructor call rather than a lie.
    """
    if isinstance(value, enum.Enum):
        return f"{type(value).__name__}.{value.name}"
    text = repr(value)
    return text if not text.startswith("<") else f"{type(value).__name__}()"


def _annotation_text(value: Any) -> str | None:
    if value is inspect.Parameter.empty or value is None:
        return None
    if isinstance(value, str):
        return value
    return getattr(value, "__name__", None) or str(value).replace("typing.", "")


_KINDS = {
    inspect.Parameter.POSITIONAL_ONLY: "positional-only",
    inspect.Parameter.POSITIONAL_OR_KEYWORD: "positional-or-keyword",
    inspect.Parameter.KEYWORD_ONLY: "keyword-only",
    inspect.Parameter.VAR_POSITIONAL: "var-positional",
    inspect.Parameter.VAR_KEYWORD: "var-keyword",
}


def _signature(function: Any, display_name: str, descriptions: dict[str, str]) -> dict[str, Any] | None:
    """One callable shape, or ``None`` when the object exposes no signature."""
    try:
        signature = inspect.signature(function)
    except (TypeError, ValueError):
        return None
    node = _source_node(function)
    defaults, annotations = _source_text(node)
    try:
        hints = typing.get_type_hints(function)
    except Exception:  # noqa: BLE001 - a forward reference we cannot resolve is not fatal.
        hints = {}

    parameters: list[dict[str, Any]] = []
    kinds: dict[str, str] = {}
    rendered: list[str] = []
    for parameter in signature.parameters.values():
        if parameter.name in {"self", "cls"}:
            continue
        annotation = annotations.get(parameter.name) or _annotation_text(parameter.annotation)
        if annotation is None and parameter.name in hints:
            annotation = _annotation_text(hints[parameter.name])
        default = defaults.get(parameter.name)
        if default is None and parameter.default is not inspect.Parameter.empty:
            default = _default_text(parameter.default)
        entry: dict[str, Any] = {
            "name": parameter.name,
            "optional": parameter.default is not inspect.Parameter.empty,
        }
        if annotation:
            entry["type"] = annotation
        if default is not None:
            entry["defaultValue"] = default
        if parameter.kind in {inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD}:
            entry["variadic"] = True
        if parameter.name in descriptions:
            entry["description"] = descriptions[parameter.name]
        parameters.append(entry)
        kinds[parameter.name] = _KINDS[parameter.kind]
        stars = "*" * (1 if parameter.kind is inspect.Parameter.VAR_POSITIONAL else 2 if parameter.kind is inspect.Parameter.VAR_KEYWORD else 0)
        rendered.append(
            f"{stars}{parameter.name}"
            + (f": {annotation}" if annotation else "")
            + (f" = {default}" if default is not None else "")
        )

    returns = None if node is None or node.returns is None else ast.unparse(node.returns)
    if returns is None:
        returns = _annotation_text(signature.return_annotation) or _annotation_text(hints.get("return"))
    text = f"{display_name}({', '.join(rendered)})" + (f" -> {returns}" if returns else "")
    result: dict[str, Any] = {"parameters": parameters, "text": text, "parameterKinds": kinds}
    if returns:
        result["returnType"] = returns
    return result


def _pybind_signatures(obj: Any, names: set[str]) -> list[dict[str, Any]]:
    """Recover the signatures pybind11 only publishes inside its docstring.

    OCP ships no stubs and no ``__text_signature__``; ``inspect`` sees nothing.
    The docstring's leading `Name(...) -> R` lines are all there is, so they are
    carried verbatim with no parsed parameters.
    """
    doc = inspect.getdoc(obj) or ""
    texts = []
    for line in doc.splitlines():
        match = _PYBIND_SIGNATURE.match(line.strip())
        if match and match.group(1) in names:
            texts.append(line.strip().split(". ", 1)[-1])
    return [{"parameters": [], "text": text} for text in texts]


def _source(obj: Any) -> dict[str, Any] | None:
    """Package-relative declaration site. Absolute paths never leave this process."""
    try:
        path = inspect.getsourcefile(obj)
        line = inspect.getsourcelines(obj)[1]
    except (OSError, TypeError):
        return None
    if not path:
        return None
    parts = Path(path).parts
    if "site-packages" in parts:
        path = "/".join(parts[parts.index("site-packages") + 1 :])
    else:
        path = Path(path).name
    return {"file": path, "line": line}


def _callable_entry(
    obj: Any, name: str, kind: str, path: str | None, *, is_static: bool = False, display: str | None = None
) -> dict[str, Any]:
    docs, descriptions = _docs(obj)
    display = display or name
    overloads = []
    try:
        overloads = [candidate for candidate in typing.get_overloads(obj) if candidate is not obj]
    except (AttributeError, TypeError):
        overloads = []
    built = [_signature(candidate, display, _docs(candidate)[1] or descriptions) for candidate in overloads]
    signatures = [signature for signature in built if signature is not None]
    if not signatures:
        single = _signature(obj, display, descriptions)
        signatures = [single] if single is not None else _pybind_signatures(obj, {display, name})
    kinds: dict[str, str] = {}
    for signature in signatures:
        kinds.update(signature.pop("parameterKinds", {}))
    entry: dict[str, Any] = {"name": name, "kind": kind}
    if path:
        entry["path"] = path
    if signatures:
        entry["signatures"] = signatures
    if docs:
        entry["docs"] = docs
    if is_static:
        entry["static"] = True
    source = _source(obj)
    if source:
        entry["source"] = source
    if kinds:
        entry["parameterKinds"] = kinds
    return entry


def _describe(entry: dict[str, Any], descriptions: dict[str, str]) -> None:
    """Fill in parameter prose the callable's own docstring did not supply."""
    for signature in entry.get("signatures", []):
        for parameter in signature["parameters"]:
            if "description" not in parameter and parameter["name"] in descriptions:
                parameter["description"] = descriptions[parameter["name"]]


def _members(cls: type, class_args: dict[str, str]) -> list[dict[str, Any]]:
    """Members the class itself declares. Inherited ones live on their own class."""
    path = f"{getattr(cls, '__module__', '')}.{cls.__name__}".strip(".")
    entries: list[dict[str, Any]] = []
    for name, raw in vars(cls).items():
        if name.startswith("_") and name not in _DUNDER_KEPT:
            continue
        if isinstance(raw, property):
            docs, _ = _docs(raw)
            node = _source_node(raw.fget) if raw.fget is not None else None
            entry: dict[str, Any] = {"name": name, "kind": "property", "path": path}
            if node is not None and node.returns is not None:
                entry["type"] = ast.unparse(node.returns)
            if docs:
                entry["docs"] = docs
            entries.append(entry)
            continue
        value = getattr(cls, name, None)
        if value is None or not (inspect.isroutine(value) or isinstance(value, types.MethodType)):
            continue
        kind = "constructor" if name == "__init__" else "method"
        entry = _callable_entry(
            value,
            name,
            kind,
            path,
            is_static=isinstance(raw, staticmethod),
            display=cls.__name__ if kind == "constructor" else name,
        )
        if kind == "constructor":
            # build123d documents constructor arguments on the class, and
            # `getdoc` would otherwise inherit an unrelated base's `__init__`.
            if getattr(value, "__doc__", None) is None:
                entry.pop("docs", None)
            _describe(entry, class_args)
        entries.append(entry)
    return entries


def _class_entry(cls: type, name: str) -> dict[str, Any]:
    docs, class_args = _docs(cls)
    path = getattr(cls, "__module__", None)
    if isinstance(cls, type) and issubclass(cls, enum.Enum):
        members = [{"name": member.name, "kind": "enumMember", "path": f"{path}.{name}"} for member in cls]
        entry: dict[str, Any] = {"name": name, "kind": "enum", "members": members}
    else:
        entry = {"name": name, "kind": "class", "members": _members(cls, class_args)}
    if path:
        entry["path"] = path
    if docs:
        entry["docs"] = docs
    source = _source(cls)
    if source:
        entry["source"] = source
    return entry


def _top_level(module: types.ModuleType, name: str) -> dict[str, Any] | None:
    obj = getattr(module, name)
    if isinstance(obj, types.ModuleType):
        return None
    if inspect.isclass(obj):
        return _class_entry(obj, name)
    if inspect.isroutine(obj):
        return _callable_entry(obj, name, "function", getattr(obj, "__module__", None))
    if isinstance(obj, (bool, int, float, str)):
        return {"name": name, "kind": "constant", "type": type(obj).__name__, "docs": {"summary": repr(obj)}}
    return {"name": name, "kind": "type", "type": str(obj)}


def main() -> int:
    package_name = sys.argv[1] if len(sys.argv) > 1 else "build123d"
    module = importlib.import_module(package_name)
    names = sorted({*getattr(module, "__all__", ()), *(name for name in dir(module) if not name.startswith("_"))})
    entries = []
    for name in names:
        try:
            entry = _top_level(module, name)
        except Exception as error:  # noqa: BLE001 - one hostile symbol must not lose the corpus.
            entry = {"name": name, "kind": "type", "docs": {"summary": f"Not introspectable: {error}"}}
        if entry is not None:
            category = (entry.get("path") or "").rsplit(".", 1)[-1]
            if category:
                entry["category"] = category
            entries.append(entry)
    json.dump(
        {
            "package": package_name,
            "version": importlib.metadata.version(package_name),
            "python": ".".join(str(part) for part in sys.version_info[:3]),
            "entries": entries,
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
