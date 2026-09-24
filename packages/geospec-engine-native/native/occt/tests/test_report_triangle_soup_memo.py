"""Compile the real report-soup function against a small triangulation model."""

from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[5]
BRIDGE = Path('packages/geospec-engine-native/native/occt/bridge/geospec_occt_bridge.cpp')
BASE = '396afca7e2173400ed8ba716db2b9193c8a5a571'


def report_function(source):
    start = source.index('MeshData report_triangle_soup(')
    end = source.index('\nbool mapped_copy_shape(', start)
    return source[start:end]


PREFIX = r'''
#include <array>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <memory>
#include <optional>
#include <stdexcept>
#include <utility>
#include <vector>

int transforms = 0;
int visited_triangle = 0;
struct Standard_Failure : std::runtime_error { using std::runtime_error::runtime_error; };
struct gp_Trsf {
  bool mirrored = false;
  gp_Trsf VectorialPart() const { return *this; }
  double Determinant() const { return mirrored ? -1.0 : 1.0; }
};
struct gp_Pnt {
  double x, y, z;
  gp_Pnt Transformed(const gp_Trsf& transform) const {
    ++transforms;
    return {transform.mirrored ? -x + 0.125 : x + 0.125,
            y * 1.3, z - 0.0625};
  }
  double X() const { return x; }
  double Y() const { return y; }
  double Z() const { return z; }
};
struct Triangle {
  std::array<int, 3> nodes;
  void Get(int& a, int& b, int& c) const { a = nodes[0]; b = nodes[1]; c = nodes[2]; }
};
struct Poly_Triangulation {
  std::vector<gp_Pnt> nodes;
  std::vector<Triangle> triangles;
  int NbNodes() const { return int(nodes.size()); }
  int NbTriangles() const { return int(triangles.size()); }
  gp_Pnt Node(int index) const {
    if (index < 1 || index > NbNodes() || index == 5)
      throw Standard_Failure("node refused");
    return nodes.at(size_t(index - 1));
  }
  Triangle Triangle(int index) const {
    visited_triangle = index;
    return triangles.at(size_t(index - 1));
  }
};
namespace occ {
template<class T> struct handle {
  std::shared_ptr<T> value;
  bool IsNull() const { return !value; }
  T* operator->() const { return value.get(); }
};
}
struct TopLoc_Location {
  gp_Trsf transform;
  gp_Trsf Transformation() const { return transform; }
};
constexpr int TopAbs_FACE = 1, TopAbs_REVERSED = 2;
struct TopoDS_Face {
  occ::handle<Poly_Triangulation> mesh;
  gp_Trsf transform;
  int orientation = 0;
  int Orientation() const { return orientation; }
};
struct TopoDS_Shape { std::vector<TopoDS_Face> faces; };
struct TopExp_Explorer {
  const TopoDS_Shape& shape;
  size_t index = 0;
  TopExp_Explorer(const TopoDS_Shape& value, int) : shape(value) {}
  bool More() const { return index < shape.faces.size(); }
  void Next() { ++index; }
  TopoDS_Face Current() const { return shape.faces.at(index); }
};
namespace TopoDS { TopoDS_Face Face(const TopoDS_Face& face) { return face; } }
namespace BRep_Tool {
occ::handle<Poly_Triangulation> Triangulation(const TopoDS_Face& face,
                                             TopLoc_Location& location) {
  location.transform = face.transform;
  return face.mesh;
}
}
struct MeshData {
  std::vector<std::array<double, 3>> positions;
  std::vector<std::array<uint32_t, 3>> triangles;
};
'''

SUFFIX = r'''
int main(int argc, char** argv) {
  const std::string mode = argc > 1 ? argv[1] : "shared";
  auto mesh = std::make_shared<Poly_Triangulation>();
  mesh->nodes = {{0.1000000000001, -0.0, 7.0000001},
                 {1.333333333333, 2.5, -0.0},
                 {-9.123456789, 0.25, 4.75},
                 {3.5, -8.99999999, 0.001},
                 {99, 99, 99}}; // Node 5 refuses access; it is unreferenced.
  mesh->triangles = {{{1, 2, 3}}, {{1, 3, 4}}, {{2, 3, 4}}};
  if (mode == "invalid") mesh->triangles[1].nodes[2] = 6;
  if (mode == "invalid-first") mesh->triangles[0].nodes[0] = 0;
  TopoDS_Shape shape{{{occ::handle<Poly_Triangulation>{mesh},
                       gp_Trsf{mode == "mirrored"},
                       mode == "reversed" ? TopAbs_REVERSED : 0}}};
  if (mode == "two-faces")
    shape.faces.push_back({occ::handle<Poly_Triangulation>{mesh}, gp_Trsf{true}, 0});
  MeshData result;
  std::string error;
  try { result = report_triangle_soup(shape); }
  catch (const Standard_Failure& failure) { error = failure.what(); }
  std::cout << "error=" << error << ";visited_triangle=" << visited_triangle
            << ";positions=" << result.positions.size()
            << ";triangles=" << result.triangles.size() << '\n';
  for (const auto& position : result.positions) {
    for (double value : position) {
      uint64_t bits;
      std::memcpy(&bits, &value, sizeof(bits));
      std::cout << bits << ',';
    }
    std::cout << '\n';
  }
  for (const auto& triangle : result.triangles)
    std::cout << triangle[0] << ',' << triangle[1] << ',' << triangle[2] << '\n';
  std::cout << "transforms=" << transforms << '\n';
}
'''


def main():
    before = subprocess.check_output(['git', 'show', f'{BASE}:{BRIDGE}'], cwd=ROOT, text=True)
    after = (ROOT / BRIDGE).read_text()
    assert 'placed_nodes' not in report_function(before)
    assert 'placed_nodes' in report_function(after)
    guard = 'if (result.positions.size() >\n          static_cast<size_t>(std::numeric_limits<uint32_t>::max()) - 3)'
    assert guard in report_function(before) and guard in report_function(after)
    with tempfile.TemporaryDirectory() as directory:
        binaries = []
        for name, source in [('before', before), ('after', after)]:
            cpp = Path(directory) / f'{name}.cpp'
            binary = Path(directory) / name
            cpp.write_text(PREFIX + report_function(source) + SUFFIX)
            subprocess.run(['clang++', '-std=c++17', '-O0', str(cpp), '-o', str(binary)], check=True)
            binaries.append(binary)
        for mode in ['shared', 'mirrored', 'reversed', 'two-faces', 'invalid', 'invalid-first']:
            old, new = [subprocess.check_output([str(binary), mode], text=True).splitlines()
                        for binary in binaries]
            assert old[:-1] == new[:-1], f'{mode}: report bytes or refusal changed'
            old_count, new_count = [int(lines[-1].split('=')[1]) for lines in (old, new)]
            if mode in ['shared', 'mirrored', 'reversed']:
                assert (old_count, new_count) == (9, 4), (mode, old_count, new_count)
                assert old[0] == 'error=;visited_triangle=3;positions=9;triangles=3'
            elif mode == 'two-faces':
                assert (old_count, new_count) == (18, 8)
                assert old[0] == 'error=;visited_triangle=3;positions=18;triangles=6'
            else:
                assert old[0].startswith('error=node refused;')
                assert f'visited_triangle={2 if mode == "invalid" else 1};' in old[0]
            print(f'{mode}: equal report/refusal; transforms {old_count} -> {new_count}')


if __name__ == '__main__':
    main()
