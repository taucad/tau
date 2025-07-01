# Kernel Options

Tau supports multiple CAD kernels. Specify the kernel when initializing the CAD machine or by loading an example that is tagged with the corresponding language.

| Kernel      | `kernelType` | Language flag | Notes |
|-------------|--------------|---------------|-------|
| Replicad    | `"replicad"` | `replicad` (default) | Parametric TS/JS API backed by OpenCascade.js. |
| OpenSCAD    | `"openscad"` | `openscad`            | WebAssembly build of OpenSCAD. Accepts standard `.scad` syntax. |

## Using the OpenSCAD kernel

1. Load / create a file ending with `.scad` **or** set the build asset language to `openscad`.
2. The CAD machine will automatically choose the OpenSCAD kernel and spin up the `openscad-builder.worker`.
3. All Replicad viewer features work (mesh display, export ‑ *STEP export coming soon*).

Example:

```ts
send({
  type: 'initializeModel',
  code: `cube(10);`,
  parameters: {},
});
// cad.machine detects `.scad` → initializes OpenSCAD kernel
```

## Current limitations

* Only STL generation is wired; STEP export is a TODO.
* Parameter extraction (Customizer comments) not yet implemented – OpenSCAD models currently show an empty parameter panel.
* Error messages are raw stderr text.

Contributions welcome!