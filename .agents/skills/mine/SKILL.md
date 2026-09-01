---
name: mine
description: Orchestrates deep exploration of an external technology ecosystem — clones repos, deploys parallel subagents for source analysis, and creates a research document. Use when asked to deeply mine, evaluate an external technology, explore an ecosystem, leave no stone unturned, or compare an external approach against Tau.
disable-model-invocation: true
---

# Technology Mining

Deep-dive into an external technology ecosystem to extract architectural patterns, browser standards, performance techniques, and integration opportunities for Tau.

## Workflow

### Step 1: Identify Targets

Gather from the user message:

- **Repos to clone**: GitHub URLs, `owner/repo` slugs, or blog post references
- **Group tag**: Which `repos.yaml` group these belong to (or create a new group)
- **Mining scope**: What to extract — architecture, browser APIs, performance patterns, build systems, API design, POSIX compliance, etc.
- **Integration target**: Which Tau system the findings relate to (filesystem, runtime, AI, rendering, etc.)

If the user provides blog posts or documentation URLs, fetch them with WebFetch before cloning repos.

### Step 2: Clone Repos

Use the `repos` skill to add and clone all identified repos:

```bash
pnpm repos add <owner/repo> -g <group> --clone
```

If repos are already tracked in `repos.yaml`, just clone:

```bash
pnpm repos clone <name>
```

### Step 3: Deploy Parallel Subagents

Launch one subagent per repo or major aspect using the Task tool with `subagent_type="generalPurpose"`. Each subagent receives a focused mining brief:

```
Prompt template per subagent:
  Deeply explore <repos/name> to extract:
  1. Architecture: module structure, dependency graph, key abstractions
  2. Browser APIs: which Web APIs are used and how (OPFS, SharedArrayBuffer, WebAssembly, IndexedDB, etc.)
  3. Performance patterns: caching, lazy loading, zero-copy, batching, pooling
  4. Build system: toolchain, WASM compilation flags, bundle strategy
  5. API design: public surface, DX patterns, error handling
  6. Testing: test infrastructure, coverage approach

  Key files to start with: README, package.json, src/index.*, core/*, lib/*

  Return a structured report with numbered findings (F1, F2, ...) and
  specific file:line references for each claim.
```

Adjust the mining dimensions based on the user's scope. Run subagents in parallel (multiple Task calls in one message).

### Step 4: Fetch External Context

In parallel with subagent exploration, fetch any blog posts, documentation pages, or GitHub issues the user referenced:

```
Use WebFetch for each URL, extract:
- Architecture diagrams or descriptions
- Performance claims with numbers
- API examples
- Browser compatibility notes
```

### Step 5: Synthesize Findings

After all subagents return:

1. **Merge findings** across repos into a unified analysis, grouping by theme (architecture, performance, browser APIs, etc.)
2. **Cross-reference against Tau**: For each finding, assess relevance to Tau's architecture — read the relevant Tau source files to compare approaches
3. **Classify each finding**:

| Classification | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| **Adopt**      | Integrate the technology directly into Tau                     |
| **Adapt**      | Apply the pattern/principle within Tau's existing architecture |
| **Reference**  | Useful knowledge but no immediate action needed                |
| **Skip**       | Not applicable to Tau's constraints                            |

4. **Fit assessment**: Explicitly evaluate whether direct integration is viable. Consider: bundle size impact, architectural alignment, multi-tab/worker compatibility, maintenance burden, and licensing.

### Step 6: Create Research Document

Use the `create-research` skill conventions to produce `docs/research/<topic>.md`:

- Category: `reference` (for ecosystem documentation) or `comparison` (for fit assessments)
- Include numbered findings (F1-FN) with file:line evidence from the mined repos
- Include a **Tau Alignment Analysis** section comparing each finding against Tau's current approach
- Include a **Recommendations** table (R1-RN) with Priority/Effort/Impact columns
- Run `pnpm docs:validate` to verify frontmatter

## Composing Skills

| Skill             | Role in Mining                       |
| ----------------- | ------------------------------------ |
| `repos`           | Clone and manage external repos      |
| `create-research` | Document findings in standard format |

## Anti-Patterns

- **Shallow mining**: Reading only README files. Subagents must explore source code, not just documentation.
- **Ungrounded claims**: Every finding must cite a specific file and line from the mined repo.
- **Missing fit assessment**: Always evaluate adopt vs. adapt — never assume integration is the right answer.
- **Skipping Tau comparison**: Findings without cross-reference to Tau's current approach are not actionable.

## Example Invocation

User: "deeply mine the entire Turso database ecosystem for best practices in databases and filesystems"

Agent actions:

1. Fetch blog posts via WebFetch
2. `pnpm repos add tursodatabase/turso -g dev-tools --clone`
3. `pnpm repos add tursodatabase/agentfs -g dev-tools --clone`
4. Deploy 3 subagents: Turso core (WASM, VFS, page cache), AgentFS (POSIX, SQLite schema, CoW overlay), database-wasm (browser runtime, SharedArrayBuffer)
5. Synthesize into `docs/research/turso-fs.md`
