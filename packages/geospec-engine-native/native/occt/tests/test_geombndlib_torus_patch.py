"""Check the pinned closed-form GeomBndLib_Torus patch box against the actual source and prior patches."""

import hashlib
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
TORUS = Path('src/ModelingData/TKGeomBase/GeomBndLib/GeomBndLib_Torus.cxx')
PRIOR = [OCCT / name for name in ('stepcaf-early-assembly.patch', 'step-assembly-sharings.patch',
                                  'brepgprop-gauss-direct-arith.patch', 'step-read-only-controllers.patch',
                                  'resource-unicode-no-cjk.patch')]
TORUS_PATCH = OCCT / 'geombndlib-torus-closed-form.patch'
APPLIED = 'b4c1b40fb4513f333f1c03f402ed7500c68a324670ee29f19b497ce32195f249'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched_files(patch):
    return {line.split()[1].split('/', 1)[1] for line in patch.read_text().splitlines() if line.startswith('+++ ')}


def between(text, start, end):
    first = text.index(start)
    return text[first:text.index(end, first + len(start))]


def main():
    assert sha256(SOURCE / TORUS) == '8abf9bcc6d39a97fb0f336f650384bfab8d3ea3afdf7be59e3f6cbe19eab03bf'
    assert sha256(TORUS_PATCH) == 'fd61d98c80b96ac1c131c24c96e23cce6fb9a3c65b998b4b6d11d6f4db557fb6'
    assert patched_files(TORUS_PATCH) == {str(TORUS)}
    assert not patched_files(TORUS_PATCH) & set().union(*map(patched_files, PRIOR)), 'patches overlap'

    builder = (OCCT / 'build-occt.sh').read_text()
    apply_no_cjk = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${no_cjk_patch_file}"')
    apply_torus = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${torus_patch_file}"')
    assert apply_no_cjk < apply_torus < builder.index('cmake -S "${build_source}"')
    assert builder.index('actual_torus_patch_hash}" == "${expected_torus_patch_hash}"') < apply_torus
    assert apply_torus < builder.index('[[ "${actual_torus_source_hash}" == "${expected_torus_source_hash}" ]]')
    assert '-DGEOSPEC_OCCT_TORUS_BOX_PATCH_SHA256:STRING="${expected_torus_patch_hash}"' in builder
    for pin in ('expected_torus_patch_hash="fd61d98c80b96ac1c131c24c96e23cce6fb9a3c65b998b4b6d11d6f4db557fb6"',
                f'expected_torus_source_hash="{APPLIED}"'):
        assert pin in builder, pin

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        target = temp / TORUS
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((SOURCE / TORUS).read_bytes())
        subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(TORUS_PATCH)], check=True)
        assert not list(temp.rglob('*.orig')) and not list(temp.rglob('*.rej'))
        assert sha256(target) == APPLIED

        text = target.read_text()
        pristine = (SOURCE / TORUS).read_text()
        bounded = between(text, 'Bnd_Box GeomBndLib_Torus::BoxOptimal(double theUMin,', '\n}\n')
        # The bounded patch box is closed form: no sampling/optimisation surface, every candidate an
        # ElSLib point, then the enlargement GeomBndLib_OtherSurface::BoxOptimal applies (tol or Confusion).
        assert 'GeomBndLib_OtherSurface anOther' not in bounded and 'anOther.BoxOptimal' not in bounded
        for fragment in ('std::atan2(aY.Coord(k), aX.Coord(k))', 'anAlpha + M_PI',
                         'std::atan2(aZ.Coord(k), aX.Coord(k) * std::cos(aU[i]) + aY.Coord(k) * std::sin(aU[i]))',
                         'aBeta + M_PI', 'M_PI / 2., -M_PI / 2.', 'std::acos(-aMajor / aMinor)',
                         'ElCLib::InPeriod(theT, theLo, theLo + 2. * M_PI)',
                         'ElSLib::TorusValue(anU, aVal, aTorus.Position(), aMajor, aMinor)',
                         'aBox.Enlarge(std::max(theTol, Precision::Confusion()));'):
            assert bounded.count(fragment) == 1, fragment
        # Candidate arrays hold 2 + 3 * 2 u values and 4 + 3 * 8 * 2 + 2 v values.
        assert 'double aU[8]' in bounded and 'double aV[56]' in bounded
        # The whole-surface box and the plain boxes keep their pristine implementations.
        for start in ('Bnd_Box GeomBndLib_Torus::BoxOptimal(double theTol) const', 'Bnd_Box GeomBndLib_Torus::Box(double theTol) const',
                      'Bnd_Box GeomBndLib_Torus::Box(double theUMin,'):
            assert between(text, start, '\n}\n') == between(pristine, start, '\n}\n'), start

    print('GeomBndLib_Torus: pinned patch after Resource_Unicode; applied hash, closed-form and kept-box guards pass')


if __name__ == '__main__':
    main()
