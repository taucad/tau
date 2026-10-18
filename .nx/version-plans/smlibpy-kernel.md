---
smlibpy: minor
cli: minor
geospec-engine: minor
skills: minor
---

feat(smlibpy): Add the native SMLibPy kernel (`@taucad/smlibpy`, running smlibpy 0.3.5 in a sealed CPython closure that `tau prepare smlibpy` prepares) with the SMLib kernel's capabilities in Python: GLB and glTF with names, colors, full PBR materials, textures, topology and mechanisms; STEP and STL exports; and `.smb` compute values. The CLI, GeoSpec default runtime and desktop list it before Build123d, so a `.py` entry that imports `smlibpy` runs on SMLibPy and every other `.py` entry still runs on Build123d. `@taucad/skills` ships the `cad-smlibpy` skill bundle.
