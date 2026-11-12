# @taucad/preferences

The person record on the device: section schemas, merge rules and setup suggestions shared by the Tau app and, with account sync, the API.

The record has four sections, each stored under its own key as a `StoredSection` (`{ value }`, with a `synced` half only once account sync exists):

| Section              | Schema                    | Written by                                                                              |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `person-profile`     | `personProfileSchema`     | `mergeLeaves`: a set leaf is stored whatever its value; `resetLeaf` removes it          |
| `viewer-preferences` | `viewerPreferencesSchema` | `mergeLeaves`; `viewDefaults` is keyed by view-field leaf path from `@taucad/workbench` |
| `onboarding`         | `onboardingStateSchema`   | `mergeOnboarding`: progress only grows                                                  |
| `device`             | `deviceRecordSchema`      | `mergeLeaves`; never syncs                                                              |

`readSection` reads a stored section as its value, as empty, or as `newer` (written by a later build: never parsed, never overwritten). `prepareSectionWrite` reads, merges and serialises in one synchronous step, so a write merges into what is stored rather than into a stale copy. Storage itself belongs to the app (`apps/ui/app/preferences`).

`suggestedPreset` and `suggestedGizmo` give the mouse preset and gizmo style a tool answer suggests (the onboarding blueprint's Finding 7). Suggestions are never stored: `effectivePreset` and `effectiveGizmoStyle` apply them while the person has chosen nothing. `toolSuggestions[tool].names` lists the products copy may give as the reason, only those whose vendor documents the matching orbit, pan and zoom (camera research R13): the NX or Creo answer names Creo alone, and the KiCad and slicer answers name none.

`firstSignInMerge` is the account-sync merge for a device that has never synced. Launch has no caller.

No function here reads a clock.
