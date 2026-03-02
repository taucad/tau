# Keyboard Service Policy

Internal reference for the unified keyboard service (`apps/ui/app/hooks/use-keyboard.tsx`).

## `event.key` vs `event.code`

We use **`event.key`** (character-based, layout-aware) for all shortcut matching. `event.code` (physical key position) is not used.

**Rationale**: All shortcuts are character-based (e.g., Ctrl+C means "the character C"), not positional. `event.key` is correct for text-editor-style shortcuts and works across keyboard layouts. `event.code` is appropriate for gaming/spatial inputs only.

Matching is case-insensitive (`event.key.toLowerCase()`).

## Mod Abstraction (Cross-Platform)

Mirrors VS Code's `CtrlCmd` / `WinCtrl` two-modifier model.

### Resolution Table

```
                macOS           Windows/Linux
modKey     →    Cmd (meta)      Ctrl
ctrlKey    →    Ctrl            Ctrl
metaKey    →    Cmd (meta)      Meta/Win (unusable)
```

### Usage Rules

- **All new "primary modifier" shortcuts must use `modKey: true`**. This ensures they work on both macOS (Cmd) and Windows/Linux (Ctrl).
- **Direct `metaKey: true` is prohibited** in keybinding definitions. It maps to the unusable Meta/Win key on Windows/Linux.
- **`ctrlKey: true` is for literal Ctrl**. Use when you specifically want the physical Ctrl key on all platforms (e.g., panel toggles on macOS where Ctrl is a "free" modifier).

### `ctrlKey` Conflict Limitation (Known Issue)

The 11 `ctrlKey` panel toggles (Ctrl+C, Ctrl+A, Ctrl+X, Ctrl+F, Ctrl+N, Ctrl+D, Ctrl+G, Ctrl+E, Ctrl+L, Ctrl+I, Ctrl+Shift+C) conflict with system/browser shortcuts on Windows/Linux. These were designed for macOS where Ctrl is a secondary modifier that doesn't conflict with system shortcuts (Cmd handles those).

**Follow-up**: Audit and reassign these keybindings for cross-platform safety. Options:
- Ctrl+Shift+key (avoids bare Ctrl conflicts)
- Alt+key (free on Windows/Linux)
- Chord sequences (e.g., Ctrl+K, Ctrl+N -- VS Code web pattern)

## Scope Model

Two scopes:

- **`'global'`** -- fires regardless of focus context. Use for shortcuts that should work inside dialogs (e.g., Escape, Mod+,).
- **`'app'`** (default) -- suppressed when focus is inside a scoped container.

### Scoped Containers

Detected via `event.target.closest()`:

- `[role="dialog"]` -- Radix Dialog, AlertDialog, Sheet
- `[role="alertdialog"]` -- Radix AlertDialog
- `[data-slot="command-dialog"]` -- Command palette

## Consume / Priority Rules

- **`consume: true`** (default) -- after a handler fires, no lower-priority handlers for the same combo execute. Correct for most shortcuts (e.g., only one handler should respond to Mod+S).
- **`consume: false`** -- handler fires but does not block lower-priority handlers. Use for observer-style registrations.
- **Priority**: Higher `priority` value fires first. Same-priority registrations fire in registration order (deterministic).

## Editable Target Definition

An element is considered "editable" (and suppresses shortcuts with `ignoreInputs: false` default) if:

- `tagName` is `INPUT` (except `type="button"`, `type="submit"`, `type="reset"`, `type="checkbox"`, `type="radio"`)
- `tagName` is `TEXTAREA`
- `tagName` is `SELECT`
- `element.isContentEditable === true`
- `element.closest('[role="textbox"]')` is truthy

Shortcuts with `ignoreInputs: true` fire even in editable targets.

## Registration Contract

- One `useKeybinding()` call = one registration
- Cleanup on component unmount (via `useEffect` cleanup)
- Callback is stored via ref (no stale closures, no effect re-runs on callback change)
- Effect-based lifecycle, StrictMode-safe (double-mount produces correct single registration)

## IME Policy

All shortcut matching is skipped when `event.isComposing === true`. This prevents shortcuts from firing during CJK and other composition input.

## Modifier Reset Policy

All modifier state (shift, ctrl, alt, meta) resets to `false` on:

- `window.blur` -- user switches apps/tabs
- `document.visibilitychange` (when hidden) -- tab becomes hidden

Modifiers are synced from `pointerdown` events to catch drift from missed keyboard events (e.g., modifier pressed while focus was in an iframe).
