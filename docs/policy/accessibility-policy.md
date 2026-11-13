---
title: 'Accessibility Policy'
description: 'Guidelines for accessible UI and ARIA-driven E2E testing across the Tau codebase. Covers semantic HTML, ARIA conventions, Vitest Browser selectors, and screenshot tests.'
status: active
created: '2026-03-09'
updated: '2026-11-13'
related:
  - docs/research/billing-redesign-blueprint.md
  - docs/research/loading-states-ux-blueprint.md
---

# Accessibility Policy

Internal reference for accessible UI and ARIA-driven E2E testing across the Tau codebase.

## Rationale

Accessible UI ensures all users, including those using assistive technology, can interact with Tau. Using ARIA as the primary interface for E2E tests enforces accessibility compliance as a side effect of testing and keeps selectors stable across refactors.

## Principles

- Semantic HTML and ARIA attributes are the primary interface between UI components and automated tests.
- Every interactive or status-bearing element must be reachable by assistive technology.
- E2E tests must never rely on CSS classes, DOM structure, or `data-testid` attributes for element selection.

## ARIA Attribute Conventions

### Status indicators

| UI State                     | Required Attributes                                                | Example                                                                     |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Loading / in-progress        | `aria-busy="true"` on the region; a `role="status"` indicator slot | `<ul aria-busy="true">` beside `<WaitIndicator label="Loading projects" />` |
| Error                        | `role="alert"` `aria-label="<description>"`                        | `<div role="alert" aria-label="Preview error">`                             |
| Informational image / canvas | `role="img"` `aria-label="<description>"`                          | `<div role="img" aria-label="3D model preview">`                            |

A loading region follows [UI Policy](ui-policy.md) §5 Loading and draws no skeleton:

| Concern                    | Rule                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Busy state                 | The region's own container (list, feed, grid, stage, pane) carries `aria-busy="true"` from the start of its wait to arrival, whether or not an indicator is showing                                                                                                                                         |
| Status region              | The indicator's slot (`WaitIndicator`) is a `role="status"` element that is always in the DOM and empty to assistive technology. Its words enter it only when the indicator is revealed, so a fast load announces nothing (WCAG 4.1.3)                                                                      |
| One announcement per group | A route open is one group, announced once by the route's existing live region ("Opening project", then the slow text at 10 s). Region indicators inside an open are visible but not live (`live={false}`). A wait started by a gesture after the open (opening History, refetching a list) is its own group |
| Failure                    | `role="alert"`, inline in the same slot or region, with what failed, the consequence and a Retry button. Announced once. Focus does not move                                                                                                                                                                |
| Focus                      | Arrival never moves focus or scroll. A composer keeps focus, caret and selection through adoption                                                                                                                                                                                                           |
| Reduced motion             | No opacity entrance and no spinning glyph; words carry the state, so an indicator always has words                                                                                                                                                                                                          |
| Targets and contrast       | Retry is at least 24 by 24 px; indicator text meets 4.5:1 on its surface                                                                                                                                                                                                                                    |

```tsx
<ul aria-busy={isLoading} aria-labelledby='projects-heading'>
  {projects.map((project) => (
    <ProjectRow key={project.id} project={project} />
  ))}
</ul>
<WaitIndicator active={isLoading} label='Loading projects' slowLabel='Still loading projects' onRetry={retry} />
```

An icon that carries meaning beside text (the coming-soon icon in a feature list) is `aria-hidden`, and the meaning is given in words: a visually hidden prefix on the item ("Coming soon: ") and a visible legend.

### Interactive controls

- Buttons must have an accessible name via visible text content or `aria-label`.
- Toggle buttons must include `aria-expanded` or `aria-pressed`.
- Inputs and sliders must use native `<input>` elements with associated `<label>` or `aria-label`.

### Containers and landmarks

- Use native landmark elements (`<nav>`, `<main>`, `<aside>`) instead of generic `<div>` with `role`.
- Dialog-like surfaces (drawers, modals) must have `aria-labelledby` pointing to their title element.
- Heading levels follow the document outline, never the look: one `h1` per route, and each nested heading one level below the heading that owns its region. The look comes from the `Heading` variant ([UI Policy](ui-policy.md) §3).

## E2E Test Selector Strategy

All Vitest Browser selectors must use the shared browser facade's accessibility locators:

```typescript
// Preferred -- accessible and resilient
page.getByRole('img', { name: /3D model preview/i });
page.getByRole('alert');
page.getByRole('button', { name: /save/i });
page.getByLabel('File name');
page.getByText('No results found');

// Forbidden in E2E tests
page.locator('.my-class');
page.locator('[data-testid="foo"]');
page.locator('div > span:nth-child(2)');
```

Rationale: accessible locators mirror how real users (and assistive technology) find elements. They remain stable across refactors and enforce accessibility compliance as a side effect of testing.

### Visual screenshot tests

Capture and inspect screenshots when rendered output cannot be asserted via the DOM (for example, WebGL canvases):

```typescript
const canvas = page.getByRole('img', { name: /3D model preview/i });
const screenshot = await canvas.screenshot({ animations: 'disabled' });
const pixels = await analyseScreenshot(screenshot);
expect(pixels.foregroundRatio).toBeGreaterThan(0.02);
```

Use a deterministic pixel assertion or a Vitest file snapshot appropriate to the visual contract. Keep any baseline alongside the test and update Vitest snapshots with `pnpm exec vitest run --update`.

## Adding Accessibility to New Components

When creating a new UI component:

1. Determine which ARIA role best describes the element (see [WAI-ARIA roles](https://www.w3.org/TR/wai-aria-1.2/#role_definitions)).
2. Add a descriptive `aria-label` (or use `aria-labelledby` to reference a visible heading).
3. For stateful components, include `aria-busy`, `aria-expanded`, `aria-pressed`, or `aria-selected` as appropriate.
4. Write E2E tests that locate the component by its ARIA role and name.

## References

- [WAI-ARIA 1.2 Specification](https://www.w3.org/TR/wai-aria-1.2/)
- [Vitest Browser locators](https://vitest.dev/api/browser/locators)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
