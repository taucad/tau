"""Small pytest integration for the normal GeoSpec assertion API."""

from collections.abc import Iterator

import pytest

from ._api import GeoSpecEngine


@pytest.fixture
def geospec_engine() -> Iterator[GeoSpecEngine]:
    """Create one synchronous owner-thread engine for a test."""

    engine = GeoSpecEngine()
    try:
        yield engine
    finally:
        engine.close()
