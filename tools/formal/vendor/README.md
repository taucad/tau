# Vendored formal toolchain binaries

`tla2tools.jar` is TLC build `2026.10.02.152454-dfd4f7f`, the jar TLA+ published as the v1.8.0
release asset before upstream replaced that asset with a nightly build. It is kept here so the
pin in [`../toolchain.lock`](../toolchain.lock) stays reproducible.

- Source: <https://github.com/tlaplus/tlaplus/releases/tag/v1.8.0>
- Licence: MIT (TLA+ tools)
- sha256: `400ae7f0291bef9459c07840e0da1507196ee707a7102b04186a5f1b820470d7`

`formal setup` downloads it from this repository at a fixed commit and refuses any bytes whose
sha256 differs from the lock. To re-pin, replace the jar and update `tlc.build`, `tlc.sha256` and
`tlc.url` together.
