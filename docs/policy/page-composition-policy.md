---
title: 'Page Composition Policy'
description: 'Page frame, title row, view controls, collection grid and pagination, card anatomy and states, button roles, busy and collection states, copy, view URL state, keyboard order and first-viewport budget for Tau product pages.'
status: active
created: '2026-09-28'
updated: '2026-09-28'
related:
  - DESIGN.md
  - docs/policy/ui-policy.md
  - docs/policy/ux-policy.md
  - docs/policy/color-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/keyboard-service-policy.md
  - docs/research/community-page-refresh-blueprint.md
  - docs/research/community-page-refresh-audit.md
  - docs/research/project-card-composition-blueprint.md
  - docs/research/panel-empty-state-component-blueprint.md
---

# Page Composition Policy

Internal reference for composing route-level pages in `apps/ui` (web and desktop builds) and the title rows, view controls, collection grids, cards, actions and states they contain.

## Rationale

`DESIGN.md` states the principles and each page used to re-derive them: at the 2026-09-27 audit, 30 `<h1>` elements carried 18 class recipes, the project grid chain was copied three times and had drifted, and the newest index page shipped fixed-width triggers, a placeholder-only search, a label-less pending button and an inert "Load More". This statute compiles the principles into one recipe per page part, names the component that owns each recipe and the gate that keeps it, so a new page inherits the pattern instead of rediscovering it (DESIGN Principle 1, "Enforced or broken").

## Scope and owners

This policy owns page composition. It links, and never restates, the owners below.

| Concern                                                                                                                                                                                                         | Owner                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Type scale, spacing, radius, motion budgets, spinner delay                                                                                                                                                      | [UI Policy](ui-policy.md) §3–6                                 |
| Colour roles, achromatic hover and selection, contrast                                                                                                                                                          | [Color Policy](color-policy.md) §2, DESIGN Color usage law     |
| `role="status"` / `role="alert"` / `role="img"`, role-based test selectors                                                                                                                                      | [Accessibility Policy](accessibility-policy.md)                |
| Inline editing, destructive confirmation, `ComboBoxResponsive`                                                                                                                                                  | [UX Policy](ux-policy.md)                                      |
| Shortcut registration, scopes, `mod`                                                                                                                                                                            | [Keyboard Service Policy](keyboard-service-policy.md)          |
| Pane headers and workbench empty panes                                                                                                                                                                          | DESIGN Surfaces › apps/ui; `PaneviewHeader`, `PanelEmptyState` |
| Page frame, title row, view controls, collection grid and pagination, card anatomy and states, button roles, busy and collection states, copy form, view URL state, keyboard order, first viewport, host parity | This policy                                                    |

## Rules

### 1. Compose every page inside the shell frame

Render route content inside the shell (`components/layout/page.tsx` mounts `SidebarInset`, which is the document's `<main>`) as `container mx-auto px-4`, with vertical padding that keeps Rule 14's budget, exactly one `<h1>` and no route-owned `<main>`. Only routes that opt out of the wrapper (`Handle.enablePageWrapper`, `types/matches.types.ts`) render their own landmark. A section that also appears on another page (`ProjectLibrary`, `HomepageChatHero`) takes its heading level from its host. Export route `meta` so the document title names the page ("Community · Tau").

**Why**: the signed-in and desktop homes rendered two `<h1>`s, `/plugins` and `/github/complete` nested a second `main` inside the shell's, and 6 of 32 routes exported `meta`, so `/community` was titled "Tau".

CORRECT:

```tsx
export const meta: MetaFunction = () => [{ title: 'Community · Tau' }];
…
<div className='container mx-auto space-y-3 px-4 pt-5 pb-8'>
  <PageHeader title='Community' count={examples.length} action={<NewProjectLink />} />
```

INCORRECT (`routes/plugins/route.tsx`):

```tsx
<main className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-14 pb-16'>
  …
  <h1 className='text-2xl font-medium tracking-normal'>Make Tau work your way</h1>
```

**Enforced by**: the ui-e2e route accessibility sweep (`apps/ui-e2e/src/route-accessibility.spec.ts`: axe `landmark-no-duplicate-main`, `landmark-main-is-top-level`, `page-has-heading-one`, plus one-`h1` and non-default-title assertions per route).

### 2. Lead with one title row

Start the page with `PageHeader` (`components/layout/page-header.tsx`): title, optional count and at most one primary action at the inline end, in `flex flex-wrap items-center justify-between gap-4`. `PageHeader` renders UI Policy §3's H1 step (36 px, weight 500, line height 1.1, `text-4xl font-medium tracking-tight`); do not hand-write heading utilities. The count is the collection's total as muted `tabular-nums` text without parentheses; the filtered count belongs to the results status (Rule 11). The page's primary action lives in this row, not in the shell header's `Handle.actions` slot, which holds route-scoped tools. Collection pages may place their named search in the same row, before the action (Rule 3). Product pages carry no kicker and no hero copy; add one sentence of description only when the title cannot say what the page is for (`/usage`). Marketing and docs sections keep their display scale and DESIGN's Geist Mono kicker.

**Why**: page titles were `text-3xl font-bold` (Projects, Community, Usage), `text-3xl font-medium tracking-tight` (Files), `text-2xl font-medium` (Plugins) and `text-6xl font-medium` (Workflows); none rendered the policy step.

CORRECT:

```tsx
<PageHeader title='Projects' count={projects.length} action={<NewProjectLink />} />
```

INCORRECT (the pre-refresh community route):

```tsx
<h1 className='text-3xl font-bold'>Community</h1>
<span className='text-muted-foreground'>({sortedProjects.length})</span>
```

**Enforced by**: `PageHeader` as the owner; `tau-lint/no-raw-page-heading` (an `<h1>` carrying a `text-*` size utility outside `PageHeader` and a display-hero allowlist). One primary action per view: default, unenforced; reviewer surface: rendered review.

### 3. Put view controls in one row

Below the title row, one row holds the view controls: search (grows, unless it sits in the title row), then filters, then sort, then view options (grid/table, trash) at the inline end, in `flex flex-wrap items-center gap-2` (`routes/usage/route.tsx`). Size controls from their content; use spacing-scale widths (`w-56`) for menus and never `w-[Npx]`. Offer only options that can match, and show a ghost `Clear` action only while a filter is active.

Choose the filter control by its vocabulary:

| Vocabulary                                                                        | Control                                                                                                                                                     | Current value                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| One value from a small closed set the visitor came to explore (up to six kernels) | Single-select `ToggleGroup` shelf: each tile shows the `SvgIcon` mark, catalog name, result count and catalog one-line `description`; two columns on phones | The pressed tile                     |
| One value from a closed set of up to ten                                          | Outline trigger + `DropdownMenuRadioItem` (`geometry/cad/grid-control.tsx`)                                                                                 | The trigger label and the radio mark |
| Several values from a closed set                                                  | Outline trigger + count `Badge` + `DropdownMenuCheckboxItem` (`routes/usage/route.tsx`)                                                                     | The badge and the checkbox marks     |
| An open or growing set                                                            | `ComboBoxResponsive` (UX Policy Rule 6)                                                                                                                     | The field value                      |

Each trigger states its current value from the same state its menu reads (`apps/ui/AGENTS.md`). Show identities from their catalog: kernel filters use `SvgIcon` with `kernelConfigurations[].name` and `.description` (`libs/types/src/constants/kernel.constants.ts`), never the raw id; above six kernels the shelf falls back to the radio dropdown.

**Why**: `/community` fixed both triggers and menus at 180 px, printed ids such as `replicad`, marked no current value and offered all eight kernel providers when three had examples; `/projects` split its controls across two rows.

CORRECT (`routes/usage/route.tsx`, elided):

```tsx
<DropdownMenuTrigger asChild>
  <Button variant='outline'>
    <Filter />
    {label}
    {selected.length > 0 ? <Badge variant='secondary'>{selected.length}</Badge> : undefined}
  </Button>
</DropdownMenuTrigger>
<DropdownMenuContent align='start' className='w-56'>
```

INCORRECT (the pre-refresh community route):

```tsx
<Button variant='outline' className='w-[180px] justify-start'>
  <Code2 className='mr-2 size-4' />
  {selectedKernel === 'all' ? 'All Kernels' : selectedKernel}
</Button>
```

**Enforced by**: `tau-lint/no-arbitrary-pixel-size` (autofixes multiples of 4, `w-[180px]` → `w-45`); trigger and menu agreement: role test (`getByRole('button', { name: 'Kernel: Replicad' })`, `getByRole('menuitemradio', { name: 'Replicad', checked: true })`, or `getByRole('radio', { name: /Replicad/, checked: true })` for a shelf). Order and wrapping: rendered review.

### 4. Name the search field

Use `SearchInput` with `aria-label` or a visible `<label>`. The placeholder is a hint ending in a real ellipsis ("Search examples…"), never the only name. Its clear control is an `icon-xs` (24 px) button that returns focus to the field. Match only fields the card shows or the results status explains. Filtering keeps focus in the field and updates the results status (Rule 11).

**Why**: the owner's clear button rendered at 20×20, below DESIGN's 24 px floor, its default placeholder was `'Search...'`, and `/community`, `DataTableSearch` (so `/projects`), the converter's format list and `/plugins` were named only by their placeholder.

CORRECT (`components/settings/settings-dialog.tsx`):

```tsx
<SearchInput
  ref={searchRef}
  aria-label='Search settings'
  placeholder='Search settings…'
  value={query}
  variant='transparent'
  onClear={clearSearch}
```

INCORRECT (the pre-refresh community route):

```tsx
<SearchInput placeholder='Search projects...' value={searchTerm} containerClassName='grow' onChange={…} onClear={handleSearchClear} />
```

**Enforced by**: `tau-lint/require-accessible-name` (`SearchInput`, `Input type='search'` and icon-only `Button` without `aria-label`, `aria-labelledby` or text); axe `target-size` in the route sweep. Fix the clear control once, in `components/search-input.tsx`.

### 5. Keep view state in the URL

Put state that decides which items a page shows (query, filters, sort, trash) in the URL through `useSearchParameter` (`hooks/use-search-parameter.ts`), with a module-scope codec from `utils/search-parameter.codecs.ts` (`stringParameter`, `flagParameter`, `enumParameter`) and a name added to the closed `searchParameterName` union (`constants/search-parameter.constants.ts`). Filters write with the default `replace` history and omit empty values; genuine destinations use `push`. Keep per-device presentation (grid/table, page size) in `useCookie`, and transient UI (open menus, preview toggles) in component state. The page index follows the library standard: component state, reset to the first page when the query or a filter changes; move it into the URL for every paginated page together, never for one page alone.

**Why**: reload, Back and a shared link must reproduce the view, as `?trash=1` already does on `/projects`; `/community` kept query, kernel and sort in `useState` and lost them on reload.

CORRECT (`components/project-library/project-library.tsx`):

```tsx
const [showDeleted, setShowDeleted] = useSearchParameter(searchParameterName.trash, flagParameter);
```

INCORRECT (the pre-refresh community route):

```tsx
const [searchTerm, setSearchTerm] = useState('');
const [selectedKernel, setSelectedKernel] = useState<KernelProvider | 'all'>('all');
```

**Enforced by**: the closed `SearchParameterName` union (typecheck), `search-parameter.codecs.test.ts` and `use-search-parameter.test.tsx`; route e2e: apply a filter, reload, assert the same results. Raw `useSearchParams` stays limited to consume-once returns (`auth.$`, `github.complete`).

### 6. Render collections through one grid owner and paginate with the shared owner

Render card collections through `projectGridClassName` (`components/project-grid.tsx`): `grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`, adding `grid-flow-dense` when a featured card spans cells. Skeletons use the same owner. Mark the grid as a list: `<ul role='list'>` with one `<li>` per card. Page every collection with the app's standard: TanStack `useReactTable` with `getPaginationRowModel` and controlled `pagination` state, rendered by the shared `DataTablePagination` (`components/ui/data-table.tsx`) below the grid, page size remembered per device through `useCookie` (default 20; options 20, 50, 100), `withSelectedCount={false}` with an `itemName` so the row shows the visible range ("21–31 of 31 examples"). Never show "Load more", infinite scroll or a show-all switch.

**Why**: the chain was written three times and the library skeleton had already lost `2xl:grid-cols-5`; `/community`'s "Load More Projects" never sliced the grid, and `/projects` already paginates through `DataTablePagination`, so one standard serves both.

CORRECT (the library's pagination, applied to a grid):

```tsx
const [pageSize, setPageSize] = useCookie<number>(cookieName.examplePageSize, 20);
const table = useReactTable({ data, columns, state: { pagination }, onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() });

<ul role='list' className={projectGridClassName}>
  {table.getRowModel().rows.map(({ original: example }) => (
    <li key={example.id}>
      <CommunityProjectCard {...example} />
    </li>
  ))}
</ul>
<DataTablePagination table={table} withSelectedCount={false} itemName='example' />
```

INCORRECT (the pre-refresh library skeleton):

```tsx
<div className='grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4' role='status' …>
```

**Enforced by**: the exported owners; role test (`getAllByRole('listitem')` count equals the rows on the current page; the pagination names are unchanged); inert controls: rendered review.

### 7. Build cards from the ProjectCard anatomy

A clickable project card is `ProjectCard` (`components/project-card.tsx`): an isolated shell with one full-inset sibling `Link` (`z-10`) whose sr-only label is a verb plus the name that says where it goes ("Open Bracket"); reserve "Preview" for the in-card live preview toggle. Add `ProjectCardMedia`: the media wrapper owns the 4:3 geometry and its children fill it, so content never sizes a grid row; a thumbnail is decorative (`alt=''`) beside the heading; the overlay `Preview model` toggle carries `aria-pressed`. The body holds a title as a heading one level below the page's (`h2` on index pages), clamped to one line; at most one muted metadata line; and a footer action island (`relative z-20`) with at most one visible action plus a named overflow (`Actions for <name>`). Never nest interactive elements in the link or put `onClick` on the card. Show authentic metadata only: on example cards the metadata line is the kernel's `SvgIcon` mark and catalog name, with no author, avatar or badge adornments.

A gallery may lead its unfiltered first page with one featured card chosen by a curated locator constant (never rotated or random): same anatomy, spanning `col-span-2 lg:row-span-2` with size containment, a larger media area, a two-line description and a "Featured" badge beside its heading. It disappears as soon as a query or filter is active or the visitor leaves the first page.

**Why**: the sibling overlay keeps native link behaviour without nested interactives (DESIGN Components); every community card showed the same "Tau Team" sample avatar, card titles were `CardTitle` `div`s that heading navigation could not reach, and the community link said "Preview" while opening the shared workbench.

CORRECT:

```tsx
<ProjectCard to={examplePath} linkLabel={`Open ${name}`}>
  <ProjectCardMedia name={name} …>{preview}</ProjectCardMedia>
  <CardHeader>
    <h2 className='line-clamp-1 text-base font-semibold'>{name}</h2>
    <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
      <SvgIcon id={kernel} className='size-4' />
      {kernelConfiguration.name}
    </p>
  </CardHeader>
  <CardFooter className='relative z-20 mt-auto justify-end'>
    <RemixButton project={project} />
  </CardFooter>
</ProjectCard>
```

INCORRECT (the pre-refresh community grid):

```tsx
<CardTitle className='line-clamp-1 text-sm sm:text-base'>{name}</CardTitle>
…
<AvatarImage src={author.avatar} alt={author.name} />
```

**Enforced by**: `ProjectCard` as the owner and its role tests (`project-grid.test.tsx`, `project-library-card.test.tsx`), including `getByRole('heading', { level: 2, name })`; axe `nested-interactive` in the route sweep.

### 8. Give every card state an achromatic, stationary treatment

| State                | Treatment                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rest                 | `Card` border and `bg-card`; every action visible, nothing appears only on hover                                                                                                                                                  |
| Hover (fine pointer) | Border steps toward foreground instantly, with no colour transition, background shift, transform or zoom; nested actions light in the same frame (`nestedActionVariants`, `packages/ui/src/components/nested-action.variants.ts`) |
| Keyboard focus       | The overlay link paints `focus-visible:focus-outline` around the card                                                                                                                                                             |
| Pressed              | Native; the Button base supplies `active:opacity-80`                                                                                                                                                                              |
| Preview open         | Toggle `aria-pressed='true'` with `aria-pressed:bg-accent aria-pressed:text-foreground`; the glyph stays foreground                                                                                                               |
| Busy                 | The acting control follows Rule 10 (Remix keeps its label, sets `aria-busy`, its arrow gives way to `Loader`); the card stays navigable                                                                                           |
| Preview error        | `RuntimeErrorOverlay` (`components/model-viewer.tsx`): one neutral sentence with a next step, colour on the glyph only, raw diagnostics behind `<details>`                                                                        |
| Unavailable          | Keep the card and name the reason in its metadata line; do not dim the whole card                                                                                                                                                 |
| Selected             | Checked checkbox (`primary-action`) plus an achromatic border step from Color Policy §2's selected-state tokens; no chromatic ring                                                                                                |

Hover never reveals the only route to an action (DESIGN Composition and visible affordances).

**Why**: Color Policy §2 (2026-08-26) makes hover and ordinary selection structural neutrals; the card's `hover:border-primary/60` (2026-08-22) and the library's `ring-3 ring-primary` selection predate it, and at the audit 16 sites used `hover:border-primary*`, `hover:text-primary` or `hover:bg-primary*`.

**Enforced by**: focus geometry: `packages/ui/src/styles/focus-outline.test.ts` with its regex extended over `apps/ui/app`; accent hover: `tau-lint/no-accent-hover`; motion: UI Policy §6 (review).

### 9. Choose button variants by role and sizes by variant

| Role                                                             | Variant                          | Size                                          |
| ---------------------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| The one primary action of a view (page action, dialog commit)    | `default` (`primary-action`)     | `default`                                     |
| Secondary action (Open, Retry, Remix) and toolbar triggers       | `outline`                        | `default` in toolbars, `sm` in cards and rows |
| Tertiary, inline, `Clear`, overflow trigger                      | `ghost`                          | `sm`, `icon`, `icon-sm`                       |
| Control over media or a canvas                                   | `overlay`                        | `icon`, `icon-sm`                             |
| Action nested in a hovered or selected row                       | `ghost` + `nestedActionVariants` | `icon-xs`, `icon-sm`                          |
| Commit of a data-losing action (`AlertDialogAction`)             | `destructive`                    | `default`                                     |
| Textual navigation ("View all")                                  | `link`                           | `default`                                     |
| Two to five mutually exclusive views, or a kernel shelf (Rule 3) | `ToggleGroup`                    | —                                             |

`sm` shares `default`'s 32 px height and only tightens padding and type; `xs` and `icon-xs` (24 px) are the smallest targets that ship. Never change a Button's height, padding, size or text colour through `className`; choose a size, or add a variant in `packages/ui`. The base already sizes icons to 16 px and spaces them with `gap-2`, so do not add `mr-2` or restate `size-4`. A trailing arrow means navigation or a flow that continues; a leading glyph names the object or state. Icon-only buttons carry `aria-label` and a tooltip with the same words.

**Why**: 52 Buttons overrode their size through `className` (six in `/plugins`), the community Remix action rendered enabled text in `text-muted-foreground` and turned accent on hover, which DESIGN's "quiet buttons are still visible buttons" forbids, and 15 icon-only Buttons had no name.

CORRECT:

```tsx
<Button variant='outline' size='sm' onClick={handleRemix}>
  Remix <ArrowRight />
</Button>
```

INCORRECT (the pre-refresh community grid):

```tsx
<Button variant='outline' size='sm' className='flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-primary sm:h-8 sm:px-3 sm:text-sm'>
```

**Enforced by**: `tau-lint/no-button-size-override` (suggestion; the right size needs judgment); icon-only names: `tau-lint/require-accessible-name` and axe `button-name`; target size: axe `target-size`; variant by role: default, unenforced (rendered review).

### 10. Keep a busy action's name

While an action runs, keep its label (a progressive verb with "…" is allowed), set `aria-busy`, and ignore repeat activation. The glyph may stay or give way to `Loader` (`components/ui/loader.tsx`, `aria-hidden`); never swap the label itself for `Loader`, which leaves the control nameless and collapses its width. Use `Spinner` (`components/ui/spinner.tsx`, `role='status' aria-label='Loading'`) for standalone progress, never inside a named control, where its label joins the control's name. `Loader` and `Spinner` stay two owners. A pending `NavLink` follows the same rule.

**Why**: six controls, including every "New Project" link, rendered an unnamed spinner while pending; `components/billing/plan-cards.tsx` is the pattern to copy.

CORRECT (`components/billing/plan-cards.tsx`):

```tsx
<Button
  className='w-full'
  disabled={isUnavailable || (stateIsCurrent && (isStarting || isPending))}
  aria-busy={stateIsCurrent && isStarting}
  onClick={async () => {
    await start();
  }}
>
  <Sparkles className='size-4' />
  {stateIsCurrent && isStarting ? 'Starting checkout…' : isPending ? 'Checkout pending' : label}
</Button>
```

INCORRECT (the pre-refresh community route):

```tsx
<NavLink to='/'>{({ isPending }) => (isPending ? <Loader /> : 'New Project')}</NavLink>
```

**Enforced by**: `tau-lint/no-label-replacing-loader` (a conditional whose one branch is `<Loader/>` or `<Spinner/>` and whose other is a string, as the sole child of `Button`, `NavLink` or `Link`); role test `getByRole('button', { name: 'Remix', busy: true })`.

### 11. Distinguish loading, empty, no-match and error

| State    | When                                          | Presentation                                                                                                              | ARIA                                                                    |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Loading  | Data is not yet known                         | Skeletons in the final geometry (same grid owner, same 4:3 media), after UI Policy §6's 150–300 ms delay                  | Container `role='status' aria-busy='true' aria-label='Loading <items>'` |
| Results  | Items are shown                               | A results status beside the view controls: "20 examples", or "4 of 20 match" while filtered, with `Clear`                 | Polite `role='status'`                                                  |
| Empty    | The collection has no items                   | `PanelEmptyState` (`components/ui/panel-empty-state.tsx`): icon tile, title, one sentence of orientation, one next action | None                                                                    |
| No match | Items exist; the query or filters exclude all | `PanelEmptyState` "No examples match “gear”" with `Clear filters`; keep the view controls                                 | The results status carries "0 of M"                                     |
| Error    | The load failed                               | Inline consequence and `Retry`; keep the last good data; recoverable failures use neutral surfaces, not destructive red   | `role='alert'`                                                          |

Loading is not empty, and no match is not empty. Do not frame a collection in the dashed `CollectionEmptyState`; keep dashed boundaries for real drop zones (DESIGN Surfaces › apps/ui).

**Why**: both project grids rendered nothing when a search matched nothing, the library's load failure had no `role='alert'`, and its refresh failure used `border-destructive/40` for a recoverable error.

**Enforced by**: Accessibility Policy's ARIA table (review); role tests (`project-route-notices.test.tsx` pattern); the route sweep; retiring `CollectionEmptyState` by deletion. Spinner delay: UI Policy §6 — default, unenforced.

### 12. Write sentence-case, verb-first copy

Write titles, buttons, menu items, values and placeholders in sentence case ("New project", "All kernels", "Clear filters"); proper nouns keep theirs (Tau, GitHub, OpenSCAD). Controls name their effect with a verb; menus name their values. Use "…" (U+2026) for truncation and progress, never "...". Take kernel, provider and format names from their catalogs. Do not write "Successfully" or apologise; a failure says what happened and what to do next (DESIGN Voice). Apply this to every page a change touches; remaining Title Case elsewhere is backlog, not precedent.

**Why**: `/community` shipped "All Kernels", "New Project", "Load More Projects" and "Sort by: newest", and 42 copy sites used ASCII "..." including `SearchInput`'s default placeholder.

**Enforced by**: `tau-lint/no-ascii-ellipsis` (autofix; JSX text and `placeholder`, `aria-label`, `title` literals); `tau-lint/no-engineering-vocabulary-in-copy` covers toast strings; sentence case: default, unenforced (copy review).

### 13. Keep keyboard order equal to reading order

Tab order runs: title-row search and action, filters, sort, view options, then each card (its link, then its controls in visual order), then pagination. Do not use a positive `tabIndex`, remove the only route to an action with `tabIndex={-1}`, or nest a `button` in a link. Escape closes an open menu; in search, Escape clears the field (native `type='search'`). Register page shortcuts with `useKeybinding` (`hooks/use-keyboard.tsx`), show them through the control's tooltip or `SearchInput`'s `keyboardShortcut` (`/` focuses a page's search), and never take browser find (`mod+f`).

**Why**: the library and home empty states wrapped a `<button>` in a `NavLink` with `tabIndex={-1}`, and `/community` cost 98 tab stops to pass 31 cards.

**Enforced by**: `jsx-a11y/tabindex-no-positive` and `jsx-a11y/no-noninteractive-tabindex` in the nine-site `jsx-a11y` subset; axe `nested-interactive`; keyboard role test per index page.

### 14. Spend the first viewport on content

On product index pages, only the shell header (36 px at `md`+), the title row, one view-control row (toolbar or kernel shelf, with the results status) and actionable notices precede the collection, and the first item row starts within 180 px of the top of a 1280×720 viewport. Hero art, marketing sections and explanatory paragraphs belong on marketing routes.

**Why**: `/community` measured 200 px to the first card at 1280×720 because of `py-8` plus `space-y-8`; the explorer layout measures 177 px with the 36 px header.

**Enforced by**: the route sweep's first-`listitem` assertion (top ≤ 180 px at 1280×720).

### 15. Ship one page to both hosts

Serve web and desktop from the same route module unless `apps/ui/desktop/app/routes.ts` swaps it, and do not fork page chrome by host. Keep web-only marketing, consent and legal routes off the desktop, keep controls out of window drag regions (`[app-region:no-drag]`), and give any capability a host cannot serve an explicit unavailable state rather than a broken one (a raw `ENOENT` in a preview is broken).

**Enforced by**: `apps/ui/desktop/app/routes.test.ts` and the packaged desktop e2e specs; otherwise default.

### 16. Use lucide glyphs for actions and sprite marks for identities

Use `lucide-react` icons for interface glyphs; they take the token stylesheet's 1.5 stroke and are `aria-hidden` by default. Use `SvgIcon` (`components/icons/svg-icon.tsx`) for kernel, provider, format and brand identities, always beside the catalog name. Size icons through their owning component.

**Enforced by**: `svg-icon.tsx` fails typecheck when a kernel or model family has no mark; otherwise default.

## Enforcement

| Gate                                                                                                                                                                                                                                                                                                                      | Severity                           | Rules              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------ |
| `tau-lint/no-ascii-ellipsis`                                                                                                                                                                                                                                                                                              | error (autofix)                    | 12                 |
| `tau-lint/no-arbitrary-pixel-size`                                                                                                                                                                                                                                                                                        | error (autofix for multiples of 4) | 3                  |
| `tau-lint/require-accessible-name`                                                                                                                                                                                                                                                                                        | warn for one release, then error   | 4, 9               |
| `tau-lint/no-label-replacing-loader`                                                                                                                                                                                                                                                                                      | warn for one release, then error   | 10                 |
| `tau-lint/no-accent-hover`                                                                                                                                                                                                                                                                                                | warn for one release, then error   | 8                  |
| `tau-lint/no-button-size-override`                                                                                                                                                                                                                                                                                        | warn (suggestion)                  | 9                  |
| `tau-lint/no-raw-page-heading`                                                                                                                                                                                                                                                                                            | warn for one release, then error   | 2                  |
| Nine-site `jsx-a11y` subset (`tabindex-no-positive`, `no-noninteractive-tabindex`, `aria-*`, `role-*-aria-props`, `alt-text`, `heading-has-content`, `anchor-has-content`)                                                                                                                                                | error                              | 7, 13              |
| `focus-outline.test.ts` regex over `apps/ui/app`                                                                                                                                                                                                                                                                          | unit                               | 8                  |
| `apps/ui-e2e/src/route-accessibility.spec.ts`: axe over `/community`, `/projects`, `/files`, `/plugins`, `/usage` at 1280×720 and 390×844, plus one `h1`, non-default title, first-`listitem` budget, filled-button ring ≥ 3:1, hover text ≥ 4.5:1, targets ≥ 24 px, no horizontal overflow at 320 px and 200 % text zoom | e2e                                | 1, 4, 7, 9, 13, 14 |

Lint rules scope to `apps/ui/app/**/*.tsx` and `packages/ui/src/**/*.tsx`, excluding tests and `[__e2e]` routes, and register per `create-lint-rule`. These gates land with the [community page refresh blueprint](../research/community-page-refresh-blueprint.md) (W3.2–W3.5); until the route accessibility sweep (W3.5) lands, rendered and code review enforce its rules.

## Anti-Patterns

- Hand-written page titles, parenthesised counts, a second primary action, or a route without `meta`.
- `w-[Npx]` triggers and menus; raw ids in trigger labels; menus that do not mark the current value.
- A search field named only by its placeholder; a clear button under 24 px.
- View state in `useState` that a reload or shared link should reproduce.
- A copied grid class chain; a skeleton with a different grid; "Load more", infinite scroll or show-all in place of `DataTablePagination`.
- `onClick` on a card, a button nested in a link, placeholder authors and avatars, a "Preview" label on a link that opens a page.
- `hover:text-primary` or `hover:border-primary/*` on neutral surfaces; muted text on an enabled action.
- `className` that changes a Button's size, padding or text colour.
- A spinner in place of a control's label.
- A blank grid for zero matches, a dashed box for an empty collection, destructive red for a recoverable error.
- Restyling a shared component from its parent through `[&_[data-slot=…]]` selectors instead of a variant.

## Summary Checklist

- [ ] One frame, one `<h1>` through `PageHeader`, route `meta`, no route-owned `<main>` inside the shell
- [ ] One view-control row; content-sized controls; trigger labels and menu marks agree; catalog names and marks
- [ ] Search has an accessible name; clear control is 24 px
- [ ] Query, filters, sort and trash live in the URL through `useSearchParameter`; page size in a cookie
- [ ] Grid and skeleton share `projectGridClassName`; the grid is a list; `DataTablePagination` pages it
- [ ] Cards use `ProjectCard`; titles are headings; one visible action plus a named overflow; authentic metadata only
- [ ] Hover and selection stay achromatic and instant; focus uses `focus-outline`
- [ ] Button variant by role; no size or colour overrides in `className`
- [ ] Busy controls keep their name and set `aria-busy`
- [ ] Loading, results, empty, no-match and error are distinct, with their ARIA roles
- [ ] Sentence case, verbs and "…"
- [ ] Tab order equals reading order; no nested interactives
- [ ] First item row within 180 px at 1280×720
- [ ] Same route on web and desktop, or an explicit unavailable state

## References

- [DESIGN.md](../../DESIGN.md) — Composition and visible affordances; Components; Surfaces › apps/ui; Voice; Governance
- [UI Policy](ui-policy.md), [UX Policy](ux-policy.md), [Color Policy](color-policy.md), [Accessibility Policy](accessibility-policy.md), [Keyboard Service Policy](keyboard-service-policy.md)
- Research: `docs/research/community-page-refresh-audit.md` (Finding 4 and lane D's enforcement matrix); `docs/research/community-page-refresh-blueprint.md` (decision register); `docs/research/project-card-composition-blueprint.md`; `docs/research/panel-empty-state-component-blueprint.md`
- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
