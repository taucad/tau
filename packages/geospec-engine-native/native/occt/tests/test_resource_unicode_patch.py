"""Check the pinned Resource_Unicode CJK removal against the actual source and prior patches."""

import hashlib
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
UNICODE = Path('src/FoundationClasses/TKernel/Resource/Resource_Unicode.cxx')
PRIOR = [OCCT / name for name in ('stepcaf-early-assembly.patch', 'step-assembly-sharings.patch',
                                  'brepgprop-gauss-direct-arith.patch', 'step-read-only-controllers.patch')]
NO_CJK = OCCT / 'resource-unicode-no-cjk.patch'
APPLIED = 'd69fa6c514111129c494ac54c2fd3d9b36d9d2d27faee7f17a8d1216bc06abb1'
CJK_CONVERTERS = ('ConvertSJISToUnicode(', 'ConvertEUCToUnicode(', 'ConvertGBToUnicode(', 'ConvertBig5ToUnicode(',
                  'ConvertGBKToUnicode(', 'ConvertUnicodeToSJIS(', 'ConvertUnicodeToEUC(', 'ConvertUnicodeToGB(')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched_files(patch):
    return {line.split()[1].split('/', 1)[1] for line in patch.read_text().splitlines() if line.startswith('+++ ')}


def between(text, start, end):
    first = text.index(start)
    return text[first:text.index(end, first + len(start))]


def main():
    assert sha256(SOURCE / UNICODE) == '28709ffef656cc908a69bfa087dcaa50d7e997b20ab6fbd5ef47bfbd2e2c85d7'
    assert sha256(NO_CJK) == '7127027140614d0cf1c8715a4858df45931babba4b0ab4537323b3188a7fd641'
    assert patched_files(NO_CJK) == {str(UNICODE)}
    assert not patched_files(NO_CJK) & set().union(*map(patched_files, PRIOR)), 'patches overlap'

    builder = (OCCT / 'build-occt.sh').read_text()
    apply_read_only = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${read_only_patch_file}"')
    apply_no_cjk = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${no_cjk_patch_file}"')
    assert apply_read_only < apply_no_cjk < builder.index('cmake -S "${build_source}"')
    assert builder.index('actual_no_cjk_patch_hash}" == "${expected_no_cjk_patch_hash}"') < apply_no_cjk
    assert apply_no_cjk < builder.index('[[ "${actual_no_cjk_source_hash}" == "${expected_no_cjk_source_hash}" ]]')
    assert '-DGEOSPEC_OCCT_RESOURCE_UNICODE_PATCH_SHA256:STRING="${expected_no_cjk_patch_hash}"' in builder
    for pin in ('expected_no_cjk_patch_hash="7127027140614d0cf1c8715a4858df45931babba4b0ab4537323b3188a7fd641"',
                f'expected_no_cjk_source_hash="{APPLIED}"'):
        assert pin in builder, pin

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        target = temp / UNICODE
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((SOURCE / UNICODE).read_bytes())
        subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(NO_CJK)], check=True)
        assert not list(temp.rglob('*.orig')) and not list(temp.rglob('*.rej'))
        assert sha256(target) == APPLIED

        text = target.read_text()
        pristine = (SOURCE / UNICODE).read_text()
        to_unicode = between(text, 'void Resource_Unicode::ConvertFormatToUnicode(const Resource_FormatType', '\n}\n')
        from_unicode = between(text, 'bool Resource_Unicode::ConvertUnicodeToFormat(const Resource_FormatType', '\n}\n')
        # The format switches no longer reach a CJK converter, so its tables are never linked; every CJK
        # format throws instead of silently converting to something else.
        for switch, formats in ((to_unicode, ('SJIS', 'EUC', 'GB', 'Big5', 'GBK')), (from_unicode, ('SJIS', 'EUC', 'GB'))):
            assert not any(name in switch for name in CJK_CONVERTERS)
            assert switch.count('CJK code pages are not built")') == 1
            for name in formats:
                assert switch.count(f'case Resource_FormatType_{name}:') == 1, name
        # UTF-8, ANSI and the ISO 8859 / Windows code pages keep their pristine conversions.
        for case in ('case Resource_FormatType_UTF8: {', 'case Resource_FormatType_ANSI: {',
                     'case Resource_FormatType_CP1250:', 'case Resource_FormatType_iso8859_1:'):
            assert between(to_unicode, case, 'break;') == between(
                between(pristine, 'void Resource_Unicode::ConvertFormatToUnicode(const Resource_FormatType', '\n}\n'),
                case, 'break;'), case
        # The converters themselves stay defined, so the public API still links.
        assert all(f'Resource_Unicode::{name}' in text for name in CJK_CONVERTERS)

    print('Resource_Unicode: pinned patch after STEP read-only; applied hash, switch and kept-page guards pass')


if __name__ == '__main__':
    main()
