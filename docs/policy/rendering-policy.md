---
title: 'Rendering Policy'
description: 'Rules for keeping the DOM lightweight, UI smooth, and streaming content responsive through virtualization, content budgets, and scroll management.'
status: active
created: '2026-03-19'
updated: '2026-11-19'
related:
  - docs/policy/ui-policy.md
  - docs/policy/react-policy.md
  - docs/research/chat-rendering-audit.md
---

# Rendering Policy

Internal reference for DOM rendering performance across all Tau UI surfaces. Governs virtualization, content budgets, scroll behavior, and streaming optimizations that keep the interface responsive regardless of data volume.

## Rationale

Tau's chat interface, file explorer, and CAD editor display open-ended content — reasoning streams, tool results, directory trees, and log output can grow to thousands of items. Without explicit rendering constraints, these surfaces accumulate DOM nodes until layout, paint, and GC pauses cause visible jank. This policy codifies the thresholds and techniques that prevent unbounded rendering.

## 1. Virtualization

### 1.1 Use `react-virtuoso` for Lists Exceeding 20 Items

Any list that can exceed 20 items at runtime must be virtualized using `react-virtuoso`. This includes chat message lists, file trees, search results, log views, and combobox options.

**Why**: 20 items is the threshold where DOM node count begins to impact layout recalculation time on mid-range devices.

CORRECT:

```typescript
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  totalCount={items.length}
  itemContent={renderItem}
  components={{
    List: (props) => <div {...props} className='flex flex-col gap-1' />,
    Header: () => <div className='h-0.5' />,
    Footer: () => <div className='h-0.5' />,
  }}
/>
```

INCORRECT:

```typescript
{items.map((item) => (
  <ListItem key={item.id} item={item} />
))}
```

### 1.2 Memoize Virtuoso Item Renderers

The `itemContent` callback and any component passed to `components` must have a stable reference across renders. Use `useCallback` for `itemContent` and hoist `components` to module scope or `useMemo`.

**Why**: Virtuoso uses referential equality on `itemContent` and `components` to avoid re-mounting items. Unstable references cause the entire visible window to re-render on every parent update.

CORRECT:

```typescript
const renderItem = useCallback(
  (index: number) => <Item key={items[index].id} data={items[index]} />,
  [items],
);

<Virtuoso totalCount={items.length} itemContent={renderItem} />
```

INCORRECT:

```typescript
<Virtuoso
  totalCount={items.length}
  itemContent={(index) => <Item data={items[index]} />}
  components={{
    Header: () => null,
    Footer: () => <div className='h-2' />,
  }}
/>
```

### 1.3 Follow the `combobox-responsive.tsx` Reference Pattern

Virtuoso configuration must follow the patterns established in `apps/ui/app/components/ui/combobox-responsive.tsx`:

- Flatten grouped data (including section headers) into a single array for virtualization
- Use `components.List` for horizontal padding (`px-1`)
- Use `Header`/`Footer` components for vertical spacing (Virtuoso's absolute positioning doesn't handle container padding)
- Compute height dynamically based on item count with a sensible maximum

### 1.4 Clamp List Heights When Virtuoso is Overkill

For lists between 5-20 items, use CSS `max-h-*` with `overflow-y-auto` instead of Virtuoso. This avoids Virtuoso's ResizeObserver overhead while preventing DOM growth from pushing layout.

**Why**: Virtuoso has non-trivial setup cost (scroll listeners, ResizeObserver, item measurement). For small lists, CSS overflow is cheaper.

| Items | Strategy                          |
| ----- | --------------------------------- |
| ≤5    | Render all, no constraints        |
| 6–20  | CSS `max-h-*` + `overflow-y-auto` |
| >20   | `react-virtuoso`                  |

**Exception, single-scroll panes**: a list inside a pane whose single scroller is the pane's own (the Share pane) may render in flow, without `max-h-*`, `overflow-y-auto` or Virtuoso, when it shows at most five rows until the person asks for all of them and a product limit caps it at 50 rows or fewer. A nested scroller there takes height from the one region that scrolls, which a phone sheet with the keyboard open cannot spare.

## 2. Content Budgets

### 2.1 Tail-Truncate Preview Content

When displaying a preview of unbounded text (reasoning blocks, log output, file contents), render only the tail portion of the content. The budget should provide enough text to fill the visible viewport plus a small buffer.

**Why**: Rendering the full content builds an oversized DOM tree even when only the tail is visible. Tail-truncation keeps DOM size proportional to the visible viewport.

CORRECT:

```typescript
const previewTextBudget = 3000;

const displayText = useMemo(() => {
  if (isExpanded || text.length <= previewTextBudget) {
    return text;
  }
  const tail = text.slice(-previewTextBudget);
  const breakpoint = tail.indexOf('\n\n');
  return breakpoint > 0 ? tail.slice(breakpoint + 2) : tail;
}, [text, isExpanded]);
```

INCORRECT:

```typescript
<MarkdownViewer>{fullText}</MarkdownViewer>
```

### 2.2 Truncate at Semantic Boundaries

When truncating content, cut at paragraph boundaries (`\n\n`), not mid-line. This preserves markdown structure and prevents rendering artifacts like broken code blocks or partial list items.

**Why**: Mid-content truncation can orphan markdown syntax tokens (unclosed fences, partial lists), causing the parser to produce invalid output.

### 2.3 Use Progressive Disclosure for Expandable Content

Content that exceeds its preview budget must provide an explicit expand/collapse toggle. The collapsed state shows constrained content (height-limited with `max-h-*`); the expanded state removes the constraint.

| State                  | Behavior                                                    |
| ---------------------- | ----------------------------------------------------------- |
| Preview (default)      | Height-constrained, tail-truncated, auto-scrolled to bottom |
| Expanded (user toggle) | Full height, full content, no auto-scroll                   |

## 3. Scroll Management

### 3.1 Auto-Scroll During Streaming

When content is actively streaming and the user has not scrolled away, auto-scroll the container to keep the latest content visible. Use `requestAnimationFrame` for scroll operations to avoid forcing layout during the render phase.

**Why**: Streaming content (reasoning, logs) grows from the bottom. Without auto-scroll, users must manually chase the latest output.

CORRECT:

```typescript
useEffect(() => {
  if (!isStreaming || isExpanded) return;
  const container = scrollContainerRef.current;
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  });
}, [displayText, isStreaming, isExpanded]);
```

### 3.2 Use `followOutput` for Virtuoso Auto-Scroll

When using Virtuoso for streaming content, set `followOutput='smooth'` instead of manual scroll management. Virtuoso's built-in follow mechanism handles edge cases (user scroll interruption, resize, item measurement changes).

### 3.3 Provide Scroll-to-Bottom Affordance

Any scrollable container with auto-scroll must include a visible "scroll to bottom" button when the user scrolls away from the bottom. The button must use `scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })` for Virtuoso or `scrollTo({ top: scrollHeight, behavior: 'smooth' })` for native scroll containers.

## 4. Streaming Rendering

### 4.1 Use Streaming-Optimized Markdown Parsers

For content that arrives incrementally (AI responses, reasoning), use streaming-mode markdown rendering (e.g., `Streamdown` with `isStreaming={true}`). Streaming parsers handle partial syntax gracefully without producing broken output.

### 4.2 Avoid Re-Parsing Stable Content

When streaming appends to existing content, ensure the markdown parser processes only the delta, not the full accumulated text. If the parser does not support incremental parsing, memoize the rendered output of stable prefix content and only re-parse the active tail.

## 5. Height Animations

### 5.1 Prefer `transform` and `opacity` for Transitions

Per [UI Policy](ui-policy.md) §6, only animate `transform` and `opacity`. Never animate `height`, `max-height`, `width`, or `margin` — these trigger layout recalculation on every frame.

**Why**: Layout-triggering animations cause jank on slower devices and block the main thread during scroll.

### 5.2 Use Collapsible Components for Open/Close

For content that toggles between visible and hidden, use Radix `Collapsible` (via `ChatToolCard`) which manages its own height animation. For content that toggles between height-constrained and unconstrained (preview/expand), avoid animating the transition — toggle the `max-h-*` class immediately.

## Anti-Patterns

- Rendering unbounded lists without virtualization or height clamping
- Passing the full content string to a markdown renderer when only a preview is visible
- Inline `components` or `itemContent` props on Virtuoso (breaks referential equality)
- Manual `scrollTo` inside `useEffect` without `requestAnimationFrame` (forces layout during render)
- Using `@tanstack/react-virtual` instead of `react-virtuoso` (project convention)
- Animating `height` or `max-height` for expand/collapse transitions
- Using `window.scrollTo` instead of container-scoped `scrollTo` in nested scroll contexts

## Summary Checklist

- [ ] Lists exceeding 20 items use `react-virtuoso`
- [ ] Lists of 6-20 items use CSS `max-h-*` + `overflow-y-auto`
- [ ] Preview content is tail-truncated with a text budget
- [ ] Truncation occurs at semantic boundaries (paragraph breaks)
- [ ] Streaming containers auto-scroll to bottom via `requestAnimationFrame`
- [ ] Virtuoso `itemContent` and `components` have stable references
- [ ] Expand/collapse toggles are provided for budgeted content
- [ ] No `height`/`max-height` animations

## References

- [UI Policy](ui-policy.md) — Motion rules, animation constraints
- [React Policy](react-policy.md) — Memoization, state management, component composition
- Research: `docs/research/chat-rendering-audit.md` — Audit that motivated this policy
