"""Run pytest's real setup/teardown paths with an injected host provider."""

import json
from importlib.metadata import entry_points
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("outcome, exit_code", [("pass", 0), ("fail", 1), ("interrupt", 2), ("setup", 1)])
def test_configured_provider_is_lazy_and_closes_exactly_once(tmp_path: Path, outcome: str, exit_code: int):
    events = tmp_path / "events.jsonl"
    (tmp_path / "conftest.py").write_text(f'''
import json
import pytest
from geospec import GeoSpecEngine
from test_canonical_loading import HostEngine

@pytest.fixture
def geospec_engine_factory():
    def create():
        native = HostEngine()
        original_close = native.close
        def close():
            original_close()
            with open({str(events)!r}, "a") as output:
                output.write(json.dumps({{"closed": native.closed, "releases": len(native.released)}}) + "\\n")
        native.close = close
        if {outcome!r} == "setup":
            native.process_request = lambda _: b'{{"result":{{}}}}'
        return GeoSpecEngine(native_engine=native, model_root={str(tmp_path)!r})
    return create
''')
    behavior = {"pass": "assert report.passed", "fail": "assert False, 'intentional failed test'", "interrupt": "raise KeyboardInterrupt()", "setup": "assert report.passed"}[outcome]
    (tmp_path / "test_consumer.py").write_text(f'''
from geospec import expect_geo, load_model

def test_no_geometry():
    pass

def test_authored_canonical_source():
    model = load_model(source=b"fixture", format="glb", source_unit="mm")
    report = expect_geo(model).to_have_bounding_box(size={{"x": 1}})
    {behavior}
''')
    discovered = any(entry.name == "geospec" and entry.value == "geospec.pytest_plugin" for entry in entry_points(group="pytest11"))
    plugin = [] if discovered else ["-p", "geospec.pytest_plugin"]
    completed = subprocess.run([sys.executable, "-B", "-m", "pytest", str(tmp_path), "-q", *plugin, "-p", "no:cacheprovider"], capture_output=True, text=True)
    assert completed.returncode == exit_code, completed.stdout + completed.stderr
    records = [json.loads(line) for line in events.read_text().splitlines()]
    assert records == [{"closed": 1, "releases": 0 if outcome == "setup" else 1}]
