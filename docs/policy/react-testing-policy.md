---
title: 'React Testing Policy'
description: 'Patterns for testing React hooks and components in apps/ui: renderHook, harness components, fake timers, mocks, cleanup.'
status: active
created: '2026-03-09'
updated: '2026-09-05'
related:
  - docs/policy/testing-policy.md
---

# React Testing Policy

Patterns for testing React hooks and components in the Tau UI app (`apps/ui`).
Extends the general [Testing Policy](testing-policy.md) — all rules there still apply.

## Rationale

Hooks encapsulate stateful logic that is difficult to test via component rendering alone. The renderHook and harness patterns provide deterministic, isolated test environments. Fake timers and explicit cleanup verification prevent flaky tests and resource leaks. Consistent structure and naming make hook tests easy to maintain and review.

## Environment

- **Runner**: Vitest with `jsdom` environment (configured in `apps/ui/vite.config.ts`)
- **Library**: `@testing-library/react` — use `renderHook`, `act`, `render`, `screen`
- **Globals**: `globals: true` is enabled; `describe`, `it`, `expect`, `vi` are available via `import { … } from 'vitest'`
- **Setup**: `vitest.setup.ts` provides `@testing-library/jest-dom` matchers and mocks for `matchMedia`, `ResizeObserver`, `IntersectionObserver`

## 1. Hook Testing Strategy

### Choosing an approach

| Approach          | When to use                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `renderHook`      | Hook returns values or callbacks; no DOM interaction needed         |
| Harness component | Hook relies on DOM refs, layout measurements, or renders visible UI |

### `renderHook` pattern

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMyHook } from '#hooks/use-my-hook.js';

describe('useMyHook', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(false);
  });

  it('should update state when triggered', () => {
    const { result } = renderHook(() => useMyHook());

    act(() => {
      result.current.trigger();
    });

    expect(result.current.value).toBe(true);
  });
});
```

### Harness component pattern

When the hook needs DOM context, render a small component that exposes hook output via `data-testid`:

```typescript
function Harness(props: HarnessProps): React.JSX.Element {
  const result = useMyHook(props);
  return <div data-testid="output">{JSON.stringify(result)}</div>;
}

it('should reflect prop changes', () => {
  render(<Harness value={42} />);
  expect(screen.getByTestId('output')).toHaveTextContent('42');
});
```

## 2. Fake Timers with Hooks

Hooks using `setTimeout`, `setInterval`, or `useEffect` with delays require fake timers.
Always restore real timers in a `finally` block.

```typescript
it('should auto-reset after the timeout', () => {
  vi.useFakeTimers();
  try {
    const { result } = renderHook(() => useMyHook());

    act(() => {
      result.current.trigger();
    });
    expect(result.current.active).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.active).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
```

## 3. Return Value Stability

Verify that callbacks returned by hooks are referentially stable across rerenders
(i.e. wrapped in `useCallback`). Unstable references cause unnecessary child rerenders.

```typescript
it('should return a stable callback across rerenders', () => {
  const { result, rerender } = renderHook(() => useMyHook());
  const first = result.current.callback;

  rerender();

  expect(result.current.callback).toBe(first);
});
```

## 4. Mocking Hooks and Modules

Use `vi.mock()` at module level for dependency hooks. Expose the mock fn so tests can configure and assert against it.

```typescript
const mockSend = vi.fn();

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mockSend }),
}));

beforeEach(() => {
  mockSend.mockClear();
});
```

For complex dependencies, extract a `createMock*` factory (see Testing Policy § 5).

Keep real Radix collapsible and portal behavior when diagnosing an initial-state failure. Inspect the rendered state and correct the owning state/lifecycle contract; do not mock away that behavior to make a failing assertion pass.

## 5. Testing `useEffect` Cleanup

Assert that effects clean up correctly — timers are cleared, subscriptions are removed, and no state updates occur after unmount.

```typescript
it('should clear the pending timer on unmount', () => {
  vi.useFakeTimers();
  try {
    const { result, unmount } = renderHook(() => useMyHook());

    act(() => {
      result.current.trigger();
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // No "setState on unmounted component" warning
  } finally {
    vi.useRealTimers();
  }
});
```

## 6. Test Structure

Follow these conventions (consistent with the general Testing Policy):

| Convention        | Pattern                                                |
| ----------------- | ------------------------------------------------------ |
| File name         | `use-<name>.test.ts` co-located next to the hook       |
| Top `describe`    | Hook name: `describe('useTickAnimation', …)`           |
| Nested `describe` | Behavior groups: `initial state`, `trigger`, `cleanup` |
| Test name         | `it('should <verb> <outcome> [when <condition>]')`     |
| Section comments  | `// ── Section ─…` separators for groups               |

## Summary Checklist

Before merging a hook test:

- [ ] Uses `renderHook` or harness component (not manual `React.createElement`)
- [ ] State mutations wrapped in `act()`
- [ ] Fake timers restored in `finally`
- [ ] Return value stability verified for `useCallback`/`useMemo` outputs
- [ ] Cleanup/unmount behavior tested for effect-based hooks
- [ ] Mocks cleared in `beforeEach`
- [ ] Follows `should <verb> <outcome>` naming
