---
taucad-ui: minor
---

New `CoachMark` in `@taucad/ui/components/coach-mark`: a small non-modal card placed beside a control, for product tours and first-run hints. It is positioned by Radix Popper, the layer under `Popover`, and wears `popoverSurfaceVariants`, but has no dismissable layer, focus scope or outside-press handling: a press outside it does nothing, it never moves focus by itself, and Escape is handled on the tip element only, so an Escape pressed in a code editor or a viewer while a tip is on screen keeps doing what it did. It is `role="dialog"` without `aria-modal`, named by `label`, and portalled into its anchor's own document unless `container` says otherwise. `anchor` takes an element or any object with `getBoundingClientRect`.
