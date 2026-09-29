---
runtime: minor
bambu: minor
slicer: patch
---

A Bambu X1C can print from its external spool. The provider reports that spool (`vt_tray`, or `vir_slot` on newer firmware) as material slot `254`, Bambu's own tray id, after the AMS trays. It also reads `tray_now`/`tray_tar` `254` as the external spool feeding.

A one-filament print mapped to slot `254` starts with `use_ams: false`, `ams_mapping: [-1]` and `ams_mapping2: [{ ams_id: 255, slot_id: 0 }]`. Preflight refuses a mapping that mixes the external spool with other trays.

Other changes:

- Machine manifests can declare `materialSystem.externalSpoolSlot`.
- Observed material slots, and the current and target slots, range to 255.
- The Bambu submission configuration (1.2.0) accepts `254` in `amsMapping` and `expectedMaterials`.
- The print settings file accepts a filament preset for slot `"254"`.
