# Model-Viewer AR Integration: Complete Technical Reference

> Reference document for integrating augmented reality experiences into the Tau UI,
> derived from deep analysis of Google's `model-viewer` web component.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [AR Mode Selection and Fallback Chain](#ar-mode-selection-and-fallback-chain)
3. [WebXR AR Pipeline](#webxr-ar-pipeline)
4. [Apple Quick Look (ARKit) Pipeline](#apple-quick-look-arkit-pipeline)
5. [Android Scene Viewer Pipeline](#android-scene-viewer-pipeline)
6. [glTF-to-USDZ Conversion Pipeline](#gltf-to-usdz-conversion-pipeline)
7. [Web API Reference](#web-api-reference)
8. [Device and Feature Detection](#device-and-feature-detection)
9. [Tau Integration Strategy](#tau-integration-strategy)

---

## Architecture Overview

Model-viewer implements AR through three distinct pathways, each targeting different platforms. The system detects device capabilities at runtime and selects the best available mode.

```
┌─────────────────────────────────────────────────────────────────┐
│                     activateAR()                                │
│                         │                                       │
│         ┌───────────────┼───────────────┐                       │
│         ▼               ▼               ▼                       │
│   ┌──────────┐   ┌─────────────┐   ┌──────────────┐            │
│   │  WebXR   │   │Scene Viewer │   │  Quick Look  │            │
│   │ (Browser)│   │  (Android)  │   │    (iOS)     │            │
│   └────┬─────┘   └──────┬──────┘   └──────┬───────┘            │
│        │                │                  │                    │
│        ▼                ▼                  ▼                    │
│   WebXR Device    Android Intent     <a rel="ar">               │
│   API + Three.js  URL scheme         + USDZ blob               │
│        │                │                  │                    │
│        ▼                ▼                  ▼                    │
│   In-browser AR   Google Scene      Apple ARKit                 │
│   (DOM overlay)   Viewer app        Quick Look                  │
│                                                                 │
│   Input: glTF     Input: glTF URL   Input: USDZ                │
│   Format: WebGL   Format: glTF/GLB  Format: USDZ (from glTF)   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight: Format Requirements per Platform

| Platform | Input Format | AR Runtime | Notes |
|----------|-------------|------------|-------|
| WebXR (Chrome Android, headsets) | glTF/GLB (in-memory Three.js scene) | Browser WebXR API | Renders directly via WebGL in AR session |
| Android Scene Viewer | glTF/GLB (URL) | Google Scene Viewer app | Model URL passed via Android Intent |
| iOS Quick Look (ARKit) | **USDZ** | Apple AR Quick Look | Auto-generated from glTF or provided via `ios-src` |

---

## AR Mode Selection and Fallback Chain

### Priority Order

The default mode priority is `webxr scene-viewer quick-look`. Model-viewer evaluates each mode in order and selects the first that the device supports.

### Mode Selection Algorithm

```
for each mode in arModes:
  if mode == 'webxr':
    check navigator.xr exists
    check XRSession.prototype.requestHitTestSource exists
    check navigator.xr.isSessionSupported('immersive-ar')
    → if all pass, use WebXR

  if mode == 'scene-viewer':
    check IS_ANDROID && !IS_FIREFOX && !IS_OCULUS
    → if pass, use Scene Viewer

  if mode == 'quick-look':
    check IS_IOS
    if Safari: check <a>.relList.supports('ar')
    if WKWebView: check for CriOS/EdgiOS/FxiOS/GSA/DuckDuckGo
    → if pass, use Quick Look

fallback: if iosSrc is provided and device is iOS, force Quick Look
```

### `canActivateAR` Property

Returns `true` when any AR mode is available on the current device. This drives AR button visibility.

---

## WebXR AR Pipeline

WebXR provides the most integrated AR experience, rendering the 3D model directly in the browser's AR session with hit testing, DOM overlay, and lighting estimation.

### Session Lifecycle

#### 1. Session Request

```typescript
const session = await navigator.xr.requestSession('immersive-ar', {
  requiredFeatures: [],
  optionalFeatures: ['hit-test', 'dom-overlay', 'light-estimation'],
  domOverlay: { root: overlayElement }
});
```

All AR features are declared as **optional** so the session can start even if some are unavailable.

#### 2. Renderer Configuration

```typescript
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
await renderer.xr.setSession(session);
renderer.xr.cameraAutoUpdate = false;  // manual camera updates from XR pose
```

#### 3. Reference Space and Hit Testing

```typescript
// Viewer reference space for hit test origin
const viewerRefSpace = await session.requestReferenceSpace('viewer');

// Floor hit testing: ray cast downward at angle
const ray = new XRRay(
  new DOMPoint(0, 0, 0),
  { x: 0, y: -Math.sin(radians), z: -Math.cos(radians) }
);
session.requestHitTestSource({ space: viewerRefSpace, offsetRay: ray });

// Touch input hit testing
session.requestHitTestSourceForTransientInput({
  profile: 'generic-touchscreen'
});
```

#### 4. Frame Rendering Loop

```typescript
onWebXRFrame(time: number, frame: XRFrame) {
  const refSpace = renderer.xr.getReferenceSpace();
  const pose = frame.getViewerPose(refSpace);

  // Track AR tracking state
  if (!pose) { /* tracking lost */ }

  for (const view of pose.views) {
    // Update camera from XR pose
    renderer.xr.updateCamera(camera);
    scene.xrCamera = renderer.xr.getCamera();

    // Dynamic viewport scaling for performance
    if (view.requestViewportScale && view.recommendedViewportScale) {
      view.requestViewportScale(Math.max(scale, MIN_VIEWPORT_SCALE));
    }

    // Get viewport from XR layer
    const layer = renderer.xr.getBaseLayer();
    const viewport = layer.getViewport(view);
    renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
  }

  renderer.render(scene, camera);
}
```

#### 5. Object Placement via Hit Testing

```typescript
moveToFloor(frame: XRFrame) {
  const hitResults = frame.getHitTestResults(hitSource);
  const hit = hitResults[0];
  const pose = hit.getPose(refSpace);
  const hitMatrix = new Matrix4().fromArray(pose.transform.matrix);

  // Validate surface normal (must point upward for floor placement)
  if (hitMatrix.elements[5] > 0.75) {
    goalPosition.setFromMatrixPosition(hitMatrix);
  }

  hitSource.cancel();  // stop hit testing after placement
}
```

#### 6. Touch Interaction (Screen-Space Mode)

- **Single finger**: translation along hit-tested surface, rotation via horizontal drag
- **Two fingers**: pinch-to-scale, two-finger rotation
- Uses `getHitTestResultsForTransientInput()` for touch position hit testing
- Gamepad axes from `inputSource.gamepad.axes` provide normalized touch coordinates

#### 7. Controller Interaction (World-Space Mode / Headsets)

- Uses `renderer.xr.getController(0)` and `getController(1)`
- Ray-based intersection with placement box
- Supports grab, move, rotate, and two-controller scale

#### 8. Lighting Estimation

```typescript
const xrLight = new XREstimatedLight(renderer);
xrLight.addEventListener('estimationstart', () => {
  scene.add(xrLight);
  scene.environment = xrLight.environment;
});
```

Three.js `XREstimatedLight` wraps the WebXR `XRLightProbe` and `XRLightEstimate` APIs internally, providing:
- Directional light direction and intensity
- Spherical harmonics for ambient lighting
- Environment cubemap for reflections

#### 9. Session End and Cleanup

```typescript
await session.end();
// Cleanup: cancel hit sources, remove event listeners,
// dispose placement box/menu, restore scene state
```

### WebXR Feature Summary

| WebXR Feature | Purpose | Required? |
|---------------|---------|-----------|
| `hit-test` | Surface detection for object placement | Optional |
| `dom-overlay` | HTML UI overlay in AR view | Optional |
| `light-estimation` | Match virtual lighting to real environment | Optional |
| `immersive-ar` | AR session mode | Required (session type) |
| `local` reference space | Tracking relative to device start position | Required |

---

## Apple Quick Look (ARKit) Pipeline

iOS Quick Look is Apple's native AR viewer, accessible from Safari via a special anchor element pattern. It requires USDZ format.

### Activation Mechanism

```typescript
// 1. Generate or use provided USDZ
const usdzUrl = iosSrc ?? await prepareUSDZ();

// 2. Configure URL parameters
const modelUrl = new URL(usdzUrl, location.toString());
if (arScale === 'fixed') {
  modelUrl.hash += 'allowsContentScaling=0';
}

// 3. Create anchor with rel="ar" (iOS Safari magic attribute)
const anchor = document.createElement('a');
anchor.setAttribute('rel', 'ar');
anchor.setAttribute('href', modelUrl.toString());
anchor.setAttribute('download', 'model.usdz');

// 4. Append child <img> (required by iOS for Quick Look detection)
const img = document.createElement('img');
anchor.appendChild(img);

// 5. Attach to DOM and trigger
shadowRoot.appendChild(anchor);
anchor.click();

// 6. Cleanup
anchor.removeChild(img);
URL.revokeObjectURL(usdzUrl);
```

### Critical Implementation Details

1. **`rel="ar"` attribute**: This is the signal to iOS Safari that the link should open in AR Quick Look rather than downloading the file.

2. **Child `<img>` element**: iOS requires the anchor to contain an `<img>` child for Quick Look detection. Without it, the link behaves as a normal download.

3. **`download` attribute**: Set to `'model.usdz'` for generated USDZ to hint the file type.

4. **Hash parameters**: Quick Look supports configuration via URL hash:
   - `allowsContentScaling=0` — disables user scaling (for `arScale="fixed"`)
   - Hash parameters from the source model URL are preserved

5. **Shadow DOM attachment**: The anchor must be in the DOM (attached to shadow root) for iOS 16+ AR Quick Look banner click event propagation to work.

### Quick Look Feature Detection

```typescript
const IS_AR_QUICKLOOK_CANDIDATE = (() => {
  if (IS_IOS) {
    if (!IS_WKWEBVIEW) {
      // Safari: check relList.supports('ar')
      const a = document.createElement('a');
      return a.relList?.supports?.('ar') ?? false;
    } else {
      // WKWebView: check for known compatible browsers
      return /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(navigator.userAgent);
    }
  }
  return false;
})();
```

---

## Android Scene Viewer Pipeline

Android uses Google's Scene Viewer, an AR viewer built into the Google app, launched via Android Intent URLs.

### Intent URL Construction

```typescript
const params = new URLSearchParams(modelUrl.search);
params.set('mode', 'ar_preferred');
params.set('disable_occlusion', 'true');

if (arScale === 'fixed') params.set('resizable', 'false');
if (arPlacement === 'wall') params.set('enable_vertical_placement', 'true');

const intent = `intent://arvr.google.com/scene-viewer/1.2?` +
  `${params.toString()}&file=${encodeURIComponent(modelUrl)}` +
  `#Intent;scheme=https;` +
  `package=com.google.android.googlequicksearchbox;` +
  `action=android.intent.action.VIEW;` +
  `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end;`;

anchor.href = intent;
anchor.click();
```

### Scene Viewer Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `mode` | `ar_preferred` | Prefer AR mode, fall back to 3D viewer |
| `file` | URL to glTF/GLB | Model to display |
| `disable_occlusion` | `true` | Disable object occlusion (default) |
| `resizable` | `false` | Disable user scaling (`arScale="fixed"`) |
| `enable_vertical_placement` | `true` | Allow wall placement (`arPlacement="wall"`) |
| `sound` | URL | Optional audio |
| `link` | URL | Optional link button |

### Fallback Handling

Scene Viewer availability is detected via hash change monitoring. If the intent fails, the browser navigates to the fallback URL, which triggers a hash change that model-viewer intercepts to try the next AR mode.

---

## glTF-to-USDZ Conversion Pipeline

This is the critical bridge between glTF (the web-standard 3D format) and USDZ (Apple's AR format). The conversion happens entirely client-side using Three.js's `USDZExporter`.

### Conversion Flow

```
glTF/GLB (binary)
    │
    ▼
Three.js GLTFLoader
    │
    ▼
Three.js Scene Graph
(Object3D → Mesh → BufferGeometry + Material)
    │
    ▼
USDZExporter.parseAsync(scene, options)
    │
    ├─► Traverse scene graph
    │   ├─► Build USD Xform hierarchy (transforms)
    │   ├─► Convert BufferGeometry → USD Mesh primitives
    │   ├─► Convert Materials → UsdPreviewSurface shaders
    │   └─► Embed textures as PNG files
    │
    ▼
USDZ Archive (ArrayBuffer)
    │
    ▼
Blob URL → <a rel="ar" href="blob:..."> → iOS Quick Look
```

### USDZ Archive Structure

USDZ is a **ZIP archive** (uncompressed, 64-byte aligned) containing USD ASCII files and textures:

```
model.usdz (ZIP archive, no compression)
├── model.usda                         # Main scene file (USD ASCII)
│   ├── Root (Xform)                   # Scene root
│   │   ├── Scenes (Scope)             # Scene library
│   │   ├── Materials (Scope)          # All materials
│   │   │   ├── Material_0             # UsdPreviewSurface shaders
│   │   │   ├── Material_1
│   │   │   └── ...
│   │   └── Mesh_0 (Xform)            # Mesh transforms
│   │       ├── reference: Geometry_0  # Reference to geometry file
│   │       └── materialBinding        # Material assignment
├── geometries/
│   ├── Geometry_0.usda                # Mesh data (vertices, normals, UVs)
│   ├── Geometry_1.usda
│   └── ...
└── textures/
    ├── Texture_0.png                  # Embedded texture images
    ├── Texture_1.png
    └── ...
```

### 64-Byte Alignment Requirement

ARKit requires files within the USDZ archive to be aligned on 64-byte boundaries for memory-mapped access. The exporter achieves this by adding padding bytes in the ZIP local file header's extra field.

### Material Conversion: PBR → UsdPreviewSurface

| Three.js Property | USD Property | Notes |
|-------------------|-------------|-------|
| `MeshStandardMaterial.color` | `diffuseColor` | sRGB color space |
| `MeshStandardMaterial.map` | `diffuseColor` (texture) | Connected via UsdUVTexture |
| `MeshStandardMaterial.emissive` | `emissiveColor` | |
| `MeshStandardMaterial.emissiveMap` | `emissiveColor` (texture) | |
| `MeshStandardMaterial.normalMap` | `normal` | |
| `MeshStandardMaterial.roughness` | `roughness` | |
| `MeshStandardMaterial.roughnessMap` | `roughness` (texture) | Green channel |
| `MeshStandardMaterial.metalness` | `metallic` | |
| `MeshStandardMaterial.metalnessMap` | `metallic` (texture) | Blue channel |
| `MeshStandardMaterial.aoMap` | `occlusion` | Red channel, requires UV1 |
| `MeshStandardMaterial.opacity` | `opacity` | |
| `MeshStandardMaterial.alphaMap` | `opacity` (texture) | |
| `MeshStandardMaterial.alphaTest` | `opacityThreshold` | |
| `MeshPhysicalMaterial.clearcoat` | `clearcoat` | |
| `MeshPhysicalMaterial.clearcoatRoughness` | `clearcoatRoughness` | |
| `MeshPhysicalMaterial.ior` | `ior` | Index of refraction |

### Texture Handling

- All textures are re-encoded as **PNG** at quality 1.0
- Textures are sized down to `maxTextureSize` (default 1024px, configurable)
- `flipY` is handled during canvas conversion
- UV transforms (offset, repeat, rotation) are converted to `UsdTransform2d` nodes
- Wrap modes map: Three.js `RepeatWrapping` → USD `repeat`, `ClampToEdgeWrapping` → `clamp`, `MirroredRepeatWrapping` → `mirror`
- Color space: textures with color data use `sRGB`, data textures (normal, roughness) use `raw`

### Geometry Conversion

- `BufferGeometry` → USD Mesh with:
  - `point3f[] points` — vertex positions
  - `normal3f[] normals` — per-vertex normals (vertex interpolation)
  - `texCoord2f[] primvars:st` — UV coordinates (up to 4 UV sets: st, st1, st2, st3)
  - `color3f[] primvars:displayColor` — vertex colors (if present)
  - `int[] faceVertexCounts` — always `3` (triangles)
  - `int[] faceVertexIndices` — face indices
  - `subdivisionScheme = "none"` — no subdivision

### USDZExporter Options

```typescript
await exporter.parseAsync(scene, {
  ar: {
    anchoring: { type: 'plane' },
    planeAnchoring: { alignment: 'horizontal' }
  },
  includeAnchoringProperties: true,  // Include AR anchoring metadata
  quickLookCompatible: false,        // Workarounds for Apple bugs
  maxTextureSize: 1024,              // Max texture dimension in pixels
  onlyVisible: true                  // Skip invisible objects
});
```

### Limitations

- Only `MeshStandardMaterial` and `MeshPhysicalMaterial` are supported for conversion
- Double-sided materials are not supported in USDZ
- Negative scales on transforms are not supported
- Animations are not preserved in auto-generated USDZ
- Compressed textures require additional `textureUtils` setup

---

## Web API Reference

### Complete WebXR API Chain

```
navigator.xr
  ├── .isSessionSupported('immersive-ar')          → Promise<boolean>
  └── .requestSession('immersive-ar', {
        requiredFeatures: [],
        optionalFeatures: ['hit-test', 'dom-overlay', 'light-estimation'],
        domOverlay: { root: HTMLElement }
      })                                            → Promise<XRSession>

XRSession
  ├── .requestReferenceSpace('viewer')              → Promise<XRReferenceSpace>
  ├── .requestReferenceSpace('local')               → Promise<XRReferenceSpace>
  ├── .requestHitTestSource({
  │     space: XRReferenceSpace,
  │     offsetRay: XRRay
  │   })                                            → Promise<XRHitTestSource>
  ├── .requestHitTestSourceForTransientInput({
  │     profile: 'generic-touchscreen'
  │   })                                            → Promise<XRTransientInputHitTestSource>
  ├── .interactionMode                              → 'screen-space' | 'world-space'
  ├── .addEventListener('end', handler)
  ├── .addEventListener('selectstart', handler)
  ├── .addEventListener('selectend', handler)
  └── .end()                                        → Promise<void>

XRFrame (received each animation frame)
  ├── .getViewerPose(XRReferenceSpace)              → XRViewerPose
  ├── .getHitTestResults(XRHitTestSource)            → XRHitTestResult[]
  └── .getHitTestResultsForTransientInput(source)    → XRTransientInputHitTestResult[]

XRViewerPose
  └── .views                                        → XRView[]

XRView
  ├── .requestViewportScale(scale)                  → void
  └── .recommendedViewportScale                     → number

XRHitTestResult
  └── .getPose(XRReferenceSpace)                    → XRPose
        └── .transform.matrix                       → Float32Array (4x4)

XRHitTestSource
  └── .cancel()                                     → void

XRWebGLLayer
  └── .getViewport(XRView)                          → XRViewport { x, y, width, height }

XRInputSource
  └── .gamepad.axes                                 → number[] (touch coordinates)
```

### Quick Look API Chain

```
document.createElement('a')
  ├── .relList.supports('ar')                       → boolean (feature detection)
  ├── .setAttribute('rel', 'ar')                    → signals iOS Quick Look
  ├── .setAttribute('href', 'blob:...model.usdz')   → USDZ blob URL
  ├── .setAttribute('download', 'model.usdz')       → file type hint
  ├── .appendChild(document.createElement('img'))    → required child for detection
  └── .click()                                       → triggers Quick Look
```

### Scene Viewer API Chain

```
Android Intent URL:
  intent://arvr.google.com/scene-viewer/1.2
    ?mode=ar_preferred
    &file={encodeURIComponent(glTF_URL)}
    &disable_occlusion=true
    #Intent
    ;scheme=https
    ;package=com.google.android.googlequicksearchbox
    ;action=android.intent.action.VIEW
    ;S.browser_fallback_url={encodeURIComponent(fallback_URL)}
    ;end;
```

### Blob/File APIs Used

```
URL.createObjectURL(blob)                           → string (blob URL for USDZ)
URL.revokeObjectURL(url)                            → void (cleanup)
new Blob([arraybuffer], { type: 'model/vnd.usdz+zip' })
```

---

## Device and Feature Detection

### Platform Detection Constants

```typescript
// WebXR
const HAS_WEBXR_DEVICE_API =
  navigator.xr != null &&
  self.XRSession != null &&
  navigator.xr.isSessionSupported != null;

const HAS_WEBXR_HIT_TEST_API =
  HAS_WEBXR_DEVICE_API &&
  XRSession.prototype.requestHitTestSource != null;

const IS_WEBXR_AR_CANDIDATE = HAS_WEBXR_HIT_TEST_API;

// Android
const IS_ANDROID = /android/i.test(navigator.userAgent);
const IS_SCENEVIEWER_CANDIDATE = IS_ANDROID && !IS_FIREFOX && !IS_OCULUS;

// iOS
const IS_IOS =
  (/iPad|iPhone|iPod/.test(navigator.userAgent) && !self.MSStream) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const IS_WKWEBVIEW = Boolean(window.webkit?.messageHandlers);

const IS_AR_QUICKLOOK_CANDIDATE = (() => {
  if (!IS_IOS) return false;
  if (!IS_WKWEBVIEW) {
    const a = document.createElement('a');
    return a.relList?.supports?.('ar') ?? false;
  }
  return /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(navigator.userAgent);
})();
```

### Browser Compatibility

| Feature | Chrome Android | Safari iOS | Chrome iOS | Quest Browser |
|---------|---------------|------------|------------|---------------|
| WebXR AR | 83+ | No | No | Yes |
| Scene Viewer | Yes | No | No | No |
| Quick Look | No | 12+ | Yes (WKWebView) | No |
| DOM Overlay | 83+ | No | No | Yes |
| Hit Test | 81+ | No | No | Yes |
| Light Estimation | 90+ | No | No | Partial |

---

## Tau Integration Strategy

### Current Tau Architecture (Relevant)

- **3D Format**: glTF/GLB is already the primary output format from all CAD kernels
- **Three.js**: v0.179.0 with React Three Fiber v9.3.0
- **Export System**: XState machine-based export pipeline supporting STL, GLB, GLTF, STEP, 3MF
- **State Management**: XState machines for CAD preview lifecycle
- **Components**: `CadPreviewViewer` wraps the Three.js canvas with controls, lighting, and post-processing

### Integration Approach

#### Option A: Three.js WebXR Direct Integration (Recommended for WebXR)

Leverage React Three Fiber's existing Three.js renderer for WebXR sessions. This reuses the existing scene graph, materials, and geometry already loaded.

```
CadPreviewProvider (existing)
    │
    ├── CadViewer (existing 3D view)
    │
    └── ArViewer (new)
        ├── WebXR session management
        ├── Hit testing / placement
        ├── DOM overlay with AR controls
        └── Reuses existing Three.js scene
```

**Key packages to evaluate:**
- `@react-three/xr` — React Three Fiber WebXR bindings
- Native WebXR API via `useThree()` → `gl.xr` (Three.js WebGLRenderer XR manager)

#### Option B: Quick Look / Scene Viewer (Recommended for Mobile Native AR)

For native mobile AR experiences, generate the appropriate format and hand off to the OS:

```
Export Pipeline (existing XState machine)
    │
    ├── GLB blob (already available from kernel)
    │   ├── Android: Scene Viewer via Intent URL
    │   └── iOS: convert to USDZ first
    │
    └── USDZ generation (new)
        ├── Three.js USDZExporter
        ├── Blob URL creation
        └── <a rel="ar"> anchor click
```

#### Option C: `<model-viewer>` Web Component (Simplest)

Embed Google's `<model-viewer>` element for a batteries-included AR experience. It handles all three AR modes, USDZ generation, and device detection automatically.

```html
<model-viewer
  src="blob:...model.glb"
  ar
  ar-modes="webxr scene-viewer quick-look"
  ar-scale="auto"
  ar-placement="floor"
  camera-controls
/>
```

### Recommended Implementation Plan

#### Phase 1: USDZ Export Capability

1. Add `USDZExporter` from Three.js (`three/examples/jsm/exporters/USDZExporter.js`)
2. Extend `use-cad-export.ts` to support `usdz` format
3. Extend `export-geometry.machine.ts` with USDZ export event
4. Since Tau kernels output glTF → Three.js scene graph is already available

#### Phase 2: Quick Look AR (iOS)

1. Detect iOS Quick Look support using the `relList.supports('ar')` pattern
2. Generate USDZ blob from the current Three.js scene via `USDZExporter`
3. Create hidden `<a rel="ar">` anchor with `<img>` child and programmatically click
4. Add AR button to preview toolbar (conditionally visible on iOS)

#### Phase 3: Scene Viewer AR (Android)

1. Detect Android via user agent
2. Ensure the GLB model is accessible via URL (may need to upload to storage or create blob URL — note: Scene Viewer requires an `https://` URL, not `blob:`)
3. Construct Android Intent URL with model file parameter
4. Navigate via anchor click

#### Phase 4: WebXR AR (In-Browser)

1. Detect WebXR AR support via `navigator.xr.isSessionSupported('immersive-ar')`
2. Create AR session with optional features: `hit-test`, `dom-overlay`, `light-estimation`
3. Implement hit testing for object placement (floor/wall)
4. Add DOM overlay with exit button and scale controls
5. Handle touch interaction for move/rotate/scale
6. Integrate lighting estimation for realistic rendering

### File Format Compatibility Summary

```
Tau Kernel Output    Web Rendering    iOS AR (ARKit)    Android AR
─────────────────    ─────────────    ──────────────    ──────────
     glTF/GLB    ──► Three.js     ──► USDZExporter ──► USDZ ──► Quick Look
                     WebGL             (client-side
                     Canvas             conversion)
                       │
                       ├──────────────────────────────► Scene Viewer
                       │                                (glTF URL)
                       │
                       └──► WebXR Session ──► In-browser AR
                            (same WebGL      (same Three.js
                             context)         scene graph)
```

### Material Compatibility Considerations

Tau's CAD kernels produce geometry with materials that map to Three.js `MeshStandardMaterial`. This is directly compatible with the USDZ exporter's supported material types. Key considerations:

- **Matcap materials**: The matcap rendering mode used in `GltfMesh` would need to be bypassed for USDZ export — use the underlying PBR material instead
- **Edge lines**: `LineSegments2` (fat lines) are not exportable to USDZ — filter these out during export
- **Post-processing effects**: N8AO and other post-processing effects don't transfer to AR — they are screen-space only
- **Texture size**: Consider setting `maxTextureSize` to 2048 or 4096 for CAD models that may have detailed textures

### Required Dependencies

```json
{
  "three": "^0.179.0",           // Already installed - includes USDZExporter
  "@react-three/xr": "^6.x.x",  // Optional - for React Three Fiber WebXR
  "fflate": "^0.8.x"             // Already a dep of Three.js USDZExporter
}
```

### AR Button UX Pattern

Model-viewer's AR button pattern is well-established:
- Floating action button (FAB) positioned bottom-right
- Only visible when `canActivateAR` is true
- Customizable via slot/children
- Triggers `activateAR()` on click (must be user-initiated for Quick Look/Scene Viewer)
- Shows AR status feedback via events

For Tau, this could be integrated into the existing preview toolbar alongside export buttons, with platform-appropriate iconography and labeling ("View in AR", "View in your space").
