---
revisions: minor
---

A checkout paces its published mints at one a second (`checkoutMintFloorMilliseconds`, overridable through `mintFloor` on the checkout machine's input). The floor runs after the fence is released, in a new top-level `spacing` state that reports `clean` or `dirty`; the ambient requests that arrive during it are one mint, a turn's cut keeps its own, and a write or head move during it decides where the checkout goes once it has passed. A mint that published nothing is not paced.
