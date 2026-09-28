"""Check the pinned STEP read-only controller edit against the actual source and prior patches."""

import hashlib
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
CONTROLLER = Path('src/DataExchange/TKDESTEP/STEPControl/STEPControl_Controller.cxx')
CAF_CONTROLLER = Path('src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Controller.cxx')
MODULE = Path('src/DataExchange/TKDESTEP/RWStepAP214/RWStepAP214_ReadWriteModule.cxx')
PRIOR = [OCCT / name for name in ('stepcaf-early-assembly.patch', 'step-assembly-sharings.patch',
                                  'brepgprop-gauss-direct-arith.patch')]
READ_ONLY = OCCT / 'step-read-only-controllers.patch'

PRISTINE = {
    CONTROLLER: '35d8c03058f3d71f076320912744030827ce2624606fa78c2e83b1b6ab92b302',
    CAF_CONTROLLER: '94c9ff139dfb6c85a1a8f8aa14a2b6167d0d864505d7bf70e27d4db0f01e957a',
    MODULE: 'da89a6a1e2c3e7f4acaa7477f00e04ecb73ce91022edc2edcfad4744a4587d65',
}
APPLIED = {
    CONTROLLER: '2c4c8d526918736330fe4492b4e88de903d0dd57b8cdf4078a28e15c3444a434',
    CAF_CONTROLLER: '7c97db504a8f60b4c044f4ca1ff9130736ebe3a55055db2ae0a58c789f50dfca',
    MODULE: 'fc674e922ac2ced447ed635431261dc05462f81272f3d9b69464e71abed1a0c8',
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched_files(patch):
    return {line.split()[1].split('/', 1)[1] for line in patch.read_text().splitlines() if line.startswith('+++ ')}


def between(text, start, end):
    first = text.index(start)
    return text[first:text.index(end, first + len(start))]


def main():
    for rel, digest in PRISTINE.items():
        assert sha256(SOURCE / rel) == digest, rel
    assert sha256(READ_ONLY) == '4ad740581729ddc1dfe2675db6ec3d7bda46ba42e4e9a86240d89d7453919b82'
    assert patched_files(READ_ONLY) == {str(rel) for rel in APPLIED}
    assert not patched_files(READ_ONLY) & set().union(*map(patched_files, PRIOR)), 'patches overlap'

    builder = (OCCT / 'build-occt.sh').read_text()
    apply_gauss = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${gauss_patch_file}"')
    apply_read_only = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${read_only_patch_file}"')
    assert apply_gauss < apply_read_only < builder.index('cmake -S "${build_source}"')
    assert builder.index('actual_read_only_patch_hash}" == "${expected_read_only_patch_hash}"') < apply_read_only
    assert apply_read_only < builder.index('[[ "${actual_read_only_controller_hash}" == "${expected_read_only_controller_hash}" &&')
    assert '-DGEOSPEC_OCCT_STEP_READ_ONLY_PATCH_SHA256:STRING="${expected_read_only_patch_hash}"' in builder
    for pin in ('expected_read_only_patch_hash="4ad740581729ddc1dfe2675db6ec3d7bda46ba42e4e9a86240d89d7453919b82"',
                f'expected_read_only_controller_hash="{APPLIED[CONTROLLER]}"',
                f'expected_read_only_caf_controller_hash="{APPLIED[CAF_CONTROLLER]}"',
                f'expected_read_only_module_hash="{APPLIED[MODULE]}"'):
        assert pin in builder, pin

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for rel in APPLIED:
            target = temp / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / rel).read_bytes())
        subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(READ_ONLY)], check=True)
        assert not list(temp.rglob('*.orig')) and not list(temp.rglob('*.rej'))
        for rel, digest in APPLIED.items():
            assert sha256(temp / rel) == digest, rel

        # No write actor is created, so the writer translation is never referenced; reading is unchanged.
        controller = (temp / CONTROLLER).read_text()
        constructor = between(controller, 'STEPControl_Controller::STEPControl_Controller()', '\n}\n')
        assert 'new STEPControl_ActorWrite' not in constructor and 'myAdaptorWrite' not in constructor
        read_actor = 'occ::handle<Transfer_ActorOfTransientProcess> STEPControl_Controller::ActorRead('
        assert between(controller, read_actor, '\n}\n') == between((SOURCE / CONTROLLER).read_text(), read_actor, '\n}\n')
        write = between(controller, 'IFSelect_ReturnStatus STEPControl_Controller::TransferWriteShape(', '\n}\n')
        assert 'throw Standard_NotImplemented(' in write and 'XSControl_Controller::TransferWriteShape' not in write
        caf = between((temp / CAF_CONTROLLER).read_text(), 'STEPCAFControl_Controller::STEPCAFControl_Controller()', '\n}\n')
        assert 'new ' not in caf and 'myAdaptorWrite' not in caf

        module = (temp / MODULE).read_text()
        pristine_module = (SOURCE / MODULE).read_text()
        read = 'void RWStepAP214_ReadWriteModule::ReadStep('
        assert between(module, read, '\n}\n') == between(pristine_module, read, '\n}\n'), 'reader changed'
        writer = between(module, 'void RWStepAP214_ReadWriteModule::WriteStep(', '\n#endif\n}\n')
        body = writer.split('{', 1)[1]
        assert body.index('throw Standard_NotImplemented(') < body.index('#if 0') < body.index('if (CN == 0)')
        assert module.count('#if 0') == 1 and module.endswith('#endif\n}\n')

    print('STEP read-only: pinned patch after Gauss; applied hashes, unchanged reader and write guards pass')


if __name__ == '__main__':
    main()
