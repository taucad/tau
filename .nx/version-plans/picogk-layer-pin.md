---
picogk: patch
---

`@taucad/picogk`'s `tau-plugin.json` pins the published Tau PicoGK layer for darwin-arm64 (sha256 `cd5fdf6669b8ee085e4091390d22378695bcc05fd8a21b4de492d21a3cfcf6f1`, served by `cdn.tau.new` and the `picogk-layer-cd5fdf6669b8ee08` GitHub Release) in place of the fail-closed placeholder, so `tau prepare picogk` prepares the PicoGK runtime on Apple silicon Macs.
