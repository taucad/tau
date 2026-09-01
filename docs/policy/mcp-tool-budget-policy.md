---
title: 'MCP Tool Budget Policy'
description: 'Per-server MCP tool retention list to keep the Cursor Tools layer under the 40-tool ceiling and reclaim context budget'
status: active
created: '2026-05-13'
updated: '2026-05-13'
related:
  - docs/research/cursor-context-budget-audit.md
  - docs/policy/agents-md-policy.md
---

# MCP Tool Budget Policy

Internal reference for which MCP tools to keep enabled in Cursor's per-server settings to stay under Cursor's 40-tool ceiling and minimize the always-on `Tools` context layer.

## Rationale

Cursor enforces a hard limit of **40 MCP tools per session** (May 2026). Above that ceiling Cursor silently drops the overflow. Each tool schema costs ~50–300 tokens depending on description verbosity; 68 tools across 5 servers (the audited starting state) consumed ~22.4K of the always-on `Tools` budget. Trimming to ~25 active tools restores ~12K tokens to the conversation budget without losing any capability that the workspace actively uses.

This policy enumerates which tools are kept and which are disabled. Disabled tools can be re-enabled per-server through Cursor's settings UI when the workspace genuinely needs them; this list documents the steady-state default.

## Rules

### 1. Stay Under 25 Active MCP Tools

Default ceiling for the Tau workspace. Leaves headroom under Cursor's 40-tool hard limit and reserves capacity for situational additions (e.g., enabling Stripe tools during integration work).

**Why**: Each unused tool taxes the always-on context budget for zero workflow benefit.

### 2. Disable Servers With Zero Authenticated Tools

Servers that ship descriptors but have not completed authentication contribute server-level overhead with no usable tools. Disable them until they are authenticated AND will be used.

**Why**: A server descriptor's `serverUseInstructions` block is loaded even when no tools are reachable.

### 3. Trim Verbose Tool Descriptions At The Source

When a server's per-tool descriptions are paragraph-length playbooks (the dominant cost for `cursor-ide-browser`), trim them to ≤50 words and move detailed playbooks into a Cursor skill that loads only when invoked.

**Why**: Tool descriptions load once per session; skills load only on demand.

### 4. Document Disabled Tools In This Policy

Whenever a tool is disabled at the Cursor settings UI level, record it here with rationale. Re-enabling without updating this policy is a smell — the team should know why a tool is being added back.

**Why**: Without a policy record, disabled tools silently re-accumulate over time and the Tools layer regrows.

## Per-Server Retention List

### `cursor-ide-browser` (browser automation, 26 tools → keep 12)

**Keep**:

| Tool                       | Use case                                        |
| -------------------------- | ----------------------------------------------- |
| `browser_navigate`         | Open a URL                                      |
| `browser_navigate_back`    | Browser history                                 |
| `browser_snapshot`         | Inspect page structure (primary source of refs) |
| `browser_take_screenshot`  | Visual verification                             |
| `browser_click`            | Interact via accessibility refs                 |
| `browser_type`             | Append text or trigger keyboard handlers        |
| `browser_fill`             | Replace input/contenteditable content           |
| `browser_press_key`        | Keyboard shortcuts                              |
| `browser_console_messages` | Diagnose runtime errors                         |
| `browser_network_requests` | Diagnose network issues                         |
| `browser_tabs`             | Manage tab state                                |
| `browser_lock`             | Required by Cursor's lock/unlock workflow       |

**Disable**:

| Tool                                             | Reason                                       |
| ------------------------------------------------ | -------------------------------------------- |
| `browser_drag`                                   | Niche; rarely needed for testing             |
| `browser_fill_form`                              | `browser_fill` covers the common case        |
| `browser_handle_dialog`                          | Re-enable only when testing native dialogs   |
| `browser_highlight`                              | Visual aid; not workflow-critical            |
| `browser_hover`                                  | Re-enable when testing tooltips/dropdowns    |
| `browser_mouse_click_xy`                         | `browser_click` via ref preferred            |
| `browser_profile_start` / `browser_profile_stop` | Re-enable for performance investigations     |
| `browser_resize`                                 | Niche viewport testing                       |
| `browser_scroll`                                 | Re-enable for offscreen-element interactions |
| `browser_search`                                 | Snapshot + grep covers the common case       |
| `browser_select_option`                          | Re-enable for `<select>` automation          |
| `browser_get_bounding_box`                       | Niche layout debugging                       |
| `browser_wait_for`                               | Snapshot polling covers the common case      |

### `user-eamodio.gitlens-extension-GitKraken` (28 tools → keep 8)

**Keep**:

- `git_status`
- `git_log_or_diff`
- `git_blame`
- `git_branch`
- `git_add_or_commit`
- `pull_request_create`
- `pull_request_get_detail`
- `pull_request_get_comments`

**Disable everything else** — `gitkraken_workspace_list`, `gitlens_*` (commit*composer, launchpad, start_review, start_work), `git_checkout`, `git_fetch`, `git_pull`, `git_push`, `git_stash`, `git_worktree`, `git_graph`, `app_tool_box`, `app_update_user_preferences`, `issues*\*`, `pull_request_assigned_to_me`, `pull_request_create_review`, `repository_get_file_content`. These are either redundant with terminal git commands or rarely-used GitKraken-specific affordances.

### `user-nrwl.angular-console-extension-nx-mcp` (13 tools → keep all 13)

All 13 Nx tools (`ci_information`, `ci_task_output`, `nx_*`, `update_self_healing_fix`) stay enabled. The set is already lean and the workspace-wide Nx + Nx Cloud workflows depend on every tool.

### `plugin-stripe-stripe` (1 tool, `mcp_auth`)

**Disable** the entire server unless actively integrating Stripe. The single `mcp_auth` tool is the authentication gate; without authentication the server contributes overhead but no usable tools.

### `user-github` (0 tools registered)

**Disable** the server. The MCP descriptor folder contains only `SERVER_METADATA.json` and `STATUS.md` — no `tools/` directory exists, so the server has not completed registration. `gh` CLI through the shell tool covers GitHub workflows in the meantime.

## Target State

| Server                                       | Before |        After |
| -------------------------------------------- | -----: | -----------: |
| `cursor-ide-browser`                         |     26 |           12 |
| `user-eamodio.gitlens-extension-GitKraken`   |     28 |            8 |
| `user-nrwl.angular-console-extension-nx-mcp` |     13 |           13 |
| `plugin-stripe-stripe`                       |      1 | 0 (disabled) |
| `user-github`                                |      0 | 0 (disabled) |
| **Total**                                    | **68** |       **33** |

Net reclaim: ~10K of the always-on `Tools` budget plus restoration of the ~28-tool overflow that Cursor was silently dropping.

## Application

These changes are made through Cursor's settings UI (per-server tool toggles); they cannot be committed to source control. Treat this policy as the canonical record — when re-installing Cursor or onboarding a new contributor, replay this list.

## Checklist

Before adding a new MCP server or re-enabling a tool:

- [ ] Total active tool count after the change stays under 25
- [ ] Server's `serverUseInstructions` is ≤50 words (or the verbose playbook lives in a Cursor skill)
- [ ] This policy is updated to record the addition with rationale
- [ ] If trimming descriptions, prefer fixing them at the server source rather than disabling tools

## References

- Audit: `docs/research/cursor-context-budget-audit.md`
- Cursor forum: 40-tool ceiling thread (https://forum.cursor.com/t/about-limitation-of-the-number-of-mcp-tools/107844)
