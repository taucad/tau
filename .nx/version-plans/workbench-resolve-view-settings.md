---
workbench: minor
---

Resolve the inheritable view leaves: Tau, then the person, then the view.

- `resolveViewSettings({ tau, person?, exceptions?, view })` returns each of the ten leaves' value and source (`tau`, `person` or `view`). A leaf is set in a view when its value differs from `viewRecordV1Defaults`, or when `exceptions` lists it; otherwise it inherits the person's default, then Tau's value. The up axis never reads the person. The argument is an object so later levels can be added without a breaking change.
- `tauViewDefaults` is the top of the chain. It equals the format values in this release, so a view file with no person renders as it did before.
- `viewFieldValuesOf`, `readViewField` and `withViewField` read and write a view record by leaf path.

The view record's shape and version are unchanged. A consumer that reads a view file directly now sees format values where a level above may apply; resolve through `resolveViewSettings` to show what Tau shows.
