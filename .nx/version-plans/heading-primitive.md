---
taucad-ui: minor
---

`@taucad/ui/components/heading` adds `Heading`, a heading whose outline level and look are chosen separately: `level` (1 to 6) picks the element and `variant` picks the role (`display`, `page`, `section`, `title`, `item`, `label` or `overline`). Both are required. `@taucad/ui/components/heading.variants` exports the same scale as `headingVariants` for title slots that render their own element.

`CardTitle` takes `variant` (`title`, `item` or `label`; default `item`) and an optional `level` that renders it as that heading element. `DialogTitle`, `AlertDialogTitle`, `DrawerTitle`, `SheetTitle` and `CardTitle` now take their type from the scale; their default look is unchanged, with `CardTitle`, `DrawerTitle` and `SheetTitle` stating the 16 px size they used to inherit.
