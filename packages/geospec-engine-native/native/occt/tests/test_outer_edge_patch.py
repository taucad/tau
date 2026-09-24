"""Compile the pinned repair loop head against a mutating wire model."""

from pathlib import Path
import hashlib
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[5]
OCCT = ROOT / 'packages/geospec-engine-native/native/occt'
REL = Path('src/ModelingAlgorithms/TKShHealing/ShapeFix/ShapeFix_IntersectionTool.cxx')
ORIGINAL = ROOT / 'node_modules/.cache/geospec-engine-native/sources/occt' / REL
PATCH = OCCT / 'shape-fix-outer-edge.patch'
EXPECTED_SOURCE = '5f9fd68cec0ef95eeff9e20090374964f2b1aca37e43d31048b57248745c305a'
EXPECTED_PATCH = 'e01565c2c9569c4dd8e2f849ac98987f4e0e74d142035c85c3ba1e1a97cb4279'
EXPECTED_RESULT = '5b259d58f50501568cba43b931afa67f8ecf531d1ecfe93d559e294f8d33f8ba'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def loop_head(source):
    start = source.index('  for (int num1 = 1; num1 < sewd->NbEdges() && NbSplit < 30; num1++)')
    end = source.index('      if (edge1.IsSame(edge2))', start)
    return source[start:end].replace('TopoDS_Edge', 'int')


def harness(source):
    return '''#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>
struct Wire {
  std::vector<int> edges;
  mutable int cursor = 1, lookups = 0, steps = 0;
  int NbEdges() const { return int(edges.size()); }
  int Edge(int rank) const {
    steps += std::abs(rank - cursor);
    cursor = rank;
    ++lookups;
    return edges.at(rank - 1);
  }
};
int main(int argc, char** argv) {
  std::string mode = argc > 1 ? argv[1] : "plain";
  Wire wire;
  for (int i = 1; i <= 16; ++i) wire.edges.push_back(i);
  Wire* sewd = &wire;
  int NbSplit = 0, NbCut = 0, nbReplaced = 0, NbRemoved = 0;
  bool mutated = false;
''' + loop_head(source) + '''
      std::cout << num1 << ',' << num2 << ':' << edge1 << ',' << edge2 << '\\n';
      if (!mutated && num1 == 1 && num2 == 3) {
        if (mode == "cut") { wire.edges[0] = 101; ++NbCut; }
        if (mode == "split") {
          wire.edges.insert(wire.edges.begin() + num2, 102);
          ++NbSplit;
          --num2; // the pinned repair revisits the changed pair
        }
        if (mode == "replace") { wire.edges[0] = 103; ++nbReplaced; }
        if (mode == "remove") {
          wire.edges.erase(wire.edges.begin() + 4);
          wire.edges.erase(wire.edges.begin());
          NbRemoved += 2;
        }
        mutated = true;
      }
    }
  }
  std::cout << "lookups=" << wire.lookups << ",steps=" << wire.steps << '\\n';
}
'''


def main():
    assert sha256(ORIGINAL) == EXPECTED_SOURCE
    assert sha256(PATCH) == EXPECTED_PATCH
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        target = tmp / REL
        target.parent.mkdir(parents=True)
        target.write_bytes(ORIGINAL.read_bytes())
        subprocess.run(['patch', '-t', '-F', '0', '-p1', '-d', str(tmp), '-i', str(PATCH)], check=True)
        assert sha256(target) == EXPECTED_RESULT
        binaries = []
        for name, text in [('before', ORIGINAL.read_text()), ('after', target.read_text())]:
            cpp, binary = tmp / f'{name}.cpp', tmp / name
            cpp.write_text(harness(text))
            subprocess.run(['c++', '-std=c++17', '-o', str(binary), str(cpp)], check=True)
            binaries.append(binary)
        for mode in ['plain', 'cut', 'split', 'replace', 'remove']:
            results = [subprocess.check_output([str(binary), mode], text=True).splitlines()
                       for binary in binaries]
            assert results[0][:-1] == results[1][:-1], f'{mode}: pair/edge trace changed'
            expected_pair = {
                'cut': '1,4:101,4',
                'split': '1,4:1,102',
                'replace': '1,4:103,4',
                'remove': '1,4:2,6',
            }.get(mode)
            if expected_pair:
                assert expected_pair in results[1], f'{mode}: mutation was not observed'
            before, after = [int(lines[-1].split('steps=')[1]) for lines in results]
            if mode == 'plain':
                assert after < before, 'unmutated wire retained alternating cursor walk'
            print(f'{mode}: same {len(results[0]) - 1} pairs; cursor steps {before} -> {after}')


if __name__ == '__main__':
    main()
