---
name: create-logo
description: Adds or replaces a color brand logo in the UI icon sprite, sourced verbatim from the tracked Lobe Icons repository or the brand's own published SVG. Use when adding a known brand, provider or kernel icon, including as part of a model-catalog task.
argument-hint: '[brand] [official-site-url]'
---

# Create Brand Logo

Use the provider or brand identity already established by [create-llm](../create-llm/SKILL.md) when this is part of a model-catalog task. Do not change the model catalog here.

1. Require one brand argument. Match it case-insensitively after removing spaces, hyphens, periods, and underscores against the basename of `repos/lobe-icons/packages/static-svg/icons/*-color.svg` with `-color` removed. If none matches, run `pnpm repos sync lobe-icons` once and retry.
2. With exactly one Lobe match, use its slug as the Tau icon ID and that SVG as the source. With several, show the candidates and stop.
3. With no Lobe match, source the brand's own SVG: the mark its official site serves, or an SVG published by the brand's own GitHub organization that renders identically to the site's mark (compare a `rsvg-convert` render against the site's logo image; reject partial, recoloured or placeholder variants such as framework default logos). Record the repository, path, commit SHA and license. Use the brand's existing Tau icon ID if one exists, otherwise its lowercase name. If no exact vector exists, show what was found and stop; never trace a raster, substitute a mono, text or unrelated asset.
4. Refuse to overwrite `apps/ui/app/components/icons/raw/<id>.svg` unless the user explicitly requested replacement.
5. Copy the source SVG verbatim to that raw path. Add or replace its entry in the Attribution section of `apps/ui/app/components/icons/README.md` with the source file, commit (`git -C repos/lobe-icons rev-parse HEAD` for Lobe) and license, following the existing entries.
6. Follow [regen-sprite](../regen-sprite/SKILL.md) to regenerate and verify the checked-in outputs.
7. Verify the raw copy still matches its upstream source, then report the source, destination, attribution commit, and generated files.

Do not edit upstream clones, hand-edit generated files, commit, or push.
