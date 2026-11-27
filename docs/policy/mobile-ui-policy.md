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

Evidence, measurements and the decision behind each number are in [Mobile Surface and Button Redesign](../research/mobile-surface-redesign.md) (findings F1–F24, decisions D1–D16) and are not repeated here. [DESIGN](design-policy.md) governs; where this policy disagrees with it, DESIGN wins and the disagreement is a bug here.

## Terms

| Term           | Meaning                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Phone width    | A viewport under Tailwind's `md` (768 px): the `max-md:` variant                                             |
| Coarse pointer | `@media (pointer: coarse)`: the `pointer-coarse:` variant                                                    |
| Drawn size     | The element's own border box: what is painted, and what axe `target-size` measures                           |
| Hit area       | The region that accepts a tap: the drawn box plus the `touch-target` pseudo-element                          |
| Chrome         | The controls that frame a page, a sidebar or a drawer: its header, its view-control row and its bottom bar   |
| Drawer         | A bottom `Drawer` (`packages/ui/src/components/drawer.tsx`), Claude's "sheet". A `Sheet` is Tau's side panel |

## Adoption

New and touched code follows this policy from the day it merges. Existing surfaces migrate in the order the program's blueprint sets; until a surface migrates it is non-conforming, not exempt. The names fixed here (`--touch-target`, `touch-target`, `trigger-open`) are the contract: an implementation uses them or amends this policy in the same change. A rule whose gate has not landed is "default, unenforced" in DESIGN's sense; [Enforcement](#enforcement) lists each.

## Rules

### 1. Grow the hit area in one place

Under a coarse pointer, every interactive control accepts a tap on at least 44×44 CSS px. One mechanism provides it: the `--touch-target` token (44 px) and the `touch-target` utility in `packages/ui/src/styles/tokens.css`, which centres an invisible pseudo-element on the control and changes no layout. `Button` composes the utility by default. Every other control system (`PaneButton`, `PaneviewHeaderAction`, `SidebarMenuAction`, `InputGroupButton`, `Switch`, `Checkbox`, `RadioGroupItem`, a raw `<button>`) applies the same class.

| Control                                                                   | Tool                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Icon control                                                              | `touch-target`: a 44×44 box centred on the shape                   |
| Text button, field, joined segment (`ToggleGroup`, `ButtonGroup`, splits) | The utility's block-axis form: 44 high, the drawn width            |
| Full-width row (menu, picker, drawer, navigation)                         | `min-h-touch-row`; `--spacing-touch-row` is 44 px, the same number |

- **Drawn size is at least 24×24, always.** The pseudo-element does not count: axe measures the element's box. A glyph smaller than 24 px (a checkbox, a switch track, a chip's remove mark) sits in an element box that is 24 px or more.
- **Hit areas of neighbouring controls never overlap.** A control grows on each side by at most half the gap to its neighbour. A bar that wants full 44 px targets sets its gap to at least 44 minus the drawn size (36 → 8, 28 → 16, 24 → 20).
- A control may extend its hit area over a larger target that contains it (a card's cover link), never over a sibling control.
- The hit area exists only under a coarse pointer. Under a fine pointer the target is the drawn shape, so hover lights exactly what a click will hit.
- The focus outline stays on the drawn shape: `focus-outline` is inset and the hit area does not move it.
- Never author a second mechanism: no `after:` inset on a component, no fixed "touch size", no `isTouch` or `enableTouchTargets` prop.

**Why**: seven separate hit-area idioms and five authored "touch sizes" existed, and a rule inside `Button` alone would miss about 85 icon controls and every row; one utility makes 44 a one-line change.

CORRECT:

```tsx
<Button variant='ghost' size='icon-sm' aria-label='Fit view' />
<button type='button' className={cn(paneButtonClass, 'touch-target')} aria-label='Split pane' />
```

INCORRECT:

```tsx
<Button size='icon-sm' className='pointer-coarse:after:absolute pointer-coarse:after:-inset-2' />
<ViewerControls enableTouchTargets={isTouch} />
```

**Check**: at 390×844 with touch emulation, probe each control with `elementsFromPoint`: the hit box is 44 px on both axes or capped by a gap this rule allows, no two hit boxes intersect, and every drawn box is 24 px or more.

### 2. Draw on the ladder

Choose a control's drawn height from its context. Width follows the label, or equals the height for an icon control. A field in a bar of ladder controls takes the bar's height. Never author another height.

Phone width:

| Drawn height | Context                            | Examples                                                                             |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------ |
| 44           | Page, sidebar and drawer chrome    | Header circles, title pill, grouped pill, drawer header actions, primary page action |
| 40           | Floating over page content         | Scroll to latest                                                                     |
| 36           | On a card, a composer or a toolbar | Composer controls, viewer tools, card actions                                        |
| 24           | Inside content                     | Chips, inline actions in recovery, decision and permission cards                     |
| 44 (row)     | Full-width rows, by coarse pointer | Menu, picker, drawer and navigation rows                                             |

| Gap at phone width                                              | Value                                    |
| --------------------------------------------------------------- | ---------------------------------------- |
| Chrome control or composer card to the screen edge              | 16                                       |
| Between two separate chrome controls                            | 12                                       |
| Between the slots of a grouped pill (two actions make 96×44)    | 8                                        |
| Between 36 px controls, and from them to the edge of their card | 8                                        |
| Any other bar of targets                                        | 44 minus the drawn size, or Rule 1's cap |

**The composer draws 36 px controls 8 px apart**, so their 44 px hit areas tile edge to edge with no dead space and no overlap. This replaces the earlier working example of 32 px controls with 4–6 px gaps: a 36–38 px pitch makes 44 px hit areas overlap by 6–8 px, while 36 + 8 is exactly 44 and is what Claude draws.

From `md` up, `Button`'s sizes and Tau's 4 px gaps stay as they are. This policy adds no desktop height.

| Drawn height | Context from `md` up                                | `Button` size           |
| ------------ | --------------------------------------------------- | ----------------------- |
| 24           | Chips, actions nested in a row                      | `xs`, `icon-xs`         |
| 28           | Dense chrome: sidebar rows, pane toolbars, composer | `icon-sm`               |
| 32           | Page controls and fields                            | `default`, `sm`, `icon` |
| 40           | Large actions                                       | `lg`, `icon-lg`         |

A height the ladder lacks is added to `Button` as a size, never forced through `className` ([Page Composition Policy](page-composition-policy.md) §9).

**Why**: one phone screen mixed up to six heights; Claude's chrome uses 44, 36 and 24, and "the same size as Claude" was the ask.

**Check**: at 390 px wide, every control on a surface in Rule 10's scope has a computed height of 24, 36, 40 or 44. At 1440 px wide, heights equal the "before" screenshot.

### 3. Use one radius language

| Element                                                     | Phone width                                                   | From `md` up                             |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Control on chrome, a card, a composer, a toolbar or content | `rounded-full`: a circle when square, otherwise a capsule     | The ladder as today (`rounded-md`, `sm`) |
| Row, and a selected row                                     | A ladder rectangle as today, never a capsule                  | The ladder as today                      |
| Container (card, composer, menu, dialog)                    | The ladder step nearest the control's radius plus the padding | The ladder as today                      |
| Bottom drawer                                               | `--drawer-radius` on all four corners (Rule 5)                | Not applicable                           |

Nested corners are concentric: a container's radius is its control's radius plus the padding between them, snapped to the ladder. Never write an arbitrary radius (`rounded-[5px]`).

**Why**: `rounded-md` painted a circle at 24–28 px, a near capsule at 32 px and a soft rectangle at 40–44 px, and only `rounded-full` is certain to paint a true circle in every browser. Desktop keeps its ladder because changing it would restyle every desktop surface and every `@taucad/ui` consumer.

**Check**: at 390 px wide, every in-scope control's computed radius is at least half its height. `rg 'rounded-\['` finds nothing new.

### 4. Let the surface decide the style

At phone width a control's fill and edge come from the surface it sits on, in Tau's semantic tokens. Tau keeps its zero-chroma neutrals; Claude's colours are not copied.

| Surface                             | Control                                         | Style                                          | Tokens                                                      |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Page, sidebar or drawer chrome      | Icon control, title pill, grouped pill          | Outlined circle or capsule                     | `bg-background`, 1 px `border-border`, `shadow-xs`          |
| Composer, or any card               | A control on it                                 | Filled, no outline                             | `bg-muted`, no border, no shadow                            |
| Framed toolbar (the viewer's)       | A tool in it                                    | Plain inside the one frame; active tool filled | The frame as today; `bg-accent` when active                 |
| Any                                 | The primary page action (Rule 7); composer Send | Dark solid                                     | `primary-action`                                            |
| List: sidebar, menu, drawer, picker | Row                                             | Plain                                          | Transparent, no border                                      |
| List, tab bar, segmented control    | Selected row, active tab or segment             | Filled, never a bordered box                   | `bg-accent` (`bg-sidebar-accent` in the sidebar), no border |
| Content                             | Chip, inline action                             | Filled, no outline                             | `bg-muted`, no border                                       |
| Over page content                   | Floating control                                | The chrome style, 40 px                        | As chrome                                                   |
| Over media or a canvas              | Control                                         | `overlay`, unchanged                           | As today                                                    |

The border, not the shadow, carries a chrome control's edge in every theme. From `md` up, Page Composition Policy §9 chooses the variant as it does today; at phone width it still chooses the role, and this table chooses the look.

**Why**: an outline on every surface made it unclear where a button began and ended; a fill one step off its surface marks the edge without hover, which a phone does not have.

**Check**: at 390 px wide, no in-scope control pairs a border with a radius smaller than half its height, and no control on a composer or card surface has a border (a control over media keeps `overlay`). Verify each row of the table in the light, dark, black and high-contrast themes.

### 5. Float the drawer inside the screen

Under `md`, a bottom drawer sits 8 px from the left, right and bottom edges, adds `env(safe-area-inset-bottom)` below, and rounds all four corners to `--drawer-radius` (44 px). `DrawerContent` owns this geometry; no site overrides the inset or the radius. The viewport meta sets `viewport-fit=cover` so that the safe-area inset is not zero.

| Drawer                                                                            | Geometry                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Content-height drawers: pickers, menu drawers, the project sheet, viewer settings | Inset and rounded, as above                                 |
| Workbench drawer, search palette sheet, full-screen Settings                      | Edge-anchored until the blueprint's prototype rules on each |
| The sidebar `Sheet`                                                               | Edge-anchored (Rule 11)                                     |

Its header follows Rule 6 and its rows follow Rule 1.

**Why**: the reference sheet is inset 8 pt and concentric with the display. CSS cannot read a display's corner radius, so the curve is one fixed value: 44 px is within 3 px of the reference's 47 (a 55 pt display corner less the 8 pt inset), and it is the drawer's existing radius.

**Check**: at 390×844, an open picker's box is 374 px wide with 8 px to each side and the bottom, and all four computed radii are 44 px.

### 6. Lay out a phone header as start, centre, end

| Slot   | Page header                                                                                                       | Drawer header                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Start  | One chrome circle: the sidebar toggle or Back                                                                     | Close, or Back in a nested view               |
| Centre | The title, centred on the screen's axis. Plain text, or a 44 px chrome capsule when the title is itself a control | The title (`DrawerTitle`), centred plain text |
| End    | One chrome circle, or one grouped pill for related actions. An unrelated second action is its own circle          | The same                                      |

- Controls are 44 px chrome controls (Rules 2 and 4), 16 px from the screen or drawer edge and 12 px apart.
- A title capsule takes its content's width, grows until 12 px remains to each side control, then truncates.
- Related actions share one 44 px capsule with a 44 px slot each and no divider.
- A surface that fills the screen at phone width (Settings) is a page for this rule. When a nested view offers both, Back is at the start and Close is an end circle.
- A centred dialog keeps [UI Policy](ui-policy.md) §5's close control at every width, and a side sheet keeps it from `md` up.

**Why**: Tau's phone headers had five layouts across three size systems; one layout puts the way out and the title in the same place on every screen.

**Check**: at 390 px wide, the start control's left edge and the end control's right edge are 16 px from the bar's edges, and the title's centre is within 1 px of the bar's centre.

### 7. Give a view one primary capsule

At phone width, the one primary action of a page or of the sidebar is a 44 px capsule: `rounded-full`, the `primary-action` finish, a label that names the action and its object ([UX Policy](ux-policy.md) Rule 10), and an optional leading glyph. Inline padding is 16 px at the glyph end and 20 px at the label end. A view has one; a secondary action beside it is a chrome circle. The blueprint places it per surface (a bottom bar or the page header). From `md` up it stays the `default` Button.

**Why**: the primary action was a 32 px rectangle in a header or an outlined row; a single dark capsule is the one control a person can find without reading.

**Check**: at 390 px wide, each view has at most one `primary-action` control outside the composer, 44 px high with a radius of 22 px.

### 8. Keep an open trigger lit

A control that opens a menu, popover, drawer, dialog or picker shows its hover style for as long as that surface is open, at every width and under either pointer.

- **Key the state on ARIA**: `[aria-haspopup]` with `[aria-expanded='true']`, and `[role='combobox'][aria-expanded='true']` for select triggers, which carry no `aria-haspopup`. `tokens.css` defines that selector once as the `trigger-open` variant.
- **The open style is the control's own hover style.** Never author a separate open tint.
- `Button`, `SidebarMenuButton`, `Toggle`, `SelectTrigger`, `PaneButton` and the composer's controls each pair `trigger-open` with their hover classes. A row that contains the trigger lights through `:has()` on the same selector.
- A control that opens a surface sets both attributes. One that sets neither (a Share button that opens a drawer, a Search row that opens the palette) gains them first.

**Why**: after a click the pointer moves into the menu, hover ends, and the context of what was clicked is lost. `data-state` cannot be the key: a tooltip on the same element owns it, so it never reads `open` there, and collapsibles and accordions set it too, so a rule on it lights every expanded section. `aria-haspopup` separates "has a surface open" from "is expanded".

CORRECT:

```tsx
'hover:bg-accent trigger-open:bg-accent';
```

INCORRECT:

```tsx
'hover:bg-accent data-[state=open]:bg-accent'; // a tooltip's data-state wins; collapsibles light up
'data-[state=open]:hover:bg-sidebar-accent'; // gated on hover: lost once the pointer is in the menu
```

**Check**: open each trigger at 1440 px wide, move the pointer into its surface, and compare the trigger's computed background with its hover background: they are equal. An expanded collapsible's trigger is unchanged.

### 9. Reveal shortcut hints on hover and on focus

In a navigation row, a keyboard shortcut is hidden at rest and appears while the row is hovered or holds keyboard focus (`:focus-visible`). It is plain `text-muted-foreground` text at the row's inline end, with no keycap box, and revealing it does not move or resize the row's label. Menu rows and tooltips keep their hints. The hint is never the route to the action: the row is.

**Why**: a keycap on every row is noise for a hint that matters at the moment of use, and DESIGN allows a hover reveal only with keyboard parity and a visible route.

**Check**: at 1440 px wide the sidebar shows no shortcut at rest; hovering a row and tabbing to it each reveal its hint; the label's box is the same in all three states.

### 10. Pointer decides the hit area, viewport decides the restyle

| Question                                                                            | Decided by | Tool                                                             |
| ----------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Hit area, row minimum height, showing a hover-only affordance                       | Pointer    | `pointer-coarse:`                                                |
| Drawn size, shape, fill, header layout, drawer geometry, drawer in place of popover | Viewport   | `max-md:`; `useIsMobile()` only where the component tree differs |

- A tablet at desktop width keeps the desktop style and gains hit areas and row heights. A narrow desktop window takes the phone style and no hit areas.
- 375 and 390 px share one specification. No rule keys on a width below `md`.
- Under `md`, an action menu (`DropdownMenu`) and a picker (`ComboBoxResponsive`) open as drawers, never as a popover over an open drawer; nesting follows [UX Policy](ux-policy.md) §7. `ContextMenu` is the exception.
- **Restyle scope.** Rules 2–7 apply at phone width to page and drawer headers, a page's view controls, the composer, the sidebar, the bottom tab bar, the viewer toolbar, cards and in-content actions. **Pane internals are exempt**: the bodies of the file tree, editor, console, parameters, revisions, model and export panes keep the desktop style at phone width, as do forms, settings pages, tables and centred dialogs, until this policy names them. Rules 1 and 8 apply everywhere.
- **No desktop regression.** From `md` up under a fine pointer, a change made under this policy alters no drawn size, shape, fill or position except what Rules 8, 9 and 11 name. A change to a shared `@taucad/ui` default (a variant's radius, height or fill) is a desktop change: add a size or variant instead, with a version plan.

**Why**: a hit area changes no layout, so it is safe wherever the pointer is coarse; a restyle moves layout, so it follows the layout breakpoint. Five ways of detecting "touch" produced five sizes.

**Check**: every pull request under this policy attaches before and after screenshots of each touched surface at 1440×900 (fine pointer), which must match outside Rules 8, 9 and 11, and at 375×812 and 390×844 with touch emulation.

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

At phone width the sidebar stays an overlay `Sheet` from the inline start. Its header holds the wordmark and a 44 px chrome Search circle; rows are 44 px with a filled selection; row actions stay drawn and reachable, never long-press only (DESIGN requires a persistently reachable, named overflow menu); and "New project" is the primary capsule (Rule 7) in a bottom bar.

**Why**: an outlined Search and New project block above the navigation read as a second system; one group of plain rows matches Projects and More and leaves the fill to mean hover, open or selected.

**Check**: at 1440 px wide, the first four rows share one computed height, radius, background and border; the first is "New" with a plus; the first row's top is 12 px below the top-bar controls.

## Enforcement

| Rules          | Gate                                                                                                      | State                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1              | axe `target-size` in `apps/ui-e2e/src/route-accessibility.spec.ts` (drawn box at least 24 px)             | Exists                                  |
| 2              | `tau-lint/no-button-size-override`                                                                        | Exists as a suggestion                  |
| 1, 2, 3        | Runtime probe at 390×844: hit boxes, ladder heights, radii, no intersecting hit boxes                     | Lands with the utility                  |
| 8              | Contract test on the trigger primitives in `packages/ui`; zero lost or weak triggers in the runtime probe | Lands with the `trigger-open` variant   |
| 1, 10          | Lint: no local hit-area inset, and no hover-only reveal without focus and coarse-pointer parity           | Planned; default, unenforced until then |
| 10             | Before and after screenshots in the pull request                                                          | Review                                  |
| 4, 5, 6, 7, 11 | Rendered review against the program's canvases                                                            | Default, unenforced                     |

## Anti-Patterns

- A hit-area pseudo-element, touch prop or touch size authored in a component.
- A control drawn under 24 px, or two hit areas that overlap.
- An outlined rectangle button on phone chrome, or a bordered control on a card.
- A height or radius forced through `className`, or one that is off the ladder.
- An open state keyed on `data-state`, gated on hover, or tinted differently from hover.
- A keycap shown at rest in a navigation row.
- A popover menu at phone width, or a popover over an open drawer.
- A phone restyle keyed on `pointer-coarse:`, or a hit area keyed on `max-md:`.
- A desktop pixel that moved without Rule 8, 9 or 11 naming it.

## Known Limitations

- Every colour was measured in the light theme. Verify Rule 4 in the dark, black and high-contrast themes before a surface ships.
- Tau's runtime numbers come from Chromium touch emulation. Whether iOS Safari applies `corner-shape`, the real safe-area insets and real finger hit-testing are unverified until measured on a device.
- No screenshot shows a hit area, so 44 px is Apple's and WCAG 2.5.5's number, not a measurement of Claude.
- A hit area clipped by an `overflow-hidden` ancestor or capped by a tight gap stays under 44 px. Rule 1's probe reports these; the fix is the gap or the container, not a second mechanism.

## References

- Research: `docs/research/mobile-surface-redesign.md` (audit, Claude reference, D1–D16); `docs/research/mobile-experience-audit.md`
- [DESIGN](design-policy.md): Composition and visible affordances; Design tokens; Accessibility; Components
- [UI Policy](ui-policy.md) §5; [UX Policy](ux-policy.md) §§6, 7 and 10; [Page Composition Policy](page-composition-policy.md) §9; [Accessibility Policy](accessibility-policy.md); [Color Policy](color-policy.md)
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)

## Appendix: operator asks traced to rules

The asks are quoted from the program's operator input (2026-11-26 and 2026-11-27), recorded verbatim in `docs/research/artifacts/mobile-surface-redesign/handoff/resume.md`.

| Ask                                                                                                              | Rule                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The + menu is "a simple popover" on mobile; make it "combo box responsive"                                       | 10 (menus and pickers are drawers under `md`), 5                  |
| Move the folder and kernel pickers into the + menu; the mode control stays                                       | DESIGN's composer sentence owns composition; no rule here         |
| "well and beautifully designed menu"                                                                             | 5, 6, 1 (rows)                                                    |
| The + glyph's stray gap                                                                                          | A defect fixed with the composer work; no rule                    |
| "no spacing between" composer buttons; "more compact"                                                            | 2 (36 + 8: hit areas tile with no dead space)                     |
| "those sorts of buttons … there's no outline … a new button variant"                                             | 4 (composer: filled, no outline), 3                               |
| "audit across the app … any other surfaces in the mobile experience"                                             | 10 (restyle scope); the research documents                        |
| "not oversizing our buttons unnecessarily"                                                                       | 2 (draw on the ladder), 1 (the target is larger than the shape)   |
| Accepted: draw smaller "(e.g. 32px)" with an invisible 44 px touch area and 4–6 px gaps                          | 1, 2 (36 + 8 replaces the example)                                |
| "styled once in a single place and can be straightforwardly applied across the entire UI app"                    | 1, 8 (one utility, one variant)                                   |
| "really clear where the buttons are and end"; "styled depending on the surface that they live on"                | 4                                                                 |
| "sometimes we've got rounded buttons, sometimes we don't. Sometimes the height is different … square buttons"    | 2, 3                                                              |
| "maintain as much visual consistency with the web as possible … okay with diverging where it makes sense"        | 10 (viewport decides the restyle; same tokens and components)     |
| "lean into the Claude UI style … create our own mobile UI policy … future reference for agents"                  | This policy; routes in DESIGN, UI Policy and `packages/AGENTS.md` |
| "all of the mobile surfaces, also … the drawer and the combo box responsive"                                     | 5, 10                                                             |
| The drawer has "that little margin away from the edges and it follows the curvature of the screen"               | 5                                                                 |
| "buttons to be precisely placed in the same way … Claude is using"                                               | 6, 7, 2 (insets and gaps)                                         |
| "all of the buttons to just be the same size as Claude has"                                                      | 2                                                                 |
| "all of the buttons to have consistent rounding"                                                                 | 3                                                                 |
| "not regressing desktop"; "maintain responsive design"                                                           | 10                                                                |
| Desktop: "the same new search projects"; New and Search "visually part of the same group as projects and … more" | 11                                                                |
| "for more, have it behave the same"                                                                              | 8, 11                                                             |
| "the context of what was clicked is lost … fixed by design across the entire UI surface"                         | 8                                                                 |
| "put new above search"; "get rid of the outline nav style"; "suitable padding below the top bar"                 | 11                                                                |
| "hovering over each of the nav items shows the shortcut rather than always showing them"                         | 9                                                                 |
| "Make the new button icon just be the plus"                                                                      | 11                                                                |
| Screenshots to review before anything merges                                                                     | 10 (the before and after gate)                                    |
