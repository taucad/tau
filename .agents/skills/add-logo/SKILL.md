---
name: add-logo
description: Adds a color LLM or provider brand logo from the tracked Lobe Icons repository to the UI icon sprite. Use when adding a known brand icon, including as part of a model-catalog task.
argument-hint: '[brand]'
---

# Add Brand Logo

Use the provider or brand identity already established by [create-llm](../create-llm/SKILL.md) when this is part of a model-catalog task. Do not change the model catalog here.

1. Require one brand argument. Match it case-insensitively after removing spaces, hyphens, periods, and underscores against the basename of `repos/lobe-icons/packages/static-svg/icons/*-color.svg` with `-color` removed.
2. Require exactly one match. If none exists, run `pnpm repos sync lobe-icons` once and retry. If the result is still missing or ambiguous, show the candidates and stop; never substitute a mono, text, or unrelated brand asset.
3. Use the matched Lobe slug as the Tau icon ID. Refuse to overwrite `apps/ui/app/components/icons/raw/<slug>.svg` unless the user explicitly requested replacement.
4. Copy the matched SVG verbatim to that raw path. Append its source filename and `git -C repos/lobe-icons rev-parse HEAD` commit to the Attribution section of `apps/ui/app/components/icons/README.md`, following the existing Lobe Icons entry.
5. Follow [regen-sprite](../regen-sprite/SKILL.md) to regenerate and verify the checked-in outputs.
6. Verify the raw copy still matches its upstream source, then report the source, destination, attribution commit, and generated files.

Do not edit the upstream clone, hand-edit generated files, commit, or push.
