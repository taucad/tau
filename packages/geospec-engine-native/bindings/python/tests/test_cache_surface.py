from __future__ import annotations

import json
import os
from types import SimpleNamespace

import pytest

from geospec import GeoSpecEngine


class _Native:
    def __init__(self) -> None:
        self.flushes = 0
        self.closes = 0

    def process_request(self, _request: bytes) -> bytes:
        return json.dumps(
            {
                "requestId": "python-initialize",
                "result": {
                    "protocolVersion": 3,
                    "registryVersion": 5,
                    "canonicalProfile": "geospec-jcs-v1",
                    "configuration": {"defaultWorkUnitBudget": 180},
                    "capabilities": [],
                },
            },
            separators=(",", ":"),
        ).encode()

    def subject_handle(self, _request: bytes) -> bytes:
        raise AssertionError("no subject")

    def release_subject(self, _request: bytes) -> bytes:
        raise AssertionError("no subject")

    def flush_cache(self) -> bytes:
        self.flushes += 1
        return b'{"sealed":true}'

    def clear_overlap_cache(self) -> bool:
        return True

    def cache_producer_identity(self) -> bytes:
        return b'{"schema":"geospec-producer-build-v1"}'

    def close(self) -> None:
        self.closes += 1


def test_optional_cache_construction_and_close_are_explicit() -> None:
    calls: list[tuple[object, ...]] = []
    native = _Native()
    module = SimpleNamespace(
        Engine=lambda *args: calls.append(args) or native,
        ProtocolError=RuntimeError,
    )
    engine = GeoSpecEngine(
        cache_root="/outside/cache",
        project_root="/project",
        native_module=module,
    )
    assert calls == [("/outside/cache", "/project")]
    assert engine.clear_overlap_cache()
    assert json.loads(engine.cache_producer_identity) == {
        "schema": "geospec-producer-build-v1"
    }
    engine.close()
    engine.close()
    assert native.flushes == 1
    assert native.closes == 1
    assert engine.cache_flush_result == b'{"sealed":true}'


def test_cache_paths_are_all_or_nothing() -> None:
    with pytest.raises(ValueError, match="supplied together"):
        GeoSpecEngine(cache_root="/outside/cache", native_module=SimpleNamespace())


def test_public_execution_permits_forward_with_or_without_cache() -> None:
    calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    native = _Native()

    def create_native(*args: object, **kwargs: object) -> _Native:
        calls.append((args, kwargs))
        return native

    module = SimpleNamespace(Engine=create_native)
    with GeoSpecEngine(native_module=module):
        pass
    with GeoSpecEngine(native_module=module, execution_permits=1):
        pass
    with GeoSpecEngine(
        native_module=module,
        cache_root="/outside/cache",
        project_root="/project",
        execution_permits=1,
    ):
        pass
    assert calls == [
        ((), {}),
        ((), {"execution_permits": 1}),
        (("/outside/cache", "/project"), {"execution_permits": 1}),
    ]


def test_public_execution_permits_refuse_before_native_construction() -> None:
    calls: list[object] = []
    module = SimpleNamespace(Engine=lambda *args, **kwargs: calls.append((args, kwargs)))
    process_cpu_count = getattr(os, "process_cpu_count", os.cpu_count)
    for invalid in (0, 1.5, True, (process_cpu_count() or 1) + 1):
        with pytest.raises(ValueError, match="Execution permits must be a positive integer"):
            GeoSpecEngine(native_module=module, execution_permits=invalid)
    with pytest.raises(ValueError, match="cannot configure an injected native_engine"):
        GeoSpecEngine(native_engine=_Native(), native_module=module, execution_permits=1)
    assert calls == []
