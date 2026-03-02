# OpenCASCADE Technology Changelog: V7.6.2 → V8.0.0-rc4

> Comprehensive changelog covering 14 releases and 1,085 commits relevant to the
> opencascade.js WASM binding upgrade from OCCT V7.6.2 to V8.0.0-rc4.
>
> Generated on 2026-02-23 from
> [Open-Cascade-SAS/OCCT](https://github.com/Open-Cascade-SAS/OCCT) release notes and local git history.

---

## Release Summary

| Version | Date | Commits | Type |
|---------|------|---------|------|
| V7.6.3 | 2022-07-22 | 20 | Maintenance |
| V7.7.0 | 2022-11-12 | 293 | Minor |
| V7.7.1 | 2023-03-21 | 57 | Maintenance |
| V7.7.2 | 2023-07-21 | 21 | Maintenance |
| V7.8.0 | 2023-12-26 | 117 | Minor |
| V7.8.1 | 2024-03-31 | 19 | Maintenance |
| V7.9.0 | 2025-02-17 | 272 | Minor |
| V7.9.1 | 2025-05-20 | 34 | Maintenance |
| V7.9.2 | 2025-10-19 | 27 | Maintenance |
| V7.9.3 | 2025-12-05 | 17 | Maintenance |
| V8.0.0.rc1 | 2025-04-13 | 57 | Release Candidate |
| V8.0.0.rc2 | 2025-07-29 | 78 | Release Candidate |
| V8.0.0.rc3 | 2025-12-15 | 157 | Release Candidate |
| V8.0.0.rc4 | 2026-02-16 | 111 | Release Candidate |

---

## Breaking Changes Impact on opencascade.js Bindings

The following breaking changes are particularly relevant to the opencascade.js
WASM binding generation and runtime:

### Build Requirements

- **C++17 minimum** (V8.0.0-rc2, [#537](https://github.com/Open-Cascade-SAS/OCCT/pull/537)):
  Emscripten must be upgraded to a version supporting C++17. Current Emscripten 3.1.14
  supports C++17 but upgrading to 4.x is recommended for full compliance.

### Repository Structure

- **Source directory reorganized** (V8.0.0-rc1, [#450](https://github.com/Open-Cascade-SAS/OCCT/pull/450)):
  Layout changed from `src/Package/` to `src/Module/Toolkit/Package/File`.
  All binding generation scripts that enumerate source files (`compileSources.py`,
  `Common.py`) must be updated to handle the new directory structure.

### Exception Handling

- **`Standard_Failure` inherits `std::exception`** (V8.0.0-rc4, [#984](https://github.com/Open-Cascade-SAS/OCCT/pull/984)):
  The exception hierarchy is now bridged with standard C++. `Raise()`, `Instance()`,
  `Throw()` static methods are removed — use `throw` instead. This affects how
  exceptions are caught in JavaScript via Emscripten's exception handling.

- **Thread-local error handlers** (V8.0.0-rc4, [#980](https://github.com/Open-Cascade-SAS/OCCT/pull/980)):
  Replaces global mutex-protected stack with `thread_local` storage. `Catches()` and
  `LastCaughtError()` methods removed. The `OCC_CATCH_SIGNALS` macro is updated.

### API Removals & Changes

- **Deprecated math globals** (V8.0.0-rc3, [#833](https://github.com/Open-Cascade-SAS/OCCT/pull/833)):
  `ACos()`, `Sqrt()`, `Sin()`, `Min()`, `Max()` etc. replaced with `std::` equivalents.
  Bindings that expose these global functions will need updating.

- **`Standard_Mutex` replaced with `std::mutex`** (V8.0.0-rc3, [#766](https://github.com/Open-Cascade-SAS/OCCT/pull/766)):
  `Standard_Mutex::Sentry` → `std::lock_guard`. `TopTools_MutexForShapeProvider` removed.

- **`PLib_Base` removed** (V8.0.0-rc3, [#795](https://github.com/Open-Cascade-SAS/OCCT/pull/795)):
  `PLib_JacobiPolynomial` and `PLib_HermitJacobi` are now value types, not Handle-based.

- **All 29 leaf Geom/Geom2d classes marked `final`** (V8.0.0-rc4, [#1063](https://github.com/Open-Cascade-SAS/OCCT/pull/1063)):
  Prevents virtual method overrides. Binding generation filters may need updating
  to avoid attempting to extend these classes.

- **`NCollection_Map::Seek()`/`ChangeSeek()` removed** (V8.0.0-rc4, [#1065](https://github.com/Open-Cascade-SAS/OCCT/pull/1065)):
  Replaced with `Contained()` returning `std::optional`.

- **`Standard_Failure::Raise()` static method removed** (V8.0.0-rc4, [#984](https://github.com/Open-Cascade-SAS/OCCT/pull/984)):
  Use `throw` instead. This affects any binding that wraps these methods.

- **BSpline/Bezier weights always populated** (V8.0.0-rc4, [#1058](https://github.com/Open-Cascade-SAS/OCCT/pull/1058)):
  Nullable `Weights()` replaced with always-valid `WeightsArray()`.

- **Mesh plugin system replaced** (V8.0.0-rc4, [#1033](https://github.com/Open-Cascade-SAS/OCCT/pull/1033)):
  `BRepMesh_PluginMacro.hxx`, `BRepMesh_PluginEntryType.hxx`, `BRepMesh_FactoryError.hxx`
  removed. Registry-based factory pattern introduced.

### New Collections & Types

- **`NCollection_FlatDataMap`/`FlatMap`** (V8.0.0-rc4): Robin Hood hash maps
- **`NCollection_OrderedMap`/`OrderedDataMap`** (V8.0.0-rc4): Insertion-order-preserving maps
- **`NCollection_KDTree`** (V8.0.0-rc4): Header-only spatial KD-Tree
- **`gp_Dir::D` enumerations** (V8.0.0-rc3): Standard direction enums
- **`TCollection_AsciiString::EmptyString()`** (V8.0.0-rc3): Static empty string accessor

### Typedef Deprecation

- Package type aliases (`TColStd_*`, `TopTools_*`, etc.) are deprecated in favor of
  `NCollection_*<T>` templates (V8.0.0-rc4, [#1026](https://github.com/Open-Cascade-SAS/OCCT/pull/1026)).
  The `ignoreDuplicateTypedef()` filter in opencascade.js binding generation will
  need updating for new/changed typedef spellings.

### TopoDS_TShape Overhaul

- **Child storage changed from linked list to contiguous array** (V8.0.0-rc4, [#1027](https://github.com/Open-Cascade-SAS/OCCT/pull/1027)):
  `ShapeType()` devirtualized, state bit-packed into `uint16_t`, iterator changed
  from list-based to index-based. Any code directly accessing TShape internals
  through bindings will need adaptation.

### Geometry Evaluation Redesign

- **New `EvalD*` API** (V8.0.0-rc4, [#1064](https://github.com/Open-Cascade-SAS/OCCT/pull/1064), [#1094](https://github.com/Open-Cascade-SAS/OCCT/pull/1094)):
  New virtual `EvalD0`/`EvalD1`/`EvalD2`/`EvalD3` methods with POD result structs.
  Old `D0`/`D1`/`D2`/`D3` methods retained as non-virtual inline wrappers.

---

## Detailed Release Notes

### V7.6.3 (2022-07-22, 20 commits)

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_6_3) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_6_2...V7_6_3)

This maintenance release fixes the following critical problems (see also [**Release Notes**](https://dev.opencascade.org/content/open-cascade-technology-763-maintenance-release)) compared to OCCT 7.6.2:

- 29406: Foundation Classes – gp_Ax3 fails setting direction
- 31661: Modeling Data – Exception when projecting parabola or hyperbola to plane
- 32679: Data Exchange – STEP writer loses assembly instance name
- 32692: Mesh – In BRepMesh_ModelPreProcessor avoid crashes with problematic topology
- 32744: Modeling Algorithms – Endless loop in GCPnts_UniformDeflection
- 32864: Modeling Algorithms – Normal projection of a wire on a cylinder produces wrong result
- 32882: Modeling Data – Extrema curve/curve cannot find all solutions (OCCT 7.6 backport)
- 32914: Data Exchange – Some parts of compound are lost while writing STEP in nonmanifold mode
- 32915: Geom2dAPI_InterCurveCurve, The algorithm lost an intersection point.
- 32929: Modeling Algorithms – Crash in PerformIntersectionAtEnd after deletion of surfdata
- 32930: Modeling Algorithms – Crash in PerformIntersectionAtEnd when no face was found
- 32931: Modeling Algorithms – Crash in ChFi3d_IsInFront when no face was found
- 32973: Modeling Algorithms – Regression in BRepExtrema_DistShapeShape compared with 7.5
- 32990: Configuration – compilation errors since Emscripten 3.1.11 due to time_t redefined long->int
- 32991: Visualization, TKOpenGl – OpenGl_Window::Resize() ignores window virtual flag on macOS
- 33028: Standard_ConstructionError while using ShapeUpgrade_UnifySameDomain
- 33060: [Regression to 7.4.0] Mesh – Sub-precisional links provoke failure on face
- 33074: Visualization, TKOpenGl – PBR shader compilation error on Mesa OpenGL 3.1

Publication date: July 27, 2022.

---

### V7.7.0 (2022-11-12, 293 commits) ⚠️ C++17, API Removal

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_7_0) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_6_3...V7_7_0)

Open CASCADE Technology version 7.7.0 is a minor release, which includes more than 250 improvements and corrections over the previous minor release 7.6.0. Version 7.7.0  introduces new features of most OCCT modules and components.  New in OCCT 7.7.0 (see also [Release Notes](https://dev.opencascade.org/content/open-cascade-technology-770-released) and [Documentation](https://dev.opencascade.org/doc/occt-7.7.0/overview)):

**General**

- Improved compatibility with C++17/C++20 compilers
- Dropped support of pre-C++11 compilers

**Modeling**

- New functionality is implemented, which could verify the input shape to be placed on a canonical geometry with the given tolerance. If the input shape is a face or a shell, it could be verified to be close enough to Plane, Cylinder, Cone or Sphere. If the input shape is an edge or a wire, it could be verified to be close to Line, Circle or Ellipse as well as lying on one of the analytical surfaces above.
- Introduced new tool BRepLib_PointCloudShape generating a point set for a topological shape.
- New option in BRepOffsetAPI_MakeOffset - approximation of input contours by ones consisting of 2D circular arcs and 2D linear segments only, it provides more stable work of 2D offset algorithm.

**Visualization**

- Introduced new interface for creating V3d_View as subviews of another V3d_View.
- Added smoothing to row interlaced stereoscopic output.
- Added word-wrapping option to Font_TextFormatter.
- Added support of a wide color window buffer format (10bit per component / 30bit RGB).
- Added MSAA anti-aliasing support when using WebGL 2.0.
- Introduced skydome generation feature 3d_View::BackgroundSkydome().

**Mesh**

- BRepMesh works too long and produces many free nodes on a valid face problems are resolved.
- Meshing the shape no longer takes too long and visualization problems are corrected.
- Wrong shading display of thrusections is fixed.
- Rendering issue when using deviation coefficient of low value is resolved.
- Mesher no longer produce 'bad' result for extruded spline with given deviation coefficient.
- Holes in triangulation with large linear deflection are removed.
- Broken triangulation on pipe shape is fixed.

**Data Exchange**

- STEP translator now supports tessellated presentations.
- Transformation tools BRepBuilderAPI_Transform/BRepBuilderAPI_Copy now handle properly tessellated presentations.
- glTF Writer - added support of Draco compression.
- Introduced DEWrapper - a unified interface to Data Exchange connectors.
- Introduced tool XCAFDoc_Editor::RescaleGeometry() for scaling geometry in XCAF document.

**Configuration**

- SONAME is now configurable in CMake and includes minor version in addition to major by default
- Documentation
- Improved samples / tutorials documentation.
- Introduced new “AIS: Custom Presentation” tutorial.

Note: starting this year we stop supporting VS2013 compiler.

Publication date: September 11, 2022.

---

### V7.7.1 (2023-03-21, 57 commits)

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_7_1) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_7_0...V7_7_1)

This maintenance release fixes the following critical problems (see also [Release Notes](https://dev.opencascade.org/content/open-cascade-technology-771-maintenance-release)):
<ul>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33171">33171</a>: Modeling Algorithms - The compound with the few solids connected through shared faces becomes invalid after same domain faces unification</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=32977">32977</a>: Data Exchange – Can’t read STEP color correctly for the referenced root label</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33170">33170</a>: Modeling Algorithms - Checking for canonical geometry: plane detection problems</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33144">33144</a>: Modeling Algorithms - Wrong result of Shape Proximity</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33187">33187</a>: Modeling Algorithms - Crash in postprocessing of imported shape</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33173">33173</a>: Modeling Algorithms - BRepExtrema_DistShapeShape causing Standard_OutOfRange exception [Regression]</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=26441">26441</a>: Modeling Algorithms - BRepOffset_MakeOffset affects original shape</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33179">33179</a>: Modeling Algorithms - Crash in ShapeFix_Shape with the attached object, when healing for fixing SameParameterFlag</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=27122">27122</a>: Data Exchange - Invalid shapes are produced during model translation due to huge face tolerance when importing STEP [Regression]</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33193">33193</a>: Modeling Algorithms - UnifySameDomain raises SIGSEGV [Regression]</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=32818">32818</a>: Modeling Algorithms - Result of sweep operation is invalid</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33217">33217</a>: DRAW - Debug tools DrawTrSurf_Set, DrawTrSurf_SetPnt and DrawTrSurf_SetPnt2d cannot be used in some environments</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33180">33180</a>: Modeling Algorithms - Crash while using Build() on BRepOffsetAPI_ThruSections class</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=32934">32934</a>: Modelling Algorithms - BRepExtrema_DistShapeShape returns two solutions instead of one</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=22821">22821</a>: Modeling Algorithms - Crash of BRepFilletAPI_MakeFillet related to high value of ChFi3d_Builder::tolesp parameter</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33156">33156</a>: Modeling Algorithms - Planar face creation problem</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=31865">31865</a>: Mesh - triangulation fails with large deflection values due to unhandled Standard_OutOfRange, BRepMesh_PairOfIndex::Append()</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33228">33228</a>: Data Exchange, DE Wrapper - Make the document argument of the method Read const handle</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33230">33230</a>: Data Exchange, DE Wrapper - Update API to find CAD provider</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33232">33232</a>: Data Exchange, DE_Wrapper - Implement ability to change global session</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33218">33218</a>: Data Exchange - XCAFPrs_Texture does not allow to use classes inherited from Image_Texture</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33250">33250</a>: Configuration - Missing Limits header file</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33235">33235</a>: Configuration - Solving the problem with static building of ExpToCasExe</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=31919">31919</a>: Modeling Algorithms - General Fuse raises exception on attempt to imprint a contour to a shell</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=30781">30781</a>: Modeling Algorithms - Sweep algorithm creates non-planar edges (orig. BOPAlgo_MakerVolume fails to build a solid)</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33244">33244</a>: Modeling Algorithms - Surface-surface intersection produces the double curves</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33265">33265</a>: Modeling Algorithms - Boolean operation hangs on the attached shapes</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33247">33247</a>: Modeling Algorithms - BOP report small edges problem and produce empty result</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33304">33304</a>: Modeling Data - Floating point signal when converting a B-spline curve to analytical form</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33305">33305</a>: Coding - BOPTools_PairSelector::Clear() method uses "Clear" instead of "clear" on std::vector</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33315">33315</a>: Mesh - BRepMesh_IncrementalMesh takes forever to finish (ends up with system memory)</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33311">33311</a>: Modeling Algorithm - No results of thrusection algorithm</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33312">33312</a>: Data Exchange - NULL-dereference in StepToTopoDS_TranslateShell::Init()</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33320">33320</a>: Data Exchange - Reading of a VRML file with a long line fails</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33307">33307</a>: Data Exchange, Step Import - Crash after reading empty edge loop</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=32570">32570</a>: Visualization, AIS_AnimationObject - define rotation around axis</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=30828">30828</a>: Data Exchange - The commands getting shapes from XCAF document should be available in C++</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=27848">27848</a>: Visualization - Sensitivity of lines is too high</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33317">33317</a>: Data Exchange, Step Export - Ignoring color attached to the reference shape label</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=30055">30055</a>: Modeling Algorithms - BRepOffset_MakeOffset throws "TopoDS_Vertex hasn't gp_Pnt" in intersection mode</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=30292">30292</a>: Modeling Algorithms - BRepBndLib should avoid using Poly_Polygon3D when called with useTriangulation set to false</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33263">33263</a>: Modeling Algorithms - BRepFilletAPI_MakeFillet doesn't work for current parameters</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33227">33227</a>: Modeling Algorithm - BOPAlgo_BuilderSolid generates incomplete result</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33298">33298</a>: Modeling Algorithm - Offset operation gives wrong result</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33306">33306</a>: Modeling Algorithm - Crash in TrimEdge() method</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33264">33264</a>: Modeling Algorithms - Result of section operation is incomplete</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33092">33092</a>: Data Exchange, Documentation - Implementation of DE_Wrapper documentation</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33340">33340</a>: Modeling Algorithm - Improve memory management performance in the "PaveFiller"</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33345">33345</a>: Coding - Memory allocation operators got inaccessible</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33337">33337</a>: DRAW - Can't load plugins on Linux OS</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33327">33327</a>: Data Exchange, IGES Import - SubfigureDef can't read string</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33331">33331</a>: Data Exchange, Step Import - Unsupported Representation Items</li>
</ul>

Note: starting this year we stop supporting VS2013 compiler.

Publication date: April 6, 2023.

---

### V7.7.2 (2023-07-21, 21 commits)

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_7_2) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_7_1...V7_7_2)

This maintenance release fixes the following critical problems (see also [Release Notes](https://dev.opencascade.org/content/open-cascade-technology-772-maintenance-release)):
<ul>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=23638">23638</a>: Data Exchange - Reading IGES file produced invalid shape</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33377">33377</a>: Data Exchange - STEPCAFControl_Reader crash in OCC 7.7.0</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33350">33350</a>: Data Exchange, Step Import - Improving parsing performance</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33318">33318</a>: Data Exchange - Modifying the BRep flag after exporting the shape [Regression]</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=30066">30066</a>: Data Exchange - Fail to load VRML from ArcGIS</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33378">33378</a>: Configuration - Moving ExpToCas into separate module</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33361">33361</a>: Modeling Algorithm - Fuse operation generates incomplete result</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33369">33369</a>: Modeling Algorithms - BRepBuilderAPI_Transform makes invalid shape after transformation</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33382">33382</a>: Configuration - Installation issue for debug mode for static build</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33375">33375</a>: Coding - Static Analyzing processing. [Performance increase]</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33379">33379</a>: Coding - Processing Clang-15 warnings</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33390">33390</a>: Coding - Debug version of OCCT does not compile</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33391">33391</a>: Coding - Clearing old definition way for strcasecmp</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33372">33372</a>: Visualization - Compilation of git master fails against vtk 9.2.6</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=31956">31956</a>: Visualization - provide Image_AlienPixMap::Save() writing into a memory buffer instead of a file</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=31777">31777</a>: Visualization - improve SelectMgr_EntityOwner to process selection scheme</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33366">33366</a>: Documentation - Add description of BRepAlgoAPI_Algo::Shape()</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=33414">33414</a>: Modeling Algorithms - Access violation during executing BRepAlgoAPI_Section::Build()</li>
</ul>

Publication date: August 11, 2023.

---

### V7.8.0 (2023-12-26, 117 commits) ⚠️ Reorganization

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_8_0) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_7_2...V7_8_0)

# Open CASCADE Technology 7.8.0 Released

Open Cascade is delighted to announce the release of Open CASCADE Technology version 7.8.0 to the public.

## Overview

**Version 7.8.0** is a minor release, encompassing approximately 110 improvements and corrections over the previous minor release 7.7.0.

## What's New in OCCT 7.8.0

### General

- Fixed `TDataStd_NamedData HasSmth()` methods to no longer return true for empty containers.
- Improved general performance through code updates with static analysis.
- Implemented "Memory Manager" configurations: Native, TBB, JeMalloc, Flexible. JeMalloc leads to a performance increase of up to 40% for large files.
- Introduced CMake configuration for optimization profiles: Default and Production. Production activates all available compiler optimizations.
- Implemented move semantics into NCollection and TCollection containers.
- Modernized NCollection_Vector(NCollection_DynamicArray), NCollection_Array1, and NCollection_Array2.
- Updated memory allocation functionality to avoid unnecessary memory cleaning (set 0).
- Modernized NCollection_IncAllocator (optimized pool for small objects).

### Modeling

- Addressed multiple bug fixes and improvements for various modeling algorithm methods.
- Increased memory management performance.
- Improved overall modeling stability.
- Resolved canonical geoplane detection problems.

### Visualization

- Resolved compilation issues related to vtk 9.2.6.
- Improved SelectMgr_EntityOwner to process the selection scheme.
- Modified `Image_AlienPixMap::Save()` to write into a memory buffer instead of a file.
- Reduced sensitivity of lines.
- Extended AIS_AnimationObject with syntax for defining rotation around a specific point.
- Introduced separate gesture mappings for dragging to AIS_ViewController.
- Integrated the ability to scale by moving the mouse on the OY axis.

### Mesh

- Fixed `BRepMesh_IncrementalMesh` issue with overflowing system memory.
- `Unhandled Standard_OutOfRange`, `BRepMesh_PairOfIndex::Append()` no longer prevents triangulation with large deflection values.

### Data Exchange

- Resolved multiple issues regarding DE Wrapper and Step import and export.
- Increased STEP parser performance.
- Introduced thread-safety interface to STEP import and export.
- Reorganized DE ToolKits according to specific CAD formats.
- Introduced DE plug-in system to load CAD format providers during library loading time.
- Fixed stability issues with XBF and IGES file formats.
- Addressed general problems with importing VRML V1.
- Improved processing of STEP-oriented dimensions.

### Draw Test Harness

- Enabled loading of plugins on Linux OS.
- Reorganized DRAW DE ToolKits according to specific CAD formats.
- Resolved environment-related issues with debug tools `DrawTrSurf_Set`, `DrawTrSurf_SetPnt`, and `DrawTrSurf_SetPnt2d.

## How to Upgrade

For details on upgrading to the new version, please refer to [OCCT Upgrade Guide](https://dev.opencascade.org/doc/overview/html/occt__upgrade.html).

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_7_0...V7_8_0

---

### V7.8.1 (2024-03-31, 19 commits)

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_8_1) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_8_0...V7_8_1)

<p>Open Cascade is pleased to announce that the next Open CASCADE Technology (OCCT) maintenance release (version 7.8.1) is prepared. The sources of Open CASCADE Technology 7.8.1 are available under the&nbsp;<a href="https://git.dev.opencascade.org/gitweb/?p=occt.git;a=shortlog;h=refs/heads/CR0-781"><b>V7_8_1</b></a>&nbsp;tag in the OCCT repository.</p>
<p>This maintenance release addresses a critical issue regarding backward binary compatibility with version 7.8.0. For users encountering this issue, it's essential to update to version 7.8.1 to ensure seamless integration and operation.</p>
Additionally, please note that the develop branch contains implementations of new functionality and high-level changes. While these enhancements offer exciting features, they cannot be incorporated into binary updates. We encourage users to explore these advancements in the develop branch for future releases.</p>
<p>This maintenance release fixes the following problems:</p>
<ul>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033656">0033656</a>: Foundation Classes - Standard_Type crash during unloading static lib</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033560">0033560</a>: Modeling Algorithms - Raising exception SIGFPE Arithmetic Exception</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033410">0033410</a>: Data Exchange, Step Import - TRIANGULATED_FACE from STEP where there are no pnval entries</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033367">0033367</a>: Modeling Algorithms - Normal projection or BOP problem [Regression]</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0031601">0031601</a>: Modeling Algorithms - BRepOffset_Tool Segmentation Fault</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033638">0033638</a>: Data Exchange, Step Import - Style for tessellated object missed</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033631">0033631</a>: Data Exchange, Step import - Crash by reading STEP file</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033603">0033603</a>: Data Exchange, Step Import - Crash reading corrupted STEP file</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033602">0033602</a>: Data Exchange, Step - Carriage return removing</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033596">0033596</a>: Documentation - Incorrect default value read.step.tessellated</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0025415">0025415</a>: Data Exchange - Invalid result of loading a STEP file</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033383">0033383</a>: Modeling Algorithms - Wire/Face creation problem</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033261">0033261</a>: Data Exchange, Step Import - Empty shape after reading process</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033569">0033569</a>: Data Exchange, STEP - Crash when reading multi-body file</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0025188">0025188</a>: Data Exchange, Step Export - Losing shapes after import</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0032980">0032980</a>: Data Exchange - STEP import produce a crash</li>
	<li><a href="https://tracker.dev.opencascade.org/view.php?id=0033567">0033567</a>: Modeling Data - GeomLib_IsPlanarSurface raises exception SIGFPE Arithmetic Exception in Release mode</li>
</ul>
<p>Publication date: April 1, 2024.</p>
<p>We appreciate the community's continued support and feedback, which contributes to the ongoing improvement of OCCT. Stay tuned for further updates and enhancements.</p>
<p>Best regards,</br>
OCCT3D team</p>

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_8_0...V7_8_1

---

### V7.9.0 (2025-02-17, 272 commits) ⚠️ C++17, API Removal, Deprecation, Reorganization

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_9_0) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_8_1...V7_9_0)

# Open CASCADE Technology 7.9.0 Released

Open Cascade is delighted to announce the release of Open CASCADE Technology version 7.9.0 to the public.

## Overview

**Version 7.9.0** is a minor release incorporating over 250 improvements and bug fixes compared to version 7.8.0.

## What's New in OCCT 7.9.0

### Core

*   Improved code quality through static analysis and consistent code formatting with Clang-Format.
*   Enhanced `Standard_Type` implementation for better RTTI support and optimized `IsKind` operations.
*   Reorganized foundation classes for improved performance, including inlining `Standard_Type` instances.
*   Deprecated the old aliasing for Handle types (e.g., `Handle_<Type>`).
*   Improved memory management and container optimization, including refactoring `ShapeHealingMap` to `NCollection`.
*   Updated map operations with the new `NCollection_MapAlgo` for union, intersection, and other set operations.
*   Updated the `RemoveAll` method in `AsciiString` to correctly truncate the string.

### Build System

*   Added VCPKG manifest mode support (beta) for managing third-party dependencies.
*   Improved handling of third-party dependencies, including Draco, VTK, and OpenVR from Ubuntu packages.
*   Updated the minimum CMake version requirement to 3.10.
*   Added an option to enable/disable Git hash extraction in the version string.
*   Introduced a warning message regarding LGPL 2.1 licensing limitations for static linking.
*   Fixed an issue where `custom.bat/sh` was not regenerated in the build directory.
*   Added compiler version checks for C++17 support.
*   Removed Genproj.
*   Fixed static linking failures.
*   Implemented new PCH for faster compilation.
*   Added MinGW default third-party package support.

### Modeling

*   Fixed multiple issues in the `UnifySameDomain` algorithm, including cases with `SurfaceOfRevolution` or `SurfaceOfLinearExtrusion` based on `TrimmedCurve`.
*   Improved `BRepOffset` and `BRepFill` algorithms, including skipping degenerated curves in `BRepOffset_Tool::TryProject` and adding boundary checks in `BRepFill_Filling`.
*   Enhanced shape processing and transformation handling, including the removal of surfaces after transformation.
*   Fixed various geometric computation issues, including resetting Plane YVector and enhancing intersection handling for closed curves in `IntPatch_Intersection`.
*   Improved the robustness of boolean operations.
*   Added a warning for incomplete wire detection in `WireFromList`.
*   Fixed NURB conversion for degenerated cases.
*   Disabled exception with scaling transformation.
*   Fixed degenerated curves in offset operations.
*   Corrected intersection curves handling.
*   Resolved BRepOffset_Tool segmentation fault.
*   Fixed sphere cutting and Boolean operations.

### Visualization

*   Enhanced `AIS_Manipulator` functionality, including flat skin support and transformation depending on camera rotation.
*   Improved selection handling and transformation persistence.
*   Added support for flat skin in `AIS_Manipulator` presentation.
*   Enhanced Z-layer handling in `V3d_View`, including an option to dump only a selection of z-layers.
*   Improved transparency handling in various rendering modes.
*   Implemented an interface to change `myToFlipOutput` of `OpenGl_View`.
*   Fixed direction calculation for `Select3D_SensitiveCylinder` created from `Geom_CylindricalSurface`.
*   Added support for vertical mouse movement zooming.
*   Enhanced transparency handling for capping in 'Graphic3d_RTM_BLEND_OIT' mode.
*   Fixed selection for simple shapes.
*   Resolved manipulator interaction issues.
*   Fixed transform persistence and view transformation.
*   Addressed transparency and rendering issues.

### Data Exchange

*   Migrated shape healing settings to a single object, `DE_ShapeFixParameters`.
*   **STEP:**
    *   Added metadata support for products, including product attributes.
    *   Enhanced tessellated geometry handling.
    *   Improved thread safety.
    *   Fixed multiple crash issues, including those related to null curves and out-of-range indices.
    *   Added support for `GENERAL_PROPERTY`.
    *   Implemented common logic for scaling during the write procedure.
*   **GLTF:**
    *   Added vertex and edge support.
    *   Improved material handling, including fixing material color space and edge colors.
    *   Enhanced import/export functionality.
    *   Added metadata support.
*   Implemented `XCAFDoc` filter tree functionality.
*   Improved handling of IGES imports, including fixing a resource leak when parsing an invalid file and addressing a crash with degenerated BSplines.
*   Moved `StepData_ConfParameters` to the `DESTEP` package.
*   Reorganized DE Wrapper classes to have a single style and logic: `DE<FORMAT>_Parameters`, `DE<FORMAT>_Provider`, and `DE<FORMAT>_ConfigurationNode`.

### Testing

*   Implemented comprehensive GitHub Actions workflows for build validation (Ubuntu, Windows, MacOS), code formatting, and documentation building.
*   Added automated documentation building.
*   Enhanced test result comparison systems.
*   Improved cross-platform testing support.
*   Added WebAssembly build validation.
*   Added a new TCL command to clear the test folder of skipped tests.

### Documentation

*   Updated code documentation and fixed various typos.
*   Enhanced API documentation.
*   Improved contributing guidelines.
*   Updated issue templates and release notes.
*   Updated links in the README.

## How to Upgrade

For details on upgrading to the new version check [Upgrade 790](https://dev.opencascade.org/doc/occt-7.9.0/overview/html/occt__upgrade.html#upgrade_occt790)

## Windows packages and 3rd-party

The release delivers x64 and x32 binaries in both Release and Debug configurations and third-party libraries, check [GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/V7_9_0)

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_8_0...V7_9_0

---

### V7.9.1 (2025-05-20, 34 commits)

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_9_1) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_0...V7_9_1)

# Open CASCADE Technology 7.9.1 Released

Open Cascade is delighted to announce the release of Open CASCADE Technology version 7.9.1 to the public.

## Overview

**Version 7.9.1** is a maintenance release incorporating over 30 improvements and bug fixes compared to version 7.9.0.

## What's New in OCCT 7.9.1

### Configuration & Build System
- Update VTK configuration and enable optional components ([#395](https://github.com/Open-Cascade-SAS/OCCT/pull/395))
- Update file globbing and condition checks for installation paths ([#399](https://github.com/Open-Cascade-SAS/OCCT/pull/399))
- Extend CMake file filter regex ([#400](https://github.com/Open-Cascade-SAS/OCCT/pull/400))
- Modify VTK 9x handling ([#401](https://github.com/Open-Cascade-SAS/OCCT/pull/401))
- Update VTK optional components ([#403](https://github.com/Open-Cascade-SAS/OCCT/pull/403))
- Remove BUILD_PATCH option in CMake ([#418](https://github.com/Open-Cascade-SAS/OCCT/pull/418))
- Checking for FILES content ([#424](https://github.com/Open-Cascade-SAS/OCCT/pull/424))
- Enhance Qt5 directory detection for Windows ([#419](https://github.com/Open-Cascade-SAS/OCCT/pull/419))
- Remove -symbolic linker flag ([#432](https://github.com/Open-Cascade-SAS/OCCT/pull/432))
- TBB configuration prioritization to release ([#496](https://github.com/Open-Cascade-SAS/OCCT/pull/496))
- Fixed paths to 3rd-party in cmake configuration ([#523](https://github.com/Open-Cascade-SAS/OCCT/pull/523))

### Testing & Quality
- Repeating failed tests in GitHub Actions ([#412](https://github.com/Open-Cascade-SAS/OCCT/pull/412))
- Inspector build error on latest CMake ([#477](https://github.com/Open-Cascade-SAS/OCCT/pull/477))
- Add a new compilation on Clang without PCH ([#540](https://github.com/Open-Cascade-SAS/OCCT/pull/540))

### Foundation Classes
- Host resolving by itself ([#457](https://github.com/Open-Cascade-SAS/OCCT/pull/457))
- Update signal handling for GLIBC compatibility on Linux ([#458](https://github.com/Open-Cascade-SAS/OCCT/pull/458))
- Checking for MallInfo version ([#459](https://github.com/Open-Cascade-SAS/OCCT/pull/459))

### Modeling
- Degenerated curves were not handled by Arrange function ([#396](https://github.com/Open-Cascade-SAS/OCCT/pull/396))
- Improve handling of polygon parameters in NURBS conversion ([#410](https://github.com/Open-Cascade-SAS/OCCT/pull/410))
- Handle void bounding box case in BRepBndLib::AddOptimal ([#470](https://github.com/Open-Cascade-SAS/OCCT/pull/470))
- Bounding BSpline periodic tolerance issue ([#468](https://github.com/Open-Cascade-SAS/OCCT/pull/468))
- Periodic BSpline curve bounding ([#493](https://github.com/Open-Cascade-SAS/OCCT/pull/493))
- XCAFDoc_Editor::RescaleGeometry does not rescale translation of roots reference ([#529](https://github.com/Open-Cascade-SAS/OCCT/pull/529))
- BRepFilletAPI_MakeFillet Segfault with two curves and rim ([#532](https://github.com/Open-Cascade-SAS/OCCT/pull/532))
- General Fuse (BOPAlgo_PaveFiller) optimization ([#514](https://github.com/Open-Cascade-SAS/OCCT/pull/514))

### Visualization
- Refactor mouse click handling logic for improved double-click detection ([#385](https://github.com/Open-Cascade-SAS/OCCT/pull/385))
- AIS_Shape bounding box re-computation is not working properly ([#422](https://github.com/Open-Cascade-SAS/OCCT/pull/422))

### Data Exchange
- DE Wrapper invalidating parameters after 'Load' ([#393](https://github.com/Open-Cascade-SAS/OCCT/pull/393))
- Datum Axis extraction issue ([#407](https://github.com/Open-Cascade-SAS/OCCT/pull/407))
- STEP: AP242 SchemaName Remove dot ([#448](https://github.com/Open-Cascade-SAS/OCCT/pull/448))
- IGES Export: Missing Model Curves in transfer cache ([#483](https://github.com/Open-Cascade-SAS/OCCT/pull/483))
- Small optimization of StepData_StepReaderData ([#543](https://github.com/Open-Cascade-SAS/OCCT/pull/543))

### Documentation
- Enable server-based search and external search options in Doxyfile

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_0...V7_9_1

---

### V7.9.2 (2025-10-19, 27 commits) ⚠️ C++17

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_9_2) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_1...V7_9_2)

# Open CASCADE Technology 7.9.2 Released

Open Cascade is delighted to announce the release of Open CASCADE Technology version 7.9.2 to the public.

## Overview

**Version 7.9.2** is a maintenance release incorporating over 25 improvements and bug fixes compared to version 7.9.1.

## What's New in OCCT 7.9.2

### Configuration & Build System
- VCPKG add TclTk support ([#580](https://github.com/Open-Cascade-SAS/OCCT/pull/580))
- Remove jemalloc port files ([#581](https://github.com/Open-Cascade-SAS/OCCT/pull/581))
- Update C++ standard to C++17
- Fix ARCH for older 32-bit macs ([#626](https://github.com/Open-Cascade-SAS/OCCT/pull/626))
- Fixed issue with CSF variable overwriting ([#561](https://github.com/Open-Cascade-SAS/OCCT/issues/561))

### Testing & Quality
- Update samples C++ version ([#606](https://github.com/Open-Cascade-SAS/OCCT/pull/606))
- Remove marking warnings as errors in CI builds

### Foundation Classes
- Leak of WinAPI resources ([#625](https://github.com/Open-Cascade-SAS/OCCT/pull/625))
- Matrix multiplied issue ([#522](https://github.com/Open-Cascade-SAS/OCCT/pull/522))

### Modeling
- Fix array indexing bug in IntAna_IntQuadQuad::NextCurve method ([#703](https://github.com/Open-Cascade-SAS/OCCT/pull/703))
- CornerMax incorrect realisation in Bnd_Box ([#664](https://github.com/Open-Cascade-SAS/OCCT/pull/664))
- Fix null surface crash in fixshape ([#623](https://github.com/Open-Cascade-SAS/OCCT/pull/623))
- Fix null surface crash in UnifySameDomain ([#624](https://github.com/Open-Cascade-SAS/OCCT/pull/624))
- GeomFill_CorrectedFrenet hangs in some cases ([#630](https://github.com/Open-Cascade-SAS/OCCT/pull/630))
- Mismatch between projected point and parameter in ShapeAnalysis_Curve ([#600](https://github.com/Open-Cascade-SAS/OCCT/pull/600))
- Infinite loop when Simplifying Fuse operation, CPU to 100% ([#557](https://github.com/Open-Cascade-SAS/OCCT/issues/557))

### Shape Healing
- Revolved shape in STEP file is imported inverted ([#699](https://github.com/Open-Cascade-SAS/OCCT/pull/699))

### Visualization
- Do not write comment into binary PPM image (Image_AlienPixMap)

### Data Exchange
- Crash on empty list in STEP ([#671](https://github.com/Open-Cascade-SAS/OCCT/pull/671))
- Facets with empty normals like 'f 1// 2// 3//' in RWObj_Reader ([#520](https://github.com/Open-Cascade-SAS/OCCT/pull/520))
- Fix indices during parsing of arrays in GLTF Reader ([#602](https://github.com/Open-Cascade-SAS/OCCT/pull/602))
- Preserving control directives in Step Export ([#601](https://github.com/Open-Cascade-SAS/OCCT/pull/601))
- Optimize entity graph evaluating ([#562](https://github.com/Open-Cascade-SAS/OCCT/issues/562))

### Draw
- Fix message color mixing ([#685](https://github.com/Open-Cascade-SAS/OCCT/pull/685))
- Misprint in vcomputehlr command leading to error if no Viewer ([#526](https://github.com/Open-Cascade-SAS/OCCT/pull/526))

### Coding
- Reducing relying on exceptions ([#676](https://github.com/Open-Cascade-SAS/OCCT/pull/676))

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_1...V7_9_2

---

### V7.9.3 (2025-12-05, 17 commits)

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V7_9_3) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_2...V7_9_3)

# Open CASCADE Technology 7.9.3 Released

Open Cascade is delighted to announce the release of Open CASCADE Technology version 7.9.3 to the public.

## Overview

**Version 7.9.3** is a maintenance release incorporating over 15 improvements and bug fixes compared to version 7.9.2.

## What's New in OCCT 7.9.3

### Modeling
- Fix memory consumption in BOPAlgo_PaveFiller_6.cxx ([#864](https://github.com/Open-Cascade-SAS/OCCT/pull/864))
- Fix BRepBuilderAPI_GTransform face stretch crash ([#875](https://github.com/Open-Cascade-SAS/OCCT/pull/875))
- Fix Boolean fuse segfaults on loft ([#860](https://github.com/Open-Cascade-SAS/OCCT/pull/860))
- Fix BRepFilletAPI_MakeFillet::Add hangs on adding edge ([#859](https://github.com/Open-Cascade-SAS/OCCT/pull/859))
- Fix crash in BRepFilletAPI_MakeChamfer ([#743](https://github.com/Open-Cascade-SAS/OCCT/pull/743))
- Fix crash in BRepOffsetAPI_MakePipeShell ([#740](https://github.com/Open-Cascade-SAS/OCCT/pull/740))
- Fix segfault on chamfer or fillet approaching ellipse ([#738](https://github.com/Open-Cascade-SAS/OCCT/pull/738))
- Fix ShapeUpgrade_UnifySameDomain crash ([#876](https://github.com/Open-Cascade-SAS/OCCT/pull/876))

### Shape Healing
- Optimize FixFaceOrientation ([#584](https://github.com/Open-Cascade-SAS/OCCT/pull/584))

### Visualization
- Improve detection of full cylinder/cone parameters ([#830](https://github.com/Open-Cascade-SAS/OCCT/pull/830))

### Data Exchange
- Fix hang in STEPCAFControl_Reader ([#733](https://github.com/Open-Cascade-SAS/OCCT/pull/733))

### Application Framework
- Early-return null NamedShape when TNaming_UsedShapes is missing ([#760](https://github.com/Open-Cascade-SAS/OCCT/pull/760))

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_2...V7_9_3

---

### V8.0.0.rc1 (2025-04-13, 57 commits) ⚠️ API Removal, Reorganization

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc1) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_3...V8_0_0_rc1)

Open Cascade is delighted to announce the release of `Open CASCADE Technology version 8.0.0 Release Candidate 1` to the public.

## Overview

Version `V8_0_0_rc1` is a candidate release incorporating over 50 improvements and bug fixes compared to version 7.9.0.

## What is a Release Candidate

A Release Candidate is a tag on the master branch that has completed all test rounds and is stable to use.
Release candidates progress in parallel with maintenance releases, with the difference that maintenance releases remain binary compatible with minor releases and cannot include most improvements.
The cycle for a release candidate is planned to be 5-10 weeks, while maintenance releases occur once per quarter.

## What's New in OCCT 8.0.0-rc1

### Core

* Moved resource directories to `/resource` folder [#427](https://github.com/Open-Cascade-SAS/OCCT/pull/427), [#429](https://github.com/Open-Cascade-SAS/OCCT/pull/429)
* Migration of Inspector to own repository [#438](https://github.com/Open-Cascade-SAS/OCCT/pull/438)
* Migration of ExpToCas to own repository [#442](https://github.com/Open-Cascade-SAS/OCCT/pull/442)
* Reorganize source directory to follow "src/Module/Toolkit/Package/File" template [#450](https://github.com/Open-Cascade-SAS/OCCT/pull/450)
* Host search resolving by itself [#457](https://github.com/Open-Cascade-SAS/OCCT/pull/457)
* Update signal handling for GLIBC compatibility on Linux [#458](https://github.com/Open-Cascade-SAS/OCCT/pull/458)
* Checking for MallInfo version [#459](https://github.com/Open-Cascade-SAS/OCCT/pull/459)
* Introducing `GTest` test system into OCCT as a new way to unit testing to improve stability [#443](https://github.com/Open-Cascade-SAS/OCCT/pull/443)
* HashUtils NoExcept optimization [#473](https://github.com/Open-Cascade-SAS/OCCT/pull/473)

### Build system

* Fixed CMake configuration with VTK configuration built with OCCT [#395](https://github.com/Open-Cascade-SAS/OCCT/pull/395), [#403](https://github.com/Open-Cascade-SAS/OCCT/pull/403)
* TBB configuration prioritization to release [#496](https://github.com/Open-Cascade-SAS/OCCT/pull/496)
* Fixed issue with mismatching installation folder on Unix system [#399](https://github.com/Open-Cascade-SAS/OCCT/pull/399)
* Fixed issue with build patch containing dot symbol [#400](https://github.com/Open-Cascade-SAS/OCCT/pull/400)
* CMake Improvements to work with VTK 9x
* Remove BUILD_PATCH option in CMake [#418](https://github.com/Open-Cascade-SAS/OCCT/pull/418)
* Enhance Qt5 directory detection for Windows [#419](https://github.com/Open-Cascade-SAS/OCCT/pull/419)
* Remove `-symbolic` linker flag from Unix system, which can lead to RTTI issues [#432](https://github.com/Open-Cascade-SAS/OCCT/pull/432)
* Re-Configuration time optimization [#467](https://github.com/Open-Cascade-SAS/OCCT/pull/467)

### Modeling

* GeomFill updated with fix of incorrect arrangement of Degenerated BSpline curve [#396](https://github.com/Open-Cascade-SAS/OCCT/pull/396)
* Improve handling of polygon parameters in NURBS conversion [#410](https://github.com/Open-Cascade-SAS/OCCT/pull/410)
* Fixed issue with calculation of bounding box with faces without PCurves in BRepBndLib::AddOptimal [#470](https://github.com/Open-Cascade-SAS/OCCT/pull/470)
* Fixed issue with periodic BSpline within bounding box calculation [#493](https://github.com/Open-Cascade-SAS/OCCT/pull/493)

### Visualization

* Added possibility to not write warnings about unsupported fonts [#392](https://github.com/Open-Cascade-SAS/OCCT/pull/392)
* Improved double click detection event to prevent long click mismatching [#385](https://github.com/Open-Cascade-SAS/OCCT/pull/385)
* Changed selection behavior and allow HandleMouseClick for schemes, allowing to select an object [#416](https://github.com/Open-Cascade-SAS/OCCT/pull/416)
* Fixed issue with re-computing Bounding box [#422](https://github.com/Open-Cascade-SAS/OCCT/pull/422)

### Data Exchange

* Added support for SurfaceStyleReflectanceAmbientDiffuse and SurfaceStyleReflectanceAmbientDiffuseSpecular classes and reorganized Rendering Parameters catching [#447](https://github.com/Open-Cascade-SAS/OCCT/pull/447)
* Added option to decrease STP file size for export by removing duplicate entities. Average size improvement is 20% [#475](https://github.com/Open-Cascade-SAS/OCCT/pull/475)
* Fixed issue with File and System coordinate system mixing on DE Wrapper interface for Mesh formats [#393](https://github.com/Open-Cascade-SAS/OCCT/pull/393)
* Added stream to GLTF JSON parser to read lines and points [#489](https://github.com/Open-Cascade-SAS/OCCT/pull/489)
* Fixed crash with Datum extraction from STP file [#407](https://github.com/Open-Cascade-SAS/OCCT/pull/407)
* Removed dot from AP242 SchemaName in "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF. {1 0 10303 442 1 1 4 }" [#448](https://github.com/Open-Cascade-SAS/OCCT/pull/448)
* Step entity Direction optimization with decreased memory footprint [#479](https://github.com/Open-Cascade-SAS/OCCT/pull/479)

### Testing

* Added option to repeat failed tests automatically in GH Actions [#412](https://github.com/Open-Cascade-SAS/OCCT/pull/412) 
* Reorganized GitHub actions [#480](https://github.com/Open-Cascade-SAS/OCCT/pull/480)
* GTest tests integration [#471](https://github.com/Open-Cascade-SAS/OCCT/pull/471), [#481](https://github.com/Open-Cascade-SAS/OCCT/pull/481), [#443](https://github.com/Open-Cascade-SAS/OCCT/pull/443)

### Documentation

* Fixed various typos found in codebase [#413](https://github.com/Open-Cascade-SAS/OCCT/pull/413), [#414](https://github.com/Open-Cascade-SAS/OCCT/pull/414), [#495](https://github.com/Open-Cascade-SAS/OCCT/pull/495)
* Migrated documentation generation from TCL to CMake [#441](https://github.com/Open-Cascade-SAS/OCCT/pull/441)

## How to Upgrade

There are no critical changes at the API level. Migration should proceed without issues.

## What's Changed
* Coding - Add flag for font mgr to avoid error message [#392](https://github.com/Open-Cascade-SAS/OCCT/pull/392)
* Data Exchange - DE Wrapper invalidating parameters after 'Load' [#393](https://github.com/Open-Cascade-SAS/OCCT/pull/393)
* Visualization - Refactor mouse click handling logic for improved double-click detection [#385](https://github.com/Open-Cascade-SAS/OCCT/pull/385)
* Modeling - Degenerated curves were not handled by Arrange function [#396](https://github.com/Open-Cascade-SAS/OCCT/pull/396)
* Configuration - Update VTK configuration and enable optional components [#395](https://github.com/Open-Cascade-SAS/OCCT/pull/395)
* Configuration - Update file globbing and condition checks for installation paths [#399](https://github.com/Open-Cascade-SAS/OCCT/pull/399)
* Configuration - Extend CMake file filter regex [#400](https://github.com/Open-Cascade-SAS/OCCT/pull/400)
* Configuration - Modify VTK 9x handling [#401](https://github.com/Open-Cascade-SAS/OCCT/pull/401)
* Data Exchange - Datum Axis extraction issue [#407](https://github.com/Open-Cascade-SAS/OCCT/pull/407)
* Configuration - Update VTK optional components [#403](https://github.com/Open-Cascade-SAS/OCCT/pull/403)
* Modeling - Improve handling of polygon parameters in NURBS conversion [#410](https://github.com/Open-Cascade-SAS/OCCT/pull/410)
* Testing - Repeating failed tests in GH Action [#412](https://github.com/Open-Cascade-SAS/OCCT/pull/412)
* Documentation - Fix various typos found in codebase [#413](https://github.com/Open-Cascade-SAS/OCCT/pull/413)
* Documentation - Fix various typos found in codebase [#414](https://github.com/Open-Cascade-SAS/OCCT/pull/414)
* Visualization, Selection - allow HandleMouseClick for schemes, allowing to select an object [#416](https://github.com/Open-Cascade-SAS/OCCT/pull/416)
* Configuration - Remove BUILD_PATCH option in CMake [#418](https://github.com/Open-Cascade-SAS/OCCT/pull/418)
* Configuration - Checking for FILES content [#424](https://github.com/Open-Cascade-SAS/OCCT/pull/424)
* Visualization - AIS_Shape bounding box re-computation is not working properly [#422](https://github.com/Open-Cascade-SAS/OCCT/pull/422)
* Coding - Include gxx files from global path [#423](https://github.com/Open-Cascade-SAS/OCCT/pull/423)
* Configuration - Enhance Qt5 directory detection for Windows [#419](https://github.com/Open-Cascade-SAS/OCCT/pull/419)
* Configuration - Remove -symbolic linker flag [#432](https://github.com/Open-Cascade-SAS/OCCT/pull/432)
* Configuration - Adding resource packages to toolkit [#427](https://github.com/Open-Cascade-SAS/OCCT/pull/427)
* Data Exchange, Step - AP242 SchemaName remove dot [#448](https://github.com/Open-Cascade-SAS/OCCT/pull/448)
* Coding - Migration of Inspector to own repository [#438](https://github.com/Open-Cascade-SAS/OCCT/pull/438)
* Coding - Migration of ExpToCas to own repository [#442](https://github.com/Open-Cascade-SAS/OCCT/pull/442)
* Configuration - Resource structure reorganization [#429](https://github.com/Open-Cascade-SAS/OCCT/pull/429)
* Documentation - Migration to CMake from TCL [#441](https://github.com/Open-Cascade-SAS/OCCT/pull/441)
* Configuration - Reorganize repository structure [#450](https://github.com/Open-Cascade-SAS/OCCT/pull/450)
* Configuration - Resource generation source path fix [#453](https://github.com/Open-Cascade-SAS/OCCT/pull/453)
* Documentation - Generation schema fixing [#452](https://github.com/Open-Cascade-SAS/OCCT/pull/452)
* Configuration - Update resource path references in build scripts [#454](https://github.com/Open-Cascade-SAS/OCCT/pull/454)
* Foundation Classes - Host resolving by itself [#457](https://github.com/Open-Cascade-SAS/OCCT/pull/457)
* Documentation - Convert module and toolkit names to lowercase for URL generation [#460](https://github.com/Open-Cascade-SAS/OCCT/pull/460)
* Foundation Classes - Update signal handling for GLIBC compatibility on Linux [#458](https://github.com/Open-Cascade-SAS/OCCT/pull/458)
* Foundation Classes - Checking for MallInfo version [#459](https://github.com/Open-Cascade-SAS/OCCT/pull/459)
* Configuration - Add support for Google Test framework in CMake [#443](https://github.com/Open-Cascade-SAS/OCCT/pull/443)
* Testing - Remove PLib_JacobiPolynomial_Test.cxx from GTests [#463](https://github.com/Open-Cascade-SAS/OCCT/pull/463)
* Configure - Fixed issue with static build of DRAWEXE [#462](https://github.com/Open-Cascade-SAS/OCCT/pull/462)
* Configuration - Re-Configuration time optimization [#467](https://github.com/Open-Cascade-SAS/OCCT/pull/467)
* Modeling - Handle void bounding box case in BRepBndLib::AddOptimal [#470](https://github.com/Open-Cascade-SAS/OCCT/pull/470)
* Modeling - Bounding BSpline periodic tolerance issue [#468](https://github.com/Open-Cascade-SAS/OCCT/pull/468)
* Modeling - ElCLib Optimization and testing [#471](https://github.com/Open-Cascade-SAS/OCCT/pull/471)
* Testing - Inspector build error on latest CMake [#477](https://github.com/Open-Cascade-SAS/OCCT/pull/477)
* Foundation Classes - HashUtils NoExcept optimization [#473](https://github.com/Open-Cascade-SAS/OCCT/pull/473)
* Testing - Units Tests for NCollection package [#481](https://github.com/Open-Cascade-SAS/OCCT/pull/481)
* Testing - Reorginize GitHub actions by actions [#480](https://github.com/Open-Cascade-SAS/OCCT/pull/480)
* Data Exchange - Step Direction optimization [#479](https://github.com/Open-Cascade-SAS/OCCT/pull/479)
* Data Exchange, Step - Vis Material support [#447](https://github.com/Open-Cascade-SAS/OCCT/pull/447)
* Modeling - Periodic BSpline curve bounding [#493](https://github.com/Open-Cascade-SAS/OCCT/pull/493)
* Data Exchange, GLTF Reader - Add stream to json parser to read lines and points [#489](https://github.com/Open-Cascade-SAS/OCCT/pull/489)
* Documentation - Fix various typos found in codebase [#495](https://github.com/Open-Cascade-SAS/OCCT/pull/495)
* Configuration - TBB configuration prioritization to release [#496](https://github.com/Open-Cascade-SAS/OCCT/pull/496)
* Coding - MSVC warning fix for STEP Rendering properties [#498](https://github.com/Open-Cascade-SAS/OCCT/pull/498)

## New Contributors
* @sshutina made their first contribution in [#392](https://github.com/Open-Cascade-SAS/OCCT/pull/392)
* @jboissy-mediasofts made their first contribution in [#385](https://github.com/Open-Cascade-SAS/OCCT/pull/385)
* @Xargas made their first contribution in [#396](https://github.com/Open-Cascade-SAS/OCCT/pull/396)

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V7_9_0...V8_0_0_rc1

---

### V8.0.0.rc2 (2025-07-29, 78 commits) ⚠️ C++17, API Removal, Deprecation

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc2) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V8_0_0_rc1...V8_0_0_rc2)

# Open CASCADE Technology Version 8.0.0 Release Candidate 2

Open Cascade is delighted to announce the release of `Open CASCADE Technology version 8.0.0 Release Candidate 2` to the public.

(Release Candidate 1: https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc1)

## Overview

Version `V8_0_0_rc2` is a candidate release incorporating over 80 improvements and bug fixes compared to version V8_0_0_rc1, bringing the total improvements since version 7.9.0 to over 130 changes.

## What is a Release Candidate

A Release Candidate is a tag on the master branch that has completed all test rounds and is stable to use.
Release candidates progress in parallel with maintenance releases, with the difference that maintenance releases remain binary compatible with minor releases and cannot include most improvements.
The cycle for a release candidate is planned to be 5-10 weeks, while maintenance releases occur once per quarter.

## What's New in OCCT 8.0.0-rc2

### Core

* Upgraded minimum C++ version requirement to C++17 [#537](https://github.com/Open-Cascade-SAS/OCCT/pull/537)
* **Geometric Classes Optimization**: Significantly optimized gp_Vec, gp_Vec2d, gp_XY, and gp_XYZ classes by simplifying mathematical computations, replacing indirect API calls with direct data member access in performance-critical sections, and improving matrix operations including inversion, transposition, and power calculations [#578](https://github.com/Open-Cascade-SAS/OCCT/pull/578)
* Reworked atomic and Standard_Condition implementation [#598](https://github.com/Open-Cascade-SAS/OCCT/pull/598)
* Optimized NCollection_Array1 with type-specific improvements [#608](https://github.com/Open-Cascade-SAS/OCCT/pull/608)
* Reworked math_DoubleTab to use NCollection container [#607](https://github.com/Open-Cascade-SAS/OCCT/pull/607)
* Fixed WinAPI resource leaks [#625](https://github.com/Open-Cascade-SAS/OCCT/pull/625)
* Fixed include brackets type issues [#635](https://github.com/Open-Cascade-SAS/OCCT/pull/635)
* Geom package copy optimization [#645](https://github.com/Open-Cascade-SAS/OCCT/pull/645)

### Build System and Configuration

* **Comprehensive VCPKG Support**: Added full VCPKG layout configuration with CMake file placement in share/ directory for compliance, introduced OCCT_PROJECT_NAME parameter for customizing directory structure, and updated environment scripts while maintaining backward compatibility [#618](https://github.com/Open-Cascade-SAS/OCCT/pull/618), [#637](https://github.com/Open-Cascade-SAS/OCCT/pull/637), [#638](https://github.com/Open-Cascade-SAS/OCCT/pull/638)
* Added VCPKG port opencascade with TclTk and GTest support [#580](https://github.com/Open-Cascade-SAS/OCCT/pull/580), [#616](https://github.com/Open-Cascade-SAS/OCCT/pull/616)
* Implemented flexible project root configuration [#641](https://github.com/Open-Cascade-SAS/OCCT/pull/641)
* Fixed build config file validation issues [#647](https://github.com/Open-Cascade-SAS/OCCT/pull/647)
* Disabled GLTF build without RapidJSON [#646](https://github.com/Open-Cascade-SAS/OCCT/pull/646)
* Fixed link errors on macOS when not building using vcpkg [#609](https://github.com/Open-Cascade-SAS/OCCT/pull/609)
* Fixed CSF variable overwriting issues [#561](https://github.com/Open-Cascade-SAS/OCCT/pull/561)
* Fixed paths to 3rd-party in cmake configuration [#523](https://github.com/Open-Cascade-SAS/OCCT/pull/523)
* Fixed ARCH detection for older 32-bit Macs [#626](https://github.com/Open-Cascade-SAS/OCCT/pull/626)
* Removed unused CMake scripts and dependencies [#644](https://github.com/Open-Cascade-SAS/OCCT/pull/644), [#581](https://github.com/Open-Cascade-SAS/OCCT/pull/581)
* Fixed samples CMake configuration [#643](https://github.com/Open-Cascade-SAS/OCCT/pull/643)

### Modeling

* **New Helix Toolkit**: Implemented a complete TKHelix toolkit with geometric helix curve adaptor and topological builders, featuring advanced B-spline approximation algorithms for high-quality helix representation and comprehensive TCL command interface [#648](https://github.com/Open-Cascade-SAS/OCCT/pull/648)
* Added option to not build history in BRepFill_PipeShell [#632](https://github.com/Open-Cascade-SAS/OCCT/pull/632)
* Fixed GeomFill_CorrectedFrenet hanging in some cases [#630](https://github.com/Open-Cascade-SAS/OCCT/pull/630)
* Fixed infinite loop in Simplifying Fuse operation [#557](https://github.com/Open-Cascade-SAS/OCCT/pull/557)
* Fixed Bnd_BoundSortBox::Compare failures in some cases [#518](https://github.com/Open-Cascade-SAS/OCCT/pull/518)
* **General Fuse Optimization**: Improved BOPAlgo_PaveFiller performance by adding null checks for triangulation in BRep_Tool::IsClosed, simplifying index lookup logic in BOPDS_DS, and introducing helper functions for better clarity and robustness [#514](https://github.com/Open-Cascade-SAS/OCCT/pull/514)
* Fixed BRepFilletAPI_MakeFiller segfault with two curves and rim [#532](https://github.com/Open-Cascade-SAS/OCCT/pull/532)
* Fixed mismatch between projected point and parameter in ShapeAnalysis_Curve [#600](https://github.com/Open-Cascade-SAS/OCCT/pull/600)

### Shape Healing

* Implemented reusing Surface Analysis for Wire fixing [#565](https://github.com/Open-Cascade-SAS/OCCT/pull/565)

### Visualization

* Enhanced FFmpeg Compatibility Layer and updated Video Recorder [#582](https://github.com/Open-Cascade-SAS/OCCT/pull/582)
* Fixed binary PPM image comment writing in Image_AlienPixMap [#413c08272b](https://github.com/Open-Cascade-SAS/OCCT/commit/413c08272b)
* Updated Graphic3d_Aspects::PolygonOffsets documentation [#519](https://github.com/Open-Cascade-SAS/OCCT/pull/519)
* Marked Immediate Mode rendering methods as deprecated in AIS_InteractiveContext [#521](https://github.com/Open-Cascade-SAS/OCCT/pull/521)

### Data Exchange

* Fixed GLTF indices parsing during array processing [#602](https://github.com/Open-Cascade-SAS/OCCT/pull/602)
* Implemented non-uniform scaling in GLTF Import [#503](https://github.com/Open-Cascade-SAS/OCCT/pull/503)
* Fixed GLTF saving edges when Merge Faces is enabled [#554](https://github.com/Open-Cascade-SAS/OCCT/pull/554)
* Changed GLTF export line type to LINE_STRIP [#535](https://github.com/Open-Cascade-SAS/OCCT/pull/535)
* Fixed missing GDT values in STP Import [#617](https://github.com/Open-Cascade-SAS/OCCT/pull/617)
* Preserved control directives in Step Export [#601](https://github.com/Open-Cascade-SAS/OCCT/pull/601)
* Ignored unit factors during tessellation export [#577](https://github.com/Open-Cascade-SAS/OCCT/pull/577)
* Applied scaling transformation in Step Export [#513](https://github.com/Open-Cascade-SAS/OCCT/pull/513)
* Fixed missing Model Curves in IGES Export transfer cache [#483](https://github.com/Open-Cascade-SAS/OCCT/pull/483)
* Fixed XCAFDoc_Editor::RescaleGeometry not rescaling translation of roots reference [#529](https://github.com/Open-Cascade-SAS/OCCT/pull/529)
* Fixed facets with empty normals handling in RWObj_Reader [#520](https://github.com/Open-Cascade-SAS/OCCT/pull/520)
* Added conversion utilities for STEP geometrical and visual enumerations [#545](https://github.com/Open-Cascade-SAS/OCCT/pull/545)
* Added missing headers [#530](https://github.com/Open-Cascade-SAS/OCCT/pull/530)
* Optimized StepData_StepReaderData [#543](https://github.com/Open-Cascade-SAS/OCCT/pull/543)
* Optimized entity graph evaluating [#562](https://github.com/Open-Cascade-SAS/OCCT/pull/562)
* Removed GLTF files from XDEDRAW [#649](https://github.com/Open-Cascade-SAS/OCCT/pull/649)
* Removed unused dependencies from TKXDEDRAW [#650](https://github.com/Open-Cascade-SAS/OCCT/pull/650)

### Testing

* Updated GitHub Actions to use latest versions [#640](https://github.com/Open-Cascade-SAS/OCCT/pull/640)
* Added performance summary posting to PR [#612](https://github.com/Open-Cascade-SAS/OCCT/pull/612)
* Fixed master validation workflow [#611](https://github.com/Open-Cascade-SAS/OCCT/pull/611)
* Added daily vcpkg package validation [#605](https://github.com/Open-Cascade-SAS/OCCT/pull/605)
* Updated samples C++ version [#606](https://github.com/Open-Cascade-SAS/OCCT/pull/606)
* Removed extra GitHub jobs [#594](https://github.com/Open-Cascade-SAS/OCCT/pull/594)
* Added ASCII code validation [#593](https://github.com/Open-Cascade-SAS/OCCT/pull/593)
* Migrated PR actions to VCPKG-based [#587](https://github.com/Open-Cascade-SAS/OCCT/pull/587)
* Added compilation on Clang without PCH [#540](https://github.com/Open-Cascade-SAS/OCCT/pull/540)
* Enabled IR integration concurrency [#531](https://github.com/Open-Cascade-SAS/OCCT/pull/531), [#536](https://github.com/Open-Cascade-SAS/OCCT/pull/536)

### Draw and Tools

* Fixed vcomputehlr misprint leading to error if no Viewer [#526](https://github.com/Open-Cascade-SAS/OCCT/pull/526)
* Updated DrawDefault script to handle missing directory cases [#542](https://github.com/Open-Cascade-SAS/OCCT/pull/542)

### Documentation

* Added missing description to HLRBRep_HLRToShape methods [#525](https://github.com/Open-Cascade-SAS/OCCT/pull/525)
* Added Copilot instructions for OCCT development [#589](https://github.com/Open-Cascade-SAS/OCCT/pull/589)

## How to Upgrade

There are no critical breaking changes at the API level, however note the following:

* **C++17 Requirement**: The minimum C++ version has been upgraded to C++17. Ensure your compiler supports this standard.
* **Deprecated Methods**: Some Immediate Mode rendering methods in AIS_InteractiveContext have been marked as deprecated.

Migration should proceed smoothly for most applications.

## Performance Improvements

This release includes several significant performance optimizations:
* **Geometric Classes**: Major performance improvements in gp_Vec, gp_Vec2d, gp_XY, and gp_XYZ classes through direct data access and simplified computations
* **Boolean Operations**: General Fuse algorithm optimization with improved index lookup and null safety checks
* **Memory Management**: Geom package copy optimization and NCollection_Array1 type-specific improvements
* **Data Exchange**: StepData_StepReaderData optimization for faster STEP file processing
* **Foundation Classes**: math_DoubleTab rework using NCollection containers for better memory efficiency

## New Contributors
* @iosdevzone made their first contribution in https://github.com/Open-Cascade-SAS/OCCT/pull/609

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V8_0_0_rc1...V8_0_0_rc2

---

### V8.0.0.rc3 (2025-12-15, 157 commits) ⚠️ C++17, API Removal, Deprecation, Reorganization, Threading

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc3) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V8_0_0_rc2...V8_0_0_rc3)

# Open CASCADE Technology Version 8.0.0 Release Candidate 3

Open Cascade is delighted to announce the release of **Open CASCADE Technology version 8.0.0 Release Candidate 3** to the public.

- [Release Candidate 2](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc2)
- [Release Candidate 1](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc1)

## Overview

Version **8.0.0-rc3** is a candidate release incorporating **157 improvements and bug fixes** compared to version 8.0.0-rc2, bringing the total improvements since version 7.9.0 to over **290 changes**.

This release focuses on:
- **Modernization of math functions** with migration to C++ standard library
- **Threading improvements** with migration from `Standard_Mutex` to `std::mutex`
- **Performance optimizations** across Foundation Classes, especially BSpline computations
- **API improvements** with `constexpr`/`noexcept` annotations throughout the codebase
- **Data Exchange enhancements** including stream support and STEP metadata export

## What is a Release Candidate

A Release Candidate is a tag on the master branch that has completed all test rounds and is stable to use. Release candidates progress in parallel with maintenance releases, with the difference that maintenance releases remain binary compatible with minor releases and cannot include most improvements. The cycle for a release candidate is planned to be 5-10 weeks, while maintenance releases occur once per quarter.

---

## What's New in OCCT 8.0.0-rc3

### Foundation Classes

#### Math Functions Modernization
- **Deprecated math global functions in favor of `std` equivalents** [#833](https://github.com/Open-Cascade-SAS/OCCT/pull/833): The following functions are now deprecated and will be removed in future releases:
  - `ACos()`, `ASin()`, `ATan()`, `ATan2()` → use `std::acos`, `std::asin`, `std::atan`, `std::atan2`
  - `Sinh()`, `Cosh()`, `Tanh()` → use `std::sinh`, `std::cosh`, `std::tanh`
  - `ASinh()`, `ACosh()`, `ATanh()` → use `std::asinh`, `std::acosh`, `std::atanh`
  - `Sqrt()`, `Log()`, `Log10()`, `Exp()` → use `std::sqrt`, `std::log`, `std::log10`, `std::exp`
  - `Pow()`, `Abs()`, `Sign()` → use `std::pow`, `std::abs`, `std::copysign`
  - `Sin()`, `Cos()`, `Tan()` → use `std::sin`, `std::cos`, `std::tan`
  - `Floor()`, `Ceiling()`, `Round()` → use `std::floor`, `std::ceil`, `std::round`
  - `IntegerPart()` → use `std::trunc`
  - `Min()`, `Max()` → use `std::min`, `std::max`
  - `NextAfter()` → use `std::nextafter`

#### Threading Modernization
- **Replaced `Standard_Mutex` with `std::mutex`** [#766](https://github.com/Open-Cascade-SAS/OCCT/pull/766): Migrated from legacy mutex implementation to standard C++ mutexes across all modules:
  - Use `std::lock_guard` or `std::unique_lock` instead of `Standard_Mutex::Sentry`
  - Use `std::mutex` instead of `Standard_Mutex`
  - Optional mutex holders now use `std::unique_ptr<std::mutex>`

#### Geometric Primitives (`gp`)
- **Added standard direction enumerations** [#803](https://github.com/Open-Cascade-SAS/OCCT/pull/803): New `gp_Dir::D` and `gp_Dir2d::D` enums for standard directions (X, Y, Z, NX, NY, NZ)
- **Enhanced constructors with `constexpr`/`noexcept`** [#798](https://github.com/Open-Cascade-SAS/OCCT/pull/798), [#796](https://github.com/Open-Cascade-SAS/OCCT/pull/796), [#790](https://github.com/Open-Cascade-SAS/OCCT/pull/790): Geometric primitives (circles, cones, cylinders, axes) now have constexpr constructors

#### Strings
- **Added `EmptyString()` methods** [#788](https://github.com/Open-Cascade-SAS/OCCT/pull/788): New `TCollection_AsciiString::EmptyString()` and `TCollection_ExtendedString::EmptyString()` for efficient empty string access
- **Optimized `TCollection_AsciiString`** [#752](https://github.com/Open-Cascade-SAS/OCCT/pull/752): Pre-defined string optimization for better performance

#### Math Containers
- **Move semantics for `math_Matrix` and `math_Vector`** [#841](https://github.com/Open-Cascade-SAS/OCCT/pull/841): Added move constructors and move assignment operators for efficient container transfers

#### BSpline Optimizations
- **Optimized BSpline cache** [#906](https://github.com/Open-Cascade-SAS/OCCT/pull/906), [#897](https://github.com/Open-Cascade-SAS/OCCT/pull/897): Improved BSpline data containers with `constexpr` and validation, optimized local calls
- **Enhanced B-Spline curve computation** [#855](https://github.com/Open-Cascade-SAS/OCCT/pull/855): Performance improvements for curve calculations

#### Other Foundation Improvements
- **Optimized `Bnd` package** [#839](https://github.com/Open-Cascade-SAS/OCCT/pull/839), [#856](https://github.com/Open-Cascade-SAS/OCCT/pull/856): Bounding box optimizations and fixes
- **Modernized `Bnd_B2` and `Bnd_B3`** [#838](https://github.com/Open-Cascade-SAS/OCCT/pull/838): Template-based implementation
- **Enhanced BVH implementation** [#842](https://github.com/Open-Cascade-SAS/OCCT/pull/842), [#858](https://github.com/Open-Cascade-SAS/OCCT/pull/858): Generic vector types and transformation tests
- **Performance improvements for `TopExp` package** [#831](https://github.com/Open-Cascade-SAS/OCCT/pull/831)
- **Optimized `Quantity` package** [#834](https://github.com/Open-Cascade-SAS/OCCT/pull/834)
- **Improved `NCollection` vector constructors** [#835](https://github.com/Open-Cascade-SAS/OCCT/pull/835)
- **Modernized `NCollection_SparseArrayBase`** [#804](https://github.com/Open-Cascade-SAS/OCCT/pull/804)
- **EigenValuesSearcher improvements** [#714](https://github.com/Open-Cascade-SAS/OCCT/pull/714)
- **Refactored `CSLib` package with GTests** [#857](https://github.com/Open-Cascade-SAS/OCCT/pull/857)
- **Refactored `Extrema` package** [#869](https://github.com/Open-Cascade-SAS/OCCT/pull/869)
- **Compile-time sqrt constants** [#789](https://github.com/Open-Cascade-SAS/OCCT/pull/789)
- **Precomputed Jacobi coefficients** [#778](https://github.com/Open-Cascade-SAS/OCCT/pull/778)
- **Constexpr Pascal allocator for `PLib::Bin`** [#777](https://github.com/Open-Cascade-SAS/OCCT/pull/777)
- **Added precision-related methods in `Precision.hxx`** [#811](https://github.com/Open-Cascade-SAS/OCCT/pull/811)
- **Angle normalization refactor for `ElSLib`/`ElCLib`** [#813](https://github.com/Open-Cascade-SAS/OCCT/pull/813)

### Modeling Data

- **New `GeomHash` and `Geom2dHash` packages** [#845](https://github.com/Open-Cascade-SAS/OCCT/pull/845): Hash functions for geometric curves and surfaces enabling efficient comparison and caching

### Modeling Algorithms

- **Enhanced periodic curve handling in `ChFi3d_Builder`** [#892](https://github.com/Open-Cascade-SAS/OCCT/pull/892)
- **Improved parameter validation logic in BSplineCache** [#829](https://github.com/Open-Cascade-SAS/OCCT/pull/829)

### Shape Healing

- **Optimized PCurve projection** [#890](https://github.com/Open-Cascade-SAS/OCCT/pull/890)
- **Optimized `FixFaceOrientation`** [#584](https://github.com/Open-Cascade-SAS/OCCT/pull/584)

### Data Exchange

#### Stream Support
- **Implemented stream support for `DE_Wrapper`** [#663](https://github.com/Open-Cascade-SAS/OCCT/pull/663): Stream-based read/write methods for STEP, STL, VRML, and other formats with validation utilities

#### STEP Improvements
- **STEP General Attributes export** [#634](https://github.com/Open-Cascade-SAS/OCCT/pull/634): Export string metadata as STEP `property_definition` entities
- **STEP coordinate system connection points import** [#779](https://github.com/Open-Cascade-SAS/OCCT/pull/779)
- **`std::string_view` for STEP type names** [#784](https://github.com/Open-Cascade-SAS/OCCT/pull/784): Performance improvement using `std::string_view` for type recognition
- **Refactored `StepType` selection** [#786](https://github.com/Open-Cascade-SAS/OCCT/pull/786)
- **Custom hasher for string_view types in `RWStepAP214`** [#888](https://github.com/Open-Cascade-SAS/OCCT/pull/888)

#### Plugin System
- **Reorganized DE plugin system** [#696](https://github.com/Open-Cascade-SAS/OCCT/pull/696): New `Register`/`UnRegister` methods for configuration nodes, `DE_MultiPluginHolder` for multiple registrations

### Visualization

- **Improved detection of full cylinder/cone parameters** [#830](https://github.com/Open-Cascade-SAS/OCCT/pull/830)
- **Fixed AABB transformation method** [#735](https://github.com/Open-Cascade-SAS/OCCT/pull/735)

### Build and Configuration

- **Fixed C++ standard options and NOMINMAX scope** [#907](https://github.com/Open-Cascade-SAS/OCCT/pull/907)
- **Modernized compiler flags for C++17** [#867](https://github.com/Open-Cascade-SAS/OCCT/pull/867)
- **Updated macOS compiler flags and includes** [#884](https://github.com/Open-Cascade-SAS/OCCT/pull/884)
- **Updated VCPKG version** [#878](https://github.com/Open-Cascade-SAS/OCCT/pull/878)
- **Validated configuration on CMake 3.10+** [#762](https://github.com/Open-Cascade-SAS/OCCT/pull/762)
- **C++17 version macro** [#785](https://github.com/Open-Cascade-SAS/OCCT/pull/785)
- **Updated `.gitignore` with explicit allowlist** [#787](https://github.com/Open-Cascade-SAS/OCCT/pull/787)

### Testing

- **Migrated QA DRAW tests to GTest** [#818](https://github.com/Open-Cascade-SAS/OCCT/pull/818), [#823](https://github.com/Open-Cascade-SAS/OCCT/pull/823)
- **Migrated QA NCollection to GTests** [#709](https://github.com/Open-Cascade-SAS/OCCT/pull/709)
- **Added Boolean operation GTests** [#721](https://github.com/Open-Cascade-SAS/OCCT/pull/721)
- **Added `ShapeAnalysis_CanonicalRecognition` unit tests** [#720](https://github.com/Open-Cascade-SAS/OCCT/pull/720)
- **Added `Standard_ArrayStreamBuffer` unit tests** [#708](https://github.com/Open-Cascade-SAS/OCCT/pull/708)
- **Added PLib functionality unit tests** [#705](https://github.com/Open-Cascade-SAS/OCCT/pull/705)
- **Covered math module with GTests** [#684](https://github.com/Open-Cascade-SAS/OCCT/pull/684)
- **Enhanced `BRepOffsetAPI_ThruSections_Test` with B-spline support** [#891](https://github.com/Open-Cascade-SAS/OCCT/pull/891)

---

## Bug Fixes

### Modeling
- **Fixed thickness operation regression on circle-to-polygon lofts** [#889](https://github.com/Open-Cascade-SAS/OCCT/pull/889)
- **Fixed `ShapeUpgrade_UnifySameDomain` crash** [#876](https://github.com/Open-Cascade-SAS/OCCT/pull/876)
- **Fixed `BRepBuilderAPI_GTransform` face stretch crash** [#875](https://github.com/Open-Cascade-SAS/OCCT/pull/875)
- **Fixed out-of-range access in `BSplCLib_Reverse`** [#863](https://github.com/Open-Cascade-SAS/OCCT/pull/863)
- **Fixed Boolean fuse segfault on loft** [#860](https://github.com/Open-Cascade-SAS/OCCT/pull/860)
- **Fixed `BRepFilletAPI_MakeFillet::Add` hang** [#859](https://github.com/Open-Cascade-SAS/OCCT/pull/859)
- **Fixed `BRepFilletAPI_MakeChamfer` crash** [#743](https://github.com/Open-Cascade-SAS/OCCT/pull/743)
- **Fixed `BRepOffsetAPI_MakePipeShell` crash** [#740](https://github.com/Open-Cascade-SAS/OCCT/pull/740)
- **Fixed chamfer/fillet crash approaching ellipse** [#738](https://github.com/Open-Cascade-SAS/OCCT/pull/738)
- **Fixed array indexing bug in `IntAna_IntQuadQuad::NextCurve`** [#703](https://github.com/Open-Cascade-SAS/OCCT/pull/703)
- **Fixed null surface crash in `fixshape`** [#623](https://github.com/Open-Cascade-SAS/OCCT/pull/623)
- **Fixed null surface crash in `UnifySameDomain`** [#624](https://github.com/Open-Cascade-SAS/OCCT/pull/624)
- **Fixed `Bnd_Box::CornerMax` incorrect implementation** [#664](https://github.com/Open-Cascade-SAS/OCCT/pull/664)
- **Fixed memory consumption in `BOPAlgo_PaveFiller_6`** [#864](https://github.com/Open-Cascade-SAS/OCCT/pull/864)

### Shape Healing
- **Fixed regression after #584** [#753](https://github.com/Open-Cascade-SAS/OCCT/pull/753), [#769](https://github.com/Open-Cascade-SAS/OCCT/pull/769)
- **Fixed inverted revolved shape import from STEP** [#699](https://github.com/Open-Cascade-SAS/OCCT/pull/699)
- **Reverted BSpline check for `ShapeConstruct_ProjectCurveOnSurface`** [#894](https://github.com/Open-Cascade-SAS/OCCT/pull/894)

### Data Exchange
- **Fixed STEP import crash on empty list** [#671](https://github.com/Open-Cascade-SAS/OCCT/pull/671)
- **Fixed `STEPCAFControl_Reader` hang** [#733](https://github.com/Open-Cascade-SAS/OCCT/pull/733)

### Mesh
- **Fixed stack overflow when meshing** [#695](https://github.com/Open-Cascade-SAS/OCCT/pull/695)
- **Fixed STEP file import crash when visualizing boundary curves** [#745](https://github.com/Open-Cascade-SAS/OCCT/pull/745)

### Application Framework
- **Early-return null `NamedShape` when `TNaming_UsedShapes` is missing** [#760](https://github.com/Open-Cascade-SAS/OCCT/pull/760)

### Visualization
- **Fixed unexpected moving with `AIS_ViewCube`** [#727](https://github.com/Open-Cascade-SAS/OCCT/pull/727)

### Draw
- **Fixed message color mixing** [#685](https://github.com/Open-Cascade-SAS/OCCT/pull/685)
- **Fixed dangerous use of 'cin'** [#681](https://github.com/Open-Cascade-SAS/OCCT/pull/681)
- **Fixed incorrect return-value check for scanf-like functions** [#680](https://github.com/Open-Cascade-SAS/OCCT/pull/680)

---

## Migration Guide

### Deprecated Math Functions

All OCCT math wrapper functions that duplicate C++ standard library functionality are now deprecated. While they still work, you should migrate to `std::` equivalents:

```cpp
// Before (deprecated)
double angle = ACos(value);
double dist = Sqrt(x*x + y*y);
double result = Max(a, b);
double val = Abs(x);

// After (recommended)
double angle = std::acos(value);
double dist = std::sqrt(x*x + y*y);
double result = std::max(a, b);
double val = std::abs(x);
```

#### Complete Mapping

| Deprecated Function | Standard Replacement |
|---------------------|---------------------|
| `ACos(x)` | `std::acos(x)` |
| `ASin(x)` | `std::asin(x)` |
| `ATan(x)` | `std::atan(x)` |
| `ATan2(y, x)` | `std::atan2(y, x)` |
| `Cos(x)` | `std::cos(x)` |
| `Sin(x)` | `std::sin(x)` |
| `Tan(x)` | `std::tan(x)` |
| `Cosh(x)` | `std::cosh(x)` |
| `Sinh(x)` | `std::sinh(x)` |
| `Tanh(x)` | `std::tanh(x)` |
| `ACosh(x)` | `std::acosh(x)` |
| `ASinh(x)` | `std::asinh(x)` |
| `ATanh(x)` | `std::atanh(x)` |
| `Sqrt(x)` | `std::sqrt(x)` |
| `Log(x)` | `std::log(x)` |
| `Log10(x)` | `std::log10(x)` |
| `Exp(x)` | `std::exp(x)` |
| `Pow(x, y)` | `std::pow(x, y)` |
| `Abs(x)` | `std::abs(x)` |
| `Sign(a, b)` | `std::copysign(a, b)` |
| `Floor(x)` | `std::floor(x)` |
| `Ceiling(x)` | `std::ceil(x)` |
| `Round(x)` | `std::round(x)` |
| `IntegerPart(x)` | `std::trunc(x)` |
| `Min(a, b)` | `std::min(a, b)` |
| `Max(a, b)` | `std::max(a, b)` |
| `NextAfter(x, y)` | `std::nextafter(x, y)` |

**Note:** `ACosApprox()` is also deprecated; use `std::acos()` instead.

### Standard_Mutex Migration

Replace legacy mutex usage with standard C++ threading primitives:

```cpp
// Before
#include <Standard_Mutex.hxx>

Standard_Mutex myMutex;
Standard_Mutex::Sentry aSentry(myMutex);
// or
myMutex.Lock();
// ... critical section ...
myMutex.Unlock();

// After
#include <mutex>

std::mutex myMutex;
std::lock_guard<std::mutex> aLock(myMutex);
// or for more control:
std::unique_lock<std::mutex> aLock(myMutex);
```

For optional/heap-allocated mutexes:
```cpp
// Before
Standard_Mutex* myOptionalMutex;

// After
std::unique_ptr<std::mutex> myOptionalMutex;
```

### PLib_Base Removal

`PLib_Base` abstract base class has been removed. `PLib_JacobiPolynomial` and `PLib_HermitJacobi` are now value types (not Handle-based):

```cpp
// Before
Handle(PLib_JacobiPolynomial) aJacobi = new PLib_JacobiPolynomial(...);
aJacobi->D0(...);

// After
PLib_JacobiPolynomial aJacobi(...);
aJacobi.D0(...);  // Note: method is now const
```

### PLib_DoubleJacobiPolynomial Removal

The `PLib_DoubleJacobiPolynomial` class has been completely removed. If you were using it, you'll need to refactor your code to use `PLib_JacobiPolynomial` directly.

### TopTools_MutexForShapeProvider Removal

The `TopTools_MutexForShapeProvider` class has been removed. Use `std::mutex` with shape providers directly.

### OSD_MAllocHook Removal

The `OSD_MAllocHook` class and the Draw command `mallochook` have been removed. Use platform-specific memory debugging tools instead (Valgrind, AddressSanitizer, etc.).

### QANCollection Package Removal

The `QANCollection` package (test utilities for collections) has been removed. Use GTest-based tests in `src/*/GTests/` directories instead.

### Transfer_TransferDeadLoop Deprecation

The `Transfer_TransferDeadLoop` exception class is deprecated. Dead loop detection now uses local status flags instead of exceptions. The class is kept for backward compatibility but should not be used in new code.

### StepData_ReadWriteModule::StepType() API Change

The `StepType()` method now returns `const std::string_view&` instead of `TCollection_AsciiString`:

```cpp
// Before
TCollection_AsciiString aType = aModule->StepType(aTypeNum);

// After
const std::string_view& aType = aModule->StepType(aTypeNum);
// If you need TCollection_AsciiString:
TCollection_AsciiString aTypeStr(aType.data(), static_cast<int>(aType.length()));
```

### Using Standard Direction Enumerations

New convenient enumerations for standard directions:

```cpp
// Before
gp_Dir aDir(1.0, 0.0, 0.0);  // X direction
gp_Dir aNegZ(0.0, 0.0, -1.0); // Negative Z

// After
gp_Dir aDir(gp_Dir::D::X);   // X direction
gp_Dir aNegZ(gp_Dir::D::NZ); // Negative Z

// Available: X, Y, Z, NX, NY, NZ for gp_Dir
// Available: X, Y, NX, NY for gp_Dir2d
```

### Empty String Access

Use the new static methods for efficient empty string access:

```cpp
// Before
TCollection_AsciiString anEmpty;
const TCollection_AsciiString& GetEmpty() { static TCollection_AsciiString s; return s; }

// After
const TCollection_AsciiString& anEmpty = TCollection_AsciiString::EmptyString();
const TCollection_ExtendedString& anEmptyExt = TCollection_ExtendedString::EmptyString();
```

---

## Removed Functionality

| Item | Commit | Replacement |
|------|--------|-------------|
| `OSD_MAllocHook` class | [#707](https://github.com/Open-Cascade-SAS/OCCT/pull/707) | Platform memory tools |
| `PLib_Base` class | [#795](https://github.com/Open-Cascade-SAS/OCCT/pull/795) | Direct value types |
| `PLib_DoubleJacobiPolynomial` | [#781](https://github.com/Open-Cascade-SAS/OCCT/pull/781) | `PLib_JacobiPolynomial` |
| `TopTools_MutexForShapeProvider` | [#766](https://github.com/Open-Cascade-SAS/OCCT/pull/766) | `std::mutex` |
| `QANCollection` package | [#718](https://github.com/Open-Cascade-SAS/OCCT/pull/718) | GTests |
| `Standard_Mutex` (effectively) | [#766](https://github.com/Open-Cascade-SAS/OCCT/pull/766) | `std::mutex` |

---

## Deprecated Functionality

| Item | Commit | Replacement |
|------|--------|-------------|
| Math global functions (`ACos`, `Sin`, etc.) | [#833](https://github.com/Open-Cascade-SAS/OCCT/pull/833) | `std::` equivalents |
| `ACosApprox()` | [#833](https://github.com/Open-Cascade-SAS/OCCT/pull/833) | `std::acos()` |
| `Transfer_TransferDeadLoop` exception | [#817](https://github.com/Open-Cascade-SAS/OCCT/pull/817) | Status flags |

---

## Performance Improvements Summary

- BSpline cache optimized for local calls [#906](https://github.com/Open-Cascade-SAS/OCCT/pull/906)
- BSpline data containers with `constexpr` and validation [#897](https://github.com/Open-Cascade-SAS/OCCT/pull/897)
- PCurve projection optimization [#890](https://github.com/Open-Cascade-SAS/OCCT/pull/890)
- BndLib optimization [#856](https://github.com/Open-Cascade-SAS/OCCT/pull/856)
- Bnd package optimization and fixes [#839](https://github.com/Open-Cascade-SAS/OCCT/pull/839)
- B-Spline curve computation enhancement [#855](https://github.com/Open-Cascade-SAS/OCCT/pull/855)
- Quantity package optimization [#834](https://github.com/Open-Cascade-SAS/OCCT/pull/834)
- TopExp package performance improvements [#831](https://github.com/Open-Cascade-SAS/OCCT/pull/831)
- AsciiString optimization with pre-defined strings [#752](https://github.com/Open-Cascade-SAS/OCCT/pull/752)
- FixFaceOrientation optimization [#584](https://github.com/Open-Cascade-SAS/OCCT/pull/584)
- EigenValuesSearcher improvements [#714](https://github.com/Open-Cascade-SAS/OCCT/pull/714)
- Math container optimization [#717](https://github.com/Open-Cascade-SAS/OCCT/pull/717)
- Move semantics for math_Matrix/math_Vector [#841](https://github.com/Open-Cascade-SAS/OCCT/pull/841)
- Precomputed Jacobi coefficients [#778](https://github.com/Open-Cascade-SAS/OCCT/pull/778)
- Constexpr Pascal allocator for PLib::Bin [#777](https://github.com/Open-Cascade-SAS/OCCT/pull/777)
- STEP type recognition using `std::string_view` [#784](https://github.com/Open-Cascade-SAS/OCCT/pull/784)

---

## Documentation

Extensive documentation improvements including:
- Whitespace and typo fixes across the codebase [#806-#824](https://github.com/Open-Cascade-SAS/OCCT/pull/806)
- Comment uniformity improvements [#767](https://github.com/Open-Cascade-SAS/OCCT/pull/767), [#771](https://github.com/Open-Cascade-SAS/OCCT/pull/771)
- Updated AI Assistant guidelines [#854](https://github.com/Open-Cascade-SAS/OCCT/pull/854)
- TCollection documentation update [#665](https://github.com/Open-Cascade-SAS/OCCT/pull/665)

---

## Acknowledgments

We thank all contributors who helped make this release possible through their code contributions, bug reports, and testing.

## New Contributors
* @sander-adamson-cloudnc made their first contribution in https://github.com/Open-Cascade-SAS/OCCT/pull/624
* @petrasvestartas made their first contribution in https://github.com/Open-Cascade-SAS/OCCT/pull/634
* @Rodrigo-BLyra made their first contribution in https://github.com/Open-Cascade-SAS/OCCT/pull/735
* @gsegon made their first contribution in https://github.com/Open-Cascade-SAS/OCCT/pull/741

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V8_0_0_rc2...V8_0_0_rc3

---

### V8.0.0.rc4 (2026-02-16, 111 commits) ⚠️ C++17, API Removal, Deprecation, Exception Handling, Threading, Class Hierarchy

[GitHub Release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc4) · [Full Changelog](https://github.com/Open-Cascade-SAS/OCCT/compare/V8_0_0_rc3...V8_0_0_rc4)

# Open CASCADE Technology Version 8.0.0 Release Candidate 4

Open Cascade is delighted to announce the release of **Open CASCADE Technology version 8.0.0 Release Candidate 4** to the public.

- [Release Candidate 3](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc3)
- [Release Candidate 2](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc2)
- [Release Candidate 1](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8_0_0_rc1)

## Overview

Version **8.0.0-rc4** is a candidate release incorporating **111 improvements and bug fixes** compared to version 8.0.0-rc3, bringing the total improvements since version 7.9.0 to over **400 changes**.

This release focuses on:
- **Redesigned geometry evaluation architecture**: New `EvalD*` API with POD result structs replaces old virtual `D0/D1/D2/D3` methods, elementary geometry evaluation devirtualized via `std::variant` dispatch, new EvalRep descriptor system decouples geometry identity from evaluation strategy, all 29 leaf Geom/Geom2d classes marked `final`
- **Elimination of heap indirection in core geometry classes**: BSpline/Bezier classes use direct value-member arrays instead of handle-wrapped heap storage, always-populated weights via static unit-weights buffer eliminates pervasive null-check patterns across ~100 call sites
- **Topological data structure overhaul**: `TopoDS_TShape` hierarchy replaces linked-list child storage with contiguous arrays, bit-packs shape state into `uint16_t`, devirtualizes `ShapeType()`, and introduces index-based iteration
- **Modern C++ foundation layer**: `Standard_Failure` inherits from `std::exception`, error handlers use `thread_local` storage eliminating global mutex contention, reference counting uses optimized memory ordering, mesh plugin system replaced with registry-based factory
- **New high-performance collections**: Robin Hood hash maps (`NCollection_FlatDataMap`/`FlatMap`), insertion-order-preserving maps (`NCollection_OrderedMap`/`OrderedDataMap`), header-only KD-Tree for spatial queries, C++17 structured binding support via `Items()` views, unified map API with `Contained`/`TryEmplace`/`TryBind`
- **Numerical solver improvements**: Laguerre polynomial root-finder, coordinate-wise Brent polishing for PSO/DE improving precision by 4+ orders of magnitude, batch 2D curve evaluation, BSplCLib interpolation hot-path optimizations
- **Comprehensive automated migration toolkit**: 12-phase Python script suite in `adm/scripts/migration_800/` for migrating external projects to 8.0.0 APIs

## What is a Release Candidate

A Release Candidate is a tag on the master branch that has completed all test rounds and is stable to use. Release candidates progress in parallel with maintenance releases, with the difference that maintenance releases remain binary compatible with minor releases and cannot include most improvements. The cycle for a release candidate is planned to be 5-10 weeks, while maintenance releases occur once per quarter.

---

## What's New in OCCT 8.0.0-rc4

### Foundation Classes

#### High-Performance Collections
- **New `NCollection_FlatDataMap` and `NCollection_FlatMap`** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): Cache-friendly open-addressing hash containers with Robin Hood hashing:
  - All key-value pairs stored inline in contiguous array (eliminates per-element heap allocations)
  - Robin Hood hashing reduces probe sequence variance for more predictable performance
  - Power-of-2 sizing for fast modulo operations via bitwise AND
  - Cached hash codes for faster collision handling and rehashing
  - Also in this PR: optimized `Standard_Transient` reference counting with explicit memory ordering (following `std::shared_ptr` pattern), deprecated `Standard_Mutex` in favor of `std::mutex`

- **New `NCollection_KDTree`** [#1073](https://github.com/Open-Cascade-SAS/OCCT/pull/1073): Header-only static balanced KD-Tree for efficient spatial point queries:
  - Nearest-neighbor search in O(log N), k-nearest, range (sphere), box (AABB), and sphere containment queries
  - Works with `gp_Pnt`, `gp_Pnt2d`, `gp_XYZ`, `gp_XY` out-of-the-box
  - Optional per-point radii via compile-time template parameter
  - Weighted nearest queries support

- **New `NCollection_OrderedMap` and `NCollection_OrderedDataMap`** [#1072](https://github.com/Open-Cascade-SAS/OCCT/pull/1072): Insertion-order-preserving hash containers using intrusive doubly-linked list:
  - O(1) hash lookup, O(1) append/remove
  - Deterministic iteration in insertion order
  - O(1) removal (unlike `NCollection_IndexedMap` which requires O(n) swap-and-shrink)

- **Try* and Emplace methods for NCollection maps** [#1022](https://github.com/Open-Cascade-SAS/OCCT/pull/1022): Non-throwing lookup operations and in-place construction:
  ```cpp
  if (auto* pValue = aMap.TryBind(key, defaultValue)) { /* use pValue */ }
  aMap.Emplace(key, constructorArgs...);  // No copy/move!
  ```

- **Emplace methods for NCollection containers** [#1035](https://github.com/Open-Cascade-SAS/OCCT/pull/1035): In-place construction support for `NCollection_List` (`EmplaceAppend`, `EmplacePrepend`, `EmplaceBefore`, `EmplaceAfter`), `NCollection_Sequence`, `NCollection_DynamicArray`, `NCollection_Array1`, and `NCollection_Array2`

- **Items() views with C++17 structured bindings** [#1038](https://github.com/Open-Cascade-SAS/OCCT/pull/1038): Key-value pair iteration for NCollection map classes:
  ```cpp
  for (auto [aKey, aValue] : aMap.Items()) { ... }
  ```
  Added `Items()` for DataMap, FlatDataMap, IndexedDataMap and `IndexedItems()` for IndexedMap and IndexedDataMap

- **NCollection_List optimization** [#1040](https://github.com/Open-Cascade-SAS/OCCT/pull/1040): `std::initializer_list` constructor, improved const-correctness, optimized move constructor, `Exchange()` method

- **Unified map API and collection performance optimizations** [#1065](https://github.com/Open-Cascade-SAS/OCCT/pull/1065): API unification and performance improvements across NCollection:
  - Unified map API: `Contained()` added to all map types returning `std::optional<std::reference_wrapper<T>>`, `TryEmplace`/`TryBind` parity across all map types
  - NCollection_UBTree/EBTree: iterative stack-based traversal replacing recursion (prevents stack overflow on deep trees), move semantics
  - NCollection_LocalArray: move semantics, `Reallocate()` for use as growable stack
  - NCollection_CellFilter: proper move semantics replacing destructive-copy hack
  - Removed dead Sun WorkShop/Borland compiler workarounds

- **TColStd_PackedMapOfInteger refactoring** [#1023](https://github.com/Open-Cascade-SAS/OCCT/pull/1023): Improved implementation of specialized integer set

- **Keep deprecated NCollection aliases** [#1026](https://github.com/Open-Cascade-SAS/OCCT/pull/1026): Deprecated package type aliases (`TColStd_*`, `TopTools_*`) kept for backward compatibility with deprecation warnings

#### Exception Handling Revolution
- **Standard_Failure inherits from std::exception** [#984](https://github.com/Open-Cascade-SAS/OCCT/pull/984): Bridges OCCT's exception system with standard C++:
  - OCCT exceptions now caught by standard `catch (const std::exception&)` blocks
  - Internal storage switched from `occ::handle` to `std::shared_ptr`
  - New `what()` method implements std::exception interface
  - New `ExceptionType()` virtual method for exception class identification
  - Exception classes simplified to pure data containers
  - Removed `Raise()`, `Instance()`, `Throw()` static methods - use `throw` instead

- **Thread-local error handler stack** [#980](https://github.com/Open-Cascade-SAS/OCCT/pull/980): Replaced global mutex-protected stack with `thread_local` storage:
  - Zero lock overhead - no mutex acquisition for error handler operations
  - Perfect scalability - threads never contend on error handler state
  - Especially beneficial in TBB/OpenMP parallelized algorithms
  - Removed: `Catches()`, `LastCaughtError()` methods
  - Updated `OCC_CATCH_SIGNALS` macro with new `Raise()` re-throw method

- **Use throw instead of legacy Standard_Failure::Raise** [#983](https://github.com/Open-Cascade-SAS/OCCT/pull/983): Migrated codebase to modern C++ exception throwing

#### Math and Solver Enhancements
- **Cache-friendly matrix multiplication** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): Changed `math_Matrix::Multiply()` from i-j-k to i-k-j loop order for row-major storage with significant speedup for large matrices

- **SIMD-friendly vector norm** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): 4-way loop unrolling for `math_VectorBase::Norm()/Norm2()` with pairwise partial sum combination

- **Optimized atomic reference counting** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): `Standard_Transient` uses explicit memory ordering (`memory_order_relaxed` for increment, `memory_order_release` for decrement with acquire fence only at zero)

- **Laguerre polynomial solver and Newton API refactoring** [#1086](https://github.com/Open-Cascade-SAS/OCCT/pull/1086): New `MathPoly_Laguerre` for general polynomial root finding with Laguerre + deflation, including Quintic/Sextic/Octic helpers. Refactored specialized Newton solvers (2D/3D/4D) to unified fixed-size API

- **Coordinate-wise polishing for PSO and DE solvers** [#1088](https://github.com/Open-Cascade-SAS/OCCT/pull/1088): Brent-based coordinate-wise polishing phase improving component-level precision from ~1e-4 to 1e-8+ for separable functions. New `BrentAlongCoordinate` in `MathUtils_LineSearch`, new `MathUtils_Random` utility

- **PLib polynomial evaluation optimization** [#953](https://github.com/Open-Cascade-SAS/OCCT/pull/953)
- **MathRoot and MathSys enhancements** [#954](https://github.com/Open-Cascade-SAS/OCCT/pull/954): New mathematical utilities
- **math_DirectPolynomialRoots refactoring** [#937](https://github.com/Open-Cascade-SAS/OCCT/pull/937)
- **TKMath modernization with new packages** [#944](https://github.com/Open-Cascade-SAS/OCCT/pull/944)
- **math_Vector Resize functionality** [#957](https://github.com/Open-Cascade-SAS/OCCT/pull/957)

#### Bnd Package Improvements
- **Bnd package improvements** [#1051](https://github.com/Open-Cascade-SAS/OCCT/pull/1051): Multiple bug fixes (`Bnd_Box::Add`, `IsOut`, `Distance`; `Bnd_Range::Common`; `Bnd_Sphere::SquareDistances`; `Bnd_OBB` degenerate cases), performance optimizations (early return fast paths for `IsOut`), and API improvements (`Contains()`/`Intersects()` wrappers, `Center()`/`Min()`/`Max()`/`Get()` returning `std::optional`, `IntersectStatus` enum). Added `[[nodiscard]]` and `noexcept` annotations

- **BVH Box and Rays improvements** [#882](https://github.com/Open-Cascade-SAS/OCCT/pull/882)

#### String Enhancements
- **std::u16string_view support for TCollection_ExtendedString** [#1009](https://github.com/Open-Cascade-SAS/OCCT/pull/1009): Modern Unicode string handling
- **TCollection_AsciiString UTF-8 fix** [#1070](https://github.com/Open-Cascade-SAS/OCCT/pull/1070): Fixed multibyte UTF-8 handling in `UsefullLength()` which was treating individual UTF-8 continuation bytes as non-graphic, causing premature truncation of strings ending with non-ASCII characters

#### Convert Package Refactoring
- **Replace handle-based APIs with direct array access** [#1057](https://github.com/Open-Cascade-SAS/OCCT/pull/1057): Replaced heap-allocated handle-based storage with direct `NCollection_Array` members throughout the Convert package. Deprecated single-element accessors in favor of batch const-reference accessors

#### Other Foundation Improvements
- **TopLoc_Location::HashCode optimization** [#1006](https://github.com/Open-Cascade-SAS/OCCT/pull/1006): Faster hash computation for location objects
- **gp_Pln refactoring** [#1003](https://github.com/Open-Cascade-SAS/OCCT/pull/1003): Improved plane geometry class
- **Extend precompiled headers** [#1029](https://github.com/Open-Cascade-SAS/OCCT/pull/1029): Faster compilation times

### Modeling Data

#### BSpline/Bezier Memory Optimization
- **BSpline/Bezier classes refactored to direct array members** [#1056](https://github.com/Open-Cascade-SAS/OCCT/pull/1056): Replaced handle-based `NCollection_HArray1`/`HArray2` members with direct `NCollection_Array1`/`Array2` value members in all Geom BSpline and Bezier classes (curves and surfaces). Eliminates heap indirection and reference counting overhead. Bug fixes for `Geom_BSplineCurve::IsEqual` skipping knot comparison, `Geom_BSplineSurface::SetUNotPeriodic`/`SetVNotPeriodic` wrong constructor, `Geom_BezierSurface::Increase` self-referencing `Init`

- **Always-populated weights and direct array access** [#1058](https://github.com/Open-Cascade-SAS/OCCT/pull/1058): BSpline/Bezier weights arrays are now always populated (non-rational geometry uses non-owning view over static unit-weights buffer, zero allocation). New `WeightsArray()` accessor always returns valid reference. Bug fix in `Hermit.cxx`: fixed long-standing typo `Pole0 < 3` that should be `Pole0 < Pole3`

- **Optimize BSplCLib interpolation and blend evaluation** [#1082](https://github.com/Open-Cascade-SAS/OCCT/pull/1082): Four categories of hot-path optimization: (1) static initialization for GeomFill convertor matrices that were recomputed on every call, (2) stack allocation for small matrices/arrays to avoid heap allocation, (3) raw pointer access in hot loops replacing multi-layer accessor chains with bounds checks, (4) eliminated redundant recomputation with cached solver instances and `NbPoles()` results. Also fixes undefined behavior in `BSplCLib::NbPoles`

#### Geometry Evaluation Overhaul
- **EvalRep descriptors and dispatch for Geom/Geom2d** [#1089](https://github.com/Open-Cascade-SAS/OCCT/pull/1089): New extensible evaluation dispatch architecture that decouples geometry identity from evaluation strategy. Per-object `Set`/`Get`/`Clear` EvalRep API with support for full, derivative-bounded, and parameter-mapped descriptors. Enables alternate evaluation paths -- e.g., an offset surface can carry its equivalent non-offset surface as an EvalRep, bypassing the expensive offset evaluation path. Migrated `Geom_OffsetSurface` equivalent-surface path as proof-of-concept

- **Redesigned evaluation hierarchy with EvalD0/D1/D2/D3 API** [#1064](https://github.com/Open-Cascade-SAS/OCCT/pull/1064), [#1094](https://github.com/Open-Cascade-SAS/OCCT/pull/1094): Fundamental redesign of the geometry evaluation dispatch hierarchy across all 32 Geom/Geom2d curve and surface classes. New `EvalD0`/`EvalD1`/`EvalD2`/`EvalD3`/`EvalDN` virtual methods serve as the primary dispatch points, returning new POD result structs (`Geom_CurveD1`/`D2`/`D3`, `Geom_SurfD1`/`D2`/`D3`, `Geom2d_CurveD1`/`D2`/`D3`). Old `D0`/`D1`/`D2`/`D3`/`DN` methods retained as non-virtual inline backward-compatible wrappers. The final API uses direct struct returns with exception-based error handling (chosen over `std::optional` wrapping for evaluation hot-path performance)

- **Devirtualize adaptor dispatch, mark leaf Geom classes final** [#1063](https://github.com/Open-Cascade-SAS/OCCT/pull/1063): Eliminates virtual method dispatch on the geometry evaluation hot path by storing `gp_*` primitives directly in `std::variant` inside adaptor classes and dispatching via switch/enum to `ElCLib`/`ElSLib` static methods. Marks all 29 concrete leaf classes as `final` in `Geom_*` and `Geom2d_*` hierarchies, enabling compiler devirtualization. Bug fix: `ShallowCopy` in `GeomAdaptor_Curve`/`Surface` now correctly copies elementary types in the variant

- **Geom2dGridEval package for batch 2D curve evaluation** [#1079](https://github.com/Open-Cascade-SAS/OCCT/pull/1079): New package mirroring `GeomGridEval` for 3D, providing batch evaluation of 2D curves with specialized evaluators for conics (analytical) and BSpline/Bezier (cache-based)

- **Optimize adaptor Bezier cache and grid eval threshold** [#1084](https://github.com/Open-Cascade-SAS/OCCT/pull/1084): Removed redundant `IsCacheValid()` checks for Bezier curves/surfaces (single span, always valid), lowered cache threshold for more aggressive cache-based evaluation

#### TShape Hierarchy Optimization
- **TShape hierarchy redesign for performance and memory efficiency** [#1027](https://github.com/Open-Cascade-SAS/OCCT/pull/1027): Fundamental redesign of OCCT's most critical topological data structure:
  - Child storage changed from `NCollection_List` (linked list) to `NCollection_DynamicArray` (contiguous memory) with type-specific default bucket sizes (e.g., TEdge=2 for vertices, TWire=8 for edges)
  - `ShapeType()` now non-virtual - embedded in compact `uint16_t myState` bit-packed field (4 bits for type, 8 bits for flags)
  - New `TopoDS_TShapeDispatch` for `std::visit`-style devirtualized type dispatch
  - `TopAbs::Compose()`, `Reverse()`, `Complement()` moved inline to header
  - `TopoDS_Iterator` refactored from list-based to index-based iteration
  - Result: Smaller TShape objects, cache-friendly child traversal, faster shape exploration

#### Other Modeling Data Improvements
- **Simplify EmplaceValue in Array1 and Array2** [#1087](https://github.com/Open-Cascade-SAS/OCCT/pull/1087)

### Modeling Algorithms

#### Geometry Evaluation Optimization
- **GeomGridEval optimization and simplification** [#908](https://github.com/Open-Cascade-SAS/OCCT/pull/908), [#951](https://github.com/Open-Cascade-SAS/OCCT/pull/951), [#952](https://github.com/Open-Cascade-SAS/OCCT/pull/952), [#1031](https://github.com/Open-Cascade-SAS/OCCT/pull/1031): Improved surface grid evaluation with sequential processing
- **Bnd_BoundSortBox optimization** [#958](https://github.com/Open-Cascade-SAS/OCCT/pull/958)
- **Optimized point-to-plane projection helper** [#959](https://github.com/Open-Cascade-SAS/OCCT/pull/959): Batch processing support
- **Optimize properties computation for complex compounds** [#1091](https://github.com/Open-Cascade-SAS/OCCT/pull/1091): Reduced `TopLoc_Location` composition overhead in edge pcurve lookup, added fast-path exits in `TopLoc_Location::Predivided()` for identity and equal-location cases, cached face surface/location in `BRepGProp_Face`

#### Algorithm Refactoring
- **IntCurveSurface and HLRBRep intersection refactoring** [#912](https://github.com/Open-Cascade-SAS/OCCT/pull/912), [#936](https://github.com/Open-Cascade-SAS/OCCT/pull/936): Complete code sharing for Polyhedron classes
- **Offset curve and surface evaluators refactoring** [#930](https://github.com/Open-Cascade-SAS/OCCT/pull/930)
- **Extrusion and revolution Utils refactoring** [#948](https://github.com/Open-Cascade-SAS/OCCT/pull/948): Accept pre-computed curve values
- **Evaluator classes refactoring** [#935](https://github.com/Open-Cascade-SAS/OCCT/pull/935): Inline Utils and variant-based Adaptors
- **HLRAlgo_PolyData::Box replacement with Bnd_Box** [#923](https://github.com/Open-Cascade-SAS/OCCT/pull/923)
- **Extrema_ExtPS refactoring** [#978](https://github.com/Open-Cascade-SAS/OCCT/pull/978)
- **BOPDS refactoring** [#1007](https://github.com/Open-Cascade-SAS/OCCT/pull/1007)
- **IntTools Box calculation optimization** [#990](https://github.com/Open-Cascade-SAS/OCCT/pull/990)
- **Update tolerance settings in BRepBlend_AppFuncRoot** [#1083](https://github.com/Open-Cascade-SAS/OCCT/pull/1083): Regression fix after BSplCLib interpolation optimization

#### Bug Fixes
- **Fixed solid-level caching bugs in BRepGProp volume properties** [#1092](https://github.com/Open-Cascade-SAS/OCCT/pull/1092): Fixed SkipShared semantics broken for same-placement duplicates causing double-counting, and free faces/shells dropped when shared solids exist
- **Fixed crash in ComputePolesIndexes()** [#1049](https://github.com/Open-Cascade-SAS/OCCT/pull/1049): Fixed bounds checking where `theOutMinIdx` could exceed upper bound and `theOutMaxIdx` could be less than lower bound
- **Fixed partial torus creation with inverted V range** [#928](https://github.com/Open-Cascade-SAS/OCCT/pull/928)
- **Fixed 0-based index in BRep_Tool::CurveOnSurface call** [#949](https://github.com/Open-Cascade-SAS/OCCT/pull/949)
- **Fixed curve concatenation to use actual endpoints** [#926](https://github.com/Open-Cascade-SAS/OCCT/pull/926)
- **Fixed unnecessary loop iteration in BRepLib::BuildCurve3d** [#921](https://github.com/Open-Cascade-SAS/OCCT/pull/921)

### Shape Healing

- **GlueEdgesWithPCurves validation fix** [#981](https://github.com/Open-Cascade-SAS/OCCT/pull/981)
- **Unstable PCurve Processing fix** [#967](https://github.com/Open-Cascade-SAS/OCCT/pull/967)
- **Remove edges from map during face unification in ShapeUpgrade_UnifySameDomain** [#941](https://github.com/Open-Cascade-SAS/OCCT/pull/941)

### Mesh

- **Registry-based factory pattern replacing plugin system** [#1033](https://github.com/Open-Cascade-SAS/OCCT/pull/1033): Major architecture change:
  - Replaced legacy DISCRETPLUGIN/DISCRETALGO symbol-based plugin system
  - New `BRepMesh_DiscretAlgoFactory` abstract base with static registry
  - `BRepMesh_IncrementalMeshFactory` for "FastDiscret" algorithm
  - `XBRepMesh_Factory` for "XBRepMesh" extended meshing
  - Eliminated symbol collisions when TKMesh and TKXMesh both loaded
  - Cleaner C++ design without dynamic symbol lookup
  - Removed: `BRepMesh_PluginMacro.hxx`, `BRepMesh_PluginEntryType.hxx`, `BRepMesh_FactoryError.hxx`
  - Removed Draw commands: `mpsetfunctionname`, `mpgetfunctionname`, `mperror`

- **Fixed point-in-polygon check for CCW polygons in BRepMesh_Delaun** [#920](https://github.com/Open-Cascade-SAS/OCCT/pull/920)

### Visualization

- **Remove obsolete UNLIT shading optimization** [#1069](https://github.com/Open-Cascade-SAS/OCCT/pull/1069): Removed implicit optimization in `OpenGl_Aspects` that forced UNLIT shading when material had no reflection properties. This was breaking PBR materials, interior color handling, and texture modulation. Legacy code now explicitly sets `SetShadingModel(Unlit)`

- **Avoid redundant shape copies in AIS_ColoredShape::dispatchColors** [#1068](https://github.com/Open-Cascade-SAS/OCCT/pull/1068): Deferred `EmptyCopied()` and `BRep_Builder::Add()` to avoid redundant shape construction; compound built only when required

### Data Exchange

- **STEP: Refactor pnindex handling in CreatePolyTriangulation** [#1067](https://github.com/Open-Cascade-SAS/OCCT/pull/1067): Separated direct node indexing and pnindex remapping into distinct code paths

### Build and Configuration

- **Accept empty FILES content** [#1017](https://github.com/Open-Cascade-SAS/OCCT/pull/1017)
- **Clean up the FILES** [#1002](https://github.com/Open-Cascade-SAS/OCCT/pull/1002)
- **Disable usage of VTK by default** [#939](https://github.com/Open-Cascade-SAS/OCCT/pull/939)
- **Fix CMake static linking warnings** [#1075](https://github.com/Open-Cascade-SAS/OCCT/pull/1075): Fixed missing spaces in warning messages

### Testing

- **Update CI workflow to build and test on Ubuntu with GCC** [#1028](https://github.com/Open-Cascade-SAS/OCCT/pull/1028)
- **Use current run ID to download test results for platforms** [#1025](https://github.com/Open-Cascade-SAS/OCCT/pull/1025)
- **Update font installation process for Windows to use Noto Sans CJK** [#999](https://github.com/Open-Cascade-SAS/OCCT/pull/999)
- **Remove long-running DRAW test cases with low diagnostic value** [#1093](https://github.com/Open-Cascade-SAS/OCCT/pull/1093): Removed 5 test cases consuming ~590s total CI time
- **Cleanup GTests layout and move TKXCAF test** [#1080](https://github.com/Open-Cascade-SAS/OCCT/pull/1080): Removed empty GTests stubs, moved `XCAFDoc_Test.cxx` to correct location

### Coding Quality

#### Global Refactoring
- **Global Refactoring OCCT as part of 8.0.0** [#955](https://github.com/Open-Cascade-SAS/OCCT/pull/955): Comprehensive codebase modernization
- **Clang-Tidy application with refactoring** [#965](https://github.com/Open-Cascade-SAS/OCCT/pull/965), [#977](https://github.com/Open-Cascade-SAS/OCCT/pull/977)
- **Fix GCC warnings** [#975](https://github.com/Open-Cascade-SAS/OCCT/pull/975)
- **Fixed MSVC warnings** [#1004](https://github.com/Open-Cascade-SAS/OCCT/pull/1004), [#1060](https://github.com/Open-Cascade-SAS/OCCT/pull/1060)
- **Suppress macOS system header warnings** [#997](https://github.com/Open-Cascade-SAS/OCCT/pull/997)
- **Fix critical CodeQL static analysis warnings** [#1074](https://github.com/Open-Cascade-SAS/OCCT/pull/1074): Fixed use-after-free in `Interface_ParamSet::Append()`, upcast pointer arithmetic bug in `delabella.cpp`, signed integer overflow in `AdvApp2Var_MathBase`. Also fixed pure virtual call during destruction in `NCollection_SparseArrayBase` by replacing virtual dispatch with function pointers, eliminating the vtable entirely
- **Fix clang warning suppression for function pointer casts** [#1059](https://github.com/Open-Cascade-SAS/OCCT/pull/1059)
- **Fix compilation warnings** [#1034](https://github.com/Open-Cascade-SAS/OCCT/pull/1034)

#### Code Cleanup
- **HArray and HSequence Definitions refactoring** [#962](https://github.com/Open-Cascade-SAS/OCCT/pull/962)
- **HLRBRep algorithms: Replace Standard_Address with typed pointers** [#947](https://github.com/Open-Cascade-SAS/OCCT/pull/947), [#961](https://github.com/Open-Cascade-SAS/OCCT/pull/961)
- **Remove unused typedefs and includes** [#971](https://github.com/Open-Cascade-SAS/OCCT/pull/971)
- **Remove unused code and comments** [#968](https://github.com/Open-Cascade-SAS/OCCT/pull/968)
- **Remove redundant null checks before deallocation** [#1077](https://github.com/Open-Cascade-SAS/OCCT/pull/1077): Cleaned up 39 files
- **BSplineCurve and BSplineSurface parameter preparation refactoring** [#972](https://github.com/Open-Cascade-SAS/OCCT/pull/972)
- **Add constexpr compatibility to more gp classes** [#933](https://github.com/Open-Cascade-SAS/OCCT/pull/933)
- **Translate French comments and modernize constants** [#932](https://github.com/Open-Cascade-SAS/OCCT/pull/932)
- **Move semantics and default constructor for CSLib_Class2d** [#919](https://github.com/Open-Cascade-SAS/OCCT/pull/919)
- **Optimize memory management in BOPAlgo classes** [#915](https://github.com/Open-Cascade-SAS/OCCT/pull/915)
- **Prevent copy and move operations in BRepAlgoAPI_BuilderAlgo** [#913](https://github.com/Open-Cascade-SAS/OCCT/pull/913)
- **Remove unused Bnd_Box and related code from BRepClass3d_SolidExplorer** [#931](https://github.com/Open-Cascade-SAS/OCCT/pull/931)
- **Revert type definitions for Standard_CString replacements** [#1021](https://github.com/Open-Cascade-SAS/OCCT/pull/1021)
- **Include Standard_ErrorHandler header in OSD_signal** [#996](https://github.com/Open-Cascade-SAS/OCCT/pull/996)
- **Remove redundant pragma lib comment in OSD_Host.cxx** [#902](https://github.com/Open-Cascade-SAS/OCCT/pull/902)

#### Temporary Changes
- **Temporarily remove samples from the repository** [#960](https://github.com/Open-Cascade-SAS/OCCT/pull/960)

### Documentation

- **Improve code examples in modeling algorithms** [#1016](https://github.com/Open-Cascade-SAS/OCCT/pull/1016)
- **Refactor documentation with new coding rules** [#1013](https://github.com/Open-Cascade-SAS/OCCT/pull/1013)
- **Update AI Assistant guidelines** [#1005](https://github.com/Open-Cascade-SAS/OCCT/pull/1005)
- **Fix issue with documentation build** [#992](https://github.com/Open-Cascade-SAS/OCCT/pull/992)

---

## Migration Guide

OCCT 8.0.0 includes a comprehensive set of **automated migration scripts** in `adm/scripts/migration_800/` to help external projects adapt to the new API. These scripts require Python 3.6+ with no external dependencies.

### Automated Migration Toolkit

The migration scripts can be run all at once or individually. Each script supports `--dry-run` to preview changes before applying.

#### Full Automated Migration (Recommended)

```bash
# Linux/macOS - full migration with preview
./adm/scripts/migration_800/run_migration.sh /path/to/your/src --dry-run

# Linux/macOS - apply changes
./adm/scripts/migration_800/run_migration.sh /path/to/your/src

# Windows
adm\scripts\migration_800\run_migration.bat /path/to/your/src --dry-run
```

The full migration runs 12 phases in order:

| Phase | Script | What It Does | Approximate Scope |
|-------|--------|-------------|-------------------|
| 1-2 | `migrate_handles.py` | `Handle(Class)` to `occ::handle<Class>`, `Handle(T)::DownCast()` to `occ::down_cast<T>()` | ~90,600 replacements |
| 3 | `migrate_standard_types.py` | `Standard_Boolean/Integer/Real` to `bool/int/double`, `Standard_True/False` to `true/false` | ~198,000 replacements |
| 4 | `migrate_macros.py` | `Standard_OVERRIDE` to `override`, `Standard_NODISCARD` to `[[nodiscard]]`, etc. | ~7,730 replacements |
| 5 | `cleanup_define_handle.py` | Remove redundant `DEFINE_STANDARD_HANDLE` macros | ~1,970 removals |
| 6 | `cleanup_deprecated_typedefs.py` | Remove deprecated typedef/using declarations, replace usages | ~1,800 cleanups |
| 7 | `collect_typedefs.py` | Collect NCollection typedef mappings to JSON | Analysis phase |
| 8 | `replace_typedefs.py` | Replace `TColStd_*`/`TopTools_*` with `NCollection_*<T>` | ~31,000 replacements |
| 9 | `remove_typedef_headers.py` | Remove typedef-only headers, update FILES.cmake | Header cleanup |
| 10 | `cleanup_forwarding_headers.py` | Clean up forwarding/include-only headers | Header cleanup |
| 11 | `cleanup_unused_typedefs.py` | Remove unused typedef declarations | Final cleanup |
| 12 | `cleanup_access_specifiers.py` | Remove redundant access specifiers | Code cleanup |

After all phases, `verify_migration.py` runs automatically to report any remaining legacy patterns.

#### Individual Scripts for Targeted Migration

Each script can be run independently for granular control:

##### Handle Migration
```bash
python3 adm/scripts/migration_800/migrate_handles.py --dry-run /path/to/your/src
```
```cpp
// Before                                    // After
Handle(Geom_Circle) aCircle;                 occ::handle<Geom_Circle> aCircle;
Handle(Geom_Circle)::DownCast(aCurve);       occ::down_cast<Geom_Circle>(aCurve);
```

##### Standard_* Type Migration
```bash
python3 adm/scripts/migration_800/migrate_standard_types.py --dry-run /path/to/your/src
```
```cpp
// Before                                    // After
Standard_Boolean isOk = Standard_True;       bool isOk = true;
Standard_Integer aCount = 0;                 int aCount = 0;
Standard_Real aTol = 0.001;                  double aTol = 0.001;
Standard_CString aName = "test";             const char* aName = "test";
```

Full type mapping:

| Deprecated | Replacement | | Deprecated | Replacement |
|------------|-------------|-|------------|-------------|
| `Standard_Boolean` | `bool` | | `Standard_Byte` | `uint8_t` |
| `Standard_Integer` | `int` | | `Standard_Size` | `size_t` |
| `Standard_Real` | `double` | | `Standard_Address` | `void*` |
| `Standard_ShortReal` | `float` | | `Standard_CString` | `const char*` |
| `Standard_Character` | `char` | | `Standard_ExtCharacter` | `char16_t` |
| `Standard_True/False` | `true/false` | | `Standard_Time` | `std::time_t` |

##### Standard_* Macro Migration
```bash
python3 adm/scripts/migration_800/migrate_macros.py --dry-run /path/to/your/src
```

| Deprecated Macro | Replacement |
|-----------------|-------------|
| `Standard_OVERRIDE` | `override` |
| `Standard_NODISCARD` | `[[nodiscard]]` |
| `Standard_FALLTHROUGH` | `[[fallthrough]];` |
| `Standard_Noexcept` | `noexcept` |
| `Standard_DELETE` | `= delete` |
| `Standard_THREADLOCAL` | `thread_local` |
| `Standard_ATOMIC(T)` | `std::atomic<T>` |

> **Note:** `Standard_UNUSED` requires manual migration to `[[maybe_unused]]` due to stricter placement rules.

##### NCollection Typedef Migration
```bash
# Step 1: Use pre-generated JSON from OCCT (or collect from source)
python3 adm/scripts/migration_800/replace_typedefs.py --dry-run \
    --input adm/scripts/migration_800/collected_typedefs.json /path/to/your/src
```
```cpp
// Before                                    // After
TColStd_ListOfInteger aList;                 NCollection_List<int> aList;
TopTools_MapOfShape aMap;                    NCollection_Map<TopoDS_Shape> aMap;
TColStd_Array1OfReal anArr;                  NCollection_Array1<double> anArr;
TColgp_SequenceOfPnt aSeq;                   NCollection_Sequence<gp_Pnt> aSeq;
```

Pre-generated JSON files are included in `adm/scripts/migration_800/` so external projects do not need to re-scan the OCCT source:
- `collected_typedefs.json` - NCollection typedef mappings
- `collected_deprecated_typedefs.json` - Deprecated typedef patterns and replacements

##### Exception Raise Migration
```bash
python3 adm/scripts/migration_800/migrate_raise_to_throw.py --dry-run
```
```cpp
// Before (removed)                          // After (required)
Standard_Failure::Raise("error");            throw Standard_Failure("error");
Standard_OutOfRange::Raise("index");         throw Standard_OutOfRange("index");
```

##### H-Collection Macro Migration
```bash
python3 adm/scripts/migration_800/migrate_hcollections.py --dry-run
```
Converts `DEFINE_HARRAY1`, `DEFINE_HARRAY2`, and `DEFINE_HSEQUENCE` macros to the new `NCollection_HArray1`/`HArray2`/`HSequence` template classes.

#### Verification

After migration, verify completeness:
```bash
python3 adm/scripts/migration_800/verify_migration.py --verbose /path/to/your/src
```

---

### Manual Migration Notes

The following API changes require manual attention beyond what the automated scripts handle.

#### Exception Handling

OCCT exceptions now inherit from `std::exception` and can be caught using standard C++ exception handling:

```cpp
// Now works! (OCCT exceptions inherit from std::exception)
try {
    // OCCT operations
} catch (const std::exception& e) {
    std::cerr << e.what() << std::endl;
}

// Or catch specific OCCT exception types
try {
    // OCCT operations
} catch (const Standard_Failure& e) {
    std::cerr << e.ExceptionType() << ": " << e.what() << std::endl;
}
```

The `GetMessageString()` method is deprecated; use `what()` instead.

#### NCollection_Map API Changes

`Seek()`/`ChangeSeek()` have been removed from `NCollection_Map`. Use `Contained()` instead:

```cpp
// Before (removed)
const KeyType* pKey = aMap.Seek(aKey);

// After
auto anOpt = aMap.Contained(aKey);
if (anOpt.has_value()) { const KeyType& aFoundKey = anOpt->get(); }
```

#### BSpline/Bezier Weights Migration

The nullable `Weights()` pattern has been replaced with always-valid `WeightsArray()`:

```cpp
// Before (nullable)
const NCollection_Array1<double>* pWeights = aCurve->Weights();
if (pWeights != nullptr) { /* use weights */ }

// After (always valid)
const NCollection_Array1<double>& aWeights = aCurve->WeightsArray();
// Non-rational curves return a view over static unit-weights buffer (no allocation)
```

Copy-out accessor overloads are deprecated in favor of const-reference returning versions:

```cpp
// Before (deprecated, copies data)
NCollection_Array1<gp_Pnt> aPoles;
aCurve->Poles(aPoles);

// After (zero-copy)
const NCollection_Array1<gp_Pnt>& aPoles = aCurve->Poles();
```

#### Convert Package Migration

Single-element accessors are deprecated in favor of batch const-reference accessors:

```cpp
// Before (deprecated)
gp_Pnt aPole = aConverter.Pole(i);

// After
const NCollection_Array1<gp_Pnt>& aPoles = aConverter.Poles();
```

#### Visualization: UNLIT Shading

The implicit optimization that forced UNLIT shading when material had no reflection properties has been removed. If relying on zero-material properties for UNLIT shading, explicitly set the shading model:

```cpp
// Before (implicit, now removed)
// Setting material with no reflection would auto-switch to UNLIT

// After (explicit)
anAspect->SetShadingModel(Graphic3d_TypeOfShadingModel_Unlit);
```

#### Mesh Plugin System Migration

The legacy `DISCRETPLUGIN`/`DISCRETALGO` symbol-based plugin system has been replaced with a registry-based factory:

```cpp
// Before (removed)
BRepMesh_PluginEntryType aFunc = BRepMesh::PluginEntry("DISCRETPLUGIN");

// After
occ::handle<BRepMesh_DiscretAlgoFactory> aFactory = BRepMesh_DiscretAlgoFactory::FindFactory("FastDiscret");
if (!aFactory.IsNull()) {
    occ::handle<BRepMesh_DiscretAlgo> anAlgo = aFactory->Create();
}
```

#### Bnd Package API Changes

`Bnd_Range::IsIntersected` magic int returns replaced with `IntersectStatus` enum:

```cpp
// Before
int aResult = aRange.IsIntersected(...);

// After
Bnd_Range::IntersectStatus aResult = aRange.IsIntersected(...);
```

#### Geom Classes Marked Final

All 29 concrete leaf classes in `Geom_*` and `Geom2d_*` hierarchies are now marked `final`. If your code inherits from these concrete classes (e.g., `Geom_BSplineCurve`, `Geom_Plane`), this will cause a compilation error. Inherit from the abstract base classes instead (e.g., `Geom_BoundedCurve`, `Geom_ElementarySurface`).

---

## Removed Functionality

| Item | Commit | Replacement |
|------|--------|-------------|
| `Standard_Failure::Raise()` static method | [#984](https://github.com/Open-Cascade-SAS/OCCT/pull/984) | `throw Standard_Failure()` |
| `Standard_ErrorHandler::Catches()` | [#980](https://github.com/Open-Cascade-SAS/OCCT/pull/980) | Implicit from execution flow |
| `Standard_ErrorHandler::LastCaughtError()` | [#980](https://github.com/Open-Cascade-SAS/OCCT/pull/980) | Accessed via variant in handler |
| `NCollection_Map::Seek()`/`ChangeSeek()` | [#1065](https://github.com/Open-Cascade-SAS/OCCT/pull/1065) | `Contained()` returning `std::optional` |
| `BRepMesh_PluginMacro.hxx` | [#1033](https://github.com/Open-Cascade-SAS/OCCT/pull/1033) | `BRepMesh_DiscretAlgoFactory` |
| `BRepMesh_PluginEntryType.hxx` | [#1033](https://github.com/Open-Cascade-SAS/OCCT/pull/1033) | Factory registration |
| `BRepMesh_FactoryError.hxx` | [#1033](https://github.com/Open-Cascade-SAS/OCCT/pull/1033) | Standard exceptions |
| Draw commands: `mpsetfunctionname`, `mpgetfunctionname`, `mperror` | [#1033](https://github.com/Open-Cascade-SAS/OCCT/pull/1033) | Not needed with factory pattern |
| Draw command: `BUC60720` | [#1069](https://github.com/Open-Cascade-SAS/OCCT/pull/1069) | Not needed |
| `QABugs_PresentableObject` | [#1069](https://github.com/Open-Cascade-SAS/OCCT/pull/1069) | Not needed |
| `NCollection_SparseArrayBase` vtable | [#1074](https://github.com/Open-Cascade-SAS/OCCT/pull/1074) | Function pointers |
| Samples directory | [#960](https://github.com/Open-Cascade-SAS/OCCT/pull/960) | Temporary removal |

---

## Deprecated Functionality

| Item | Commit | Replacement |
|------|--------|-------------|
| Package type aliases (`TColStd_*`, `TopTools_*`, etc.) | [#1026](https://github.com/Open-Cascade-SAS/OCCT/pull/1026) | `NCollection_*<T>` templates |
| `Standard_Failure::GetMessageString()` | [#984](https://github.com/Open-Cascade-SAS/OCCT/pull/984) | `what()` (std::exception interface) |
| BSpline/Bezier copy-out accessor overloads | [#1056](https://github.com/Open-Cascade-SAS/OCCT/pull/1056) | Const-reference returning versions |
| Convert package single-element accessors | [#1057](https://github.com/Open-Cascade-SAS/OCCT/pull/1057) | Batch const-reference accessors |
| Nullable `Weights()` pattern | [#1058](https://github.com/Open-Cascade-SAS/OCCT/pull/1058) | `WeightsArray()` (always valid) |

---

## Performance Improvements Summary

- **Devirtualized adaptor dispatch** [#1063](https://github.com/Open-Cascade-SAS/OCCT/pull/1063): Eliminates virtual calls for elementary geometry evaluation via std::variant
- **BSpline/Bezier direct array members** [#1056](https://github.com/Open-Cascade-SAS/OCCT/pull/1056): Eliminates heap indirection and reference counting
- **Always-populated weights with zero-alloc views** [#1058](https://github.com/Open-Cascade-SAS/OCCT/pull/1058): Eliminates null checks and copies for non-rational geometry
- **BSplCLib interpolation optimization** [#1082](https://github.com/Open-Cascade-SAS/OCCT/pull/1082): Static init, stack allocation, raw pointer hot loops
- **Properties computation for complex compounds** [#1091](https://github.com/Open-Cascade-SAS/OCCT/pull/1091): TopLoc_Location fast paths, cached face surface/location
- **Thread-local error handling** [#980](https://github.com/Open-Cascade-SAS/OCCT/pull/980): Zero lock overhead for exception handling in parallel code
- **TShape hierarchy optimization** [#1027](https://github.com/Open-Cascade-SAS/OCCT/pull/1027): Non-virtual ShapeType(), compact state storage, better cache locality
- **NCollection_FlatDataMap/FlatMap** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): Robin Hood hashing with open addressing for cache-friendly hash maps
- **Matrix multiplication optimization** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): Cache-friendly i-k-j loop order
- **Vector norm with SIMD unrolling** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): 4-way loop unrolling
- **Optimized atomic reference counting** [#1015](https://github.com/Open-Cascade-SAS/OCCT/pull/1015): Explicit memory ordering
- **NCollection_List optimization** [#1040](https://github.com/Open-Cascade-SAS/OCCT/pull/1040): Optimized move constructor, improved const-correctness
- **Tree and collection optimizations** [#1065](https://github.com/Open-Cascade-SAS/OCCT/pull/1065): Iterative traversal, move semantics across containers
- **AIS_ColoredShape::dispatchColors** [#1068](https://github.com/Open-Cascade-SAS/OCCT/pull/1068): Avoids redundant shape copies
- **TopLoc_Location::HashCode optimization** [#1006](https://github.com/Open-Cascade-SAS/OCCT/pull/1006)
- **Adaptor Bezier cache optimization** [#1084](https://github.com/Open-Cascade-SAS/OCCT/pull/1084): Removed redundant validity checks
- **Bnd package optimizations** [#1051](https://github.com/Open-Cascade-SAS/OCCT/pull/1051): Early return fast paths
- **PLib polynomial evaluation optimization** [#953](https://github.com/Open-Cascade-SAS/OCCT/pull/953)
- **GeomGridEval optimization** [#908](https://github.com/Open-Cascade-SAS/OCCT/pull/908), [#951](https://github.com/Open-Cascade-SAS/OCCT/pull/951), [#952](https://github.com/Open-Cascade-SAS/OCCT/pull/952), [#1031](https://github.com/Open-Cascade-SAS/OCCT/pull/1031)
- **Bnd_BoundSortBox optimization** [#958](https://github.com/Open-Cascade-SAS/OCCT/pull/958)
- **IntTools Box calculation optimization** [#990](https://github.com/Open-Cascade-SAS/OCCT/pull/990)
- **Coordinate-wise polishing for PSO/DE** [#1088](https://github.com/Open-Cascade-SAS/OCCT/pull/1088): Precision improvement to 1e-8+
- **Extended precompiled headers** [#1029](https://github.com/Open-Cascade-SAS/OCCT/pull/1029): Faster compilation

---

## Acknowledgments

We thank all contributors who helped make this release possible through their code contributions, bug reports, and testing.

## New Contributors
* @Andrej730 made their first contribution in https://github.com/Open-Cascade-SAS/OCCT/pull/902

**Full Changelog**: https://github.com/Open-Cascade-SAS/OCCT/compare/V8_0_0_rc3...V8_0_0_rc4

---
