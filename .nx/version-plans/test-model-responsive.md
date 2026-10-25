---
host: minor
---

`test_model` holds the runtime once per model, and parameter reads stop waiting on it (live-render LRP-11).

- Within one `test_model` run, every load of the same model, format, parameters, mesh tolerance and region reuses one Runtime export while the files it read are unchanged; GeoSpec requirements that load `main.ts` as STEP eight times export it once. A failed export is never reused.
- `get_parameters` answers from the parameter actor's resolved manifest, without a runtime round-trip, when every source file that manifest names still has the digest it was compiled from; an edit, a missing file or another `resolutionMode` resolves as before.
