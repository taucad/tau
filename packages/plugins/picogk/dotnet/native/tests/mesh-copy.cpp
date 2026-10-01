// Tests the private caller-buffer contract against a separately loaded engine.
// Run tau-picogk-mesh-copy-test <prepared picogk.26.2.dylib>.
#include "PicoGK.h"
#include <algorithm>
#include <array>
#include <climits>
#include <cstring>
#include <dlfcn.h>
#include <iostream>
#include <stdexcept>

#define LOAD(name) auto name = reinterpret_cast<decltype(&::name)>(dlsym(engine, #name)); require(name != nullptr, #name)
static void require(bool condition, const char* detail)
{
    if (!condition) throw std::runtime_error(detail);
}

template<class Element, class Copy>
static void checkBuffers(Copy copy, PKINSTANCE library, PKMESH mesh,
                         const Element* expected, int count)
{
    std::array<Element, 5> buffer;
    std::memset(buffer.data(), 0x5a, sizeof(buffer));
    const auto sentinel = buffer;
    require(copy(0, 0, nullptr, 5) == 0, "null buffer must return zero without resolving handles");
    for (int capacity : {-1, 0}) {
        require(copy(0, 0, buffer.data(), capacity) == 0, "nonpositive capacity must return zero");
        require(std::memcmp(buffer.data(), sentinel.data(), sizeof(buffer)) == 0, "zero copies must not write");
    }
    require(copy(0, mesh, buffer.data(), 5) == -1, "invalid library must return minus one");
    require(std::memcmp(buffer.data(), sentinel.data(), sizeof(buffer)) == 0, "invalid library must not write");
    require(copy(library, 0, buffer.data(), 5) == -1, "invalid mesh must return minus one");
    require(std::memcmp(buffer.data(), sentinel.data(), sizeof(buffer)) == 0, "invalid mesh must not write");
    for (int capacity : {1, 2, 3, 5, INT_MAX}) {
        buffer = sentinel;
        const auto written = std::min(count, capacity);
        require(copy(library, mesh, buffer.data(), capacity) == written, "copy must return min(capacity, count)");
        require(std::memcmp(buffer.data(), expected, written * sizeof(Element)) == 0, "copy must preserve packed typed values and order");
        require(std::memcmp(buffer.data() + written, sentinel.data() + written,
                            (buffer.size() - written) * sizeof(Element)) == 0, "copy must leave trailing capacity untouched");
    }
}

int main(int argc, char** argv)
{
    try {
        require(argc == 2, "expected prepared engine path");
        auto engine = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
        require(engine != nullptr, "engine failed to load");
        LOAD(Library_hCreateInstance); LOAD(Library_DestroyInstance); LOAD(Library_nMeshesAllocated);
        LOAD(Mesh_hCreate); LOAD(Mesh_Destroy); LOAD(Mesh_nAddVertex); LOAD(Mesh_nAddTriangle);
        LOAD(Tau_Mesh_GetVertices); LOAD(Tau_Mesh_GetTriangles);
        const auto library = Library_hCreateInstance(0.7f);
        const auto mesh = Mesh_hCreate(library);
        const std::array<PKVector3, 3> vertices = {{{-1.25f, 2.5f, 3.75f}, {4, 2.5f, 3.75f}, {0, 5, 3.75f}}};
        const PKTriangle triangle{0, 1, 2};
        for (const auto& vertex : vertices) require(Mesh_nAddVertex(library, mesh, &vertex) >= 0, "vertex creation");
        require(Mesh_nAddTriangle(library, mesh, &triangle) == 0, "triangle creation");
        checkBuffers(Tau_Mesh_GetVertices, library, mesh, vertices.data(), 3);
        checkBuffers(Tau_Mesh_GetTriangles, library, mesh, &triangle, 1);
        const auto empty = Mesh_hCreate(library);
        PKVector3 buffer{99, 98, 97};
        const auto sentinel = buffer;
        require(Tau_Mesh_GetVertices(library, empty, &buffer, 1) == 0, "empty mesh must copy zero");
        require(std::memcmp(&buffer, &sentinel, sizeof(buffer)) == 0, "empty mesh must not write");
        Mesh_Destroy(library, empty);
        require(Tau_Mesh_GetVertices(library, empty, &buffer, 1) == -1, "destroyed mesh must fail");
        require(std::memcmp(&buffer, &sentinel, sizeof(buffer)) == 0, "destroyed mesh must not write");
        Mesh_Destroy(library, mesh);
        require(Library_nMeshesAllocated(library) == 0, "test must release mesh handles");
        Library_DestroyInstance(library);
        require(Tau_Mesh_GetVertices(library, mesh, &buffer, 1) == -1, "destroyed library must fail");
        require(std::memcmp(&buffer, &sentinel, sizeof(buffer)) == 0, "destroyed library must not write");
        require(dlclose(engine) == 0, "engine unload");
        std::cout << "{\"privateMeshCopy\":\"passed\",\"invalidStatus\":-1,\"zeroStatus\":0,\"bufferUntouchedOnFailure\":true,\"meshesAfterDispose\":0}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
