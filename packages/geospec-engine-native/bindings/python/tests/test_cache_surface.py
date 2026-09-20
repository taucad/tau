from __future__ import annotations

import json
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
