---
runtime: minor
---

`registerElectronRuntimeMain` accepts `spareIdleMilliseconds`: a prewarmed spare that no request adopts within that time is retired, and the next fork warms a new one, so an idle app holds no spare utility. `ElectronRuntimeUtilityExit` carries `peakResidentBytes`, the largest resident sample the `residentLimit` took for that utility.
