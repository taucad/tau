# Handbook page templates

One template per `kind`, plus the go-live checklist. Fill them; do not reorder or rename the required sections. Replace every `<placeholder>`. Delete an optional row only when it does not apply, and say so rather than leaving it blank.

Every template's frontmatter follows the page contract in `SKILL.md`: single-quoted dates, `description` of one sentence at most 300 characters, `title` equal to the H1, `sources` naming at least one path whose change makes the page suspect, `environments` naming at least one of `development`, `staging`, `prod-us`, and `last_verified` carrying the date the claims were really checked.

## Page map

The `cloud` handbook's fixed layout. Link to these names; every one of them exists or is planned to exist. A new page belongs in one of these directories.

```text
docs/handbooks/cloud/
  index.md
  system/      overview.md environments.md interfaces.md data.md identity-and-access.md secrets-register.md
  system/services/
               api.md billing-operations-worker.md billing-recovery-worker.md revisions-maintenance.md release-command.md
               ui.md docs-site.md postgres.md redis.md object-storage.md dns-and-edge.md stripe.md llm-suppliers.md
               email.md identity-providers.md terraform-control-plane.md ci-cd.md observability.md
               analytics-and-tracing.md desktop-app.md
               storage-gateway.md second-copy-b2.md cloud-host-provisioner.md hatchet.md        (planned: status draft)
  operate/     deploy-and-promote.md rollback-api.md rollback-ui.md hotfix.md break-glass-ui-deploy.md migrations.md
               scaling.md terraform-change.md tariff-lifecycle.md supplier-budgets.md stripe-catalog-and-webhooks.md
               refunds-and-financial-cases.md billing-operator-levers.md postgres-backup-and-restore.md
               storage-maintenance.md verified-erasure.md share-takedown.md account-actions.md secret-rotation.md
               access-joiner-leaver.md desktop-release.md npm-release.md cli-billing-command.md cli-maintenance-command.md
  playbooks/   process.md triage.md site-down.md api-5xx.md sign-in-failing.md chat-llm-failing.md paid-not-credited.md
               ledger-drift.md budget-exhausted.md tariff-incompatible.md storage-failure.md redis-loss.md
               postgres-saturation.md dns-tls.md deploy-regression.md supplier-outage.md credential-leak.md abuse-takedown.md
  observe/     signals.md querying.md dashboards.md alerts.md health-endpoints.md log-lines.md slos.md
  readiness/   go-live-checklist.md known-gaps.md calendar.md unknowns.md
  reference/   hostnames.md identifiers.md glossary.md source-map.md verification-log.md
```

`playbooks/` says how to respond. `docs/incidents/` records what happened and is owned by `create-incident`.

## Marking claims

Every factual statement carries one of three marks. Use the words, in bold, or as a table column.

```markdown
**declared** — `apps/api/fly.prod.toml:12` sets two machines in `<region>`.
**observed** — 2026-09-19T19:52Z, `curl -sS -m 10 https://<public-health-url>` returned `{"status":"ok"}`.
**planned** — the storage gateway charter specifies a `storage.<zone>` worker; nothing is deployed.
```

## service

**A service that is only planned** — chartered, not deployed — uses the same template with three
changes, and invents nothing observed:

- `status: draft`, and `environments` names the environments it is *planned for*, not where it runs.
- Every row of **Where it runs** and of **What it talks to** is marked `planned`, with the charter
  cited. There is no `observed` mark on a page for something that does not exist yet.
- **Commands and consoles**, **Secrets (names)** and **Declared vs observed** say what does not exist
  yet rather than carrying a placeholder command or an invented variable name; **Open items** names
  the decision that would make the page `active`.

````markdown
---
title: '<Service>'
description: '<One sentence: what this service does and who depends on it.>'
status: active
created: '<YYYY-MM-DD>'
updated: '<YYYY-MM-DD>'
kind: service
environments: [development, staging, prod-us]
last_verified: '<YYYY-MM-DD>'
sources:
  - <path whose change makes this page suspect>
---

# <Service>

## What it is

<Two or three sentences. What it does, what breaks when it is gone.>

## Where it runs

| Environment | Where | Size and count | Mark |
| --- | --- | --- | --- |
| development | <where> | <count> | declared |
| staging | <where> | <count> | declared |
| prod-us | <where> | <count> | observed <UTC timestamp> |

<!-- A planned service: status: draft, every row below and above marked `planned` with the charter cited. -->
| <environment it is planned for> | <where it would run> | <not deployed> | planned |

## What it talks to

| Peer | Protocol | Direction | Auth | Credential name |
| --- | --- | --- | --- | --- |
| <peer> | <https / postgres / redis> | <in / out / both> | <how> | `<VARIABLE_NAME>` |

<!-- A planned service: add a Mark column and set every peer row to `planned`. -->
| <planned peer> | <protocol> | <direction> | <how it would authenticate> | <none set yet> |

## What it depends on

<Hard dependencies first: without these it does not start. Then soft ones and what degrades.>

## How it fails and how you would tell

| Failure | Symptom | Signal that shows it | Playbook |
| --- | --- | --- | --- |
| <failure> | <what users see> | <log line, metric, health field> | `<playbooks/…>` |

## Commands and consoles

```bash
<one command>
```

Expected: `<expected output>`

## Secrets (names)

| Name | Owner | Source of truth | Rotation page |
| --- | --- | --- | --- |
| `<VARIABLE_NAME>` | <who> | <where it is set> | `<operate/secret-rotation.md>` |

## Declared vs observed

| Claim | Declared | Observed | Divergence |
| --- | --- | --- | --- |
| <claim> | <source path> | <what was seen, UTC> | <none, or the gap> |

## Open items

- <Gap, unknown, or unruled decision. Write "none" when there are none.>
````

## runbook

````markdown
---
title: '<Do the thing>'
description: '<One sentence: what this procedure achieves and its main risk.>'
status: active
created: '<YYYY-MM-DD>'
updated: '<YYYY-MM-DD>'
kind: runbook
environments: [staging, prod-us]
last_verified: '<YYYY-MM-DD>'
sources:
  - <path>
---

# <Do the thing>

## When to use

<The situation. Then: when not to use this, and what to use instead.>

## Preconditions and authority needed

- <Precondition, and how to check it.>
- Authority: <who must authorize. For a destructive or money-moving step, name the point of no return.>

## Steps

1. <Step.>

```bash
<one command>
```

Expected: `<expected output>`

2. <Step.>

```bash
<one command>
```

Expected: `<expected output>`

## Verify

<The check that proves it worked, with its command and expected output. Not "it should be fine".>

## Roll back

<How to undo, and from which step it is still possible. If it is not possible, say so here.>

## If it goes wrong

| Symptom | Meaning | Next |
| --- | --- | --- |
| <symptom> | <meaning> | <playbook or step> |

## Last exercised

<'never', or the date, who ran it, and what differed from these steps.>
````

## playbook

````markdown
---
title: '<Symptom class>'
description: '<One sentence: the failure this playbook covers.>'
status: active
created: '<YYYY-MM-DD>'
updated: '<YYYY-MM-DD>'
kind: playbook
environments: [prod-us]
last_verified: '<YYYY-MM-DD>'
sources:
  - <path>
---

# <Symptom class>

## Symptoms

- <What is reported or seen. Use the words a user or an alert would use.>

## First five minutes

1. <Action that costs nothing and narrows the problem. Only signals that exist today.>

```bash
<one command>
```

Expected: `<expected output>`

## Decide

| Signal | Branch |
| --- | --- |
| <what you saw> | <which remedy> |

## Remedies

| Remedy | Runbook |
| --- | --- |
| <remedy> | `<operate/…>` |

<Where no procedure exists: "no procedure exists; the only lever is <lever>".>

## Do not

- <Action that makes it worse, and why.>

## Escalate

<When to stop and call the supplier or the operator; what to have ready.>

## After

<Open an incident record with `create-incident` if customers were affected. Re-verify this playbook, update `Last exercised` on every runbook used, and reconcile the go-live checklist.>
````

## register

````markdown
---
title: '<Register name>'
description: '<One sentence: what this register enumerates.>'
status: active
created: '<YYYY-MM-DD>'
updated: '<YYYY-MM-DD>'
kind: register
environments: [development, staging, prod-us]
last_verified: '<YYYY-MM-DD>'
sources:
  - <path>
---

# <Register name>

<One line of scope. Then the table — nothing else.>

| <Item> | Owner | <Column> | <Column> | Mark |
| --- | --- | --- | --- | --- |
| <item> | <who> | <value> | <value> | declared |
````

## overview and reference

````markdown
---
title: '<Title>'
description: '<One sentence.>'
status: active
created: '<YYYY-MM-DD>'
updated: '<YYYY-MM-DD>'
kind: overview
environments: [development, staging, prod-us]
last_verified: '<YYYY-MM-DD>'
sources:
  - <path>
---

# <Title>

<Free structure; tables preferred over prose. Every claim still carries its mark, every command is
still copy-pasteable, and secrets are still names only.>
````

## go-live checklist

One page, `readiness/go-live-checklist.md`. `kind: register`, `review_days: 14`, and `sources` naming every path whose change can open or close a row.

````markdown
---
title: 'Go-live checklist'
description: 'The canonical list of what must be true before launch, with the evidence that closed each row.'
status: active
created: '<YYYY-MM-DD>'
updated: '<YYYY-MM-DD>'
kind: register
environments: [prod-us]
last_verified: '<YYYY-MM-DD>'
review_days: 14
sources:
  - <every path whose change can open or close a row>
---

# Go-live checklist

This is the only authoritative launch list. A blueprint, a closeout note or a memory entry that
names a launch gate is absorbed into a row here or linked from one.

**Public launch** means <definition>. **Live collection** means <definition>. They are signed off
separately and may happen on the same day.

| | |
| --- | --- |
| Target date | <date, or 'not set'> |
| Last review | <YYYY-MM-DD> |
| Open `B` | <n> |
| Open `B$` | <n> |
| Accepted | <n> |
| Done | <n> |

Gate: `B` blocks public launch · `B$` blocks enabling live collection · `A` may launch with a
recorded acceptance · `P` dated or post-launch obligation, mirrored in the calendar.
State: `open` · `done` (evidence recorded) · `accepted` (operator accepted the risk; the reason is
copied to `known-gaps.md`) · `superseded` (points to the replacing row).

Rows are never deleted and IDs are never reused: a new row takes the next unused integer in its area
prefix, counting every ID the area has ever carried. Agents add rows, reopen rows and set `done` with
evidence; only the operator sets `accepted`, changes a `Gate` or signs off.

## <Area>

| ID | Item | Gate | State | Owner | Closes when | Evidence | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `<AREA-1>` | <what must be true> | `B` | `open` | <who> | <the command and its expected output, a run or commit URL, or the named operator decision> | <what was actually seen, with a UTC timestamp> | `<page>` |

## Sign-off

| Stage | Date | Operator | Handbook commit reviewed |
| --- | --- | --- | --- |
| Public launch | <YYYY-MM-DD> | <who> | `<sha>` |
| Live collection | <YYYY-MM-DD> | <who> | `<sha>` |
````
