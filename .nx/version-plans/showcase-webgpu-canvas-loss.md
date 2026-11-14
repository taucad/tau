---
viewer: minor
---

`createRenderer('showcase', …)` takes `presented: true` on its target for a canvas whose frames are shown or copied. A presented WebGPU `HTMLCanvasElement` presents one cleared frame before creation resolves, as a viewport's canvas does; where the browser destroys the device instead (Chromium on a software adapter), creation releases the renderer, reports the canvas loss (`reportWebGpuCanvasLoss`, so later backend resolutions on the page answer WebGL) and rejects with `WebGpuInitializationError`. A showcase renderer that only reads its render targets back is unchanged.
