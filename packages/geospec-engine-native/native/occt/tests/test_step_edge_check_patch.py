"""Check the pinned STEP edge-curve semantic-check edit against the actual source and prior patches."""

import hashlib
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
EDGE_CURVE = Path('src/DataExchange/TKDESTEP/RWStepShape/RWStepShape_RWEdgeCurve.cxx')
PRIOR = [OCCT / name for name in ('shape-fix-outer-edge.patch', 'stepcaf-early-assembly.patch',
                                  'step-assembly-sharings.patch', 'brepgprop-gauss-direct-arith.patch')]
EDGE_CHECK = OCCT / 'step-edge-curve-check-sharing.patch'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched_files(patch):
    return {line.split()[1].split('/', 1)[1] for line in patch.read_text().splitlines() if line.startswith('+++ ')}


def between(text, start, end):
    first = text.index(start)
    return text[first:text.index(end, first + len(start))]


def main():
    assert sha256(SOURCE / EDGE_CURVE) == 'bbc84b6408e9ea05ec5b73560e25a4456172f780987e2765dad52e95694f154c'
    assert sha256(EDGE_CHECK) == '86ed044bdfccd9facd56695d9492e6db85cb5b83b9cd6e25b4f09a7a5a98efe3'
    assert patched_files(EDGE_CHECK) == {str(EDGE_CURVE)}
    assert not patched_files(EDGE_CHECK) & set().union(*map(patched_files, PRIOR)), 'patches overlap'

    builder = (OCCT / 'build-occt.sh').read_text()
    apply_gauss = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${gauss_patch_file}"')
    apply_edge = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${edge_check_patch_file}"')
    assert apply_gauss < apply_edge < builder.index('cmake -S "${build_source}"')
    assert apply_edge < builder.index('[[ "${actual_edge_check_source_hash}" == "${expected_edge_check_source_hash}" ]]')
    assert '-DGEOSPEC_OCCT_STEP_EDGE_CHECK_PATCH_SHA256:STRING="${expected_edge_check_patch_hash}"' in builder
    for pin in ('expected_edge_check_patch_hash="86ed044bdfccd9facd56695d9492e6db85cb5b83b9cd6e25b4f09a7a5a98efe3"',
                'expected_edge_check_source_hash="055ae30f6718f0f2aeffd3dfa0c8b8c9d99a8eb35c8c27aad70484e9a5fdf244"'):
        assert pin in builder, pin

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        target = temp / EDGE_CURVE
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((SOURCE / EDGE_CURVE).read_bytes())
        subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(EDGE_CHECK)], check=True)
        assert not list(temp.rglob('*.orig')) and not list(temp.rglob('*.rej'))
        assert sha256(target) == '055ae30f6718f0f2aeffd3dfa0c8b8c9d99a8eb35c8c27aad70484e9a5fdf244'

        orientation = between(target.read_text(), 'bool GetFaceBoundOrientation(', '\n}\n')
        # Only the loop's IsShared is replaced; a null loop still returns true, and the
        # oriented-edge test and face-bound lookup are unchanged.
        assert 'theShareTool.IsShared(anEdgeLoop)' not in orientation and orientation.count('if (anEdgeLoop.IsNull())') == 1
        assert orientation.count('theShareTool.IsShared(theOrientedEdge)') == 1
        assert 'GetSharing<StepShape_FaceBound>(anEdgeLoop, theShareTool)' in orientation

    print('STEP edge check: pinned patch after Gauss; applied hash and predicate guards pass')


if __name__ == '__main__':
    main()
