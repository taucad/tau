---
title: 'Brand Policy'
description: 'The canonical Tau name, descriptions, brand colours and logo assets, and how to apply them in the product and on every external provider surface.'
status: active
created: '2026-11-10'
updated: '2026-11-10'
related:
  - docs/policy/design-policy.md
  - docs/policy/color-policy.md
  - docs/policy/accessibility-policy.md
---

# Brand Policy

Internal reference for how Tau names, describes and depicts itself: in the product, in this repository's metadata, and on every third-party surface a user or the public can see (sign-in consent screens, payment pages, emails, store and registry listings, organization profiles).

## Rationale

A person meets Tau on surfaces Tau does not render: GitHub's authorize screen, Google's consent screen, a Stripe receipt, a card statement, an inbox. Each was configured by hand at a different time, so the name, description and badge drifted ("Tau", "TauCAD", "Tau Prod US"; a description written for operators rather than users). A consent or payment screen that does not look like the product the person just left is a trust failure and a phishing signal. One table of approved values, applied everywhere, removes the judgement call.

[Design policy](design-policy.md) governs how product surfaces look and behave, and [color policy](color-policy.md) governs in-product colour tokens. This policy governs identity: the values that must be the same wherever Tau appears.

## Rules

### 1. One Name: Tau

Write the product name as **Tau**: capital T, no suffix.

| Context                                                                                              | Value                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Product name, everywhere a person reads it                                                           | `Tau`                                                                                       |
| Named surfaces of the product                                                                        | `Tau Desktop`, `Tau Docs`, `Tau CLI`, `Tau Cloud`: the name first, then one plain qualifier |
| Wordmark artwork (the logo asset only)                                                               | lowercase `tau` beside the mark; never typeset by hand                                      |
| Legal entity (legal pages, email footers, invoices, signing identities, provider verification forms) | `TAUCAD LIMITED`                                                                            |
| Technical identifiers (GitHub organization, npm scope, staging domain, bundle ids, user agent)       | `taucad`, `@taucad/*`, `taucad.dev`, `com.taucad.tau`, `TauCAD/<version>`                   |
| Card statement descriptor (uppercase by card-network convention)                                     | `TAU.NEW`                                                                                   |

Never write `TauCAD`, `Tau CAD`, `TAU` or `tau` as the product name in copy; write "Tau" or "Tau's CAD tools", not "Tau CAD tools". `taucad` is an identifier, not a name: use it only where a slug, scope, domain or legal name is required.

**Why**: The authorize screen shows the registered application name verbatim; a name that differs from the product reads as a different party.

CORRECT:

```text
Sign in to Tau
Tau wants to access your account
```

INCORRECT:

```text
Sign in to TauCAD
Tau Prod US wants to access your account
```

### 2. Environments Are a Suffix, Never a Different Name

Production carries the bare name. A non-production registration appends the environment as a plain word, matching the desktop channel name.

| Environment       | Display name  | Slug form (where a slug is required) |
| ----------------- | ------------- | ------------------------------------ |
| Production        | `Tau`         | `tau`                                |
| Staging           | `Tau Staging` | `tau-staging`                        |
| Local development | `Tau Local`   | `tau-local`                          |

Never put a region, deployment name or internal label (`Prod US`, `prod-us`) in a name or description a user can see. When a platform requires a globally unique name and `Tau` is taken, use `Tau for <Platform>` (for example `Tau for GitHub`, `Tau for GitHub Staging`), and record the registered name in the handbook.

**Why**: Users of production must never see operator vocabulary; operators must still be able to tell registrations apart at a glance.

### 3. Approved Descriptions

Use these strings verbatim. Do not paraphrase per surface.

| Tier                 | Limit      | Text                                                                                                                                             | Use                                                                                                         |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Tagline              | 40 chars   | `Open-source, AI-native CAD`                                                                                                                     | Title suffixes, organization and repository bios, social bios, short listing fields                         |
| Standard description | 160 chars  | `Tau is open-source, AI-native CAD. Describe a part, edit its parametric source, check its geometry and export it for machining or 3D printing.` | Meta description, web manifest, application description fields, store and registry listings                 |
| Purpose sentence     | 1 sentence | From the table below                                                                                                                             | Appended to the standard description (or tagline, when space is short) on an integration's own registration |

The code source of the name and standard description is `metaConfig` in `apps/ui/app/constants/meta.constants.ts`. Any other in-repository copy must match it.

Purpose sentences state, in the user's terms, what this registration lets Tau do. One sentence, present tense, no environment, no protocol vocabulary.

| Registration                                                                  | Purpose sentence                                                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GitHub OAuth App (sign-in, optional Gists)                                    | `Sign in with your GitHub account. Tau asks separately before it creates Gists for you.` |
| GitHub App (repository access)                                                | `Sync your Tau projects with the GitHub repositories you choose.`                        |
| Automation apps visible on public repositories (`tau-release-bot`, `tau-iac`) | `Automation for the taucad organization. Not for installation.`                          |

**Why**: Provider documentation defines these fields as text "users will see" when asked to authorize. The reader is deciding whether to trust a product, so the field describes the product and what the grant is for, not the plumbing behind it.

CORRECT:

```text
Tau is open-source, AI-native CAD. Sign in with your GitHub account. Tau asks separately before it creates Gists for you.
```

INCORRECT:

```text
Tau CAD authentication and optional GitHub Gist sharing for Prod US.
```

### 4. Description Style

- Lead with what Tau is. A description never starts with "authentication", "OAuth", "integration" or "app for".
- Sentence case, full stops, no exclamation marks, no emoji, no trailing environment or version.
- Describe a grant by its user-visible outcome ("creates Gists for you"), never by scope names (`gist`, `read:user`).
- Do not promise what the registration does not do, and do not list features beyond the approved text.
- Keep environment out of the description entirely; the environment lives in the name suffix (rule 2).

### 5. Brand Colours for External Surfaces

Use these sRGB values wherever a provider asks for a hex colour or an asset must be flattened. They are projections of the product's teal identity for surfaces that cannot use tokens.

| Role                     | Value     | Use                                                                                                               | Contrast                                      |
| ------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Brand teal (mark)        | `#00987c` | The mark and wordmark on light backgrounds; provider "brand colour" fields                                        | 3.63:1 on white: graphics only, not body text |
| Brand teal (text)        | `#007e6e` | Teal text or links on white where a provider renders text in the brand colour                                     | 4.99:1 on white                               |
| Brand teal (on dark)     | `#27c7a7` | The mark on dark backgrounds                                                                                      | 7.69:1 on `#18211f`                           |
| Brand background (light) | `#ffffff` | Badge and icon backgrounds, page and email "background" fields, web manifest `background_color` and `theme_color` | n/a                                           |
| Brand background (dark)  | `#18211f` | Dark app-icon tile and dark badge backgrounds                                                                     | n/a                                           |

| Provider field                                               | Value     |
| ------------------------------------------------------------ | --------- |
| GitHub "Badge background color" (OAuth Apps and GitHub Apps) | `#ffffff` |
| Stripe "Brand colour"                                        | `#ffffff` |
| Stripe "Accent colour"                                       | `#00987c` |
| Any other single "brand/primary colour" field                | `#00987c` |
| Any other "background colour" field                          | `#ffffff` |

In product code, never hardcode these values: use the tokens defined by [color policy](color-policy.md). The hex values exist for provider consoles, static assets and generated email palettes only.

Stripe's brand colour fills the Checkout page behind the summary and its accent colour fills buttons, so on Stripe the page takes white and the button takes teal.

**Why**: The default identity is a teal mark on white, matching the favicon, the installed-app icon and the marketing site; a provider page that inverts or recolours it looks like a different product.

### 6. Logo Assets and Where Each Goes

Use the checked-in assets. Never redraw, recolour, crop, stretch, outline or add effects to the mark, and never rebuild the wordmark from a font.

| Asset                                            | Source                                                                                                                                                                                          | Use                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mark (transparent, teal)                         | `apps/libs/ui-kit/src/icons/raw/tau.svg`; published copies `apps/ui/public/favicon.svg`, `apps/www/public/favicon.svg`, `apps/docs/public/favicon.svg`, `packages/agent-plugin/assets/icon.svg` | In-product logo, favicons, plugin and registry icons that accept SVG                                              |
| Favicon rasters                                  | `apps/ui/public/favicon.ico`, `favicon-96x96.png`                                                                                                                                               | Browser tabs only                                                                                                 |
| Avatar, square (padded, transparent)             | `apps/ui/public/avatar-square.svg`, `avatar-square.png` (512 px)                                                                                                                                | Uploads shown as a square or rounded square: provider "logo" and "icon" fields, organization and registry avatars |
| Avatar, circle-safe (extra padding, transparent) | `apps/ui/public/avatar-circle.svg`, `avatar-circle.png` (512 px)                                                                                                                                | Uploads cropped to a circle: GitHub application badges, Google consent logo, chat-community and social avatars    |
| Installed web app icons (full-bleed on white)    | `apps/ui/public/android-chrome-192x192.png`, `android-chrome-512x512.png`, `apple-touch-icon.png`                                                                                               | Web manifest and home-screen icons only; never upload as an avatar (no safe padding)                              |
| Wordmark (mark plus lowercase "tau")             | `apps/ui/public/wordmark.svg`, `wordmark.png`; components in `apps/libs/ui-kit/src/icons/`                                                                                                      | Email header, site headers, and any provider field for a non-square "logo"                                        |
| Desktop app icon (tile, light and dark)          | `apps/desktop/resources/icon.svg`, `icon-dark.svg` and their `.png`, `.icns`, `.ico`                                                                                                            | Operating-system surfaces only: dock, taskbar, installer, file associations                                       |
| Social card (1200×630)                           | `apps/www/public/social.png`                                                                                                                                                                    | `og:image`, `twitter:image` and link previews                                                                     |

Selection rules:

1. If the platform crops to a circle, upload the circle-safe avatar. If it shows a square or rounded square, upload the square avatar. Use the wordmark only in a field that is explicitly non-square.
2. If the platform has a background-colour field, upload the transparent asset and set the background to `#ffffff`.
3. If the platform flattens transparency or has no background field, upload a version flattened on `#ffffff`. Never let a platform composite the teal mark onto black or onto its own brand colour.
4. Use the dark variants only where the surface is always dark or the platform takes a separate dark-mode asset.
5. Keep clear space around the mark of at least one quarter of its width; the avatar assets already include it.
6. Use the desktop tile icon only for operating-system surfaces. It is not a web avatar.

**Why**: Each provider crops and composites differently; choosing by crop shape is what keeps the mark whole and on its intended background.

### 7. Supporting Identity Fields

Wherever a provider asks for these, use the same values.

| Field                          | Production                                                                 | Staging                            |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------- |
| Homepage / application URL     | `https://tau.new`                                                          | `https://taucad.dev`               |
| Privacy policy                 | `https://tau.new/legal/privacy`                                            | `https://taucad.dev/legal/privacy` |
| Terms of service               | `https://tau.new/legal/terms`                                              | `https://taucad.dev/legal/terms`   |
| Documentation                  | `https://docs.tau.new`                                                     | n/a                                |
| Source repository              | `https://github.com/taucad/tau`                                            | same                               |
| Support contact shown to users | `help@tau.new`                                                             | `help@taucad.dev`                  |
| Transactional sender           | `Tau <identity@tau.new>`                                                   | `Tau <identity@taucad.dev>`        |
| Owner of every registration    | The `taucad` organization or the company account, never a personal account | same                               |

### 8. Record What Is Registered

Every external registration that carries the brand is listed, with its provider, owner and current values, in the brand surface inventory (`docs/research/brand-consistency-rollout-blueprint.md`) until the cloud handbook's service pages own it. Change this policy first, then the surfaces: a console edit that introduces a value this policy does not list is drift.

A change to an approved name, description, colour or asset is a policy change. It is reviewed as a pull request to this file and then rolled out to every surface in the inventory in the same piece of work.

**Why**: Provider consoles are not in version control; the inventory is the only way to know the set is complete.

### 9. Sub-Brands and Third-Party Marks

Sibling open-source projects published by the `taucad` organization (for example GeoSpec, PicoVoxel, nanoraster) keep their own names and descriptions. They do not use the Tau mark as their logo; where attribution is wanted, use the plain text "by Tau".

Use another company's mark (GitHub, Google, Stripe, model providers) only as that company's brand guidelines allow, and only to identify their service: a sign-in button, a provider label. Never combine the Tau mark with another mark into one lockup.

## Anti-Patterns

- **Operator vocabulary on a user surface.** "Prod US", "staging cutover", workspace or stack names in an application name or description.
- **Describing the plumbing.** "Tau authentication", "OAuth client for Tau", "Gist integration".
- **A second spelling.** "TauCAD", "Tau CAD", "tau.new" used as the product name in a display-name field.
- **Console-first edits.** Changing a name, logo or colour in a provider console without this policy and the inventory changing first.
- **The wrong crop.** The full-bleed installed-app icon or the desktop tile uploaded as an avatar; the wordmark squeezed into a square field.
- **An identicon or default avatar** left on any registration a user or the public can see.
- **Hardcoded brand hex in product code** instead of tokens.

## Summary Checklist

- [ ] The display name is `Tau`, or `Tau <Environment>` outside production
- [ ] The description is the tagline or standard description verbatim, plus at most one approved purpose sentence
- [ ] No environment, region, scope name or internal label appears in user-visible text
- [ ] The logo is the avatar that matches the platform's crop, on `#ffffff` or transparent with the background set to `#ffffff`
- [ ] Colour fields use the values in rule 5
- [ ] Homepage, privacy, terms and support values match rule 7
- [ ] The registration is owned by the organization and listed in the brand surface inventory

## Known Limitations

- Some platforms require a globally unique application name, so the bare name `Tau` may be unavailable; rule 2 gives the fallback.
- Card networks require a statement descriptor of 5 to 22 characters, so the bare name is too short; `TAU.NEW` is the approved form.
- Google shows a consent-screen name and logo only after brand verification, and re-verifies after a change; batch changes to that surface.
- There is not yet a checked-in avatar flattened on white or a GitHub-sized repository social preview; the rollout blueprint tracks adding them.

## References

- [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) and [creating a custom badge](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-a-custom-badge-for-your-oauth-app) (GitHub): description shown to authorizing users; square logo in a circular badge with a background colour
- [Manage OAuth app branding](https://support.google.com/cloud/answer/15549049) and [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) (Google)
- [Branding your Stripe account](https://docs.stripe.com/get-started/account/branding) (Stripe): icon, logo, brand and accent colours and where each appears
- Related: `docs/policy/design-policy.md`, `docs/policy/color-policy.md`
- Inventory and rollout: `docs/research/brand-consistency-rollout-blueprint.md`
