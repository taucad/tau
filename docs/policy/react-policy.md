---
title: 'React Policy'
description: 'Component composition, memoization, state management, and hook patterns for keeping React rendering efficient and predictable across Tau UI surfaces.'
status: active
created: '2026-03-19'
updated: '2026-11-12'
related:
  - docs/policy/ui-policy.md
  - docs/policy/rendering-policy.md
  - docs/policy/react-testing-policy.md
  - docs/research/chat-rendering-audit.md
  - docs/policy/xstate-policy.md
  - docs/research/graphics-event-driven-state-charter.md
---

# React Policy

Internal reference for React component authoring, memoization, state management, and hook patterns in `apps/ui`. Complements [UI Policy](ui-policy.md) (visual rules) and [Rendering Policy](rendering-policy.md) (DOM performance rules).

## Rationale

Tau's UI renders complex, data-driven views — chat streams, file editors, 3D viewports, and CAD tool results. React's reconciliation model makes it easy to introduce unnecessary re-renders that accumulate into visible jank. Without explicit rules, memoization becomes inconsistent, inline allocations defeat `memo()`, and state management patterns drift. This policy establishes the baseline for predictable, efficient React rendering.

## 1. Component Memoization

### 1.1 Wrap Components That Receive Stable Props in `memo()`

If a component receives props that are referentially stable across parent re-renders (strings, numbers, memoized objects), wrap it in `memo()`. This is mandatory for:

- Components rendered inside virtualized lists (Virtuoso `itemContent`)
- Components rendered in `.map()` iterations over stable arrays
- Components with expensive render trees (markdown viewers, code editors, 3D canvases)

**Why**: Without `memo()`, React re-renders the entire subtree on every parent update even when props haven't changed. For lightweight components the cost is negligible; for components with deep trees or expensive computations it causes measurable frame drops.

CORRECT:

```typescript
export const ChatMessageText = memo(function ({ part }: Props): React.JSX.Element {
  return <MarkdownViewerChat>{part.text}</MarkdownViewerChat>;
});
```

INCORRECT:

```typescript
export function ChatMessageText({ part }: Props): React.JSX.Element {
  return <MarkdownViewerChat>{part.text}</MarkdownViewerChat>;
}
```

### 1.2 Do Not Memo Everything

`memo()` has a cost: React must shallow-compare all props on every render. For leaf components with trivial render bodies (a single `<div>` or `<span>`), `memo()` adds overhead without benefit.

| Component type                                | Use `memo()` |
| --------------------------------------------- | ------------ |
| Virtuoso item renderers                       | Always       |
| Components with markdown/code viewers         | Always       |
| Components with derived state or `useMemo`    | Yes          |
| Components with only 1-2 DOM nodes            | No           |
| Components rendered conditionally (rare path) | No           |

## 2. Reference Stability

### 2.1 Never Pass Inline Objects, Arrays, or Functions to Memoized Children

Inline literals create new references on every render, defeating `memo()` on the receiving component. Hoist static values to module scope or wrap dynamic values in `useMemo`/`useCallback`.

**Why**: `memo()` uses `Object.is()` for comparison. A new `{}` on every render is always a different reference.

CORRECT:

```typescript
const staticControls = { code: false, table: false };

function Parent(): React.JSX.Element {
  return <MemoizedChild controls={staticControls} />;
}
```

INCORRECT:

```typescript
function Parent(): React.JSX.Element {
  return <MemoizedChild controls={{ code: false, table: false }} />;
}
```

### 2.2 Wrap Event Handlers in `useCallback`

Event handlers passed as props to memoized children or DOM elements inside memoized components must be wrapped in `useCallback`. Handlers that close over state setters (which are already stable) can use an empty dependency array.

CORRECT:

```typescript
const handleToggle = useCallback((): void => {
  setIsOpen((previous) => !previous);
}, []);
```

INCORRECT:

```typescript
const handleToggle = (): void => {
  setIsOpen((previous) => !previous);
};
```

### 2.3 Use `useMemo` for Derived Data

Computations that derive new data from props or state — sorting, filtering, mapping, transforming — must be wrapped in `useMemo` when the result is either:

- Passed as a prop to a memoized child, or
- Used in a dependency array of another hook

**Why**: Without `useMemo`, derived data is recomputed on every render and produces new references that cascade through the dependency graph.

CORRECT:

```typescript
const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.name.localeCompare(b.name)), [entries]);
```

INCORRECT:

```typescript
const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
```

## 3. State Management

### 3.1 Derive, Don't Duplicate

If a value can be computed from existing state or props, compute it. Do not store it in separate state. Duplicated state leads to synchronization bugs and unnecessary re-renders from extra `setState` calls.

**Why**: Two `useState` hooks that must stay in sync require coordinated updates. A `useMemo` derivation is always consistent.

CORRECT:

```typescript
const isCollapsed = rows.length > threshold || characterCount > charThreshold;
```

INCORRECT:

```typescript
const [isCollapsed, setIsCollapsed] = useState(false);

useEffect(() => {
  setIsCollapsed(rows.length > threshold || characterCount > charThreshold);
}, [rows, characterCount]);
```

### 3.2 Use Selector Functions for Store Subscriptions

When subscribing to external stores (XState, Zustand, custom stores), use selector functions that extract only the needed slice. Return primitive values or referentially stable objects when possible.

**Why**: A selector that returns a new object on every store update causes the subscribing component to re-render even when the relevant data hasn't changed.

CORRECT:

```typescript
const isStreaming = useChatSelector((state) => state.status === 'streaming');
```

INCORRECT:

```typescript
const { status, messages, drafts } = useChatSelector((state) => ({
  status: state.status,
  messages: state.messages,
  drafts: state.drafts,
}));
```

### 3.3 Colocate State With Its Consumer

State should live in the closest common ancestor of the components that read or write it. Do not lift state to a provider or context unless 3+ distant components need it.

**Why**: Lifting state too high causes unnecessary re-renders of intermediate components that don't use the state.

## 4. Component Composition

### 4.1 Extract Part Renderers From Switch Statements

When a component maps an array of typed parts to different renderers via a switch statement, extract each case into a named component. This enables per-part memoization and keeps the parent lean.

CORRECT:

```typescript
const ChatMessagePart = memo(function ({ part, index }: Props): React.JSX.Element | null {
  switch (part.type) {
    case 'text':
      return <ChatMessageText part={part} />;
    case 'reasoning':
      return <ChatMessageReasoning part={part} hasContent={hasPartsAfter} />;
    default:
      return null;
  }
});
```

### 4.2 Use `When` for Conditional Rendering

Use the `When` component for conditional rendering of subtrees that should not exist in the component tree when the condition is false. Do not use `&&` for complex subtrees (risk of rendering `0` or `""` for falsy non-boolean values).

CORRECT:

```typescript
<When shouldRender={isUser}>
  <ChatTextarea mode='edit' onSubmit={handleSubmit} />
</When>
```

INCORRECT:

```typescript
{count && <ExpensiveComponent />}
```

### 4.3 Prefer Composition Over Prop Drilling

When a component needs to pass data through 3+ levels, use composition (children/render props) or React context. Do not pass individual props through intermediate components that don't use them.

## 5. Hook Patterns

### 5.1 Stable Dependencies in `useEffect`

Effect dependencies must be referentially stable. If an effect depends on a function, that function must be wrapped in `useCallback`. If it depends on an object, that object must be wrapped in `useMemo`. Unstable dependencies cause the effect to re-run on every render.

### 5.2 Avoid Effects for Derived State

Do not use `useEffect` to synchronize state. If a value depends on props or other state, compute it inline or with `useMemo`. Effects for derived state introduce an extra render cycle and can cause flickering.

**Why**: `useEffect` runs after render. Setting state inside it causes a second render. `useMemo` computes during render, producing the correct value in a single pass.

### 5.3 Use `requestAnimationFrame` for DOM Measurements

Outside the graphics scope (5.5), when an effect needs to read or write DOM properties (scroll position, element dimensions), wrap the operation in `requestAnimationFrame`. This ensures the browser has completed layout before the measurement and avoids forcing synchronous layout.

CORRECT:

```typescript
useEffect(() => {
  requestAnimationFrame(() => {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  });
}, [content]);
```

INCORRECT:

```typescript
useEffect(() => {
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}, [content]);
```

### 5.4 Never Use a Dependency Array as a Change Signal

A dependency array controls when React re-runs a hook; it does not carry external-store state into the callback. Read every listed dependency in the callback. Carry an external change through React state or context, or subscribe with `useSyncExternalStore` or a store selector whose snapshot changes with the external value.

**Why**: Mutating an object outside React and listing one of its properties cannot schedule a render, while listing an unread value creates a misleading second source of change detection.

CORRECT:

```typescript
const revision = useSyncExternalStore(store.subscribe, store.getSnapshot);
const label = useMemo(() => describeRevision(revision), [revision]);
```

INCORRECT:

```typescript
const label = useMemo(() => describeRevision(store.current), [store.current.revisionId]);
```

This rule is checked by `apps/ui/app/dependency-signal.policy.node.test.ts` for supported React hook dependency expressions.

### 5.5 Graphics: Effects Never Send, Subscribe or Time

In the graphics scope, a React effect never sends an actor event, subscribes to an actor, store or emitter, or starts a timer (`setTimeout`, `setInterval`, `requestAnimationFrame`). A component never reads an actor snapshot during render or in an effect, apart from the recorded debts below. React renders from selectors and reports what the person did from event handlers. Everything that runs over time is an actor's: its `after` delays, its callback logic and its children (graphics event-driven state charter, D4 and I10).

The graphics scope is `packages/viewer`, `packages/camera` and `packages/three`, plus the `apps/ui` rows the charter inventory names: `workbench-records/`, `machines/project.machine.ts`, `view-settings-sync-host.tsx` and `workbench-layout-controller.ts`. The rest of the UI keeps the same rule as a ratchet (D17): each file's count may only go down until its own capability charter moves it.

**Why**: An effect runs after a commit that React may discard, repeat or reorder. An effect that sends or subscribes makes React's render schedule part of the actor's protocol, and the orbit snap-back (taucad/tau#1602) was two such effects racing. An actor owns its own timing and its own subscriptions, so the protocol can be tested and model-checked without React.

Three sanctioned shapes stand in for those effects:

- **Hand a host element to an actor with a ref callback.** The ref callback sends an attach event with the element, or an adapter built around it, and a detach event when React passes `null`. It owns no listener, timer or teardown: the actor (callback logic spawned by graphics) owns those. `sectionInputAttached` and `viewportGizmoAttached` are this pattern at its simplest. A renderer root that R3F hands over in `onCreated` goes the same way: the canvas sends `hostCreated` and `controlsAttached` from there. Its surface's ref callback sends them again when a Suspense boundary re-attaches the surface, reading the canvas phase through a `select*` reader and reporting a lost context as `contextLost`.
- **Read at the moment of an event through a narrow `select*` reader.** A handler, a frame loop or a ref callback that needs an actor's current value calls a module-level `select*` function that takes the actor and returns only what the event needs, such as `selectCameraViewDirection`. It never subscribes, and nothing keeps the value, except that a ref callback may carry what it read at detach to its next attach (the canvas surface's phase). The counter cannot tell a narrow reader from a broad one, so review checks it. Three React readers still return a whole context: `selectGraphicsContext` and `selectKinematicsContext` in `measure-tool.tsx`, and `selectPointerContext` in `gltf-mesh.tsx`. G12's second change narrows them.
- **Report what happened from the handler.** A click, a key or a pointer gesture is sent from its handler, never mirrored into state for an effect to send later.

Three reads during render predate this rule and are recorded debts, because the counter cannot see a read behind a module-level reader:

- `packages/viewer/src/graphics/three/three-context.tsx` decides once, in a `useState` initializer when the view mounts, whether the WebGL context budget admits its surface (`selectAdmitsViewerSurface`). The admission belongs to the WebGL context actor.
- `packages/viewer/src/hooks/use-graphics.tsx` sends the seeded entry's identity as `entryChanged` while the provider renders (`deliverSeedEntry`, charter G6b), where the framing record is latched.
- `packages/viewer/src/hooks/use-graphics.tsx` builds the view's presentation while the provider renders (`createViewPresentation`, in the `useState` initializer and again for a new graphics actor): it reads the view's camera child (`selectViewCamera`), and the Three camera rig it builds reads the camera's snapshot once.

Until G12's second change, the viewer's ceiling manifest also holds effects this rule forbids, which that change retires: `svg-viewer.tsx` and `use-panzoom-reset.tsx` (the panzoom reset and fit), and `kinematics-viewer.ts` and `kinematics-pose-composer.ts` (the mechanism load and clear, the pose subscription and the playback demand frame).

Effects and handlers that subscribe or time through a helper the counter cannot see are recorded debts too:

- `packages/viewer/src/graphics/three/react/gltf-mesh.tsx` subscribes to matcap loads, and starts a late section arm's analysis, which reports `gltfAnalysisReady`, from effects. G12's second change moves both into the presentation's host.
- `packages/viewer/src/graphics/three/react/measure-tool.tsx` subscribes to matcap loads from an effect.
- `packages/viewer/src/parameters/parameters-number.tsx` subscribes to the commit's drafts (`subscribeDrafts`) from an effect.
- `packages/viewer/src/graphics/three/render-fps-overlay.tsx` starts its render-loop observer's timers from an effect.
- `packages/viewer/src/hooks/use-viewer-shortcuts.ts` opens a subscription from a key handler (`watchShortcutWrite`) and keeps it until graphics shows the written value.
- In `apps/ui`, `view-settings-sync-host.tsx` registers a producer and `workbench-records/record-issues.ts` publishes into a module store from effects.

A boundary where React context or a prop is the only source of a value may send that value as one event from one effect. In a project held at zero it is a named exception, never a ceiling line. Each one names its boundary in a comment and is listed with its reason in its project's `react-event-layer.policy.node.test.ts`. `packages/viewer` is held at zero, with these exceptions, from G12's second change; until then its ceiling manifest lists them beside the debts above:

| File                                                | Boundary                                                                                                    | Ruling                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/viewer/src/model-viewer.tsx`              | The standalone viewer's artifact prop sent as `updateArtifact` or `clearArtifact`                           | Inventory C10, 2026-11-12          |
| `packages/viewer/src/hooks/use-graphics.tsx`        | The viewer environment's theme, accent and contrast, from React context, sent as `viewerEnvironmentChanged` | G8, 2026-11-12                     |
| `packages/viewer/src/parameters/use-field-edits.ts` | A parameter field's authority prop sent as `observed`                                                       | Programme control, G12, 2026-11-12 |

CORRECT (simplified from `section-handles.tsx`):

```typescript
const attachInput = useCallback<RefCallback<THREE.Group>>(
  (group) => {
    graphics.send(
      group
        ? { type: 'sectionInputAttached', inputId, adapter: createSectionInputAdapter({ group, graphics }) }
        : { type: 'sectionInputDetached', inputId },
    );
  },
  [graphics, inputId],
);
```

INCORRECT:

```typescript
useEffect(() => {
  const subscription = graphicsRef.on('viewFitRequested', resetPanzoom);
  return () => subscription.unsubscribe();
}, [graphicsRef]);
```

This rule is checked by the `react-event-layer.policy.node.test.ts` in each project, through `@taucad/oxlint/react-event-layer`. The counter is lexical: it counts an effect whose callback calls `.send`, `.subscribe`, `.on`, `send`, `subscribe` or a timer, and a `getSnapshot()` call written inside a component or hook. A call hidden behind a helper declared elsewhere, of any name, is not seen, so a reviewer checks for one.

## 6. Keys

### 6.1 Use Stable, Unique Identifiers as Keys

Keys in `.map()` iterations must be stable, unique identifiers — IDs from the data model, not array indices. Index keys are acceptable only when the list is static (no reordering, insertion, or deletion).

**Why**: Index keys cause React to reuse DOM nodes incorrectly when items are reordered, leading to stale state in child components.

### 6.2 Never Use Composite Index Keys

Do not construct keys from a combination of the item and its index (`${item.id}-${index}`). If the ID alone is not unique, the data model has a bug — fix the data, not the key.

## Anti-Patterns

- `memo()` on every component regardless of cost (adds comparison overhead without benefit)
- Inline arrow functions as props to memoized children (`onClick={() => ...}`)
- Inline object literals as props (`style={{}}`, `controls={{}}`) to memoized children
- `useEffect` to derive state from props (`useEffect(() => setState(compute(props)), [props])`)
- Treating a hook dependency array as notification that an external mutable value changed
- Listing a hook dependency that the callback never reads
- Destructuring store selectors into multiple fields (creates a new object reference)
- `useMemo` or `useCallback` with no dependencies (`[]`) on values that never change — hoist to module scope instead
- Passing `children` through `memo()` boundaries without verifying children stability
- In the graphics scope, an effect that sends, subscribes or starts a timer, or a render-time `getSnapshot()` read
- Hiding a send or subscription in a helper so the lexical counter cannot see it

## Summary Checklist

- [ ] Components in virtualized lists and `.map()` iterations are wrapped in `memo()`
- [ ] No inline objects, arrays, or functions passed to memoized children
- [ ] Event handlers use `useCallback` when passed as props
- [ ] Derived data uses `useMemo`, not `useEffect` + `useState`
- [ ] Store selectors return primitive values or stable references
- [ ] Keys are stable unique identifiers, not array indices
- [ ] DOM measurements in effects use `requestAnimationFrame`
- [ ] External-store changes arrive through state, context, `useSyncExternalStore`, or a selector snapshot
- [ ] Every listed hook dependency is read by its callback
- [ ] State is colocated with its closest consumer
- [ ] In the graphics scope, no effect sends, subscribes or times; host elements reach actors by ref callback; reads at an event go through a `select*` reader

## References

- [UI Policy](ui-policy.md) — Visual design rules, component composition with `cn()`/`cva`
- [Rendering Policy](rendering-policy.md) — Virtualization thresholds, content budgets, scroll management
- [React Testing Policy](react-testing-policy.md) — Testing hooks and components
- Enforcement: `apps/ui/app/dependency-signal.policy.node.test.ts` — P66 hook dependency AST check
- Enforcement: `*/react-event-layer.policy.node.test.ts` with `@taucad/oxlint/react-event-layer` — the graphics zero and the UI ratchet (5.5)
- Research: `docs/research/graphics-event-driven-state-charter.md` — D4, D17 and I10
- Research: `docs/research/chat-rendering-audit.md` — Audit findings that informed these rules
