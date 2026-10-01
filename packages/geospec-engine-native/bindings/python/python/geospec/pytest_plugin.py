"""Small pytest integration for the normal GeoSpec assertion API."""

from collections.abc import Callable, Iterator

import pytest

from ._api import GeoSpecEngine
from ._model import _ModelScope, _active_scope


@pytest.fixture
def geospec_engine_factory(pytestconfig: pytest.Config) -> Callable[[], GeoSpecEngine]:
    """Override this fixture once in conftest.py to configure the rooted host."""

    return lambda: GeoSpecEngine(model_root=str(pytestconfig.rootpath))


@pytest.fixture(autouse=True)
def _geospec_scope(geospec_engine_factory: Callable[[], GeoSpecEngine]) -> Iterator[_ModelScope]:
    """Bind a lazy test scope; tests without geometry never initialize an engine."""

    scope = _ModelScope(geospec_engine_factory)
    token = _active_scope.set(scope)
    try:
        yield scope
    finally:
        _active_scope.reset(token)
        scope.close()


@pytest.fixture
def geospec_engine(_geospec_scope: _ModelScope) -> GeoSpecEngine:
    """The same synchronous engine used by this test's canonical load_model."""

    return _geospec_scope.get_engine()
