# Native renderer performance checkpoint

An isolated, opt-in spike. It does not change Tau's application renderer, filesystem schema, release configuration, or Electron packaging.

The executable path is a real `RuntimeClient` and in-process transport → fixture kernel with a declared file dependency → Tau's existing host-owned SQLite compute store → admitted immutable GLB closure → authenticated loopback host → either the existing Three.js renderer factory or a native wgpu process. This tests transport/rendering and cache reuse, not CAD kernel solve performance.

The native window is a **standalone GLFW sidecar**, not an embedded Electron view. Linux software Vulkan offscreen rendering is verified. Native macOS presentation, Electron 43 supervision/packaging and actual hardware performance are not qualified.

## Run

Use Node 24+, the repository's pinned pnpm and Python 3.12. Start from this checkpoint branch, then:

```bash
pnpm install --frozen-lockfile
python3 -m venv scripts/native-renderer-spike/.venv
scripts/native-renderer-spike/.venv/bin/pip install -r scripts/native-renderer-spike/requirements.txt
pnpm nx run scripts:native-renderer-build
pnpm nx run scripts:native-renderer-test
scripts/native-renderer-spike/.venv/bin/python -m unittest discover -s scripts/native-renderer-spike -p 'test_native.py'
node --import tsx scripts/native-renderer-spike/host.mts
```

The host prints a local browser URL with an ephemeral session capability in its fragment. Open that URL for Three.js WebGL, or insert `?backend=webgpu` **before** the fragment to try the existing experimental WebGPU factory. The page removes the fragment immediately. Do not save/share the capability or include it in logs. Ctrl-C releases the runtime, sockets and isolated temporary SQLite state.

For a native window, in another terminal set `SPIKE_URL` to the printed origin and `SPIKE_TOKEN` to the fragment value, then run:

```bash
scripts/native-renderer-spike/.venv/bin/python scripts/native-renderer-spike/native.py --window
```

A supported Vulkan/Metal device and graphical desktop are required. Drag in the window to orbit. Geometry stays resident and redraws are demand-driven. There is no remote unauthenticated proxy or automatic Electron launch. The host is deliberately restricted to `127.0.0.1`.

## Benchmarks

Hardware checkpoint (install Playwright's browser if it is not already available):

```bash
pnpm exec playwright install chromium
SPIKE_PYTHON="$PWD/scripts/native-renderer-spike/.venv/bin/python" SPIKE_HEADED=1 \
  pnpm nx run scripts:native-renderer-benchmark
scripts/native-renderer-spike/.venv/bin/python scripts/native-renderer-spike/compare.py
```

`SPIKE_CHROMIUM` optionally selects a locally installed Chromium executable. `SPIKE_BACKENDS=webgl,webgpu` selects browser runs; `SPIKE_NATIVE=0` omits native runs. No software-GPU flags are added unless `SPIKE_SOFTWARE=1`. Check the recorded adapter, drivers and device independently before calling a run hardware-qualified. Unset cloud `VK_ICD_FILENAMES`/`WGPU_BACKEND_TYPE` overrides on a hardware workstation.

For a software-only cloud with Chromium's SwiftShader Vulkan ICD, set its actual path explicitly, for example:

```bash
SPIKE_SOFTWARE=1 SPIKE_CHROMIUM=/usr/bin/chromium \
VK_ICD_FILENAMES=/usr/lib/chromium/vk_swiftshader_icd.json WGPU_BACKEND_TYPE=Vulkan \
SPIKE_PYTHON="$PWD/scripts/native-renderer-spike/.venv/bin/python" \
  pnpm nx run scripts:native-renderer-benchmark
```

Outputs are under `out/research/native-renderer/`: JSON frame samples/stage measurements, stderr, canvas captures, offscreen RGBA and parity results. Failed backends return a nonzero benchmark exit code. `compare.py` checks readback mask IoU > 0.98 and mean RGB error < 2/255, separately reporting whether the canvas actually presented. Offscreen correctness is not presentation qualification.

The fixture has 1,024 cubes, 12,288 triangles, one material, fixed 640×480 output, 4× MSAA, identical camera trajectory and unlit linear color converted to sRGB. Native split-draw and batched modes use identical vertices. Each run warms ten frames and records 120 frames. Frame samples are **synchronized render wall times**, not display-vsync frame times or GPU timestamp queries. WebGL forces a one-pixel readback; WebGPU/native wait on the queue. First-correct-frame means a completed offscreen visibility readback after acquisition, not photons on a monitor. Browser module loading and native Python imports precede that clock.

Browser upload and first draw are combined because the existing renderer lazily uploads geometry. Native records synchronized vertex upload separately from device/pipeline setup. Browser RSS is a 100 ms sample of summed Chromium-process RSS on Linux (shared pages may be counted twice); native RSS is the process high-water mark. They are not equivalent memory metrics. Idle CPU samples cover only 250 ms and do not establish power consumption.

## Contract and ownership

- `protocol.mts` accepts materialized runtime geometry and an **explicit, already-authorized** map of external glTF resources. It reads no filesystem paths. Core buffer/image URIs must be simple declared names; remote URLs, data URIs, traversal and unsupported extensions fail closed. The fixture's native profile excludes textures, animation and skins.
- Control JSON contains version, monotonically increasing revision, profile, asset digest/dependencies and view/camera/viewport state. Binary bytes travel separately under `/assets/<sha256>`. Every client verifies digest and length.
- This is a transient renderer delivery descriptor, **not an authored scene file format**. An authored-scene resolver can feed `startHost` / `publishGeometry` with existing runtime outputs; schema, source watchers, grid, axes and lights remain with their existing owners.
- The host retains one bounded current closure (64 MiB, at most 128 dependency entries), with four active authenticated requests and eight connections. Publication validates before replacing current state. It adds no competing generic compute store. A superseded asset returns 404; a consumer acquiring concurrently must restart acquisition. Automatic retry/live subscription is not implemented in this spike.
- View updates use revision compare-and-swap. Camera/preview-intensity edits transfer no geometry and invoke no kernel. Preview intensity is an unlit color uniform, **not a production light model**.
- The native profile handles opaque unlit triangle primitives, indexed/interleaved accessors, node transforms and explicit external buffers. Unsupported features return an error and direct the caller to the existing Three.js viewer; the application fallback itself is unchanged. It does not implement PBR, lines, textures, CAD selection, sections, picking, spatial residency, device-loss recovery or durable view state.

Use this probe to decide whether deeper work is justified. A production native path should reuse the existing NanoRaster Rust render core and its GLB/material admission, rather than promote this intentionally restricted Python decoder. NanoRaster's current public API returns encoded images; presentable surfaces and prepared-geometry residency need an explicit extension before it can replace an interactive renderer.

## Filesystem scene handoff

The separate scene experiment's [verified contract](https://github.com/taucad/tau/blob/c6fd9d593cd814074f96ffc878bc57c48658acb2/packages/workbench/src/experiments/filesystem-scene/CONTRACT.md) owns authored view grammar and `SceneAdapter.prepare/commit/dispose/present`. This checkpoint does not import or duplicate that schema. Connecting all inventory assets and its full camera/light/grid/axes state to a pixel adapter remains an integration gate; `publishGeometry` alone is not that adapter.

## Version provenance

The repository lockfile supplies Three.js 0.184.0, Playwright 1.62.1, Vitest 4.1.11, esbuild 0.27.7 and tsx 4.22.4 at this checkpoint. Python dependencies are exact-pinned separately. wgpu-py 0.31.1 reports wgpu-native 27.0.4.0. Version 0.32.0 failed queue-completion callback initialization in the cloud and is not the selected pin. The existing NanoRaster source uses wgpu 30; devices cannot be shared between these distinct implementations.

Primary references: [Three.js renderer guide](https://threejs.org/manual/pages/webgpurenderer), [wgpu](https://wgpu.rs/), [wgpu-py guide](https://wgpu-py.readthedocs.io/en/stable/guide.html), [Filament gltfio](https://google.github.io/filament/dup/gltfio.html), [glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html). Consult the pinned versions' documentation when rerunning; live documentation can advance.
