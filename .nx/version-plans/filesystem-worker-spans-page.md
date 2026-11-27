---
filesystem: minor
---

Forward worker timing spans to the page: `forwardWorkerTimings` posts each recorded span from a worker, `receiveWorkerTimings` writes it in the page as a `tau.worker.<span>` measure on the page's clock, and `summarizeMeasures` with `formatMeasureBreakdown` sum a timeline's measures by name. A worker's own span measures are now named `tau.worker.<span>` (was `tau:<span>`).
