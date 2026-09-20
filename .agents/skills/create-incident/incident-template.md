# Incident record template

Copy everything between the rules below into `docs/incidents/<YYYY-MM-DD>-<slug>/incident.md`. The
first six sections exist from the first minute; the rest are filled after mitigation. Keep the
sections in this order and do not add or rename them.

---

```markdown
---
title: 'API returns 503 after deploy'
description: 'Every production API request failed for 14 minutes after a deploy shipped an incompatible tariff.'
state: open                 # open | mitigated | resolved | closed
severity: SEV2              # SEV1 | SEV2 | SEV3 | drill
created: '2026-10-03'
updated: '2026-10-03'
environments: [prod-us]
started_at: '2026-10-03T21:04Z'    # when impact began, best known
detected_at: '2026-10-03T21:09Z'
mitigated_at: ''                   # impact stopped
resolved_at: ''                    # cause fixed
services:                          # handbook service pages involved; [] when none exists yet
  - docs/handbooks/cloud/system/services/api.md
playbooks:                         # playbooks actually used; [] when none exists yet
  - docs/handbooks/cloud/playbooks/tariff-incompatible.md
---

# API returns 503 after deploy

## Status now

<!-- One paragraph, overwritten each update. Stamp the time it was written and when the next update is due. -->

## Impact

<!-- Who, what, since when, how many, and whether money or data is involved. Account ids and counts only. -->

## Timeline

<!-- Append-only. One line per entry: UTC time from `date -u` · actor (operator, agent, system) · observed | action | decision · what. Corrections are new lines. -->

- `2026-10-03T21:09Z` · operator · observed · Reported that production requests return 503.
- `2026-10-03T21:10Z` · agent · decision · Declared SEV2, provisional; record opened.

## Hypotheses

<!-- One row per hypothesis: statement · open | confirmed | ruled out · the evidence file that decided it. -->

## Actions taken

<!-- Every mutating action: the exact command, who authorized it, the result, and how to undo it. -->

## Comms

<!-- What was sent, where and when. Drafts live in `comms/` until the operator sends them. -->

## Root cause

<!-- The mechanism, with source locators. Or "unknown", with what was ruled out. -->

## What helped, what hurt

<!-- Blameless. Include every place the handbook was wrong, missing or slow to find. -->

## Follow-ups

| Action | Owner | Destination | State |
| --- | --- | --- | --- |
|  |  | handbook page / go-live checklist row / issue / research document | open |

## Handbook changes made

<!-- Pages corrected, with the used playbook's `Last exercised` updated. -->
```

---

## Register row

Add one row to `docs/incidents/index.md`, newest first. `severity: drill` goes in the **Drills** table;
everything else goes in the **Incidents** table. The two tables have different columns.

### Incidents table — seven columns

```markdown
| [2026-10-03-api-503-after-deploy](2026-10-03-api-503-after-deploy/incident.md) | SEV2 | resolved | 2026-10-03T21:04Z | 14m | All production API requests failed | 2 open |
```

| Column | Content |
| --- | --- |
| Incident | Relative link to the record, titled with the directory name |
| Severity | `SEV1` · `SEV2` · `SEV3` |
| State | `open` · `mitigated` · `resolved` · `closed` |
| Started (UTC) | `started_at`, best known |
| To mitigate | `mitigated_at` minus `started_at`, or `—` while open |
| Customer impact | One line, no more |
| Open follow-ups | Count of Follow-ups rows not in state `done`, or `none` |

### Drills table — six columns

```markdown
| [2026-10-05-drill-redis-loss](2026-10-05-drill-redis-loss/incident.md) | Tabletop: production Redis lost to a supplier maintenance window | closed | 2026-10-05T02:10Z | Yes, unaided — triage routed to the playbook in one read and the remedy was reached | 13 open |
```

| Column | Content |
| --- | --- |
| Drill | Relative link to the record, titled with the directory name |
| Scenario | The scenario as it was given, one line. No severity column: every row here is `severity: drill` |
| State | `open` · `mitigated` · `resolved` · `closed`, as the record's `state` |
| Run (UTC) | When the drill was run — its `started_at` |
| Reached the right remedy | `Yes` · `Yes, partly` · `No`, then the one thing that helped or blocked |
| Open follow-ups | Count of Follow-ups rows not in state `done`, or `none` |
