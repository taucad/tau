---
title: 'Runtime Issue Policy'
description: 'Copy rules for every human- or agent-readable message @taucad/runtime emits: fact plus stable code in runtime issues, remediation owned by the audience-aware layer, no UI affordances or destructive advice from library code.'
status: active
created: '2026-08-13'
updated: '2026-08-13'
related:
  - docs/research/runtime-issue-copy-migration.md
  - docs/research/runtime-stage-review-closeout-charter.md
  - docs/policy/library-api-policy.md
---

# Runtime Issue Policy

Internal reference for authoring every human- or agent-readable string produced by `@taucad/runtime` — `KernelIssue` messages, thrown error copy that crosses the protocol, and typed error classes.

## Rationale

Runtime issue copy is load-bearing for the agentic loop: `KernelIssue.message` travels byte-for-byte from the library literal through the client, the UI machine, the RPC layer, and the API tool result into the model's context — no layer rewrites it. A message written for one audience therefore misguides the others: "Increase the timeout in viewer settings" names an affordance only the Tau viewer has (the agent has no such tool; library consumers have no viewer), and "simplify the model geometry" is a destructive instruction an agent will execute — directly contradicting the CAD agent's own prompt doctrine against removing detail to make checks pass. The fix is structural, not editorial: the library states facts and stable codes; the layer that knows its reader (prompt, app UI, docs) owns remediation, keyed by code.

## Rules

### 1. Know the Audience Channel Before Writing

Every runtime-emitted string belongs to exactly one channel, and each channel has different licence to prescribe:

| Channel               | Reader                                                          | Example surface                                          | Licence                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoring boundary    | Library/plugin developer holding the code                       | `defineKernel` validation throws, transport setup errors | Fact + fix, may name the library's own APIs (library-api-policy §19 unchanged)                                                                                 |
| Consumer error class  | Runtime consumer developer                                      | `RenderTimeoutError`, `RuntimeTerminatedError`           | Fact + stable `code` getter; next steps only in the library's own vocabulary (`setRenderTimeout`, "construct a new client") — never app or workflow vocabulary |
| Runtime issue payload | Unknown: AI agent in loop, end user in viewer, generic consumer | `KernelIssue` on results and `error` events              | **Fact + code only.** No remediation                                                                                                                           |
| App-mapped copy       | End user in a specific app                                      | Viewer overlay, Monaco markers                           | The app maps `code` → its own copy; library text is only the neutral fallback                                                                                  |

**Why**: The runtime-issue channel has an unknown reader by construction; any remediation baked into it is wrong for at least one audience and stales silently.

### 2. Fact Plus Stable Code Is the Runtime-Issue Contract

A runtime issue message states what happened with its factual parameters; the paired `code` (from the canonical `KernelIssueCode` registry or the error class's `code` getter) is the machine contract. Behavior branches on code, never on message text. Rewording a message is never a breaking change; changing a code is.

CORRECT:

```typescript
{
  message: `Render timed out after ${renderTimeout} ms.`,
  code: 'RENDER_TIMEOUT',
  type: 'runtime',
  severity: 'error',
}
```

INCORRECT:

```typescript
{
  message: 'Render timed out. Increase the timeout in viewer settings or simplify the model geometry.',
  code: 'RENDER_TIMEOUT', // fact is buried under cross-audience advice
}
```

### 3. Remediation Lives in the Layer That Knows the Reader

Guidance is owned per audience, keyed by `code`:

| Reader             | Owning layer                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI agent           | `apps/api` prompt/skill layer (e.g. the CAD agent's `<error_handling>` section maps `RENDER_TIMEOUT` → diagnose cost at its source, never degrade design intent) |
| End user           | App UI copy mapped from `code` at the display site                                                                                                               |
| Consumer developer | Typed error class + the docs error-code table                                                                                                                    |

**Why**: Each layer can be tuned, tested, and versioned for its reader; a library literal cannot. When a runtime message is demoted to fact-only, verify the agent prompt layer actually carries the remediation — moving guidance means landing it at the destination, not deleting it.

### 4. Never Reference UI Affordances from Library Code

Library-emitted strings must not name viewer settings, panels, buttons, menus, or any app affordance. The library cannot know which app — if any — is present.

### 5. Never Prescribe Destructive Remediation

Advice verbs that reduce fidelity or user intent — "simplify", "remove detail", "reduce geometry", "weaken", "drop", "delete" — are forbidden in any channel an agent can read. An agent treats message text as instruction and will execute it.

**Why**: The CAD agent's system prompt forbids removing detail or reducing geometry to make checks pass; a library message suggesting exactly that sets the two sources against each other inside the model's context.

### 6. Enumerating Valid Alternatives Is a Fact, Not Guidance

Listing what IS supported is factual and encouraged — it lets every audience act without prescribing an action.

CORRECT:

```typescript
`Content property "${property}" is not supported by this route; supported properties: ${supported.join(', ')}.`;
`Kernel "${id}" not found. Available kernels: ${available.join(', ')}.`;
```

### 7. No Speculative Diagnosis, No Filler

State the observation, not a guess about its cause ("Render timed out after 30000 ms.", not "Your model is too complex."). Drop courtesy filler ("Please …") when touching a message.

### 8. One Producer per Message

A message that can be emitted from more than one site is single-sourced (a shared factory or constant beside its error class). Duplicated literals drift — the render-timeout pair existed as two pasted copies with no type linkage.

CORRECT:

```typescript
/** Fact-only render-timeout issue. @param renderTimeout - Deadline that elapsed. Milliseconds. */
export const renderTimeoutIssue = (renderTimeout?: number) =>
  ({
    message: renderTimeout === undefined ? 'Render timed out.' : `Render timed out after ${renderTimeout} ms.`,
    code: 'RENDER_TIMEOUT',
    type: 'runtime',
    severity: 'error',
  }) as const satisfies KernelIssue;
```

## Anti-Patterns

- Remediation in a `KernelIssue` payload (any advice at all — the reader is unknown).
- UI affordances from library code ("viewer settings", "click", "panel").
- Destructive verbs as advice in agent-readable channels.
- Guidance keyed to another audience's capabilities (telling an agent to change a setting only humans can reach).
- Duplicated message literals across producers.
- Layers that rewrite or discard typed codes in transit (synthesizing a generic code from a typed error erases the contract the prompt layer keys on).

## References

- Related: `docs/policy/library-api-policy.md` §19 — stays authoritative for authoring-boundary errors; this policy governs the runtime-operation channel §19 does not cover. Same fact-first sentence shape; different licence to prescribe.
- Research: `docs/research/runtime-issue-copy-migration.md` (full audit: consumption-path proof, the dead worker-side duplicate, and the one violating message pair found in the package).
