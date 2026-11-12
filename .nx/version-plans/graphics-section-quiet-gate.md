---
viewer: minor
---

Give the graphics machine's section view a quiet gate: `section.on` is now `settled` or `editing`, a cut change enters `editing` and settles `sectionSettleDelay` (250 ms) after the last change, and the machine emits `sectionEdited` and `sectionSettled` so a host can hold a foreign section while cuts are edited. Add `adoptUpDirection`, which sets the up direction from a saved record without starting the camera's up change or settle.
