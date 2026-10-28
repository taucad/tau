// SPDX-License-Identifier: Apache-2.0
// Tau's checked implementation of the private PicoDotNet context ABI. Compile
// this instead of the plain upstream adapter when the Tau overlay is selected.
#include "PicoGK.h"
#include <cstdint>
namespace {
using Sdf = int32_t (*)(void*, const PKVector3*, float*);
using Scalar = int32_t (*)(void*, const PKVector3*, float);
using Vector = int32_t (*)(void*, const PKVector3*, const PKVector3*);
using Normals = int32_t (*)(void*, uint32_t, const float*, float*, uint8_t*);
struct Frame { void* context; Sdf sdf; Scalar scalar; Vector vector; Normals normals = nullptr; };
thread_local Frame* current = nullptr;
struct Scope {
    Frame* previous;
    explicit Scope(Frame& frame) : previous(current) { current = &frame; }
    ~Scope() { current = previous; }
    Scope(const Scope&) = delete;
    Scope& operator=(const Scope&) = delete;
};
int32_t sdf(const PKVector3* point, float* value) { return current->sdf(current->context, point, value); }
int32_t scalar(const PKVector3* point, float value) { return current->scalar(current->context, point, value); }
int32_t vector(const PKVector3* point, const PKVector3* value) { return current->vector(current->context, point, value); }
int32_t normals(uint32_t count, const float* input, float* output, uint8_t* keep) {
    return current->normals(current->context, count, input, output, keep);
}
template<class Operation> int32_t invoke(Frame& frame, Operation operation) noexcept {
    Scope scope(frame);
    try {
        // Keep Tau's checked lifetime/input failures visible across the generic ABI.
        switch (operation()) {
            case 0: return 0;
            case -4: return 1;
            case -1: return 3;
            case -3: return 4;
            default: return 2;
        }
    } catch (...) { return 2; }
}
}
PICOGK_API int32_t PicoDotNet_RenderImplicit(PKINSTANCE library, PKVOXELS voxels,
    const PKBBox3* bounds, void* context, Sdf callback) noexcept {
    if (!context || !callback || !bounds) return 3;
    Frame frame{context, callback, nullptr, nullptr};
    return invoke(frame, [&] { return Tau_Voxels_RenderImplicitChecked(library, voxels, bounds, sdf); });
}
PICOGK_API int32_t PicoDotNet_IntersectImplicit(PKINSTANCE library, PKVOXELS voxels,
    void* context, Sdf callback) noexcept {
    if (!context || !callback) return 3;
    Frame frame{context, callback, nullptr, nullptr};
    return invoke(frame, [&] { return Tau_Voxels_IntersectImplicitChecked(library, voxels, sdf); });
}
PICOGK_API int32_t PicoDotNet_TraverseScalar(PKINSTANCE library, PKSCALARFIELD field,
    void* context, Scalar callback) noexcept {
    if (!context || !callback) return 3;
    Frame frame{context, nullptr, callback, nullptr};
    return invoke(frame, [&] { return Tau_ScalarField_TraverseActiveChecked(library, field, scalar); });
}
PICOGK_API int32_t PicoDotNet_TraverseVector(PKINSTANCE library, PKVECTORFIELD field,
    void* context, Vector callback) noexcept {
    if (!context || !callback) return 3;
    Frame frame{context, nullptr, nullptr, callback};
    return invoke(frame, [&] { return Tau_VectorField_TraverseActiveChecked(library, field, vector); });
}

PICOGK_API int32_t TauDotNet_CreateSurfaceNormals(PKINSTANCE library, PKVOXELS voxels, float threshold,
    void* context, Normals callback, PKVECTORFIELD* output, PKMETADATA* metadata) noexcept {
    if (!context || !callback) return -1;
    Frame frame{context, nullptr, nullptr, nullptr, callback};
    Scope scope(frame);
    try { return TauVectorField_CreateSurfaceNormals(library, voxels, threshold, normals, output, metadata); }
    catch (...) { return -2; }
}
