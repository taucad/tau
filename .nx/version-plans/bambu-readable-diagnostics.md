---
bambu: minor
---

Printer diagnostics and stages are readable. An HMS alert carries its display code (`0C00-0300-0003-000B`), a severity, one sentence naming the printer module, and the Bambu help-centre page for the code; a `print_error` carries its code (`0300-400C`) and a sentence. `run.stage` is a phrase read from the printer's current stage while a run is live ("Heating the bed"), never a bare number. Still capture is offered only for an X1C whose host captures RTSPS stills; the unqualified port-6000 path for other models is removed.
