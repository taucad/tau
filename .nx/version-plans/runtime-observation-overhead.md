---
runtime: patch
---

Operation observation costs less. `parameterFacts` compares a structured leaf with its default without building either canonical form and walks a manifest without a closure per binding, about twice as fast on a 50-leaf manifest. A settled observation is built once and completed in place when its worker facts join, and the attempt waiting alone for its facts skips the map, roughly halving the time and the allocation of an observed operation. The observations, their field order and the parameter counts are unchanged.
