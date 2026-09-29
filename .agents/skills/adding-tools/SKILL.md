---
name: adding-tools
description: Add or change a Tau CAD chat tool across its shared schema, host registry, RPC, chat presentation, and optional MCP or skill surfaces. Use when implementing a new agent tool or changing its wire-visible contract.
---

# Adding Tau agent tools

First trace the tool's actual callers and owners. Reuse an existing tool or RPC when it expresses the same operation. A new tool name, schema, description, outcome, or error code requires an operator-approved Section 0 API design guide through [create-api](../create-api/SKILL.md) and [create-ts-api](../create-ts-api/SKILL.md) before implementation ([library API policy](../../../docs/policy/library-api-policy.md)). Apply [context engineering](../../../docs/policy/context-engineering-policy.md) to the description and follow the root-to-path `AGENTS.md` chain and concern policies. The [`arrange_workbench` guide](../../../docs/research/artifacts/programmable-workbench-charter/api/index.md) is an example, not a reusable schema.

The host-neutral route is `libs/chat` contract → `libs/agent-tools` registry → `packages/agent-host` log → host composition → `apps/ui` presentation. The API is not the CAD tool executor. File and record changes use the owning filesystem and RPC authority. Choose only the entries that the tool actually needs; keep the numbered inventory so a cross-surface tool cannot silently omit a grant or presentation step.

## Registration inventory

1. Add the permanent name to [`toolName`](../../../libs/chat/src/constants/tool.constants.ts); `toolNames` also feeds tool-choice validation.
2. Add the provider-facing description to [tool descriptions](../../../libs/chat/src/constants/tool-description.constants.ts). This map is not exhaustive; test its entry.
3. Define bounded input and output in [chat tool schemas](../../../libs/chat/src/schemas/tools/). Reuse domain schemas from their owning package.
4. Export the schemas from [chat's barrel](../../../libs/chat/src/index.ts). Add a [package export](../../../libs/chat/package.json) only for a real subpath consumer.
5. Register input and output in [`uiMessageTools`](../../../libs/chat/src/schemas/tool-input.registry.ts), which validates durable parts and heals interrupted input.
6. Add the typed entry to [`MyTools`](../../../libs/chat/src/types/tool.types.ts).
7. Add an offered CAD tool to [`cadProviderFacingToolNames`](../../../libs/chat/src/schemas/provider-tool-schemas.ts). The grant controls provider schemas and registry listing; absence makes the tool unavailable.
8. For a new RPC, add its name and exact read/mutate partition in [RPC constants](../../../libs/chat/src/constants/rpc.constants.ts). The partition test must remain exhaustive.
9. Define its input, success and failure schemas with `defineRpc` in [RPC schemas](../../../libs/chat/src/schemas/rpc.schema.ts); register the type and value there.
10. Implement and test the operation in [RPC handlers](../../../libs/chat/src/rpc/handlers/). Preserve trust-boundary validation and owning filesystem semantics.
11. Export the handler from [RPC's barrel](../../../libs/chat/src/rpc/index.ts).
12. Dispatch it through the typed map in [`rpc-dispatcher`](../../../libs/chat/src/rpc/rpc-dispatcher.ts); add only the dependencies it needs in [`rpc-dependencies`](../../../libs/chat/src/rpc/rpc-dependencies.ts).
13. Map tool to RPC and required client in [`rpcForTool`](../../../libs/agent-tools/src/registry/tool-registry.ts). Put record writes in `recordRpcNames` so they use the record authority; `arrange_workbench` uses its live-root workbench filesystem.
14. Wire any new dependency at each applicable host: [browser worker](../../../apps/ui/app/workers/agent-host.impl.ts), [Node registry](../../../packages/host/src/agent-tools.ts), [desktop utility](../../../apps/desktop/src/tau/services-host.impl.ts), and [daemon](../../../packages/host/src/host-daemon.ts). Check browser, desktop, daemon and ACP availability separately.
15. Add the kind to [`tauToolKinds`](../../../packages/agent-host/src/harness/tools.ts) so the durable top-level `call` fact classifies the tool. Add path normalization only for actual path fields.
16. Build an observable card in [chat route components](../../../apps/ui/app/routes/w.$workspace.$project/) and select it in [`chat-message.tsx`](../../../apps/ui/app/routes/w.$workspace.$project/chat-message.tsx). Reuse the current card primitives and owning page/controller state.
17. Add the exhaustive copy/compaction serializer in [`toolSerializers`](../../../apps/ui/app/utils/chat.utils.ts).
18. Classify both static and qualified external names in [assistant activity](../../../apps/ui/app/utils/assistant-message-activity.ts); test the visible family.
19. When a tool writes a person-visible record, connect the owning UI reader and live adoption surface. For workbench records see [workbench record host](../../../apps/ui/app/routes/w.$workspace.$project/workbench-record-host.tsx); do not add a second store.
20. Teach the workflow briefly in [the CAD prompt](../../../libs/chat/src/prompts/cad-agent.prompt.ts) when model choice depends on it. Keep the full schema and description at their owners.
21. Test the provider schema and grant, registry invocation, RPC outcome, durable call facts, card, and one real host path. [Provider compatibility tests](../../../libs/chat/src/schemas/provider-tool-schema-compat.test.ts) cover provider-safe JSON Schema. Update the deliberate `toolChoice` snapshot in [the API schema test](../../../apps/api/app/api/chat/chat.controller.json-schema.test.ts), check the [CAD prompt budget test](../../../libs/chat/src/prompts/cad-agent.prompt.test.ts), and use [the scripted chat gateway precedent](../../../apps/ui-e2e/src/chat-todo-list.spec.ts) for a visible end-to-end turn.
22. If approved for external agents, add the exact name to [`hostMcpAllowedTools` and `hostMcpRegistryTools`](../../../packages/host/src/mcp-server.ts). The signed claim, registry listing and `invokeAllowed` dispatch must agree; no whole-registry exposure.
23. Add canonical input/output normalization in [`tauMcpSchemas`](../../../packages/host/src/acp/session.ts). Qualified ACP calls then retain external attribution while using the native family; add the [`tau-mcp` card switch](../../../apps/ui/app/routes/w.$workspace.$project/chat-message.tsx) and test real result envelopes.
24. Review [agent-host compaction](../../../packages/agent-host/src/harness/compaction.ts) and [safeguards](../../../packages/agent-host/src/harness/safeguards.ts) only if this tool's actual behavior requires them.
25. If taught by a packaged skill, author `agent/skills.json` and its manifest-selected `agent/<directory>/SKILL.md` in the owning package, set `tau.skills` in its package manifest, add it to [`skillOwners`](../../../packages/skills/src/skill-bundles.ts) and [resource aggregation](../../../packages/skills/src/resources.ts), and generate `agent/resources.js` through the existing package workflow.
26. Recheck the approved API guide and its real consumer call sites before acceptance. Verify names, schema, descriptions and failure behavior match the guide across native and MCP carriers.

MCP annotations describe the effect of each tool. [`hostToolOf`](../../../packages/host/src/mcp-server.ts) derives existing defaults and applies per-tool exceptions; `arrange_workbench` is `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. A signed MCP grant permits only its named tools during an active turn. It never grants arbitrary file/shell operations, skill listing, generic UI automation or person-only host actions.

## Verify

Use `pnpm nx show project <project>` for actual targets, then focused Nx lint, test and typecheck on changed owners. Run `pnpm nx run scripts:validate-agent-config` for skill or instruction changes. Check every local path cited above still exists with `git ls-files --error-unmatch <path>`, or `test -d <directory>` for directory links. For an external tool, check `tools/list` annotations, signed grant, `invokeAllowed`, ACP normalization and the visible card through a real mounted MCP route.
