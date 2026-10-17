---
cli: minor
host: minor
mcp: minor
geospec: minor
---

`tau mcp`'s CAD tool results name the project root their paths resolved against, and a GeoSpec load can name the folder its paths resolve in.

- Successful `evaluate_model`, `test_model`, `screenshot` and `export_model` results from `@taucad/host`'s tool registry carry `projectRoot`, the absolute root of the call: `--project`, the folder Codex names with the call, `CLAUDE_PROJECT_DIR`, or the working directory. `@taucad/mcp` keeps it in each structured result and, for inline screenshots, as a `projectRoot:` text line; the host's MCP endpoint keeps it on filed screenshots and shortened GeoSpec reports.
- `tau mcp` names its start root and where it came from on stderr, and each folder a call names the first time it is used. `tau mcp`, `tau test`, `tau check`, `tau export` and `tau open` share one project-root resolution.
- `loadModel({ file })` and `loadModel({ source })` take `rootDir`, a canonical project-relative folder the load's paths resolve in, recorded as `rootDir` in the load evidence. Inline-code loads do not take it, in their type and at run time, and a malformed folder is refused as `GEOSPEC_MODEL_OPTION_INVALID`.
- A `loadModel({ file })` of a file the root does not hold now refuses with `GEOSPEC_MODEL_SOURCE_NOT_FOUND`, a `model-load` failure that names the root and the path it looked for and says that a path from the project root or `rootDir` fixes it, instead of the runtime's untyped `ENOENT`. A failed direct-source read names the root and the joined path too.
