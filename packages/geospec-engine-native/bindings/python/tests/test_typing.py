"""Compile public consumer fixtures against source or the installed wheel."""

from pathlib import Path
import re
import subprocess
import sys


def test_all_matchers_typecheck_and_every_invalid_consumer_is_rejected():
    fixtures = Path(__file__).parent / "typing"
    workspace = Path(__file__).parents[5]
    command = [sys.executable, "-B", "-m", "mypy", "--follow-imports=silent", "--no-pretty", "--no-color-output", "--cache-dir", str(workspace / "node_modules/.cache/geospec-engine-native/python-mypy")]
    valid = subprocess.run([*command, str(fixtures / "valid.py")], capture_output=True, text=True)
    assert valid.returncode == 0, valid.stdout + valid.stderr
    invalid = subprocess.run([*command, str(fixtures / "invalid.py")], capture_output=True, text=True)
    assert invalid.returncode == 1, invalid.stdout + invalid.stderr
    rejected = {int(line) for line in re.findall(r"invalid\.py:(\d+): error:", invalid.stdout)}
    assert rejected == set(range(8, 18)), invalid.stdout
