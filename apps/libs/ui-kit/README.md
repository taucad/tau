# @taucad/ui-kit

Presentational components and icons for the Tau UI app that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:ui`): `apps/ui` and future UI feature libraries import it; it imports only `layer:ui`/`layer:util` projects and published packages, never `apps/ui`.

Design-system primitives (`Button`, `Dialog`, `cn`, `toast`, …) live in the published [`@taucad/ui`](../../../packages/ui) package. This library holds the app-level compositions built on them.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` routes and components, and the UI feature libraries cut from it (`chat-ui`, `project-workspace`, …).

| Subpath                           | Contents                                                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/<name>`             | `collection-empty-state`, `color-picker`, `combobox`, `coming-soon`, `data-table`, `date-picker`, `date-range-picker`, `dropzone`, `image-preview`, `input-tags`, `lazy-section`, `omni-scroller`, `responsive-tabs`, `spinner`, `viewer-layer` |
| `./icons/<name>`                  | `svg-icon` (sprite ids), `file-extension-icon`, `svg-sprite-loader`, `svg-path-icon`, Tau marks and small glyph components                                                                                                                      |
| `./icons/generated/svg-icons`     | `SvgIcons` id union generated from `src/icons/raw`                                                                                                                                                                                              |
| `./icons/generated/*.svg`         | The checked-in sprites; the app shell mounts them (`apps/ui/app/components/icons/svg-sprite-mount*.tsx`)                                                                                                                                        |
| `./utils/compose`, `./utils/when` | Render helpers                                                                                                                                                                                                                                  |

## Icons

See [`src/icons/README.md`](./src/icons/README.md). Regenerate the sprite with `pnpm nx run ui-kit:generate-svg-sprite`.
