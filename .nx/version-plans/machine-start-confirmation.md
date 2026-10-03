---
runtime: minor
---

A print request gains the `confirming` state: the start was sent but the printer has not yet proven it took it. The Node machine host settles such a start from the printer's own reports, re-running the provider's `reconcile` for each unknown run effect on every report of a connected machine, so a printer that confirms a start only through its status (the Bambu X1C) no longer waits for a person to reconcile it. A start left unproven for 180 s becomes `unknown`, and is still settled if the printer later reports the run. Nothing is resent.
