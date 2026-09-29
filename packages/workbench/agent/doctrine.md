The workbench is files. `.tau/workbench/layout.json` describes the lanes, the viewer tree and the workbench tabs; `.tau/workbench/views/<viewId>.json` describes one viewer view (file, name, camera, field of view, up, display, grid unit, section cuts, measurements); `.tau/workbench/entries.json` holds what every view of a file shares (render timeout, hidden and isolated components, opacity). The person's window adopts a change to these files live; a reload, another window on the project and the CLI read the same files. You change them with one tool, `arrange_workbench`, which validates, merges and writes them and answers with what a window will show.

## When to arrange

- At the end of a task that produced something to look at: a rebuilt part, a new file, a report, a failed test the person should see.
- When asked to open, compare, review, split, cut open or show something.
- Never mid-turn to "check your work" (use `screenshot` and `get_kernel_result` for that), never on every small edit, and never to move focus away from what the person is doing.

Read before you rearrange: the per-turn context lists the lanes, the visible tabs, every view (id, name, file, camera) and every file with settings; `read_file .tau/workbench/layout.json` gives the full trees. Reuse a view that already shows the file you want instead of adding a duplicate.

## The tool

`arrange_workbench({ open?, close?, views?, entries?, viewer?, workbench?, lanes?, basedOn? })`

One rule: each key you send replaces that key; each key you omit keeps what is there. Lists (`measurements`, each `components` list, a lane tree) replace whole. Nothing else merges.

- `views` creates or changes views by id (a lowercase slug you choose, such as `front` or `joint`). A new id needs `entryPath` (a model file) and is shown at once, in the viewer lane's first group and active, unless `viewer` or `open` places it. Fields: `name` (the tab label beside the file name; defaults to the preset name or "Look"), `camera`, `fieldOfView` (degrees, 0 is orthographic, at most 90), `upDirection`, `display` (`surfaces`, `lines`, `gizmo`, `grid`, `axes`, `matcap`, `postProcessing`), `grid.unit` (`mm`, `cm`, `m`, `in`, `ft`, `yd`), `section` (`active`, up to four `cuts`), `measurements`.
- `camera` is `{ kind: "preset", preset }` with `isometric`, `front`, `back`, `right`, `left`, `top` or `bottom`, or `{ kind: "look", direction, up? }` for any other viewpoint. `direction` points from the model toward the camera, any length: `[0, -1, 0]` is the front (seen from −Y); `[-1, 1, -1]` looks from below, behind and the left. Both frame the model, so you never need its bounds. You cannot write a pose.
- Lengths are metres in the model frame: a cut at `offset: 0.012` is 12 mm; a measurement's points are metres. A cut through `offset: 0` passes through the origin, not necessarily the model.
- `entries` sets what every view of a file shares: `renderTimeout` (milliseconds, 0 disables), `components.hidden`, `components.isolated`, `components.opacity` (`[{ id, opacity }]`). Component ids are the names the Model pane shows; ask the person or read the source if you do not know them.
- `open` shows tabs: `{ kind: "view", view }`, `{ kind: "pane", pane }` (`parameters`, `model`, `print`, `kinematics`, `revisions`, `agents`, `jobs`, `export`, `share`, `details`, `kernel`, `console`) or `{ kind: "file", path, presentation?, filesOpen? }` (`presentation` is `preview` or `source` for markdown). A tab not yet open joins its lane's first group and becomes active; opening into a hidden lane shows the lane.
- `close` removes tabs wherever they are. Files save as they are edited, so nothing is lost; closing a view's tab deletes the view.
- `viewer` and `workbench` replace a lane's arrangement whole: a `group` (`tabs`, optional `active` index, optional `size` weight) or a `split` (`direction` `row` or `column`, `children`, at most two levels). The viewer lane holds view tabs; the workbench lane holds pane and file tabs. A view left out of a `viewer` tree is closed.
- `lanes` shows or hides the chat and workbench lanes. You cannot hide a lane the same call opens into.
- `basedOn` is the `layout.json` digest from the per-turn context. Pass it when your change depends on the arrangement you read; the call is refused with `RECORD_CONFLICT` if the person rearranged since. Views and entries are always written against the bytes just read.

The result is `written` with every record written (path, digest, previous digest; a deleted view has digest `missing`) and the tabs a window will show, or an error: `VALIDATION_ERROR` (a field error naming the path and the fix; nothing was written), `FILE_NOT_FOUND` (a file tab, `entryPath` or `entries[].path` that does not exist), `RECORD_CONFLICT` (read again and retry, or drop `basedOn` to merge), `INVALID_RECORD` (a record on disk is unreadable and the person has been offered Reset; send whole lanes or fix the file, never overwrite it blindly). `written` means the files changed; the person's window shows them live if the project is open, otherwise when it opens, and the card says so. Tell the person in one line what you arranged; never claim they have already seen it.

## Patterns

**Show one view.** The shortest call; the view appears beside what is open:

```json
{
  "views": [
    { "id": "front", "entryPath": "main.ts", "camera": { "kind": "preset", "preset": "front" }, "fieldOfView": 0 }
  ]
}
```

**Review views after a build.** Three named views of the changed file, iso large on the left, front over top on the right:

```json
{
  "views": [
    { "id": "iso", "name": "Iso", "entryPath": "main.ts", "camera": { "kind": "preset", "preset": "isometric" } },
    {
      "id": "front",
      "name": "Front",
      "entryPath": "main.ts",
      "camera": { "kind": "preset", "preset": "front" },
      "fieldOfView": 0
    },
    {
      "id": "top",
      "name": "Top",
      "entryPath": "main.ts",
      "camera": { "kind": "preset", "preset": "top" },
      "fieldOfView": 0
    }
  ],
  "viewer": {
    "kind": "split",
    "direction": "row",
    "children": [
      { "kind": "group", "size": 2, "tabs": [{ "kind": "view", "view": "iso" }] },
      {
        "kind": "split",
        "direction": "column",
        "children": [
          { "kind": "group", "tabs": [{ "kind": "view", "view": "front" }] },
          { "kind": "group", "tabs": [{ "kind": "view", "view": "top" }] }
        ]
      }
    ]
  }
}
```

**Inspect a detail.** Look from an angle no preset names, cut the part open, hide what is in the way, and close what the person has finished with:

```json
{
  "views": [
    {
      "id": "joint",
      "name": "Joint",
      "entryPath": "main.ts",
      "camera": { "kind": "look", "direction": [-0.5, 0.7, -0.5] },
      "section": { "active": true, "cuts": [{ "kind": "plane", "plane": "xz", "offset": 0.012, "isFlipped": false }] },
      "grid": { "unit": "in" },
      "display": { "lines": false }
    }
  ],
  "entries": [
    {
      "path": "main.ts",
      "renderTimeout": 300000,
      "components": { "hidden": ["lid"], "opacity": [{ "id": "housing", "opacity": 0.4 }] }
    }
  ],
  "close": [{ "kind": "file", "path": "docs/review.md" }]
}
```

**Open an authored report.** Write the markdown first, then one key:

```json
{ "open": [{ "kind": "file", "path": "docs/review.md", "presentation": "preview" }] }
```

**End of task.** From the arrangement the context showed, put Parameters over the report and pass the digest you read:

```json
{
  "basedOn": "sha256:5f1c…5c8b",
  "workbench": {
    "kind": "split",
    "direction": "column",
    "children": [
      { "kind": "group", "tabs": [{ "kind": "pane", "pane": "parameters" }] },
      { "kind": "group", "tabs": [{ "kind": "file", "path": "docs/review.md" }] }
    ]
  }
}
```

**Documents are panes.** A markdown file with headings, tables, captures (`screenshot` output saved into the project) and links is the way to author a pane today. Open it as above. Do not generate HTML.

## Restraint

- Merge by default; the person's arrangement is theirs. Send a lane tree only when you mean to replace that lane.
- One arrangement per task end; if the person restores the previous arrangement, do not re-apply yours.
- Tabs you open become active as the record says, but keyboard focus stays where the person had it.
- Prefer the tool to `create_file` on `.tau/workbench/**`: it validates, merges and writes with a precondition. Editing the JSON directly (a host without the tool): keep `version`, preserve fields you do not understand, write the whole file.
- Device values (pixel widths, which chat is focused, the phone tab) are not in these files and not yours to set. `kernel` and `console` show only in debug mode; the context lists panes this window cannot show.
