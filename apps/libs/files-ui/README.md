# @taucad/files-ui

The files feature of the Tau UI app: file and workspace-directory components, the file tree, export-format derivation, workspace telemetry and the file-manager helpers that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/files,components/filesystem,filesystem,machines,utils}` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (file tree, export, workspace connection and file-manager modules).

| Subpath                          | Contents                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/files/<name>`      | `export-format-grid` (export format picker), `open-render-button.ignore` (entries without an Open action)                                                                                                           |
| `./components/filesystem/<name>` | `overwrite-confirm-dialog`, `workspace-directory-panel`                                                                                                                                                             |
| `./components/magicui/file-tree` | Accordion file tree (`Tree`, `Folder`, `File`) for the files route and preview                                                                                                                                      |
| `./constants/browser.constants`  | Browser storage support flags and the host's directory picker                                                                                                                                                       |
| `./filesystem/<name>`            | `handle-store` (per-device workspace handles, Home engine pin), `desktop-bridge`, `desktop-permissions`, `home-opfs-probe`, `observe-home-project-saves`, `orphaned-project-route`, `use-persistent-storage-status` |
| `./machines/<name>`              | `file-manager-sync-fs-adapter` (workspace directory listing), `file-manager-worker-error` (worker fault codec), `file-manager-worker-name` (Home engine handoff)                                                    |
| `./utils/<name>`                 | `export-formats.utils` (export routes and formats), `project-creation-location.utils`, `workspace-telemetry.utils` (workspace event names and emitters; the app injects analytics and error reporting)              |

## Build target

Desktop-only branches read `isDesktopTarget` from `@taucad/ui-core/lib/build-target`, a literal the desktop build resolves to its `tau-desktop` variant, so those branches fold out of the web bundle. Tests choose a variant with `vi.mock('@taucad/ui-core/lib/build-target', …)`, not `vi.stubEnv`.

## Still in the app

`use-file-manager`, `use-file-content`, `use-file-tree`, `use-native-file-manager`, the file-manager machine and worker, `filesystem/{build-skew,desktop-quick-look,file-operation-participants}` and the remaining `components/files` and `components/filesystem` modules. Their closures reach `#environment.config`, `#runtime/*`, `lib/agent-host-placement`, `use-project`, `use-project-manager` or the CAD machine; `build-skew` belongs to the build lifecycle. `use-file-manager` reaches about 850 app modules through `#runtime/*`, and every remaining `components/files` and `components/filesystem` module reaches it.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
