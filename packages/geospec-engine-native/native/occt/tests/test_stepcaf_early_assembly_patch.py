"""Check the pinned STEPCAF edit against the actual source and B2a patch."""

import hashlib
from pathlib import Path
import re
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
    collectRepresentationItems(Graph, aShapeRepr, aReprItems, anAdjacency);
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
    assert sha256(B2B) == '0c0f128fcdf169c4cbf478bf6017e123bf4e246d7fd4889c4a64446dc740a491'
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
        assert sha256(temp / STEPCAF) == '778a56e3a4f6b0d479116fd7dd885119d5584bfb932b476f170c429a02a4d8f6'
        before = expansion((SOURCE / STEPCAF).read_text())
        after = expansion((temp / STEPCAF).read_text())
        assert before.count(BLOCK) == after.count(BLOCK) == 1
        assert after.count(COLLECT) == 1
        assert after.index(BLOCK) < after.index(COLLECT)
        tail = '    NCollection_Sequence<occ::handle<StepRepr_RepresentationItem>> aMSBSeq;'
        assert before[before.index(tail):] == after[after.index(tail):], 'part expansion changed'
        assert after.index('if (aShapeRepr.IsNull())') < after.index(BLOCK)
        assert after.index(BLOCK) < after.index('if (aReprItems.Length() == 0)')
        assert after.index('if (!aStepModel->InternalParameters.ReadSubshapeNames)') < after.index(BLOCK)
        collector = (temp / STEPCAF).read_text().split('struct RepresentationAdjacency', 1)[1].split('void STEPCAFControl_Reader::ExpandSubShapes(', 1)[0]
        assert collector.count('theGraph.TypedSharings(') == 1
        assert collector.index('if (!theAdjacency.IsBound(theRepresentation))') < collector.index('theGraph.TypedSharings(')
        assert collector.index('anEntry.Items.Value(i)') < collector.index('anEntry.Children.Value(i)')
        assert 'theAdjacency.Bind(theRepresentation, anEntry);' in collector
        assert 'collectRepresentationItems(theGraph, anEntry.Children.Value(i), theItems, theAdjacency);' in collector
        assert after.index('anAdjacency;') < after.index(COLLECT)
        cached_types = re.findall(r'anReprItem->IsKind\(STANDARD_TYPE\(([^)]+)\)\)', collector)
        classifier = after.split('// Iterate over the top level representation items collecting the', 1)[1].split('// Insert intermediate OCAF Labels', 1)[0]
        accepted_types = re.findall(r'aTRepr->IsKind\(STANDARD_TYPE\(([^)]+)\)\)', classifier)
        assert cached_types == accepted_types == [
            'StepShape_ManifoldSolidBrep', 'StepShape_ShellBasedSurfaceModel'
        ]
        assert 'if (!anReprItem.IsNull()' in collector

    fixture = ROOT / 'packages/geospec-engine-native/bench/fixtures/performance-lab/generated/many-occurrences-4096.step'
    step = fixture.read_text()
    assert sha256(fixture) == 'f8a2d6dd8a99852e8d1926f35a0c11695dd12162449ba0f8760edc54124383f1'
    records = {int(n): value for n, value in re.findall(r'#(\d+)\s*=\s*(.*?);', step, re.S)}
    edges = [tuple(map(int, match.groups())) for value in records.values()
             if (match := re.search(r"REPRESENTATION_RELATIONSHIP\('','',#(\d+),#(\d+)\)", value))]
    assert len(edges) == 4096 and set(edges) == {(16412, 10)}
    assert len(re.findall(r'#\d+', records[10].split('),#', 1)[0])) == 4097
    assert len(re.findall(r'#\d+', records[16412].split('),#', 1)[0])) == 2
    assert 4096 * 4097 + 2 == 16_781_314
    assembly_items = [int(item[1:]) for item in re.findall(r'#\d+', records[10].split('),#', 1)[0])]
    part_items = [int(item[1:]) for item in re.findall(r'#\d+', records[16412].split('),#', 1)[0])]
    assert part_items == [11, 16413]
    assert all(records[item].startswith('AXIS2_PLACEMENT_3D(') for item in assembly_items)
    assert records[11].startswith('AXIS2_PLACEMENT_3D(')
    assert records[16413].startswith('MANIFOLD_SOLID_BREP(')
    accepted_prefixes = ('MANIFOLD_SOLID_BREP(', 'SHELL_BASED_SURFACE_MODEL(')
    part_relevant = sum(records[item].startswith(accepted_prefixes) for item in part_items)
    assembly_relevant = sum(records[item].startswith(accepted_prefixes) for item in assembly_items)
    assert part_relevant + 4096 * assembly_relevant == 1

    # Filtering at cache construction must preserve the full accepted sequence,
    # including interleaved types, duplicate paths, and a shared descendant.
    typed_items = {
        'root': [('PLACE', 'p0'), ('MSB', 'm0'), ('OTHER', 'o0'), ('SBSM', 's0'), ('MSB', 'm1')],
        'left': [('OTHER', 'ol'), ('MSB', 'ml')],
        'right': [('SBSM', 'sr'), ('PLACE', 'pr')],
        'shared': [('SBSM', 'ss'), ('OTHER', 'os'), ('MSB', 'ms')],
    }
    typed_children = {'root': ['left', 'right', 'left'], 'left': ['shared'],
                      'right': ['shared'], 'shared': []}
    def typed_walk(node, filter_at_cache):
        local = [item for item in typed_items[node]
                 if not filter_at_cache or item[0] in ('MSB', 'SBSM')]
        return local + [item for child in typed_children[node]
                        for item in typed_walk(child, filter_at_cache)]
    expected = [
        ('MSB', 'm0'), ('SBSM', 's0'), ('MSB', 'm1'),
        ('MSB', 'ml'), ('SBSM', 'ss'), ('MSB', 'ms'),
        ('SBSM', 'sr'), ('SBSM', 'ss'), ('MSB', 'ms'),
        ('MSB', 'ml'), ('SBSM', 'ss'), ('MSB', 'ms'),
    ]
    assert [item for item in typed_walk('root', False) if item[0] in ('MSB', 'SBSM')] == expected
    assert typed_walk('root', True) == expected

    # A shared DAG and duplicate paths must emit the same depth-first sequence.
    items = {'root': ['r'], 'left': ['l'], 'right': ['r2'], 'leaf': ['x', 'y']}
    children = {'root': ['left', 'right', 'left'], 'left': ['leaf'], 'right': ['leaf', 'leaf'], 'leaf': []}
    def walk(node, adjacency=None, depth=0):
        assert depth < 10, 'cycle still recurses instead of silently dropping an edge'
        local, outgoing = (items[node], children[node]) if adjacency is None else adjacency.setdefault(node, (items[node], children[node]))
        return local + [item for child in outgoing for item in walk(child, adjacency, depth + 1)]
    assert walk('root') == walk('root', {}) == ['r', 'l', 'x', 'y', 'r2', 'x', 'y', 'x', 'y', 'l', 'x', 'y']
    children['leaf'] = ['root']
    for adjacency in (None, {}):
        try:
            walk('root', adjacency)
        except AssertionError as error:
            assert 'cycle still recurses' in str(error)
        else:
            raise AssertionError('cycle changed traversal behavior')

    print('STEPCAF: pinned patches; 4096 filtered leaf expansions; exact types and ordered mixed/DAG/duplicate/cycle controls pass')


if __name__ == '__main__':
    main()
