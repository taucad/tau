---
runtime: patch
---

Stop asking the payload mirror for a payload the plugin's own package ships; it is read from the package, so a no-fallback mirror sees no request that can only miss.
