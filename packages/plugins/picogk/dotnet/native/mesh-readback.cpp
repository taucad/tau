// SPDX-License-Identifier: Apache-2.0
// Bounded caller-buffer contract adapted from PicoVoxel src/pico-bulk.cpp
// (6779245032cc4c5794d9a16597db7830939838c2). Use PicoGK's stable C API so bulk
// ponytail: native element reads retain the shipped engine; direct array copies need a runtime rebuild.
#include "PicoGK.h"
#include <algorithm>
#include <type_traits>

static_assert(sizeof(PKVector3) == 12 && sizeof(PKTriangle) == 12);
static_assert(std::is_standard_layout_v<PKVector3> && std::is_standard_layout_v<PKTriangle>);

// Managed capture holds the mesh mutation gate across counts and both copies.
// Buffers are caller-owned; a short buffer receives a bounded prefix and its written count.
PICOGK_API int32_t Mesh_GetVertices(PKINSTANCE library, PKMESH mesh, PKVector3* buffer, int32_t capacity)
{
    if (buffer == nullptr || capacity <= 0) return 0;
    const auto count = std::min(capacity, Mesh_nVertexCount(library, mesh));
    for (int32_t index = 0; index < count; ++index) Mesh_GetVertex(library, mesh, index, buffer + index);
    return count;
}

PICOGK_API int32_t Mesh_GetTriangles(PKINSTANCE library, PKMESH mesh, PKTriangle* buffer, int32_t capacity)
{
    if (buffer == nullptr || capacity <= 0) return 0;
    const auto count = std::min(capacity, Mesh_nTriangleCount(library, mesh));
    for (int32_t index = 0; index < count; ++index) Mesh_GetTriangle(library, mesh, index, buffer + index);
    return count;
}
