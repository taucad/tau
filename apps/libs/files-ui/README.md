# @taucad/files-ui

The files feature of the Tau UI app: file and workspace-directory components, the file tree, export-format derivation, workspace telemetry and the file-manager helpers that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/files,components/filesystem,filesystem,machines,utils}` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (file tree, export, workspace connection and file-manager modules).

| Subpath                          | Contents                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/files/<name>`      | `export-format-grid` (export format picker), `open-render-button.ignore` (entries without an Open action)                                                                                                                                                                                                            |
| `./components/filesystem/<name>` | `overwrite-confirm-dialog`, `workspace-directory-panel`                                                                                                                                                                                                                                                              |
| `./components/magicui/file-tree` | Accordion file tree (`Tree`, `Folder`, `File`) for the files route and preview                                                                                                                                                                                                                                       |
| `./constants/browser.constants`  | Browser storage support flags and the host's directory picker                                                                                                                                                                                                                                                        |
| `./filesystem/<name>`            | `handle-store` (per-device workspace handles, Home engine pin), `desktop-bridge`, `desktop-permissions`, `home-opfs-probe`, `observe-home-project-saves`, `orphaned-project-route`, `use-persistent-storage-status`                                                                                                  |
| `./hooks/<name>`                 | `use-file-services` (`FileServicesProvider`: the project's content and tree services, which the app's `FileManagerProvider` supplies), `use-file-content` (`useFileContent`, `useFreshContent`), `use-file-tree` (`useFileTreeSelector`, `useFileTreeMap`, `useFileTreeEntry`)                                       |
| `./machines/<name>`              | `file-manager-sync-fs-adapter` (workspace directory listing), `file-manager-worker-error` (worker fault codec), `file-manager-worker-name` (Home engine handoff)                                                                                                                                                     |
| `./utils/<name>`                 | `export-formats.utils` (export routes and formats), `project-creation-location.utils`, `workspace-telemetry.utils` (workspace event names and emitters; the app injects analytics and error reporting), `file-tree.utils` (file-tree item mapping and expansion), `file-tree-download-policy` (folder ZIP size gate) |

## File services

`use-file-content` and `use-file-tree` read `{ contentService, treeService }` from `FileServicesProvider`, never from the app's file manager. `apps/ui`'s `FileManagerProvider` renders the provider inside its own context. `useFileContent` and `useFreshContent` throw outside a provider; `useFileTreeSelector` degrades to an empty tree, so presentation-only surfaces render outside a project. An app suite that mocks `#hooks/use-file-manager.js` and renders a component reading these hooks also mocks `@taucad/files-ui/hooks/use-file-services`, delegating `useFileServices` and `useOptionalFileServices` to the mocked `useFileManager` so both read the same services.

## Build target

Desktop-only branches read `isDesktopTarget` from `@taucad/ui-core/lib/build-target`, a literal the desktop build resolves to its `tau-desktop` variant, so those branches fold out of the web bundle. Tests choose a variant with `vi.mock('@taucad/ui-core/lib/build-target', …)`, not `vi.stubEnv`.

## Still in the app

`use-file-manager`, `use-native-file-manager`, `chat-editor-file-tree`, the file-manager machine and worker, `filesystem/{build-skew,desktop-quick-look,file-operation-participants}` and the remaining `components/files` and `components/filesystem` modules. Their closures reach `#environment.config`, `#runtime/*`, `lib/agent-host-placement`, `use-project`, `use-project-manager` or the CAD machine; `build-skew` belongs to the build lifecycle. `use-file-manager` reaches about 850 app modules through `#runtime/*`, and every remaining `components/files` and `components/filesystem` module reaches it.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
