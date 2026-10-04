---
opencascade-native: patch
---

Cache the native addon preparation: `prepare-native` is now an Nx-cached target keyed on its script, the Rust crate and the host platform, so CI and local builds restore the prepared addon instead of recompiling OCCT 8.0.1 each time. The shipped addon is unchanged.
