---
title: 'UX Policy'
description: 'Interaction design rules: inline editing, progressive disclosure, confirmation patterns, and keyboard conventions for all Tau UI surfaces.'
status: active
created: '2026-04-08'
updated: '2026-09-16'
related:
  - docs/policy/ui-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/react-policy.md
  - docs/research/dialog-inline-editing-audit.md
---

# UX Policy

Internal reference for interaction design decisions across all Tau UI surfaces. Companion to the visual [UI Policy](ui-policy.md) — this policy governs _how_ users interact with elements, not how they look.

## Rationale

Tau is a spatial, dense application where users frequently switch between CAD viewport, code editor, parameters, chat, and file tree. Modal dialogs break spatial context, force task-switching, and obstruct the viewport. Every unnecessary dialog is friction. This policy establishes interaction patterns that keep users in flow by favoring inline, in-context editing over modal interruptions.

## Rules

### 1. Inline Editing Over Dialogs

Use inline editing for single-field mutations (rename, create, save-as). Never open a modal dialog for a task that edits one text value.

**Why**: Dialogs force a context switch — the user loses sight of the element they are editing, must dismiss the dialog to return, and the animation/focus dance adds 300-500ms of dead time. Inline editing keeps the edit target visible and commits on blur/Enter.

**Decision table**:

| Task complexity                                  | Pattern                                             | Example                                        |
| ------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| Single text field (rename, create, save-as)      | Inline input replacing label, or popover with input | File rename, parameter set rename, chat rename |
| Two related fields (name + description)          | Popover form or expandable inline section           | Project settings (name + description)          |
| Three+ fields, or fields with complex validation | Settings panel or dedicated route                   | User profile, model provider config            |
| Destructive confirmation (delete)                | Inline confirmation strip or AlertDialog            | See Rule 4                                     |

CORRECT:

```tsx
// Inline rename: label becomes input on interaction
<InlineTextEditor value={name} onSave={handleRename} variant='ghost' />
```

INCORRECT:

```tsx
// Modal dialog for single-field rename
<Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
  <DialogContent>
    <DialogTitle>Rename</DialogTitle>
    <Input value={name} onChange={...} />
    <DialogFooter>
      <Button onClick={save}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 2. Popover for Menu-Triggered Edits

When an edit is triggered from a dropdown menu or context menu (not from clicking the label itself), use a Popover anchored to the trigger — not a Dialog.

**Why**: Popovers maintain spatial proximity to the trigger, dismiss on outside click (no explicit close needed), and don't obscure the full viewport. They are the right weight for "I clicked a menu item and now I need to type one thing."

CORRECT:

```tsx
// Popover rename triggered from dropdown menu
<Popover open={isRenaming} onOpenChange={setIsRenaming}>
  <PopoverContent align="end" className="w-64 p-1">
    <form className="flex items-center gap-2" onSubmit={handleRename}>
      <Input autoFocus value={name} onChange={...} />
      <Button type="submit" size="sm">Save</Button>
    </form>
  </PopoverContent>
</Popover>
```

INCORRECT:

```tsx
// Dialog for menu-triggered rename
<Dialog open={isRenaming}>
  <DialogContent>
    <Input />
    <Button>Save</Button>
  </DialogContent>
</Dialog>
```

### 3. Keyboard Conventions for Inline Edits

All inline edit inputs must support:

- **Enter**: commit/save
- **Escape**: cancel and restore previous value
- **Blur**: commit by default (configurable via `shouldSubmitOnBlur`)
- **Auto-focus**: input receives focus immediately on mount
- **Auto-select**: text is selected on focus so typing replaces

**Why**: These conventions match every native OS rename interaction (Finder, Explorer, VS Code). Users expect them without instruction.

### 4. Destructive Confirmation Pattern

Use `AlertDialog` for irreversible destructive actions (delete project, bulk delete). Do not use plain `Dialog` for confirmations — `AlertDialog` has correct ARIA semantics (`role="alertdialog"`) and traps focus.

For low-stakes deletions in dense lists (e.g., deleting a parameter set where "default" still exists), prefer an inline undo toast pattern over a blocking confirmation:

| Destruction scope         | Pattern                        | Example                           |
| ------------------------- | ------------------------------ | --------------------------------- |
| Single recoverable item   | Optimistic delete + undo toast | Delete parameter set, remove chat |
| Single irrecoverable item | AlertDialog                    | Delete file from filesystem       |
| Bulk items                | AlertDialog with item list     | Bulk delete projects              |

### 5. Progressive Disclosure in Dense Panels

Follow [DESIGN.md — People and progressive disclosure](../../DESIGN.md#people-and-progressive-disclosure)
and [Composition and visible affordances](../../DESIGN.md#composition-and-visible-affordances).
Primary contextual actions remain visible; infrequent row actions may use a
persistently reachable named overflow menu. Hover shortcuts require an equivalent
visible route plus keyboard and coarse-pointer access.

**Why**: Folding detail reduces noise only when users can still discover actions
and understand current work, consequences and recovery.

### 6. ComboBoxResponsive for Searchable Selection

When selecting from a list of 3+ items that may grow unbounded (chats, parameter sets, models), use `ComboBoxResponsive` — not a plain `<Select>`. It provides search, keyboard navigation, mobile drawer adaptation, and grouped items.

For lists of 2-3 static options, a plain `<Select>` is acceptable.

| List size     | Growth potential | Pattern                                  |
| ------------- | ---------------- | ---------------------------------------- |
| 2-3 static    | None             | `<Select>`                               |
| 3+ or dynamic | May grow         | `ComboBoxResponsive`                     |
| Large (100+)  | Unbounded        | `ComboBoxResponsive` with virtualization |

### 7. No Nested Dialogs

Never nest a `Dialog` inside another `Dialog`. If a settings dialog needs a delete confirmation, either:

- Use an inline danger zone with a single "Delete" button that shows an undo toast, or
- Close the parent dialog first, then open the AlertDialog

**Why**: Nested dialogs create z-index issues, confuse focus trapping, and disorient users with stacked overlays.

### 8. Use the InlineTextEditor Primitive

The `InlineTextEditor` component (`#components/inline-text-editor.js`) is the canonical implementation of inline editing. Use it for all label-to-input editing instead of building ad-hoc `isEditing` state.

Features: display/edit toggle, Enter/Escape/blur handling, auto-focus, auto-select, optional `renderDisplay`, `shouldSubmitOnBlur`, `variant`.

## Anti-Patterns

- Opening a `Dialog` for a single-field rename or create
- Nesting `Dialog` inside `Dialog` (e.g., delete confirm inside settings)
- Building custom `isEditing` + `Input` state when `InlineTextEditor` exists
- Using `setTimeout` to focus an input inside a Dialog (symptom of fighting the modal lifecycle)
- Important actions discoverable only on hover, with no visible alternate route
- Plain `<Select>` for unbounded or searchable lists

## Summary Checklist

- [ ] Single-field edits use `InlineTextEditor` or popover form, not Dialog
- [ ] Menu-triggered edits use Popover, not Dialog
- [ ] Inline inputs support Enter, Escape, blur, auto-focus, auto-select
- [ ] Destructive actions use AlertDialog (irrecoverable) or undo toast (recoverable)
- [ ] No nested Dialogs
- [ ] Dense list actions follow DESIGN's visible-action and disclosure contracts
- [ ] Searchable/dynamic lists use ComboBoxResponsive
- [ ] New interaction patterns reviewed against this policy

## References

- [UI Policy](ui-policy.md) — Visual design tokens, typography, spacing, motion
- [Accessibility Policy](accessibility-policy.md) — ARIA conventions, focus management
- [React Policy](react-policy.md) — Component patterns, state management
- Research: `docs/research/dialog-inline-editing-audit.md`
