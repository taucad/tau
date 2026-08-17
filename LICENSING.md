# Licensing

Tau is a single repository holding software under more than one license. Licenses attach to works, not to
repositories: each package, application, and library carries its own `LICENSE` file and its own `license` field in
`package.json`, and that is the license that governs it. This document is the routing map.

The root [`license`](license) file is the plain Apache-2.0 text. It governs the repository's default surface — every
published `@taucad/*` package, the `geospec` spec package, and everything else not routed elsewhere below.

## The license families

| Family           | License                                                   | What it covers                                                                                                      | Status                                                                               |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Perimeter**    | `Apache-2.0`                                              | Every published package, the `geospec` spec package, internal libraries, tooling, examples, and the repository root | Open source (OSI)                                                                    |
| **Engine**       | `FSL-1.1-Apache-2.0`                                      | `@taucad/geospec-engine` and successor engine artifacts                                                             | **Fair source / source-available** — becomes Apache-2.0 two years after each release |
| **Applications** | `AGPL-3.0-only` (+ additional permission under section 7) | `apps/ui`, `apps/api`, and the app-side libraries                                                                   | Open source (OSI)                                                                    |
| **Kernel**       | `GPL-2.0-or-later`                                        | `packages/kernels/openscad` (`@taucad/openscad`), which bundles GPL OpenSCAD WASM                                   | Open source (OSI)                                                                    |

Two of these families are Tau-authored (Apache-2.0 and AGPL-3.0-only; the engine's FSL converts into the first). The
GPL kernel row is inherited from an upstream dependency, not a Tau licensing choice.

The engine is **fair source**, also called source-available: the code is published and readable, but the license
forbids one class of use. It is deliberately **not** open source, and Tau does not describe it as open source. Every
other Tau-authored license in this repository is open source.

## Per-directory routing

| Path                                                                                                                           | License                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `license` (root), `packages/*` except `packages/geospec-engine`, and anything not listed below                                 | `Apache-2.0`                                      |
| `packages/geospec-engine`                                                                                                      | `FSL-1.1-Apache-2.0`                              |
| `libs/*` except the app-side libraries below, `scripts`, `tools/*`, `apps/*` except `apps/ui` and `apps/api`, and `examples/*` | `Apache-2.0` (private, not published)             |
| `apps/ui`, `apps/api`                                                                                                          | `AGPL-3.0-only` + section 7 additional permission |
| `libs/{billing,chat,lsp,lsp-fs,api-extractor}`                                                                                 | `AGPL-3.0-only` + section 7 additional permission |
| `packages/kernels/openscad`                                                                                                    | `GPL-2.0-or-later`                                |

Third-party dependency licenses are inventoried separately in [`license-deps`](license-deps).

## The engine: fair source, converting to Apache-2.0

`@taucad/geospec-engine` is licensed under the
[Functional Source License, Version 1.1, Apache 2.0 Future License](packages/geospec-engine/LICENSE)
(`FSL-1.1-Apache-2.0`). In plain terms:

- **You may use it for any purpose except a Competing Use.** Internal use and access — including inside a commercial
  organisation, in CI, and on paid work — is a Permitted Purpose, named explicitly in the license text. So are
  non-commercial education, non-commercial research, and professional services you provide to a licensee.
- **A Competing Use** is making the engine available to others in a commercial product or service that substitutes for
  it, substitutes for another Tau product or service that uses it, or offers substantially similar functionality. That
  is the one thing the license forbids.
- **Each release converts to Apache-2.0 two years after it is made available.** The grant is irrevocable and is part of
  the license text itself. On and after the conversion date, that release may be used under plain Apache-2.0 by anyone,
  for anything.

The conversion date is not folklore: every engine release publishes a provenance record — schema at
[`packages/geospec-engine/provenance.schema.json`](packages/geospec-engine/provenance.schema.json) — carrying the
release date, the license, the `apacheConversionDate` (release date + 2 years), and the digest of every artifact in the
release.

## The applications: AGPL plus a section 7 additional permission

`apps/ui`, `apps/api`, and the app-side libraries are AGPL-3.0-only. Their `LICENSE` files carry the full, unmodified
GNU AGPL v3 text, followed by an **additional permission under AGPL section 7**, in the style of the GNU Classpath
exception.

Why it exists: the applications combine with the GeoSpec engine, which is under a different, non-copyleft license.
AGPL section 5 and section 13 require the whole combined work to be licensable under the AGPL, and a linked FSL
component would otherwise read as a "further restriction". As sole copyright holder, Tau grants permission to combine,
convey, and network-deploy the AGPL applications together with the FSL-licensed engine. The engine remains governed
solely by its own license.

What it is not: the permission **only adds rights**. It imposes no term or condition on top of the AGPL and restricts
nothing the AGPL permits. Remove the permission and you are left with the plain AGPL — that is the test AGPL section 7
sets for an additional permission, and this text passes it deliberately. Stacking extra restrictions on AGPL text
produces a proprietary license wearing an open-source costume; Tau does not do that. Uses that the permission does not
reach are handled by a separate commercial license, not by editing the AGPL.

## The OpenSCAD kernel: GPLv3 election

`@taucad/openscad` bundles OpenSCAD WASM under **GPL-2.0-or-later**, and the package itself is published under
GPL-2.0-or-later for clarity. "Or later" is what makes the combination clean: **Tau elects GPL version 3 for this
component when it is combined with the AGPL-3.0-only applications.** GPLv3 section 13 and AGPLv3 section 13 grant each
other mutual linking permission, so an AGPLv3 application may link a GPLv3 work and vice versa. No exception clause is
needed — only this election, recorded here.

A distribution that includes `@taucad/openscad` is a GPL combined work and must satisfy the GPL terms (source
availability — already satisfied by this public repository — and shipping the GPL text alongside the WASM). A
distribution that excludes it carries no GPL obligation.

## Internal-use FAQ

**Can I run GeoSpec on my company's designs, for free?**
Yes. Internal use and access is a Permitted Purpose named in the FSL text. Commercial companies, paid engineering work,
production CI pipelines, consultants working for clients — all permitted, at no cost, with no agreement to sign.

**Does the engine's license attach to my specs, my models, or my verdicts?**
No. Your authored `*.geospec.ts` files import the Apache-2.0 `geospec` package only — no engine code enters them. Your
CAD models are inputs to the engine, not derivatives of it. Verdicts and evidence are program output describing _your_
geometry. Running a tool over your work does not license your work: no license in this repository — not the FSL, not
the AGPL — reaches your specs, your models, or your verdicts.

**Can I embed Tau, or GeoSpec, in my product?**
The perimeter packages are Apache-2.0: embed them anywhere, including in closed-source and commercial products. The
engine may be embedded too, as long as the product is not a Competing Use — that is, as long as you are not selling
something that substitutes for the engine or for a Tau offering built on it. If you are unsure whether your product is
a Competing Use, ask; the answer is usually short.

**What exactly is forbidden, then?**
Offering the engine, or a substantially similar substitute for it, to others as your commercial product or service.
That is the whole of the restriction. Everything else the license text grants you.

**Is the engine open source?**
No. It is fair source (source-available), and it converts to Apache-2.0 two years after each release. The rest of the
Tau stack is open source today.

**What about versions already published under MIT?**
They stay MIT. Every version of every package already published to npm, and every commit already pushed, remains under
the license it carried at that moment — this relicensing applies to future versions only. It does not, and cannot,
retroactively change what was already released.

**Do I need a commercial license?**
Only for a Competing Use of the engine, or for uses the AGPL section 7 permission does not reach. Contact
**support@tau.new** for commercial licensing.

## Notes

- **Counsel review pending.** The AGPL section 7 additional-permission text in this repository is a first draft by the
  Tau project and is scheduled for a one-time review by external open-source counsel, together with the FSL adoption
  and the contributor-agreement package. It is published in good faith in the meantime.
- **Contributions.** Tau is currently the sole copyright holder. A contributor license agreement will be in place
  before any external contribution is merged into relicensable code.
- **Trademarks.** No license in this repository grants rights in Tau's names, logos, or marks. FSL section "Trademarks"
  and Apache-2.0 section 6 both exclude them expressly.
