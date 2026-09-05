---
title: 'MCP Tool Budget Policy'
description: 'Select and verify native development capabilities by workflow need and measured context cost across Codex and Claude.'
status: active
created: '2026-05-13'
updated: '2026-09-05'
related:
  - docs/policy/agents-md-policy.md
  - docs/policy/context-engineering-policy.md
  - docs/policy/tool-output-location-policy.md
  - docs/research/cursor-context-budget-audit.md
---

# MCP Tool Budget Policy

Internal reference for development-host capabilities, native configuration and measured context cost. Tau's product MCP integrations are governed by their product owners.

## Rationale

Unused tool schemas compete with task context; identical workflows do not require identical native configuration. Select the smallest existing capability set that completes the actual task and measure what the current host loads. Historical IDE tool counts and limits do not establish limits for Codex or Claude.

## Rules

### 1. Start from the required operation

Identify the operation, its canonical skill and available native tool/CLI before adding a server. Reuse the installed capability that already covers it. A connected tool, an authenticated CLI or a local source checkout can be an appropriate implementation; merely listing a server does not prove it works.

The shared development harness requires no always-on project MCP server. Shared instruction and skill discovery works without MCP. Enable an additional server only for a demonstrated current workflow need, with a named owner and a bounded native verification.

### 2. Measure the actual host context

Use the host's available context report and observable loaded instructions, tool descriptors and skill metadata. Separate startup material from on-demand bodies and tool results. Record host/version, task, relevant sources and measurement method; label estimates and missing observability.

There is no universal 25- or 40-tool limit in this policy and no fixed token-per-tool estimate. Remove redundant capability registration before trimming useful guidance. For a server Tau owns, keep task selection and input/permission boundaries in the descriptor; move lengthy procedure detail to its canonical skill. Do not strip authorization or trust guidance to save tokens.

Use `audit-agent-context` for this review. Skill invocation remains enabled by default; hiding useful skills is not a context-optimization strategy.

### 3. Preserve native permissions and trust

Use each host's supported configuration, approval and authentication flows. Do not copy credentials, change global settings, auto-install plugins or weaken native permissions as part of project setup. An unavailable account or unapproved tool is an unavailable capability, not proof of parity.

When a shared server is actually retained, document one intent and its small native encodings: Claude `.mcp.json` and Codex `.codex/config.toml`. Verify their command/URL/arguments/environment variable names consistently using existing validation tooling. Store secrets only in the host's existing credential mechanism and never print their values in evidence. Do not introduce a universal MCP configuration schema.

### 4. Prefer portable workflow inputs and outputs

Skills name the needed operation and choose an available supported tool rather than promising a particular IDE tool namespace. Browser audits use an available browser capability or the existing Playwright audit scripts; snapshots, screenshots, console/network evidence and viewport checks retain the same meaning.

Source/component work starts from the checked-in package or its official documentation. Nx discovery/tasks/code generators use the workspace's pnpm-prefixed Nx CLI. Git/GitHub work can use available native tools or the existing Git/gh CLIs within current authorization. An optional documentation server is not a prerequisite for understanding ordinary Tau source.

### 5. Keep the legacy capability dispositions explicit

These entries describe the migration's default-project disposition, not changes to personal/global plugins:

| Former entry                           | Shared-harness disposition                                            | Current route                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `langgraph-docs-mcp`                   | Retired from default; optional for actual LangGraph work              | Current source and official LangGraph documentation through `langgraph`; ordinary Tau CAD-agent work starts at agent-host |
| `@magicuidesign/mcp`                   | Retired; no mandatory current consumer                                | Existing Tau components, DESIGN and the relevant source/docs                                                              |
| `shadcn/animate-ui`                    | Retired; no mandatory current consumer                                | Existing components and selected official registry/docs when needed                                                       |
| `shadcn`                               | Retired from default; add on demand only for a demonstrated operation | `packages/ui` and its current component workflow                                                                          |
| `browser-tools`                        | Retired duplicate browser stack                                       | Available native browser or existing Playwright audit scripts                                                             |
| `chrome-devtools`                      | Retired duplicate default server                                      | Available native browser or a deliberately selected diagnostic capability                                                 |
| `ai-sdk-5-migration`                   | Retired one-off migration server                                      | Current source and official AI SDK documentation                                                                          |
| `continual-learning` plugin activation | Retired host-specific activation                                      | Shared `update-agent-memory` promotion with provenance and exclusive ownership                                            |
| `stripe` plugin activation             | Retired default flag                                                  | Existing product Stripe SDK remains; external administration requires its separately authorized capability                |

No replacement server, hook or plugin is installed solely to preserve a legacy count. Existing personal capabilities remain the operator's choices.

### 6. Verify retained behavior before claiming parity

For every required operation, execute a harmless native tool/CLI action on each supported host and retain the result. Check meaningful output or an observable file/event, not a configuration listing or a model's assertion. Use disposable fixtures where useful, preserving commands, versions, source/config fingerprints and limitations with the program's evidence owner.

Test trust or permission behavior only through supported native mechanisms. If a workflow requires a hook, verify its exact event and handler; do not build placeholder hooks or an all-events adapter. Mark unavailable cases unverified and retain a concrete restart point.

## References

- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)
- [Claude MCP configuration](https://code.claude.com/docs/en/mcp)
- The linked historical context audit preserves its original IDE-specific observations; it does not define current host limits.
