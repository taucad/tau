"""Check the pinned BRepGProp_Gauss de-virtualization edit against the actual source and prior patches."""

import hashlib
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
ASSEMBLY = Path('src/DataExchange/TKDESTEP/STEPConstruct/STEPConstruct_Assembly.cxx')
ACTOR = Path('src/DataExchange/TKDESTEP/STEPControl/STEPControl_ActorRead.cxx')
STEPCAF = Path('src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Reader.cxx')
# The header is installed into the prefix include dir, so its patched bytes are pinned too.
GAUSS_HXX = Path('src/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Gauss.hxx')
GAUSS_CXX = Path('src/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Gauss.cxx')
B2B = OCCT / 'stepcaf-early-assembly.patch'
P1C = OCCT / 'step-assembly-sharings.patch'
GAUSS = OCCT / 'brepgprop-gauss-direct-arith.patch'

APPLIED = {
    STEPCAF: '778a56e3a4f6b0d479116fd7dd885119d5584bfb932b476f170c429a02a4d8f6',
    ASSEMBLY: '9d81709657351cd7d4768d928d9501bc1e7b9058b80fdac8d04cb9b38731cc92',
    ACTOR: 'f75f55b9ab11b8bcbaed82204519de6f34c2ff1ba9ca9ab33bc5a0d096e0d0fd',
    GAUSS_HXX: '4ecd38a526d70a619b3972fede4df86ceb9a9eb7f3633877d0f357aec6d15213',
    GAUSS_CXX: '4de191aa1426665ae3d57409c02341b24ef3c80acc01ad37e2fc6fbad3fb8aa3',
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched_files(patch):
    return {line.split()[1].split('/', 1)[1] for line in patch.read_text().splitlines() if line.startswith('+++ ')}


def between(text, start, end):
    first = text.index(start)
    return text[first:text.index(end, first + len(start))]


def main():
    assert sha256(SOURCE / GAUSS_HXX) == '2dd68fb606dba46fffea2a6cbfa9b18d3784236236fe21c0c5fcc91209553cdf'
    assert sha256(SOURCE / GAUSS_CXX) == '1152dcfea90bd2dcdd56be7664f115a5860313904d3164a4398d3a0df14a486e'
    assert sha256(B2B) == '0c0f128fcdf169c4cbf478bf6017e123bf4e246d7fd4889c4a64446dc740a491'
    assert sha256(P1C) == 'cb6393aad502bcfc6d39c01fa17dc533ba0e15f4a82a3c25e797fe7c96a055c5'
    assert sha256(GAUSS) == '7ceabdea39bc8b8e8bed213e11f10e47a6c91a43cc14fe40041ffe20ac82f8ae'
    assert patched_files(GAUSS) == {str(GAUSS_HXX), str(GAUSS_CXX)}
    assert not patched_files(GAUSS) & (patched_files(B2B) | patched_files(P1C)), 'patches overlap'

    builder = (OCCT / 'build-occt.sh').read_text()
    apply_p1c = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${sharings_patch_file}"')
    apply_gauss = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${gauss_patch_file}"')
    gauss_check = builder.index('[[ "${actual_gauss_header_hash}" == "${expected_gauss_header_hash}" &&')
    assert apply_p1c < builder.index('printf \'✓ STEP sharings patch') < apply_gauss < gauss_check \
        < builder.index('cmake -S "${build_source}"')
    assert builder.index('actual_gauss_patch_hash}" == "${expected_gauss_patch_hash}"') < apply_gauss
    assert '"${actual_gauss_source_hash}" == "${expected_gauss_source_hash}" ]]' in builder
    assert '-DGEOSPEC_OCCT_GAUSS_PATCH_SHA256:STRING="${expected_gauss_patch_hash}"' in builder
    for pin in ('expected_gauss_patch_hash="7ceabdea39bc8b8e8bed213e11f10e47a6c91a43cc14fe40041ffe20ac82f8ae"',
                f'expected_gauss_header_hash="{APPLIED[GAUSS_HXX]}"',
                f'expected_gauss_source_hash="{APPLIED[GAUSS_CXX]}"'):
        assert pin in builder, pin

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for rel in APPLIED:
            target = temp / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / rel).read_bytes())
        for patch in (B2B, P1C, GAUSS):
            subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(patch)], check=True)
        assert not list(temp.rglob('*.orig')) and not list(temp.rglob('*.rej'))
        for rel, digest in APPLIED.items():
            assert sha256(temp / rel) == digest, rel

        header = (temp / GAUSS_HXX).read_text()
        source = (temp / GAUSS_CXX).read_text()
        for text in (header, source):
            assert 'std::function' not in text and 'GaussFunc' not in text
        assert 'double add(const double theA, const double theB) const;' in header
        assert 'double mult(const double theA, const double theB) const;' in header
        assert 'bool      myIsInfinite;' in header
        assert 'myIsInfinite(false)' in between(source, 'BRepGProp_Gauss::BRepGProp_Gauss(const GaussType theType)', '\n}\n')
        add = between(source, 'inline double BRepGProp_Gauss::add(', '\n}\n')
        mult = between(source, 'inline double BRepGProp_Gauss::mult(', '\n}\n')
        assert 'return myIsInfinite ? ::AddInf(theA, theB) : ::Add(theA, theB);' in add
        assert 'return myIsInfinite ? ::MultInf(theA, theB) : ::Mult(theA, theB);' in mult
        bounds = between(source, 'void BRepGProp_Gauss::checkBounds(', '\n}\n')
        assert 'myIsInfinite = true;' in bounds and 'add ' not in bounds and 'mult ' not in bounds

    print('BRepGProp_Gauss: pinned patch after B2b/P1c; applied hashes, ordering and guards pass')


if __name__ == '__main__':
    main()
