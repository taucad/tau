---
title: 'Intermediate Geometry Caching for Code-CAD Kernels'
description: 'Mining of FreeCAD, Onshape, Shapr3D, OpenSCAD, OCCT v8, replicad, and OCJS to determine where intermediate geometry caching belongs in the Tau runtime — kernel layer, runtime middleware, OCJS C++, or replicad upstream.'
status: active
created: '2026-05-22'
updated: '2026-05-22'
revision_log:
  - 2026-05-22: 'Initial publication.'
  - 2026-05-22: 'F9 rewritten after deep dive of repos/OCCT/src/ModelingData/TKBRep/BRepGraph/. Corrects the earlier framing that BRepGraph caches solve operation-output memoisation; clarifies that BRepGraph is a normalised B-Rep storage layer, its caches are per-(node, CacheKind) attribute caches plus a lazy reconstruction cache plus an opt-in lineage log, and ModelingAlgorithms never consults BRepGraph (rg → 0 hits). Updates Exec Summary item 4, Tau Alignment row F9, trade-off row, R8, the state-of-the-state diagram row, the symbol-availability appendix, and references.'
category: comparison
related:
  - docs/policy/filesystem-policy.md
  - docs/policy/library-api-policy.md
  - docs/architecture/runtime-topology.md
  - docs/research/runtime-blueprint-v5-implementation-audit.md
---

# Intermediate Geometry Caching for Code-CAD Kernels

How leading parametric and code-CAD systems cache intermediate B-Rep results across recomputes, what the OCCT v8 / OCJS / replicad stack already exposes, and where the cache should live in Tau so that simple parameter tweaks on large models don't pay the full kernel re-execution cost.

## Executive Summary

1. **No leading CAD product uses content-addressable hashing of operation inputs to skip intermediate work.** FreeCAD, Onshape, SolidWorks, Fusion 360, Inventor, SALOME, and OpenSCAD all rely on the same fundamental pattern: a directed acyclic feature graph (DAG) walked in topological order with per-node **dirty flags**, where each feature's last computed shape is stored _as a property of the feature node itself_ and survives recomputes only when nothing upstream is dirty.

2. **OpenSCAD is the only mainstream open-source CAD with a true byte-budgeted geometry LRU.** `CGALCache` and `GeometryCache` (per-node Nef-polyhedron / PolySet maps keyed by AST-derived node IDs, evicted by total bytes) are unique in the field. They are the closest precedent for what Tau wants.

3. **Onshape's "context" + immutable microversions are the cloud equivalent.** Server-side regeneration writes B-Rep + tessellation into a transient `Context`; the persisted source-of-truth is the immutable feature-list microversion graph. Caching is implicit: the same microversion always re-derives the same context, so the regeneration result can be memoised against the microversion ID.

4. **OCCT v8's `BRepGraph` is _not_ an intermediate-result / feature-tree cache and does not solve the "param change ⇒ full re-run" problem.** BRepGraph is a normalised incidence-table B-Rep storage layer parallel to `TopoDS`, with three narrow accelerator structures: `BRepGraph_TransientCache` / `BRepGraph_RefTransientCache` (per-(node, CacheKind) attribute store for BndBox / UVBounds / FClass2d, freshness-checked by `SubtreeGen` / `OwnGen`, **wiped on every `Build()` and `Compact()`**), the lazy node→`TopoDS_Shape` reconstruction cache (`BRepGraph_Data::myCurrentShapes`), and `BRepGraph_History` (an append-only `original→[derived]` lineage log populated only when an algorithm explicitly calls `Record()`). Crucially, `rg BRepGraph repos/OCCT/src/ModelingAlgorithms` returns **zero matches** — `BRepAlgoAPI_*`, `BRepFilletAPI_*`, sweeps, lofts, drafts, and offsets never consult `BRepGraph`, so even adopting the data model would not memoise modelling-operation outputs. See F9 for the full deep-dive. The relevant `BRepGraph_*` symbols _are_ bound in `@taucad/opencascade.js` `full.yml` and remain useful to standalone OCCT scripts for stable identity (`UID`/`RefUID` for topological naming) and per-face attribute / mesh caching.

5. **Replicad upstream has zero memoisation.** Operations are pure functions of JS-side inputs and the input shape, but `OCJS_ShapeHasher.HashCode` is identity-based (`std::hash<TopoDS_TShape*>`), so two semantically equal shapes hash differently. `shape.serialize()` produces text BREP that round-trips losslessly — usable as a cache value, but not as a cache key without a content hash on top.

6. **Tau's existing `geometry-cache.middleware.ts` only caches the whole-script output**, keyed by `dependencyHash = hash(file content + middleware + framework version + parameters JSON)`. Any parameter change cache-misses. Any single-character source edit cache-misses. It is a "you reverted to a previous state" cache, not an incremental cache.

7. **The OCJS Proxy in `oc-tracing.ts` is the wrong layer** for caching, despite being the most tempting one. WASM-backed OCCT arguments (`gp_Pnt`, `gp_Ax2`, `TopoDS_Face`) cannot be hashed without round-tripping through WASM (which defeats the cache); replicad's `localGC()` reconstructs primitives on every call so identity hashing yields zero hits; OCCT builders are stateful (`BRepFilletAPI_MakeFillet::Add` between construction and `.Shape()`), so the `.Shape()` boundary is not the cache boundary; and recursively proxied results lose their proxy chain on re-entry.

8. **The architecturally correct insertion point is per-kernel, at the kernel's public API surface**, with a shared `LruMap`-backed cache primitive in `@taucad/runtime` and per-kernel adapters that know how to derive a content hash from kernel-native operations. The serialised value (BREP text or BinTools binary) is held in JS-heap as a string/bytes; the live WASM handle is `delete()`'d as soon as the operation completes, so the cache does not pin OCCT's linear memory.

9. **It is **not** the right call to put the cache in OCJS C++** (via `additionalCppCode`) for the general case. OCJS extension hooks are for **registering OCCT symbols** that bindgen cannot reach (free functions, value_objects, allow_subclass derivations) — not for adding a JS-keyed cache that JS can already implement. The exception: a thin `BinTools` embind facade should be added to `replicad-opencascadejs` so replicad scripts can use binary BREP (~3-5× smaller and faster than text BREP for cache-value storage).

10. **The cross-kernel parity story is "shared backend, per-kernel adapter".** JSCAD, Manifold, OpenSCAD, OCCT-direct, replicad, and KCL each have different operation surfaces and different hashable input types; a single shared interception layer (e.g. a Proxy over the kernel's public module) cannot derive cache keys correctly for all of them. The shared piece is the cache _backend_ (LruMap, two-level memory + filesystem, byte-bounded eviction), and the per-kernel piece is the adapter that knows how to memoise its own operations.

## Problem Statement

Tau renders code-CAD scripts via `replicad.kernel.ts` and `opencascade.kernel.ts`. Every parameter tweak or code edit triggers a full re-execution of the user's `main()` function. For models with many sequential operations — booleans, fillets, sweeps, lofts, text-along-curve — the entire OCCT call chain re-runs from scratch. Wall-clock cost scales linearly with model complexity even when only the last operation's parameters changed.

The user asks: do leading CAD products solve this with intermediate caching, and if so, where in the Tau stack does the cache belong?

In particular:

- Is the **Proxy layer** in `packages/runtime/src/kernels/occt/oc-tracing.ts` a viable interception point?
- Should the cache live **inside OCJS** as C++ added via `additionalCppCode` / `additionalCppFiles`?
- Should it live **inside replicad** at the JS API surface?
- Should it live **above the kernel** in the Tau runtime middleware?
- Is the cache **shared across kernels** (replicad, opencascade, openscad, jscad, manifold) or **per-kernel**?

## Methodology

1. Web research across major CAD products: FreeCAD, Onshape, Shapr3D, SolidWorks, Fusion 360, Inventor, SALOME, OpenSCAD, build123d, CadQuery.
2. Cloned `FreeCAD/FreeCAD` via the `repos` skill; deep code mining of `App::Document`, `DocumentObject`, `PropertyTopoShape`, `Part::PropertyShapeCache`, `Part::Feature::execute`, `SketchObject::solve`, `ViewProviderPartExt::updateVisual`, and the `AsyncRecompute` design doc.
3. Mined `repos/replicad/packages/replicad/src/` for shape constructors, mutators, serialization, and existing memoisation primitives.
4. Mined `repos/opencascade.js/` for build-config symbol lists (`build-configs/full.yml`, `build-configs/full_multi.yml`, `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml`), extension hooks (`additionalCppCode`/`additionalCppFiles`/`additionalBindCode`), and OCCT v8 cache-related primitives (`BRepGraph_TransientCache`, `BRepGraph_RefTransientCache`, `BRepGraph_Data::myCurrentShapes`, `BRepGraph_History`, `GeomHash`, `Geom2dHash`).
5. Mined `repos/OCCT/src/ModelingData/TKBRep/BRepGraph/` and `BRepGraphInc/` directly to verify the actual purpose, scope, and lifecycle semantics of `BRepGraph` before drawing architectural conclusions. Confirmed via `rg BRepGraph repos/OCCT/src/ModelingAlgorithms` (zero matches) that `BRepGraph` is not plumbed into modelling-operation pipelines.
6. Compared against Tau's current `packages/runtime/src/middleware/geometry-cache.middleware.ts`, `parameter-cache.middleware.ts`, the `LruMap` primitive in `@taucad/utils/cache`, and `kernel-worker.ts` `computeDependencyHash`.
7. Cross-referenced two recent academic / industry design notes: Acar's _Self-Adjusting Computation_ (CMU PhD, the canonical reference for incremental DAG rebuild), Jane Street's _Incremental_ library, and the DLR 2024 paper _A Generic Parametric Modeling Engine Targeted Towards Multidisciplinary Design_.

All file:line citations below are relative to `/Users/rifont/git/tau/`.

## Findings

### Part A — Industry-wide caching patterns

#### F1: FreeCAD — pure dirty-flag DAG walk; no content-addressable cache

FreeCAD's `App::Document::recompute()` topologically sorts every `DocumentObject` and walks the list; each node's `mustRecompute()` tests the per-object 32-bit `StatusBits` (`Touch`, `Enforce`, `Freeze`):

    // repos/FreeCAD/src/App/Document.cpp:2915-2948
    for (; idx < topoSortedObjects.size(); ++idx) {
        auto obj = topoSortedObjects[idx];
        if (!obj->isAttachedToDocument() || filter.find(obj) != filter.end()) { continue; }
        bool doRecompute = false;
        if (obj->mustRecompute()) {
            doRecompute = true;
            ++objectCount;
            int res = _recomputeFeature(obj);
            ...
        }
        if (obj->isTouched() || doRecompute) {
            signalRecomputedObject(*obj);
            obj->purgeTouched();
            for (auto inObjIt : obj->getInList()) {
                inObjIt->enforceRecompute();
            }
        }
    }

The cache for a feature's output is just the feature's own `PropertyPartShape::_Shape` member — the property _is_ the cache, kept alive between recomputes; recompute-skipping is purely dirty-flag, no input hashing:

    // repos/FreeCAD/src/Mod/Part/App/PropertyTopoShape.h:115-125
    private:
        TopoShape _Shape;
        std::string _Ver;
        mutable int _HasherIndex = 0;
        mutable bool _SaveHasher = false;
    };

A feature like `Part::Boolean` always re-runs its OCCT boolean when called — no short-circuit at the `execute()` level:

    // repos/FreeCAD/src/Mod/Part/App/FeaturePartBoolean.cpp:162-177
    TopoDS_Shape resShape = mkBool->Shape();
    if (resShape.IsNull()) {
        return new App::DocumentObjectExecReturn("Resulting shape is null");
    }
    throwIfInvalidIfCheckModel(resShape);
    TopoShape res(0);
    res.makeElementShape(*mkBool, shapes, opCode());
    if (this->Refine.getValue()) { res = res.makeElementRefine(); }
    this->Shape.setValue(res);

`mustExecute()` is the per-feature contract — a Boolean only recomputes when an operand is touched:

    // repos/FreeCAD/src/Mod/Part/App/FeaturePartBoolean.cpp:102-113
    short Boolean::mustExecute() const
    {
        if (Base.getValue() && Tool.getValue()) {
            if (Base.isTouched()) { return 1; }
            if (Tool.isTouched()) { return 1; }
        }
        return 0;
    }

The only **content-shared** cache in FreeCAD is `Part::PropertyShapeCache` — a per-`DocumentObject` dynamic property storing `TopoShape`s keyed by sub-name (e.g. cross-document scaled link results). It is purged whenever the owner's `Shape`/`Group`/`*Touched*` property changes:

    // repos/FreeCAD/src/Mod/Part/App/PropertyTopoShape.cpp:1186-1197
    void PropertyShapeCache::slotChanged(const App::DocumentObject&, const App::Property& prop)
    {
        auto propName = prop.getName();
        if (!propName) { return; }
        if (strcmp(propName, "Group") == 0 || strcmp(propName, "Shape") == 0
            || strstr(propName, "Touched") != 0) {
            FC_LOG("clear shape cache on changed " << prop.getFullName());
            cache.clear();
        }
    }

PR #25603 (FEP-0010 "fine-grained recomputes", Feb 2026) introduces _property-level_ dependency edges so a spreadsheet edit recomputes only objects that depend on the modified cell. **Not yet in mainline.** This still does not introduce content-addressable hashing — it just makes the dirty-flag granularity finer.

There is **no LRU**, no memory-pressure eviction. Shapes live as long as their owning property. Single-threaded per-document recompute (PyGIL held throughout); `AsyncRecompute` (`src/Doc/AsyncRecompute.dox`) parallelises across recompute _requests_, not within one document recompute.

#### F2: FreeCAD's element-map version is for topological naming, not caching

The string `"15.70200.5"` (or LinkStage3-flavoured `sm1.1.15.70200.4`) emitted by `TopoShape::getElementMapVersion()` (`OpCodes::Version`.`occ_ver_hex`.`ComplexGeoData::getElementMapVersion`) is consumed only at restore time to gate "do we trust the persisted element-name map?":

    // repos/FreeCAD/src/Mod/Part/App/TopoShapeExpansion.cpp:2110-2129
    static const std::string& _getElementMapVersion()
    {
        static std::string _ver;
        if (_ver.empty()) {
            std::ostringstream ss;
            unsigned occ_ver {0x070200};
            ss << OpCodes::Version << '.' << std::hex << occ_ver << '.';
            _ver = ss.str();
        }
        return _ver;
    }

This is **not** a cache key; it is a schema-version compatibility tag for the topological-naming subsystem.

#### F3: Onshape — server-side regeneration with immutable microversion as the cache key

Onshape's architecture (see _Under The Hood: How Collaboration Works_) splits state into three layers:

| State                                             | Persistence                          | Mutability                   |
| ------------------------------------------------- | ------------------------------------ | ---------------------------- |
| UI state (selection, camera)                      | Transient                            | Per-session                  |
| Part Studio definition (feature list, parameters) | MongoDB, **immutable microversions** | Append-only                  |
| Regeneration results (B-rep, triangles, errors)   | Cached, derivable                    | Re-derived from microversion |

> "The regeneration results are cached, but they can always be rebuilt from the definition." — Onshape

Geometry servers (Parasolid + D-Cubed in C++) regenerate FeatureScript into a `Context` (the analogue of a feature tree's intermediate B-rep state). Because each microversion is identified by an immutable hash and references its parent, re-rendering microversion `m_n` is equivalent to a content-addressable lookup. Onshape **does not expose an API for custom server-side context caching** — Onshape forum thread _Caching of context state through feature regeneration_ (April 2024) is an explicit user request, denied by the platform team because they manage the regeneration lifecycle automatically.

For the Tau context this means: **Onshape gets cache hits "for free" because they store an immutable derivation graph and re-render lazily; the cache key is the microversion ID, the cache value is the regenerated context.** Tau's analogue would be: hash the script source + parameter set + dependencies → cache key; serialise the resulting native handle → cache value. This is exactly what `geometry-cache.middleware.ts` does _at coarse grain_. The missing piece is per-operation granularity inside one render.

#### F4: Shapr3D — Parasolid history graph with adaptive direct + parametric mode

Shapr3D switched to Parasolid in 2017 (from OpenCASCADE) for the boolean / NURBS support its direct-modeling UX requires. It launched History-Based Parametric Modeling in late 2023 (full release Sept 2023, beta-out Apr 2024). The history sidebar records each modelling step; modifying a dimension propagates through the graph "as you make your adjustments". Public docs do not describe an explicit intermediate cache; this is the standard Parasolid feature-tree approach (Parasolid manages its own internal evaluation cache that consumers don't see).

#### F5: SolidWorks / Fusion 360 / Inventor — coarse-grain rebuild, user-managed mitigation

> "Since the standard Rebuild commands only rebuild the features which have changed since the last save, the system may not recognize a warning or error in other features which may be affected by the changes. A Force Rebuild command (Ctrl + Q or Ctrl + Shift + Q) rebuilds every single feature in the FeatureManager Design Tree" — MLC CAD Systems on SolidWorks rebuild

> "If we use STEP AP214, the colors from the master model will be preserved. ... Once the STEP file has been 'built' in the Parasolid kernel, it does not need to be rebuilt. There is no feature history. This is the speedy trick: Save it as STEP, import it to strip feature history, and reduce rebuild time to minimum." — _thefabricator.com_

The state-of-the-art mitigation in commercial CAD is **stripping the feature tree** (importing as STEP). This is the strongest possible signal that intermediate caching at the feature-tree level is _not_ something commercial CAD has solved transparently; it's offloaded to the user.

#### F6: SALOME — DAG with lazy evaluation and cache invalidation

SALOME (CEA / EDF / Open CASCADE platform) represents the parametric tree as a DAG and "identifies dependent nodes and invalidates their cached results to trigger recomputation" (per docs.salome-platform.org). The DLR 2024 paper _A Generic Parametric Modeling Engine Targeted Towards Multidisciplinary Design_ (CAD 21(3), 2024) generalises the pattern: "Already computed intermediate results, unaffected by the parameter change can be cached and re-used. Reversely, only the caches of those (intermediate) results that depend on the changed parameter shall be invalidated." This is the academic statement of the design we want.

#### F7: OpenSCAD — the canonical byte-budgeted intermediate cache (CGALCache + GeometryCache)

OpenSCAD has the most explicit intermediate caching of any open-source CAD. Two parallel singleton caches:

| Cache           | Stored value                                   | Default size | Eviction                    |
| --------------- | ---------------------------------------------- | ------------ | --------------------------- |
| `CGALCache`     | `CGAL_Nef_polyhedron` (or any engine geometry) | 100 MB       | LRU by bytes (`N.weight()`) |
| `GeometryCache` | `PolySet` / `Polygon2d`                        | configurable | LRU by bytes                |

Excerpt from the introduction commit (openscad/openscad@fe3362f):

    // CGALCache.h
    class CGALCache {
    public:
        CGALCache(size_t limit = 100*1024*1024) : cache(limit) {}
        static CGALCache *instance() { ... }
        bool contains(const std::string &id) const { return this->cache.contains(id); }
        const class CGAL_Nef_polyhedron &get(const std::string &id) const { return *this->cache[id]; }
        void insert(const std::string &id, const CGAL_Nef_polyhedron &N);
        size_t maxSize() const;
        void setMaxSize(size_t limit);
        void clear();
    };

The cache key `id` is the **AST-derived CSG node ID** — a stable identifier OpenSCAD emits per CSG-tree node based on the canonical text representation of the subtree (so two different scripts that produce identical CSG trees collide their cache entries by design). Eviction is by total bytes, not entry count, configured via the Preferences dialog (`maxSize` / `setMaxSize`). PR #4996 (kintel, Feb 2024) extended the cache to store _any_ engine-specific geometry (Manifold, future engines) so the same key/value substrate works across rendering backends.

Persistent (cross-process) cache via Redis/file backends has been attempted (PR #3316 / #3483, 2020) but never landed in master — the in-memory LRU is deemed sufficient by upstream.

**This is the closest precedent for what Tau wants.** OpenSCAD-as-WASM (the `openscad-playground` and Tau's `@taucad/openscad`) inherits the cache automatically because it's compiled into the kernel.

#### F8: build123d / CadQuery — manual `functools.cache`, no kernel-level memoisation

build123d, CadQuery, and Replicad are sibling code-CAD libraries on top of OCCT. None has an internal memoisation layer. The build123d community recommends manual `@functools.cache` decorators (CadQuery issue #801 / Discord post by user "barnaby"):

    @functools.cache
    def memoized_base(units_x, units_y):
        return gfb.Base(grid=((True,) * units_x,) * units_y, ...)

Caveat: the user is responsible for ensuring all arguments are hashable and that no captured globals change. Applied at the call site, not transparent.

#### F9: OCCT v8 — `BRepGraph` is a normalised B-Rep storage layer, _not_ an intermediate-result cache

The `BRepGraph` subsystem in OCCT v8 (under `repos/OCCT/src/ModelingData/TKBRep/BRepGraph/` and `BRepGraphInc/`) is frequently mistaken for a kernel-level "feature tree cache". It is not. It is a **normalised incidence-table representation of an existing `TopoDS_Shape`** built by a separate `Build(theShape)` call, and its raison d'être is to make sewing, healing, compact, deduplicate, and assembly traversal cheap — not to memoise modelling operations.

##### What `BRepGraph::Build(theShape)` actually produces

From `repos/OCCT/src/ModelingData/TKBRep/BRepGraph/README.md`:

> "BRepGraph is a facade API over an incidence-table topology backend for TopoDS/BRep shapes. The goal is to make workflows like sewing, healing, compact, and deduplicate easier to implement and optimize."

It walks an input `TopoDS_Shape` and produces:

- Flat per-kind entity tables (`Vertex`/`Edge`/`CoEdge`/`Wire`/`Face`/`Shell`/`Solid`/`Compound`/`CompSolid` plus assembly `Product`/`Occurrence`) with TShape de-duplication.
- Typed `BRepGraph_NodeId`/`BRepGraph_RefId` runtime addresses, plus persistent `BRepGraph_UID`/`BRepGraph_RefUID` counters that survive `Compact()` and direct mutation.
- Reverse adjacency indices (edge→wire, edge→face, vertex→edge, …) for O(1) upward navigation.
- Definition-frame geometry layout: TShape-internal `TopLoc_Location` is baked into the geometry; instance locations live on incidence refs. Equal definitions are shared instead of duplicated.

##### The three "caches" inside BRepGraph (all narrow)

`repos/OCCT/src/ModelingData/TKBRep/BRepGraph/BRepGraph.hxx` lines 89-91 calls them out under "Extension model":

> "Extend via `BRepGraph_Layer` (per-node attributes) or `BRepGraph_TransientCache` (algorithm-computed caches). Direct storage extension is not supported."

1.  **`BRepGraph_TransientCache` / `BRepGraph_RefTransientCache`** (`BRepGraph_TransientCache.hxx:209-227`):

    > "Stores **short-lived cached data (BndBox, UVBounds, etc.)** in dense per-cache-kind vectors indexed by entity index. … On read, if stored SubtreeGen differs from entity's current SubtreeGen the cached value is considered stale … NOT a Layer. **Cleared on Build() and Compact().**"

    It is a per-`(NodeId, CacheKind)` attribute store: callers register a process-global `BRepGraph_CacheKind` GUID (one per attribute family — `BndBox`, `UVBounds`, `FClass2d`) and stash one `Standard_Transient` value per node per kind, freshness-stamped by `SubtreeGen` (nodes) or `OwnGen` (refs). The keying scheme cannot represent "the future result of `Cut(faceA, faceB)`": every `NodeId` already names an existing node in this graph.

2.  **Reconstructed-shape cache** (`BRepGraph_Data::myCurrentShapes`, surfaced via `Shapes().Shape(nodeId)` in `BRepGraph_ShapesView.hxx`): a lazy node→`TopoDS_Shape` materialisation cache. Re-asking for the same `NodeId` at the same `SubtreeGen` returns the previously-rebuilt `TopoDS_Shape`. It accelerates _re-asking for the same node_, never _re-running an algorithm_.

3.  **`BRepGraph_History`** (`BRepGraph_HistoryRecord.hxx:25-46`):

        Mapping records the topological fate of each affected node:
          original -> [replacement1, replacement2, ...]   (split)
          original -> [same_node]                         (modified in place)
          original -> []                                  (deleted)

    An append-only lineage log populated only when the caller explicitly invokes `Record()` / `RecordBatch()`. Used for downstream attribute migration (colour / material / name layers re-anchoring after sewing or fillet) and topological-naming-style reverse lookups. **Stores no geometry.** Even with thousands of records, replaying any one of them re-executes the modelling algorithm.

`BRepGraph_VersionStamp` (`BRepGraph_VersionStamp.hxx`) — `(UID, OwnGen, Generation)` — is the closest thing to an externally-visible "cache key" primitive. It tells _the caller_ "is this same node still in the same direct-mutation state". It is not itself a cache, and `IsStale()` reflects mutation, not content equivalence; identical-input re-execution still gets a fresh stamp.

##### BRepGraph is not plumbed into `ModelingAlgorithms`

The decisive evidence:

    $ rg BRepGraph repos/OCCT/src/ModelingAlgorithms
    (no matches)

Zero hits across the entire OCCT modelling-algorithm tree (booleans, fillet/chamfer, sweeps, lofts, prisms, drafts, offsets, sewing-as-algo, …). Every `BRepGraph` reference outside `TKBRep/BRepGraph*` lives in `TKBRep/GTests/`. So even if replicad built a graph over each shape, **`BRepAlgoAPI_Cut` / `BRepFilletAPI_MakeFillet` and friends never consult the graph or its caches**, and re-issuing the same operation would re-execute it verbatim.

##### Symbol availability

`@taucad/opencascade.js` `full.yml` exports the BRepGraph + BRepGraphInc classes:

    # repos/opencascade.js/build-configs/full.yml:352-388 (BRepGraph + BRepGraphInc block)
    - symbol: BRepGraph
    - symbol: BRepGraph_Builder
    - symbol: BRepGraph_CacheKind
    - symbol: BRepGraph_CacheKindRegistry
    - symbol: BRepGraph_CacheValue
    - symbol: BRepGraph_CacheView
    - symbol: BRepGraph_Data
    - symbol: BRepGraph_RefTransientCache
    - symbol: BRepGraph_TransientCache
    - symbol: BRepGraphInc_Populate
    - symbol: BRepGraphInc_Reconstruct
    - symbol: BRepGraphInc_Storage
    # ... and the per-Kind {Vertex,Edge,CoEdge,Wire,Face,Shell,Solid,Compound,CompSolid,Product,Occurrence}Def + Ref variants

`replicad-opencascadejs` `custom_build_single.yml`: `grep -c BRepGraph … = 0`. Replicad's WASM bundle physically cannot construct a `BRepGraph` today; step zero of any adoption would be re-bundling.

##### What this means for replicad caching

Three plausible interpretations of "use BRepGraph for intermediate caching" with their realistic verdicts:

1. **"Memoise replicad operation outputs through BRepGraph"** — _not viable_. Symbols not exported from `replicad_single`; even with them, the only operation-aware API is `BRepGraph_History::Record`, which logs lineage _after_ the operation has run; and the modelling algorithms themselves are not graph-aware. There is no `BRepGraph::TryGetOrCompute(opName, inputs, fn)` and adding one is non-sensical because `BRepGraph` is per-shape, not per-engine.

2. **"Use BRepGraph for stable identity (topological naming) so a hash-based cache survives parameter changes"** — _marginally viable, longer horizon_. `BRepGraph_UID` / `RefUID` provide persistent counters surviving `Compact` and direct mutation; `BRepGraph_History` records `original→derived` lineage so attribute layers can re-anchor after edits. If replicad adopted BRepGraph as its internal shape model it would gain stable selection-survival across re-runs, which is the same problem CadQuery / build123d / FreeCAD's "topological naming" machinery solves. **This does not skip running algorithms** — it only stabilises selectors and supports incremental graph diffs. Adoption cost is large: maintain a `BRepGraph` alongside every `Shape`, rebuild on each operation, rewrite `find*`/`Selector` infrastructure.

3. **"Use `BRepGraph_TransientCache` to cache derived attributes per node (mesh, BndBox, UV bounds)"** — _genuinely useful, narrow, orthogonal to the original re-render pain_. Two concrete wins if BRepGraph were exposed:
   - Per-face triangulation reuse: stash `Poly_Triangulation` as a `BRepGraph_TypedCacheValue<Poly_Triangulation>` keyed by face `NodeId`, freshness-checked by `SubtreeGen`. Survives unrelated face mutations. Reduces the cost of `BRepMesh_IncrementalMesh` + glTF extraction on re-render.
   - Bounding box reuse for visualisation / picking, identical pattern.

   Both are _meshing/visualisation_ wins, not _modelling_ wins. They reduce post-shape-rebuild costs; they do not reduce the cost of producing the final `TopoDS_Shape`.

##### Standard usage pattern (for completeness)

The intended public-API consumption looks like this:

    // 1. Process-global cache-kind descriptor (typically a static)
    static const Standard_GUID kBndBoxGUID("…");
    static const Handle(BRepGraph_CacheKind) kBndBoxKind =
        new BRepGraph_CacheKind(kBndBoxGUID, "BndBox", BRepGraph_Layer::KindBit(Kind::Face));
    static const int kBndBoxSlot = BRepGraph_CacheKindRegistry::Register(kBndBoxKind);

    // 2. Build the graph from a TopoDS once
    BRepGraph aGraph;
    aGraph.Build(aShape);

    // 3. Lazy compute + stash a derived attribute per-node
    auto handle = aGraph.Cache().Get(faceId, kBndBoxSlot);
    if (handle.IsNull()) {
      auto value = new BRepGraph_TypedCacheValue<Bnd_Box>(computeBndBox(...));
      aGraph.Cache().Set(faceId, kBndBoxSlot, value);
    }

`BRepGraph_VersionStamp` is the externally-visible pattern for "I (the caller) have a derived data structure indexed by graph nodes; let me detect when it goes stale":

    auto stamp = aGraph.UIDs().StampOf(faceId);
    myDerivedTable.Bind(stamp, expensiveDerivation(faceId));
    // later
    if (!aGraph.UIDs().IsStale(stamp)) return myDerivedTable.Find(stamp);

Neither pattern is what replicad needs. Both are keyed on "an entity in this graph" and assume the graph is the source of truth; replicad's caching problem is "I called `cut(a, b)` last frame and just called `cut(a, b)` again — can I skip the actual `BRepAlgoAPI_Cut` invocation". The graph cache simply has no slot whose semantics describe "the output of an operation about to be performed".

##### `BRepGraph_MeshCache` clarification (vs the earlier draft of this finding)

An earlier draft of F9 referred to `BRepGraph_MeshCacheStorage` / `BRepGraph_MeshCache_FaceMeshEntry` as a discrete subsystem. After mining `repos/OCCT/src/ModelingData/TKBRep/BRepGraph/`, the actual surface is `BRepGraph_TransientCache` / `BRepGraph_RefTransientCache` plus the `BRepGraph_TypedCacheValue<T>` template — there is no separate `BRepGraph_MeshCache*` package in the v8 tree. Mesh-style caching is achieved by registering a `Mesh` cache-kind GUID and stashing `Poly_Triangulation` handles per face. The substantive conclusion is unchanged (per-node attribute cache, not operation-result cache); the section above replaces the earlier shorthand with the correct primitive names.

##### `GeomHash` / `Geom2dHash` (PR #845) — adjacent but separate

OCCT PR #845 introduced `GeomHash` / `Geom2dHash`: type-specific hashers for analytic curves (Line, Circle, Ellipse, Hyperbola, Parabola), freeform curves (Bezier, BSpline, Trimmed, Offset), and surfaces (Plane, Cylinder, Cone, Sphere, Torus, Revolution, LinearExtrusion, RectangularTrimmed, Offset). Used by `BRepGraph_Deduplicate` to canonicalise deep-equal geometry references. Useful as primitives if Tau ever needs content hashing of OCCT geometry primitives, but unrelated to operation-output memoisation.

### Part B — Tau's current state

#### F10: `geometry-cache.middleware.ts` is whole-script, parameter-sensitive, dependency-hashed

    // packages/runtime/src/middleware/geometry-cache.middleware.ts:215-270
    async wrapCreateGeometry(input, handler, { logger, filesystem, dependencyHash, options }) {
        const { basePath } = input;
        const cacheKey = dependencyHash;

        // L1: In-memory cache (fast, no I/O or deserialization)
        const memoryCached = geometryMemoryCache.get(cacheKey);
        if (memoryCached) {
            logger.debug(`Geometry memory cache hit for ${cacheKey}`);
            return memoryCached;
        }

        // L2: Filesystem cache
        const cachePath = getCachePath(basePath, cacheKey);
        try {
            const cachedData = await filesystem.readFile(cachePath);
            ...

The `dependencyHash` is computed in `kernel-worker.ts`:

    // packages/runtime/src/framework/kernel-worker.ts:2853-2858
    private computeDependencyHash(dependencies: readonly Dependency[]): string {
        const contentHashSpan = this.tracer.startSpan('deps.content-hash');
        const hex = hashString(JSON.stringify(dependencies));
        contentHashSpan.end();
        return hex;
    }

Where `dependencies` includes:

    // packages/runtime/src/framework/kernel-worker.ts:2429-2434
    const parameterDep: ParameterDependency = {
        type: 'parameter',
        parameters: input.parameters,
    };
    return [...baseDeps, parameterDep];

**Implication**: any parameter change → different `dependencyHash` → cache miss → full re-run. This is the user's pain point. The cache is correct (it returns previously-seen full outputs verbatim) but operates at the wrong granularity (whole-script).

The L1 LRU is bounded at `maxEntries: 20` (small because GLB blobs are large), L2 is filesystem-backed at `.tau/cache/geometry/{key}.bin` with `maxAge` 7 days and `maxEntries` 100 default. MessagePack serialization, native `Uint8Array` support, no base64 overhead.

#### F11: `oc-tracing.ts` Proxy is the wrong layer for caching

The Proxy already intercepts every method/constructor:

    // packages/runtime/src/kernels/occt/oc-tracing.ts:281-317
    if (isCallable(value)) {
      const wrapped = new Proxy(value, {
        construct(constructTarget, args, newTarget) {
          checkAbort();
          try {
            return wrapEmscriptenResult(Reflect.construct(constructTarget, args, newTarget)) as Record<...>;
          } catch (error) { return rethrowIfWasmException(error); }
        },
        apply(applyTarget, thisArg, args) {
          checkAbort();
          try { return wrapEmscriptenResult(Reflect.apply(applyTarget, thisArg, args)); }
          catch (error) { return rethrowIfWasmException(error); }
        },
      });

Four structural obstacles to repurposing this for caching:

1.  **Argument hashing is unsolvable here.** Most OCCT builder args are WASM-backed objects (`gp_Pnt`, `gp_Ax2`, `TopoDS_Face`) reachable only via getters that themselves go back into WASM (`p.X()`, `p.Y()`, `p.Z()`). Deep extraction round-trips through WASM per call and defeats the cache; identity hash yields zero hits because replicad's `localGC()` reconstructs primitives every call (`shapeHelpers.ts:25-505` re-allocates a fresh `gp_Pnt` per invocation).
2.  **`OCJS_ShapeHasher.HashCode` is identity-only**:

        // shape-hasher.cpp:8-13
        class OCJS_ShapeHasher {
        public:
            static size_t HashCode(const TopoDS_Shape& shape, int) {
                return std::hash<TopoDS_Shape>{}(shape);  // pointer hash
            }
        };

    Two distinct boxes with identical dimensions hash differently.

3.  **Side effects on builders.** Many OCCT classes are stateful: `BRepFilletAPI_MakeFillet::Add(...)` is called repeatedly between construction and `.Shape()`. The `.Shape()` call is the cache boundary, but the input state isn't materialised at the constructor call.
4.  **Class hierarchy clobber.** `wrapEmscriptenResult` recursively proxies returned objects (`oc-tracing.ts:212-243`); a cached `TopoDS_Shape` re-entering the trace would lose its proxy chain and skip exception decoding on subsequent method calls.

#### F12: Replicad's serialisation hooks are usable as cache **values**

    // repos/replicad/packages/replicad/src/shapes.ts:193-199
    serialize(): string {
      const oc = getOC();
      return oc.BRepToolsWrapper.Write(this.wrapped);
    }
    get hashCode(): number {
      return this.oc.OCJS_ShapeHasher.HashCode(this.wrapped, HASH_CODE_MAX);
    }

    // repos/replicad/packages/replicad/src/shapes.ts:179-182
    export function deserializeShape(data: string): AnyShape {
      const oc = getOC();
      return cast(oc.BRepToolsWrapper.Read(data));
    }

`BRepToolsWrapper` is a Tau-side `additionalCppFiles` wrapper:

    // repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/brep-io.cpp:6-22
    class BRepToolsWrapper {
    public:
      static std::string Write(const TopoDS_Shape& shape) {
        std::ostringstream oss(std::ios::binary);
        oss << std::setprecision(17);
        BRepTools::Write(shape, oss);
        return oss.str();
      }
      static TopoDS_Shape Read(const std::string& data) { ... BRepTools::Read(shape, iss, builder, progress); ... }
    };

**Format**: ASCII BREP. Round-trips losslessly. Suitable as cache _value_, not as cache _key_ (3-5× larger than necessary; needs SHA-1 of string for a key).

#### F13: Replicad operations are pure functions (modulo GC plumbing)

Operations are deterministic given inputs, with three caveats that don't affect the resulting `TopoDS_Shape`:

1. `FinalizationRegistry` lifetime tracking (`register.ts:17-26`) is observable but not value-affecting.
2. `uniqueId()` in `importers.ts:5-7` only labels MEMFS files, doesn't affect output.
3. `assemblyExporter.ts:73` UUIDs label STEP entities — affects exported STEP bytes, not in-memory shape graph.

No `Math.random()` / `Date.now()` / mutable globals appear inside boolean/fillet/sweep/loft constructors. **Replicad operations are content-addressable.**

#### F14: Replicad has no internal cache primitive

The only `Map`/`Set` patterns in `packages/replicad/src/`:

- `text.ts:9` — `FONT_REGISTER: Record<string, opentype.Font>` (font cache, not geometry).
- `shapes.ts:151` — `seen.some((s) => s.IsSame(item))` inside `iterTopo`, dedup within one explorer walk.
- `Curve2D.ts:22-37` — per-instance lazy `_boundingBox` memo (not shareable across runs).
- `register.ts` `localGC()` / `GCWithScope()` — lifetime tracking, not caching.

No LRU, no `Map<string, TopoDS_Shape>`, no `memoize`. **Greenfield inside replicad.** Upstream maintainer (sgenoud) has no commits matching `cache|memoi|incremental` — only a Tau-authored mesh-clean-before-remesh fix (`db21c69`).

#### F15: replicad.xyz workbench is no faster than Tau on parameter changes

    // repos/replicad/packages/studio/src/builder.worker.js:196-228
    const buildShapesFromCode = async (code, params) => {
      const oc = await OC;
      replicad.setOC(oc);
      await MANIFOLD;
      if (!replicad.getFont())
        await replicad.loadFont("/fonts/HKGrotesk-Regular.ttf");

      let shapes;
      ...
      try {
        self.$ = helper;
        self.registerShapeStandardizer = standardizer.registerAdapter.bind(standardizer);
        shapes = await runCode(code, params);
        ...
      } catch (e) {
        return formatException(oc, e);
      }
      return renderOutput(
        shapes, standardizer,
        (shapes) => {
          const editedShapes = helper.apply(shapes);
          SHAPES_MEMORY.defaultShape = shapes;   // ← only the LATEST result is stored
          return editedShapes;
        },
        defaultName
      );
    };

`SHAPES_MEMORY` retains only the most recent shape per ID for downstream `exportShape()` / `faceInfo()` / `edgeInfo()` calls. **No script-level cache.** Tau already does better at coarse grain (the `geometry-cache.middleware.ts` whole-script cache).

#### F16: OCJS extension hooks are confirmed functional

`additionalCppCode` / `additionalCppFiles` / `additionalBindCode` are documented and exercised today:

    // repos/opencascade.js/docs-site/content/docs/toolchain/guides/extend-with-cpp.mdx:17-24
    Are you adding new C++ implementation code (wrapper class, free function, POD)?
    ├── YES → Will the impl grow beyond ~100 lines or want syntax highlighting?
    │        ├── YES → additionalCppFiles
    │        └── NO  → additionalCppCode (inline)
    └── NO  → You are only adding raw embind registrations on existing symbols
             → mainBuild.additionalBindCode

`replicad-opencascadejs/build-config/custom_build_single.yml:248-253` already uses `additionalCppFiles` for `brep-io.cpp`, `mesh-extractor.cpp`, `shape-hasher.cpp`, `edge-mesh-extractor.cpp`, `geom2d-io.cpp`. The hook is wired and exercised — adding a `BinTools` binary BREP wrapper would slot in trivially.

#### F17: `BinTools_*` and `BRepBuilderAPI_Copy` symbol availability

| Build                                              | `BinTools_*` | `BRepBuilderAPI_Copy` | `BRepGraph_*`                       |
| -------------------------------------------------- | ------------ | --------------------- | ----------------------------------- |
| `@taucad/opencascade.js` `full.yml`                | ✅           | ✅                    | ✅ (full BRepGraph cache subsystem) |
| `@taucad/opencascade.js` `full_multi.yml`          | ✅           | ✅                    | ✅                                  |
| `replicad-opencascadejs` `custom_build_single.yml` | ❌           | ❌                    | ❌                                  |

    # repos/opencascade.js/build-configs/full.yml:799-811
    - symbol: BinTools
    - symbol: BinTools_Curve2dSet
    - symbol: BinTools_CurveSet
    - symbol: BinTools_FormatVersion
    - symbol: BinTools_IStream
    - symbol: BinTools_LocationSet
    - symbol: BinTools_OStream
    - symbol: BinTools_ObjectType
    - symbol: BinTools_ShapeReader
    - symbol: BinTools_ShapeSet
    - symbol: BinTools_ShapeSetBase
    - symbol: BinTools_ShapeWriter
    - symbol: BinTools_SurfaceSet

Standalone OCJS scripts already have access to binary BREP serialisation today via `oc.BinTools` (after a thin embind facade). Replicad scripts do not — adding `BinTools_ShapeWriter`/`Reader` to `custom_build_single.yml` plus a `BinToolsWrapper.cpp` would unlock binary cache values at ~3-5× lower size and ~2-3× faster (de)serialisation than text BREP.

#### F18: WASM linear memory cost of in-WASM caching

`replicad_single` is built with:

    - -sALLOW_MEMORY_GROWTH=1
    - -sINITIAL_MEMORY=100MB
    - -sMAXIMUM_MEMORY=4GB

OCCT shapes are reference-counted (`Handle<TopoDS_TShape>` + per-edge/face sub-shapes), each carrying surfaces/curves/triangulations. Empirical replicad workloads see 1-10 MB per non-trivial solid in WASM after mesh + edge data accrues. Caching N=20-50 _live_ WASM shapes risks brushing the 4 GB cap on long sessions (and triggers `memory.grow()` detachment cascades — see `repos/replicad/packages/replicad/src/shapes.ts:368-376` which already mitigates this for the mesh extractor).

There is **no OCCT API to compact/serialise-then-free in one call.** The idiomatic pattern (and the one we should adopt) is:

1. `shape.serialize()` → JS string.
2. `shape.delete()` → release WASM handle.
3. On hit, `deserializeShape(stored)` → fresh handle.

This trades WASM heap for JS heap + (de)serialization CPU per hit. For shapes that are expensive to compute and cheap to (de)serialize (booleans of revolved/swept solids, fillet chains), the trade-off is strongly favourable. For trivial primitives (`makeBox(10,20,30)`), the cache should be skipped entirely; the operation itself is cheaper than the (de)serialise round trip.

#### F19: Cross-kernel parity — different operation surfaces, different hashable types

| Kernel                   | Operation surface                          | Hashable input type                                              | Native serialisation                          | Existing cache                                                 |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| **replicad**             | `Shape.fuse/cut/...` + free `make*()`      | JS-native (numbers, tuples, Shape refs)                          | text BREP via `BRepToolsWrapper`              | none                                                           |
| **opencascade (direct)** | OCCT classes (`BRepPrimAPI_MakeBox`, etc.) | WASM-backed (`gp_Pnt`, etc.)                                     | binary `BinTools`                             | OCCT v8 `BRepGraph_TransientCache` (opt-in via BRepGraph_Data) |
| **openscad**             | CSG tree from `.scad` AST                  | AST node ID (string)                                             | engine-specific (CGAL Nef, Manifold, PolySet) | **`CGALCache` + `GeometryCache` (built-in, byte-bounded LRU)** |
| **manifold**             | `Manifold` algebra (immutable)             | `Manifold` object (already hashable; manifold-jl exposes `hash`) | manifold-mesh-glb                             | none in upstream; immutable ops are naturally memoisable       |
| **jscad**                | functional pipelines on geometries         | JS-native                                                        | format-jscad serialisation                    | none in upstream                                               |
| **kcl**                  | KCL AST → execution                        | AST node + parameter values                                      | KCL's internal `ProgramMemory`                | partial (zoo's `modeling-app` has limited memoisation)         |

A single shared interception layer (Proxy over kernel.module) cannot derive cache keys correctly across all of these because the hashable input types differ fundamentally. The shared piece is the **cache backend** (LruMap, two-level memory + filesystem, byte-bounded eviction). The per-kernel piece is the **adapter** that knows how to derive a content key from kernel-native operations.

### Part C — Theoretical foundations

#### F20: Self-Adjusting Computation (Acar 2005, CMU PhD)

> "From the algorithmic perspective, we describe novel data structures for tracking the dependences in a computation and a change-propagation algorithm for adjusting computations to changes." — _Self-Adjusting Computation_, Umut Acar

The canonical reference. SAC distinguishes three approaches:

1. **Static dependence graphs** — fixed at build time, simplest but inflexible.
2. **Memoization (function caching)** — pure-function memoisation by input hash; works only for purely functional code.
3. **Dynamic dependence graphs** — Acar's contribution; captures runtime dependencies and supports computation-graph changes.

For Tau's case, **memoisation suffices** because replicad operations are purely functional (F13). We do not need full SAC machinery (no need to mutate the in-flight DAG during a render).

#### F21: Jane Street's `Incremental` library

Self-adjusting computation for OCaml; demonstrates that fine-grained dependency tracking with memoisation can match the asymptotic complexity of hand-written incrementalisations for many real workloads. The pattern translates: **(input changes → recompute only nodes whose hash of inputs changed).**

#### F22: Signal / fine-grained reactivity (Solid, Vue, Preact)

Same conceptual model as `Incremental` but with auto-tracked dependencies via getter interception. Could be applied to a Tau cache if user shapes were built via reactive primitives — but that would require a replicad API rewrite, far outside MVP scope.

## Tau Alignment Analysis

| Finding                              | Tau current state                                                                            | Gap                                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 FreeCAD dirty-flag DAG            | Tau has no per-feature DAG; user code is opaque imperative JS                                | Cannot port FreeCAD's model directly because Tau has no feature graph; it has a flat `main()`                                                                                              |
| F3 Onshape immutable microversion    | Tau's `dependencyHash` is the analogous coarse-grain key                                     | Already achieved at coarse grain; missing at intra-render granularity                                                                                                                      |
| F7 OpenSCAD CGALCache                | Tau imports OpenSCAD WASM with the cache compiled in                                         | OpenSCAD kernel inherits this for free; other kernels do not                                                                                                                               |
| F9 OCCT v8 BRepGraph                 | Bound in `full.yml`; not bound in `replicad_single`                                          | Wrong tool for operation-output memoisation. Useful longer-horizon for topological naming (`UID`/`RefUID` + `History`) and per-face attribute / mesh caches via `BRepGraph_TransientCache` |
| F10 Tau geometry-cache.middleware.ts | Whole-script content-addressable cache, two-level (memory + filesystem), MessagePack-encoded | Misses on every parameter change; intermediate boundary is missing                                                                                                                         |
| F11 oc-tracing.ts Proxy              | Used for tracing + exception decoding only                                                   | Cannot be repurposed for caching (4 structural obstacles)                                                                                                                                  |
| F12 replicad serialize()             | Already exposed; used by `apps/api` for serializeHandle                                      | Usable as cache value with a SHA-1 wrapper as key                                                                                                                                          |
| F13 replicad determinism             | Confirmed pure-functional                                                                    | Memoisation is sound                                                                                                                                                                       |
| F14 replicad no internal cache       | Greenfield                                                                                   | Need new layer                                                                                                                                                                             |
| F17 BinTools availability            | `full.yml` ✅, `replicad_single` ❌                                                          | Replicad would benefit from binary BREP for cache values; standalone OCJS already has it                                                                                                   |
| F19 cross-kernel parity              | Different op surfaces; shared LRU primitive in `@taucad/utils/cache` already exists          | Need per-kernel adapters, shared backend                                                                                                                                                   |

## Architectural Recommendation

### Layer placement: per-kernel memoisation at the public API surface

The cache lives **inside each kernel** at the level where it has access to:

- JS-native arguments (numbers, tuples, options objects) hashable without WASM round-trips.
- Native shape handles serialisable to a self-contained byte string.
- Operation names (statically known per kernel — `makeBox`, `fuse`, `fillet`, etc.).

The cache backend is **shared** (a new `KernelMemoCache` primitive in `@taucad/runtime`) but the adapter wiring is **per-kernel**.

### Cache key derivation

Hierarchical, per-operation:

    opKey   = hash(opName, jsArgs)
    inputKey = inputShape.cacheKey ?? hash('literal', inputShape.serialize())
    cacheKey = hash(opKey, inputKey, kernelVersion)

`cacheKey` is propagated through Shape instances via a private `__cacheKey?: string` field. A shape returned by a memoised constructor (`makeBox(10,20,30)`) gets a literal key (`makeBox:10,20,30`); a shape returned from a memoised operation inherits the chained key (`fuse:hash(args):box-key`). Shapes loaded via `deserializeShape` carry forward the key they were stored under.

This is the same pattern OpenSCAD uses with AST node IDs (F7), Onshape uses with microversion IDs (F3), and Self-Adjusting Computation literature describes as **dynamic dependence-graph memoisation** (F20).

### Cache value encoding

| Kernel                  | Value                                   | Rationale                                                            |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| replicad                | text BREP from `BRepToolsWrapper.Write` | Available today; binary BREP after future `BinTools` wrapper rebuild |
| opencascade.js (direct) | binary BREP from `BinTools_ShapeWriter` | Already bound in `full.yml`; needs thin embind facade                |
| openscad                | n/a — OpenSCAD owns its own cache       | Don't fight upstream                                                 |
| manifold                | manifold-mesh bytes                     | Manifold ops are immutable + cheap to serialize                      |
| jscad                   | format-jscad geometry JSON              | Already a serialised shape representation                            |

**The cache holds JS-heap strings/bytes, not WASM handles.** Live shapes are still GC'd by `FinalizationRegistry` after the operation returns. On hit, `deserializeShape(stored)` rehydrates a fresh WASM handle and immediately delete()s it after use.

### Backend shape

    // New: packages/runtime/src/cache/kernel-memo-cache.ts
    export interface KernelMemoCache<V> {
      get(key: string): V | undefined;
      set(key: string, value: V, byteSize: number): void;
      has(key: string): boolean;
      clear(): void;
      readonly stats: { hits: number; misses: number; bytes: number };
    }

    // Backed by LruMap (already in @taucad/utils/cache) with byte-bounded eviction.
    // Two-level: L1 memory (per render-cycle), L2 filesystem (.tau/cache/intermediate/{kernel}/{key}.bin).
    // Same eviction model as OpenSCAD's CGALCache: maxBytes (default 100 MB), per-entry weight.

### What we explicitly do **not** do

1. **No Proxy-based interception in `oc-tracing.ts`.** F11's four obstacles are structural, not incidental. Keep `oc-tracing.ts` focused on its current concern: tracing + exception decoding.
2. **No OCJS C++ caching layer.** OCCT v8's `BRepGraph_TransientCache` is excellent if/when replicad / Tau adopt BRepGraph — until then, JS-side memoisation is simpler, cheaper, and fully sufficient. The OCJS extension surface (`additionalCppCode`/`additionalCppFiles`/`additionalBindCode`) stays reserved for _binding additional OCCT symbols_, not for hosting a JS-keyed cache that JS can already implement.
3. **No "shared cache transparent across kernels".** F19 proves the cache key types are kernel-specific. Cross-kernel "share" is at the _backend_ level (LruMap, byte-bounded eviction), not at the _interception_ level.
4. **No upstream replicad fork divergence (yet).** The first cut sits in `packages/runtime/src/kernels/replicad/` as a wrapper layer that intercepts the public replicad API. If it ships and proves valuable, the patch could be proposed upstream to sgenoud (F14 confirms zero precedent against — it'd be greenfield for upstream review).

### Per-kernel implementation sketches

#### Replicad

Wrap the public replicad API surface in a `MemoizedReplicad` factory invoked at kernel `initialize()`:

- Constructors (`makeBox`, `makeCylinder`, `makeSphere`, `makeLine`, `makeCircle`, `makeFace`, ...) → wrap to generate `__cacheKey` from JS args.
- Operators on `_3DShape` / `Shape3D` (`fuse`, `cut`, `intersect`, `fillet`, `chamfer`, `shell`, `simplify`, `extrude`, `revolve`, `loft`, `sweep`, `addThickness`) → wrap via prototype interception or by exposing a memoised facade module that `runtime.bundler.registerModule('replicad', ...)` exports instead of the raw module.
- `Drawing.sketchOnPlane`, `Sketcher.*` → same treatment.
- 2D `Curve2D` → uses `oc.GeomToolsWrapper.Write` already; same pattern.

The simplest implementation is a _replacement module_ registered with the bundler: instead of `runtime.bundler.registerModule('replicad', { code: <raw replicad>, ... })`, register `<memoized replicad>` whose `make*` and `Shape.fuse/...` functions wrap the originals with `kernelMemoCache.get(...)` / `kernelMemoCache.set(...)`. This keeps the patch out of replicad's source tree and inside Tau's kernel layer.

#### OpenCascade (direct)

Two approaches, complementary:

1. **JS-side memoisation at user API**: too varied to wrap exhaustively; only worth it for the most common builder constructors.
2. **Expose `BRepGraph_TransientCache` to user code as opt-in**: users who want incremental rebuild adopt the BRepGraph data model in their script; the cache is automatic. This matches OCCT v8's design intent.

For MVP, just expose `BinTools_ShapeWriter`/`Reader` to user code with a small embind facade so users can opt-in to manual memoisation in their scripts.

#### OpenSCAD

**No work needed.** OpenSCAD's `CGALCache` is compiled into the WASM and operates on AST node IDs. Tau's job is to ensure the WASM module persists across renders (it already does — kernel `initialize()` once, reused across `createGeometry` calls). The cache is automatic.

#### Manifold / JSCAD / KCL

Out of MVP scope. Apply the same memoisation pattern to their public API surfaces when (and only when) measured perf demands it.

### Two-level storage

| Level | Store                                        | Lifetime                    | Capacity                                 |
| ----- | -------------------------------------------- | --------------------------- | ---------------------------------------- |
| L1    | In-memory `LruMap<string, Bytes>` per worker | Worker process              | 100 MB byte-bounded (configurable)       |
| L2    | `.tau/cache/intermediate/{kernel}/{key}.bin` | Until `maxAge` (7d default) | `maxEntries` (configurable; default 500) |

Same shape as the existing `geometry-cache.middleware.ts` (F10) — reuse `LruMap` and `cleanupOldCacheEntries`. The new cache is a _peer_ of the geometry cache, not a replacement. Final-output cache (geometry-cache.middleware.ts) catches whole-script reverts; intermediate cache catches sub-tree reuses.

### Composability with existing cache

                ┌─────────────────────────────────────────────────────┐
                │  kernel-worker.createGeometry                       │
                │  ┌───────────────────────────────────────────────┐  │
                │  │ geometry-cache.middleware (existing, F10)     │  │  ← whole-script LRU
                │  │  miss → ──────────────────────────────────────┼──┼──┐
                │  │  hit  → return blob immediately               │  │  │
                │  └───────────────────────────────────────────────┘  │  │
                │                                                     │  │
                │  ┌───────────────────────────────────────────────┐  │  │
                │  │ kernel.createGeometry                         │  │  │
                │  │   user code calls makeBox(10,20,30) ──────────┼──┼──┼──→ replicad memoised wrapper
                │  │   user code calls fuse(...) ──────────────────┼──┼──┼──→ replicad memoised wrapper
                │  │   user code returns shape ────────────────────┼──┼──┘
                │  │   meshShapesToGltf(shape) → blob              │  │
                │  └───────────────────────────────────────────────┘  │
                └─────────────────────────────────────────────────────┘

Both caches run; the geometry cache short-circuits when the whole script's `dependencyHash` is unchanged, the intermediate cache short-circuits per-operation when only some parameters change.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Priority | Effort | Impact                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Add `KernelMemoCache` primitive in `packages/runtime/src/cache/kernel-memo-cache.ts` (LruMap-backed, byte-bounded eviction, hits/misses metrics). Same conventions as `geometry-cache.middleware.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P0       | S      | Foundation for all per-kernel adapters                                                                                                |
| R2  | Add a memoised replicad facade module: register a wrapper module via `runtime.bundler.registerModule('replicad', ...)` at kernel initialize() that intercepts `make*` constructors and `_3DShape` operators. Keys via `(opName, hash(jsArgs), inputShape.__cacheKey)`; values via `shape.serialize()`.                                                                                                                                                                                                                                                                                                                                                   | P0       | M      | Resolves the user's primary pain point (replicad parameter tweaks on large models)                                                    |
| R3  | Add a `BinToolsWrapper.cpp` to `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/` and the corresponding `additionalCppFiles` entry. Expose `Write(shape) → Uint8Array` and `Read(bytes) → TopoDS_Shape` via embind. Switch replicad's `serialize()`/`deserializeShape()` to binary BREP for ~3-5× smaller cache values + faster (de)serialisation.                                                                                                                                                                                                                                                                                  | P1       | M      | Reduces cache-value size dramatically; speeds up hits                                                                                 |
| R4  | Add an opt-in `BinTools` wrapper to `@taucad/opencascade.js` `full.yml` so standalone OCJS user scripts can manually memoise expensive operations. (Symbols already bound; just needs a thin embind facade for the stream-based API.)                                                                                                                                                                                                                                                                                                                                                                                                                    | P1       | S      | Unlocks user-managed caching for the opencascade kernel                                                                               |
| R5  | Document the memoisation contract for kernel authors in `docs/policy/kernel-caching-policy.md`: when to opt in, how to derive a stable `__cacheKey`, how to handle non-pure operations (font loads, randomness, etc.), eviction expectations.                                                                                                                                                                                                                                                                                                                                                                                                            | P1       | S      | Codifies the architectural decision so downstream kernels (KCL, future) follow the same shape                                         |
| R6  | Instrument the new `KernelMemoCache` with `tracer.startSpan('cache.hit'/'cache.miss')` and metrics so the perf wins are observable in Tau's tracing UI; surface `cache.bytes`/`cache.entries`/`cache.hitRate` per render.                                                                                                                                                                                                                                                                                                                                                                                                                                | P1       | S      | Validates the assumption that hits dominate misses for realistic workloads                                                            |
| R7  | Bench the cache against representative replicad scripts (e.g. `examples/electron-tau/.tau-project/main.scad` and a complex assembly). Target: ≥ 5× speedup on parameter tweaks of "last operation only" workloads vs current full re-run.                                                                                                                                                                                                                                                                                                                                                                                                                | P2       | M      | Empirical validation; informs eviction tuning                                                                                         |
| R8  | Reframe: do not pursue BRepGraph for operation-output memoisation. F9 establishes that BRepGraph is a normalised B-Rep storage layer, its caches are per-node attribute caches (not feature-tree caches), and `ModelingAlgorithms` does not consult BRepGraph at all. The realistic longer-horizon BRepGraph adoption paths for Tau are (a) **topological naming** via `UID`/`RefUID` + `BRepGraph_History` (stable selectors across re-renders) and (b) **per-face mesh / BndBox caches** via `BRepGraph_TransientCache` (re-render meshing wins). Both are orthogonal to R1–R3 and can be evaluated independently once the JS-level memoisation lands. | P3       | L      | Captures the honest scope of BRepGraph's value; prevents a future "let's adopt BRepGraph to fix re-render perf" that would not fix it |
| R9  | Defer: cross-kernel rollout. JSCAD/Manifold/KCL adapters can follow once the replicad adapter validates the pattern. OpenSCAD needs zero work (its in-WASM `CGALCache` already does this).                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P3       | varies | Sequence by perf demand                                                                                                               |

## Trade-offs

| Decision                                              | Alternative                              | Why we picked our side                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-kernel adapter, shared backend                    | Single Proxy interception over `oc`      | F11: argument hashing of WASM-backed objects is structurally unsolvable; identity hash gives zero hits                                                                                                                                         |
| JS-side memoisation                                   | OCCT v8 `BRepGraph_TransientCache` (C++) | F9: `BRepGraph_TransientCache` is a per-(node, CacheKind) attribute cache (BndBox / UVBounds / mesh), not an operation-output cache; `ModelingAlgorithms` never consults BRepGraph (`rg BRepGraph repos/OCCT/src/ModelingAlgorithms` → 0 hits) |
| Cache values in JS heap (serialized)                  | Cache values in WASM heap (live handles) | F18: 4 GB WASM cap; live handles risk `memory.grow` detachment cascades; serialize is cheap                                                                                                                                                    |
| Text BREP today, binary BREP later                    | Always binary BREP                       | F17: binary requires a `replicad-opencascadejs` rebuild and a new `BinToolsWrapper.cpp`; text BREP works in current builds                                                                                                                     |
| New cache layer, peer of geometry-cache.middleware.ts | Replace geometry-cache                   | F10: whole-script cache catches reverts; intermediate cache catches sub-tree reuse; both are useful                                                                                                                                            |
| Wrap replicad's public API in a Tau-owned facade      | Patch replicad upstream                  | F14: zero upstream precedent against; wrap-first lets us iterate without coupling Tau cadence to upstream                                                                                                                                      |

## Diagrams

### Cache key propagation through a replicad operation chain

       user code                memoized wrapper        kernel cache (KernelMemoCache)
       ───────────              ─────────────────       ──────────────────────────────

       makeBox(10,20,30)   ───→  key = "makeBox:10,20,30"
                                  cache.get(key) ?
                                  ┌── hit  → deserializeShape(value) → shape
                                         user code                memoized wrapper        kernel cache (KernelMemoCache)
       ───────────              ─────────────────       ──────────────────────────────

       makeBox(10,20,30)   ───→  key = "makeBox:10,20,30"
                                  cache.get(key) ?
                                  ┌── hit  → deserializeShape(value) → shape
                                  │          shape.__cacheKey = key
                                  └── miss → run BRepPrimAPI_MakeBox(...)
                                              shape.__cacheKey = key
                                              cache.set(key, shape.serialize())

       shape.fuse(other)   ───→  key = "fuse:" + hash(other.__cacheKey, opts)
                                           + ":" + shape.__cacheKey
                                  cache.get(key) ?
                                  ┌── hit  → deserializeShape(value) → result
                                  │          result.__cacheKey = key
                                  └── miss → run BRepAlgoAPI_Fuse(...)
                                              result.__cacheKey = key
                                              cache.set(key, result.serialize())

       shape2.fillet(2)    ───→  key = "fillet:" + hash(2)
                                              + ":" + shape2.__cacheKey
                                  ...

Result: changing the _last_ operation (`fillet(2)` → `fillet(3)`) invalidates only that one cache entry; `makeBox` and `fuse` still hit.

### State of state in the wider CAD ecosystem

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                         How leading CAD systems cache                           │
    ├──────────────────────────┬──────────────────────────────────────────────────────┤
    │ FreeCAD                  │ Per-feature property holds last shape; dirty-flag    │
    │                          │ DAG walk skips clean nodes. No content hash.         │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ Onshape                  │ Server-side regen → Context (B-rep + tess); cache    │
    │                          │ implicitly keyed by immutable microversion ID.       │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ Shapr3D                  │ Parasolid-internal feature cache; not user-visible.  │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ SolidWorks / Fusion 360  │ Coarse-grain rebuild; users mitigate by stripping    │
    │                          │ history (import as STEP).                            │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ SALOME                   │ DAG with cached results invalidated by descendant.   │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ OpenSCAD                 │ CGALCache + GeometryCache — byte-bounded LRU keyed   │
    │                          │ by AST node ID. THE precedent.                       │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ build123d / CadQuery     │ None internal; users apply @functools.cache manually.│
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ replicad                 │ None. Pure functions but no memo. shape.serialize()  │
    │                          │ exists; OCJS_ShapeHasher.HashCode is identity-only.  │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ OCCT v8 (kernel)         │ BRepGraph is a normalised B-Rep storage layer. Its  │
    │                          │ caches (TransientCache + reconstruction + History)  │
    │                          │ are per-node attribute / lineage caches, NOT memos  │
    │                          │ of modelling-operation outputs. ModelingAlgorithms  │
    │                          │ never consults BRepGraph (0 references).            │
    ├──────────────────────────┼──────────────────────────────────────────────────────┤
    │ Tau (today)              │ geometry-cache.middleware.ts — whole-script content- │
    │                          │ addressable; misses on every parameter change.       │
    └──────────────────────────┴──────────────────────────────────────────────────────┘

## References

- FreeCAD — `repos/FreeCAD/src/App/Document.cpp`, `src/App/DocumentObject.cpp`, `src/Mod/Part/App/PropertyTopoShape.{h,cpp}`, `src/Mod/Part/App/PartFeature.cpp`, `src/Mod/Part/App/FeaturePartBoolean.cpp`, `src/Doc/AsyncRecompute.dox`. PR #25603 (FEP-0010 fine-grained recomputes).
- Onshape — _How Does Onshape Really Work?_ https://onshape.com/en/blog/how-does-onshape-really-work ; _Under The Hood: How Collaboration Works_ http://onshape.com/en/blog/under-the-hood-how-collaboration-works ; _Onshape Live '21_ https://www.youtube.com/watch?v=kPNlzlkBGMA ; _FsDoc/library.html_ https://cad.onshape.com/FsDoc/library.html (`Context` description).
- Shapr3D — Wikipedia https://en.wikipedia.org/wiki/Shapr3D ; _History-Based Parametric Modeling_ https://shapr3d.com/content-library/shapr3d-history-based-parametric-modeling.
- SolidWorks — _Rebuild Types and How They Work_ https://www.mlc-cad.com/solidworks-help-center/rebuild-types-and-how-they-work/.
- Fusion 360 — _Timeline edits in Fusion_ https://www.autodesk.com/products/fusion-360/blog/timeline-edits-in-fusion/.
- SALOME — _Dependency Tree_ https://docs.salome-platform.org/9/gui/GEOM/dependency_tree_page.html.
- OpenSCAD — `CGALCache.{h,cc}`, `GeometryCache.{h,cc}` (commit fe3362f); PR #4996 _Minor caching cleanup_ (kintel, Feb 2024); PRs #3316 / #3483 _Persistent Cache_ (tbharathchandra, 2020, never merged).
- OCCT v8 — `repos/OCCT/src/ModelingData/TKBRep/BRepGraph/{BRepGraph,BRepGraph_TransientCache,BRepGraph_RefTransientCache,BRepGraph_CacheView,BRepGraph_ShapesView,BRepGraph_History,BRepGraph_HistoryRecord,BRepGraph_VersionStamp,BRepGraph_Layer,BRepGraph_Deduplicate}.hxx` and `repos/OCCT/src/ModelingData/TKBRep/BRepGraph/README.md`, `BRepGraphInc/README.md`; `BinTools_ShapeWriter`, `BRepBuilderAPI_Copy` (refman); PR #845 _Modeling Data — Add GeomHash and Geom2dHash packages_.
- Replicad — `repos/replicad/packages/replicad/src/shapes.ts`, `shapeHelpers.ts`, `addThickness.ts`, `register.ts`, `serialize.ts` analogues; `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/{brep-io,shape-hasher,mesh-extractor}.cpp`; `repos/replicad/packages/studio/src/builder.worker.js`.
- OCJS — `repos/opencascade.js/build-configs/full.yml`, `full_multi.yml`; `repos/opencascade.js/docs-site/content/docs/toolchain/guides/extend-with-cpp.mdx` and `derive-cpp-class-in-js.mdx`; `src/customBuildSchema.py`.
- Tau — `packages/runtime/src/middleware/geometry-cache.middleware.ts`, `parameter-cache.middleware.ts`; `packages/runtime/src/framework/kernel-worker.ts:computeDependencyHash`; `packages/runtime/src/kernels/occt/oc-tracing.ts`; `packages/runtime/src/kernels/replicad/replicad.kernel.ts`; `packages/runtime/src/kernels/opencascade/opencascade.kernel.ts`; `libs/utils/src/cache/lru-map.ts`.
- build123d / CadQuery — build123d issue #801 (caching POC); CadQuery `cqgi.py`.
- Theory — Acar, _Self-Adjusting Computation_ (CMU PhD, 2005); Jane Street, _Introducing Incremental_ (2015); DLR, _A Generic Parametric Modeling Engine Targeted Towards Multidisciplinary Design_ (CAD 21(3), 2024); SciTePress 2015, _Improved DAG representation for parametric CAD_; _Web-Based CAD with WebAssembly_ (IJETCSIT 2024).

## Appendix A — Symbol availability matrix (caching-relevant OCCT classes)

| Symbol                                  | `replicad_single`       | `full.yml`     | `full_multi.yml` | Notes                                                                                              |
| --------------------------------------- | ----------------------- | -------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `BRepTools` (text BREP I/O)             | ✅                      | ✅             | ✅               | Wrapper `BRepToolsWrapper` already in replicad-ocjs                                                |
| `BinTools` namespace                    | ❌                      | ✅             | ✅               | Binary BREP I/O; needs `BinToolsWrapper.cpp` to expose to JS                                       |
| `BinTools_ShapeWriter` / `_ShapeReader` | ❌                      | ✅             | ✅               |                                                                                                    |
| `BRepBuilderAPI_Copy`                   | ❌                      | ✅             | ✅               | Deep-copy support for cache value cloning                                                          |
| `BRepGraph` / `BRepGraph_Data`          | ❌                      | ✅             | ✅               | Normalised incidence-table storage; **not** an operation-output cache (see F9)                     |
| `BRepGraph_TransientCache`              | ❌                      | ✅             | ✅               | Per-(node, CacheKind) attribute cache (BndBox / UVBounds / mesh); cleared on `Build()`/`Compact()` |
| `BRepGraph_RefTransientCache`           | ❌                      | ✅             | ✅               | Per-ref attribute cache; symmetric to `BRepGraph_TransientCache`, freshness via `OwnGen`           |
| `BRepGraph_Builder`                     | ❌                      | ✅             | ✅               | Programmatic graph construction / mutation entry point                                             |
| `BRepGraph_CacheKindRegistry`           | ❌                      | ✅             | ✅               | Process-global GUID → dense slot registry for `CacheKind`s                                         |
| `BRepGraph_History`                     | ❌                      | ✅             | ✅               | Append-only `original→[derived]` lineage log (no geometry); useful for topological naming          |
| `GeomHash` / `Geom2dHash`               | ❌                      | (V8 dependent) | (V8 dependent)   | OCCT PR #845 — verify in `repos/opencascade.js/deps/OCCT/` after V8 final landing                  |
| `OCJS_ShapeHasher` (Tau-side)           | ✅ (identity hash only) | n/a            | n/a              | Identity-based, not value-based — unsuitable as cache key                                          |

## Appendix B — Cache-key derivation pseudocode

    // packages/runtime/src/kernels/replicad/replicad-memo.ts (sketch)

    import { hashString } from '@taucad/utils/hash';
    import { LruMap } from '@taucad/utils/cache';

    const HASH_PROPERTY = '__cacheKey';

    type CacheValue = { brepBytes: Uint8Array; byteLength: number };

    const cache = new LruMap<CacheValue>({ maxBytes: 100 * 1024 * 1024 });

    function literalKey(opName: string, jsArgs: unknown[]): string {
      return `${opName}:${hashString(JSON.stringify(jsArgs))}`;
    }

    function chainKey(opName: string, jsArgs: unknown[], inputKey: string): string {
      return `${opName}:${hashString(JSON.stringify(jsArgs))}:${inputKey}`;
    }

    export function memoizeConstructor<F extends (...args: any[]) => Shape>(
      opName: string,
      fn: F,
    ): F {
      return ((...args: Parameters<F>) => {
        const key = literalKey(opName, args);
        const hit = cache.get(key);
        if (hit) {
          const shape = deserializeShape(hit.brepBytes);
          Object.defineProperty(shape, HASH_PROPERTY, { value: key, enumerable: false });
          return shape;
        }
        const shape = fn(...args);
        Object.defineProperty(shape, HASH_PROPERTY, { value: key, enumerable: false });
        queueMicrotask(() => {
          const bytes = shape.serializeBytes();   // future BinTools wrapper, falls back to text BREP
          cache.set(key, { brepBytes: bytes, byteLength: bytes.byteLength });
        });
        return shape;
      }) as F;
    }

    export function memoizeOperator<S extends Shape, F extends (this: S, ...args: any[]) => Shape>(
      opName: string,
      fn: F,
    ): F {
      return function (this: S, ...args: Parameters<F>): ReturnType<F> {
        const inputKey = (this as any)[HASH_PROPERTY] ?? `literal:${hashString(this.serialize())}`;
        const key = chainKey(opName, args, inputKey);
        const hit = cache.get(key);
        if (hit) {
          const shape = deserializeShape(hit.brepBytes) as ReturnType<F>;
          Object.defineProperty(shape, HASH_PROPERTY, { value: key, enumerable: false });
          return shape;
        }
        const shape = fn.apply(this, args) as ReturnType<F>;
        Object.defineProperty(shape, HASH_PROPERTY, { value: key, enumerable: false });
        queueMicrotask(() => {
          const bytes = shape.serializeBytes();
          cache.set(key, { brepBytes: bytes, byteLength: bytes.byteLength });
        });
        return shape;
      } as F;
    }

## Appendix C — Why OpenSCAD's CGALCache is the right precedent (and the only one)

OpenSCAD's cache is unique among open-source CAD because:

1. **AST-derived stable IDs.** The cache key is the canonical text representation of a CSG subtree, computed deterministically as the parser builds the tree. Equivalent subtrees in different scripts collide their cache entries — beneficial deduplication.
2. **Byte-bounded eviction.** `cache.setMaxCost(100 MB)` weighted by `N.weight()` (per-Nef-polyhedron memory estimate). User-configurable via Preferences.
3. **Engine-pluggable.** PR #4996 (kintel, Feb 2024) extended `CGALCache` to store any engine-specific geometry — Manifold, future engines. Same key/value substrate, different stored types.
4. **Cross-engine semantics.** `GeometryCache` (PolySet) and `CGALCache` (Nef polyhedron) coexist; renderer routes node IDs to whichever cache is appropriate for the current backend.

For Tau, the analogous design:

| OpenSCAD concept                 | Tau concept                                                                |
| -------------------------------- | -------------------------------------------------------------------------- |
| AST node ID                      | per-operation `__cacheKey` derived from `(opName, args, input.__cacheKey)` |
| `CGAL_Nef_polyhedron`            | `TopoDS_Shape` (replicad) / `Manifold` / engine-native                     |
| `N.weight()` (bytes)             | `bytes.byteLength` of serialised value                                     |
| Singleton `instance()`           | per-worker `KernelMemoCache` instance                                      |
| Preferences-controlled `maxSize` | `KernelMemoCache.maxBytes` configurable via runtime options                |
| `clear()` on document close      | `clear()` on kernel re-init (e.g. WASM variant change)                     |
