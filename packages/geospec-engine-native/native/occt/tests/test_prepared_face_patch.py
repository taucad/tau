"""Verify the pinned, private FE/EF preparation patch without building OCCT."""

import hashlib
import os
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = Path(os.environ.get(
    'GEOSPEC_OCCT_SOURCE',
    ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt',
))
PATCH = OCCT / 'brepextrema-prepared-face-cf.patch'
RELATIVE = Path('src/ModelingAlgorithms/TKTopAlgo/BRepExtrema')
PRISTINE = {
    'BRepExtrema_ExtCF.hxx': '5fc1457aa0e91ccde3b47a311210b0758b30767d9d5c50aae1ffdb27432ee069',
    'BRepExtrema_ExtCF.cxx': 'c2e1f2dbe1adf6ccc2305f053031bc7b64cb27d5727491c019bfbd6f4e4ea28c',
    'BRepExtrema_DistanceSS.hxx': 'e62c1b4c96f0301660aefdf46f5ccb7097b6bf98ced4895507ae9eb0112a7db0',
    'BRepExtrema_DistanceSS.cxx': '3f2ddf1de7442a0f05fc1008580f1eb83c586e1fcd42080bd6c8886068dfa250',
}
PATCHED = {
    'BRepExtrema_ExtCF.hxx': '135f3a12f1cd314a30c50da1af199fa460b623e8a628063d1a9e5e28f751cf36',
    'BRepExtrema_ExtCF.cxx': '684ed21d657c155479c4a9f62db6379dd3a779dd3b576a2b1dd6cffcc921f629',
    'BRepExtrema_DistanceSS.hxx': 'c39b719bc3a8dc3a3daae08d6fe99ef0206d84158b55e2facc5a97dd224f3e24',
    'BRepExtrema_DistanceSS.cxx': 'e4f4a0afe95be5abb2a6f7ee090d3be93f8f417355a6ee085b2e949cf7d209fa',
}
PATCH_SHA = 'e187b63ee9962e4d285d99cb0114b4f14643d6d7c385f417c9b3c164bb90f8e5'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    assert digest(PATCH) == PATCH_SHA
    builder = (OCCT / 'build-occt.sh').read_text()
    assert f'expected_prepared_face_patch_hash="{PATCH_SHA}"' in builder
    assert builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${torus_patch_file}"') < builder.index(
        'patch -t -F 0 -p1 -d "${build_source}" -i "${prepared_face_patch_file}"') < builder.index(
            'cmake -S "${build_source}"')
    assert '-DGEOSPEC_OCCT_PREPARED_FACE_PATCH_SHA256:STRING="${expected_prepared_face_patch_hash}"' in builder
    assert {line.split()[1].split('/', 1)[1] for line in PATCH.read_text().splitlines()
            if line.startswith('+++ ')} == {str(RELATIVE / name) for name in PRISTINE}

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        target = root / RELATIVE
        target.mkdir(parents=True)
        for name, expected in PRISTINE.items():
            source = SOURCE / RELATIVE / name
            assert digest(source) == expected, name
            (target / name).write_bytes(source.read_bytes())
        subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(PATCH)], check=True)
        assert not list(root.rglob('*.rej')) and not list(root.rglob('*.orig'))
        for name, expected in PATCHED.items():
            assert digest(target / name) == expected, name
            assert f'expected_{"extcf" if "ExtCF" in name else "distancess"}_{"header" if name.endswith("hxx") else "source"}_hash="{expected}"' in builder

        extcf = (target / 'BRepExtrema_ExtCF.cxx').read_text()
        cold = extcf[extcf.index('if (myPrepared->mySurface.IsNull())'):extcf.index('if (!BRep_Tool::IsGeometric(E))', extcf.index('if (myPrepared->mySurface.IsNull())') + 60)]
        steps = ['BRepAdaptor_Surface Surf(F)', 'Surf.GetType() == GeomAbs_OtherSurface',
                 'BRepAdaptor_Curve aC(E)', 'myHS = new BRepAdaptor_Surface(Surf)',
                 'const double faceTolerance = BRep_Tool::Tolerance(F)',
                 'aTolC = aC.Resolution(aTolC)', 'BRepTools::UVBounds(F, U1, U2, V1, V2)',
                 'myExtCS.Initialize(*myHS', 'myPrepared->mySurface = myHS']
        assert [cold.index(step) for step in steps] == sorted(cold.index(step) for step in steps)
        assert 'myFace.IsEqual(theFace)' in extcf
        assert 'myRequestTolerance == theRequestTolerance' in extcf

    print('BRepExtrema prepared-face patch: pinned source, strict application and cold-order guards pass')


if __name__ == '__main__':
    main()
