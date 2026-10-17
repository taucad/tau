---
runtime: minor
---

`registerElectronRuntimeMain` accepts `residentLimit` (`ElectronRuntimeResidentLimit`): it samples every adopted utility's resident memory on one interval, stopped while none is adopted, and kills one past `maxBytes`, reporting why through `onError`. A fork resolver may return `release`, called exactly once when its utility is released, exits, or is refused after resolution. A released or exited utility now removes the `destroyed` and `render-process-gone` listeners its lease installed on the renderer's web contents, which previously accumulated until the window closed.
