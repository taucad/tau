---
name: create-cloud-project
description: Transmits an approved Tau program from a local coordinator session into a cloud-based project whose agents run it with full autonomy, by finishing the operator-only bootstrap, writing a self-contained resumption file and a short handoff prompt in Tau Brain, and fixing the operator-ping protocol. Use when a charter is approved and the operator asks to hand execution to a cloud project, project agents or a remote session, or to prepare a handoff prompt. Not for creating an Nx workspace project (create-package, create-core, create-plugin), bootstrapping a repository alone (create-repo) or local execution (work-charter).
---

# Create Cloud Project

Move a program from the session that chartered it to a cloud project that will execute it. The cloud project has the connected repositories and GitHub Actions; it does not have the operator's machine, the operator's credentials or this session's context. So the handoff has three parts, in this order: everything only the operator can do is done or scheduled first, everything the executor must know is written into one resumption file in Tau Brain, and one short prompt points the executor at that file.

Compose the owners; do not restate their bodies: [create-charter](../create-charter/SKILL.md) for the decision authority, [create-handbook](../create-handbook/SKILL.md) for the operator runbook and the go-live checklist, [bootstrap-package](../bootstrap-package/SKILL.md) for npm names, [create-repo](../create-repo/SKILL.md) for a new repository's conventions, [work-charter](../work-charter/SKILL.md) for what the executor runs, [update-agent-memory](../update-agent-memory/SKILL.md) at the end. Loading this skill authorizes no publication, apply, external message or push; the operator's rulings in the charter do.

## What the cloud project can and cannot reach

Every step below follows from this table. Anything in the right-hand column is either finished by the operator before the handoff or requested later through the ping protocol; it is never left for the executor to discover.

| The executor has                                                                           | The executor does not have                                                                                              |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| The repositories connected to the project, through the GitHub App, with push and PR rights | The operator's machine: uncommitted change sets, local sessions, worktrees, local databases, hardware, shared checkouts |
| GitHub Actions on those repositories, including macOS runners                              | Credentials: npm, PyPI, HCP Terraform, GitHub organization admin, Vercel, DNS, billing                                  |
| Tau Brain, if the environment clones it, with push rights to write state back              | UI-only settings: App installation repository lists, organization secrets, package 2FA, pending publishers              |
| Secrets that CI workflows already read (for example `ANTHROPIC_API_KEY` for `claude.yml`)  | Darwin verification outside CI                                                                                          |
| Native subagents of the ruled class                                                        | This session's memory, transcript and scratchpad                                                                        |

## Preconditions

Stop and finish the charter with `create-charter` if any of these is missing. A handoff with an open eigenquestion only moves the question to a worse place.

1. The charter is `approved`; every eigenquestion is ruled and recorded as a decision with its authority and date; adopted-without-ruling recommendations are listed as vetoable.
2. The authority ruling is explicit: which repositories the executor may push and auto-merge in, whether it may publish to registries, push Brain, close drafts, create repositories, and what still returns to the operator (changing a ruled scope).
3. The worker class is ruled (model and effort for implementation lanes; review lanes may differ).
4. Invariants carry stable IDs (`I#`) and work packages carry semantic acceptance; the sequence has a forced order only where a conflict forces it.
5. The go-live checklist already holds a row for every item that must close before launch.

## Steps

### 1. Move everything local into durable form (step 0)

The executor cannot see the operator's Mac, so nothing the program needs may live only there.

- Uncommitted change sets become pull requests from `origin/main` with the owners' content intact and auto-merge on; local tests that passed before the move are recorded in the PR and the charter. Never stash, reset or check out across another owner's work.
- Findings held only in local sessions are written into the charter's stock take; the sessions are then idle.
- Worktrees and branches to prune after merges are listed in the charter.
- Verification that needs the operator's hardware moves to CI jobs or is named as an operator step.
- Record the result in the charter (`Step 0 done: …` with the PR links) and in the artifact index restart point.

### 2. Finish the operator-only bootstrap with a runbook

Write one runbook under `docs/handbooks/cloud/operate/<program>-bootstrap.md` through `create-handbook` (kind `runbook`): one step per operator action, each with the exact command or UI path, the expected output, a verify command the agent can run afterwards, and a report-back line. Typical steps, in dependency order:

| Step                                                                               | Owner                                                                                                                                                                                                                           | How                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository exists and is governed                                                  | operator creates; agent raises the IaC stack PR (tau-cloud `stacks/repo/<name>` with its change proposal) and the HCP workspace script; operator merges on the reviewed plan; agent records the apply and a plan-only read-back | `create-repo` conventions; never revert a stack PR that carries `prevent_destroy`                                                                                        |
| GitHub App coverage on the new repository (IaC App, release bot, preview packages) | operator, in the organization's installation settings; the API route needs a classic PAT, the `gh` OAuth token is refused                                                                                                       | verify with the import or with the App's own token; otherwise record **declared**                                                                                        |
| Organization secrets the workflows read                                            | operator                                                                                                                                                                                                                        | record **declared**; the agent's token cannot read organization secrets                                                                                                  |
| Registry names and trusted publishing                                              | agent prepares the reviewed bundle with `bootstrap-package`; operator publishes the placeholders (`SKIP_TRUST=1`) and sets 2FA-and-disallow-tokens; the trust binding waits                                                     | **bind before the first CI publish and publish within 48 h**: a binding that has not published within two days expires, and an OIDC publish without a binding is refused |
| PyPI pending publisher                                                             | operator creates it once; no expiry; it converts on the first wheel                                                                                                                                                             | only a failure needs a ping                                                                                                                                              |
| Connect the repositories to the cloud project                                      | operator, last                                                                                                                                                                                                                  | see step 7                                                                                                                                                               |

Mark every claim **declared** (source path), **observed** (UTC time and command) or **planned**. What only the operator can see is recorded as declared by the operator with the date and channel, never as observed. Add or close the go-live rows in the same change: repository governance, registry names, publishers, public transition. The runbook's `Report back` section lists the exact lines the operator pastes to the coordinator; the coordinator folds them into the rows as evidence.

### 3. Write the resumption file

Copy [resume.template.md](resume.template.md) to `docs/research/artifacts/<charter>/handoff/resume.md` and fill every section. The file is the executor's working copy of the program. Rules:

- **Self-contained.** Every identifier the executor would otherwise rediscover is inline: repository IDs, workspace IDs, installation IDs, environment names, package names, branch names, PR numbers, run IDs, the files that reference the moved tree, the largest tracked files, test-harness quirks. Relative links stay inside Brain; a Tau path is written as text, never as a link that needs the `docs/` symlink.
- **Decisions stay in the charter.** The file quotes invariants in spirit and links the charter; it never changes a ruling.
- **State is current and append-only.** § State at handoff is re-observed by the executor on arrival and kept current; § State log takes one line per event with a UTC timestamp from `date -u`. From the moment the prompt is pasted the executor owns § State; the coordinator only appends log lines and never rewrites the file.
- **The sequence is phases with acceptance.** Order by dependency and by what unblocks the most (land open PRs and the change that shrinks the CI queue first). Each phase names its gates, exact commands, expected output and the charter IDs it closes.
- **Hard rules are listed, not implied.** Charter invariants, commit and PR conventions, forbidden commands (`gh run rerun --failed`, prettier, stash across owners), secret handling, IaC rules, Brain commit mechanics, where Darwin verification happens.
- **The worker brief is a template** the executor copies for every lane, naming task and attempt IDs, exclusive paths, instructions to read, checks and the evidence writer.
- **Operator pings are enumerated** with their full text (below). Everything else is an FYI.
- **Known traps** from this session are a table: symptom, what to do.

### 4. Write the prompt

Copy [prompt.template.md](prompt.template.md) to `docs/research/artifacts/<charter>/handoff/prompt.md`. The prompt is what the operator pastes; it must be short enough to paste and complete enough to start cold:

- the resumption file's path in Brain and its path through the Tau symlink;
- the read order (resumption file, then the charter);
- the authority ruling and the worker class, by decision ID;
- the phases by name, in order;
- the ping rule (only the enumerated pings, in their exact form; everything else is an FYI);
- where state is kept and which checklist rows to close.

### 5. Link and record

- Charter: status line says handed off and links both files; the State and evidence table gains a handoff row; the restart point names the resumption file as the executor's entry.
- Artifact `index.md`: a `## Handoff` section with both files and the restart point.
- Runbook: the final step tells the operator which repositories to connect and to start the project with the prompt.
- Go-live rows: closed with evidence where the operator's report allows; the rest named in the resumption file as the executor's obligations.

### 6. Validate and commit to Brain `main`

1. Check every relative link in the touched Brain files resolves inside Brain.
2. `pnpm docs:validate` from the Tau root; `node .agents/skills/create-handbook/generate-source-map.mjs --check` when a handbook page's `sources` changed.
3. Commit by path, and only ever edits applied to the `origin/main` bytes. Never copy a whole file from a checkout that may be behind `origin/main`: once the executor is live it writes the resumption file too, and a whole-file copy silently discards its state (this happened on 2026-10-12 and had to be restored). Commit from this checkout's own Brain mount (`pnpm agent-env brain`, a detached worktree of `origin/main`) with `pnpm agent-env commit -m <message> -- <paths>`, which commits by path, rebases onto `origin/main` and pushes `HEAD:main`, retrying a lost race. Apply the edits there with anchored replacements that assert their match count and regenerate the source map before committing.
4. Confirm the pushed `main` holds byte-identical copies of the handoff files.

### 7. Transmit

The operator does these; the coordinator tells them in the final message, with the prompt inline:

1. Create the cloud project and connect every repository the resumption file names (the program's repositories, the IaC repository, Tau Brain).
2. Use the `tau-brain` cloud environment (attach Tau Brain as a source with its sparse exclude patterns; setup script `cd /home/user/tau && bash scripts/agent-env.sh setup`), which installs the workspace's Node, pnpm and dependencies and links Brain at `repos/tau-brain` so `docs/research` and `docs/handbooks` resolve. The handbook page `docs/handbooks/cloud/operate/agent-environments.md` holds the fields. No operator credential goes into the environment.
3. Paste the prompt.

Then `update-agent-memory`: the handoff state, the remaining operator steps and the pings to expect.

## Operator-ping protocol

The executor asks for the operator only for what the right-hand column of the reach table holds. Each ping is one message, in exactly this shape, and the resumption file carries the full text of every ping the program can need:

```text
<Program>: action needed (<n> of <m>) — <what>

Why: <one line: what is ready and why the executor cannot do this step>.

<Run | Click | Open>: <one command in a code block, or one URL> — <two or three field values if a form>

Expected: <what success looks like>. Reply `done` (or: reply with <the one value needed>).
```

Rules: no options, no background, no second question; a time-bound step (a trust binding that expires) is pinged only when the executor is ready to use the result immediately; a failure-only ping (a registry refusing the first publish) carries the exact error text; a step that confirms two things at once (trust binding and public flip) says so in the `Why` line. Everything else is an FYI (`<Program> FYI: <what>`, two lines, no reply), including releases: the operator is told, not asked.

## Report back

The coordinator's final message to the operator contains, in this order: what landed (links), what is open and on whom, the exact remaining operator steps (connect, environment, paste), the prompt verbatim in a code block, and the pings the operator should expect and how many. Nothing in it should require opening a file to act.

## Checklist

- [ ] Charter approved; every eigenquestion ruled; authority and worker class ruled by ID
- [ ] Step 0 done: nothing the program needs exists only on the operator's machine
- [ ] Runbook written through `create-handbook`; each claim declared, observed or planned; report-back lines defined; go-live rows added or closed
- [ ] Registry trust bindings scheduled before the first publish, with the 48 h rule stated
- [ ] `resume.md` filled from the template; all links resolve inside Brain; identifiers inline; state log started
- [ ] `prompt.md` under 20 lines; names the file, the read order, the authority, the phases and the ping rule
- [ ] Charter, artifact index and runbook link the handoff; checklist rows reconciled
- [ ] `pnpm docs:validate` clean for the touched pages; source map checked; committed and pushed to Brain `main`; pushed bytes verified
- [ ] Final message carries the prompt verbatim, the connect-and-environment steps and the expected pings
- [ ] Memory updated

## Reference instance

The GeoSpec program handoff of 2026-10-12: [resume.md](../../../docs/research/artifacts/geospec-program-charter/handoff/resume.md), [prompt.md](../../../docs/research/artifacts/geospec-program-charter/handoff/prompt.md), the [bootstrap runbook](../../../docs/handbooks/cloud/operate/geospec-repository-bootstrap.md) and the [charter](../../../docs/research/geospec-program-charter.md) (D19 authority, D23 repository, D24 worker class, W3.0 bootstrap). These resolve only where Tau Brain is checked out.
