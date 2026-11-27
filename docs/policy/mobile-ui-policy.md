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

| Term           | Meaning                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Phone width    | A viewport under Tailwind's `md` (768 px): the `max-md:` variant                                              |
| Coarse pointer | `@media (pointer: coarse)`: the `pointer-coarse:` variant                                                     |
| Drawn size     | The element's own border box: what is painted, and what axe `target-size` measures                            |
| Hit area       | The region that accepts a tap: the drawn box plus the `touch-target` pseudo-element                           |
| Reach          | The free room a container declares around its controls: the most a hit area may grow on each side (Rule 1)    |
| Stand-in fill  | The resting `bg-muted` fill, with no outline, that marks a control's edge where hover cannot (Rules 4 and 10) |
| Chrome         | The controls that frame a page, a sidebar or a drawer: its header, its view-control row and its bottom bar    |
| Drawer         | A bottom `Drawer` (`packages/ui/src/components/drawer.tsx`), Claude's "sheet". A `Sheet` is Tau's side panel  |

## Adoption

New and touched code follows this policy from the day it merges. Existing surfaces migrate in the order the program's blueprint sets; until a surface migrates it is non-conforming, not exempt. The names fixed here are the contract (`--touch-target`, `touch-target`, `touch-reach-*`, `touch-target-none`, `trigger-open`, `has-trigger-open`, `--drawer-inset`, `--drawer-radius`, `DrawerContent`'s `placement`, `HeaderBar`, and on `Button` the `surface` and `shape` props, the `muted` and `inverse` variants and the `dense` size): an implementation uses them or amends this policy in the same change. A rule whose gate has not landed is "default, unenforced" in DESIGN's sense; [Enforcement](#enforcement) lists each.

## Rules

### 1. Grow the hit area in one place

Under a coarse pointer, every interactive control accepts a tap on 44×44 CSS px, or on as much of that as its neighbours leave free. One mechanism in `packages/ui/src/styles/tokens.css` provides it and changes no layout:

| Name                                                  | What it does                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--touch-target`                                      | The one hit-area number: 44 px                                                                                                                                |
| `touch-target`                                        | Makes the control a host: an invisible pseudo-element centred on it. `Button` composes it by default                                                          |
| `touch-reach-*`, `touch-reach-x-*`, `touch-reach-y-*` | Declares the free room on each side, in spacing units. The hit area grows by the smaller of what 44 px needs and the reach. **Reach is zero unless declared** |
| `touch-target-none`                                   | Releases the pseudo-element on a host that needs its own `::after`                                                                                            |

Reach is declared by the element that knows the room: a bar declares half its gap (`flex gap-2 touch-reach-1`), a shared layout part (`HeaderBar`, `DrawerBar`, `DialogFooter`, `InputGroup`) declares its own, and a control that stands alone declares the room around it. The value inherits and the innermost declaration wins. Every control system other than `Button` (`PaneButton`, `PaneviewHeaderAction`, `SidebarMenuAction`, `InputGroupButton`, `Switch`, `Checkbox`, `RadioGroupItem`, a raw `<button>`) applies the same `touch-target` class.

| Control                                               | Tool                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Icon control                                          | `touch-target` inside a declared reach: up to 44×44, centred on the shape                                                                                             |
| Text button                                           | The same; a label wider than 44 px grows on the block axis only                                                                                                       |
| Joined segment (`ToggleGroup`, `ButtonGroup`, splits) | `touch-reach-y-*` only: 44 high, the drawn width                                                                                                                      |
| Field                                                 | Its wrapper (`InputGroup`, `SearchInput`) or its label is the host: a bare `<input>` renders no pseudo-element. In a bar of ladder controls it takes the bar's height |
| Full-width row (menu, picker, drawer, navigation)     | `min-h-touch-row`; `--spacing-touch-row` is 44 px, the same number                                                                                                    |

- **Drawn size is at least 24×24, always.** The pseudo-element does not count: axe measures the element's box. A glyph smaller than 24 px (a checkbox, a switch track, a chip's remove mark) sits in an element box that is 24 px or more.
- **Hit areas of neighbouring controls never overlap.** A bar declares at most half its gap as reach. A bar that wants full 44 px targets sets its gap to at least 44 minus the drawn size (36 → 8, 28 → 16, 24 → 20), and may widen it under a coarse pointer to get there (Rule 10).
- A control may extend its hit area over a larger target that contains it (a card's cover link), never over a sibling control.
- A host does not clip itself: truncation sits on an inner `span`, not on the control.
- The hit area exists only under a coarse pointer. Under a fine pointer the target is the drawn shape, so hover lights exactly what a click will hit.
- The focus outline stays on the drawn shape: `focus-outline` is inset and the hit area does not move it.
- Never author a second mechanism: no `after:` inset on a component, no fixed "touch size", no `isTouch` or `enableTouchTargets` prop.

**Why**: seven separate hit-area idioms and five authored "touch sizes" existed, and a rule inside `Button` alone would miss about 85 icon controls and every row; one utility makes 44 a one-line change. Reach defaults to zero because an uncapped 44 px area on a 28 px control 4 px from its neighbour covers the neighbour's drawn box, so a tap on one button activates the next.

CORRECT:

```tsx
<div className='flex gap-2 touch-reach-1'>
  <Button variant='ghost' size='icon-sm' surface='card' aria-label='Attach' />
  <Button variant='ghost' size='icon-sm' surface='card' aria-label='Dictate' />
</div>
<button type='button' className={cn(paneButtonClass, 'touch-target')} aria-label='Split pane' />
```

INCORRECT:

```tsx
<Button size='icon-sm' className='pointer-coarse:after:absolute pointer-coarse:after:-inset-2' />
<ViewerControls enableTouchTargets={isTouch} />
<div className='flex gap-1 touch-reach-2' /> // reach is more than half the gap: hit areas overlap
```

**Check**: at 390×844 with touch emulation, probe each control with `elementsFromPoint`: the hit box is 44 px on both axes or stops at its declared reach, no two hit boxes intersect, and every drawn box is 24 px or more.

### 2. Draw on the ladder

Choose a control's drawn height from its context. Width follows the label, or equals the height for an icon control. A field in a bar of ladder controls takes the bar's height. Never author another height.

Phone width:

| Drawn height | `surface`         | Context                            | Examples                                                                             |
| ------------ | ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| 44           | `chrome`          | Page, sidebar and drawer chrome    | Header circles, title pill, grouped pill, drawer header actions, primary page action |
| 40           | `floating`        | Floating over page content         | Scroll to latest                                                                     |
| 36           | `card`, `toolbar` | On a card, a composer or a toolbar | Composer controls, viewer tools, card actions                                        |
| 24           | `content`         | Inside content                     | Chips, inline actions in recovery, decision and permission cards                     |
| 44 (row)     | —                 | Full-width rows, by coarse pointer | Menu, picker, drawer and navigation rows                                             |

**A site names the surface and nothing else.** `Button`'s `surface` prop applies this height, Rule 3's shape and Rule 4's style; `buttonVariants({ surface })` does the same for a raw `<button>`, and `ToggleGroup` and `TabsList` take the prop for a segmented group. A site never writes the height, radius or fill, and `surface` changes nothing from `md` up under a fine pointer.

| Gap at phone width                                              | Value                                    |
| --------------------------------------------------------------- | ---------------------------------------- |
| Chrome control or composer card to the screen edge              | 16                                       |
| Between two separate chrome controls                            | 12                                       |
| Between the slots of a grouped pill (two actions make 96×44)    | 8                                        |
| Between 36 px controls, and from them to the edge of their card | 8                                        |
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

**Check**: at 390 px wide, every control on a surface in Rule 10's scope has a computed height of 24, 36, 40 or 44. At 1440 px wide every height equals the "before" screenshot; at 1024×768 with touch emulation every control's does, and only rows grow.

### 3. Use one radius language

| Element                                                     | Phone width                                                   | From `md` up                             |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Control on chrome, a card, a composer, a toolbar or content | `rounded-full`: a circle when square, otherwise a capsule     | The ladder as today (`rounded-md`, `sm`) |
| Row, and a selected row                                     | A ladder rectangle as today, never a capsule                  | The ladder as today                      |
| Container (card, composer, menu, dialog)                    | The ladder step nearest the control's radius plus the padding | The ladder as today                      |
| Bottom drawer                                               | `--drawer-radius` on all four corners (Rule 5)                | Not applicable                           |

Nested corners are concentric: a container's radius is its control's radius plus the padding between them, snapped to the ladder. Never write an arbitrary radius (`rounded-[5px]`). On a `Button`, `rounded-full` comes from `surface` at phone width, or from `shape='round'` for a control that is a circle or capsule at every width; never from `className`.

**Why**: `rounded-md` painted a circle at 24–28 px, a near capsule at 32 px and a soft rectangle at 40–44 px, and only `rounded-full` is certain to paint a true circle in every browser. Desktop keeps its ladder because changing it would restyle every desktop surface and every `@taucad/ui` consumer.

**Check**: at 390 px wide, every in-scope control's computed radius is at least half its height. `rg 'rounded-\['` finds nothing new.

### 4. Let the surface decide the style

A control's fill and edge come from the surface it sits on, in Tau's semantic tokens. Tau keeps its zero-chroma neutrals; Claude's colours are not copied. The table is the look on a phone; the last column names what keys each row (Rule 10).

| Surface                             | Control                                | Style                                          | Tokens                                                                                        | Keyed on |
| ----------------------------------- | -------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| Page, sidebar or drawer chrome      | Icon control, title pill, grouped pill | Outlined circle or capsule                     | `bg-background`, 1 px `border-border`, `shadow-xs`                                            | Viewport |
| Composer, or any card               | A control on it                        | The stand-in fill: filled, no outline          | `bg-muted`, no border, no shadow                                                              | Pointer  |
| Content                             | Chip, inline action                    | The stand-in fill: filled, no outline          | `bg-muted`, no border                                                                         | Pointer  |
| Framed toolbar (the viewer's)       | A tool in it                           | Plain inside the one frame; active tool filled | The frame as today; `bg-accent` when active                                                   | Viewport |
| Any                                 | The primary page action (Rule 7)       | Dark solid                                     | `primary-action`                                                                              | Viewport |
| Composer                            | Send                                   | Dark solid                                     | `primary-action` at phone width; from `md` up `variant='inverse'` (`bg-foreground`), as today | Viewport |
| List: sidebar, menu, drawer, picker | Row                                    | Plain                                          | Transparent, no border                                                                        | Viewport |
| List, tab bar, segmented control    | Selected row, active tab or segment    | Filled, never a bordered box                   | `bg-accent` (`bg-sidebar-accent` in the sidebar), no border                                   | Viewport |
| Over page content                   | Floating control                       | The chrome style, 40 px                        | As chrome                                                                                     | Viewport |
| Over media or a canvas              | Control                                | `overlay`, unchanged                           | As today                                                                                      | Neither  |

- **A viewport row** replaces the control's look at phone width. From `md` up, Page Composition Policy §9 chooses the variant as it does today; at phone width it still chooses the role, and this table chooses the look.
- **A pointer row** is the stand-in fill. It applies under a coarse pointer at every width, because it exists for the lack of hover, not for the lack of room. Under a fine pointer at every width the control keeps §9's variant (ghost on the composer) and fills on hover.
- A solid control (`default`, `inverse`, `destructive`) keeps its fill on every surface.
- `variant='muted'` is the same `bg-muted` fill for a control that is filled under either pointer; `variant='inverse'` is the `bg-foreground` solid of composer Send and Stop. Neither replaces `surface`.
- The border, not the shadow, carries a chrome control's edge in every theme.

**Why**: an outline on every surface made it unclear where a button began and ended; a fill one step off its surface marks the edge without hover, which a touch screen does not have at any width. Send keeps `bg-foreground` from `md` up because `primary-action` is a lighter neutral with a sheen, and swapping it there would move a desktop pixel.

**Check**: at 390 px wide with touch emulation, no in-scope control pairs a border with a radius smaller than half its height, and no control on a composer or card surface has a border (a control over media keeps `overlay`). At 1024×768 with touch emulation those controls are filled and border-free at their desktop size; at 390 px wide under a fine pointer they rest in §9's variant. Verify each row of the table in the light, dark, black and high-contrast themes.

### 5. Float the drawer inside the screen

Under `md`, a bottom drawer sits `--drawer-inset` (8 px) from the left, right and bottom edges, adds `env(safe-area-inset-bottom)` below, and rounds all four corners to `--drawer-radius` (44 px). `DrawerContent` owns this geometry through its `placement` prop, `'inset'` by default; no site sets the inset, the radius or either variable. With the on-screen keyboard open, an inset drawer keeps its side inset and radius and sits `--drawer-inset` above the keyboard, without the safe-area term. The viewport meta sets `viewport-fit=cover` so that the safe-area inset is not zero.

| Surface                                                                           | `placement` | Geometry                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content-height drawers: pickers, menu drawers, the project sheet, viewer settings | `inset`     | Inset and rounded, as above                                                                                                                                                                               |
| Workbench (chat) drawer                                                           | `edge`      | Edge-anchored, top corners at `--drawer-radius`. It is non-modal, docked on the tab bar, dragged between snap points and resized to the keyboard; an inset would float it above the bar it is attached to |
| Search palette sheet                                                              | `edge`      | Edge-anchored. It fills the screen below a 12 px sliver, and its bottom is under the keyboard for the whole task                                                                                          |
| Settings at phone width                                                           | —           | A page, not a drawer: it takes Rule 6's page header                                                                                                                                                       |
| The sidebar `Sheet`                                                               | —           | Edge-anchored from the inline start (Rule 11)                                                                                                                                                             |

A drawer not in this table is `inset`; another `edge` drawer is an amendment to the table. A drawer's header follows Rule 6 and its rows follow Rule 1.

**Why**: the reference sheet is inset 8 pt and concentric with the display. CSS cannot read a display's corner radius, so the curve is one fixed value: 44 px is within 3 px of the reference's 47 (a 55 pt display corner less the 8 pt inset), and it is the drawer's existing radius.

**Check**: at 390×844, an open picker's box is 374 px wide with 8 px to each side and the bottom, and all four computed radii are 44 px. The workbench drawer and the search palette sheet touch the left, right and bottom edges as before.

### 6. Lay out a phone header as start, centre, end

| Slot   | Page header                                                                                                       | Drawer header                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Start  | One chrome circle: the sidebar toggle or Back                                                                     | Close, or Back in a nested view               |
| Centre | The title, centred on the screen's axis. Plain text, or a 44 px chrome capsule when the title is itself a control | The title (`DrawerTitle`), centred plain text |
| End    | One chrome circle, or one grouped pill for related actions. An unrelated second action is its own circle          | The same                                      |

- One owner lays this out: `HeaderBar` (`packages/ui/src/components/header-bar.tsx`) for a page, and `DrawerBar`'s `start` and `end` slots for a drawer. No site rebuilds it from a flex row.
- Controls are 44 px chrome controls (Rules 2 and 4), 16 px from the screen or drawer edge and 12 px apart.
- A title capsule takes its content's width, grows until 12 px remains to each side control, then truncates.
- Related actions share one 44 px capsule with a 44 px slot each and no divider: `ButtonGroup appearance='capsule'`.
- A surface that fills the screen at phone width (Settings) is a page for this rule. When a nested view offers both, Back is at the start and Close is an end circle.
- A centred dialog keeps [UI Policy](ui-policy.md) §5's close control at every width, and a side sheet keeps it from `md` up.
- **The desktop app's titlebar row is exempt.** In a narrow desktop-app window that row drags the window and keeps its 36 px height and its controls; this rule governs the web build's page header and every drawer header.

**Why**: Tau's phone headers had five layouts across three size systems; one layout puts the way out and the title in the same place on every screen.

**Check**: at 390 px wide, the start control's left edge and the end control's right edge are 16 px from the bar's edges, and the title's centre is within 1 px of the bar's centre.

### 7. Give a view one primary capsule

At phone width, the one primary action of a page or of the sidebar is a 44 px capsule: `rounded-full`, the `primary-action` finish, a label that names the action and its object ([UX Policy](ux-policy.md) Rule 10), and an optional leading glyph. Inline padding is 16 px at the glyph end and 20 px at the label end. A view has one; a secondary action beside it is a chrome circle. The blueprint places it per surface (a bottom bar or the page header). It is `variant='default'` with `surface='chrome'`, so from `md` up it stays the `default` Button.

**Why**: the primary action was a 32 px rectangle in a header or an outlined row; a single dark capsule is the one control a person can find without reading.

**Check**: at 390 px wide, each view has at most one `primary-action` control outside the composer, 44 px high with a radius of 22 px.

### 8. Keep an open trigger lit

A control that opens a menu, popover, drawer, dialog or picker shows its hover style for as long as that surface is open, at every width and under either pointer.

- **Key the state on ARIA**: `[aria-haspopup]:not([aria-haspopup='false'])[aria-expanded='true']`, and `[role='combobox'][aria-expanded='true']:not(input)` for select triggers, which carry no `aria-haspopup`. `tokens.css` defines that selector once as the `trigger-open` variant, and `has-trigger-open` for an ancestor.
- **The open style is the control's own hover style.** Never author a separate open tint.
- `Button`, `SidebarMenuButton`, `Toggle`, `SelectTrigger`, `PaneButton` and the composer's controls each pair `trigger-open` with their hover classes. A row that contains the trigger lights through `has-trigger-open:`, never a hand-written `:has()`.
- A control that opens a surface sets both attributes. One that sets neither (a Share button that opens a drawer, a Search row that opens the palette) gains them first.

**Why**: after a click the pointer moves into the menu, hover ends, and the context of what was clicked is lost. `data-state` cannot be the key: a tooltip on the same element owns it, so it never reads `open` there, and collapsibles and accordions set it too, so a rule on it lights every expanded section. `aria-haspopup` separates "has a surface open" from "is expanded". The combobox arm excludes `input` because a command field (cmdk) is `role='combobox'` with `aria-expanded='true'` at all times, which would light every search field and every row that holds one.

CORRECT:

```tsx
'hover:bg-accent trigger-open:bg-accent';
```

INCORRECT:

```tsx
'hover:bg-accent data-[state=open]:bg-accent'; // a tooltip's data-state wins; collapsibles light up
'data-[state=open]:hover:bg-sidebar-accent'; // gated on hover: lost once the pointer is in the menu
```

**Check**: open each trigger at 1440 px wide, move the pointer into its surface, and compare the trigger's computed background with its hover background: they are equal. An expanded collapsible's trigger and a command field are unchanged.

### 9. Reveal shortcut hints on hover and on focus

In a navigation row, a keyboard shortcut is hidden at rest and appears while the row is hovered or holds keyboard focus (`:focus-visible`). It is plain `text-muted-foreground` text at the row's inline end, with no keycap box, and revealing it does not move or resize the row's label. Menu rows and tooltips keep their hints. The hint is never the route to the action: the row is.

**Why**: a keycap on every row is noise for a hint that matters at the moment of use, and DESIGN allows a hover reveal only with keyboard parity and a visible route.

**Check**: at 1440 px wide the sidebar shows no shortcut at rest; hovering a row and tabbing to it each reveal its hint; the label's box is the same in all three states.

### 10. Pointer decides the hit area and the stand-in fill, viewport decides the layout

| Question                                                                                                                                                                                      | Decided by | Tool                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Hit area and row minimum height; a bar's gap, widened to make room for hit areas (Rule 1); showing a hover-only affordance; the stand-in fill on composer, card and content controls (Rule 4) | Pointer    | `pointer-coarse:`                                                |
| Layout; drawn size (Rule 2's ladder); shape (Rule 3); chrome style, the primary capsule and Send's finish (Rules 4 and 7); header layout; drawer geometry; drawer in place of popover         | Viewport   | `max-md:`; `useIsMobile()` only where the component tree differs |

**A fill that stands in for hover is keyed on hover, not on width.** The operator's reason for the composer's filled, outline-free controls was "you can't hover in mobile". A coarse pointer cannot hover at any width, so the stand-in fill follows the pointer, as PR #2902 built it; a mouse in a narrow window can hover, so its controls keep the variant they have from `md` up (ghost on the composer). Everything that moves or resizes a control follows the viewport.

| Device                                                 | Layout, drawn size, shape, chrome style | Stand-in fill                       | Hit areas and row heights    |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------- | ---------------------------- |
| Phone: under `md`, coarse pointer                      | Phone                                   | Filled, no outline                  | 44 px                        |
| Touch tablet at desktop width: `md` up, coarse pointer | Desktop                                 | Filled, no outline                  | 44 px; bars widen their gaps |
| Narrow desktop window: under `md`, fine pointer        | Phone                                   | None: §9's variant, filled on hover | None                         |
| Desktop: `md` up, fine pointer                         | Desktop                                 | None                                | None                         |

- `pointer-coarse:` is the one test for "touch" and for "no hover". Never add a second (`hover: none`, `any-pointer`, a user-agent check, an `isTouch` prop).
- Under a coarse pointer a bar may widen its gap until Rule 1's hit areas fit (the composer's 28 px controls go from 4 to 16 px apart from `md` up). The gap and the row height are the only layout a pointer moves: never a drawn size, a shape or a position.
- 375 and 390 px share one specification. No rule keys on a width below `md`.
- Under `md`, an action menu (`DropdownMenu`) and a picker (`ComboBoxResponsive`) open as drawers, never as a popover over an open drawer; nesting follows [UX Policy](ux-policy.md) §7. `ContextMenu` is the exception.
- **Restyle scope.** Rules 2–7, the stand-in fill included, apply to page and drawer headers, a page's view controls, the composer, the sidebar, the bottom tab bar, the viewer toolbar, cards and in-content actions. **Pane internals are exempt**: the bodies of the file tree, editor, console, parameters, revisions, model and export panes keep the desktop style at phone width and under a coarse pointer, as do forms, settings pages, tables and centred dialogs, until this policy names them. Rules 1 and 8 apply everywhere.
- **No desktop regression.** From `md` up under a fine pointer, a change made under this policy alters no drawn size, shape, fill or position except what Rules 8, 9 and 11 name. From `md` up under a coarse pointer it alters only what the device table lists: hit areas, row heights, bar gaps and the stand-in fill. A change to a shared `@taucad/ui` default (a variant's radius, height or fill) is a desktop change: add a size, a variant, a `shape` or a `surface` instead, with a version plan.

**Why**: a hit area and a fill move no control, so they are safe wherever the pointer is coarse and are needed wherever hover is missing; a size, a shape or a header moves layout, so it follows the layout breakpoint. Five ways of detecting "touch" produced five sizes.

**Check**: every pull request under this policy attaches before and after screenshots of each touched surface at 1440×900 (fine pointer), which must match outside Rules 8, 9 and 11, and at 375×812 and 390×844 with touch emulation. A surface with a stand-in fill or a widened gap adds 1024×768 with touch emulation: the desktop layout, sizes and shapes, with filled controls and 44 px hit areas.

### 11. Make the sidebar one plain group

From `md` up:

| Item        | Rule                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Order       | New, Search, Projects, More: one group of identical rows, with New above Search                                                                |
| Row style   | Plain: transparent at rest, no border, 28 px high, `rounded-md`; hover and selection fill with `bg-sidebar-accent`. No outlined navigation row |
| New         | The lucide `Plus` glyph and the visible label "New". Its accessible name is "New project", which contains the label and names the object       |
| Top padding | 12 px between the top-bar controls and the first row                                                                                           |
| Shortcuts   | Shown on hover and on keyboard focus only (Rule 9)                                                                                             |
| More        | Keeps its hover fill while its menu is open (Rule 8)                                                                                           |

**Operator-facing choice (2026-11-27)**: the first row reads "New", not "New project", following the operator's words "move to new" and Claude's row.

At phone width the sidebar stays an overlay `Sheet` from the inline start. Its header holds the close control as a 44 px chrome circle at the start, the wordmark, and a 44 px chrome Search circle at the end (a modal sheet keeps a visible way out for switch and voice users); rows are 44 px with a filled selection; row actions stay drawn and reachable, never long-press only (DESIGN requires a persistently reachable, named overflow menu); and "New project" is the primary capsule (Rule 7) in a bottom bar.

**Why**: an outlined Search and New project block above the navigation read as a second system; one group of plain rows matches Projects and More and leaves the fill to mean hover, open or selected.

**Check**: at 1440 px wide, the first four rows share one computed height, radius, background and border; the first is "New" with a plus; the first row's top is 12 px below the top-bar controls.

## Enforcement

| Rules          | Gate                                                                                                                                                                                                                 | State                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1              | axe `target-size` in `apps/ui-e2e/src/route-accessibility.spec.ts` (drawn box at least 24 px)                                                                                                                        | Exists                                                 |
| 2              | `tau-lint/no-button-size-override`                                                                                                                                                                                   | Exists as a suggestion; an error once surfaces migrate |
| 1, 2, 3, 4, 8  | Runtime probe `apps/ui-e2e/src/mobile-ui-policy.spec.ts`, one manifest per surface in `apps/ui-e2e/src/support/mobile-surfaces/`: a `migrated` surface passes these rules' checks, a `legacy` one must not get worse | Lands with the utility                                 |
| 8              | Contract test on the trigger primitives in `packages/ui`: each matches `trigger-open` only while open; a collapsible and a command field never do                                                                    | Lands with the `trigger-open` variant                  |
| 1              | `tau-lint/no-local-hit-area`: an `after:` inset on an interactive element, or an `isTouch` or `enableTouchTargets` prop                                                                                              | Planned; default, unenforced until then                |
| 8              | `tau-lint/no-open-state-data-attribute`: a `data-[state=open]:` fill or text class on a trigger                                                                                                                      | Planned; default, unenforced until then                |
| 10             | Lint, named when it lands: no hover-only reveal without focus and coarse-pointer parity                                                                                                                              | Planned; default, unenforced until then                |
| 10             | Before and after screenshots in the pull request                                                                                                                                                                     | Review                                                 |
| 4, 5, 6, 7, 11 | Rendered review against the program's canvases                                                                                                                                                                       | Default, unenforced                                    |

The probe runs at 375×812, 390×844 and 1024×768 with touch emulation and at 1440×900 with a fine pointer, and reads hit boxes against declared reach, drawn heights, radii, fills and each open trigger's background.

## Anti-Patterns

- A hit-area pseudo-element, touch prop or touch size authored in a component.
- A control drawn under 24 px, two hit areas that overlap, or a reach larger than half the bar's gap.
- An outlined rectangle button on phone chrome, or a bordered control on a card.
- A height, radius or fill forced through `className` where `surface`, `shape` or a variant exists, or one that is off the ladder.
- An open state keyed on `data-state`, gated on hover, or tinted differently from hover; a hand-written `:has()` for an open trigger.
- A keycap shown at rest in a navigation row.
- A popover menu at phone width, or a popover over an open drawer.
- A drawn size, shape, chrome style or header layout keyed on `pointer-coarse:`; a hit area or a stand-in fill keyed on `max-md:`.
- A second test for touch or for hover beside `pointer-coarse:`.
- A drawer that sets its own inset or radius, or an `edge` drawer that Rule 5 does not name.
- A desktop pixel that moved without Rule 8, 9 or 11 naming it.

## Known Limitations

- Every colour was measured in the light theme. Verify Rule 4 in the dark, black and high-contrast themes before a surface ships.
- Tau's runtime numbers come from Chromium touch emulation. Whether iOS Safari applies `corner-shape`, the real safe-area insets and real finger hit-testing are unverified until measured on a device.
- No screenshot shows a hit area, so 44 px is Apple's and WCAG 2.5.5's number, not a measurement of Claude.
- The utility, the reach arithmetic, the `surface` compounds and the compounding of `trigger-open` under `has-` are designed, not yet compiled. The change that lands them proves each or amends this policy.
- A hit area clipped by an `overflow-hidden` ancestor or capped by a tight gap stays under 44 px. Rule 1's probe reports these; the fix is the gap or the container, not a second mechanism.

## References

- Research: `docs/research/mobile-surface-redesign.md` (audit, Claude reference, D1–D16); `docs/research/mobile-surface-redesign-blueprint.md` (the API behind these names, work packages, amendments P1–P8); `docs/research/mobile-experience-audit.md`
- [DESIGN](design-policy.md): Composition and visible affordances; Design tokens; Accessibility; Components
- [UI Policy](ui-policy.md) §5; [UX Policy](ux-policy.md) §§6, 7 and 10; [Page Composition Policy](page-composition-policy.md) §9; [Accessibility Policy](accessibility-policy.md); [Color Policy](color-policy.md)
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)

## Appendix: operator asks traced to rules

The asks are quoted from the program's operator input (2026-11-26 and 2026-11-27), recorded verbatim in `docs/research/artifacts/mobile-surface-redesign/handoff/resume.md`.

| Ask                                                                                                              | Rule                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The + menu is "a simple popover" on mobile; make it "combo box responsive"                                       | 10 (menus and pickers are drawers under `md`), 5                                   |
| Move the folder and kernel pickers into the + menu; the mode control stays                                       | DESIGN's composer sentence owns composition; no rule here                          |
| "well and beautifully designed menu"                                                                             | 5, 6, 1 (rows)                                                                     |
| The + glyph's stray gap                                                                                          | A defect fixed with the composer work; no rule                                     |
| "no spacing between" composer buttons; "more compact"                                                            | 2 (36 + 8: hit areas tile with no dead space)                                      |
| "you can't hover in mobile … since there's no hover"                                                             | 4, 10 (the stand-in fill follows the pointer, not the width)                       |
| "those sorts of buttons … there's no outline … a new button variant"                                             | 4 (composer: filled, no outline; `surface`, `muted`), 3                            |
| "audit across the app … any other surfaces in the mobile experience"                                             | 10 (restyle scope); the research documents                                         |
| "not oversizing our buttons unnecessarily"                                                                       | 2 (draw on the ladder), 1 (the target is larger than the shape)                    |
| Accepted: draw smaller "(e.g. 32px)" with an invisible 44 px touch area and 4–6 px gaps                          | 1, 2 (36 + 8 replaces the example)                                                 |
| "styled once in a single place and can be straightforwardly applied across the entire UI app"                    | 1 (one utility; a bar declares its reach), 2 (one `surface` prop), 8 (one variant) |
| "really clear where the buttons are and end"; "styled depending on the surface that they live on"                | 4                                                                                  |
| "sometimes we've got rounded buttons, sometimes we don't. Sometimes the height is different … square buttons"    | 2, 3                                                                               |
| "maintain as much visual consistency with the web as possible … okay with diverging where it makes sense"        | 10 (viewport decides layout, size and shape; same tokens and components)           |
| "lean into the Claude UI style … create our own mobile UI policy … future reference for agents"                  | This policy; routes in DESIGN, UI Policy and `packages/AGENTS.md`                  |
| "all of the mobile surfaces, also … the drawer and the combo box responsive"                                     | 5 (each drawer's `placement`), 10                                                  |
| The drawer has "that little margin away from the edges and it follows the curvature of the screen"               | 5                                                                                  |
| "buttons to be precisely placed in the same way … Claude is using"                                               | 6, 7, 2 (insets and gaps)                                                          |
| "all of the buttons to just be the same size as Claude has"                                                      | 2                                                                                  |
| "all of the buttons to have consistent rounding"                                                                 | 3                                                                                  |
| "not regressing desktop"; "maintain responsive design"                                                           | 10 (the device table; no desktop regression)                                       |
| Desktop: "the same new search projects"; New and Search "visually part of the same group as projects and … more" | 11                                                                                 |
| "for more, have it behave the same"                                                                              | 8, 11                                                                              |
| "the context of what was clicked is lost … fixed by design across the entire UI surface"                         | 8                                                                                  |
| "put new above search"; "get rid of the outline nav style"; "suitable padding below the top bar"                 | 11                                                                                 |
| "hovering over each of the nav items shows the shortcut rather than always showing them"                         | 9                                                                                  |
| "Make the new button icon just be the plus"                                                                      | 11                                                                                 |
| Screenshots to review before anything merges                                                                     | 10 (the before and after gate)                                                     |
