# @taucad/files-ui

The files feature of the Tau UI app: file and workspace-directory components, the file tree, export-format derivation, workspace telemetry and the file-manager helpers that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/files,components/filesystem,filesystem,machines,utils}` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (file tree, export, workspace connection and file-manager modules).

| Subpath                             | Contents                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `./components/files/<name>`         | `export-format-grid` (export format picker), `open-render-button.ignore` (entries without an Open action)      |
| `./components/filesystem/<name>`    | `overwrite-confirm-dialog`, `workspace-directory-panel`                                                        |
| `./components/magicui/file-tree`    | Accordion file tree (`Tree`, `Folder`, `File`) for the files route and preview                                 |
| `./filesystem/home-opfs-probe`      | Probes OPFS in a dedicated worker before Home roots on it                                                      |
| `./machines/<name>`                 | `file-manager-sync-fs-adapter` (workspace directory listing), `file-manager-worker-error` (worker fault codec) |
| `./utils/export-formats.utils`      | Export routes and formats derived from the runtime capabilities manifest                                       |
| `./utils/workspace-telemetry.utils` | Workspace event names and emitters; the app injects analytics and error reporting                              |

## Still in the app

`use-file-manager`, `use-file-content`, `use-file-tree`, `use-native-file-manager`, the file-manager machine and worker, `filesystem/{handle-store,desktop-bridge,build-skew,...}` and the remaining `components/files` and `components/filesystem` modules. Their closures reach `lib/build-target` (`import.meta.env.TAU_TARGET`), `#package.json`, `#environment.config`, `use-project`, `use-project-manager` or the CAD machine. `use-file-manager` reaches about 850 app modules through `#runtime/*`, and every remaining `components/files` and `components/filesystem` module reaches it.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
