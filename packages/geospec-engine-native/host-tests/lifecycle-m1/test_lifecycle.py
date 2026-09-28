import struct

from geospec import GeoSpecEngine, evaluate_geo


def mesh(seed: int) -> bytes:
    return b"GSM1" + struct.pack(
        "<II9d3I",
        3,
        1,
        seed,
        0,
        0,
        seed + 1,
        0,
        0,
        seed,
        1,
        0,
        0,
        1,
        2,
    )


def test_context_and_duplicate_close_reclaim_subject_capacity():
    with GeoSpecEngine() as engine:
        for seed in range(40):
            with engine.ingest_mesh(mesh(seed)) as subject:
                assert evaluate_geo(subject, "toHaveBoundingBox", {}).passed
            subject.close()


def test_pytest_fixture_owns_a_healthy_subject(geospec_engine: GeoSpecEngine):
    subject = geospec_engine.ingest_mesh(mesh(100))
    assert evaluate_geo(subject, "toHaveBoundingBox", {}).passed


def test_overlapping_same_identity_contexts_keep_remaining_subject_alive():
    with GeoSpecEngine() as engine:
        for seed in range(40):
            with engine.ingest_mesh(mesh(seed), slot="outer") as outer:
                with engine.ingest_mesh(mesh(seed), slot="inner") as inner:
                    assert inner.identity == outer.identity
                    assert evaluate_geo(inner, "toHaveBoundingBox", {}).passed
                assert evaluate_geo(outer, "toHaveBoundingBox", {}).passed
            outer.close()
