// SPDX-License-Identifier: Apache-2.0
// Full headless core regression; link every retained managed import as well.
#include "PicoGK.h"
#include <bit>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <vector>
using ContextSdf = int32_t (*)(void*, const PKVector3*, float*);
using ContextScalar = int32_t (*)(void*, const PKVector3*, float);
using ContextVector = int32_t (*)(void*, const PKVector3*, const PKVector3*);
using ContextNormals = int32_t (*)(void*, uint32_t, const float*, float*, uint8_t*);
PICOGK_API int32_t PicoDotNet_RenderImplicit(PKINSTANCE,PKVOXELS,const PKBBox3*,void*,ContextSdf) noexcept;
PICOGK_API int32_t PicoDotNet_IntersectImplicit(PKINSTANCE,PKVOXELS,void*,ContextSdf) noexcept;
PICOGK_API int32_t PicoDotNet_TraverseScalar(PKINSTANCE,PKSCALARFIELD,void*,ContextScalar) noexcept;
PICOGK_API int32_t PicoDotNet_TraverseVector(PKINSTANCE,PKVECTORFIELD,void*,ContextVector) noexcept;
PICOGK_API int32_t TauDotNet_CreateSurfaceNormals(PKINSTANCE,PKVOXELS,float,void*,ContextNormals,PKVECTORFIELD*,PKMETADATA*) noexcept;
static void check(bool value,const char* message) { if(!value) throw std::runtime_error(message); }
struct Context { PKINSTANCE library; int calls=0; bool nested=false; bool fail=false; };
static int32_t sphere(void* token,const PKVector3* p,float* value) {
    auto& context=*static_cast<Context*>(token); ++context.calls;
    if(context.fail)return 1;
    if(!context.nested) {
        context.nested=true;
        Context inner{context.library,0,true,false};
        const auto vox=Voxels_hCreate(context.library);const PKBBox3 bounds{{-1,-1,-1},{1,1,1}};
        const auto status=PicoDotNet_RenderImplicit(context.library,vox,&bounds,&inner,sphere);
        Voxels_Destroy(context.library,vox);
        if(status!=0||inner.calls==0)return 1;
    }
    *value=std::sqrt(p->X*p->X+p->Y*p->Y+p->Z*p->Z)-10.f;return 0;
}
static int32_t gyroid(void*,const PKVector3* p,float* value) {
    // Same float frequency and double arithmetic as unchanged ShapeKernel C#.
    const float frequency=(2.f*3.14159265358979323846f)/3.f;
    const double x=frequency*double(p->X),y=frequency*double(p->Y),z=frequency*double(p->Z);
    *value=float(std::abs(std::sin(x)*std::cos(y)+std::sin(y)*std::cos(z)+std::sin(z)*std::cos(x))-.5);
    return 0;
}
static int32_t scalar(void* token,const PKVector3*,float) { auto& c=*static_cast<Context*>(token);++c.calls;return c.fail?1:0; }
static int32_t vector(void* token,const PKVector3*,const PKVector3*) { auto& c=*static_cast<Context*>(token);++c.calls;return c.fail?1:0; }
static int32_t normals(void* token,uint32_t count,const float* input,float* values,uint8_t* keep) {
    auto& c=*static_cast<Context*>(token);++c.calls;if(c.fail)return 1;
    for(uint32_t i=0;i<count;++i){keep[i]=1;for(int j=0;j<3;++j)values[i*3+j]=input[i*3+j]*2.f;}
    return 0;
}
static uint64_t digest(PKINSTANCE lib,PKMESH mesh) {
    uint64_t h=1469598103934665603ULL;
    auto mix=[&](uint32_t v){for(int b=0;b<4;++b){h^=(v>>(8*b))&255;h*=1099511628211ULL;}};
    for(int i=0;i<Mesh_nVertexCount(lib,mesh);++i){PKVector3 v{};Mesh_GetVertex(lib,mesh,i,&v);mix(std::bit_cast<uint32_t>(v.X));mix(std::bit_cast<uint32_t>(v.Y));mix(std::bit_cast<uint32_t>(v.Z));}
    for(int i=0;i<Mesh_nTriangleCount(lib,mesh);++i){PKTriangle t{};Mesh_GetTriangle(lib,mesh,i,&t);mix(t.A);mix(t.B);mix(t.C);}return h;
}
int main() try {
    const auto lib=Library_hCreateInstance(.5f);const auto vox=Voxels_hCreate(lib);
    const PKBBox3 bounds{{-12,-12,-12},{12,12,12}};Context context{lib};
    check(PicoDotNet_RenderImplicit(lib,vox,&bounds,&context,sphere)==0&&context.calls>1&&context.nested,"nested callback");
    auto mesh=Mesh_hCreateFromVoxels(lib,vox);const auto hash=digest(lib,mesh);
    check(hash==0xb8aa4cfd3b2b77f9ULL,"historical raw sphere pin");
    check(TauLibrary_SetMeshing(lib,.2f,true)==0,"adaptive display setup");
    uint64_t adaptiveSnapshot=0,adaptiveGeneration=0;int32_t adaptivePositions=0,adaptiveIndices=0;PKColorFloat adaptiveColor{};
    check(TauCapture_Acquire(lib,1,vox,&adaptiveSnapshot,&adaptiveGeneration,&adaptivePositions,&adaptiveIndices,&adaptiveColor)==0&&adaptivePositions>0&&adaptiveIndices>0,"adaptive capture");
    check(TauCapture_Release(lib,adaptiveSnapshot)==0,"adaptive capture release");
    const auto exactAfterAdaptive=Mesh_hCreateFromVoxels(lib,vox);
    check(digest(lib,exactAfterAdaptive)==hash,"adaptive display preserves exact export");
    Mesh_Destroy(lib,exactAfterAdaptive);
    check(TauLibrary_SetMeshing(lib,0.f,false)==0,"uniform display reset");
    const auto appended=Mesh_hCreate(lib);const float trianglePositions[]{0,0,0,1,0,0,0,1,0};const int32_t triangleIndices[]{0,1,2};
    check(TauMesh_AppendElements(lib,appended,trianglePositions,9,triangleIndices,3)==0&&Mesh_nVertexCount(lib,appended)==3&&Mesh_nTriangleCount(lib,appended)==1,"bulk mesh append");
    Mesh_Destroy(lib,appended);
    const auto gyroidVox=Voxels_hCreateCopy(lib,vox);
    check(PicoDotNet_IntersectImplicit(lib,gyroidVox,&context,gyroid)==0,"gyroid intersection");
    const auto gyroidMesh=Mesh_hCreateFromVoxels(lib,gyroidVox);
    check(digest(lib,gyroidMesh)==0x2b43725651c3733aULL,"historical exact gyroid pin");
    Mesh_Destroy(lib,gyroidMesh);Voxels_Destroy(lib,gyroidVox);
    uint64_t snapshot=0,generation=0;int32_t positions=0,indices=0;PKColorFloat color{};
    check(TauCapture_Acquire(lib,0,mesh,&snapshot,&generation,&positions,&indices,&color)==0,"capture acquire");
    std::vector<float> before(positions),after(positions);std::vector<uint32_t> ib(indices),ia(indices);
    check(TauCapture_Copy(lib,snapshot,before.data(),positions,ib.data(),indices)==0,"capture before");
    const PKVector3 extra{100,100,100};Mesh_nAddVertex(lib,mesh,&extra);Mesh_Destroy(lib,mesh);
    check(TauCapture_Copy(lib,snapshot,after.data(),positions,ia.data(),indices)==0&&before==after&&ib==ia,"snapshot isolation");
    check(TauCapture_Release(lib,snapshot)==0,"snapshot release");
    Context failure{lib,0,true,true};const auto failed=Voxels_hCreate(lib);
    check(PicoDotNet_RenderImplicit(lib,failed,&bounds,&failure,sphere)==1,"SDF failure status");
    check(PicoDotNet_IntersectImplicit(lib,vox,&failure,sphere)==1,"intersection failure status");
    Voxels_Destroy(lib,failed);
    check(PicoDotNet_RenderImplicit(0,0,&bounds,&context,sphere)==4,"invalid lifetime status");
    const auto field=ScalarField_hCreate(lib);const auto vec=VectorField_hCreate(lib);const PKVector3 zero{},value{1,2,3};
    ScalarField_SetValue(lib,field,&zero,3.25f);VectorField_SetValue(lib,vec,&zero,&value);
    check(PicoDotNet_TraverseScalar(lib,field,&failure,scalar)==1,"scalar failure status");
    check(PicoDotNet_TraverseVector(lib,vec,&failure,vector)==1,"vector failure status");
    Context count{lib};check(PicoDotNet_TraverseScalar(lib,field,&count,scalar)==0&&count.calls==1,"scalar recovery");
    count.calls=0;check(PicoDotNet_TraverseVector(lib,vec,&count,vector)==0&&count.calls==1,"vector recovery");
    PKVECTORFIELD normalField=0;PKMETADATA normalMeta=0;Context normalContext{lib};
    check(TauDotNet_CreateSurfaceNormals(lib,vox,.5f,&normalContext,normals,&normalField,&normalMeta)==0&&normalField&&normalMeta&&normalContext.calls>0,"normal batch");
    Metadata_Destroy(lib,normalMeta);VectorField_Destroy(lib,normalField);normalField=0;normalMeta=0;
    check(TauDotNet_CreateSurfaceNormals(lib,vox,.5f,&failure,normals,&normalField,&normalMeta)==-4&&!normalField&&!normalMeta,"normal error ownership");
    const auto file=VdbFile_hCreate(lib);
    VdbFile_nAddVoxels(lib,file,"sphere",vox);VdbFile_nAddScalarField(lib,file,"scalar",field);VdbFile_nAddVectorField(lib,file,"vector",vec);
    check(VdbFile_bSaveToFile(lib,file,"witness.vdb"),"VDB write");VdbFile_Destroy(lib,file);
    const auto restored=VdbFile_hCreateFromFile(lib,"witness.vdb");check(restored&&VdbFile_nFieldCount(lib,restored)==3,"VDB roundtrip");
    int scalarIndex=-1;
    for(int i=0;i<VdbFile_nFieldCount(lib,restored);++i){char name[PKINFOSTRINGLEN]{};VdbFile_GetFieldName(lib,restored,i,name);if(std::strcmp(name,"scalar")==0)scalarIndex=i;}
    check(scalarIndex>=0,"VDB scalar name");
    PKMETADATA restoredMetadata=0;
    check(TauVdbFile_GetFieldMetadata(lib,restored,scalarIndex,1,&restoredMetadata)==0&&restoredMetadata,"VDB field metadata");
    Metadata_Destroy(lib,restoredMetadata);
    const auto restoredScalar=VdbFile_hGetScalarField(lib,restored,scalarIndex);float scalarValue=0;
    check(ScalarField_bGetValue(lib,restoredScalar,&zero,&scalarValue)&&scalarValue==3.25f,"VDB scalar value");
    ScalarField_Destroy(lib,restoredScalar);VdbFile_Destroy(lib,restored);
    VectorField_Destroy(lib,vec);ScalarField_Destroy(lib,field);Voxels_Destroy(lib,vox);Library_DestroyInstance(lib);
    std::puts("{\"rawPin\":\"b8aa4cfd3b2b77f9\",\"gyroidPin\":\"2b43725651c3733a\",\"capture\":\"passed\",\"callbacks\":\"passed\",\"normals\":\"passed\",\"vdb\":\"passed\"}");
} catch(const std::exception& error) { std::fprintf(stderr,"%s\n",error.what());return 1; }
