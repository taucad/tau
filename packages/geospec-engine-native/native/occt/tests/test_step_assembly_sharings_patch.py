"""Check the pinned STEP assembly-sharings edit against the actual source and prior patches."""

import hashlib
from pathlib import Path
import random
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
ASSEMBLY = Path('src/DataExchange/TKDESTEP/STEPConstruct/STEPConstruct_Assembly.cxx')
ACTOR = Path('src/DataExchange/TKDESTEP/STEPControl/STEPControl_ActorRead.cxx')
STEPCAF = Path('src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Reader.cxx')
B2B = OCCT / 'stepcaf-early-assembly.patch'
P1C = OCCT / 'step-assembly-sharings.patch'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patched_files(patch):
    return {line.split()[1].split('/', 1)[1] for line in patch.read_text().splitlines() if line.startswith('+++ ')}


def between(text, start, end):
    first = text.index(start)
    return text[first:text.index(end, first + len(start))]


def old_nauo(reps, sharings):
    """Pinned TransferEntity(NAUO): full walk per rep, first PD, last SRR."""
    pd = srr = None
    for rep in reps:
        for kind, value in sharings.get(rep, []):
            if kind == 'SDR' and pd is None:
                pd = value
            elif kind == 'SRR':
                srr = value
    return pd, srr


def new_nauo(reps, sharings):
    """Patched: early exit once PD is found; SRR resolved afterwards over every rep."""
    pd, searched = None, []
    for rep in reps:
        searched.append(rep)
        if pd is not None or rep not in sharings:
            continue
        for kind, value in sharings[rep]:
            if pd is not None:
                break
            if kind == 'SDR':
                pd = value
    srr = None
    for rep in searched:
        for kind, value in sharings.get(rep, []):
            if kind == 'SRR':
                srr = value
    return pd, srr


def main():
    assert sha256(SOURCE / ASSEMBLY) == 'bae8b667c2a9f411ed282368c81e35cafcef22d6b47e3ca4810f04d06ba8b799'
    assert sha256(SOURCE / ACTOR) == '79f8bf12436c79ce51798da5f2c8303eea213745099135b4c21875fed687eaf3'
    assert sha256(B2B) == '0c0f128fcdf169c4cbf478bf6017e123bf4e246d7fd4889c4a64446dc740a491'
    assert sha256(P1C) == 'cb6393aad502bcfc6d39c01fa17dc533ba0e15f4a82a3c25e797fe7c96a055c5'
    assert patched_files(P1C) == {str(ASSEMBLY), str(ACTOR)}
    assert not patched_files(P1C) & patched_files(B2B), 'patches overlap'

    builder = (OCCT / 'build-occt.sh').read_text()
    apply_b2b = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${stepcaf_patch_file}"')
    apply_p1c = builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${sharings_patch_file}"')
    assert apply_b2b < apply_p1c < builder.index('cmake -S "${build_source}"')
    assert apply_p1c < builder.index('[[ "${actual_sharings_assembly_hash}" == "${expected_sharings_assembly_hash}" &&')
    assert '-DGEOSPEC_OCCT_STEP_SHARINGS_PATCH_SHA256:STRING="${expected_sharings_patch_hash}"' in builder
    for pin in ('expected_sharings_patch_hash="cb6393aad502bcfc6d39c01fa17dc533ba0e15f4a82a3c25e797fe7c96a055c5"',
                'expected_sharings_assembly_hash="9d81709657351cd7d4768d928d9501bc1e7b9058b80fdac8d04cb9b38731cc92"',
                'expected_sharings_actor_hash="f75f55b9ab11b8bcbaed82204519de6f34c2ff1ba9ca9ab33bc5a0d096e0d0fd"'):
        assert pin in builder, pin

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for rel in (ASSEMBLY, ACTOR, STEPCAF):
            target = temp / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / rel).read_bytes())
        for patch in (B2B, P1C):
            subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(patch)], check=True)
        assert not list(temp.rglob('*.orig')) and not list(temp.rglob('*.rej'))

        assert sha256(temp / STEPCAF) == '778a56e3a4f6b0d479116fd7dd885119d5584bfb932b476f170c429a02a4d8f6'
        assert sha256(temp / ASSEMBLY) == '9d81709657351cd7d4768d928d9501bc1e7b9058b80fdac8d04cb9b38731cc92'
        assert sha256(temp / ACTOR) == 'f75f55b9ab11b8bcbaed82204519de6f34c2ff1ba9ca9ab33bc5a0d096e0d0fd'

        assembly = (temp / ASSEMBLY).read_text()
        check = between(assembly, 'bool STEPConstruct_Assembly::CheckSRRReversesNAUO(', '\n}\n')
        assert 'Sharings(' not in check and check.count('sdrProductDefinition(theGraph, rep') == 2
        # The exact-type SDR test is kept: this is a shared function with four callers.
        helper = between(assembly, 'sdrProductDefinition(\n', '\n}\n')
        assert 'enti->DynamicType() == tSDR' in helper and 'SDR->UsedRepresentation() == theRep' in helper

        actor = (temp / ACTOR).read_text()
        nauo = between(actor, 'STEPControl_ActorRead::TransferEntity(\n  const occ::handle<StepRepr_NextAssemblyUsageOccurrence>& NAUO,',
                       '  TP->Bind(NAUO, shbinder);')
        assert 'TP->Graph().Sharings(rep)' not in nauo
        # Every searched rep feeds the SRR fallback, including reps after PD was found.
        assert nauo.index('aSRRReps.Append(rep);') < nauo.index('if (!PD.IsNull() || aRepNum <= 0)')
        assert nauo.index('iatrsf = ComputeSRRWT(RR, TP, Trsf, theLocalFactors);') < nauo.index('aSRRReps.Append(rep);')
        assert nauo.index('for (int i = 1; theResult.IsNull() && i <= aSRRReps.Length(); i++)') \
            < nauo.index('if (theResult.IsNull() && !SRR.IsNull())')
        transform = between(actor, 'bool STEPControl_ActorRead::ComputeTransformation(', '\n}\n')
        assert 'ItemsValue(i)' not in transform and transform.count('->Value(i)') == 2

    # Early exit plus a deferred last-SRR pass selects the pinned walk's PD and SRR.
    rng = random.Random(20260925)
    for _ in range(20_000):
        sharings = {rep: [(rng.choice(('SDR', 'SRR', 'OTHER')), rng.choice((None, 0, 1, 2))) for _ in range(rng.randrange(6))]
                    for rep in range(4) if rng.random() < 0.85}
        reps = [rng.randrange(4) for _ in range(rng.randrange(5))]
        assert old_nauo(reps, sharings) == new_nauo(reps, sharings), (reps, sharings)

    print('STEP sharings: pinned patch after B2b; applied hashes, guards and 20,000 selection trials pass')


if __name__ == '__main__':
    main()
