"""Check the pinned closed-form GeomBndLib_Torus patch box against the actual source and prior patches."""

import hashlib
import math
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


def closed_form_box(major, minor, u_bounds, v_bounds, origin=(0., 0., 0.),
                    axes=((1., 0., 0.), (0., 1., 0.), (0., 0., 1.)), tolerance=0.):
    """Numerical counterpart of the pinned C++ candidate formula; inputs are valid gp_Torus radii."""
    x_axis, y_axis, z_axis = axes
    u_min, u_max = u_bounds
    v_min, v_max = v_bounds
    u_candidates = [u_min, u_max]
    for k in range(3):
        alpha = math.atan2(y_axis[k], x_axis[k])
        u_candidates.extend((alpha, alpha + math.pi))
    v_candidates = [v_min, v_max, math.pi / 2., -math.pi / 2.]
    for k in range(3):
        for u in u_candidates:
            beta = math.atan2(z_axis[k], x_axis[k] * math.cos(u) + y_axis[k] * math.sin(u))
            v_candidates.extend((beta, beta + math.pi))
    if minor >= major and minor > 0.:
        phi = math.acos(-major / minor)
        v_candidates.extend((phi, -phi))

    def in_period(value, lower):
        return max(lower, value + 2. * math.pi * math.ceil((lower - value) / (2. * math.pi)))

    points = []
    for u in u_candidates:
        wrapped_u = in_period(u, u_min)
        if wrapped_u > u_max:
            continue
        actual_u = u if u in u_bounds else wrapped_u
        for v in v_candidates:
            wrapped_v = in_period(v, v_min)
            if wrapped_v > v_max:
                continue
            actual_v = v if v in v_bounds else wrapped_v
            points.append(torus_point(major, minor, actual_u, actual_v, origin, axes))
    assert points, 'patch box must contain a parameter-domain corner'
    enlargement = max(tolerance, 1.e-7)  # Precision::Confusion() in pinned OCCT
    return tuple(min(point[k] for point in points) - enlargement for k in range(3)), tuple(
        max(point[k] for point in points) + enlargement for k in range(3))


def torus_point(major, minor, u, v, origin, axes):
    x_axis, y_axis, z_axis = axes
    radial = major + minor * math.cos(v)
    return tuple(origin[k] + radial * (math.cos(u) * x_axis[k] + math.sin(u) * y_axis[k])
                 + minor * math.sin(v) * z_axis[k] for k in range(3))


def check_numeric_boxes():
    full = (0., 2. * math.pi)
    for major, minor, radial, height in ((3., 1., 4., 1.), (1., 1., 2., 1.),
                                         (1., 2., 3., 2.), (0., 2., 2., 2.),
                                         (3., 0., 3., 0.)):
        low, high = closed_form_box(major, minor, full, full)
        for actual, expected in zip(low, (-radial, -radial, -height)):
            assert math.isclose(actual, expected - 1.e-7, abs_tol=1.e-12), (major, minor, low)
        for actual, expected in zip(high, (radial, radial, height)):
            assert math.isclose(actual, expected + 1.e-7, abs_tol=1.e-12), (major, minor, high)

    rotated_axes = ((1 / math.sqrt(2), 1 / math.sqrt(2), 0.),
                    (-1 / math.sqrt(6), 1 / math.sqrt(6), 2 / math.sqrt(6)),
                    (1 / math.sqrt(3), -1 / math.sqrt(3), 1 / math.sqrt(3)))
    for major, minor, u_bounds, v_bounds, origin, axes in (
        (3., 1., (5.6, 7.3), (5.7, 7.1), (0., 0., 0.), ((1., 0., 0.), (0., 1., 0.), (0., 0., 1.))),
        (1., 2., (0.4, 4.8), (1.1, 5.6), (3., -5., 7.), rotated_axes),
    ):
        low, high = closed_form_box(major, minor, u_bounds, v_bounds, origin, axes)
        sampled = [torus_point(major, minor,
                               u_bounds[0] + (u_bounds[1] - u_bounds[0]) * i / 400,
                               v_bounds[0] + (v_bounds[1] - v_bounds[0]) * j / 400, origin, axes)
                   for i in range(401) for j in range(401)]
        for k in range(3):
            sample_min = min(point[k] for point in sampled)
            sample_max = max(point[k] for point in sampled)
            assert low[k] <= sample_min and high[k] >= sample_max, (k, low, high)
            assert sample_min - low[k] < 0.001 and high[k] - sample_max < 0.001, (k, low, high)

    base_low, base_high = closed_form_box(3., 1., full, full)
    wide_low, wide_high = closed_form_box(3., 1., full, full, tolerance=0.25)
    for base, wide in zip(base_low, wide_low):
        assert math.isclose(base - wide, 0.25 - 1.e-7, abs_tol=1.e-12)
    for base, wide in zip(base_high, wide_high):
        assert math.isclose(wide - base, 0.25 - 1.e-7, abs_tol=1.e-12)


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

    check_numeric_boxes()
    print('GeomBndLib_Torus: pinned patch, numerical boxes and kept-box guards pass')


if __name__ == '__main__':
    main()
