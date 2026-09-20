---
title: 'Netlify Function region (single-region tradeoff)'
description: Documents the Netlify Terraform `functions_region` field and why Tau stays on a single AWS region for SSR Functions, with future multi-PoP options.
status: active
created: '2026-05-06'
updated: '2026-09-20'
category: architecture
related:
  - docs/research/netlify-production-performance-audit.md
  - docs/architecture/ui-deployment-topology.md
---

# Netlify Function region (single-region tradeoff)

## Decision

Tau keeps **one Netlify site per environment** with **standard SSR Functions (Node.js Lambda) in a single AWS region**. Distant-PoP latency on cacheable SSR routes is addressed with **Durable / Edge cache** headers (`cdnBackedSsrRouteHeaders` on `/` and `/v/:id`) rather than multi-region Lambda.

## Terraform reality

The Netlify Terraform resource [`netlify_site_build_settings`](https://registry.terraform.io/providers/netlify/netlify/latest/docs/resources/site_build_settings) exposes **`functions_region`** as a **single string**, not a list. Each Netlify site therefore deploys its Functions bundle to **one** region per configuration change.

Which region each Tau environment runs in, and the post-apply check that proves it moved, are operational: they live in Tau's private operations handbook at `docs/handbooks/cloud/system/services/ui.md`, maintained with the `create-handbook` skill. That path resolves only in a checkout that has the private handbook.

## Future options if single-region becomes a bottleneck

These are **out of scope** for the current iteration; capture here so infra discussions do not assume a non-existent Terraform `function_regions[]`.

| Option                                 | What it buys                                                   | Trade-off                                                                                      |
| -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Netlify Edge Functions**             | Globally distributed SSR-like logic at the edge (Deno runtime) | Large application change — React Router / Node SSR entry does not drop in unchanged.           |
| **Per-region Netlify sites + geo DNS** | True multi-region Lambda close to users                        | Multiple sites, builds, deploys, and Terraform stacks per region; operational cost multiplies. |

Keep the SSR bundle small (`docs/policy/ssr-bundle-policy.md`) before expanding footprint: multi-region or edge migrations do not remove the need for lean cold-start payloads.
