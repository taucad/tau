import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TelemetryEntry } from '@taucad/runtime';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GeometryUnitTiming } from '#routes/w.$workspace.$project/chat-kernel-timing.js';

vi.mock('react-virtuoso', () => ({
  Virtuoso: forwardRef(
    (
      {
        totalCount,
        itemContent,
        components,
        ...properties
      }: {
        totalCount: number;
        itemContent: (index: number) => React.ReactNode;
        components?: { Header?: React.ComponentType; Footer?: React.ComponentType };
      } & React.HTMLAttributes<HTMLDivElement>,
      reference,
    ) => {
      useImperativeHandle(reference, () => ({ scrollToIndex: vi.fn() }));
      const Header = components?.Header;
      const Footer = components?.Footer;
      return (
        <div {...properties}>
          {Header ? <Header /> : undefined}
          {Array.from({ length: totalCount }, (_, index) => (
            <div key={index}>{itemContent(index)}</div>
          ))}
          {Footer ? <Footer /> : undefined}
        </div>
      );
    },
  ),
}));

vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({
    children,
    groupedItems,
    getValue,
    onSelect,
  }: {
    children: React.ReactNode;
    groupedItems: Array<{ items: Array<{ id: string; label: string }> }>;
    getValue: (item: { id: string }) => string;
    onSelect: (value: string) => void;
  }) => (
    <div>
      {children}
      <select
        aria-label='Trace history'
        onChange={(event) => {
          onSelect(event.target.value);
        }}
      >
        {groupedItems[0]!.items.map((item) => (
          <option key={getValue(item)} value={getValue(item)}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  ),
}));

function entry(overrides: Partial<TelemetryEntry> & { name: string }): TelemetryEntry {
  return {
    name: overrides.name,
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 0,
    workerTimeOrigin: overrides.workerTimeOrigin ?? 1000,
    detail: overrides.detail,
  };
}

const telemetryEntries = [
  entry({ name: 'kernel.render', startTime: 0, duration: 100, detail: { spanId: 'render-1' } }),
  entry({
    name: 'old.operation',
    startTime: 10,
    duration: 60,
    detail: { spanId: 'old', parentSpanId: 'render-1' },
  }),
  entry({ name: 'kernel.render', startTime: 200, duration: 40, detail: { spanId: 'render-2' } }),
  entry({
    name: 'new.operation',
    startTime: 205,
    duration: 20,
    detail: {
      spanId: 'new',
      parentSpanId: 'render-2',
      phase: 'computingGeometry',
      fileName: 'main.scad',
      devtools: { hidden: true },
    },
  }),
];

function actor(renderPhase?: string): ActorRefFrom<typeof cadMachine> {
  const snapshot = { context: { renderPhase, telemetryEntries } };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: vi.fn() }),
  } as unknown as ActorRefFrom<typeof cadMachine>;
}

function renderTiming(properties: { readonly cadRef: ActorRefFrom<typeof cadMachine>; readonly query: string }) {
  return render(
    <TooltipProvider>
      <GeometryUnitTiming {...properties} />
    </TooltipProvider>,
  );
}

function getTotalMetric(): Element | undefined {
  return screen.getAllByText('Total').find((element) => element.tagName === 'DT')?.nextElementSibling ?? undefined;
}

describe('GeometryUnitTiming', () => {
  it('defaults every projection to the latest completed trace and keeps live status independent', () => {
    renderTiming({ cadRef: actor('bundling'), query: '' });

    expect(screen.getByRole('status')).toHaveTextContent('Bundling…');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(getTotalMetric()).toHaveTextContent('40ms');
    expect(screen.getByRole('treeitem', { name: /new\.operation/u })).toBeInTheDocument();
    expect(screen.queryByText('old.operation')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Render pipeline' })).toBeInTheDocument();
  });

  it('can inspect a historical trace without mixing its spans or metrics', () => {
    renderTiming({ cadRef: actor(), query: '' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Trace history' }), { target: { value: 'render-1' } });

    expect(getTotalMetric()).toHaveTextContent('100ms');
    expect(screen.getByRole('treeitem', { name: /old\.operation/u })).toBeInTheDocument();
    expect(screen.queryByText('new.operation')).not.toBeInTheDocument();
  });

  it('shows no matches for the global query while retaining overview metrics', () => {
    renderTiming({ cadRef: actor(), query: 'not-present' });
    expect(screen.getByText('No matching telemetry')).toBeInTheDocument();
    expect(getTotalMetric()).toHaveTextContent('40ms');
  });

  it('provides Trace and Timeline modes plus complete selected-span details', () => {
    renderTiming({ cadRef: actor(), query: 'main.scad' });
    const traceRow = screen.getByRole('treeitem', { name: /new\.operation/u });
    expect(traceRow).not.toHaveClass('my-0.5');
    expect(traceRow).toHaveClass('py-0');
    expect(traceRow.firstElementChild).toHaveClass('self-stretch');
    expect(traceRow).toHaveAttribute('data-state', 'closed');
    const spanCollapsible = traceRow.closest('[data-slot="collapsible"]');
    expect(spanCollapsible).not.toHaveClass('border-transparent');
    fireEvent.click(traceRow);

    expect(traceRow).toHaveAttribute('data-state', 'open');
    expect(traceRow).not.toHaveClass('ring-primary/30');
    expect(spanCollapsible).toHaveClass('data-[state=open]:border-border');
    const details = screen.getByText('Span details');
    expect(details.closest('[data-slot="collapsible-content"]')).toHaveClass(
      'data-[state=closed]:animate-collapsible-up',
      'data-[state=open]:animate-collapsible-down',
      'motion-reduce:animate-none',
    );
    expect(screen.getByText('fileName')).toBeInTheDocument();
    expect(screen.getByText('main.scad')).toBeInTheDocument();
    expect(screen.queryByText('devtools')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy span details' })).toBeInTheDocument();

    fireEvent.click(traceRow);
    expect(screen.queryByText('Span details')).not.toBeInTheDocument();
    fireEvent.click(traceRow);

    fireEvent.click(screen.getByRole('radio', { name: 'Timeline' }));
    expect(screen.getByRole('tree', { name: 'Telemetry trace timeline' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /new\.operation/u })).not.toHaveClass('my-0.5');

    const toolbar = screen.getByRole('button', { name: 'Filter spans' }).closest('.border-border');
    expect(toolbar).toHaveClass('border-b');
    expect(toolbar).not.toHaveClass('border-y');
  });

  it('exposes tree metadata and keyboard focus while preserving collapse through filtering', async () => {
    const cadRef = actor();
    const view = renderTiming({ cadRef, query: '' });
    const root = screen.getByRole('treeitem', { name: /kernel\.render/u });
    expect(root).toHaveAttribute('aria-level', '1');
    expect(root).toHaveAttribute('aria-posinset', '1');
    expect(root).toHaveAttribute('aria-expanded', 'true');

    root.focus();
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: /new\.operation/u })).toHaveFocus();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse children for kernel.render' }));
    expect(screen.queryByRole('treeitem', { name: /new\.operation/u })).not.toBeInTheDocument();
    view.rerender(
      <TooltipProvider>
        <GeometryUnitTiming cadRef={cadRef} query='main.scad' />
      </TooltipProvider>,
    );
    expect(screen.getByRole('treeitem', { name: /new\.operation/u })).toBeInTheDocument();

    view.rerender(
      <TooltipProvider>
        <GeometryUnitTiming cadRef={cadRef} query='' />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('treeitem', { name: /new\.operation/u })).not.toBeInTheDocument();
  });
});
