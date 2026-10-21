---
agent-plugin: minor
---

The plugin ships `cad-smlibpy`, the SMLibPy authoring skill, beside `cad-build123d`. The `tau` skill's kernel table gives SMLibPy its row: a `main.py` that imports `smlibpy`, `prepare_kernel {"kernel":"smlibpy"}` once per computer, and when to pick it over build123d (NURBS BRep in Python with physical materials, textures and mechanisms, or a project that already imports `smlibpy`; build123d for builder mode, joints and STEP labels). The descriptions, keywords and README name SMLibPy among the kernels.

The README's Check makes the doctor the verification step, lists Codex with `codex plugin list --marketplace taucad`, says a shell check proves the launcher and CLI rather than the host's tools, and installs the CLI at the plugin's exact version when the two `beta` installs differ.
