---
name: regen-sprite
description: Regenerates the checked-in UI SVG sprite and icon-id declaration from raw SVG icons. Use only when invoked as /regen-sprite after changing UI icons.
---

# Regenerate UI SVG Sprite

From the Tau workspace root, run:

```bash
pnpm nx run ui:generate-svg-sprite
```

This reads `apps/ui/app/components/icons/raw/**/*.svg` and overwrites:

- `apps/ui/app/components/icons/generated/sprite.svg`
- `apps/ui/app/components/icons/generated/svg-icons.d.ts`

After the command succeeds, run `git diff --check` for those two outputs and report which changed.

Do not start the dev server, edit generated files manually, modify raw icons, commit, or push.
