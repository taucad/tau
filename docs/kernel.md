# Kernel Options

Tau supports multiple CAD kernels. Specify the kernel when initializing the CAD machine or by loading an example that is tagged with the corresponding language.

| Kernel      | `kernelType` | Language flag | Notes |
|-------------|--------------|---------------|-------|
| Replicad    | `"replicad"` | `replicad` (default) | Parametric TS/JS API backed by OpenCascade.js. |
| OpenSCAD    | `"openscad"` | `openscad`            | WebAssembly build of OpenSCAD. Accepts standard `.scad` syntax. |
| Zoo (KCL)   | `"zoo"`      | `zoo`                 | Cloud-native CAD using KCL (KittyCAD Language) with Zoo's geometry engine. |

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
3. Zoo provides both STL and STEP export capabilities through its cloud-native geometry engine.
4. Integrates with Zoo's Text-to-CAD and other AI-powered features.

Example:

```ts
send({
  type: 'initializeModel',
  code: `
    const width = 20
    const height = 10
    const depth = 15
    
    box(width, height, depth)
  `,
  parameters: {},
  kernelType: 'zoo',
});
// cad.machine detects `.kcl` → initializes Zoo kernel
```

## Current limitations

### OpenSCAD kernel
* Only STL generation is wired; STEP export is a TODO.
* Parameter extraction (Customizer comments) not yet implemented – OpenSCAD models currently show an empty parameter panel.
* Error messages are raw stderr text.

### Zoo kernel
* Requires Zoo KittyCAD SDK (`@kittycad/lib`) to be installed.
* Current implementation includes mock geometry for demonstration purposes.
* Full Zoo API integration depends on proper SDK setup and authentication.

Contributions welcome!
