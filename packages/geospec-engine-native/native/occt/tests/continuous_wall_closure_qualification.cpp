// Focused qualification for the continuous-wall closure gate: the wall path
// judges its outer shell by the operand gate's computed edge-use parity (S4),
// never by the stored Closed() flag a healer may write. A box whose shell
// stores Closed()=false still closes by parity; before this gate W2B refused
// it with "Continuous wall requires one closed outer shell without cavities."
// (M0, before S4: "A regular-solid shape contains an open shell."). Compile with
// the pinned OCCT static closure, as for prototype_qualification.cpp.
#include "../bridge/geospec_occt_bridge.cpp"

#include <BRepPrimAPI_MakeBox.hxx>

#include <cstring>
#include <iostream>
#include <stdexcept>

namespace {
void check(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

// The wall domain bytes of a fresh box whose shell stores `stored_closed`.
std::string wall_domain(bool stored_closed) {
  const TopoDS_Shape box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
  TopExp_Explorer explorer(box, TopAbs_SHELL);
  TopoDS_Shape shell = explorer.Current();
  shell.Closed(stored_closed);  // on the TShape the solid shares
  check(BRep_Tool::IsClosed(shell), "the box shell closes by edge-use parity");
  geospec_occt_continuous_wall_domain domain;
  std::memset(&domain, 0, sizeof domain);  // padding compares too
  ShapeIndex faces, edges;
  std::string message;
  check(classify_continuous_wall(box, domain, faces, edges, message), message);
  return std::string(reinterpret_cast<const char*>(&domain), sizeof domain);
}
}  // namespace

int main() {
  check(wall_domain(false) == wall_domain(true),
        "the stored Closed() flag moves no continuous-wall byte");
  std::cout << "continuous wall closure qualification passed\n";
}
