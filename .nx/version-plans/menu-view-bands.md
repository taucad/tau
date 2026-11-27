---
taucad-ui: minor
---

Back rows and "More …" rows are drawn at the list's own text size, muted, instead of a smaller size. New `menuViewHeaderClass` and `menuViewFooterClass` (`@taucad/ui/components/menu.variants`) give a picker's Back row and closing rows ("More kernels", "Add models") one full-width band with a divider. `ComboBoxResponsive` puts its Back row and sub-view rows in these bands instead of an inset separator.
