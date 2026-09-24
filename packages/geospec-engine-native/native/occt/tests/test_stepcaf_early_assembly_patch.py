"""Check the pinned STEPCAF edit against the actual source and B2a patch."""

import hashlib
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
SOURCE = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt'
STEPCAF = Path('src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Reader.cxx')
SHAPE_FIX = Path('src/ModelingAlgorithms/TKShHealing/ShapeFix/ShapeFix_IntersectionTool.cxx')
B2A = OCCT / 'shape-fix-outer-edge.patch'
B2B = OCCT / 'stepcaf-early-assembly.patch'
BLOCK = '''    if (!myMap.IsBound(aRootShape))
    {
      continue;
    }

    TDF_Label aRootLab = myMap.Find(aRootShape);
    // Do not add subshapes to assembly,
    // they will be processed with corresponding Shape_Product_Definition of necessary part.
    if (ShapeTool->IsAssembly(aRootLab))
    {
      continue;
    }

'''
COLLECT = '''    // Access representation items
    NCollection_Sequence<occ::handle<StepRepr_RepresentationItem>> aReprItems;
    collectRepresentationItems(Graph, aShapeRepr, aReprItems);
'''


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expansion(text):
    start = text.index('void STEPCAFControl_Reader::ExpandSubShapes(')
    end = text.index('//=================================================================================================', start + 1)
    return text[start:end]


def main():
    assert sha256(SOURCE / STEPCAF) == '71ca22ea347c61342293bf3ff05c645c90e3d3276c5fe28a1c1ed2a3c0a66465'
    assert sha256(B2A) == 'e01565c2c9569c4dd8e2f849ac98987f4e0e74d142035c85c3ba1e1a97cb4279'
    assert sha256(B2B) == '66a654da50c40708a6b621722cb17e7cc0e925ea41c5d88af3ab717f9f8ac47e'
    builder = (OCCT / 'build-occt.sh').read_text()
    assert builder.index('diff -qr "${verification_staging}" "${GEOSPEC_OCCT_SOURCE}"') < builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${patch_file}"')
    assert builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${patch_file}"') < builder.index('patch -t -F 0 -p1 -d "${build_source}" -i "${stepcaf_patch_file}"')
    assert '-DGEOSPEC_OCCT_STEPCAF_PATCH_SHA256:STRING="${expected_stepcaf_patch_hash}"' in builder
    assert 'cmake -S "${build_source}"' in builder

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for rel in (STEPCAF, SHAPE_FIX):
            target = temp / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SOURCE / rel).read_bytes())
        for patch in (B2A, B2B):
            subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', directory, '-i', str(patch)], check=True)

        assert sha256(temp / SHAPE_FIX) == '5b259d58f50501568cba43b931afa67f8ecf531d1ecfe93d559e294f8d33f8ba'
        assert sha256(temp / STEPCAF) == '0397354846ddcd0f8c5fbdd090343f823aec1ab078bc160596239377c7037972'
        before = expansion((SOURCE / STEPCAF).read_text())
        after = expansion((temp / STEPCAF).read_text())
        assert before.count(BLOCK) == after.count(BLOCK) == 1
        assert before.count(COLLECT) == after.count(COLLECT) == 1
        assert before.index(COLLECT) < before.index(BLOCK)
        assert after.index(BLOCK) < after.index(COLLECT)
        assert before.replace(BLOCK, '', 1) == after.replace(BLOCK, '', 1), 'part path or metadata changed'
        assert after.index('if (aShapeRepr.IsNull())') < after.index(BLOCK)
        assert after.index(BLOCK) < after.index('if (aReprItems.Length() == 0)')
        assert after.index('if (!aStepModel->InternalParameters.ReadSubshapeNames)') < after.index(BLOCK)

    print('STEPCAF: B2a then B2b patches match pinned hashes; only assembly/map guard moved before collection')


if __name__ == '__main__':
    main()
