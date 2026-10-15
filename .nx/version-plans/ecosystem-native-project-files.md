---
build123d: minor
picogk: minor
runtime: minor
---

Native kernels publish the project files their language's own tools read, so a project Tau creates runs outside Tau. `@taucad/build123d/project/*` holds a `pyproject.toml` pinning build123d and its OCP build, a `pylock.toml` compacted from the kernel's per-target closure locks and a `uv.lock` of the same versions (`uv sync --locked`, then `uv run main.py`); `@taucad/picogk/project/*` holds a `.csproj` referencing upstream PicoGK 2.3.0 from NuGet and its `packages.lock.json` (`dotnet restore --locked-mode`, then `dotnet run`). Both kernels warn with the new `LIBRARY_VERSION_MISMATCH` issue code when the project's own manifest pins one of their libraries at a version they do not run.
