# @taucad/workbench-panes

Tau workbench panes (parameters, model, kinematics, export, share) shared by the Tau app and the agent plugin viewer

## Viewer shell

The viewer chrome around the panes is shared too, so the Tau app's viewer and the agent plugin viewer page draw the same composites and cannot drift. Each host keeps only its model source, its layout container (dockview or `PaneLane`) and its app-only slot content. None of these modules loads dockview at runtime.

| Subpath                                                       | Exports                                                                                                                   | What it draws                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@taucad/workbench-panes/shell/viewer-stage`                  | `ViewerStage`, `ViewerStageProps`, `ViewerStageCanvasProps`, `ViewerStageStatus`                                          | The focusable canvas region, the hover label, the status pill or failure overlay, and the bottom controls slot. The host draws `CadViewer` or `ModelViewer` through `renderCanvas`, passing the stage's `eventSource`, `gizmoContainer` and `onComponentSecondaryPointerCandidate`.                        |
| `@taucad/workbench-panes/component-menu/use-viewer-part-menu` | `useViewerPartMenu`, `UseViewerPartMenuOptions`, `ViewerPartMenu`, `ViewerPartMenuRegionProps`, `ViewerPartMenuDecorator` | The canvas part menu: a right press within 4 px opens it and a longer one pans, Shift+F10 or the Menu key opens it for the selected part, and a new model closes it. Pass the result to `ViewerStage` as `partMenu`; `selectedMenu` feeds a header dropdown and `openMenuData` names the open menu's part. |
| `@taucad/workbench-panes/shell/viewer-status`                 | `ViewerStatusPill`, `ViewerStatusPillProps`                                                                               | The running-work pill the stage places: centred before a model is drawn, in the upper sixth over one.                                                                                                                                                                                                      |
| `@taucad/workbench-panes/shell/viewer-header-actions`         | `ViewerHeaderActions`, `ViewerHeaderActionsProps`, `ViewerHeaderPane`                                                     | The header cluster: host `leading` actions, Share and Export (folding to icons below `@xl/viewer`), then a hairline and the `trailing` control.                                                                                                                                                            |
| `@taucad/workbench-panes/components/workbench-tab`            | `WorkbenchTab`, `WorkbenchTabProps`                                                                                       | One tab: glyph, fading title, close glyph and full-title tooltip. `as: 'button'` is a complete `role="tab"` that shrinks to 48 px with its siblings; `as: 'div'` is content inside a tab dockview owns.                                                                                                    |

The selected part is the model interaction machine's first selected component; a host keeps no copy of it. Render the stage inside the host's `GraphicsProvider`, `KeyboardProvider` and `TooltipProvider`.

```tsx
const partMenu = useViewerPartMenu({ graphicsRef, actions });

<ViewerStage
  graphicsRef={graphicsRef}
  regionId='tau-viewer-canvas'
  partMenu={partMenu}
  status={status}
  controls={<ViewerControls />}
  renderCanvas={({ eventSource, gizmoContainer, onComponentSecondaryPointerCandidate }) => (
    <CadViewer
      eventSource={eventSource}
      gizmoContainer={gizmoContainer}
      onModelComponentSecondaryPointerCandidate={onComponentSecondaryPointerCandidate}
    />
  )}
/>;
```
