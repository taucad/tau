# Kernel Options

Tau supports multiple CAD kernels. Specify the kernel when initializing the CAD machine or by loading an example that is tagged with the corresponding language.

| Kernel      | `kernelType` | Language flag | Notes |
|-------------|--------------|---------------|-------|
| Replicad    | `"replicad"` | `replicad` (default) | Parametric TS/JS API backed by OpenCascade.js. |
| OpenSCAD    | `"openscad"` | `openscad`            | WebAssembly build of OpenSCAD. Accepts standard `.scad` syntax. |
| Zoo (KCL)   | `"zoo"`      | `zoo`                 | KittyCAD Language for cloud-native CAD with AI integration. |

## Using the OpenSCAD kernel

1. Load / create a file ending with `.scad` **or** set the build asset language to `openscad`.
2. The CAD machine will automatically choose the OpenSCAD kernel and spin up the `openscad.worker`.
3. All Replicad viewer features work (mesh display, export ‑ *STEP export coming soon*).

Example:

```ts
send({
  type: 'initializeModel',
  code: `cube(10);`,
  parameters: {},
  kernelType: 'openscad',
});
// cad.machine detects `.scad` → initializes OpenSCAD kernel
```

## Using the Zoo (KCL) kernel

1. Load / create a file ending with `.kcl` **or** set the build asset language to `zoo`.
2. The CAD machine will automatically choose the Zoo kernel and spin up the `zoo.worker`.
3. All viewer features work including mesh display, STL export, and STEP export.
4. Requires `KITTYCAD_API_TOKEN` environment variable for Zoo API access.

Example:

```ts
send({
  type: 'initializeModel',
  code: `
const width = 10
const height = 10
const depth = 10

const cube = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([width, 0], %)
  |> line([0, height], %)
  |> line([-width, 0], %)
  |> close(%)
  |> extrude(depth, %)
  `,
  parameters: {},
  kernelType: 'zoo',
});
// cad.machine detects `.kcl` → initializes Zoo kernel
```

## Current limitations

### OpenSCAD
* Only STL generation is wired; STEP export is a TODO.
* Parameter extraction (Customizer comments) not yet implemented – OpenSCAD models currently show an empty parameter panel.
* Error messages are raw stderr text.

### Zoo (KCL)
* Requires internet connection for Zoo API access.
* API token required for full functionality.
* Fallback to mock geometry when API is unavailable.

Contributions welcome!
