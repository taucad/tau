# 3MF Assimp Audit: Best-in-Class Export Strategy

## Executive Summary

The 3MF exporter in assimp is currently disabled in the Tau converter package (`packages/converter/src/export.ts`, line 29) due to unresolved bugs. An audit of the assimp C++ codebase reveals the exporter is fundamentally incomplete: it supports only basic mesh geometry and flat material colors, lacking textures, vertex colors, components, transforms, and all 3MF extensions. Meanwhile the importer is more capable but still misses PBR materials and all extensions beyond basic Materials support.

Testing against the three leading slicer applications -- BambuStudio, PrusaSlicer, and OrcaSlicer -- shows that a best-in-class 3MF exporter must go well beyond the core spec. Slicers expect multi-material color groups, per-triangle paint color attributes, slicer-specific metadata, and proper OPC packaging. The current assimp exporter satisfies none of these requirements.

The recommended path forward is to integrate **lib3mf** (the 3MF Consortium's official reference implementation, BSD-licensed) as an assimp C++ contrib library, following the same FetchContent pattern used by **tinyusdz** (USD) and **web-ifc** (IFC). This provides full 3MF spec coverage, built-in validation, and all extensions at an estimated cost of ~2-3MB additional WASM binary size -- a proportionate tradeoff for best-in-class capability.

---

## Table of Contents

1. [3MF Specification Coverage Matrix](#1-3mf-specification-coverage-matrix)
2. [Slicer Compatibility Matrix](#2-slicer-compatibility-matrix)
3. [Assimp 3MF Exporter Gap Analysis](#3-assimp-3mf-exporter-gap-analysis)
4. [Assimp 3MF Importer Gap Analysis](#4-assimp-3mf-importer-gap-analysis)
5. [lib3mf as Assimp C++ Contrib](#5-lib3mf-as-assimp-c-contrib)
6. [Existing Tau 3MF Code](#6-existing-tau-3mf-code)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Slicer Extension Reference](#8-slicer-extension-reference)

---

## 1. 3MF Specification Coverage Matrix

Based on the 3MF Core Specification v1.4.0 and extension specifications. Assessed against the assimp source code at `repos/assimpjs/assimp/code/AssetLib/3MF/`.

### 1.1 Core Specification

| Feature | 3MF Spec | Importer | Exporter | Gap Severity |
|---------|----------|----------|----------|-------------|
| Model element with `unit` attribute | Required | Partial (parsed but not applied) | Hardcoded `millimeter` | Low |
| Mesh vertices (`<vertices>`) | Required | Supported | Supported | None |
| Mesh triangles (`<triangles>`) | Required | Supported | Supported | None |
| Triangle property indices `p1` | Optional | Supported | Supported (hardcoded to `pid="1"`) | Medium |
| Triangle property indices `p2`, `p3` | Optional | Supported | **Missing** | High |
| Base materials (`<basematerials>`) | Optional | Supported | Supported (diffuse color only) | Low |
| Material `displaycolor` (sRGB) | Required per base | Supported | Supported | None |
| Material `name` | Required per base | Supported | Supported | None |
| Object `id` attribute | Required | Supported | Supported (auto-incremented from 2) | Low |
| Object `type` attribute | Optional | Supported | Hardcoded `"model"` | Medium |
| Object `name` attribute | Optional | Supported | **Missing** | Medium |
| Object `partnumber` attribute | Optional | **Missing** | **Missing** | Low |
| Object `thumbnail` attribute | Optional | **Missing** | **Missing** | Low |
| Object `pid`/`pindex` (default material) | Optional | Supported | **Missing** | High |
| Components (`<components>`) | Optional | Supported | **Missing** | Critical |
| Component `transform` | Optional | Supported | **Missing** | Critical |
| Build items (`<item>`) | Required | Supported | Supported | None |
| Build item `transform` | Optional | Supported | **Missing** | Critical |
| Build item `partnumber` | Optional | **Missing** | **Missing** | Low |
| Metadata (`<metadata>`) at model level | Optional | Supported | Supported | None |
| Metadata at object level (`<metadatagroup>`) | Optional | **Missing** | **Missing** | Medium |
| Metadata at item level (`<metadatagroup>`) | Optional | **Missing** | **Missing** | Medium |
| OPC ZIP container | Required | Supported | Supported | None |
| `[Content_Types].xml` | Required | Supported | Supported | None |
| `_rels/.rels` relationships | Required | Supported | Supported | None |
| Package thumbnails | Optional | Recognized, not processed | **Missing** | Medium |
| PrintTicket | Optional | Recognized, not processed | **Missing** | Medium |
| Triangle Sets extension | Optional | **Missing** | **Missing** | Low |
| `requiredextensions` attribute | Optional | **Missing** | **Missing** | Medium |
| `recommendedextensions` attribute | Optional | **Missing** | **Missing** | Low |

### 1.2 Materials and Properties Extension

| Feature | Spec | Importer | Exporter | Gap Severity |
|---------|------|----------|----------|-------------|
| Color groups (`<m:colorgroup>`) | Optional | Supported | **Missing** | Critical |
| Per-vertex colors (`<m:color>`) | Optional | Supported | **Missing** | Critical |
| Texture2D resources (`<m:texture2d>`) | Optional | Supported | **Missing** | Critical |
| Texture2D groups (`<m:texture2dgroup>`) | Optional | Supported | **Missing** | Critical |
| Texture coordinates (`<m:tex2coord>`) | Optional | Supported | **Missing** | Critical |
| Embedded texture files in ZIP | Optional | Supported | **Missing** | Critical |
| Composite materials (`<m:compositematerials>`) | Optional | **Missing** | **Missing** | Medium |
| Multi-property groups (`<m:multiproperties>`) | Optional | **Missing** | **Missing** | Medium |
| PBR materials (metallic/roughness) | Optional | **Missing** | **Missing** | High |

### 1.3 Other Extensions

| Extension | Importer | Exporter | Relevance for Slicers |
|-----------|----------|----------|----------------------|
| Production Extension | **Missing** | **Missing** | High (multi-part files, sub-models) |
| Beam Lattice Extension | **Missing** | **Missing** | Medium (lattice structures) |
| Slice Extension | **Missing** | **Missing** | High (pre-sliced data for slicers) |
| Volumetric Extension | **Missing** | **Missing** | Low (advanced material grading) |
| Secure Content Extension | **Missing** | **Missing** | Low (DRM, encryption) |

---

## 2. Slicer Compatibility Matrix

Assessed by inspecting the 3MF import code of each slicer.

### 2.1 Minimum Viable 3MF (All Slicers)

All three slicers require the same baseline to successfully open a 3MF file:

```
ZIP archive containing:
├── [Content_Types].xml          (with model content type)
├── _rels/.rels                  (with relationship to model)
└── 3D/3dmodel.model             (or 3D/3DModel.model)
    ├── <model unit="millimeter" xmlns="...core/2015/02">
    │   ├── <resources>
    │   │   └── <object id="1" type="model">
    │   │       └── <mesh>
    │   │           ├── <vertices>...</vertices>
    │   │           └── <triangles>...</triangles>
    │   │       </mesh>
    │   │   </object>
    │   ├── <build>
    │   │   └── <item objectid="1"/>
    │   </build>
    │   </resources>
    └── </model>
```

### 2.2 Feature Support by Slicer

| Feature | BambuStudio | PrusaSlicer | OrcaSlicer | Assimp Exporter |
|---------|-------------|-------------|------------|-----------------|
| Core mesh (vertices/triangles) | Yes | Yes | Yes | Yes |
| Build item transforms | Yes | Yes | Yes | **No** |
| Object type validation | `model`, `other` only | `model` only | `model`, `other` only | Hardcoded `model` |
| Components | Yes | Yes | Yes | **No** |
| Base materials | Yes | Yes | Yes | Yes (basic) |
| Color groups (`m:colorgroup`) | Yes | **No** | Yes | **No** |
| Texture resources | **No** | **No** | **No** | **No** |
| Production Extension (`p:`) | Yes | **No** | Yes | **No** |
| Multi-material painting | `paint_color` attr | `slic3rpe:mmu_segmentation` | Both | **No** |
| Custom metadata | BambuStudio namespace | slic3rpe namespace | Both | **No** |
| Embedded print settings | Yes (`Metadata/` dir) | Yes (`Metadata/` dir) | Yes (`Metadata/` dir) | **No** |
| Thumbnails | Yes (multiple sizes) | **No** | Yes (multiple sizes) | **No** |

### 2.3 Critical Compatibility Findings

**Object type rejection**: All three slicers reject objects with type `"solidsupport"`, `"support"`, or `"surface"`. BambuStudio and OrcaSlicer accept `"other"` in addition to `"model"`. PrusaSlicer only accepts `"model"`. The assimp exporter hardcodes `type="model"`, which is safe but inflexible.

**Multi-material divergence**: The three slicers use incompatible approaches to multi-material:
- BambuStudio/OrcaSlicer: `m:colorgroup` + `m:color` (Materials Extension), `paint_color` triangle attribute
- PrusaSlicer: `slic3rpe:mmu_segmentation` triangle attribute (proprietary), reads `paint_color` as fallback
- For maximum compatibility, files should include both `m:colorgroup` AND slicer-specific painting attributes

**Version detection**: BambuStudio detects its own files via `Application` metadata starting with `"BambuStudio-"`. PrusaSlicer uses `slic3rpe:Version3mf`. OrcaSlicer handles both. Missing version metadata may cause slicers to skip loading certain settings.

**Path validation**: BambuStudio and OrcaSlicer reject ZIP paths containing `".."` (directory traversal prevention). The assimp exporter uses safe absolute paths (`3D/3DModel.model`).

---

## 3. Assimp 3MF Exporter Gap Analysis

Source files:
- `repos/assimpjs/assimp/code/AssetLib/3MF/D3MFExporter.h`
- `repos/assimpjs/assimp/code/AssetLib/3MF/D3MFExporter.cpp`

The exporter is approximately 400 lines of C++ and is fundamentally a minimal proof-of-concept. The export pipeline is:

```
ExportScene3MF()
  └── D3MFExporter::exportArchive()
      ├── exportContentTypes()     → [Content_Types].xml
      ├── export3DModel()          → 3D/3DModel.model
      │   ├── writeHeader()        → XML declaration
      │   ├── writeMetaData()      → <metadata> from aiScene
      │   ├── writeBaseMaterials() → <basematerials id="1">
      │   ├── writeObjects()       → <object> per root child node
      │   │   └── writeMesh()      → <mesh> with vertices and faces
      │   └── writeBuild()         → <build> with <item> entries
      └── exportRelations()        → _rels/.rels
```

### 3.1 Critical Bugs and Limitations

**Hardcoded material ID** (`D3MFExporter.cpp`, line 352): Every triangle references `pid="1"` regardless of the actual material group ID. This means multi-object scenes with different material groups will have incorrect material assignments:
```cpp
mModelOutput << "<" << XmlTag::triangle << " v1=\"" << currentFace.mIndices[0] << "\" v2=\""
             << currentFace.mIndices[1] << "\" v3=\"" << currentFace.mIndices[2]
             << "\" pid=\"1\" p1=\"" + ai_to_string(matIdx) + "\" />";
```

**Object IDs start at 2** (`D3MFExporter.cpp`, line 289): Object IDs are auto-generated as `i + 2` (where `i` is the child node index), with material group hardcoded to `id="1"`. This is fragile and breaks if a scene has more resources:
```cpp
mModelOutput << "<" << XmlTag::object << " id=\"" << i + 2 << "\" type=\"model\">";
```

**No transforms** (`D3MFExporter.cpp`, line 368): Build items are written without transform attributes, meaning all objects are placed at origin:
```cpp
mModelOutput << "<" << XmlTag::item << " objectid=\"" << i + 2 << "\"/>";
```

**Only single material per mesh**: The exporter uses `mesh->mMaterialIndex` as a flat index into the basematerials group. Per-face material variation requires `p1`/`p2`/`p3` which are not implemented.

**Non-recursive node traversal** (`D3MFExporter.cpp`, line 284): Only iterates `root->mChildren`, ignoring deeper hierarchy. Components are not supported at all:
```cpp
for (unsigned int i = 0; i < root->mNumChildren; ++i) {
    aiNode *currentNode(root->mChildren[i]);
```

**Memory management**: Uses raw `new`/`delete` for `OpcPackageRelationship` objects (`mRelations` vector), with manual cleanup in the destructor. Not a crash risk but is a code quality concern.

**Disabled tests** (`test/unit/utD3MFImportExport.cpp`): Both export and roundtrip tests are commented out:
```cpp
TEST_F(utD3MFImporterExporter, export3MFtoMemTest) {
    //EXPECT_TRUE(exporterTest());
}
TEST_F(utD3MFImporterExporter, roundtrip3MFtoMemTest) {
    /*EXPECT_TRUE(exporterTest());
    ...
    */
}
```

### 3.2 Missing Features (Ordered by Priority)

1. **Build item transforms** -- Objects cannot be positioned or rotated. Every slicer expects this.
2. **Components and hierarchy** -- No `<components>` export. Object reuse and assembly are impossible.
3. **Color groups** (`m:colorgroup`) -- Required by BambuStudio and OrcaSlicer for multi-material.
4. **Texture export** -- No embedded textures, no texture coordinates, no `m:texture2d` resources.
5. **Vertex colors** -- No per-vertex color export despite the importer supporting it.
6. **Per-triangle material indices** (`p2`, `p3`) -- Only `p1` is written, no material gradients.
7. **Object default material** (`pid`/`pindex` on `<object>`) -- Not set, preventing material inheritance.
8. **Slicer metadata** -- No BambuStudio, PrusaSlicer, or OrcaSlicer compatibility metadata.
9. **Production Extension** -- No `p:UUID`, no sub-models.
10. **Print ticket** -- No embedded print settings.
11. **Thumbnails** -- No preview images.

---

## 4. Assimp 3MF Importer Gap Analysis

Source files:
- `repos/assimpjs/assimp/code/AssetLib/3MF/D3MFImporter.h` / `.cpp`
- `repos/assimpjs/assimp/code/AssetLib/3MF/XmlSerializer.h` / `.cpp`
- `repos/assimpjs/assimp/code/AssetLib/3MF/D3MFOpcPackage.h` / `.cpp`
- `repos/assimpjs/assimp/code/AssetLib/3MF/3MFTypes.h`
- `repos/assimpjs/assimp/code/AssetLib/3MF/3MFXmlTags.h`

The importer is significantly more capable than the exporter, covering core spec features plus basic Materials Extension support.

### 4.1 Supported Features

- Core mesh geometry (vertices, triangles)
- Base materials with diffuse colors
- Texture2D resources (`m:texture2d`) with embedded image extraction from ZIP
- Texture2D groups (`m:texture2dgroup`) with per-triangle texture coordinates (`p1`, `p2`, `p3`)
- Color groups (`m:colorgroup`) with per-triangle vertex colors
- Object components (`<components>`) with transform matrices
- Build item transforms (12-element affine matrix)
- Metadata at model level
- OPC container reading (ZIP, relationships, content types)

Import pipeline:
```
D3MFImporter::InternReadFile()
  └── D3MFOpcPackage()              → Opens ZIP, finds root model
      └── XmlSerializer::ImportXml()
          ├── ReadObject()           → Objects with meshes or components
          ├── ReadBaseMaterials()    → Core materials
          ├── ReadEmbeddecTexture()  → Texture2D resources
          ├── ReadTextureGroup()     → Texture coordinate groups
          ├── ReadColorGroup()       → Vertex color groups
          ├── ReadMetadata()         → Metadata entries
          └── addObjectToNode()      → Builds aiScene graph
```

### 4.2 Missing Features

| Feature | Severity | Notes |
|---------|----------|-------|
| PBR materials (metallic, roughness, specular) | High | Materials Extension defines these but importer ignores them |
| Composite materials (`m:compositematerials`) | Medium | Multi-material blending not parsed |
| Multi-property groups (`m:multiproperties`) | Medium | Property layering not parsed |
| Production Extension sub-models | High | Multi-part files not supported |
| Beam Lattice Extension | Medium | Lattice structures not parsed |
| Slice Extension | High | Pre-sliced polygon data not parsed |
| Volumetric Extension | Low | Advanced material grading |
| Secure Content Extension | Low | Encryption/DRM |
| Object-level metadata groups | Medium | `<metadatagroup>` on objects not parsed |
| Item-level metadata groups | Medium | `<metadatagroup>` on build items not parsed |
| Print tickets | Medium | Recognized in OPC but not processed |
| Thumbnails | Low | Recognized in OPC but not processed |
| Triangle Sets | Low | Core extension for triangle grouping |
| Unit conversion | Medium | `unit` attribute parsed but not applied to vertex coordinates |

### 4.3 Known Bugs

**Texture2DGroup static cast** (`XmlSerializer.cpp`, line 483): A comment marks a bug fix with a bare cast, suggesting fragility:
```cpp
Texture2DGroup *group = static_cast<Texture2DGroup *>(it->second); // fix bug
```

**ZIP path double-slash workaround** (`D3MFOpcPackage.cpp`, lines 157-162):
```cpp
if (!rootFile.empty() && rootFile[0] == '/') {
    rootFile = rootFile.substr(1);
    if (rootFile[0] == '/') {
        // deal with zip-bug
        rootFile = rootFile.substr(1);
    }
}
```

---

## 5. lib3mf as Assimp C++ Contrib

### 5.1 Existing Contrib Patterns in Assimp

The assimp codebase at `repos/assimpjs/assimp/` uses two patterns for third-party library integration:

**Pattern A: Bundled contrib** (small, stable libraries):
- `contrib/zlib/` -- compression
- `contrib/pugixml/` -- XML parsing (header-only + single .cpp)
- `contrib/zip/` -- ZIP creation for 3MF exporter (kuba--/zip, conditionally compiled)
- `contrib/rapidjson/` -- JSON parsing (header-only)
- `contrib/stb/` -- image loading (header-only)

**Pattern B: FetchContent** (large, actively developed libraries):
- `contrib/tinyusdz/autoclone/` -- USD support, FetchContent from GitHub, pinned to git tag `48e327dd...`, ~5.5MB WASM impact
- `contrib/web-ifc/autoclone/` -- IFC support, FetchContent from GitHub, pinned to git tag `04f5fa47...`, ~900KB WASM impact, requires C++20
- `contrib/meshlab/autoclone/` -- VRML support, FetchContent from GitHub

The FetchContent pattern in `code/CMakeLists.txt` follows a consistent structure:
1. Check if format is enabled (`IF (ASSIMP_BUILD_XXX_IMPORTER)`)
2. Set base path in `contrib/` and autoclone directory
3. Declare FetchContent with git repository URL and tag
4. Apply patches if needed
5. Make available and list source files explicitly
6. Add source files to `assimp_src`
7. Set include directories

### 5.2 lib3mf Characteristics

- **Repository**: Official 3MF Consortium reference implementation
- **License**: Simplified BSD (permissive, compatible with assimp's BSD license)
- **Language**: C++17
- **Full spec coverage**: Core, Materials, Production, Beam Lattice, Slice, Volumetric, Secure Content extensions
- **Source size**: ~337 C++ source files in `Source/`, ~246 headers in `Include/`, estimated ~150-200K LOC
- **API**: Hourglass pattern with C and C++ bindings generated by Automatic Component Toolkit (ACT)
- **Validation**: Built-in strict mode, warning system, schema validation, mesh manifold checking

**Dependencies**:
| Dependency | Size | Shareable with Assimp? |
|------------|------|------------------------|
| zlib 1.3.1 | ~100KB | Yes -- assimp already has `contrib/zlib/` |
| libzip 1.10.1 | ~500KB | Replaces assimp's simpler `contrib/zip/` |
| cpp-base64 | ~1 file | Minimal |
| fast_float | Header-only | Minimal |
| LibreSSL 3.8.2 | ~2-3MB | Not needed -- only used in tests, Secure Content uses callbacks |

**WASM compatibility**:
- No threading (single-threaded, no pthread/mutex)
- Memory-based streams available (`NMR_ImportStream_Memory.cpp`, `NMR_ExportStream_Memory.cpp`) -- no native file I/O required
- `USE_PLATFORM_UUID=OFF` provides non-platform UUID generation (needed for Emscripten)
- Custom XML parsing (no external XML library dependency)
- No problematic platform-specific code for Emscripten

**Modular extension directories** (can selectively include/exclude):
- `Source/Model/Reader/v100/` -- Core 3MF 1.0 reader (~25 files)
- `Source/Model/Reader/v093/` -- Legacy 0.93 reader (~15 files, can exclude)
- `Source/Model/Reader/Slice1507/` -- Slice extension (~9 files)
- `Source/Model/Reader/BeamLattice1702/` -- Beam Lattice extension (~9 files)
- `Source/Model/Reader/Volumetric2201/` -- Volumetric extension (~18 files, can exclude)
- `Source/Model/Reader/SecureContent101/` -- Secure Content (~8 files, can exclude)

### 5.3 WASM Size Impact

Current WASM binary sizes:
- `assimpjs-all.wasm`: **12MB** (all importers including IFC, USD, X3D)
- `assimpjs-exporter.wasm`: **8.7MB** (all exporters, minimal importers, includes tinyusdz for USD)

Reference contrib sizes:
- web-ifc (IFC): ~900KB WASM impact
- tinyusdz (USD): ~5.5MB WASM impact
- lib3mf (estimated): **~2-3MB** for Core + Materials + Production extensions

With LTO (`-flto`) already enabled in the assimpjs build, dead code elimination will remove unused lib3mf code paths. Excluding Volumetric, Secure Content, and legacy v093 readers could reduce the impact to ~2MB.

**Size impact by build profile** (defined in `repos/assimpjs/CMakeLists.txt`):
- **ReleaseExporter** (primary target): 8.7MB -> ~11MB (+2-3MB). This is the WASM used for export in `packages/converter`.
- **ReleaseAll**: 12MB -> ~14MB (+2-3MB). This is the WASM used for import.
- **ReleaseMini**: No impact (no exporters besides GLTF/ASSJSON, 3MF import could optionally use lib3mf).

### 5.4 Integration Architecture

lib3mf would be integrated following the tinyusdz/web-ifc pattern:

```
repos/assimpjs/assimp/
├── contrib/
│   └── lib3mf/
│       └── autoclone/           ← FetchContent clones lib3mf here
├── code/
│   ├── CMakeLists.txt           ← Add lib3mf FetchContent + source listing
│   └── AssetLib/3MF/
│       ├── D3MFExporter.cpp     ← Rewrite to use lib3mf Writer API
│       ├── D3MFImporter.cpp     ← Rewrite to use lib3mf Reader API
│       └── Lib3MFBridge.cpp     ← New: aiScene <-> lib3mf Model conversion
```

The bridge layer (`Lib3MFBridge.cpp`) would handle bidirectional conversion:

**Export (aiScene -> 3MF)**:
1. Create lib3mf `IModel` instance
2. Iterate `aiScene` meshes -> create lib3mf `IMeshObject` resources
3. Convert `aiMaterial` -> lib3mf `IBaseMaterialGroup`, `IColorGroup`, `ITexture2D`, etc.
4. Map `aiNode` hierarchy -> lib3mf components with transforms
5. Create build items from scene root children with transforms
6. Write metadata, thumbnails, print settings
7. Use lib3mf `IWriter` to serialize to 3MF ZIP buffer
8. Write buffer through assimp's IOSystem

**Import (3MF -> aiScene)**:
1. Read 3MF ZIP data through assimp's IOSystem
2. Use lib3mf `IReader` to parse into `IModel`
3. Iterate lib3mf mesh objects -> create `aiMesh` instances
4. Convert lib3mf materials/colors/textures -> `aiMaterial`
5. Map lib3mf components -> `aiNode` hierarchy
6. Build scene graph from build items with transforms
7. Extract metadata into `aiMetadata`

### 5.5 Tradeoff Assessment

The lib3mf contrib approach is strongly recommended because:

1. **Development effort**: Writing a full 3MF exporter from scratch in assimp would require implementing OPC packaging, XML serialization, materials extension, production extension, validation, and slicer compatibility -- easily 10,000+ lines of C++. lib3mf provides all of this already.

2. **Maintenance**: lib3mf is maintained by the 3MF Consortium and tracks spec changes. An assimp-native implementation would need manual updates for every spec revision.

3. **Correctness**: lib3mf includes built-in validation (manifold checking, schema validation, strict mode). A custom implementation would need to replicate all of this.

4. **Weight**: ~2-3MB WASM is a proportionate cost. For comparison, tinyusdz adds 5.5MB for USD support. The current exporter WASM is already 8.7MB.

5. **Precedent**: The pattern is proven -- tinyusdz and web-ifc already demonstrate that large contrib libraries work well in the assimpjs WASM build with LTO optimization.

---

## 6. Existing Tau 3MF Code

### 6.1 Converter Package (assimpjs-based)

**Status**: 3MF export is disabled.

`packages/converter/src/export.ts`, line 29:
```typescript
// '3mf': { exporter: new AssimpExporter().initialize({ format: '3mf' }) }, // Fix assimp 3mf exporter
```

3MF is absent from:
- `assimpExportFormats` array in `packages/converter/src/exporters/assimp.exporter.ts`
- `supportedOutputFormats` array in `packages/converter/src/types.ts`

3MF import works and is present in:
- `supportedInputFormats` array in `packages/converter/src/types.ts`
- Import config in `packages/converter/src/import.ts` using `AssimpLoader`
- Import test in `packages/converter/src/import.test.ts` with `cube.3mf` fixture

The converter uses two WASM binaries:
- `assimpjs-all.wasm` (12MB) for import (all formats)
- `assimpjs-exporter.wasm` (8.7MB) for export (GLTF input -> target format)

### 6.2 Kernel-Level 3MF Export (TypeScript)

A standalone TypeScript 3MF generator exists at `packages/kernels/src/utils/export-3mf.ts`, used exclusively by the OpenSCAD kernel for OFF-to-3MF conversion.

**Capabilities**:
- Takes `IndexedPolyhedron` (vertices, faces, per-face colors) as input
- Fan triangulation of non-triangle faces
- Per-face color support via base materials
- Multi-material printing support with extruder color mapping
- Slicer-compatible metadata (`BambuStudio:3mfVersion`, `slic3rpe:Version3mf`, `slic3rpe:MmPaintingVersion`)
- Paint color encoding compatible with PrusaSlicer/BambuStudio (`paint_color` attribute)
- ZIP packaging via `UZIP` library

**Limitations**:
- No texture/UV mapping support
- No alpha channel (RGB only)
- No unit handling (assumes millimeters)
- No transform matrices
- No multi-object support
- No thumbnails or print settings
- No components or hierarchy
- No validation

**Usage path**:
```
OpenSCAD kernel → OFF file → parseOff() → IndexedPolyhedron → export3mf() → 3MF Blob
```

This implementation is adequate for simple OpenSCAD geometry with colors but cannot serve as a general-purpose 3MF exporter. Once the assimp 3MF exporter is functional via lib3mf, this code path should be migrated to use the converter package instead.

### 6.3 assimpjs Binding Layer

The assimpjs binding code (`repos/assimpjs/assimpjs/src/assimpjs.cpp`) already includes 3MF in its format mapping:
```cpp
} else if (format == "3mf") {
    fileName += ".3mf";
}
```

The export flow is: `ConvertFileList(fileList, "3mf")` -> `ExportScene()` -> `Assimp::Exporter::Export(scene, "3mf", ...)`. No changes are needed in the binding layer -- fixing the underlying `D3MFExporter` in assimp is sufficient.

---

## 7. Implementation Roadmap

### Phase 1: Integrate lib3mf as Assimp Contrib

**Objective**: Add lib3mf to the assimp build system following the tinyusdz/web-ifc pattern.

**Tasks**:
1. Create `repos/assimpjs/assimp/contrib/lib3mf/autoclone/` directory
2. Add FetchContent declaration in `repos/assimpjs/assimp/code/CMakeLists.txt`:
   - Pin to a stable lib3mf release tag
   - Configure `USE_INCLUDED_ZLIB=OFF` (share assimp's zlib)
   - Configure `USE_INCLUDED_SSL=OFF` (exclude LibreSSL)
   - Configure `USE_PLATFORM_UUID=OFF` (Emscripten compat)
   - List lib3mf source files for Core + Materials + Production extensions
   - Exclude Volumetric, SecureContent, and v093 legacy reader for size
3. Add conditional compilation flag: `ASSIMP_BUILD_3MF_LIB3MF` (default ON when 3MF exporter enabled)
4. Create Emscripten compatibility patch if needed (stream I/O, UUID)
5. Verify WASM build compiles and check binary size impact
6. Update `repos/assimpjs/CMakeLists.txt` ReleaseExporter profile if needed

### Phase 2: Rewrite D3MFExporter Using lib3mf

**Objective**: Replace the minimal exporter with a full-featured implementation backed by lib3mf.

**Tasks**:
1. Create `Lib3MFBridge.h/.cpp` for `aiScene` <-> lib3mf `IModel` conversion
2. Implement mesh conversion: `aiMesh` -> lib3mf `IMeshObject`
   - Vertices, triangles, per-triangle properties
3. Implement material conversion: `aiMaterial` -> lib3mf materials
   - Base materials with display colors
   - Color groups for per-vertex colors
   - Texture2D resources with embedded image data
   - Texture2D groups with UV coordinates
4. Implement hierarchy conversion: `aiNode` tree -> lib3mf components
   - Transform matrices on components
   - Object reuse via component references
5. Implement build items with transforms
6. Implement metadata export from `aiScene->mMetaData`
7. Add slicer compatibility metadata (version strings, namespaces)
8. Wire up lib3mf `IWriter::WriteToBuffer()` through assimp's IOSystem
9. Re-enable and update export tests in `test/unit/utD3MFImportExport.cpp`

### Phase 3: Rewrite D3MFImporter Using lib3mf (Optional)

**Objective**: Improve import fidelity by using lib3mf's reader instead of the manual XML parser.

**Tasks**:
1. Implement lib3mf `IReader` integration in `D3MFImporter`
2. Convert lib3mf model -> `aiScene` (reverse of Phase 2 bridge)
3. Add support for Production Extension sub-models
4. Add support for Beam Lattice extension
5. Add support for Slice extension
6. Improve material import (PBR properties, composite materials)
7. Update import tests

### Phase 4: Re-enable 3MF in Tau Converter Package

**Objective**: Enable 3MF export in the converter package and verify end-to-end GLTF->3MF pipeline.

**Tasks**:
1. Rebuild assimpjs WASM binaries with lib3mf integration
2. Update `packages/converter/src/assets/assimpjs/assimpjs-exporter.wasm`
3. Add `'3mf'` to `assimpExportFormats` in `packages/converter/src/exporters/assimp.exporter.ts`
4. Add `'3mf'` to `supportedOutputFormats` in `packages/converter/src/types.ts`
5. Uncomment 3MF export config in `packages/converter/src/export.ts`
6. Add export test cases for 3MF in `packages/converter/src/export.test.ts`
7. Verify exported 3MF files open correctly in BambuStudio, PrusaSlicer, OrcaSlicer

### Phase 5: Add Slicer Compatibility Metadata

**Objective**: Ensure exported 3MF files work seamlessly with all major slicers.

**Tasks**:
1. Add version metadata for slicer detection:
   - `BambuStudio:3mfVersion`
   - `slic3rpe:Version3mf`
   - `slic3rpe:MmPaintingVersion`
2. Add Production Extension UUID metadata (`p:UUID` on objects and build items)
3. Implement multi-material painting compatibility:
   - `m:colorgroup` / `m:color` for spec-compliant readers
   - `paint_color` triangle attribute for BambuStudio/OrcaSlicer
4. Add thumbnail generation (JPEG/PNG preview images in `Metadata/`)
5. Consider optional print ticket embedding for default print settings
6. Validate compatibility with actual slicer software using test models

---

## 8. Slicer Extension Reference

### 8.1 BambuStudio

**Source**: `repos/BambuStudio/src/libslic3r/Format/bbs_3mf.cpp` (9,286 lines)

**Namespace**: `xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"`

**Custom metadata keys**:
- `BambuStudio:3mfVersion` -- File format version (integer)
- `model_id` -- Model identifier
- `Title`, `Designer`, `DesignerUserId`, `DesignId` -- Attribution
- `Description`, `CopyRight`/`Copyright`, `License` -- Legal
- `Region`, `CreationDate`, `ModificationDate` -- Provenance
- `ProfileTitle`, `ProfileCover`, `ProfileDescription` -- Profile info
- `MakerLab`, `MakerLabVersion` -- MakerLab metadata

**Custom elements**:
- `<BambuStudioShape>` -- SVG shape embossing data
- `<plate>` -- Build plate information (multi-plate support)
- `<part>` -- Part information within plates
- `<assemble>` / `<assemble_item>` -- Assembly structure
- `<filament>` -- Filament information per plate
- `<slice_warning>` -- Slice warning data

**Custom triangle attributes**:
- `paint_supports` -- Support painting data (per-triangle)
- `paint_fuzzy_skin` -- Fuzzy skin painting data
- `paint_seam` -- Seam painting data
- `paint_color` -- Multi-material painting data
- `face_property` -- Face-level properties

**Custom object attributes**:
- `locked` -- Object lock state
- `bed_type` -- Bed type preference
- `print_sequence` -- Print sequence order
- `filament_maps` -- Filament mapping for multi-material

**Metadata directory structure**:
```
Metadata/
├── plate_N.png              # Plate thumbnails
├── plate_no_light_N.png     # No-light thumbnails
├── top_N.png                # Top view thumbnails
├── pick_N.png               # Pick view thumbnails
├── plate_N.gcode            # Embedded G-code
├── plate_N.json             # Pattern config
├── print_profile.config     # Print profile
├── project_settings.config  # Project settings
├── model_settings.config    # Model settings
├── filament_settings_N.config
├── machine_settings_N.config
├── slice_info.config
└── custom_gcode_per_layer.xml
```

**Relationship types**:
- `http://schemas.bambulab.com/package/2021/cover-thumbnail-middle` -- Middle thumbnail
- `http://schemas.bambulab.com/package/2021/cover-thumbnail-small` -- Small thumbnail
- `http://schemas.bambulab.com/package/2021/gcode` -- G-code relationship

**Material handling**: Uses `m:colorgroup` and `m:color` from the Materials Extension. Color groups are mapped to extruder indices for multi-material printing.

### 8.2 PrusaSlicer

**Source**: `repos/PrusaSlicer/src/libslic3r/Format/3mf.cpp` (~198K characters)

**Namespace**: `xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"`

**Custom metadata keys**:
- `slic3rpe:Version3mf` -- File format version (integer, currently 1)
- `slic3rpe:FdmSupportsPaintingVersion` -- FDM support painting version
- `slic3rpe:SeamPaintingVersion` -- Seam painting version
- `slic3rpe:MmPaintingVersion` -- Multi-material painting version

**Custom triangle attributes**:
- `slic3rpe:custom_supports` -- Support painting data (per-triangle, serialized)
- `slic3rpe:custom_seam` -- Seam painting data (per-triangle, serialized)
- `slic3rpe:mmu_segmentation` -- Multi-material segmentation data (per-triangle, serialized)
- `slic3rpe:fuzzy_skin` -- Fuzzy skin data (per-triangle)

**Custom elements**:
- `slic3rpe:text` -- Text embossing configuration
- `slic3rpe:shape` -- SVG shape embossing configuration

**Object type handling**: PrusaSlicer only accepts `type="model"`. All other types (`other`, `solidsupport`, `support`, `surface`) are rejected. Empty type defaults to `"model"`.

**Multi-material compatibility**: PrusaSlicer reads `paint_color` attribute as a fallback for `slic3rpe:mmu_segmentation`, providing backward compatibility with BambuStudio files:
```cpp
std::string mm_segmentation_serialized =
    get_attribute_value_string(attributes, num_attributes, MM_SEGMENTATION_ATTR);
if (mm_segmentation_serialized.empty())
    mm_segmentation_serialized =
        get_attribute_value_string(attributes, num_attributes, "paint_color");
```

**Material handling**: PrusaSlicer does NOT support the Materials Extension (`m:colorgroup`, `m:color`). Multi-material is handled entirely through the proprietary `slic3rpe:mmu_segmentation` attribute.

### 8.3 OrcaSlicer

**Source**: `repos/OrcaSlicer/src/libslic3r/Format/bbs_3mf.cpp` (~432K characters), `repos/OrcaSlicer/src/libslic3r/Format/3mf.cpp` (~147K characters)

OrcaSlicer maintains dual importers: a PrusaSlicer-compatible importer (`3mf.cpp`) and a BambuStudio-specific importer (`bbs_3mf.cpp`).

**Supported namespaces**:
- Core: `http://schemas.microsoft.com/3dmanufacturing/core/2015/02`
- Production: `http://schemas.microsoft.com/3dmanufacturing/production/2015/06`
- PrusaSlicer: `http://schemas.slic3r.org/3mf/2017/06`
- BambuStudio metadata keys (`BambuStudio:3mfVersion`, etc.)

**Material handling**: Full Materials Extension support -- `m:colorgroup` and `m:color` elements with per-triangle color assignment via `pid` and `p1` attributes. Also supports BambuStudio `paint_color` attribute.

**Additional features over PrusaSlicer**:
- Multi-plate system (multiple build plates per file)
- G-code embedding (`Metadata/plate_*.gcode`)
- Multiple thumbnail sizes (small, middle, cover)
- Filament tracking per layer (`layer_filament_lists`)
- Filament tray mapping
- Pattern/config files for bed textures
- Production Extension support (sub-models)
- Secure Content Extension support

**Object type handling**: Accepts `"model"` and `"other"`. Rejects `"solidsupport"`, `"support"`, `"surface"`.

### 8.4 Universal Compatibility Strategy

To produce 3MF files compatible with all three slicers:

1. **Use `type="model"`** on all objects (only type accepted by all three)
2. **Include core metadata**:
   - `Application` (e.g., `"Tau-1.0"`)
   - `BambuStudio:3mfVersion` with value `"1"`
   - `slic3rpe:Version3mf` with value `"1"`
3. **For multi-material**, include redundant data:
   - `m:colorgroup` / `m:color` resources (Materials Extension) for BambuStudio and OrcaSlicer
   - `paint_color` attribute on triangles for BambuStudio/OrcaSlicer painting
   - Note: PrusaSlicer uses `paint_color` as fallback for `slic3rpe:mmu_segmentation`
4. **Include transforms** on build items (all slicers support them)
5. **Use safe file paths**: No `..`, no leading dots, absolute paths starting with `/`
6. **Include Production Extension UUIDs** (`p:UUID`) for BambuStudio and OrcaSlicer compatibility
7. **Generate thumbnails** as JPEG/PNG in `Metadata/` directory for BambuStudio and OrcaSlicer preview
