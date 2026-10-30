---
title: 'Settings Policy'
description: 'How Tau designs, words, organizes and co-locates settings: one registry entry and one row per setting, short user-facing copy, detail in tooltips, and a fixed section taxonomy.'
status: active
created: '2026-10-29'
updated: '2026-10-30'
related:
  - docs/policy/ux-policy.md
  - docs/policy/ui-policy.md
  - docs/policy/design-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/agent-observability-policy.md
---

# Settings Policy

Internal reference for the settings dialog in `apps/ui`: where a setting lives, how it is laid out, and how it is worded.

## Rationale

Settings grew one card at a time, each with its own layout and a paragraph explaining its implementation, release plan or legal edge cases. Users could not scan a page, could not tell which control did what, and found related choices (privacy, training, analytics, account closure) spread across unrelated pages. These rules make every settings page read the same way: one short line per setting, the control on the right, detail one glyph away, and each topic in exactly one place.

## Rules

### 1. One Registry Entry, One Row

Every setting has one entry in `settingsCatalog` (`apps/ui/app/components/settings/settings-registry.ts`) and renders as one `SettingsRow` with that `settingId`. The row title and the registry `label` are the same string; the row description and the registry `description` say the same thing.

**Why**: The registry drives navigation and search; a row without an entry cannot be found, and an entry whose wording drifts from its row sends users to something that looks different.

CORRECT:

```tsx
<SettingsRow
  settingId='pointer-cursors'
  title='Pointer cursors'
  description='Show a hand cursor over buttons and links'
  control={<Switch aria-label='Pointer cursors' checked={value} onCheckedChange={setValue} />}
/>
```

INCORRECT:

```tsx
<label className='flex justify-between'>
  <span className='font-medium'>Use pointer cursors</span>
  <Switch checked={value} onCheckedChange={setValue} />
</label>
```

### 2. Lay Out With `SettingsGroup` and `SettingsRow`

Group related rows in one `SettingsGroup`: an optional sentence-case heading above one bordered card whose rows are divided by hairlines. In each row the title and description sit on the left and the control (switch, select, button) on the right. Do not nest cards, add per-row borders, or invent a bespoke layout for one setting.

| Need                         | Use                                                               |
| ---------------------------- | ----------------------------------------------------------------- |
| On/off choice                | `Switch` with `aria-label` equal to the row title                 |
| One of a few named options   | Select button (`ComboBoxResponsive`), `size='sm'`                 |
| Opens a flow or another page | Outline `Button size='sm'` with a verb: Manage, Change, Connect   |
| Destructive or plan-changing | `variant='destructive' size='sm'`, in its own group at the bottom |
| List of things (repos, keys) | One row per item, the item's action as its control                |
| Status or progress           | Row `children` under the title, `text-xs text-muted-foreground`   |

### 3. Organize By the User's Question, Not By the Code Owner

Put each setting in the section a user would open to answer their question. Each topic lives in exactly one section; link to it from elsewhere rather than repeating it.

| Section       | Answers                               | Holds                                                                                |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| General       | How does Tau look and feel here?      | Theme, accent color, cursors, editor display                                         |
| Account       | Who am I?                             | Name, avatar, email                                                                  |
| Security      | How do I sign in, and who has access? | Password, sign-in methods (incl. GitHub sign-in and its Gist grant), active sessions |
| Repositories  | Which code can Tau read and write?    | GitHub repository connection, repository access, per-repository write permission     |
| Billing       | What do I pay and what do I get?      | Plan, plan limits, credits, automatic reload, cancel plan                            |
| Data controls | What does Tau collect, keep and use?  | Usage and diagnostics, improving the service, cookie preferences, close account      |
| Compute       | Where does work run?                  | Compute reuse, remote hosts                                                          |
| Models        | Which models can I use?               | Model availability                                                                   |
| Agents        | How does the agent behave?            | Context the agent receives, tools, permissions, chat display                         |
| Filesystem    | Where are my projects stored?         | Workspaces, cloud project location, browser storage                                  |
| Experimental  | What can I try early?                 | Feature flags only                                                                   |

**Why**: Users look for "my data" in one place. Splitting telemetry into General, training into a privacy card and account closure into Billing made each one hard to find.

### 4. Write Short, User-Facing Copy

- Titles: sentence case, at most five words, a noun phrase or a verb phrase ("Code inlay hints", "Cancel plan").
- Descriptions: one sentence, at most about 80 characters, saying what the setting does for the user. No trailing period on a one-sentence description.
- Say what the user gets, not how it is built.

CORRECT: `Share usage and diagnostics` — `Send anonymous data about how Tau runs, such as speed and errors`

INCORRECT: `Sends counts about how Tau runs on this device: which kernels run, how long operations take, how often they fail, memory, parameter counts and export formats, plus how the agent is used. Never prompts, code…` (ten more sentences)

### 5. Put Detail Behind an Info Glyph

When a setting needs more than one sentence (what exactly is collected, what is never collected, what it does not cover), pass it as `info` to `SettingsRow` (or use `SettingsInfo` next to a group heading). Each tooltip paragraph is one short sentence. Legal or policy pages are linked inline with "Learn more", never pasted.

**Why**: The page stays scannable, and the people who want the detail are one hover or focus away from it. `SettingsInfo` is a focusable button, so keyboard and touch users reach it too.

### 6. Never Show Internal Meta

Do not show release plans ("until the next telemetry release"), ticket or PR references, internal component names, test or e2e vocabulary, or mechanics the user cannot act on. If the current behaviour has a user-relevant limit, state the limit plainly and without dates or release names.

CORRECT: `For now, kernel operation timings, project sync outcomes and agent usage may still be sent while this is off.`

INCORRECT: `Until the next telemetry release, three things are still sent whatever this switch says… That release brings all three under this switch.`

### 7. Every Control Does Something Visible

A button either navigates, opens a dialog, changes a value, or shows a result. Remove a control whose effect the user cannot see. While a value loads or cannot be loaded, keep the row and its control visible but disabled, with a one-line reason; do not replace a group with an error box.

**Why**: A page that shows only "Unable to load" hides what the setting is, and a button that appears to do nothing reads as broken.

### 8. Destructive and Plan-Changing Actions

- Place them last, in their own `SettingsGroup`, with the destructive button variant.
- Say the consequence truthfully in the description: "If you cancel, you'll keep full access to your plan features until the end of your billing period."
- Confirm irreversible actions in an `AlertDialog` that names the consequence and offers the gentler alternative (for example, cancel the plan instead of closing the account).
- Payment-provider changes go through the provider's hosted flow (for plan cancellation, the billing portal's `subscription_cancel` flow), never a home-made form.

### 9. Hide What Does Not Apply

Filter unavailable settings out of the registry by build or platform (`tauCloudEnabled`, `isDesktopTarget()`, feature flags) so they disappear from both navigation and search. Use a disabled control with a reason only when the setting exists for this user but cannot change now (for example, a permission whose notice is not yet approved).

### 10. Ask for Consent Once, Where It Applies

Data controls hold one switch per question a user would ask ("may Tau use my chats to improve the service?"), not one per internal processing purpose. When one switch covers several server purposes, it records an explicit decision for each of them in one request. A consent that only makes sense in context is asked in that context instead: rating a reply grants feedback for ratings, and a support report asks for its own diagnosis access.

**Why**: Users cannot weigh six overlapping recording purposes, and overlapping switches ("Improve the service" next to "Model training") read as the same choice asked twice.

### 11. Accessible By Construction

Give every control an accessible name equal to the row title. Status text that changes after an action uses `role='status'`; errors use `role='alert'`. Tests query by role and name, so renaming a title is a test change, not a selector hunt.

## Anti-Patterns

- A paragraph of explanation above a group ("These permissions are separate from each other…"). Put it in the group's `SettingsInfo`.
- Title Case Setting Names ("Show Credits", "Accent Color").
- Loud bordered or tinted cards for a single destructive action.
- The same choice in two sections, or a card that only links to another section's card.
- A setting rendered without a registry entry, or a registry entry without a rendered row.

## Summary Checklist

- [ ] Registry entry exists, in the section rule 3 assigns, with label and description matching the row
- [ ] Rendered with `SettingsGroup` / `SettingsRow`; control on the right
- [ ] Title sentence case, ≤ 5 words; description one sentence, no trailing period
- [ ] Longer detail in `info`; legal text linked, not pasted
- [ ] No release, ticket, internal or test vocabulary
- [ ] Loading and error states keep the control visible and disabled with a reason
- [ ] Destructive actions last, confirmed when irreversible, consequence stated truthfully
- [ ] Unavailable settings filtered in the registry, not rendered dead

## References

- Primitives: `apps/ui/app/components/settings/settings-item.tsx`
- Registry: `apps/ui/app/components/settings/settings-registry.ts`
- Related: `docs/policy/ux-policy.md`, `docs/policy/ui-policy.md`, `docs/policy/accessibility-policy.md`, `docs/policy/agent-observability-policy.md`
