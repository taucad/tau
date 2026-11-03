// SPDX-License-Identifier: Apache-2.0
// Run against the staged browser overlay, in debug and release builds.
#include "PicoGKMesh.h"
#include "PicoGKPolyLine.h"
#include "PicoGKLattice.h"
#include <iostream>
#include <stdexcept>

static void require(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}
template<class Operation> static void rejects(Operation operation) {
    try { operation(); }
    catch (const std::out_of_range&) { return; }
    throw std::runtime_error("invalid index was accepted");
}
int main() try {
    using namespace PicoGK;
    Mesh mesh;
    mesh.nAddVertex(Vector3(0, 0, 0));
    mesh.nAddVertex(Vector3(1, 0, 0));
    mesh.nAddVertex(Vector3(0, 1, 0));
    mesh.nAddTriangle(Triangle(0, 1, 2));
    const auto snapshot = mesh.TauCapture();
    const auto generation = mesh.TauGeneration();
    for (int bad : {-1, 3, INT32_MAX}) {
        rejects([&] { mesh.nAddTriangle(Triangle(bad, 1, 2)); });
        rejects([&] { Vector3 vertex(0,0,0); mesh.GetVertex(bad, &vertex); });
    }
    for (int bad : {-1, 1, INT32_MAX}) {
        rejects([&] { Triangle triangle(0,0,0); mesh.GetTriangle(bad, &triangle); });
        rejects([&] { Vector3 a(0,0,0),b(0,0,0),c(0,0,0); mesh.GetTriangle(bad, &a, &b, &c); });
    }
    require(mesh.nTriangleCount() == 1 && mesh.TauGeneration() == generation,
        "rejected index changed geometry or generation");
    mesh.nAddVertex(Vector3(2, 2, 2));
    require(snapshot->nVertexCount() == 3, "mesh snapshot changed after mutation");
    PolyLine line(ColorFloat(1, 1, 1, 1));
    line.nAddVertex(Vector3(0, 0, 0));
    const auto lineSnapshot = line.TauCapture();
    for (int bad : {-1, 1, INT32_MAX})
        rejects([&] { Vector3 vertex(0,0,0); line.GetVertex(bad, &vertex); });
    line.nAddVertex(Vector3(1, 0, 0));
    require(lineSnapshot->nVertexCount() == 1, "polyline snapshot changed after mutation");
    Lattice lattice;
    lattice.AddBeam(Vector3(0,0,0), Vector3(0,0,0), 1, 2, false);
    require(lattice.oBeams().empty() && lattice.oSpheres().empty(), "zero-length flat beam was retained");
    lattice.AddBeam(Vector3(0,0,0), Vector3(0,0,0), 1, 2, true);
    require(lattice.oBeams().empty() && lattice.oSpheres().size() == 1, "rounded degenerate beam is not a sphere");
    std::cout << "{\"bounds\":\"passed\",\"snapshotIsolation\":\"passed\",\"degenerateBeams\":\"passed\"}\n";
}
catch (const std::exception& error) { std::cerr << error.what() << "\n"; return 1; }
