# @taucad/ui

[![npm version](https://img.shields.io/npm/v/@taucad/ui.svg)](https://www.npmjs.com/package/@taucad/ui)
[![license](https://img.shields.io/npm/l/@taucad/ui.svg)](./LICENSE)

Accessible shadcn-style React primitives, shared surface variants, and the semantic token stylesheet behind Tau's interfaces.

## Why this package?

Tau ships several front ends — the CAD application, the documentation site, and the tools around them. They have to look like one product, so the components and the tokens that style them live here rather than being copied per app. Every primitive is built on Radix, carries the accessibility behaviour the [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) describe for its pattern, and is checked against WCAG 2.2 AA in CI.

The stylesheet is the other half. Colours are OKLCH tokens keyed to a mode-responsive lightness scale, so the same component reads correctly in light, dark, black, and high-contrast themes without per-theme overrides.

## Installation

```bash
npm install @taucad/ui
```

```bash
pnpm add @taucad/ui
```

```bash
yarn add @taucad/ui
```

`react` and `react-dom` are peer dependencies — version 19 or newer. Install them alongside this package if your project does not already have them.

## Quick start

Tailwind CSS v4 is required. Import the tokens, then point Tailwind at the package so it generates the utilities the components use:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@taucad/ui/styles/tokens.css';

/* Tailwind v4 skips node_modules during content detection. */
@source '../node_modules/@taucad/ui/dist';
```

```tsx
import { Button } from '@taucad/ui/components/button';

export const SaveButton = () => <Button>Save model</Button>;
```

Import `tw-animate-css` if you use any overlay component (`Dialog`, `Sheet`, `DropdownMenu`, `ContextMenu`, `Popover`, `Tooltip`) — their enter and exit transitions come from it.

Every component has its own subpath so bundlers drop what you do not use. The root export re-exports the same modules for convenience.

## Feature-API map

| Area       | Subpath                                 | What you get                                                                                |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Components | `@taucad/ui/components/<name>`          | One Radix-backed primitive per module — `button`, `dialog`, `sidebar`, `table`, and 40 more |
| Variants   | `@taucad/ui/components/<name>.variants` | The `cva` definitions behind a component, for building matching surfaces                    |
| Hooks      | `@taucad/ui/hooks/use-mobile`           | Viewport helper used by the responsive layouts                                              |
| Utilities  | `@taucad/ui/utils/cn`                   | `clsx` + `tailwind-merge` class composer                                                    |
| Tokens     | `@taucad/ui/styles/tokens.css`          | Colour, radius, shadow, and typography tokens for all four themes                           |

### Theming

Tokens are defined for four themes: the `:root` default (light), `.dark`, `.black`, and `.high-contrast`. Set the class on a wrapping element — usually `<html>` — to switch. The `dark:` Tailwind variant is redefined by this stylesheet to follow the `.dark` class rather than the OS setting, so class-based theming and utilities agree.

The stylesheet resets Tailwind's default colour and shadow palettes (`--color-*: initial`, `--shadow-*: initial`) so that only Tau's semantic tokens remain. If your application also uses Tailwind's stock palette (`bg-red-500`, `text-gray-600`), re-register those colours after the import.

## Environment matrix

| Environment  | Supported               | Notes                                                                                     |
| ------------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| React        | 19+                     | Peer dependency; uses the React 19 `ref`-as-prop form                                     |
| Tailwind CSS | 4.x                     | Required — the components emit Tailwind utility classes                                   |
| Browsers     | Baseline 2024+          | Tokens use OKLCH; radius uses `corner-shape` where supported, degrading to plain rounding |
| Node (SSR)   | 22+                     | Components render on the server; `use-mobile` gates on the client                         |
| Bundlers     | Vite, webpack, Rolldown | ESM only, one module per subpath                                                          |

## Versioning and stability

Semantic versioning. The package is pre-1.0: minor versions may change component APIs, and the token names are still settling. Pin an exact version if you need stability. Both the development and published export maps are pinned by a surface test, so a subpath cannot silently disappear between releases.

## Security and provenance

Published from the [taucad/tau](https://github.com/taucad/tau) repository with npm provenance attestation. The package contains no network code, no telemetry, and no runtime dependencies beyond React and the Radix primitives it re-exports.

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Links

- [Documentation](https://docs.tau.new)
- [Design system guide](https://github.com/taucad/tau/blob/main/DESIGN.md)
- [Source](https://github.com/taucad/tau/tree/main/packages/ui)
- [Issues](https://github.com/taucad/tau/issues)
