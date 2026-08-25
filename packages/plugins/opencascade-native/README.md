# @taucad/opencascade-native

Native OpenCascade kernel plugin for Tau: a curated Rust facade over statically
linked OCCT, reached from Node through an N-API addon.

```typescript
import { opencascadeNative, opencascadeNativeKernel } from '@taucad/opencascade-native';

const selected = opencascadeNative();

const directKernel = opencascadeNativeKernel();
```

The package declares `opencascadeNative` as its canonical callable toolkit factory and re-exports that binding as `plugin` for mechanical loaders, plus role-named direct factories. Presets select capabilities and role-nested options configure selected factories. Backend payloads belong in capability `initialize()` methods and returned context, never in module-level caches.

## What this is, and what it is not

This is **not** a native port of `@taucad/opencascade`. That package exists so
user JavaScript can call OCCT's own 4,496 exported symbols; a native backend
cannot serve that contract without rebuilding embind through N-API, which the
S2 spike priced and rejected. The two packages are peers:

| capability                                                               | `@taucad/opencascade` (wasm) | `@taucad/opencascade-native` |
| ------------------------------------------------------------------------ | ---------------------------- | ---------------------------- |
| user JS calls arbitrary OCCT classes                                     | yes                          | no                           |
| runs in a browser                                                        | yes                          | no                           |
| curated facade (`createSolid.*`, `boolean`, `mesh`, `toGlb`, `readStep`) | via OCCT classes             | yes                          |
| kernel ready-to-work                                                     | ~644 ms                      | ~2 ms                        |

`@taucad/opencascade` never depends on this package, in either direction, and
this package has no WASM fallback: a missing addon throws
`OpencascadeNativeUnavailableError`. Selecting a backend is a host-recipe
decision.

## Model API

A model imports the facade and returns one solid or an array of solids:

```typescript
import oc from '@taucad/opencascade-native';

export const defaultParams = { size: 20, hole: 6 };

export default (kernel: typeof oc, params: typeof defaultParams) => {
  const body = kernel.createSolid.box([0, 0, 0], [params.size, params.size, params.size]);
  const bore = kernel.createSolid.cylinder(params.hole / 2, [0, 0, params.size]);
  return kernel.cutAll(body, [bore]);
};
```

Every entry point is wide: one crossing per user-visible operation, a batch form
for every list-shaped operation, and no per-vertex or per-scalar surface
anywhere. Meshes leave as `Float64Array`/`Uint32Array`/`BigUint64Array` views
over the Rust buffers; `toGlb`, `writeStep`, and `writeBrep` each return one
buffer.

## Building the addon

The addon links OCCT statically and is not built by `nx build`. Supply an OCCT
install prefix through `OCCT_ROOT`:

```sh
# 1. OCCT 8.0.1 static, from the same commit libcascade pins (~12 min, 8 cores)
cmake -G Ninja <tau>/repos/OCCT -B build \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_LIBRARY_TYPE=Static -DCMAKE_INSTALL_PREFIX=<prefix> \
  -DUSE_FREETYPE=OFF -DUSE_FREEIMAGE=OFF -DUSE_OPENVR=OFF -DUSE_FFMPEG=OFF \
  -DUSE_TBB=OFF -DUSE_VTK=OFF -DUSE_RAPIDJSON=OFF -DUSE_DRACO=OFF \
  -DUSE_TK=OFF -DUSE_TCL=OFF -DUSE_XLIB=OFF -DUSE_OPENGL=OFF -DUSE_GLES2=OFF -DUSE_EGL=OFF -DUSE_D3D=OFF \
  -DBUILD_MODULE_FoundationClasses=ON -DBUILD_MODULE_ModelingData=ON \
  -DBUILD_MODULE_ModelingAlgorithms=ON -DBUILD_MODULE_DataExchange=ON \
  -DBUILD_MODULE_Visualization=OFF -DBUILD_MODULE_ApplicationFramework=OFF \
  -DBUILD_MODULE_Draw=OFF -DBUILD_DOC_Overview=OFF -DBUILD_DOC_RefMan=OFF \
  -DBUILD_YACCLEX=OFF -DBUILD_RESOURCES=OFF -DBUILD_Inspector=OFF \
  -DBUILD_ENABLE_FPE_SIGNAL_HANDLER=OFF
cmake --build build --parallel && cmake --install build

# 2. the addon
export OCCT_ROOT=<prefix>
cargo build --release --manifest-path rust/Cargo.toml
cp rust/target/release/libtaucad_opencascade_native.dylib src/native/opencascade-native.node
```

Payload features (`rust/facade/Cargo.toml`): `modeling` adds fillet/chamfer/
shell/extrude/loft/sweep, `step` adds STEP and BRep interchange. Both default
on; `--no-default-features` builds the smallest payload.

## Benchmarks and parity

```sh
node bench/run-bench.mjs --rounds 5 --iters 9 --cpp <native-c++-control>  # interleaved native vs wasm
node bench/boolean-arity.mjs                                              # the arity-routing threshold
node bench/parity.mjs                                                     # T0-T2 native/wasm parity tiers
node bench/gated.mjs --cpp <native-c++-control>                           # budgets + regression + fingerprints
```

WASM is the reference semantics. `bench/parity.mjs` records the native lane's
verdict per corpus item as `exact`, `tolerant`, or `divergent`; the tessellation
divergence inside `BRepMesh_IncrementalMesh` is a known, owned issue and is
never reported as a pass.
