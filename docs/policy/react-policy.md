---
title: 'React Policy'
description: 'Component composition, memoization, state management, and hook patterns for keeping React rendering efficient and predictable across Tau UI surfaces.'
status: active
created: '2026-03-19'
updated: '2026-09-14'
related:
  - docs/policy/ui-policy.md
  - docs/policy/rendering-policy.md
  - docs/policy/react-testing-policy.md
  - docs/research/chat-rendering-audit.md
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

When an effect needs to read or write DOM properties (scroll position, element dimensions), wrap the operation in `requestAnimationFrame`. This ensures the browser has completed layout before the measurement and avoids forcing synchronous layout.

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

## References

- [UI Policy](ui-policy.md) — Visual design rules, component composition with `cn()`/`cva`
- [Rendering Policy](rendering-policy.md) — Virtualization thresholds, content budgets, scroll management
- [React Testing Policy](react-testing-policy.md) — Testing hooks and components
- Enforcement: `apps/ui/app/dependency-signal.policy.node.test.ts` — P66 hook dependency AST check
- Research: `docs/research/chat-rendering-audit.md` — Audit findings that informed these rules
