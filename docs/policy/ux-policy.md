---
title: 'UX Policy'
description: 'Interaction design rules: inline editing, progressive disclosure, confirmation patterns, keyboard conventions and user-side copy for all Tau UI surfaces.'
status: active
created: '2026-04-08'
updated: '2026-11-13'
related:
  - docs/policy/ui-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/react-policy.md
  - docs/research/dialog-inline-editing-audit.md
  - docs/research/billing-redesign-blueprint.md
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

Follow [docs/policy/design-policy.md — People and progressive disclosure](../../docs/policy/design-policy.md#people-and-progressive-disclosure)
and [Composition and visible affordances](../../docs/policy/design-policy.md#composition-and-visible-affordances).
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

### 7. Choose, Act or Disclose; Nest With the View Stack

Pick the surface by what the list does, then nest the same way everywhere:

| The list lets the person…                    | Surface                                 | Nesting                                                                                          |
| -------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Choose a value (kernel, model, file, format) | `ComboBoxResponsive`                    | A group or row opens a sub-view in the same popover or drawer; search stays global across levels |
| Perform an action (export, rename, settings) | Responsive `DropdownMenu`               | A submenu opens a sub-view in the same menu                                                      |
| See facts or a few controls beside actions   | Disclosure row (`menu-disclosure-item`) | Expands in place; never replaces the list                                                        |
| Act on a target by right-click               | `ContextMenu`                           | Flyout submenus are allowed (pointer convention)                                                 |

Both sub-view surfaces compose the shared responsive view stack in `packages/ui`: a full-width Back row that reads "Back" and is named `Back to <parent>` for assistive technology, the view itself named by its group (and by a heading where its rows do not say what it is), Escape and Backspace-on-empty step back, focus returns to the row that opened the view, and the same views render on pointer and touch. The Left arrow is never bound to Back, because slider rows use it.

Never open a second popover from a menu or picker, stack a drawer from a menu, or use a hover flyout outside right-click menus. A `ComboBoxResponsive` opened from a pane control (no parent list) may still stack its drawer on a phone (`isNested`).

**Why**: One nesting behaviour keeps focus in one scope, works identically on desktop and phone, and spares people from learning a different pattern in each menu.

### 8. No Nested Dialogs

Never nest a `Dialog` inside another `Dialog`. If a settings dialog needs a delete confirmation, either:

- Use an inline danger zone with a single "Delete" button that shows an undo toast, or
- Close the parent dialog first, then open the AlertDialog

**Why**: Nested dialogs create z-index issues, confuse focus trapping, and disorient users with stacked overlays.

### 9. Use the InlineTextEditor Primitive

The `InlineTextEditor` component (`#components/inline-text-editor.js`) is the canonical implementation of inline editing. Use it for all label-to-input editing instead of building ad-hoc `isEditing` state.

Features: display/edit toggle, Enter/Escape/blur handling, auto-focus, auto-select, optional `renderDisplay`, `shouldSubmitOnBlur`, `variant`.

### 9. Write Copy From the User's Side

Say what happened to the person and what they can do next, in the plainest words that are true. Name things by what the person sees and does, never by how the system stores or moves them.

| Do not write (system side)                         | Write (user side)                           |
| -------------------------------------------------- | ------------------------------------------- |
| "Payment status: processing"                       | "We're confirming your payment"             |
| "Quote expired", "Refresh quote"                   | "This price is out of date", "Update price" |
| "Checkout session", "payment intent", "binding"    | "payment page", "payment", nothing at all   |
| "Issuance pending"                                 | "Adding 500 credits to your balance…"       |
| "Top up", "top-up" in the app                      | "Add credits"                               |
| "Entitlement", "tier", "ledger", "hold"            | "plan", "plan", "balance", "reserved"       |
| A wire state printed as text (`closing`, `failed`) | A sentence written for that state           |

Every state of a multi-step flow has its own title and one- or two-sentence description. Never print a state name, an identifier, an error code or a raw server message where a person reads it.

**Why**: the billing review found about 200 strings written from the server's point of view; people could not tell whether they had been charged. See `docs/research/billing-redesign-blueprint.md`.

**Enforced by**: `tau-lint/no-engineering-vocabulary-in-copy` for the vocabulary it lists; the rest is review.

### 10. Name the Button After What It Does

A button's label is the action and its object: "Pay $27.50", "Add credits", "Turn on auto-reload", "Continue to payment", "Delete account". The step back is "Back"; leaving without doing anything is "Cancel"; leaving a finished or waiting screen is "Close".

| Situation                        | Label                             | Never                         |
| -------------------------------- | --------------------------------- | ----------------------------- |
| Commits money                    | "Pay $27.50" (the exact amount)   | "Confirm", "Submit", "OK"     |
| Goes to another site to pay      | "Continue to payment"             | "Checkout", "Proceed"         |
| Repeats a failed action          | "Try again"                       | "Retry", "Reload"             |
| Returns to the previous step     | "Back"                            | "Cancel" (when nothing ends)  |
| Abandons something in progress   | "Cancel purchase", "Cancel setup" | A bare "Cancel" that is vague |
| Current choice in a set of plans | A label, "Your current plan"      | A disabled button             |

**Why**: "Confirm" and "Cancel" on a payment screen do not say whether money moves; a label that names the outcome needs no surrounding explanation.

### 11. Report a Problem as "Couldn't …" Then the Next Step

Write an error as what did not happen, in the past tense with a contraction, then one thing to do: "Couldn't load your balance. Try again." State what is safe when money or data is involved ("Your card wasn't charged", "Your credits are safe") only when the system knows it to be true. Offer "Try again" as the button; give the support address when trying again cannot help.

CORRECT:

```tsx
<BillingInlineError>Couldn’t open the payment page. Try again.</BillingInlineError>
```

INCORRECT:

```tsx
<p className='text-destructive'>Error: checkout session creation failed (409)</p>
<p>Unable to process request. Please retry later.</p>
```

**Why**: an error is read at the worst moment; a fixed shape lets people find the next step without parsing the sentence.

### 12. Print Money and Spelling One Way

Print US dollars as `$10.00` for an amount that is or will be charged and `$20` for a list price or an amount choice. Name the currency once per screen, on the total (`$27.50 USD`) or in a field label ("Amount (USD)"); never as a `US$` prefix. Use the shared formatters in `@taucad/billing` (`formatUsdMinor`, `formatUsdTotalMinor`, `formatUsdWholeMinor`, `formatMonthlyPrice`); do not format money inline. Product copy uses US spelling ("authorize", "canceled", "center").

**Why**: four formats (`US$10`, `$10.00 USD`, `10 USD`, `$10`) appeared on one screen, and two spellings of "cancelled" in one flow. Legal documents keep their own governed wording.

## Anti-Patterns

- Opening a `Dialog` for a single-field rename or create
- Nesting `Dialog` inside `Dialog` (e.g., delete confirm inside settings)
- Building custom `isEditing` + `Input` state when `InlineTextEditor` exists
- Using `setTimeout` to focus an input inside a Dialog (symptom of fighting the modal lifecycle)
- Important actions discoverable only on hover, with no visible alternate route
- Plain `<Select>` for unbounded or searchable lists
- A state name, identifier or server message shown as copy ("Payment status: funds_received")
- "Confirm", "Submit" or "OK" on a button that moves money or deletes something
- "Failed to …", "Unable to …", "An error occurred" in place of "Couldn't … Try again."
- `US$` prefixes, or a money amount formatted outside the shared formatters
- A second popover, a menu-stacked drawer, or a hover flyout to nest a list (outside right-click menus)
- A searchable listbox standing in for an action menu, or a menu standing in for a value picker

## Summary Checklist

- [ ] Single-field edits use `InlineTextEditor` or popover form, not Dialog
- [ ] Menu-triggered edits use Popover, not Dialog
- [ ] Inline inputs support Enter, Escape, blur, auto-focus, auto-select
- [ ] Destructive actions use AlertDialog (irrecoverable) or undo toast (recoverable)
- [ ] No nested Dialogs
- [ ] Dense list actions follow DESIGN's visible-action and disclosure contracts
- [ ] Searchable/dynamic lists use ComboBoxResponsive
- [ ] Copy says what happened to the person and what to do next; no system vocabulary or state names
- [ ] Each button names its action and object; money buttons carry the exact amount
- [ ] Errors read "Couldn't … Try again." and claim safety only when it is known
- [ ] Money goes through the shared formatters; the currency is named once per screen; US spelling
- [ ] Choosing uses ComboBoxResponsive, acting uses DropdownMenu, and nesting in either uses the view-stack sub-view
- [ ] New interaction patterns reviewed against this policy

## References

- [UI Policy](ui-policy.md) — Visual design tokens, typography, spacing, motion
- [Accessibility Policy](accessibility-policy.md) — ARIA conventions, focus management
- [React Policy](react-policy.md) — Component patterns, state management
- Research: `docs/research/dialog-inline-editing-audit.md`
- Research: `docs/research/billing-redesign-blueprint.md` — the copy glossary these rules come from
