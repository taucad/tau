---
taucad-ui: minor
---

The primitives Tau's CAD viewer draws with are now part of `@taucad/ui`, so the viewer can be composed outside the Tau app.

- **Controls**: `slider-input`, `search-input`, `copy-button`, `string-color-picker`, `combobox-responsive`, `menu-slider-item`, `menu-disclosure-item`, `info-tooltip`, `modified-indicator`, `key-shortcut`, `inline-code`, `loader`, `panel-empty-state`, `highlight-text` and `client-only`.
- **Panes**: `pane-virtual-list` with its `pane-spacing.variants`, and `actions` (the action button, details toggle and actions row with `disclosureMotion`).
- **Keyboard**: `components/keyboard` (`KeyboardProvider`, `useKeybinding`, `useModifiers`), `utils/keys` and `utils/platform`.
- **Helpers**: `hooks/use-tick-animation` and `utils/pointer-capture`.
- **Formatting**: `utils/label` (`toTitleCase`, `formatDisplayLabel`) and `utils/number` (`clamp`).
