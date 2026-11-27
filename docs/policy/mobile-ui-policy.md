---
title: 'Mobile UI Policy'
description: 'Touch targets, drawn sizes, radius, surface styles, drawer and header geometry, trigger open state, shortcut hints and responsive rules for phone-width Tau UI, with the sidebar and no-desktop-regression rules.'
status: active
created: '2026-11-27'
updated: '2026-11-27'
related:
  - docs/policy/design-policy.md
  - docs/policy/ui-policy.md
  - docs/policy/ux-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/page-composition-policy.md
  - docs/policy/color-policy.md
  - docs/research/mobile-surface-redesign.md
  - docs/research/mobile-experience-audit.md
---

# Mobile UI Policy

Internal reference for touch targets, control sizes, shapes and surface styles on phone-width Tau UI, and for the open-trigger, shortcut-hint and sidebar rules that also hold on desktop.

## Rationale

On a phone, 97% of Tau's Buttons drew under 44 px and almost none enlarged its hit area. Controls came in 15 heights, one radius token painted three shapes, 44% of Buttons were outlined whatever surface they sat on, and 21 of 34 desktop overlay triggers lost their state while open. Claude's apps, the chosen reference, use a short size ladder, one shape language and a fill decided by the surface. This policy encodes that reference in Tau's tokens with one owner per concern, so that a phone surface reads as one system and desktop does not move.

Evidence, measurements and the decision behind each number are in [Mobile Surface and Button Redesign](../research/mobile-surface-redesign.md) (findings F1–F24, decisions D1–D16) and are not repeated here. [DESIGN](design-policy.md) governs; where this policy disagrees with it, DESIGN wins and the disagreement is a bug here. DESIGN's composer sentence states the split this policy implements: ghost under a fine pointer, filled and outline-free under a coarse one, with drawn size and shape following the viewport (Rule 10).

## Terms

| Term           | Meaning                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phone width    | A viewport under Tailwind's `md` (768 px): the `max-md:` variant                                                                                                                     |
| Coarse pointer | `@media (pointer: coarse)`: the `pointer-coarse:` variant                                                                                                                            |
| Drawn size     | The element's own border box: what is painted                                                                                                                                        |
| Hit area       | The region that accepts a tap: the drawn box plus the `touch-target` pseudo-element                                                                                                  |
| Reach          | The most a hit area may grow on each side. A bar's gap utility sets it to half the gap; a control that stands alone declares the free room around it (Rule 1)                        |
| Stand-in fill  | The resting `bg-muted` fill, with no outline, that marks a control's edge where hover cannot; it keeps a border in the Black and High contrast themes and in forced colours (Rule 4) |
| Open ring      | The 1.5 px inset ring that marks a trigger whose surface is open (Rule 8)                                                                                                            |
| Chrome         | The controls that frame a page, a sidebar, a drawer or a dialog: its header, its view-control row, its bottom bar and its footer                                                     |
| Drawer         | A bottom `Drawer` (`packages/ui/src/components/drawer.tsx`), Claude's "sheet". A `Sheet` is Tau's side panel                                                                         |

## Adoption

New and touched code follows this policy from the day it merges. Existing surfaces migrate in the order the program's blueprint sets; until a surface migrates it is non-conforming, not exempt. The names fixed here are the contract (`--touch-target`, `touch-target`, `touch-gap-*`, `touch-reach-*`, `touch-target-none`, `shape-round`, `trigger-open`, `has-trigger-open`, `--trigger-open-ring`, `--control-edge`, `--drawer-inset`, `--drawer-radius`, `HeaderBar`, `ControlSurface`, and on `Button` the `surface` and `shape` props, the `muted` and `inverse` variants and the `dense` size): an implementation uses them or amends this policy in the same change. A rule whose gate has not landed is "default, unenforced" in DESIGN's sense; [Enforcement](#enforcement) lists each.

## Rules

### 1. Grow the hit area in one place

Under a coarse pointer, every interactive control accepts a tap on 44×44 CSS px, or on as much of that as its neighbours leave free. One mechanism in `packages/ui/src/styles/tokens.css` provides it and changes no layout:

| Name                                                  | What it does                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--touch-target`                                      | The one hit-area number: 44 px                                                                                                                                                                                  |
| `touch-target`                                        | Makes the control a host: an invisible pseudo-element centred on it. `Button` composes it by default                                                                                                            |
| `touch-gap-*`, `touch-gap-y-*`                        | Sets a bar's gap and, from the same number, the reach of the controls in it: half the gap, along the bar. A bar uses it in place of `gap-*`, so a reach larger than half the gap cannot be written              |
| `touch-reach-*`, `touch-reach-x-*`, `touch-reach-y-*` | Declares free room by hand where no gap owns it: across a bar's axis, and around a control that stands alone. The hit area grows by the smaller of what 44 px needs and the reach. **Reach is zero unless set** |
| `touch-target-none`                                   | Releases the pseudo-element on a host that needs its own `::after`                                                                                                                                              |

A bar owns its gap and its reach together: `flex touch-gap-1 max-md:touch-gap-2 md:pointer-coarse:touch-gap-4`. A joined group (`ButtonGroup`, `ToggleGroup`, `TabsList`) sets its inline reach to zero in its own class, so a surrounding bar's reach never enters it. A shared layout part (`HeaderBar`, `DrawerBar`, `DialogFooter`, `InputGroup`) sets its own. Every control system other than `Button` (`PaneButton`, `PaneviewHeaderAction`, `SidebarMenuAction`, `InputGroupButton`, a raw `<button>`) applies the same `touch-target` class.

| Control                                               | Tool                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Icon control                                          | `touch-target` in a bar with `touch-gap-*`, or with its own `touch-reach-*`: up to 44×44, centred on the shape                                                        |
| Text button                                           | The same; a label wider than 44 px grows on the block axis only                                                                                                       |
| Joined segment (`ToggleGroup`, `ButtonGroup`, splits) | The group's inline reach is zero; `touch-reach-y-*` gives 44 high at the drawn width                                                                                  |
| Switch, checkbox, radio, slider thumb                 | Its label or row is the host (`SwitchRow`, a field's label). The control keeps its drawn size at every width                                                          |
| Field                                                 | Its wrapper (`InputGroup`, `SearchInput`) or its label is the host: a bare `<input>` renders no pseudo-element. In a bar of ladder controls it takes the bar's height |
| Full-width row (menu, picker, drawer, navigation)     | `min-h-touch-row`; `--spacing-touch-row` is 44 px, the same number                                                                                                    |

- **Drawn size follows WCAG 2.5.8 as DESIGN states it: at least 24×24, or spaced per the exception.** `Button`'s smallest sizes stay `xs` and `icon-xs` (24 px). A glyph control under 24 px (a switch track, a checkbox, a radio, a slider thumb) keeps its drawn size and meets the criterion by spacing; under a coarse pointer its label or row takes the tap. This rule gives nothing a larger element box from `md` up.
- **Hit areas of neighbouring controls never overlap, and a tap inside a control's drawn box always reaches that control.** `touch-gap-*` holds this along a bar by construction. A bar that wants full 44 px targets sets its gap to at least 44 minus the drawn size (36 → 8, 28 → 16, 24 → 20), and may widen it under a coarse pointer to get there (Rule 10).
- A control may extend its hit area over a larger target that contains it (a card's cover link, its own row), never over a sibling control.
- A host does not clip itself: truncation sits on an inner `span`, not on the control.
- The hit area exists only under a coarse pointer. Under a fine pointer the target is the drawn shape, so hover lights exactly what a click will hit.
- The focus outline stays on the drawn shape: `focus-outline` is inset and the hit area does not move it.
- Never author a second mechanism: no `after:` inset on a component, no fixed "touch size", no `isTouch` or `enableTouchTargets` prop, no hand-written reach beside a gap.

**Why**: seven separate hit-area idioms and five authored "touch sizes" existed, and a rule inside `Button` alone would miss about 85 icon controls and every row; one utility makes 44 a one-line change. Reach defaults to zero because an uncapped 44 px area on a 28 px control 4 px from its neighbour covers the neighbour's drawn box, so a tap on one button activates the next. The gap utility owns the reach because a reach kept equal to half the gap by hand, and inherited into a joined group, let one segment take its neighbour's tap.

CORRECT:

```tsx
<div className='flex touch-gap-1 max-md:touch-gap-2 md:pointer-coarse:touch-gap-4'>
  <Button variant='ghost' size='icon-sm' surface='card' aria-label='Attach' />
  <Button variant='ghost' size='icon-sm' surface='card' aria-label='Dictate' />
</div>
<button type='button' className={cn(paneButtonClass, 'touch-target')} aria-label='Split pane' />
```

INCORRECT:

```tsx
<Button size='icon-sm' className='pointer-coarse:after:absolute pointer-coarse:after:-inset-2' />
<ViewerControls enableTouchTargets={isTouch} />
<div className='flex gap-1 touch-reach-x-2' /> // a reach written beside a gap: hit areas overlap
```

**Check**: at 320, 360, 375 and 390 px wide, at 768×1024 and at 1024×768, all with touch emulation, probe each control with `elementsFromPoint`: the hit box is 44 px on both axes or stops at its reach (within 1 px on a bordered control), no two hit boxes intersect, and a tap anywhere inside a drawn box reaches that control. axe `target-size` passes.

### 2. Draw on the ladder

Choose a control's drawn height from its context. Width follows the label, or equals the height for an icon control. A field in a bar of ladder controls takes the bar's height. Never author another height.

Phone width:

| Drawn height | `surface`         | Context                                                                          | Examples                                                                                                                          |
| ------------ | ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 44           | `chrome`          | Page, sidebar, drawer and dialog chrome; a full-width field                      | Header circles, title pill, grouped pill, drawer header actions, primary page action, a dialog's or a form's actions, form fields |
| 40           | `floating`        | Floating over page content                                                       | Scroll to latest                                                                                                                  |
| 36           | `card`, `toolbar` | On a card, a composer, a toolbar, a settings row, a table toolbar or a pane body | Composer controls, viewer tools, card actions, a pane's buttons, pagination, a centred dialog's close                             |
| 24           | `content`         | Inside content, and nested in a row                                              | Chips, inline actions in recovery, decision and permission cards, a row's own actions                                             |
| 44 (row)     | —                 | Full-width rows, by coarse pointer                                               | Menu, picker, drawer, navigation, file and settings rows                                                                          |

**A container or a control names the surface, and nothing else.** `ControlSurface` names it once for the buttons, fields and segmented groups inside a card, a pane body, a form or a dialog footer; `Button`'s `surface` prop names it for one control and wins. Either applies this height, Rule 3's shape and Rule 4's style. A dialog, a drawer, a sheet and a popover start without a surface, so an opener's surface never leaks into what it opens. `buttonVariants({ surface })` does the same for a raw `<button>`, and `ToggleGroup` and `TabsList` take the prop for a segmented group: a 44 px capsule track on `chrome`, 36 px on `card`, each segment a capsule inside it. A site never writes the height, radius or fill, and `surface` changes nothing from `md` up under a fine pointer. A switch, a checkbox, a radio and a slider thumb are not on the ladder (Rule 1).

**Operator-facing choice (2026-11-27)**: every control takes Claude's size for its context ("the same size as Claude has"), so the composer stays at 36 px, not the 32 px of the earlier working example, and nothing gets smaller: chrome grows to 44 px. The program's blueprint lists the net change per surface.

| Gap at phone width                                              | Value                                    |
| --------------------------------------------------------------- | ---------------------------------------- |
| Chrome control or composer card to the screen edge              | 16                                       |
| Between two separate chrome controls                            | 12                                       |
| Between the slots of a grouped pill (two actions make 96×44)    | 8                                        |
| Between 36 px controls, and from them to the edge of their card | 8                                        |
| Between a row's 24 px actions                                   | 20                                       |
| Any other bar of targets                                        | 44 minus the drawn size, or Rule 1's cap |

**The composer draws 36 px controls 8 px apart**, so their 44 px hit areas tile edge to edge with no dead space and no overlap. This replaces the earlier working example of 32 px controls with 4–6 px gaps: a 36–38 px pitch makes 44 px hit areas overlap by 6–8 px, while 36 + 8 is exactly 44 and is what Claude draws. From `md` up under a coarse pointer its controls keep their 28 px drawn size and sit 16 px apart (28 + 16 = 44): the size follows the viewport and only the gap follows the pointer (Rule 10).

From `md` up, `Button`'s sizes stay as they are, and so do Tau's 4 px gaps under a fine pointer. This policy adds no desktop height: `dense` is a text size at 28 px, a height the ladder already has.

| Drawn height | Context from `md` up                                | `Button` size           |
| ------------ | --------------------------------------------------- | ----------------------- |
| 24           | Chips, actions nested in a row                      | `xs`, `icon-xs`         |
| 28           | Dense chrome: sidebar rows, pane toolbars, composer | `icon-sm`, `dense`      |
| 32           | Page controls and fields                            | `default`, `sm`, `icon` |
| 40           | Large actions                                       | `lg`, `icon-lg`         |

A height the ladder lacks is added to `Button` as a size, never forced through `className` ([Page Composition Policy](page-composition-policy.md) §9).

**Why**: one phone screen mixed up to six heights; Claude's chrome uses 44, 36 and 24, and "the same size as Claude" was the ask.

Where Tau departs from the measured reference, and why:

| Reference                                  | Tau                      | Reason                                                                |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------------- |
| 43 pt sheet and bottom-bar controls        | 44                       | Within measurement error of 44, and DESIGN's sizes are multiples of 4 |
| 40.7 pt floating control                   | 40                       | The nearest step on the 4 px grid                                     |
| 48 pt sidebar bottom bar and selected rows | 44                       | One fewer ladder step; 44 is the touch-row number                     |
| Sheet radius 37 top, 47 bottom             | 44 on all four corners   | CSS cannot read the display's corner; one token (Rule 5)              |
| Sidebar 320 pt wide                        | 288                      | Tau's existing sheet width                                            |
| Warm neutrals                              | Tau's zero-chroma tokens | DESIGN fixes the palette (Rule 4)                                     |

**Check**: at 320, 360, 375 and 390 px wide, every button, field and segmented group that renders has a computed height of 24, 36, 40 or 44. At 1440 px wide every height equals the "before" screenshot; at 1024×768 with touch emulation every control's does, and only rows grow.

### 3. Use one radius language

| Element                                  | Phone width                                                   | From `md` up                             |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Button, and a segmented group's track    | `shape-round`: a circle when square, otherwise a capsule      | The ladder as today (`rounded-md`, `sm`) |
| Field                                    | A ladder rectangle as today                                   | The ladder as today                      |
| Row, and a selected row                  | A ladder rectangle as today, never a capsule                  | The ladder as today                      |
| Container (card, composer, menu, dialog) | The ladder step nearest the control's radius plus the padding | The ladder as today                      |
| Bottom drawer                            | `--drawer-radius` on all four corners (Rule 5)                | Not applicable                           |

Nested corners are concentric: a container's radius is its control's radius plus the padding between them, snapped to the ladder. Never write an arbitrary radius (`rounded-[5px]`).

**One utility owns the round shape.** `shape-round` sets the radius and `corner-shape: round` together. On a `Button` it comes from `surface` at phone width (as `max-md:shape-round`), or from `shape='round'` for a control that is a circle or capsule at every width; never from `className`. Never write a width-prefixed `rounded-full` (`max-md:rounded-full`): the squircle rule in `tokens.css` matches the substring `rounded-full` in the class attribute at every width, so that class changes the control's corners on desktop.

**Why**: `rounded-md` painted a circle at 24–28 px, a near capsule at 32 px and a soft rectangle at 40–44 px, and only a full radius with `corner-shape: round` is certain to paint a true circle in every browser. Desktop keeps its ladder because changing it would restyle every desktop surface and every `@taucad/ui` consumer.

**Check**: at 390 px wide, every button's computed radius is at least half its height. At 1440 px wide under a fine pointer, a control with a `surface` has the same computed radius and `corner-shape` as the same control without it. `rg 'rounded-\['` and `rg ':rounded-full'` find nothing new.

### 4. Let the surface decide the style

A control's fill and edge come from the surface it sits on, in Tau's semantic tokens. Tau keeps its zero-chroma neutrals; Claude's colours are not copied. The table is the look on a phone; the last column names what keys each row (Rule 10).

| Surface                                                     | Control                                                   | Style                                          | Tokens                                                             | Keyed on |
| ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Page, sidebar or drawer chrome; a dialog's or form's footer | Icon control, title pill, grouped pill, an action         | Outlined circle or capsule                     | `bg-background`, 1 px `border-border`, `shadow-xs`, in every theme | Viewport |
| Composer, card, pane body, settings row, table toolbar      | A control on it                                           | The stand-in fill: filled, no outline          | `bg-muted`, no border, no shadow                                   | Pointer  |
| Content                                                     | Chip, inline action                                       | The stand-in fill: filled, no outline          | `bg-muted`, no border                                              | Pointer  |
| Framed toolbar (the viewer's)                               | A tool in it                                              | Plain inside the one frame; active tool filled | The frame as today; `bg-accent` when active                        | Viewport |
| Any                                                         | The primary action of a view, a dialog or a form (Rule 7) | Dark solid                                     | `primary-action`                                                   | Viewport |
| Composer                                                    | Send, Stop                                                | Dark solid                                     | `variant='inverse'` (`bg-foreground`) at every width, as today     | Neither  |
| Card                                                        | Its title, when the title opens or renames the card       | Plain text                                     | No fill; its row is the target                                     | Neither  |
| List: sidebar, menu, drawer, picker                         | Row                                                       | Plain                                          | Transparent, no border                                             | Viewport |
| List, tab bar, segmented control                            | Selected row, active tab or segment                       | Filled, never a bordered box                   | `bg-accent` (`bg-sidebar-accent` in the sidebar), no border        | Viewport |
| Over page content                                           | Floating control                                          | The chrome style, 40 px                        | As chrome                                                          | Viewport |
| Over media or a canvas                                      | Control                                                   | `overlay`, unchanged                           | As today                                                           | Neither  |

- **A viewport row** replaces the control's look at phone width. From `md` up, Page Composition Policy §9 chooses the variant as it does today; at phone width it still chooses the role, and this table chooses the look.
- **A pointer row** is the stand-in fill. It applies under a coarse pointer at every width, because it exists for the lack of hover, not for the lack of room. Under a fine pointer at every width the control keeps §9's variant (ghost on the composer) and fills on hover.
- **Where a fill cannot carry the edge, a border does.** In the Black and High contrast themes, under `prefers-contrast: more` and under `forced-colors: active`, a stand-in-filled control keeps a 1 px border that reaches 3:1 against its surface (`--control-edge`), and a selected tab or segment keeps one too. The `surface` compounds and the segment classes own it; a site never adds it.
- A solid control (`default`, `inverse`, `destructive`) keeps its fill on every surface.
- `variant='muted'` is the same `bg-muted` fill for a control that is filled under either pointer; `variant='inverse'` is the `bg-foreground` solid of composer Send and Stop. Neither replaces `surface`.
- The border, not the shadow, carries a chrome control's edge in every theme; a chrome control never takes the `outline` variant's dark-theme `bg-input/30`.

**Why**: an outline on every surface made it unclear where a button began and ended; a fill one step off its surface marks the edge without hover, which a touch screen does not have at any width. In Black and High contrast that step measures 1.01:1 to 1.06:1, so the fill would vanish in exactly the theme built for low vision. Send stays `bg-foreground` at every width: it matches the reference's solid and keeps the phone and the web the same.

**Check**: at 390 px wide with touch emulation, no button pairs a border with a radius smaller than half its height, and no control on a composer or card surface has a border in the Light and Dark themes (a control over media keeps `overlay`). In Black, High contrast and forced colours each of those controls has a border at 3:1 or more. At 1024×768 with touch emulation those controls are filled at their desktop size; at 600 px wide under a fine pointer they rest in §9's variant. Verify each row of the table in the light, dark, black and high-contrast themes.

### 5. Float the drawer inside the screen

Under `md`, every bottom drawer sits `--drawer-inset` (8 px) from the left, right and bottom edges, adds `env(safe-area-inset-bottom)` below, and rounds all four corners to `--drawer-radius` (44 px). `DrawerContent` owns this geometry; no site sets the inset, the radius or either variable. The viewport meta sets `viewport-fit=cover` so that the safe-area inset is not zero.

**While the on-screen keyboard is open, the bottom inset yields.** The drawer's bottom edge meets the keyboard's top edge, its bottom corners are square, and its side inset and top corners stay.

| Surface                                                                           | Geometry                                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Content-height drawers: pickers, menu drawers, the project sheet, viewer settings | Inset and rounded, as above                                                                                                          |
| Workbench (chat) drawer                                                           | Inset and rounded: 8 px from the sides and 8 px above the tab bar, at every snap point. It stays non-modal and dragged by its handle |
| Search palette at phone width                                                     | A page, not a drawer: it fills the screen and takes Rule 6's page header                                                             |
| Settings at phone width                                                           | A page, not a drawer: it takes Rule 6's page header                                                                                  |
| The sidebar `Sheet`                                                               | Edge-anchored from the inline start (Rule 11)                                                                                        |

**Operator-facing choice (2026-11-27)**: there is no edge-anchored bottom drawer. The operator asked that "our drawer" look like the reference sheet, "that little margin away from the edges and it follows the curvature of the screen", and the drawer in their screenshot is the chat drawer. A drawer's header follows Rule 6 and its rows follow Rule 1.

**Why**: the reference sheet is inset 8 pt and concentric with the display. CSS cannot read a display's corner radius, so the curve is one fixed value: 44 px is within 3 px of the reference's 47 (a 55 pt display corner less the 8 pt inset), and it is the drawer's existing radius.

**Check**: at 390×844, an open picker's box is 374 px wide with 8 px to each side and the bottom, all four computed radii are 44 px, and the 8 px below it shows the page. The workbench drawer measures the same at each snap point, 8 px above the tab bar. With a field focused and the keyboard open, a drawer's bottom edge is the keyboard's top edge.

### 6. Lay out a phone header as start, centre, end

| Slot   | Page header                                                                                                       | Drawer header                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Start  | One chrome circle: the sidebar toggle or Back                                                                     | Close, or Back in a nested view                                                                       |
| Centre | The title, centred on the screen's axis. Plain text, or a 44 px chrome capsule when the title is itself a control | The title (`DrawerTitle`), centred: plain text, or a 44 px chrome capsule when it is itself a control |
| End    | One chrome circle, or one grouped pill for related actions. An unrelated second action is its own circle          | The same                                                                                              |

- One owner lays this out: `HeaderBar` (`packages/ui/src/components/header-bar.tsx`) for a page, and `DrawerBar`'s `start` and `end` slots for a drawer. No site rebuilds it from a flex row.
- Controls are 44 px chrome controls (Rules 2 and 4), 16 px from the screen or drawer edge and 12 px apart.
- A title capsule takes its content's width, grows until 12 px remains to each side control, then truncates.
- Related actions share one 44 px capsule with a 44 px slot each and no divider: `ButtonGroup appearance='capsule'`.
- A surface that fills the screen at phone width (Settings, the search palette) is a page for this rule. When a nested view offers both, Back is at the start and Close is an end circle.
- A centred dialog keeps [UI Policy](ui-policy.md) §5's close control in its corner at every width; at phone width that control is a 36 px circle (Rule 2). A side sheet keeps §5's control from `md` up.
- **The desktop app's titlebar row is exempt.** In a narrow desktop-app window that row drags the window and keeps its 36 px height and its controls; this rule governs the web build's page header and every drawer header.

**Why**: Tau's phone headers had five layouts across three size systems; one layout puts the way out and the title in the same place on every screen.

**Check**: at 390 px wide, the start control's left edge and the end control's right edge are 16 px from the bar's edges, and the title's centre is within 1 px of the bar's centre. At 320 px wide the title truncates and nothing overflows.

### 7. Give a view one primary capsule

At phone width, the one primary action of a page or of the sidebar is a 44 px capsule: `shape-round`, the `primary-action` finish, a label that names the action and its object ([UX Policy](ux-policy.md) Rule 10), and an optional leading glyph. Inline padding is 16 px at the glyph end and 20 px at the label end. It is `variant='default'` with `surface='chrome'`, so from `md` up it stays the `default` Button.

**It sits at the bottom trailing edge of the view**: 16 px from the inline end and 16 px above the bottom safe-area inset, over the page's content, which scrolls clear of it. A secondary action beside it is one chrome circle at the inline start of the same edge. The sidebar's capsule sits the same way in its bottom bar. A dialog's or a form's commit is the same capsule in its footer. A view has one.

**Why**: the primary action was a 32 px rectangle in a header or an outlined row; a single dark capsule in a fixed place is the one control a person can find without reading. The place is the reference's (Claude screens 05 and 08).

**Check**: at 390 px wide, each view has at most one `primary-action` capsule, 44 px high with a radius of 22 px; on a page its right edge is 16 px from the viewport's and its bottom edge is 16 px above the safe-area inset, at any scroll position, and the last row of the page can be scrolled clear of it.

### 8. Keep an open trigger lit

A control that opens a menu, popover, drawer, dialog or picker shows that it is open for as long as that surface is open, at every width and under either pointer.

- **Key the state on ARIA**: `[aria-haspopup]:not([aria-haspopup='false'])[aria-expanded='true']`, and `[role='combobox'][aria-expanded='true']` for select triggers, which carry no `aria-haspopup`; an `input` never matches. `tokens.css` defines that selector once as the `trigger-open` variant, and `has-trigger-open` for an ancestor.
- **A trigger with no expanded state keys on its primitive.** `ContextMenuTrigger` renders neither attribute, so the `@taucad/ui` wrapper sets `data-context-menu-open` on it while its menu is open, and that attribute is the selector's third arm. A right-clicked row stays lit through the same variant.
- **The open style is the control's hover fill plus the open ring.** The ring is 1.5 px, inset, in `--trigger-open-ring`: the foreground colour at an opacity that reaches 3:1 against the control's fill and against the surface beside it, in every theme. A plain or a filled control takes the `accent` fill and the ring; a solid control takes its hover finish and a ring in its own foreground. Hover alone has no ring, and a selected row that is also open shows its selection fill and the ring. Never author another open tint.
- `Button`, `SidebarMenuButton`, `Toggle`, `SelectTrigger`, `PaneButton` and the composer's controls each pair `trigger-open` with their hover classes and the ring. A row that contains the trigger lights through `has-trigger-open:`, never a hand-written `:has()`.
- A control that opens a surface sets both attributes. One that sets neither (a Share button that opens a drawer, a Search row that opens the palette) gains them first.
- An expanded section is not an open trigger: a collapsible, an accordion, a navigation-menu trigger and a pane's expanded header keep their own `data-state` styles.

**Why**: after a click the pointer moves into the menu, hover ends, and the context of what was clicked is lost. `data-state` cannot be the key: a tooltip on the same element owns it, so it never reads `open` there, and collapsibles and accordions set it too, so a rule on it lights every expanded section. `aria-haspopup` separates "has a surface open" from "is expanded". An `input` is excluded because a command field (cmdk) is `role='combobox'` with `aria-expanded='true'` at all times. The ring exists because the fill alone is too faint to be a state indicator (WCAG 1.4.11 asks for 3:1): `accent` over a resting fill measures 1.09:1 to 1.45:1 across the themes, and in the sidebar the open fill is the selection fill.

CORRECT:

```tsx
'hover:bg-accent trigger-open:bg-accent trigger-open:open-ring';
```

INCORRECT:

```tsx
'hover:bg-accent data-[state=open]:bg-accent'; // a tooltip's data-state wins; collapsibles light up
'data-[state=open]:hover:bg-sidebar-accent'; // gated on hover: lost once the pointer is in the menu
'hover:bg-accent trigger-open:bg-accent'; // no ring: open is as faint as hover, and equals selected
```

**Check**: open each trigger at 1440 px wide and move the pointer into its surface: the trigger's computed background equals its hover background, and its ring measures 3:1 or more against that fill and against the adjacent surface in the light, dark, black and high-contrast themes. A row stays lit while its context menu is open. An expanded collapsible's trigger and a command field are unchanged.

### 9. Reveal shortcut hints on hover and on focus

In a navigation row, a keyboard shortcut is hidden at rest and appears while the row is hovered or holds keyboard focus (`:focus-visible`). It is plain `text-muted-foreground` text at the row's inline end, with no keycap box, and revealing it does not move or resize the row's label. The hint is `aria-hidden` and the row carries `aria-keyshortcuts`, so the row's accessible name is the same whether or not the hint shows. Menu rows and tooltips keep their hints. The hint is never the route to the action: the row is.

**Why**: a keycap on every row is noise for a hint that matters at the moment of use, and DESIGN allows a hover reveal only with keyboard parity and a visible route.

**Check**: at 1440 px wide the sidebar shows no shortcut at rest; hovering a row and tabbing to it each reveal its hint; the label's box and the row's accessible name are the same in all three states.

### 10. Pointer decides the hit area and the stand-in fill, viewport decides the layout

| Question                                                                                                                                                               | Decided by | Tool                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Hit area and row minimum height; a bar's gap, widened to make room for hit areas (Rule 1); showing a hover-only affordance; the stand-in fill (Rule 4)                 | Pointer    | `pointer-coarse:`                                                |
| Layout; drawn size (Rule 2's ladder); shape (Rule 3); chrome style and the primary capsule (Rules 4 and 7); header layout; drawer geometry; drawer in place of popover | Viewport   | `max-md:`; `useIsMobile()` only where the component tree differs |

**A fill that stands in for hover is keyed on hover, not on width.** The operator's reason for the composer's filled, outline-free controls was "you can't hover in mobile". A coarse pointer cannot hover at any width, so the stand-in fill follows the pointer, as PR #2902 built it; a mouse in a narrow window can hover, so its controls keep the variant they have from `md` up (ghost on the composer). Everything that moves or resizes a control follows the viewport.

| Device                                                 | Layout, drawn size, shape, chrome style | Stand-in fill                       | Hit areas and row heights    |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------- | ---------------------------- |
| Phone: under `md`, coarse pointer                      | Phone                                   | Filled, no outline                  | 44 px                        |
| Touch tablet at desktop width: `md` up, coarse pointer | Desktop                                 | Filled, no outline                  | 44 px; bars widen their gaps |
| Narrow desktop window: under `md`, fine pointer        | Phone                                   | None: §9's variant, filled on hover | None                         |
| Desktop: `md` up, fine pointer                         | Desktop                                 | None                                | None                         |

- `pointer-coarse:` is the one test for "touch" and for "no hover". Never add a second (`hover: none`, `any-pointer`, a user-agent check, an `isTouch` prop).
- Under a coarse pointer a bar may widen its gap until Rule 1's hit areas fit (the composer's 28 px controls go from 4 to 16 px apart from `md` up). The gap and the row height are the only layout a pointer moves: never a drawn size, a shape or a position.
- 320, 360, 375 and 390 px share one specification, and no rule keys on a viewport width below `md`. A bar that cannot fit its row keeps its controls' size and moves the trailing ones, in a stated priority order, into a trailing ⋯ overflow capsule, by its own container's width (the viewer toolbar). Nothing clips and no control becomes unreachable.
- Under `md`, an action menu (`DropdownMenu`) and a picker (`ComboBoxResponsive`) open as drawers, never as a popover over an open drawer; nesting follows [UX Policy](ux-policy.md) §7. `ContextMenu` is the exception.
- **Scope: every control that renders at phone width.** Rules 1–7 apply to every button, field, segmented group, row, dialog and drawer that shows under `md`: chrome, the composer, cards and content, and equally forms, settings pages, tables, dialogs and the pane bodies that open in a phone drawer. The operator asked for "all of the buttons across mobile". The only exemptions are a surface that does not render at phone width, the desktop app's titlebar row (Rule 6) and the glyph controls of Rule 1, which keep their drawn size. Rules 1 and 8 apply at every width.
- **No desktop regression.** From `md` up under a fine pointer, a change made under this policy alters no drawn size, shape, fill or position except the named ones: the open fill and ring on a trigger (Rule 8), the shortcut hints (Rule 9), and the sidebar's order, row style, icon, label, top padding, pinned group, New without a current-page fill and the More menu's position (Rule 11). A pull request lists the ones it makes. From `md` up under a coarse pointer a change alters only what the device table lists: hit areas, row heights, bar gaps and the stand-in fill. A change to a shared `@taucad/ui` default (a variant's radius, height or fill) is a desktop change: add a size, a variant, a `shape` or a `surface` instead, with a version plan. Two shared defaults change at phone width only, each with a version plan: a bottom drawer is inset, and a `DropdownMenu` opens as a drawer.

**Why**: a hit area and a fill move no control, so they are safe wherever the pointer is coarse and are needed wherever hover is missing; a size, a shape or a header moves layout, so it follows the layout breakpoint. Five ways of detecting "touch" produced five sizes. A desktop gate read by eye would pass a 28 px squircle that became a circle.

**Check**: every pull request under this policy runs the desktop pixel diff: screenshots at 1440×900 and 1024×768 under a fine pointer, before and after, at rest, on hover and on keyboard focus, with zero differing pixels outside the regions the pull request names as intended. It runs the phone probe at 320, 360, 375, 390 and 768 px wide with touch emulation. A surface with a stand-in fill or a widened gap adds 1024×768 with touch emulation (the desktop layout, sizes and shapes, with filled controls and 44 px hit areas) and 600 px wide under a fine pointer (the phone layout, sizes and shapes, with no stand-in fill).

### 11. Make the sidebar one plain group

From `md` up:

| Item        | Rule                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Order       | New, Search, Projects, More: one group of identical rows, with New above Search                                                                                                |
| Pinned      | The whole group stays pinned above the scrolling list. Before, only Search and New project were                                                                                |
| Row style   | Plain: transparent at rest, no border, 28 px high, `rounded-md`; hover and selection fill with `bg-sidebar-accent`. No outlined navigation row                                 |
| New         | The lucide `Plus` glyph and the visible label "New". Its accessible name is "New project". It is an action, not a destination: it takes no current-page fill, on Home included |
| Top padding | 12 px between the top-bar controls and the first row                                                                                                                           |
| Shortcuts   | Shown on hover and on keyboard focus only (Rule 9)                                                                                                                             |
| More        | Keeps its hover fill and takes the open ring while its menu is open (Rule 8). The menu opens beside the row, its top level with the row's, 4 px from the sidebar's edge        |

**Operator-facing choice (2026-11-27)**: the first row reads "New", not "New project", following the operator's words "move to new" and Claude's row.

At phone width the sidebar stays an overlay `Sheet` from the inline start. Its header holds the close control as a 44 px chrome circle at the start, the wordmark, and a 44 px chrome Search circle at the end (a modal sheet keeps a visible way out for switch and voice users); rows are 44 px with a filled selection; row actions stay drawn at 24 px, 20 px apart so that each takes a 44 px target, and reachable, never long-press only (DESIGN requires a persistently reachable, named overflow menu); and "New project" is the primary capsule (Rule 7) at the trailing end of a bottom bar.

**Why**: an outlined Search and New project block above the navigation read as a second system; one group of plain rows matches Projects and More and leaves the fill to mean hover or selected, and the ring to mean open.

**Check**: at 1440 px wide, the first four rows share one computed height, radius, background and border, on Home too; the first is "New" with a plus; the first row's top is 12 px below the top-bar controls; the four rows do not move when the list scrolls.

## Enforcement

| Rules          | Gate                                                                                                                                                                                                                                            | State                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1              | axe `target-size` in `apps/ui-e2e/src/route-accessibility.spec.ts`: WCAG 2.5.8 with its spacing exception. It cannot see one hit area covering another control; that is the probe's job                                                         | Exists                                                 |
| 2              | `tau-lint/no-button-size-override`                                                                                                                                                                                                              | Exists as a suggestion; an error once surfaces migrate |
| 1, 2, 3, 4, 8  | Runtime probe `apps/ui-e2e/src/mobile-ui-policy.spec.ts`, one manifest per surface in `apps/ui-e2e/src/support/mobile-surfaces/`: a `migrated` surface passes these rules' checks, a `legacy` one must not get worse                            | Lands with the utility                                 |
| 10             | Desktop pixel diff `apps/ui-e2e/src/desktop-pixel-diff.spec.ts` over the same manifests: 1440×900 and 1024×768 under a fine pointer, at rest, on hover and on focus, zero differing pixels outside the regions a pull request names as intended | Lands with the utility                                 |
| 8              | Contract test on the trigger primitives in `packages/ui`: each matches `trigger-open` only while open, `ContextMenuTrigger` included; a collapsible, a navigation-menu trigger and a command field never do                                     | Lands with the `trigger-open` variant                  |
| 3, 4, 8        | Token test in `packages/ui`: a `surface` leaves the desktop radius and `corner-shape` unchanged; `--control-edge` and `--trigger-open-ring` reach 3:1 in each theme                                                                             | Lands with the utility                                 |
| 1              | `tau-lint/no-local-hit-area`: an `after:` inset on an interactive element, an `isTouch` or `enableTouchTargets` prop, or a `touch-reach-x-*` beside a gap                                                                                       | Planned; default, unenforced until then                |
| 8              | `tau-lint/no-open-state-data-attribute`: a `data-[state=open]:` fill or text class in a variant owner Rule 8 names, or on the child of a menu, popover, drawer or dialog trigger. Never a context-menu row, a collapsible or a navigation menu  | Planned; default, unenforced until then                |
| 10             | Lint, named when it lands: no hover-only reveal without focus and coarse-pointer parity                                                                                                                                                         | Planned; default, unenforced until then                |
| 4, 5, 6, 7, 11 | Rendered review against the program's canvases                                                                                                                                                                                                  | Default, unenforced                                    |

The probe runs at 320×640, 360×800, 375×812, 390×844, 768×1024 and 1024×768 with touch emulation, and at 600×800 and 1440×900 with a fine pointer. It reads hit boxes against their reach, drawn heights, radii, fills, borders and each open trigger's background and ring.

## Anti-Patterns

- A hit-area pseudo-element, touch prop or touch size authored in a component.
- A control under 24 px that does not meet the spacing exception, two hit areas that overlap, or a reach written by hand beside a gap.
- A larger element box given to a switch, a checkbox, a radio or a slider thumb to reach 24 px.
- An outlined rectangle button on phone chrome, or a bordered control on a card outside the Black, High contrast and forced-colours fallback.
- A height, radius or fill forced through `className` where `surface`, `shape` or a variant exists, or one that is off the ladder.
- A width-prefixed `rounded-full`.
- An open state keyed on `data-state` on an overlay trigger, gated on hover, without the ring, or tinted with another colour; a hand-written `:has()` for an open trigger.
- A keycap shown at rest in a navigation row.
- A popover menu at phone width, or a popover over an open drawer.
- A drawn size, shape, chrome style or header layout keyed on `pointer-coarse:`; a hit area or a stand-in fill keyed on `max-md:`.
- A second test for touch or for hover beside `pointer-coarse:`.
- A drawer that sets its own inset or radius, or an edge-anchored bottom drawer.
- A control that renders at phone width and is off the ladder because its surface was "exempt".
- A desktop pixel that moved without Rule 10 naming it and the pull request listing it.

## Known Limitations

- Tailwind 4.3.3 compiles the utility, the reach arithmetic, the variant and its compounds, and `touch-gap-*` was prototyped at 390, 1024 and 1440 px (the program's P4 review, 2026-11-27). `ControlSurface`, `shape-round`, `--control-edge`, the open ring's opacity per theme, the toolbar's overflow and the inset workbench drawer's snap and keyboard geometry are designed, not yet built. The change that lands each proves it or amends this policy.
- Fill and focus-ring contrast was computed in all four themes; nothing was checked with a screen reader.
- Tau's runtime numbers come from Chromium touch emulation. Whether iOS Safari applies `corner-shape`, the real safe-area insets and real finger hit-testing are unverified until measured on a device.
- No screenshot shows a hit area, so 44 px is Apple's and WCAG 2.5.5's number, not a measurement of Claude.
- A hit area clipped by an `overflow-hidden` ancestor or capped by a tight gap stays under 44 px. Rule 1's probe reports these; the fix is the gap or the container, not a second mechanism.
- Chat history, message actions, and error, decision and permission cards were audited in source only: the runtime audit ran signed out. The first surface package that touches them probes them signed in.

## References

- Research: `docs/research/mobile-surface-redesign.md` (audit, Claude reference, D1–D16); `docs/research/mobile-surface-redesign-blueprint.md` (the API behind these names, the work packages, the net size change per surface, the intended desktop changes); `docs/research/mobile-experience-audit.md`
- Reviews: `docs/research/artifacts/mobile-surface-redesign/p4/` (two adversarial reviews, the coordinator's rulings, and the disposition of each finding)
- [DESIGN](design-policy.md): Composition and visible affordances; Design tokens; Accessibility; Components
- [UI Policy](ui-policy.md) §5; [UX Policy](ux-policy.md) §§6, 7 and 10; [Page Composition Policy](page-composition-policy.md) §9; [Accessibility Policy](accessibility-policy.md); [Color Policy](color-policy.md)
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html); [SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## Appendix: operator asks traced to rules

The asks are quoted from the program's operator input (2026-11-26 and 2026-11-27), recorded verbatim in `docs/research/artifacts/mobile-surface-redesign/handoff/resume.md`.

| Ask                                                                                                              | Rule                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The + menu is "a simple popover" on mobile; make it "combo box responsive"                                       | 10 (menus and pickers are drawers under `md`), 5                                              |
| Move the folder and kernel pickers into the + menu; the mode control stays                                       | DESIGN's composer sentence owns composition; no rule here                                     |
| "well and beautifully designed menu"                                                                             | 5, 6, 1 (rows)                                                                                |
| The + glyph's stray gap                                                                                          | A defect fixed with the composer work; no rule                                                |
| "no spacing between" composer buttons; "more compact"                                                            | 2 (36 + 8: hit areas tile with no dead space)                                                 |
| "you can't hover in mobile … since there's no hover"                                                             | 4, 10 (the stand-in fill follows the pointer, not the width)                                  |
| "those sorts of buttons … there's no outline … a new button variant"                                             | 4 (composer: filled, no outline; `surface`, `muted`), 3                                       |
| "audit across the app … any other surfaces in the mobile experience"                                             | 10 (scope: every control that renders at phone width); the research documents                 |
| "not oversizing our buttons unnecessarily"                                                                       | 2 (Claude's size per context; the operator-facing choice), 1 (the target exceeds the shape)   |
| Accepted: draw smaller "(e.g. 32px)" with an invisible 44 px touch area and 4–6 px gaps                          | 1, 2 (36 + 8 replaces the example)                                                            |
| "styled once in a single place and can be straightforwardly applied across the entire UI app"                    | 1 (one utility; a bar's gap owns its reach), 2 (`surface`, `ControlSurface`), 8 (one variant) |
| "really clear where the buttons are and end"; "styled depending on the surface that they live on"                | 4                                                                                             |
| "sometimes we've got rounded buttons, sometimes we don't. Sometimes the height is different … square buttons"    | 2, 3                                                                                          |
| "a complete UI surface audit and redesign for all of the buttons across mobile"                                  | 10 (no exempt surface at phone width)                                                         |
| "maintain as much visual consistency with the web as possible … okay with diverging where it makes sense"        | 10 (viewport decides layout, size and shape; same tokens and components); 4 (Send)            |
| "lean into the Claude UI style … create our own mobile UI policy … future reference for agents"                  | This policy; routes in DESIGN, UI Policy and `packages/AGENTS.md`                             |
| "all of the mobile surfaces, also … the drawer and the combo box responsive"                                     | 5 (every drawer), 10                                                                          |
| "our drawer … that little margin away from the edges and it follows the curvature of the screen"                 | 5 (every bottom drawer, the chat drawer included)                                             |
| "buttons to be precisely placed in the same way … Claude is using"                                               | 6, 7 (the capsule at the bottom trailing edge), 2 (insets and gaps)                           |
| "all of the buttons to just be the same size as Claude has"                                                      | 2                                                                                             |
| "all of the buttons to have consistent rounding"                                                                 | 3                                                                                             |
| "not regressing desktop"; "maintain responsive design"                                                           | 10 (the pixel diff and the named changes; 320 to 390 px; the overflow capsule)                |
| Desktop: "the same new search projects"; New and Search "visually part of the same group as projects and … more" | 11                                                                                            |
| "for more, have it behave the same"                                                                              | 8 (fill and ring while open), 11 (where the menu opens)                                       |
| "the context of what was clicked is lost … fixed by design across the entire UI surface"                         | 8                                                                                             |
| "put new above search"; "get rid of the outline nav style"; "suitable padding below the top bar"                 | 11                                                                                            |
| "hovering over each of the nav items shows the shortcut rather than always showing them"                         | 9                                                                                             |
| "Make the new button icon just be the plus"                                                                      | 11                                                                                            |
| Screenshots to review before anything merges                                                                     | 10 (the pixel diff, the probe and the screenshots in each pull request)                       |
